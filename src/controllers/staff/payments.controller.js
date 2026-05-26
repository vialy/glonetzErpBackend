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

const list = asyncHandler(async (req, res) => {
  const { status, userId, classId, method } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (status) filter.status = status;
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
 * Manual payment — staff records that a user paid for a class outside the
 * online gateways (cash, bank, etc.). Multiple manual payments per user/class
 * are allowed since the spec calls for it.
 */
const manualSchema = Joi.object({
  userId: Joi.string().required(),     // friendly id
  classId: Joi.string().required(),    // friendly id
  amount: Joi.number().min(0).required(),
  note: Joi.string().allow('', null),
  status: Joi.string().valid(PAYMENT_STATUSES.SUCCESSFUL, PAYMENT_STATUSES.PENDING).default(PAYMENT_STATUSES.SUCCESSFUL),
});

const recordManual = asyncHandler(async (req, res) => {
  const value = await manualSchema.validateAsync(req.body);
  const user = await User.findOne({ userId: value.userId });
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
  const cls = await Class.findByFriendlyId(value.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

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

export default { list, getOne, recordManual };
