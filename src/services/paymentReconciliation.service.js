import { Account } from '../models/index.js';
import accounting from './accounting.service.js';
import notifier from './notification.service.js';
import { PAYMENT_STATUSES, NOTIFICATION_EVENTS } from '../config/index.js';

/**
 * Reconcile a pending online payment with the gateway (Neero verify API).
 * Shared by the public webhook handler and POST /users/payments/:paymentId/verify.
 */
export async function reconcilePaymentWithGateway({ payment, adapter, raw = null }) {
  if (!adapter?.verify) {
    return { outcome: 'verify_unavailable', payment };
  }

  if (!payment.gatewayReference) {
    return { outcome: 'no_gateway_reference', payment };
  }

  if (payment.status !== PAYMENT_STATUSES.PENDING) {
    if (raw) {
      payment.gatewayCallback = raw;
      await payment.save();
    }
    return { outcome: 'already_settled', payment };
  }

  const verified = await adapter.verify({ reference: payment.gatewayReference });
  if (!verified.ok) {
    if (raw) {
      payment.gatewayCallback = raw;
      await payment.save();
    }
    return { outcome: 'verify_failed', payment };
  }

  if (verified.type && verified.type !== 'CASHIN') {
    if (raw) {
      payment.gatewayCallback = raw;
      await payment.save();
    }
    return { outcome: 'mismatch_type', payment };
  }
  if (verified.amount != null && Number(verified.amount) !== Number(payment.amount)) {
    if (raw) {
      payment.gatewayCallback = raw;
      await payment.save();
    }
    return { outcome: 'mismatch_amount', payment };
  }

  const status = verified.status;

  if (verified.paymentRef) payment.gatewayPaymentRef = verified.paymentRef;
  if (verified.fees) payment.gatewayFees = verified.fees;
  payment.gatewayPayload = verified.raw;
  if (raw) payment.gatewayCallback = raw;

  if (status === 'successful') {
    payment.status = PAYMENT_STATUSES.SUCCESSFUL;
    payment.settledAt = new Date();
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
    return { outcome: 'settled', payment };
  }

  if (status === 'failed' || status === 'cancelled') {
    payment.status = status === 'failed' ? PAYMENT_STATUSES.FAILED : PAYMENT_STATUSES.CANCELLED;
    payment.failureReason = status;
    await payment.save();
    return { outcome: status, payment };
  }

  await payment.save();
  return { outcome: 'still_pending', payment };
}
