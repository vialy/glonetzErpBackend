import Joi from 'joi';

import { Account, Staff, Transaction } from '../../models/index.js';
import accounting from '../../services/accounting.service.js';
import gateways from '../../services/gateways/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, PAYMENT_PROVIDERS, STAFF_ROLES } from '../../config/index.js';
import config from '../../config/index.js';

/**
 * GET /staff/accounts/me
 *
 * For admins this resolves to the default company account (the "main"
 * account). For everyone else, the staff's personal account is returned
 * (created on first access).
 */
const myAccount = asyncHandler(async (req, res) => {
  if (req.staff.role === STAFF_ROLES.ADMIN) {
    const account = await Account.findDefaultCompany();
    return ok(res, { account });
  }
  let account = await Account.findByStaff(req.staff._id);
  if (!account) {
    account = await Account.create({
      type: 'staff',
      name: `${req.staff.name}'s account`,
      ownerStaffId: req.staff._id,
      balance: 0,
    });
  }
  return ok(res, { account });
});

async function paginateAccountStatement(account, { from, to, page, limit }) {
  const filter = { accountId: account._id };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  return Transaction.paginate(filter, { page, limit, sort: '-createdAt' });
}

const statement = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = readPagination(req);
  let account;
  if (req.staff.role === STAFF_ROLES.ADMIN) {
    account = await Account.findDefaultCompany();
  } else {
    account = await Account.findByStaff(req.staff._id);
  }
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  const result = await paginateAccountStatement(account, { from, to, page, limit });
  return ok(res, { account, ...result });
});

/**
 * GET /staff/accounts/:accountId/statement
 *
 * Admin-only statement for a specific company or virtual account.
 * Used by the treasury wallets screen to show history per wallet.
 */
const statementByAccount = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = readPagination(req);
  const account = await Account.findByFriendlyId(req.params.accountId);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.type === 'staff') {
    return fail(res, req.$t('account_not_adjustable'), ERROR_CODES.FORBIDDEN);
  }
  const result = await paginateAccountStatement(account, { from, to, page, limit });
  return ok(res, { account, ...result });
});

/**
 * Admin-only totals dashboard.
 *
 * One aggregation query groups every active account by `type` and returns
 * the sum of balances per group. Three rolled-up figures matter to the
 * proprietor:
 *
 *   - companyBalance      — the system account (type: 'company') only.
 *   - operationalBalance  — company + staff (funds we could actively move
 *                            through: sitting in Neero or already in a
 *                            manager's balance).
 *   - totalBalance        — company + staff + virtual (everything under
 *                            book-keeping, including bank / cash / wallet
 *                            virtual accounts).
 *
 * `perType` exposes the raw group values so the frontend can render a
 * breakdown without another round-trip.
 */
const totals = asyncHandler(async (req, res) => {
  const agg = await Account.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$type', total: { $sum: '$balance' }, count: { $sum: 1 } } },
  ]);

  const perType = { company: 0, staff: 0, virtual: 0 };
  const counts = { company: 0, staff: 0, virtual: 0 };
  for (const row of agg) {
    if (perType[row._id] !== undefined) {
      perType[row._id] = row.total;
      counts[row._id] = row.count;
    }
  }

  const companyBalance = perType.company;
  const operationalBalance = perType.company + perType.staff;
  const totalBalance = perType.company + perType.staff + perType.virtual;

  return ok(res, {
    companyBalance,
    operationalBalance,
    totalBalance,
    perType,
    counts,
  });
});

/**
 * GET /staff/accounts/neero-balance
 *
 * Admin-only live balance from the Neero merchant account (where learner
 * payments land) compared to the internal company ledger balance.
 */
const neeroBalance = asyncHandler(async (req, res) => {
  const company = await Account.findDefaultCompany();
  const ledgerBalance = company?.balance ?? 0;
  const currencyCode = company?.currencyCode ?? 'XAF';
  const fetchedAt = new Date().toISOString();
  const basePayload = {
    ledgerBalance,
    currencyCode,
    fetchedAt,
    account: company
      ? { accountId: company.accountId, name: company.name, type: company.type }
      : null,
  };

  const { merchantPmId, secretKey } = config.gateways.neero;
  if (!merchantPmId) {
    return ok(res, {
      ...basePayload,
      neeroBalance: null,
      gap: null,
      source: 'ledger_only',
      available: false,
      message: req.$t('neero_merchant_not_configured'),
    });
  }

  if (!config.isProduction && !secretKey) {
    return ok(res, {
      ...basePayload,
      neeroBalance: ledgerBalance,
      gap: 0,
      source: 'simulated',
      available: true,
      paymentMethodId: merchantPmId,
      message: req.$t('neero_balance_simulated'),
    });
  }

  const neeroAdapter = gateways.getByName(PAYMENT_PROVIDERS.NEERO);
  if (!neeroAdapter?.getMerchantBalance) {
    return fail(res, req.$t('gateway_unavailable'), ERROR_CODES.GATEWAY_UNAVAILABLE, {
      ...basePayload,
      neeroBalance: null,
      gap: null,
      source: 'error',
      available: false,
    });
  }

  const result = await neeroAdapter.getMerchantBalance({ paymentMethodId: merchantPmId });
  if (!result.ok) {
    return fail(res, req.$t('gateway_error'), ERROR_CODES.GATEWAY_ERROR, {
      ...basePayload,
      neeroBalance: null,
      gap: null,
      source: 'error',
      available: false,
      paymentMethodId: merchantPmId,
      detail: result.error,
    });
  }

  const liveBalance = result.balance;
  return ok(res, {
    ...basePayload,
    neeroBalance: liveBalance,
    gap: liveBalance - ledgerBalance,
    source: 'neero',
    available: true,
    paymentMethodId: result.paymentMethodId,
  });
});

