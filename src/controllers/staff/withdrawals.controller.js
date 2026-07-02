import Joi from 'joi';
import bcrypt from 'bcrypt';

import { WithdrawalAccount, Withdrawal, Account, Staff } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { generateNumericOtp } from '../../utils/password.js';
import smsService from '../../services/sms.service.js';
import accounting from '../../services/accounting.service.js';
import gateways from '../../services/gateways/index.js';
import notifier from '../../services/notification.service.js';
import { fireAndForget } from '../../utils/fireAndForget.js';
import config, {
  ERROR_CODES,
  WITHDRAWAL_ACCOUNT_PROVIDERS,
  WITHDRAWAL_PROVIDERS_REQUIRING_OTP,
  WITHDRAWAL_LIMITS,
  WITHDRAWAL_STATUSES,
  NOTIFICATION_EVENTS,
  STAFF_ROLES,
} from '../../config/index.js';

const OTP_TTL_MS = WithdrawalAccount.OTP_TTL_MINUTES * 60 * 1000;

// ===== Withdrawal accounts (mobile money + neero) =====

/**
 * `phoneNumber` is required for every provider — for mtn/orange it's the
 * MoMo wallet, for neero it's the phone tied to the personal Neero account.
 * OTP is issued only for mtn/orange; neero accounts are trusted on creation.
 */
const addSchema = Joi.object({
  provider: Joi.string().valid(...Object.values(WITHDRAWAL_ACCOUNT_PROVIDERS)).required(),
  phoneNumber: Joi.string().min(6).max(30).required(),
  holderName: Joi.string().allow('', null),
});

/**
 * Add a withdrawal account.
 *
 * Before persisting, we warm the NeeroPaymentMethod cache so the destination
 * payment-method id exists before any actual payout. On cache miss the
 * adapter calls Neero's POST /api/v1/payment-methods (with the right body
 * shape per provider — see neero.js `resolvePaymentMethodId`) and persists
 * the returned id. If Neero rejects we abort and do NOT create the WDA —
 * better to fail loudly here than at withdrawal-time. Outside production
 * the real Neero call is skipped (the simulator handles payouts).
 *
 * Body shapes sent to Neero on cache miss:
 *   - mtn/orange : { type: 'MOBILE_MONEY',  mobileMoneyDetails: {...} }
 *   - neero      : { type: 'NEERO_PERSON',  personDetailsWithPhoneNumber: {
 *                       countryCode: 'CM', phoneNumber } }
 */
const addWithdrawalAccount = asyncHandler(async (req, res) => {
  const value = await addSchema.validateAsync(req.body);
  const requiresOtp = WITHDRAWAL_PROVIDERS_REQUIRING_OTP.includes(value.provider);

  if (config.isProduction) {
    const neeroAdapter = gateways.getByName('neero');
    if (!neeroAdapter || typeof neeroAdapter.resolvePaymentMethodId !== 'function') {
      return fail(res, req.$t('gateway_unavailable'), ERROR_CODES.GATEWAY_UNAVAILABLE);
    }
    const pm = await neeroAdapter.resolvePaymentMethodId({
      provider: value.provider,
      phoneNumber: value.phoneNumber,
    });
    if (!pm.ok) {
      await notifier.notify(NOTIFICATION_EVENTS.GATEWAY_ERROR, {
        subject: 'Failed to create Neero payment method',
        body: `Could not register a ${value.provider} destination on Neero for ${req.staff.staffId}.`,
        meta: { provider: value.provider, error: pm.error },
      });
      return fail(res, req.$t('gateway_error'), ERROR_CODES.GATEWAY_ERROR);
    }
  }

  const fields = {
    staffId: req.staff._id,
    provider: value.provider,
    phoneNumber: value.phoneNumber,
    holderName: value.holderName,
  };

  if (requiresOtp) {
    const otp = generateNumericOtp(6);
    fields.otpHash = await bcrypt.hash(otp, 10);
    fields.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    fields.isVerified = false;

    // console.log(`Sending OTP ${otp} to ${value.phoneNumber} for staff ${req.staff.staffId}`);

    const account = await WithdrawalAccount.create(fields);
    fireAndForget(smsService.sendOtp({ to: value.phoneNumber, otp }), 'sms:wda-otp');
    return ok(res, {
      withdrawalAccount: account.toObject({ virtuals: true }),
      message: req.$t('withdrawal_account_added'),
    });
  }

  // Neero account — no OTP, trusted on creation.
  fields.isVerified = true;
  const account = await WithdrawalAccount.create(fields);
  return ok(res, {
    withdrawalAccount: account.toObject({ virtuals: true }),
    message: req.$t('withdrawal_account_added_neero'),
  });
});

