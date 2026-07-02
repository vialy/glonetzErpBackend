import Joi from 'joi';

import { Expense, Account } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import accounting from '../../services/accounting.service.js';
import { publicUrlFor } from '../../middlewares/upload.js';
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

function buildDescription(value) {
  if (value.description?.trim()) return value.description.trim();
  const parts = [];
  if (value.categoryLabel?.trim()) parts.push(value.categoryLabel.trim());
  if (value.comment?.trim()) parts.push(value.comment.trim());
  return parts.join(' — ') || 'Dépense';
}

function parseSpentAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('validation_error');
    err.code = 'validation_error';
    throw err;
  }
  return date;
}

const createSchema = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  spentAt: Joi.alternatives().try(Joi.date(), Joi.string()).required(),
  description: Joi.string().max(500).allow('', null),
  categoryId: Joi.string().max(80).allow('', null),
  categoryLabel: Joi.string().max(200).allow('', null),
  comment: Joi.string().max(1000).allow('', null),
}).custom((value, helpers) => {
  if (!value.description?.trim() && !value.categoryLabel?.trim()) {
    return helpers.error('any.custom', { message: 'description_or_category_required' });
  }
  return value;
});

/**
 * Record an expense — debits the caller's account and creates a single
 * EXPENSE transaction so the spend is visible on the account statement.
 */
const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);
  const spentAt = parseSpentAt(value.spentAt);
  const description = buildDescription(value);

  const account = await resolveAccount(req.staff);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.balance < value.amount) {
    return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
  }

  const expensePayload = {
    staffId: req.staff._id,
    accountId: account._id,
    accountFriendlyId: account.accountId,
    amount: value.amount,
    currencyCode: account.currencyCode,
    description,
    spentAt,
    categoryId: value.categoryId?.trim() || undefined,
    categoryLabel: value.categoryLabel?.trim() || undefined,
    comment: value.comment?.trim() || undefined,
  };
  if (req.file) {
    expensePayload.proofUrl = publicUrlFor(req.file.filename);
    expensePayload.proofFileName = req.file.originalname?.trim() || undefined;
  }

  const expense = await Expense.create(expensePayload);

  const { transaction } = await accounting.recordExpense({
    staffId: req.staff._id,
    account,
    amount: value.amount,
    currencyCode: account.currencyCode,
    description,
    expenseFriendlyId: expense.expenseId,
    occurredAt: spentAt,
  });

  expense.transactionFriendlyId = transaction.transactionId;
  await expense.save();

  return ok(res, { expense, transaction, message: req.$t('expense_recorded') });
});

function buildDateRangeFilter(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    if (String(to).length <= 10) {
      end.setHours(23, 59, 59, 999);
    }
    range.$lte = end;
  }
  return range;
}

/**
 * List expenses. Non-admin staff see only their own; admin sees all and can
 * filter by ?staffId= (friendly id), ?from / ?to (on spentAt).
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
    const range = buildDateRangeFilter(req.query.from, req.query.to);
    filter.$or = [
      { spentAt: range },
      { spentAt: { $exists: false }, createdAt: range },
    ];
  }
  const result = await Expense.paginate(filter, {
    page, limit, sort: { spentAt: -1, createdAt: -1 },
    populate: { path: 'staffId', select: 'staffId name email role' },
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findByFriendlyId(req.params.expenseId)
    .populate('staffId', 'staffId name email role');
  if (!expense) return fail(res, req.$t('expense_not_found'), ERROR_CODES.NOT_FOUND);
  if (req.staff.role !== STAFF_ROLES.ADMIN && !expense.staffId._id.equals(req.staff._id)) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }
  return ok(res, { expense });
});

export default { create, list, getOne };
