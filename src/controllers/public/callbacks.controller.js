import { Payment, Account, Withdrawal } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import gateways from '../../services/gateways/index.js';
import accounting from '../../services/accounting.service.js';
import notifier from '../../services/notification.service.js';
import {
  PAYMENT_STATUSES,
  WITHDRAWAL_STATUSES,
  NOTIFICATION_EVENTS,
  ERROR_CODES,
} from '../../config/index.js';

/**
 * Generic callback handler used for both Tranzak and Neero.
 *
 * Steps:
 *   1. Resolve the adapter from the URL.
 *   2. Let the adapter parse + verify the payload.
 *   3. Look up the matching Payment / Withdrawal by friendly id OR gateway ref.
 *   4. Update statuses + credit the company account on a successful payment.
 */
function buildHandler(providerName) {
  return asyncHandler(async (req, res) => {
    const adapter = gateways.getByName(providerName);
    if (!adapter) return fail(res, 'gateway_not_found', ERROR_CODES.GENERIC);

    const parsed = adapter.parseCallback({ headers: req.headers, body: req.body });
    if (!parsed.ok) {
      return fail(res, 'invalid_callback', ERROR_CODES.FORBIDDEN);
    }
    const { reference, status, raw } = parsed;

    const payment = await Payment.findOne({
      $or: [{ paymentId: reference }, { gatewayReference: reference }],
    });
    if (payment) {
      return handlePaymentCallback({ res, payment, status, raw });
    }

    const withdrawal = await Withdrawal.findOne({
      $or: [{ withdrawalId: reference }, { gatewayReference: reference }],
    });
    if (withdrawal) {
      return handleWithdrawalCallback({ res, withdrawal, status, raw });
    }

    return ok(res, { acknowledged: true, matched: false });
  });
}

async function handlePaymentCallback({ res, payment, status, raw }) {
  if (payment.status !== PAYMENT_STATUSES.PENDING) {
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, alreadySettled: true });
  }

  if (status === 'successful') {
    payment.status = PAYMENT_STATUSES.SUCCESSFUL;
    payment.settledAt = new Date();
    payment.gatewayCallback = raw;
    await payment.save();

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
      subject: `Payment received — ${payment.paymentId}`,
      body: `${payment.amount} ${payment.currencyCode} received for ${payment.classFriendlyId}.`,
      meta: { paymentId: payment.paymentId, provider: payment.provider },
    });
    return ok(res, { acknowledged: true, settled: true });
  }

  if (status === 'failed' || status === 'cancelled') {
    payment.status = status === 'failed' ? PAYMENT_STATUSES.FAILED : PAYMENT_STATUSES.CANCELLED;
    payment.failureReason = status;
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, settled: true });
  }

  payment.gatewayCallback = raw;
  await payment.save();
  return ok(res, { acknowledged: true });
}

async function handleWithdrawalCallback({ res, withdrawal, status, raw }) {
  if (withdrawal.status !== WITHDRAWAL_STATUSES.PENDING) {
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, alreadySettled: true });
  }

  if (status === 'successful') {
    withdrawal.status = WITHDRAWAL_STATUSES.SUCCESSFUL;
    withdrawal.settledAt = new Date();
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, settled: true });
  }

  if (status === 'failed' || status === 'cancelled') {
    const account = await Account.findById(withdrawal.accountId);
    if (account) {
      await accounting.refundWithdrawal({
        staffId: withdrawal.staffId,
        account,
        amount: withdrawal.amount,
        currencyCode: withdrawal.currencyCode,
        withdrawalFriendlyId: withdrawal.withdrawalId,
        reason: `gateway_${status}`,
      });
    }
    withdrawal.status = WITHDRAWAL_STATUSES.FAILED;
    withdrawal.failureReason = status;
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    notifier.notify(NOTIFICATION_EVENTS.WITHDRAWAL_FAILED, {
      subject: `Withdrawal failed — ${withdrawal.withdrawalId}`,
      body: `Withdrawal failed via callback. Funds refunded.`,
      meta: { withdrawalId: withdrawal.withdrawalId, status },
    });
    return ok(res, { acknowledged: true, refunded: true });
  }

  withdrawal.gatewayCallback = raw;
  await withdrawal.save();
  return ok(res, { acknowledged: true });
}

export default {
  tranzakCallback: buildHandler('tranzak'),
  neeroCallback: buildHandler('neero'),
};