// ===== Pre-add verify for Neero accounts =====

/**
 * POST /staff/withdrawal-accounts/verify-neero
 *
 * A cheap "does this Neero account exist?" probe used by the frontend
 * BEFORE the staff commits to adding the account. Neero personal accounts
 * skip OTP, so this replaces the confirmation loop MTN/Orange get via SMS.
 *
 * Body: { phoneNumber } — full number, incl. country code (e.g. +237677123456).
 *
 * Behavior:
 *   1. Strip the country dial-code — Neero expects the local number.
 *   2. Call Neero's `/api/v1/payment-methods` with `type: NEERO_PERSON`.
 *      (Goes through the local cache, so a repeated verify is free.)
 *   3. Return only `{ id, shortInfo, phoneNumber }` to the frontend. Neero
 *      doesn't echo the phone number back, so we add it in for display.
 *
 * NO WithdrawalAccount is persisted here — that happens in the follow-up
 * POST /withdrawal-accounts request.
 */
const verifyNeeroSchema = Joi.object({
  phoneNumber: Joi.string().min(6).max(30).required(),
});

const verifyNeeroAccount = asyncHandler(async (req, res) => {
  const value = await verifyNeeroSchema.validateAsync(req.body);

  if (!config.isProduction) {
    // Outside production we don't reach Neero — the simulator handles real
    // payouts, so we can't verify an account either. Return a stubbed
    // response the frontend can key off during development.
    return ok(res, {
      neeroAccount: {
        id: 'dev-stub-neero-id',
        shortInfo: 'DEV STUB',
        phoneNumber: value.phoneNumber,
      },
      message: req.$t('neero_account_verified'),
      dev: true,
    });
  }

  const neeroAdapter = gateways.getByName('neero');
  if (!neeroAdapter || typeof neeroAdapter.resolvePaymentMethodId !== 'function') {
    return fail(res, req.$t('gateway_unavailable'), ERROR_CODES.GATEWAY_UNAVAILABLE);
  }
  const pm = await neeroAdapter.resolvePaymentMethodId({
    provider: 'neero',
    phoneNumber: value.phoneNumber,
  });
  if (!pm.ok) {
    return fail(
      res,
      req.$t('neero_account_verify_failed'),
      ERROR_CODES.GATEWAY_ERROR
    );
  }
  return ok(res, {
    neeroAccount: {
      id: pm.paymentMethodId,
      shortInfo: pm.shortInfo,
      phoneNumber: value.phoneNumber,
    },
    message: req.$t('neero_account_verified'),
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
  if (!WITHDRAWAL_PROVIDERS_REQUIRING_OTP.includes(account.provider)) {
    return fail(res, req.$t('withdrawal_account_otp_not_applicable'), ERROR_CODES.VALIDATION);
  }
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
  if (!WITHDRAWAL_PROVIDERS_REQUIRING_OTP.includes(account.provider)) {
    return fail(res, req.$t('withdrawal_account_otp_not_applicable'), ERROR_CODES.VALIDATION);
  }
  if (account.isVerified) return ok(res, { message: req.$t('withdrawal_account_verified') });

  const otp = generateNumericOtp(6);

  // console.log(`Resending OTP ${otp} to ${account.phoneNumber} for staff ${req.staff.staffId}`);

  account.otpHash = await bcrypt.hash(otp, 10);
  account.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  await account.save();
  fireAndForget(smsService.sendOtp({ to: account.phoneNumber, otp }), 'sms:wda-otp-resend');
  return ok(res, { message: req.$t('withdrawal_account_added') });
});

/**
 * List withdrawal accounts.
 *
 *  - Non-admin staff always see only their own (the `?staffId` filter is
 *    ignored to prevent leaking other staff's accounts).
 *  - Admin sees every withdrawal account. The `?staffId=STF-XXXXXXXX`
 *    friendly-id filter narrows the listing to a specific staff member.
 */
const listWithdrawalAccounts = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const filter = { isActive: true };

  if (req.staff.role === STAFF_ROLES.ADMIN) {
    if (req.query.staffId) {
      const target = await Staff.findOne({ staffId: req.query.staffId });
      if (!target) {
        // Friendly id didn't resolve — return an empty page rather than 404,
        // so the admin UI can keep its filter UX consistent.
        return ok(res, {
          docs: [], totalDocs: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false,
        });
      }
      filter.staffId = target._id;
    }
  } else {
    filter.staffId = req.staff._id;
  }

  const result = await WithdrawalAccount.paginate(filter, {
    page, limit, sort: '-createdAt',
    populate: { path: 'staffId', select: 'staffId name email role' },
  });
  return ok(res, result);
});

