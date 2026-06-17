import Joi from 'joi';

import { User, Class } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { generateRandomPassword } from '../../utils/password.js';
import emailService from '../../services/email.service.js';
import smsService from '../../services/sms.service.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES } from '../../config/index.js';

const createSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  phone: Joi.string().min(6).max(30).required(),
  email: Joi.string().email().allow(null, ''),
  classId: Joi.string().allow(null, ''), // friendly id of the class to assign
});

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);

  const exists = await User.existsByEmailOrPhone({ email: value.email, phone: value.phone });
  if (exists) return fail(res, req.$t('user_already_exists'), ERROR_CODES.CONFLICT);

  let classDoc = null;
  if (value.classId) {
    classDoc = await Class.findByFriendlyId(value.classId);
    if (!classDoc) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  }

  const plainPassword = generateRandomPassword(8);
  // console.log(`Generated password: ${plainPassword}`); /**To be removed in production and when email/SMS services are implemented */
  const user = await User.createWithPassword({
    name: value.name,
    email: value.email || undefined,
    phone: value.phone,
    plainPassword,
    classId: classDoc ? classDoc._id : undefined,
    createdByStaffId: req.staff._id,
  });

  // Credentials are always SMS'd to the phone (now required). If an email is
  // also on file, send a copy there as well — handy for record-keeping.
  await smsService.sendUserCredentials({ to: value.phone, name: value.name, password: plainPassword });
  if (value.email) {
    await emailService.sendUserCredentials({
      to: value.email,
      name: value.name,
      password: plainPassword,
      kind: 'email',
    });
  }

  return ok(res, {
    user: user.toSafeJSON(),
    message: req.$t('user_created'),
  });
});

const list = asyncHandler(async (req, res) => {
  const { q, classId } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { userId: { $regex: q, $options: 'i' } },
    ];
  }
  if (classId) {
    const cls = await Class.findByFriendlyId(classId);
    if (cls) filter.classId = cls._id;
  }
  const result = await User.paginate(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: { path: 'classId', select: 'classId title' },
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId }).populate('classId');
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { user });
});

/**
 * Bulk-create users. Each row is processed independently so a single bad
 * record doesn't fail the entire batch. The response surfaces three lists
 * keyed by the original row index so the staff UI can highlight per-row
 * outcomes:
 *
 *   created  — successfully created users (creds delivered)
 *   skipped  — duplicates (only populated when options.skipDuplicates=true)
 *   failed   — validation / lookup / DB errors
 *
 * options.skipDuplicates (default true): when a phone or email already maps
 * to a user, skip silently. When false, the duplicate is reported under
 * `failed` with a CONFLICT error.
 */
const bulkCreateRowSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  phone: Joi.string().min(6).max(30).required(),
  email: Joi.string().email().allow(null, ''),
  classId: Joi.string().allow(null, ''),
});

const bulkCreateSchema = Joi.object({
  options: Joi.object({
    skipDuplicates: Joi.boolean().default(true),
  }).default({ skipDuplicates: true }),
  users: Joi.array().items(Joi.any()).min(1).max(500).required(),
});

const bulkCreate = asyncHandler(async (req, res) => {
  const value = await bulkCreateSchema.validateAsync(req.body);
  const skipDuplicates = value.options.skipDuplicates;

  // Cache class lookups so we don't re-query the same friendly id N times
  const classCache = new Map();
  async function resolveClass(classFriendlyId) {
    if (!classFriendlyId) return null;
    if (classCache.has(classFriendlyId)) return classCache.get(classFriendlyId);
    const c = await Class.findByFriendlyId(classFriendlyId);
    classCache.set(classFriendlyId, c || null);
    return c || null;
  }

  const created = [];
  const skipped = [];
  const failed = [];

  for (let index = 0; index < value.users.length; index += 1) {
    const raw = value.users[index];

    // Per-row validation — failures are reported, not thrown
    let row;
    try {
      row = await bulkCreateRowSchema.validateAsync(raw);
    } catch (err) {
      failed.push({ index, errorCode: ERROR_CODES.VALIDATION, errorMsg: err.message, input: raw });
      continue;
    }

    try {
      const exists = await User.existsByEmailOrPhone({ email: row.email, phone: row.phone });
      if (exists) {
        if (skipDuplicates) {
          skipped.push({ index, reason: 'duplicate', phone: row.phone, email: row.email || null });
        } else {
          failed.push({
            index,
            errorCode: ERROR_CODES.CONFLICT,
            errorMsg: req.$t('user_already_exists'),
            input: raw,
          });
        }
        continue;
      }

      let classDoc = null;
      if (row.classId) {
        classDoc = await resolveClass(row.classId);
        if (!classDoc) {
          failed.push({
            index,
            errorCode: ERROR_CODES.NOT_FOUND,
            errorMsg: req.$t('class_not_found'),
            input: raw,
          });
          continue;
        }
      }

      const plainPassword = generateRandomPassword(10);
      const user = await User.createWithPassword({
        name: row.name,
        email: row.email || undefined,
        phone: row.phone,
        plainPassword,
        classId: classDoc ? classDoc._id : undefined,
        createdByStaffId: req.staff._id,
      });

      // Credential delivery — SMS always, email copy when present.
      // Use Promise.allSettled so a transport failure on one channel doesn't
      // block the row (we still report the user as created).
      const deliveries = [
        smsService.sendUserCredentials({ to: row.phone, name: row.name, password: plainPassword }),
      ];
      if (row.email) {
        deliveries.push(
          emailService.sendUserCredentials({
            to: row.email, name: row.name, password: plainPassword, kind: 'email',
          })
        );
      }
      await Promise.allSettled(deliveries);

      created.push({ index, user: user.toSafeJSON() });
    } catch (err) {
      failed.push({
        index,
        errorCode: ERROR_CODES.GENERIC,
        errorMsg: err.message || 'create_failed',
        input: raw,
      });
    }
  }

  return ok(res, {
    summary: {
      total: value.users.length,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    created,
    skipped,
    failed,
    message: req.$t('users_batch_created'),
  });
});

const batchAssignSchema = Joi.object({
  userIds: Joi.array().items(Joi.string()).min(1).required(),
  classId: Joi.string().required(),
});

const batchAssignToClass = asyncHandler(async (req, res) => {
  const value = await batchAssignSchema.validateAsync(req.body);
  const cls = await Class.findByFriendlyId(value.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  const users = await User.find({ userId: { $in: value.userIds } });
  if (users.length === 0) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  await User.assignToClass(users.map((u) => u._id), cls._id);
  return ok(res, { count: users.length, message: req.$t('users_batch_assigned') });
});

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(120),
  isActive: Joi.boolean(),
}).min(1);

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const user = await User.findOneAndUpdate({ userId: req.params.userId }, { $set: value }, { new: true });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { user: user.toSafeJSON() });
});

// Generates a new random password for an existing user, forces them to change
// it on next login (hsCp -> false) and dispatches the credentials via SMS
// (always) and email (when available) — same channels used at account creation.
const regeneratePassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  const plainPassword = generateRandomPassword(8);
  await user.resetPassword(plainPassword);

  await smsService.sendUserCredentials({ to: user.phone, name: user.name, password: plainPassword });
  if (user.email) {
    await emailService.sendUserCredentials({
      to: user.email,
      name: user.name,
      password: plainPassword,
      kind: 'email',
    });
  }

  return ok(res, {
    user: user.toSafeJSON(),
    message: req.$t('password_regenerated'),
  });
});

export default { create, bulkCreate, list, getOne, batchAssignToClass, update, regeneratePassword };
