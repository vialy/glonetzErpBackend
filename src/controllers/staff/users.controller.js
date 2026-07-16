import Joi from 'joi';

import { User, Class, ClassEnrollment } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { generateRandomPassword } from '../../utils/password.js';
import emailService from '../../services/email.service.js';
import smsService from '../../services/sms.service.js';
import { readPagination } from '../../utils/pagination.js';
import { fireAndForget } from '../../utils/fireAndForget.js';
import { ERROR_CODES } from '../../config/index.js';
import classTimelineService from '../../services/classTimeline.service.js';
import paymentTransferService from '../../services/paymentTransfer.service.js';
import userDeletionService from '../../services/userDeletion.service.js';
import schoolCertificateService from '../../services/schoolCertificate.service.js';

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date de naissance strictement antérieure à aujourd'hui (calendrier local). */
function assertDobBeforeToday(value, helpers) {
  // Les dates ISO « date-only » doivent rester en YYYY-MM-DD (évite les décalages TZ).
  const raw =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return helpers.error('any.invalid');
  }
  if (raw >= localYmd()) {
    return helpers.error('date.less');
  }
  return value;
}

const dateOfBirthField = Joi.alternatives()
  .try(
    Joi.date().iso().custom(assertDobBeforeToday),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom(assertDobBeforeToday),
  )
  .allow(null, '');

const placeOfBirthField = Joi.string().max(120).trim().allow(null, '');

function parseDateOfBirth(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parsePlaceOfBirth(value) {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

const createSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  phone: Joi.string().min(6).max(30).required(),
  email: Joi.string().email().allow(null, ''),
  classId: Joi.string().allow(null, ''), // friendly id of the class to assign
  dateOfBirth: dateOfBirthField,
  placeOfBirth: placeOfBirthField,
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
    dateOfBirth: parseDateOfBirth(value.dateOfBirth),
    placeOfBirth: parsePlaceOfBirth(value.placeOfBirth),
  });

  // Class history — record the enrollment so the user's class timeline
  // starts here. No-op when no class was assigned at creation.
  if (classDoc) {
    await ClassEnrollment.enroll({ user, classDoc, staffId: req.staff._id });
  }

  await schoolCertificateService.provisionForUser(user, classDoc, req.staff);

  // Fire-and-forget: respond immediately, deliver credentials in the background.
  // SMS goes to the (now-required) phone; if an email is on file, send a copy
  // there too. Failures are logged but do not block the API response.
  fireAndForget(
    smsService.sendUserCredentials({ to: value.phone, name: value.name, password: plainPassword }),
    'sms:user-credentials'
  );
  if (value.email) {
    fireAndForget(
      emailService.sendUserCredentials({
        to: value.email,
        name: value.name,
        password: plainPassword,
        kind: 'email',
      }),
      'email:user-credentials'
    );
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
 * A user's class history — every enrollment they've had, active first.
 * Staff-facing view; user-facing equivalent is GET /users/my-classes.
 */
const classHistory = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const { page, limit } = readPagination(req);
  const result = await ClassEnrollment.paginate(
    { userId: user._id },
    { page, limit, sort: { isActive: -1, joinedAt: -1 } }
  );
  return ok(res, {
    user: { userId: user.userId, name: user.name, email: user.email, phone: user.phone },
    ...result,
  });
});

/** Parcours de formation enrichi pour un apprenant (vue staff). */
const classTimeline = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const timeline = await classTimelineService.buildClassTimeline(user);
  return ok(res, timeline);
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
  dateOfBirth: dateOfBirthField,
  placeOfBirth: placeOfBirthField,
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

      const plainPassword = generateRandomPassword(8);
      const user = await User.createWithPassword({
        name: row.name,
        email: row.email || undefined,
        phone: row.phone,
        plainPassword,
        classId: classDoc ? classDoc._id : undefined,
        createdByStaffId: req.staff._id,
        dateOfBirth: parseDateOfBirth(row.dateOfBirth),
        placeOfBirth: parsePlaceOfBirth(row.placeOfBirth),
      });

      if (classDoc) {
        await ClassEnrollment.enroll({ user, classDoc, staffId: req.staff._id });
      }

      await schoolCertificateService.provisionForUser(user, classDoc, req.staff);

      // Credential delivery — fire-and-forget per channel. SMS always, email
      // copy when present. We do NOT await: a 500-row batch shouldn't sit
      // behind 500 sequential SMS round-trips. Failures are logged.
      fireAndForget(
        smsService.sendUserCredentials({ to: row.phone, name: row.name, password: plainPassword }),
        `sms:user-credentials:bulk[${index}]`
      );
      if (row.email) {
        fireAndForget(
          emailService.sendUserCredentials({
            to: row.email, name: row.name, password: plainPassword, kind: 'email',
          }),
          `email:user-credentials:bulk[${index}]`
        );
      }

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

  for (const user of users) {
    if (!user.classId || user.classId.equals(cls._id)) continue;
    const currentClass = await Class.findById(user.classId);
    if (currentClass && !schoolCertificateService.isSchoolPeriodFinished(currentClass)) {
      return fail(res, req.$t('school_period_not_finished'), ERROR_CODES.SCHOOL_PERIOD_NOT_FINISHED);
    }
  }

  // Enroll BEFORE assignToClass so user.classId still points at the source class
  // when we snapshot/close the previous ClassEnrollment row.
  const results = await Promise.allSettled(
    users.map((u) => ClassEnrollment.enroll({ user: u, classDoc: cls, staffId: req.staff._id }))
  );
  await User.assignToClass(users.map((u) => u._id), cls._id);

  await Promise.all(
    users.map(async (u) => {
      u.classId = cls._id;
      await schoolCertificateService.provisionForUser(u, cls, req.staff);
    })
  );

  const enrolled = results.filter((r) => r.status === 'fulfilled').length;

  return ok(res, {
    count: users.length,
    enrolled,
    message: req.$t('users_batch_assigned'),
  });
});