/**
 * Admin convenience — list a specific staff's withdrawal accounts so the
 * admin can pick one when initiating a withdrawal on their behalf.
 */
const listForStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findOne({ staffId: req.params.staffId });
  if (!staff) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  const { page, limit } = readPagination(req);
  const result = await WithdrawalAccount.paginate(
    { staffId: staff._id, isActive: true },
    { page, limit, sort: '-createdAt' }
  );
  return ok(res, result);
});

// ===== Initiating a withdrawal (admin only) =====

/**
 * Admin-only payout flow. Three ledger movements happen up front in a single
 * Mongo transaction:
 *
 *   1. Debit the company (default) account by `amount`.
 *   2. Credit the beneficiary staff's account by `amount`.
 *   3. Create the Withdrawal record (status PENDING).
 *
 * Then we call the gateway to actually move the money to the staff's
 * mobile-money / neero account. If the gateway succeeds the staff balance
 * is debited again by the same `amount` so the staff's net effect is zero
 * (the money flowed through them — it's recorded for traceability per the
 * proprietor's request). If the gateway fails, `refundCompanyDebitStaff`
 * reverses steps 1 + 2.
 *
 * Limits per provider (config/WITHDRAWAL_LIMITS): MTN 500k, Orange 400k,
 * Neero unlimited. Reject before touching the ledger if exceeded.
 */
const withdrawSchema = Joi.object({
  beneficiaryStaffId: Joi.string().required(), // friendly staff id
  withdrawalAccountId: Joi.string().required(), // friendly id of the staff's WDA
  amount: Joi.number().integer().min(1).required(),
  description: Joi.string().allow('', null),
});

