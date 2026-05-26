import Joi from 'joi';

import { Class } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { ERROR_CODES } from '../../config/index.js';
import { readPagination } from '../../utils/pagination.js';

const createSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().allow('', null),
  startDate: Joi.date().required(),
  endDate: Joi.date().min(Joi.ref('startDate')).required(),
  fee: Joi.number().min(0).required(),
  currencyCode: Joi.string().length(3).uppercase().default('XAF'),
});

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);
  const doc = await Class.create({ ...value, createdByStaffId: req.staff._id });
  return ok(res, { class: doc, message: req.$t('class_created') });
});

const list = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (q) filter.title = { $regex: q, $options: 'i' };
  const result = await Class.paginate(filter, { page, limit, sort: '-createdAt' });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const cls = await Class.findByFriendlyId(req.params.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { class: cls });
});

const updateSchema = Joi.object({
  title: Joi.string().min(1).max(200),
  description: Joi.string().allow('', null),
  startDate: Joi.date(),
  endDate: Joi.date(),
  fee: Joi.number().min(0),
  currencyCode: Joi.string().length(3).uppercase(),
  isActive: Joi.boolean(),
}).min(1);

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const cls = await Class.findOneAndUpdate({ classId: req.params.classId }, { $set: value }, { new: true });
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { class: cls, message: req.$t('class_updated') });
});

export default { create, list, getOne, update };
