import Joi from 'joi';

import { Staff } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { generateRandomPassword } from '../../utils/password.js';
import emailService from '../../services/email.service.js';
import { ERROR_CODES, STAFF_ROLES, STAFF_ROLE_NAMES } from '../../config/index.js';
import { readPagination } from '../../utils/pagination.js';
import { fireAndForget } from '../../utils/fireAndForget.js';

/** Admin-only staff management. */

const createSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  email: Joi.string().email().required(),
  role: Joi.number()
    .valid(STAFF_ROLES.MANAGER, STAFF_ROLES.AUDITOR, STAFF_ROLES.SUPPORT)
    .required(),
});

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);
  const exists = await Staff.exists(value.email);
  if (exists) return fail(res, req.$t('staff_already_exists'), ERROR_CODES.CONFLICT);

  const plain = generateRandomPassword(8);

  console.log(`Creating staff account for ${value.email} with password ${plain}`);
  const staff = await Staff.createWithPassword({
    name: value.name,
    email: value.email,
    role: value.role,
    plainPassword: plain,
  });
  // Fire-and-forget: respond immediately, email lands in the background.
  fireAndForget(
    emailService.sendStaffCredentials({
      to: value.email,
      name: value.name,
      role: STAFF_ROLE_NAMES[value.role],
      password: plain,
    }),
    'email:staff-credentials'
  );
  return ok(res, { staff: staff.toSafeJSON(), message: req.$t('staff_created') });
});

const list = asyncHandler(async (req, res) => {
  const { q, role } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (role) filter.role = Number(role);
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { staffId: { $regex: q, $options: 'i' } },
    ];
  }
  const result = await Staff.paginate(filter, { page, limit, sort: '-createdAt' });
  result.docs = result.docs.map((s) => s.toSafeJSON());
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { staff: staff.toSafeJSON() });
});

// `isActive` is intentionally NOT in the update schema — toggling account
// state goes through the dedicated /disable and /enable endpoints below so
// the role-hierarchy guard is always applied.
const updateSchema = Joi.object({
  name: Joi.string().min(1).max(120),
  role: Joi.number().valid(STAFF_ROLES.MANAGER, STAFF_ROLES.AUDITOR, STAFF_ROLES.SUPPORT),
}).min(1);

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  if (staff.role === STAFF_ROLES.ADMIN) {
    return fail(res, req.$t('only_admin_can_manage_staff'), ERROR_CODES.FORBIDDEN);
  }
  Object.assign(staff, value);
  await staff.save();
  return ok(res, { staff: staff.toSafeJSON() });
});

/**
 * Enforce the role-hierarchy rule for enable/disable:
 *
 *   - You cannot act on yourself.
 *   - Admin accounts (role 1000) cannot be disabled.
 *   - Otherwise the acting staff's role must be STRICTLY GREATER than the
 *     target's role. Admin (1000) always wins because no other role can
 *     exceed it.
 *
 * Returns `null` if allowed, or a failure-response helper otherwise.
 */
function guardHierarchy({ req, res, target }) {
  if (target._id.equals(req.staff._id)) {
    return fail(res, req.$t('cannot_disable_self'), ERROR_CODES.FORBIDDEN);
  }
  if (target.role === STAFF_ROLES.ADMIN) {
    return fail(res, req.$t('cannot_disable_admin'), ERROR_CODES.FORBIDDEN);
  }
  if (req.staff.role <= target.role) {
    return fail(res, req.$t('cannot_disable_higher_role'), ERROR_CODES.FORBIDDEN);
  }
  return null;
}

const disable = asyncHandler(async (req, res) => {
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  const blocked = guardHierarchy({ req, res, target: staff });
  if (blocked) return blocked;
  if (staff.isActive === false) {
    return ok(res, { staff: staff.toSafeJSON(), message: req.$t('staff_disabled') });
  }
  staff.isActive = false;
  await staff.save();
  return ok(res, { staff: staff.toSafeJSON(), message: req.$t('staff_disabled') });
});

const enable = asyncHandler(async (req, res) => {
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  // Re-enabling uses the same hierarchy rules: a manager can only re-enable
  // a support/auditor; only admin can re-enable a manager.
  const blocked = guardHierarchy({ req, res, target: staff });
  if (blocked) return blocked;
  if (staff.isActive === true) {
    return ok(res, { staff: staff.toSafeJSON(), message: req.$t('staff_enabled') });
  }
  staff.isActive = true;
  await staff.save();
  return ok(res, { staff: staff.toSafeJSON(), message: req.$t('staff_enabled') });
});

// Admin-triggered password regeneration for a staff member. Generates a new
// random password, forces the staff to change it on next login (hsCp -> false)
// and emails the credentials — same flow used when the staff account was first
// created. Admin accounts cannot be regenerated this way.
const regeneratePassword = asyncHandler(async (req, res) => {
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  if (staff.role === STAFF_ROLES.ADMIN) {
    return fail(res, req.$t('cannot_regenerate_admin_password'), ERROR_CODES.FORBIDDEN);
  }

  const plain = generateRandomPassword(8);
  await staff.resetPassword(plain);

  fireAndForget(
    emailService.sendStaffCredentials({
      to: staff.email,
      name: staff.name,
      role: STAFF_ROLE_NAMES[staff.role],
      password: plain,
    }),
    'email:staff-password-reset'
  );

  return ok(res, {
    staff: staff.toSafeJSON(),
    message: req.$t('password_regenerated'),
  });
});

export default { create, list, getOne, update, disable, enable, regeneratePassword };
