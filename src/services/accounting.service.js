import mongoose from 'mongoose';

import { Account, Transaction } from '../models/index.js';
import { generateFriendlyId } from '../utils/idGenerator.js';
import {
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
} from '../config/index.js';

/**
 * Internal helper — wraps a callback in a MongoDB session/transaction when the
 * deployment supports it, otherwise runs the callback directly. Replica-set is
 * required for real transactions; we degrade gracefully on standalone Mongo.
 */
async function withSession(fn) {
  let session = null;
  let supportsTxn = false;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    supportsTxn = true;
  } catch (_) {
    session = null;
  }
  try {
    const result = await fn(session);
    if (supportsTxn && session) await session.commitTransaction();
    return result;
  } catch (err) {
    if (supportsTxn && session) {
      try { await session.abortTransaction(); } catch (_) { /* noop */ }
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

/**
 * Credit the company's main account when a payment is received.
 * Creates a single credit transaction tied to the payment.
 */
export async function creditCompanyForPayment({ companyAccount, amount, currencyCode, payment }) {
  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};
    const opening = companyAccount.balance;
    const updated = await Account.applyDelta(companyAccount._id, amount, session);

    const tx = new Transaction({
      accountId: companyAccount._id,
      accountFriendlyId: companyAccount.accountId,
      type: TRANSACTION_TYPES.CREDIT,
      source: TRANSACTION_SOURCES.PAYMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: opening,
      closingBalance: updated.balance,
      description: `Payment ${payment.paymentId} from user ${payment.userFriendlyId || ''}`.trim(),
      paymentFriendlyId: payment.paymentId,
    });
    await tx.save(sessOpt);
    return { account: updated, transaction: tx };
  });
}

/**
 * Transfer between two accounts.
 *
 *  - amount: principal moved.
 *  - fee:    additional charge (default 0). When the caller is the company /
 *            admin, this is the cost charged "by the system"; both sides see
 *            the same total but the perspectives differ.
 *  - description / userId fields are recorded on the *initiator* transaction.
 *
 * Creates TWO transactions:
 *   - debit on the initiator's account (totalAmount = amount + fee)
 *   - credit on the beneficiary's account (totalAmount = amount + fee — the
 *     beneficiary receives the full sum, matching the user's spec)
 */
export async function transfer({
  initiatorStaffId,
  initiatorAccount,
  beneficiaryStaffId,
  beneficiaryAccount,
  amount,
  fee = 0,
  currencyCode,
  description,
}) {
  if (amount <= 0) {
    const err = new Error('validation_error');
    err.code = 'validation_error';
    throw err;
  }
  const total = amount + (fee || 0);
  const transferFriendlyId = generateFriendlyId('transfer');

  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};

    const debitOpening = initiatorAccount.balance;
    const debited = await Account.applyDelta(initiatorAccount._id, -total, session);

    const creditOpening = beneficiaryAccount.balance;
    const credited = await Account.applyDelta(beneficiaryAccount._id, total, session);

    const payerTx = new Transaction({
      accountId: initiatorAccount._id,
      accountFriendlyId: initiatorAccount.accountId,
      userId: initiatorStaffId,
      beneficiaryId: beneficiaryStaffId,
      beneficiaryAccountId: beneficiaryAccount._id,
      beneficiaryAccountFriendlyId: beneficiaryAccount.accountId,
      type: TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.TRANSFER,
      amount,
      fee,
      totalAmount: total,
      currencyCode,
      openingBalance: debitOpening,
      closingBalance: debited.balance,
      description,
      transferId: transferFriendlyId,
    });

    const beneficiaryTx = new Transaction({
      accountId: beneficiaryAccount._id,
      accountFriendlyId: beneficiaryAccount.accountId,
      userId: beneficiaryStaffId,
      beneficiaryId: initiatorStaffId,
      beneficiaryAccountId: initiatorAccount._id,
      beneficiaryAccountFriendlyId: initiatorAccount.accountId,
      type: TRANSACTION_TYPES.CREDIT,
      source: TRANSACTION_SOURCES.TRANSFER,
      amount,
      fee,
      totalAmount: total,
      currencyCode,
      openingBalance: creditOpening,
      closingBalance: credited.balance,
      description,
      transferId: transferFriendlyId,
    });

    await payerTx.save(sessOpt);
    await beneficiaryTx.save(sessOpt);

    return {
      transferId: transferFriendlyId,
      payerTransaction: payerTx,
      beneficiaryTransaction: beneficiaryTx,
      payerAccount: debited,
      beneficiaryAccount: credited,
    };
  });
}

/**
 * Reserve funds for a withdrawal — debits the staff's account and creates a
 * pending withdrawal transaction. If the gateway later fails, the caller
 * should call `refundWithdrawal` to restore the balance.
 */
export async function debitForWithdrawal({ staffId, account, amount, currencyCode, withdrawalFriendlyId, description }) {
  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};
    const opening = account.balance;
    const debited = await Account.applyDelta(account._id, -amount, session);
    const tx = new Transaction({
      accountId: account._id,
      accountFriendlyId: account.accountId,
      userId: staffId,
      type: TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.WITHDRAWAL,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: opening,
      closingBalance: debited.balance,
      description: description || `Withdrawal ${withdrawalFriendlyId}`,
      withdrawalFriendlyId,
    });
    await tx.save(sessOpt);
    return { account: debited, transaction: tx };
  });
}

export async function refundWithdrawal({ staffId, account, amount, currencyCode, withdrawalFriendlyId, reason }) {
  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};
    const opening = account.balance;
    const credited = await Account.applyDelta(account._id, amount, session);
    const tx = new Transaction({
      accountId: account._id,
      accountFriendlyId: account.accountId,
      userId: staffId,
      type: TRANSACTION_TYPES.CREDIT,
      source: TRANSACTION_SOURCES.ADJUSTMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: opening,
      closingBalance: credited.balance,
      description: `Refund for failed withdrawal ${withdrawalFriendlyId}${reason ? ` — ${reason}` : ''}`,
      withdrawalFriendlyId,
    });
    await tx.save(sessOpt);
    return { account: credited, transaction: tx };
  });
}

export default {
  creditCompanyForPayment,
  transfer,
  debitForWithdrawal,
  refundWithdrawal,
};
