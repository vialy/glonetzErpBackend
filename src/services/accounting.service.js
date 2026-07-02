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

/**
 * Atomic ledger half of an admin-initiated payout:
 *  1. Debit the company (default) account by `amount`.
 *  2. Credit the beneficiary staff's account by `amount`.
 *
 * Both transactions share the same `transferId` so they can be reconciled
 * as a single event in the ledger. The actual gateway call (cash-out) is
 * the caller's responsibility — this function only moves money internally.
 *
 * Returns { transferId, companyAccount, staffAccount, companyTx, staffTx }.
 */
export async function debitCompanyCreditStaff({
  companyAccount,
  beneficiaryStaffId,
  beneficiaryAccount,
  amount,
  currencyCode,
  description,
  withdrawalFriendlyId,
}) {
  const transferFriendlyId = generateFriendlyId('transfer');

  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};

    const companyOpening = companyAccount.balance;
    const companyDebited = await Account.applyDelta(companyAccount._id, -amount, session);

    const staffOpening = beneficiaryAccount.balance;
    const staffCredited = await Account.applyDelta(beneficiaryAccount._id, amount, session);

    const companyTx = new Transaction({
      accountId: companyAccount._id,
      accountFriendlyId: companyAccount.accountId,
      beneficiaryId: beneficiaryStaffId,
      beneficiaryAccountId: beneficiaryAccount._id,
      beneficiaryAccountFriendlyId: beneficiaryAccount.accountId,
      type: TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.WITHDRAWAL,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: companyOpening,
      closingBalance: companyDebited.balance,
      description: description || `Withdrawal funding ${withdrawalFriendlyId}`,
      transferId: transferFriendlyId,
      withdrawalFriendlyId,
    });

    const staffTx = new Transaction({
      accountId: beneficiaryAccount._id,
      accountFriendlyId: beneficiaryAccount.accountId,
      userId: beneficiaryStaffId,
      beneficiaryAccountId: companyAccount._id,
      beneficiaryAccountFriendlyId: companyAccount.accountId,
      type: TRANSACTION_TYPES.CREDIT,
      source: TRANSACTION_SOURCES.WITHDRAWAL,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: staffOpening,
      closingBalance: staffCredited.balance,
      description: description || `Withdrawal funding ${withdrawalFriendlyId}`,
      transferId: transferFriendlyId,
      withdrawalFriendlyId,
    });

    await companyTx.save(sessOpt);
    await staffTx.save(sessOpt);

    return {
      transferId: transferFriendlyId,
      companyAccount: companyDebited,
      staffAccount: staffCredited,
      companyTx,
      staffTx,
    };
  });
}

/**
 * Reverse of `debitCompanyCreditStaff` — used when the gateway cash-out fails
 * after we've already moved the money internally. Debits the staff account
 * and credits the company account back by the same amount. Two ADJUSTMENT
 * transactions share a fresh transferId.
 */
export async function refundCompanyDebitStaff({
  companyAccount,
  beneficiaryStaffId,
  beneficiaryAccount,
  amount,
  currencyCode,
  withdrawalFriendlyId,
  reason,
}) {
  const transferFriendlyId = generateFriendlyId('transfer');

  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};

    const staffOpening = beneficiaryAccount.balance;
    const staffDebited = await Account.applyDelta(beneficiaryAccount._id, -amount, session);

    const companyOpening = companyAccount.balance;
    const companyCredited = await Account.applyDelta(companyAccount._id, amount, session);

    const staffTx = new Transaction({
      accountId: beneficiaryAccount._id,
      accountFriendlyId: beneficiaryAccount.accountId,
      userId: beneficiaryStaffId,
      type: TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.ADJUSTMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: staffOpening,
      closingBalance: staffDebited.balance,
      description: `Refund for failed withdrawal ${withdrawalFriendlyId}${reason ? ` — ${reason}` : ''}`,
      transferId: transferFriendlyId,
      withdrawalFriendlyId,
    });

    const companyTx = new Transaction({
      accountId: companyAccount._id,
      accountFriendlyId: companyAccount.accountId,
      beneficiaryId: beneficiaryStaffId,
      beneficiaryAccountId: beneficiaryAccount._id,
      beneficiaryAccountFriendlyId: beneficiaryAccount.accountId,
      type: TRANSACTION_TYPES.CREDIT,
      source: TRANSACTION_SOURCES.ADJUSTMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: companyOpening,
      closingBalance: companyCredited.balance,
      description: `Refund for failed withdrawal ${withdrawalFriendlyId}${reason ? ` — ${reason}` : ''}`,
      transferId: transferFriendlyId,
      withdrawalFriendlyId,
    });

    await staffTx.save(sessOpt);
    await companyTx.save(sessOpt);

    return {
      transferId: transferFriendlyId,
      companyAccount: companyCredited,
      staffAccount: staffDebited,
      companyTx,
      staffTx,
    };
  });
}

/**
 * Record an expense on a staff account. Debits the account and creates a
 * single EXPENSE transaction so the spend shows up on the account statement.
 *
 * Errors with `insufficient_funds` if the account balance is below `amount`.
 */