const reassignClassSchema = Joi.object({
  classId: Joi.string().required(),
  transferPayments: Joi.boolean().default(false),
});

/** Profile correction — change class without closing enrollment history. */
const reassignClass = asyncHandler(async (req, res) => {
  const value = await reassignClassSchema.validateAsync(req.body);
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  const cls = await Class.findByFriendlyId(value.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  if (user.classId && user.classId.equals(cls._id)) {
    return ok(res, { user: user.toSafeJSON(), message: req.$t('user_class_reassigned') });
  }

  const fromClassObjectId = user.classId;
  let transfer = { paymentsMoved: 0, totalAmount: 0, scholarshipMoved: false };
  if (value.transferPayments && fromClassObjectId) {
    transfer = await paymentTransferService.transferPaymentsAndScholarship({
      user,
      fromClassObjectId,
      toClassDoc: cls,
      staffId: req.staff._id,
    });
  }

  await ClassEnrollment.reassign({ user, classDoc: cls, staffId: req.staff._id });
  await User.assignToClass([user._id], cls._id);
  user.classId = cls._id;
  await schoolCertificateService.provisionForUser(user, cls, req.staff);

  const refreshed = await User.findOne({ userId: req.params.userId }).populate('classId');
  return ok(res, {
    user: refreshed.toSafeJSON(),
    transfer,
    message: req.$t('user_class_reassigned'),
  });
});

// `isActive` is intentionally NOT in the update schema — toggling account
// state goes through the dedicated /disable and /enable endpoints below so
// the operation is auditable and uses a single code path.
const updateSchema = Joi.object({
  name: Joi.string().min(1).max(120),
  dateOfBirth: dateOfBirthField,
  placeOfBirth: placeOfBirthField,
}).min(1);

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const patch = {};
  if (value.name !== undefined) patch.name = value.name;
  if (value.dateOfBirth !== undefined) {
    patch.dateOfBirth = value.dateOfBirth ? parseDateOfBirth(value.dateOfBirth) : null;
  }
  if (value.placeOfBirth !== undefined) {
    patch.placeOfBirth = parsePlaceOfBirth(value.placeOfBirth) ?? null;
  }
  const user = await User.findOneAndUpdate({ userId: req.params.userId }, { $set: patch }, { new: true });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { user: user.toSafeJSON() });
});

/**
 * Disable a user's account. A disabled user cannot log in and any existing
 * staff/user-auth middleware will treat them as unauthenticated, so live
 * sessions are also invalidated on the next request.
 */
const disable = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  if (user.isActive === false) {
    return ok(res, { user: user.toSafeJSON(), message: req.$t('user_disabled') });
  }
  user.isActive = false;
  await user.save();
  return ok(res, { user: user.toSafeJSON(), message: req.$t('user_disabled') });
});

const enable = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  if (user.isActive === true) {
    return ok(res, { user: user.toSafeJSON(), message: req.$t('user_enabled') });
  }
  user.isActive = true;
  await user.save();
  return ok(res, { user: user.toSafeJSON(), message: req.$t('user_enabled') });
});

// Generates a new random password for an existing user, forces them to change
// it on next login (hsCp -> false) and dispatches the credentials via SMS
// (always) and email (when available) — same channels used at account creation.
const regeneratePassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  const plainPassword = generateRandomPassword(8);
  await user.resetPassword(plainPassword);

  // Fire-and-forget — same fast-response pattern as user creation.
  fireAndForget(
    smsService.sendUserCredentials({ to: user.phone, name: user.name, password: plainPassword }),
    'sms:user-password-reset'
  );
  if (user.email) {
    fireAndForget(
      emailService.sendUserCredentials({
        to: user.email,
        name: user.name,
        password: plainPassword,
        kind: 'email',
      }),
      'email:user-password-reset'
    );
  }

  return ok(res, {
    user: user.toSafeJSON(),
    message: req.$t('password_regenerated'),
  });
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  const result = await userDeletionService.deleteUserIfNoPayments(user);
  if (!result.ok) {
    return fail(res, req.$t('user_has_payments'), ERROR_CODES.USER_HAS_PAYMENTS);
  }

  return ok(res, { message: req.$t('user_deleted') });
});

export default {
  create,
  bulkCreate,
  list,
  getOne,
  classHistory,
  classTimeline,
  batchAssignToClass,
  reassignClass,
  update,
  disable,
  enable,
  regeneratePassword,
  remove,
};
