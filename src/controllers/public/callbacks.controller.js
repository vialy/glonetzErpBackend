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
  ID_PREFIXES,
} from '../../config/index.js';

/**
 * Neero callback handler.
 *
 * Anti-spoofing flow:
 *   1. Parse the raw callback to extract `externalTransactionId` (our friendly id,
 *      e.g. "PAY-XXXXXXXX" or "WDR-XXXXXXXX") and `transactionIntentId` (Neero's
 *      internal ID we stored as `gatewayReference`).
 *   2. Skip immediately if the callback reports PENDING — nothing to do yet.
 *   3. Determine record type from the externalTransactionId prefix.
 *   4. Load the internal Payment / Withdrawal record using externalTransactionId.
 *   5. Use the `gatewayReference` stored on the record (not the callback value) to
 *      query Neero directly — this prevents spoofed payloads from changing status.
 *   6. Apply the verified status.
 */
function buildHandler(providerName) {
  return asyncHandler(async (req, res) => {
    const adapter = gateways.getByName(providerName);
    if (!adapter) return fail(res, 'gateway_not_found', ERROR_CODES.GENERIC);

    const parsed = adapter.parseCallback({ headers: req.headers, body: req.body });
    if (!parsed.ok) {
      return fail(res, 'invalid_callback', ERROR_CODES.FORBIDDEN);
    }

    const { externalTransactionId, status: callbackStatus, raw } = parsed;

    // Ignore PENDING callbacks — nothing actionable
    if (callbackStatus === 'pending') {
      return ok(res, { acknowledged: true, skipped: 'pending' });
    }

    if (!externalTransactionId) {
      return ok(res, { acknowledged: true, matched: false });
    }

    // Determine type from the friendly-id prefix
    const isPayment = externalTransactionId.startsWith(`${ID_PREFIXES.payment}-`);
    const isWithdrawal = externalTransactionId.startsWith(`${ID_PREFIXES.withdrawal}-`);

    if (isPayment) {
      const payment = await Payment.findOne({ paymentId: externalTransactionId });
      if (!payment) return ok(res, { acknowledged: true, matched: false });
      return handlePaymentCallback({ res, adapter, payment, raw });
    }

    if (isWithdrawal) {
      const withdrawal = await Withdrawal.findOne({ withdrawalId: externalTransactionId });
      if (!withdrawal) return ok(res, { acknowledged: true, matched: false });
      return handleWithdrawalCallback({ res, adapter, withdrawal, raw });
    }

    return ok(res, { acknowledged: true, matched: false });
  });
}

/**
 * Re-verify the payment status directly with Neero using the stored
 * gatewayReference, then apply the authoritative status.
 *
 * Cross-checks performed against the verify response:
 *   - type must be "CASHIN" (this is a payment, not a withdrawal)
 *   - reported amount must match what we have on record
 * Either failing → ignore the callback (likely spoof or mis-routed).
 */
async function handlePaymentCallback({ res, adapter, payment, raw }) {
  if (payment.status !== PAYMENT_STATUSES.PENDING) {
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, alreadySettled: true });
  }

  // Query Neero for the authoritative status (anti-spoofing)
  const verified = await adapter.verify({ reference: payment.gatewayReference });
  if (!verified.ok) {
    // Gateway unreachable — store the raw callback and bail; do not update status
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, verified: false });
  }

  // Sanity: this intent must be a CASHIN and the amount must match
  if (verified.type && verified.type !== 'CASHIN') {
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, mismatch: 'type' });
  }
  if (verified.amount != null && Number(verified.amount) !== Number(payment.amount)) {
    payment.gatewayCallback = raw;
    await payment.save();
    return ok(res, { acknowledged: true, mismatch: 'amount' });
  }

  const status = verified.status;

  // Capture freshest gateway metadata from the verify response
  if (verified.paymentRef) payment.gatewayPaymentRef = verified.paymentRef;
  if (verified.fees) payment.gatewayFees = verified.fees;
  payment.gatewayPayload = verified.raw;

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

  // Still pending or unknown — store callback and wait for the next one
  payment.gatewayCallback = raw;
  await payment.save();
  return ok(res, { acknowledged: true });
}

/**
 * Re-verify the withdrawal status directly with Neero, then apply it.
 * On failure: refund the staff account and notify.
 *
 * Cross-checks the verify response:
 *   - type must be "CASHOUT"
 *   - reported amount must match what we have on record
 */
async function handleWithdrawalCallback({ res, adapter, withdrawal, raw }) {
  if (withdrawal.status !== WITHDRAWAL_STATUSES.PENDING) {
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, alreadySettled: true });
  }

  // Query Neero for the authoritative status (anti-spoofing)
  const verified = await adapter.verify({ reference: withdrawal.gatewayReference });
  if (!verified.ok) {
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, verified: false });
  }

  if (verified.type && verified.type !== 'CASHOUT') {
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, mismatch: 'type' });
  }
  if (verified.amount != null && Number(verified.amount) !== Number(withdrawal.amount)) {
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, mismatch: 'amount' });
  }

  const status = verified.status;

  if (verified.paymentRef) withdrawal.gatewayPaymentRef = verified.paymentRef;
  if (verified.fees) withdrawal.gatewayFees = verified.fees;
  withdrawal.gatewayPayload = verified.raw;

  // Withdrawals are now admin-initiated: company→staff was already credited at
  // initiate time. The async branches here finish the ledger:
  //   - successful → debit the staff so credit + debit net to zero
  //   - failed     → debit the staff AND credit the company back
  if (status === 'successful') {
    const account = await Account.findById(withdrawal.accountId);
    if (account) {
      await accounting.debitForWithdrawal({
        staffId: withdrawal.staffId,
        account,
        amount: withdrawal.amount,
        currencyCode: withdrawal.currencyCode,
        withdrawalFriendlyId: withdrawal.withdrawalId,
        description: `Cash-out ${withdrawal.withdrawalId} settled`,
      });
    }
    withdrawal.status = WITHDRAWAL_STATUSES.SUCCESSFUL;
    withdrawal.settledAt = new Date();
    withdrawal.gatewayCallback = raw;
    await withdrawal.save();
    return ok(res, { acknowledged: true, settled: true });
  }

  if (status === 'failed' || status === 'cancelled') {
    const companyAccount = await Account.findDefaultCompany();
    const staffAccount = await Account.findById(withdrawal.accountId);
    if (companyAccount && staffAccount) {
      await accounting.refundCompanyDebitStaff({
        companyAccount,
        beneficiaryStaffId: withdrawal.staffId,
        beneficiaryAccount: staffAccount,
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
      body: 'Withdrawal failed via callback. Staff balance debited and company balance restored.',
      meta: { withdrawalId: withdrawal.withdrawalId, status },
    });
    return ok(res, { acknowledged: true, refunded: true });
  }

  withdrawal.gatewayCallback = raw;
  await withdrawal.save();
  return ok(res, { acknowledged: true });
}

export default {
  neeroCallback: buildHandler('neero'),
};