/**
 * Manual credit / debit on any account. Used by the admin to mirror an
 * external event (e.g. money manually removed from the Neero balance) or
 * to reconcile a virtual (book-keeping) account.
 *
 * Produces one ADJUSTMENT transaction in the direction requested.
 * `type` must be either 'credit' or 'debit'. On a debit, the applyDelta
 * guard rejects with `insufficient_funds` if the account balance is too low.
 */
export async function manualAdjustment({
  staffId,
  account,
  type, // 'credit' | 'debit'
  amount,
  description,
}) {
  const isCredit = type === 'credit';
  const isDebit = type === 'debit';
  if (!isCredit && !isDebit) {
    const err = new Error('validation_error');
    err.code = 'validation_error';
    throw err;
  }
  if (amount <= 0) {
    const err = new Error('validation_error');
    err.code = 'validation_error';
    throw err;
  }

  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};
    const opening = account.balance;
    const updated = await Account.applyDelta(account._id, isCredit ? amount : -amount, session);

    const tx = new Transaction({
      accountId: account._id,
      accountFriendlyId: account.accountId,
      userId: staffId,
      type: isCredit ? TRANSACTION_TYPES.CREDIT : TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.ADJUSTMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode: account.currencyCode,
      openingBalance: opening,
      closingBalance: updated.balance,
      description: description || (isCredit ? 'Manual credit' : 'Manual debit'),
    });
    await tx.save(sessOpt);
    return { account: updated, transaction: tx };
  });
}

export async function recordExpense({
  staffId,
  account,
  amount,
  currencyCode,
  description,
  expenseFriendlyId,
  occurredAt,
}) {
  return withSession(async (session) => {
    const sessOpt = session ? { session } : {};
    const opening = account.balance;
    const debited = await Account.applyDelta(account._id, -amount, session);
    const tx = new Transaction({
      accountId: account._id,
      accountFriendlyId: account.accountId,
      userId: staffId,
      type: TRANSACTION_TYPES.DEBIT,
      source: TRANSACTION_SOURCES.EXPENSE,
      amount,
      fee: 0,
      totalAmount: amount,
      currencyCode,
      openingBalance: opening,
      closingBalance: debited.balance,
      description: description || `Expense ${expenseFriendlyId}`,
    });
    if (occurredAt) {
      tx.createdAt = occurredAt;
      tx.updatedAt = occurredAt;
    }
    await tx.save(sessOpt);
    return { account: debited, transaction: tx };
  });
}

/**
 * Finalise un retrait admin après succès gateway uniquement.
 * La dépense de frais manager n'est créée que lorsque le paiement est confirmé.
 * - Avec frais (allocation manager) : enregistre la charge comme dépense ;
 *   le solde ERP manager reste à netAmount (crédit total − frais).
 * - Sans frais (legacy) : débite le staff du montant total (pass-through, net 0).
 */
export async function settleAdminWithdrawal({
  withdrawal,
  staffId,
  account,
}) {
  const feeAmount = Number(withdrawal.feeAmount) || 0;

  if (feeAmount > 0) {
    if (withdrawal.expenseFriendlyId) {
      return { alreadySettled: true };
    }

    const { Expense } = await import('../models/index.js');
    const description = `Frais de retrait — ${withdrawal.withdrawalId}`;
    const spentAt = new Date();

    const expense = await Expense.create({
      staffId,
      accountId: account._id,
      accountFriendlyId: account.accountId,
      amount: feeAmount,
      currencyCode: withdrawal.currencyCode || account.currencyCode,
      description,
      spentAt,
      categoryId: 'withdrawal_fee',
      categoryLabel: 'Frais de retrait',
      comment: withdrawal.netAmount
        ? `Allocation nette ${withdrawal.netAmount.toLocaleString()} ${withdrawal.currencyCode || 'XAF'}`
        : undefined,
    });

    const refreshed = await Account.findById(account._id);
    const { transaction } = await recordExpense({
      staffId,
      account: refreshed,
      amount: feeAmount,
      currencyCode: withdrawal.currencyCode || refreshed.currencyCode,
      description,
      expenseFriendlyId: expense.expenseId,
      occurredAt: spentAt,
    });

    expense.transactionFriendlyId = transaction.transactionId;
    await expense.save();

    withdrawal.expenseFriendlyId = expense.expenseId;
    await withdrawal.save();

    return { expense, transaction, mode: 'allocation' };
  }

  const refreshed = await Account.findById(account._id);
  const result = await debitForWithdrawal({
    staffId,
    account: refreshed,
    amount: withdrawal.amount,
    currencyCode: withdrawal.currencyCode || refreshed.currencyCode,
    withdrawalFriendlyId: withdrawal.withdrawalId,
    description: `Cash-out ${withdrawal.withdrawalId} settled`,
  });
  return { ...result, mode: 'passthrough' };
}

export default {
  creditCompanyForPayment,
  transfer,
  debitForWithdrawal,
  refundWithdrawal,
  debitCompanyCreditStaff,
  refundCompanyDebitStaff,
  recordExpense,
  settleAdminWithdrawal,
  manualAdjustment,
};