/** Admin-only — list every account (company + staff + virtual). */
const listAll = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await Account.paginate({}, {
    page,
    limit,
    sort: '-createdAt',
    populate: { path: 'ownerStaffId', select: 'staffId name email role' },
  });
  return ok(res, result);
});

const transferSchema = Joi.object({
  beneficiaryStaffId: Joi.string().required(), // friendly staff id
  amount: Joi.number().min(1).required(),
  fee: Joi.number().min(0).default(0),
  description: Joi.string().allow('', null),
});

/**
 * POST /staff/accounts/transfer
 *
 * Any staff can transfer from THEIR account to another staff's account.
 * For admins, the initiating account is the default company account
 * (using the ids cached in config.defaults) — this matches the spec where
 * admin transfers always come from the main account.
 *
 * Total deducted from initiator = amount + fee.
 * Total credited to beneficiary = amount + fee.
 */
const transfer = asyncHandler(async (req, res) => {
  const value = await transferSchema.validateAsync(req.body);

  const beneficiaryStaff = await Staff.findOne({ staffId: value.beneficiaryStaffId });
  if (!beneficiaryStaff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  if (beneficiaryStaff._id.equals(req.staff._id)) {
    return fail(res, req.$t('cannot_modify_self'), ERROR_CODES.VALIDATION);
  }

  // Beneficiary account — auto-create if missing
  let beneficiaryAccount = await Account.findByStaff(beneficiaryStaff._id);
  if (!beneficiaryAccount) {
    if (beneficiaryStaff.role === STAFF_ROLES.ADMIN) {
      beneficiaryAccount = await Account.findDefaultCompany();
    } else {
      beneficiaryAccount = await Account.create({
        type: 'staff',
        name: `${beneficiaryStaff.name}'s account`,
        ownerStaffId: beneficiaryStaff._id,
        balance: 0,
      });
    }
  }

  // Initiator account
  let initiatorAccount;
  let initiatorStaffId;
  if (req.staff.role === STAFF_ROLES.ADMIN) {
    initiatorAccount = await Account.findDefaultCompany();
    initiatorStaffId = req.staff._id; // logged-in admin, but the account is the company's
  } else {
    initiatorAccount = await Account.findByStaff(req.staff._id);
    if (!initiatorAccount) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
    initiatorStaffId = req.staff._id;
  }
  if (!initiatorAccount) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);

  const result = await accounting.transfer({
    initiatorStaffId,
    initiatorAccount,
    beneficiaryStaffId: beneficiaryStaff._id,
    beneficiaryAccount,
    amount: value.amount,
    fee: value.fee,
    currencyCode: initiatorAccount.currencyCode,
    description: value.description,
  });

  if (req.staff.role === STAFF_ROLES.ADMIN) {
    const total = value.amount + (value.fee || 0);
    const allocationLabel =
      value.description?.trim() || `Transfert manager — ${beneficiaryStaff.name}`;
    await accounting.createExpenseForLedgerDebit({
      staffId: req.staff._id,
      account: initiatorAccount,
      amount: total,
      currencyCode: initiatorAccount.currencyCode,
      description: allocationLabel,
      spentAt: new Date(),
      categoryId: 'manager_allocation',
      categoryLabel: 'Allocation manager',
      comment: `Manager: ${beneficiaryStaff.name} (${beneficiaryStaff.staffId})`,
      transactionFriendlyId: result.payerTransaction.transactionId,
      transferId: result.transferId,
    });
  }

  return ok(res, { ...result, message: req.$t('transfer_completed') });
});

const treasuryTransferSchema = Joi.object({
  fromAccountId: Joi.string().required(),
  toAccountId: Joi.string().required(),
  amount: Joi.number().min(1).required(),
  description: Joi.string().min(1).max(500).required(),
});

/**
 * POST /staff/accounts/treasury-transfer
 *
 * Admin-only paired transfer between company and virtual treasury accounts.
 */
