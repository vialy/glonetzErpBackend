import Joi from 'joi';

import { Payment, User, Class, Account } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import accounting from '../../services/accounting.service.js';
import notifier from '../../services/notification.service.js';
import { readPagination } from '../../utils/pagination.js';
import {
  ERROR_CODES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  NOTIFICATION_EVENTS,
} from '../../config/index.js';

/**
 * Normalize the `status` query param into either a single string or an array.
 * Supports any of these shapes:
 *   ?status=pending
 *   ?status=pending&status=failed              (Express parses as array)
 *   ?status=pending,failed                     (comma-separated single string)
 *   ?status[]=pending&status[]=failed          (bracket notation, also an array)
 * Returns either a string, a deduplicated array, or undefined.
 * Invalid status values are silently dropped.
 */
const VALID_PAYMENT_STATUSES = new Set(Object.values(PAYMENT_STATUSES));
function normalizeStatusFilter(raw) {
  if (raw == null) return undefined;
  let list;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.includes(',')) {
    list = raw.split(',');
  } else {
    list = [raw];
  }
  const cleaned = [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter((s) => VALID_PAYMENT_STATUSES.has(s)))];
  if (cleaned.length === 0) return undefined;
  return cleaned.length === 1 ? cleaned[0] : cleaned;
}

const list = asyncHandler(async (req, res) => {
  const { userId, classId, method } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};

  const status = normalizeStatusFilter(req.query.status);
  if (status) filter.status = Array.isArray(status) ? { $in: status } : status;
  if (method) filter.method = method;
  if (userId) {
    const u = await User.findOne({ userId });
    if (u) filter.userId = u._id;
  }
  if (classId) {
    const c = await Class.findByFriendlyId(classId);
    if (c) filter.classId = c._id;
  }
  const result = await Payment.paginate(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'userId', select: 'userId name email phone' },
      { path: 'classId', select: 'classId title' },
    ],
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const payment = await Payment.findByFriendlyId(req.params.paymentId)
    .populate('userId', 'userId name email phone')
    .populate('classId', 'classId title');
  if (!payment) return fail(res, req.$t('payment_not_found'), ERROR_CODES.PAYMENT_NOT_FOUND);
  return ok(res, { payment });
});

/**
 * Staff view of a user's payment status against a class. Requires both
 * `userId` and `classId` (friendly ids) as query params.
 */
const classSummary = asyncHandler(async (req, res) => {
  const { userId, classId } = req.query;
  if (!userId || !classId) return fail(res, req.$t('validation_error'), ERROR_CODES.VALIDATION);
  const user = await User.findOne({ userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const cls = await Class.findByFriendlyId(classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  const summary = await Payment.classSummary(user._id, cls._id, cls.fee, cls.currencyCode);
  const payments = await Payment
    .find({ userId: user._id, classId: cls._id })
    .sort('-createdAt');

  return ok(res, {
    user: { userId: user.userId, name: user.name, email: user.email, phone: user.phone },
    class: {
      classId: cls.classId, title: cls.title, fee: cls.fee, currencyCode: cls.currencyCode,
      startDate: cls.startDate, endDate: cls.endDate,
    },
    summary,
    payments,
  });
});

/**
 * Manual payment — staff records that a user paid for a class outside the
 * online gateways (cash, bank, etc.). Multiple manual payments per user/class
 * are allowed since the spec calls for it.
 */
const manualSchema = Joi.object({
  userId: Joi.string().required(),     // friendly id
  classId: Joi.string().required(),    // friendly id
  amount: Joi.number().min(1).required(),
  note: Joi.string().allow('', null),
  status: Joi.string().valid(PAYMENT_STATUSES.SUCCESSFUL, PAYMENT_STATUSES.PENDING).default(PAYMENT_STATUSES.SUCCESSFUL),
});

const recordManual = asyncHandler(async (req, res) => {
  const value = await manualSchema.validateAsync(req.body);
  const user = await User.findOne({ userId: value.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const cls = await Class.findByFriendlyId(value.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  // Block over-payment past the remaining class fee (pending payments count too)
  const summary = await Payment.classSummary(user._id, cls._id, cls.fee, cls.currencyCode);
  if (summary.remaining <= 0) {
    return fail(res, req.$t('class_fully_paid'), ERROR_CODES.VALIDATION);
  }
  if (value.amount > summary.remaining) {
    return fail(
      res,
      `${req.$t('payment_exceeds_remaining')} (${summary.remaining} ${cls.currencyCode})`,
      ERROR_CODES.VALIDATION
    );
  }

  const payment = await Payment.create({
    userId: user._id,
    userFriendlyId: user.userId,
    classId: cls._id,
    classFriendlyId: cls.classId,
    amount: value.amount,
    currencyCode: cls.currencyCode,
    classStartDate: cls.startDate,
    classEndDate: cls.endDate,
    method: PAYMENT_METHODS.MANUAL,
    provider: PAYMENT_PROVIDERS.MANUAL,
    status: value.status,
    settledAt: value.status === PAYMENT_STATUSES.SUCCESSFUL ? new Date() : undefined,
    recordedByStaffId: req.staff._id,
    manualNote: value.note,
  });

  if (payment.status === PAYMENT_STATUSES.SUCCESSFUL) {
    const account = await Account.findDefaultCompany();
    if (account) {
      await accounting.creditCompanyForPayment({
        companyAccount: account,
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        payment,
      });
    }
    notifier.notify(NOTIFICATION_EVENTS.PAYMENT_RECEIVED, {
      subject: `Payment received (manual) — ${payment.paymentId}`,
      body: `A manual payment of ${payment.amount} ${payment.currencyCode} was recorded for class ${cls.title}.`,
      meta: { paymentId: payment.paymentId, userId: user.userId, classId: cls.classId },
    });
  }

  return ok(res, { payment, message: req.$t('manual_payment_recorded') });
});

export default { list, getOne, classSummary, recordManual };