const initiateWithdrawal = asyncHandler(async (req, res) => {
  const value = await withdrawSchema.validateAsync(req.body);

  const beneficiary = await Staff.findOne({ staffId: value.beneficiaryStaffId });
  if (!beneficiary) return fail(res, req.$t('staff_not_found'), ERROR_CODES.NOT_FOUND);
  if (beneficiary.role === STAFF_ROLES.ADMIN) {
    return fail(res, req.$t('admin_cannot_withdraw'), ERROR_CODES.FORBIDDEN);
  }
  if (!beneficiary.isActive) {
    return fail(res, req.$t('account_disabled'), ERROR_CODES.ACCOUNT_DISABLED);
  }

  const wa = await WithdrawalAccount.findOne({
    withdrawalAccountId: value.withdrawalAccountId,
    staffId: beneficiary._id,
  });
  if (!wa) return fail(res, req.$t('withdrawal_account_not_found'), ERROR_CODES.NOT_FOUND);
  if (!wa.isVerified) return fail(res, req.$t('withdrawal_account_not_verified'), ERROR_CODES.FORBIDDEN);

  // Provider-specific cap (0 means unlimited)
  const cap = WITHDRAWAL_LIMITS[wa.provider] || 0;
  if (cap > 0 && value.amount > cap) {
    return fail(
      res,
      `${req.$t('withdrawal_exceeds_limit')} (${cap.toLocaleString()} ${value.amount})`,
      ERROR_CODES.VALIDATION
    );
  }

  // Resolve the two accounts involved
  const companyAccount = await Account.findDefaultCompany();
  if (!companyAccount) return fail(res, req.$t('account_not_found'), ERROR_CODES.NOT_FOUND);
  if (companyAccount.balance < value.amount) {
    return fail(res, req.$t('insufficient_funds'), ERROR_CODES.INSUFFICIENT_FUNDS);
  }

  let beneficiaryAccount = await Account.findByStaff(beneficiary._id);
  if (!beneficiaryAccount) {
    beneficiaryAccount = await Account.create({
      type: 'staff',
      name: `${beneficiary.name}'s account`,
      ownerStaffId: beneficiary._id,
      balance: 0,
    });
  }

  // Pre-create the Withdrawal so we have a friendly id for the gateway ref
  const withdrawal = await Withdrawal.create({
    staffId: beneficiary._id,
    accountId: beneficiaryAccount._id,
    withdrawalAccountId: wa._id,
    amount: value.amount,
    currencyCode: companyAccount.currencyCode,
    provider: 'pending',
    status: WITHDRAWAL_STATUSES.PENDING,
  });

  // Step 1 + 2 — atomic ledger move (company → staff). Step "3" of the
  // proprietor's spec — debit the staff back to net zero — happens after
  // the gateway confirms success (so the staff visibly retains the credit
  // until the cash leaves the merchant balance).
  await accounting.debitCompanyCreditStaff({
    companyAccount,
    beneficiaryStaffId: beneficiary._id,
    beneficiaryAccount,
    amount: value.amount,
    currencyCode: companyAccount.currencyCode,
    description: value.description || `Withdrawal ${withdrawal.withdrawalId} → ${wa.provider}`,
    withdrawalFriendlyId: withdrawal.withdrawalId,
  });

  // Step 3 — fire the actual cash-out via the active gateway
  try {
    const { adapter, result } = await gateways.initiateWithdrawalViaActive({
      amount: value.amount,
      currencyCode: companyAccount.currencyCode,
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

    if (result.status === 'successful') {
      withdrawal.status = WITHDRAWAL_STATUSES.SUCCESSFUL;
      withdrawal.settledAt = new Date();
      // Debit the staff so the credit + debit net to zero on their statement.
      const refreshed = await Account.findById(beneficiaryAccount._id);
      await accounting.debitForWithdrawal({
        staffId: beneficiary._id,
        account: refreshed,
        amount: value.amount,
        currencyCode: refreshed.currencyCode,
        withdrawalFriendlyId: withdrawal.withdrawalId,
        description: `Cash-out ${withdrawal.withdrawalId} settled`,
      });
    }
    await withdrawal.save();
    return ok(res, { withdrawal, message: req.$t('withdrawal_initiated') });
  } catch (err) {
    // Gateway failed → reverse the staff credit AND the company debit.
    const refreshedCompany = await Account.findById(companyAccount._id);
    const refreshedStaff = await Account.findById(beneficiaryAccount._id);
    await accounting.refundCompanyDebitStaff({
      companyAccount: refreshedCompany,
      beneficiaryStaffId: beneficiary._id,
      beneficiaryAccount: refreshedStaff,
      amount: value.amount,
      currencyCode: refreshedCompany.currencyCode,
      withdrawalFriendlyId: withdrawal.withdrawalId,
      reason: err.detail ? JSON.stringify(err.detail) : err.message,
    });
    withdrawal.status = WITHDRAWAL_STATUSES.FAILED;
    withdrawal.failureReason = err.detail ? JSON.stringify(err.detail) : err.message;
    await withdrawal.save();
    notifier.notify(NOTIFICATION_EVENTS.WITHDRAWAL_FAILED, {
      subject: `Withdrawal failed — ${withdrawal.withdrawalId}`,
      body: 'Withdrawal failed during initiation. Company and staff balances were restored.',
      meta: { withdrawalId: withdrawal.withdrawalId, error: err.detail || err.message },
    });
    throw err;
  }
});

export default {
  addWithdrawalAccount,
  verifyNeeroAccount,
  verifyWithdrawalAccount,
  resendOtp,
  listWithdrawalAccounts,
  listForStaff,
  initiateWithdrawal,
};
