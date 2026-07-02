import Joi from 'joi';

import { Expense, Account } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import accounting from '../../services/accounting.service.js';
import { ERROR_CODES, STAFF_ROLES } from '../../config/index.js';

/**
 * Resolve the account the expense should be debited from. For non-admin
 * staff this is always their personal account (auto-created on first use,
 * mirroring /accounts/me). For admin, this is the default company account.
 */
async function resolveAccount(staff) {
  if (staff.role === STAFF_ROLES.ADMIN) {
    return Account.findDefaultCompany();
  }
  let account = await Account.findByStaff(staff._id);
  if (!account) {
    account = await Account.create({
      type: 'staff',
      name: `${staff.name}'s account`,
      ownerStaffId: staff._id,
      balance: 0,
    });
  }
  return account;
}

const createSchema = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  description: Joi.string().min(1).max(500).required(),
});

/**
 * Record an expense — debits the caller's account and creates a single
 * EXPENSE transaction so the spend is visible on the account statement.
 */
const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);

  const account = await resolveAccount(req.staff);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.balance < value.amount) {
    return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
  }

  // Pre-create so we have a friendly id to tie the ledger row to.
  const expense = await Expense.create({
    staffId: req.staff._id,
    accountId: account._id,
    accountFriendlyId: account.accountId,
    amount: value.amount,
    currencyCode: account.currencyCode,
    description: value.description,
  });

  const { transaction } = await accounting.recordExpense({
    staffId: req.staff._id,
    account,
    amount: value.amount,
    currencyCode: account.currencyCode,
    description: value.description,
    expenseFriendlyId: expense.expenseId,
  });

  expense.transactionFriendlyId = transaction.transactionId;
  await expense.save();

  return ok(res, { expense, transaction, message: req.$t('expense_recorded') });
});

/**
 * List expenses. Non-admin staff see only their own; admin sees all and can
 * filter by ?staffId= (friendly id), ?from / ?to.
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const filter = {};
  if (req.staff.role !== STAFF_ROLES.ADMIN) {
    filter.staffId = req.staff._id;
  } else if (req.query.staffId) {
    const { Staff } = await import('../../models/index.js');
    const s = await Staff.findOne({ staffId: req.query.staffId });
    if (s) filter.staffId = s._id;
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const result = await Expense.paginate(filter, {
    page, limit, sort: '-createdAt',
    populate: { path: 'staffId', select: 'staffId name email role' },
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findByFriendlyId(req.params.expenseId)
    .populate('staffId', 'staffId name email role');
  if (!expense) return fail(res, req.$t('expense_not_found'), ERROR_CODES.NOT_FOUND);
  // Non-admin staff can only see their own expenses
  if (req.staff.role !== STAFF_ROLES.ADMIN && !expense.staffId._id.equals(req.staff._id)) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }
  return ok(res, { expense });
});

export default { create, list, getOne };