const treasuryTransfer = asyncHandler(async (req, res) => {
  const value = await treasuryTransferSchema.validateAsync(req.body);
  if (value.fromAccountId === value.toAccountId) {
    return fail(res, req.$t('treasury_transfer_same_account'), ERROR_CODES.VALIDATION);
  }

  const fromAccount = await Account.findByFriendlyId(value.fromAccountId);
  const toAccount = await Account.findByFriendlyId(value.toAccountId);
  if (!fromAccount || !toAccount) {
    return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  }
  for (const account of [fromAccount, toAccount]) {
    if (account.type === 'staff') {
      return fail(res, req.$t('account_not_adjustable'), ERROR_CODES.FORBIDDEN);
    }
    if (!account.isActive) {
      return fail(res, req.$t('account_inactive'), ERROR_CODES.FORBIDDEN);
    }
  }
  if (fromAccount.currencyCode !== toAccount.currencyCode) {
    return fail(res, req.$t('treasury_transfer_currency_mismatch'), ERROR_CODES.VALIDATION);
  }

  try {
    const result = await accounting.treasuryTransfer({
      staffId: req.staff._id,
      fromAccount,
      toAccount,
      amount: value.amount,
      description: value.description.trim(),
    });
    return ok(res, { ...result, message: req.$t('treasury_transfer_completed') });
  } catch (err) {
    if (err.code === 'insufficient_funds') {
      return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
    }
    throw err;
  }
});

// ===== Virtual accounts (admin book-keeping) =====

/**
 * A virtual account is a pure book-keeping ledger — banks, personal wallets,
 * cash boxes, etc. Only admin can create / modify these; every staff member
 * can list them (they're part of the company's overall funds view).
 *
 * Balance changes flow through the standard adjust endpoint below, which
 * writes an ADJUSTMENT transaction to the account's statement.
 */
const virtualCreateSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  description: Joi.string().allow('', null).max(500),
  logoUrl: Joi.string().uri().allow('', null),
  currencyCode: Joi.string().length(3).uppercase(),
  balance: Joi.number().min(0).default(0),
});

const createVirtual = asyncHandler(async (req, res) => {
  const value = await virtualCreateSchema.validateAsync(req.body);
  const account = await Account.create({
    type: 'virtual',
    name: value.name,
    description: value.description || undefined,
    logoUrl: value.logoUrl || undefined,
    currencyCode: value.currencyCode || undefined,
    balance: value.balance,
    createdByStaffId: req.staff._id,
    isActive: true,
  });
  return ok(res, { account, message: req.$t('virtual_account_created') });
});

const virtualUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(120),
  description: Joi.string().allow('', null).max(500),
  logoUrl: Joi.string().uri().allow('', null),
  isActive: Joi.boolean(),
}).min(1);

const updateVirtual = asyncHandler(async (req, res) => {
  const value = await virtualUpdateSchema.validateAsync(req.body);
  const account = await Account.findByFriendlyId(req.params.accountId);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.type !== 'virtual') {
    return fail(res, req.$t('account_not_editable'), ERROR_CODES.FORBIDDEN);
  }
  Object.assign(account, value);
  await account.save();
  return ok(res, { account, message: req.$t('virtual_account_updated') });
});

const getOne = asyncHandler(async (req, res) => {
  const account = await Account.findByFriendlyId(req.params.accountId)
    .populate('ownerStaffId', 'staffId name email role');
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { account });
});

// ===== Manual credit / debit (admin) =====

/**
 * POST /staff/accounts/:accountId/adjust
 *
 * Admin-only manual credit or debit on any account (company or virtual).
 * Used to mirror external events — e.g. when money is manually withdrawn
 * from the Neero merchant balance, the admin logs a debit here so the
 * internal ledger stays in sync.
 *
 * Body: { type: 'credit' | 'debit', amount, description }.
 * A single ADJUSTMENT transaction is written to the account's statement.
 */
const adjustSchema = Joi.object({
  type: Joi.string().valid('credit', 'debit').required(),
  amount: Joi.number().min(1).required(),
  description: Joi.string().min(1).max(500).required(),
});

const adjust = asyncHandler(async (req, res) => {
  const value = await adjustSchema.validateAsync(req.body);
  const account = await Account.findByFriendlyId(req.params.accountId);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  // Only allow adjustments on company + virtual accounts; staff accounts
  // are managed via transfer/withdrawal/expense flows.
  if (account.type === 'staff') {
    return fail(res, req.$t('account_not_adjustable'), ERROR_CODES.FORBIDDEN);
  }
  try {
    const { account: updated, transaction } = await accounting.manualAdjustment({
      staffId: req.staff._id,
      account,
      type: value.type,
      amount: value.amount,
      description: value.description,
    });
    return ok(res, { account: updated, transaction, message: req.$t('adjustment_recorded') });
  } catch (err) {
    if (err.code === 'insufficient_funds') {
      return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
    }
    throw err;
  }
});

export default {
  myAccount,
  statement,
  statementByAccount,
  totals,
  neeroBalance,
  listAll,
  transfer,
  treasuryTransfer,
  createVirtual,
  updateVirtual,
  getOne,
  adjust,
};
