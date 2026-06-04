import Joi from 'joi';

import { Payment, Class, Account } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import gateways from '../../services/gateways/index.js';
import accounting from '../../services/accounting.service.js';
import notifier from '../../services/notification.service.js';
import { readPagination } from '../../utils/pagination.js';
import config, {
  ERROR_CODES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  WITHDRAWAL_ACCOUNT_PROVIDERS,
  NOTIFICATION_EVENTS,
} from '../../config/index.js';

/**
 * List the logged-in user's payments. ?status=pending to filter pending.
 */
const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit } = readPagination(req);
  const filter = { userId: req.user._id };
  if (status) filter.status = status;
  const result = await Payment.paginate(filter, { page, limit, sort: '-createdAt' });
  return ok(res, result);
});

const pending = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await Payment.paginate(
    { userId: req.user._id, status: PAYMENT_STATUSES.PENDING },
    { page, limit, sort: '-createdAt' }
  );
  return ok(res, result);
});

/**
 * Initiate an online payment for the user's assigned class. The amount is
 * pulled from the class (not from the request), per spec.
 *
 * For MoMo gateways (Neero), the user provides their MoMo phone + provider.
 */
const initiateSchema = Joi.object({
  classId: Joi.string(), // friendly id; defaults to the user's assigned class
  phoneNumber: Joi.string().min(6).max(30),
  provider: Joi.string().valid(...Object.values(WITHDRAWAL_ACCOUNT_PROVIDERS)),
  returnUrl: Joi.string().uri().allow('', null),
});

const initiate = asyncHandler(async (req, res) => {
  const value = await initiateSchema.validateAsync(req.body || {});

  // Resolve the class (default to the user's assigned class)
  let classDoc;
  if (value.classId) {
    classDoc = await Class.findByFriendlyId(value.classId);
  } else if (req.user.classId) {
    classDoc = await Class.findById(req.user.classId);
  }
  if (!classDoc) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);

  // Create the pending payment first so we have a friendly id to pass as a reference
  const payment = await Payment.create({
    userId: req.user._id,
    userFriendlyId: req.user.userId,
    classId: classDoc._id,
    classFriendlyId: classDoc.classId,
    amount: classDoc.fee,
    currencyCode: classDoc.currencyCode,
    classStartDate: classDoc.startDate,
    classEndDate: classDoc.endDate,
    method: PAYMENT_METHODS.ONLINE,
    status: PAYMENT_STATUSES.PENDING,
  });

  try {
    const { adapter, result } = await gateways.initiatePaymentViaActive({
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      phoneNumber: value.phoneNumber,
      provider: value.provider,
      mchTransactionRef: payment.paymentId,
      description: `Class fee: ${classDoc.title}`,
      returnUrl: value.returnUrl || `${config.appBaseUrl}/payment-result`,
      simulateOutcome: req.headers['x-simulate-outcome'],
    });
    payment.provider = adapter.name;
    payment.gatewayReference = result.reference;
    payment.gatewayType = result.type;
    payment.gatewayPaymentRef = result.paymentRef;
    payment.gatewayFees = result.fees;
    payment.gatewayPayload = result.raw;
    payment.paymentUrl = result.paymentUrl || undefined;

    // If the adapter resolved synchronously (e.g. the dev simulator), settle now.
    if (result.status === 'successful') {
      payment.status = PAYMENT_STATUSES.SUCCESSFUL;
      payment.settledAt = new Date();
      const acc = await Account.findDefaultCompany();
      if (acc) {
        await accounting.creditCompanyForPayment({
          companyAccount: acc,
          amount: payment.amount,
          currencyCode: payment.currencyCode,
          payment,
        });
      }
      notifier.notify(NOTIFICATION_EVENTS.PAYMENT_RECEIVED, {
        subject: `Payment received — ${payment.paymentId}`,
        body: `${payment.amount} ${payment.currencyCode} received for ${payment.classFriendlyId}.`,
        meta: { paymentId: payment.paymentId, provider: payment.provider },
      });
    } else if (result.status === 'failed' || result.status === 'cancelled') {
      payment.status = result.status === 'failed' ? PAYMENT_STATUSES.FAILED : PAYMENT_STATUSES.CANCELLED;
      payment.failureReason = result.status;
    }
    await payment.save();
    return ok(res, { payment, paymentUrl: payment.paymentUrl, message: req.$t('payment_initiated') });
  } catch (err) {
    payment.status = PAYMENT_STATUSES.FAILED;
    payment.failureReason = err.detail ? JSON.stringify(err.detail) : err.message;
    await payment.save();
    if (err.code === 'gateway_unavailable') {
      return fail(res, req.$t('payments_currently_unavailable'), ERROR_CODES.GATEWAY_UNAVAILABLE);
    }
    await notifier.notify(NOTIFICATION_EVENTS.GATEWAY_ERROR, {
      subject: `Payment initiation error — ${payment.paymentId}`,
      body: 'A user payment initiation failed.',
      meta: { paymentId: payment.paymentId, error: err.detail || err.message },
    });
    throw err;
  }
});

export default { list, pending, initiate };
