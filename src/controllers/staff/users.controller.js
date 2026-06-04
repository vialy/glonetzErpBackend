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
  email: Joi.string().email().allow(null, ''),
  phone: Joi.string().min(6).max(30).allow(null, ''),
  classId: Joi.string().allow(null, ''), // friendly id of the class to assign
}).or('email', 'phone');

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);

  const exists = await User.existsByEmailOrPhone({ email: value.email, phone: value.phone });
  if (exists) return fail(res, req.$t('user_already_exists'), ERROR_CODES.CONFLICT);

  let classDoc = null;
  if (value.classId) {
    classDoc = await Class.findByFriendlyId(value.classId);
    if (!classDoc) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  }

  const plainPassword = generateRandomPassword(10);
  console.log(`Generated password: ${plainPassword}`); /**To be removed in production and when email/SMS services are implemented */
  const user = await User.createWithPassword({
    name: value.name,
    email: value.email || undefined,
    phone: value.phone || undefined,
    plainPassword,
    classId: classDoc ? classDoc._id : undefined,
    createdByStaffId: req.staff._id,
  });

  // Deliver credentials by whichever channel the staff provided
  if (value.email) {
    await emailService.sendUserCredentials({
      to: value.email,
      name: value.name,
      password: plainPassword,
      kind: 'email',
    });
  } else if (value.phone) {
    await smsService.sendUserCredentials({ to: value.phone, name: value.name, password: plainPassword });
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

export default { create, list, getOne, batchAssignToClass, update };
