import Joi from 'joi';
import bcrypt from 'bcrypt';

import { WithdrawalAccount, Withdrawal, Account } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { generateNumericOtp } from '../../utils/password.js';
import smsService from '../../services/sms.service.js';
import accounting from '../../services/accounting.service.js';
import gateways from '../../services/gateways/index.js';
import notifier from '../../services/notification.service.js';
import {
  ERROR_CODES,
  WITHDRAWAL_ACCOUNT_PROVIDERS,
  WITHDRAWAL_STATUSES,
  NOTIFICATION_EVENTS,
} from '../../config/index.js';

const OTP_TTL_MS = WithdrawalAccount.OTP_TTL_MINUTES * 60 * 1000;

// ----- Withdrawal accounts (mobile money) -----

const addSchema = Joi.object({
  provider: Joi.string().valid(...Object.values(WITHDRAWAL_ACCOUNT_PROVIDERS)).required(),
  phoneNumber: Joi.string().min(6).max(30).required(),
  holderName: Joi.string().allow('', null),
});

const addWithdrawalAccount = asyncHandler(async (req, res) => {
  const value = await addSchema.validateAsync(req.body);
  const otp = generateNumericOtp(6);
  const otpHash = await bcrypt.hash(otp, 10);

  const account = await WithdrawalAccount.create({
    staffId: req.staff._id,
    provider: value.provider,
    phoneNumber: value.phoneNumber,
    holderName: value.holderName,
    otpHash,
    otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    isVerified: false,
  });

  await smsService.sendOtp({ to: value.phoneNumber, otp });

  return ok(res, {
    withdrawalAccount: {
      withdrawalAccountId: account.withdrawalAccountId,
      provider: account.provider,
      phoneNumber: account.phoneNumber,
      isVerified: false,
    },
    message: req.$t('withdrawal_account_added'),
  });
});

const verifySchema = Joi.object({
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const verifyWithdrawalAccount = asyncHandler(async (req, res) => {
  const value = await verifySchema.validateAsync(req.body);
  const account = await WithdrawalAccount
    .findOne({ withdrawalAccountId: req.params.withdrawalAccountId, staffId: req.staff._id })
    .select('+otpHash');
  if (!account) return fail(res, req.$t('withdrawal_account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.isVerified) return ok(res, { message: req.$t('withdrawal_account_verified') });

  if (!account.otpExpiresAt || account.otpExpiresAt < new Date()) {
    return fail(res, req.$t('otp_expired'), ERROR_CODES.OTP_EXPIRED);
  }
  const valid = await bcrypt.compare(value.otp, account.otpHash || '');
  if (!valid) return fail(res, req.$t('otp_invalid'), ERROR_CODES.OTP_INVALID);

  account.isVerified = true;
  account.otpHash = undefined;
  account.otpExpiresAt = undefined;
  await account.save();
  return ok(res, { message: req.$t('withdrawal_account_verified') });
});

const resendOtp = asyncHandler(async (req, res) => {
  const account = await WithdrawalAccount
    .findOne({ withdrawalAccountId: req.params.withdrawalAccountId, staffId: req.staff._id });
  if (!account) return fail(res, req.$t('withdrawal_account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.isVerified) return ok(res, { message: req.$t('withdrawal_account_verified') });

  const otp = generateNumericOtp(6);
  account.otpHash = await bcrypt.hash(otp, 10);
  account.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  await account.save();
  await smsService.sendOtp({ to: account.phoneNumber, otp });
  return ok(res, { message: req.$t('withdrawal_account_added') });
});

const listWithdrawalAccounts = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await WithdrawalAccount.paginate(
    { staffId: req.staff._id, isActive: true },
    { page, limit, sort: '-createdAt' }
  );
  return ok(res, result);
});

// ----- Initiating a withdrawal -----

const withdrawSchema = Joi.object({
  withdrawalAccountId: Joi.string().required(), // friendly id
  amount: Joi.number().min(1).required(),
});

const initiateWithdrawal = asyncHandler(async (req, res) => {
  const value = await withdrawSchema.validateAsync(req.body);

  const wa = await WithdrawalAccount.findOne({
    withdrawalAccountId: value.withdrawalAccountId,
    staffId: req.staff._id,
  });
  if (!wa) return fail(res, req.$t('withdrawal_account_not_found'), ERROR_CODES.NOT_FOUND);
  if (!wa.isVerified) return fail(res, req.$t('withdrawal_account_not_verified'), ERROR_CODES.FORBIDDEN);

  const account = await Account.findByStaff(req.staff._id);
  if (!account) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (account.balance < value.amount) {
    return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
  }

  // Pre-create the Withdrawal record so we have a friendly id to debit against
  const withdrawal = await Withdrawal.create({
    staffId: req.staff._id,
    accountId: account._id,
    withdrawalAccountId: wa._id,
    amount: value.amount,
    currencyCode: account.currencyCode,
    provider: 'pending',
    status: WITHDRAWAL_STATUSES.PENDING,
  });

  // Debit the staff's balance up front — refunded on gateway failure
  await accounting.debitForWithdrawal({
    staffId: req.staff._id,
    account,
    amount: value.amount,
    currencyCode: account.currencyCode,
    withdrawalFriendlyId: withdrawal.withdrawalId,
    description: `Withdrawal to ${wa.provider} ${wa.phoneNumber}`,
  });

  // Call the active gateway (or the simulator outside production)
  try {
    const { adapter, result } = await gateways.initiateWithdrawalViaActive({
      amount: value.amount,
      currencyCode: account.currencyCode,
      phoneNumber: wa.phoneNumber,
      provider: wa.provider,
      mchTransactionRef: withdrawal.withdrawalId,
      simulateOutcome: req.headers['x-simulate-outcome'],
    });
    withdrawal.provider = adapter.name;
    withdrawal.gatewayReference = result.reference;
    withdrawal.gatewayType = result.type;
    withdrawal.gatewayPaymentRef = result.paymentRef;
    withdrawal.gatewayFees = result.fees;
    withdrawal.gatewayPayload = result.raw;

    // If the (simulated) adapter resolved synchronously to success, settle now.
    if (result.status === 'successful') {
      withdrawal.status = WITHDRAWAL_STATUSES.SUCCESSFUL;
      withdrawal.settledAt = new Date();
    }
    await withdrawal.save();
    return ok(res, { withdrawal, message: req.$t('withdrawal_initiated') });
  } catch (err) {
    // Refund the debit on failure
    const refreshed = await Account.findById(account._id);
    await accounting.refundWithdrawal({
      staffId: req.staff._id,
      account: refreshed,
      amount: value.amount,
      currencyCode: refreshed.currencyCode,
      withdrawalFriendlyId: withdrawal.withdrawalId,
      reason: err.detail ? JSON.stringify(err.detail) : err.message,
    });
    withdrawal.status = WITHDRAWAL_STATUSES.FAILED;
    withdrawal.failureReason = err.detail ? JSON.stringify(err.detail) : err.message;
    await withdrawal.save();
    await notifier.notify(NOTIFICATION_EVENTS.WITHDRAWAL_FAILED, {
      subject: `Withdrawal failed — ${withdrawal.withdrawalId}`,
      body: `Withdrawal failed during initiation.`,
      meta: { withdrawalId: withdrawal.withdrawalId, error: err.detail || err.message },
    });
    throw err; // let the global handler return gateway_error / gateway_unavailable
  }
});

export default {
  addWithdrawalAccount,
  verifyWithdrawalAccount,
  resendOtp,
  listWithdrawalAccounts,
  initiateWithdrawal,
};
