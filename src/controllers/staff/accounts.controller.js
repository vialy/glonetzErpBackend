import Joi from 'joi';

import { Account, Staff, Transaction } from '../../models/index.js';
import accounting from '../../services/accounting.service.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, STAFF_ROLES } from '../../config/index.js';

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
  const filter = { accountId: account._id };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const result = await Transaction.paginate(filter, { page, limit, sort: '-createdAt' });
  return ok(res, { account, ...result });
});

/** Admin-only — list every account (company + staff). */
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

  return ok(res, { ...result, message: req.$t('transfer_completed') });
});

export default { myAccount, statement, listAll, transfer };
