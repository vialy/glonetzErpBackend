import Joi from 'joi';

import { User, Class, Scholarship } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, SCHOLARSHIP_TYPES } from '../../config/index.js';

const grantSchema = Joi.object({
  userId: Joi.string().required(),
  classId: Joi.string().required(),
  type: Joi.string().valid(...Object.values(SCHOLARSHIP_TYPES)).required(),
  value: Joi.when('type', {
    is: SCHOLARSHIP_TYPES.FULL,
    then: Joi.number().min(0).optional(),
    otherwise: Joi.number().min(1).required(),
  }),
  reason: Joi.string().allow('', null),
  note: Joi.string().allow('', null),
});

const grant = asyncHandler(async (req, res) => {
  const value = await grantSchema.validateAsync(req.body);
  const user = await User.findOne({ userId: value.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const cls = await Class.findByFriendlyId(value.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  if (!user.classId || !user.classId.equals(cls._id)) {
    return fail(res, req.$t('scholarship_user_not_in_class'), ERROR_CODES.VALIDATION);
  }

  const existing = await Scholarship.findActiveForUserClass(user._id, cls._id);
  if (existing) {
    return fail(res, req.$t('scholarship_already_active'), ERROR_CODES.CONFLICT);
  }

  if (value.type === SCHOLARSHIP_TYPES.PERCENTAGE && value.value > 100) {
    return fail(res, req.$t('validation_error'), ERROR_CODES.VALIDATION);
  }
  if (value.type === SCHOLARSHIP_TYPES.FIXED && value.value > cls.fee) {
    return fail(res, req.$t('scholarship_exceeds_fee'), ERROR_CODES.VALIDATION);
  }

  const scholarship = await Scholarship.create({
    userId: user._id,
    userFriendlyId: user.userId,
    classId: cls._id,
    classFriendlyId: cls.classId,
    type: value.type,
    value: value.type === SCHOLARSHIP_TYPES.FULL ? cls.fee : value.value,
    catalogFeeSnapshot: cls.fee,
    reason: value.reason,
    note: value.note,
    grantedByStaffId: req.staff._id,
    grantedAt: new Date(),
    isActive: true,
  });

  return ok(res, { scholarship, message: req.$t('scholarship_granted') });
});

const list = asyncHandler(async (req, res) => {
  const { userId, classId, isActive } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (userId) {
    const user = await User.findOne({ userId });
    if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
    filter.userId = user._id;
  }
  if (classId) {
    const cls = await Class.findByFriendlyId(classId);
    if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
    filter.classId = cls._id;
  }
  if (isActive === 'true') filter.isActive = true;
  if (isActive === 'false') filter.isActive = false;

  const result = await Scholarship.paginate(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'userId', select: 'userId name' },
      { path: 'classId', select: 'classId title' },
    ],
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const scholarship = await Scholarship.findByFriendlyId(req.params.scholarshipId)
    .populate('userId', 'userId name')
    .populate('classId', 'classId title');
  if (!scholarship) return fail(res, req.$t('scholarship_not_found'), ERROR_CODES.SCHOLARSHIP_NOT_FOUND);
  return ok(res, { scholarship });
});

const listForUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const { page, limit } = readPagination(req);
  const result = await Scholarship.paginate(
    { userId: user._id },
    {
      page,
      limit,
      sort: '-createdAt',
      populate: { path: 'classId', select: 'classId title' },
    }
  );
  return ok(res, result);
});

const revoke = asyncHandler(async (req, res) => {
  const scholarship = await Scholarship.findByFriendlyId(req.params.scholarshipId);
  if (!scholarship) return fail(res, req.$t('scholarship_not_found'), ERROR_CODES.SCHOLARSHIP_NOT_FOUND);
  if (!scholarship.isActive) {
    return fail(res, req.$t('scholarship_already_revoked'), ERROR_CODES.CONFLICT);
  }

  scholarship.isActive = false;
  scholarship.revokedAt = new Date();
  scholarship.revokedByStaffId = req.staff._id;
  await scholarship.save();

  return ok(res, { scholarship, message: req.$t('scholarship_revoked') });
});

export default { grant, list, getOne, listForUser, revoke };
