import Joi from 'joi';

import { Class, User, Payment } from '../../models/index.js';
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

/**
 * Detailed view of a class — adds enrollment + payment rollup on top of the
 * class document. Aggregates only across users currently assigned to the
 * class, so transfers out of the class no longer affect the totals.
 *
 * Response:
 *   {
 *     class: { ...class fields },
 *     stats: {
 *       studentCount,      // users currently assigned to this class
 *       fullyPaidCount,    // students whose successful total >= class.fee
 *       partiallyPaidCount,// students with > 0 paid but < fee
 *       unpaidCount,       // students with 0 paid
 *       totalExpected,     // studentCount * fee
 *       totalPaid,         // class-wide paid (each student capped at fee)
 *       totalRemaining,    // totalExpected - totalPaid
 *       currencyCode,
 *     }
 *   }
 */
const details = asyncHandler(async (req, res) => {
  const cls = await Class.findByFriendlyId(req.params.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  // Pull the assigned student object ids in one query — we don't need the
  // full docs here, just the ids for the aggregation.
  const students = await User.find({ classId: cls._id }, { _id: 1 }).lean();
  const studentObjectIds = students.map((s) => s._id);

  const rollup = await Payment.classRollup(studentObjectIds, cls._id, cls.fee);

  // Derive partially / unpaid counts from the paidByStudent map without
  // another DB call. A student with no entry in the map has paid 0.
  let partiallyPaidCount = 0;
  for (const paid of rollup.paidByStudent.values()) {
    if (paid > 0 && paid < cls.fee) partiallyPaidCount += 1;
  }
  const studentsWithAnyPayment = rollup.paidByStudent.size;
  const unpaidCount = rollup.studentCount - studentsWithAnyPayment;

  return ok(res, {
    class: cls,
    stats: {
      studentCount: rollup.studentCount,
      fullyPaidCount: rollup.fullyPaidCount,
      partiallyPaidCount,
      unpaidCount,
      totalExpected: rollup.totalExpected,
      totalPaid: rollup.totalPaid,
      totalRemaining: rollup.totalRemaining,
      currencyCode: cls.currencyCode,
    },
  });
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

export default { create, list, getOne, details, update };
