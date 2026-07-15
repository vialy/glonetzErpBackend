import axios from 'axios';
import config from '../../config/index.js';

/**
 * Neero payment gateway adapter.
 *
 * Auth: HTTP Basic where username = NEERO_SECRET_KEY, password is empty.
 *
 * Flow we implement (from the Neero Postman collection):
 *
 *   Cash-In (user pays a class fee):
 *     1. Check NeeroPaymentMethod cache for existing paymentMethodId.
 *        If not cached → POST /api/v1/payment-methods → cache the result.
 *     2. POST /api/v1/transaction-intents/cash-in
 *          body: { amount, currencyCode, paymentType: "MERCHANT_COLLECTION",
 *                  sourcePaymentMethodId, destinationPaymentMethodId (env merchant id),
 *                  externalTransactionId, confirm: true }
 *
 *   Cash-Out (manager withdrawal):
 *     1. Check NeeroPaymentMethod cache → same flow.
 *     2. POST /api/v1/transaction-intents/cash-out
 *          body: { amount, currencyCode,
 *                  paymentType: "MTN_MONEY_TRANSFER" | "ORANGE_MONEY_TRANSFER"
 *                             | "TRANSFER_TO_NEERO_PERSON" (compte Neero personnel),
 *                  sourcePaymentMethodId (env merchant id),
 *                  destinationPaymentMethodId,
 *                  externalTransactionId, confirm: true }
 */

const NAME = 'neero';

const COUNTRY_DIAL_CODES = { CM: '+237' };

/**
 * Neero NEERO_PERSON expects the local number (e.g. 677123456) with
 * countryCode set separately — not the full E.164 prefix.
 */
function stripCountryCode(phoneNumber, countryIso = 'CM') {
  const code = COUNTRY_DIAL_CODES[countryIso];
  let raw = String(phoneNumber || '').trim().replace(/\s+/g, '');
  if (!code) return raw;
  const dialDigits = code.replace(/\D/g, '');
  if (raw.startsWith(code)) {
    return raw.slice(code.length).replace(/^\s+/, '');
  }
  if (raw.startsWith(dialDigits) && raw.length > dialDigits.length) {
    return raw.slice(dialDigits.length);
  }
  return raw;
}

const PROVIDER_TO_NEERO = {
  mtn: 'MTN_MONEY',
  orange: 'ORANGE_MONEY',
};

const PROVIDER_TO_CASHOUT_TYPE = {
  mtn: 'MTN_MONEY_TRANSFER',
  orange: 'ORANGE_MONEY_TRANSFER',
  // Doc Neero + NeeroDriver.php : TRANSFER_TO_NEERO_PERSON pour NEERO_PERSON.
  neero: process.env.NEERO_ACCOUNT_TRANSFER_TYPE || 'TRANSFER_TO_NEERO_PERSON',
};

function authHeader() {
  const key = config.gateways.neero.secretKey;
  if (!key) {
    const err = new Error('gateway_error');
    err.code = 'gateway_error';
    err.detail = 'Neero secret key not configured';
    throw err;
  }
  // Basic auth: username = secretKey, password = empty
  const b64 = Buffer.from(`${key}:`).toString('base64');
  return `Basic ${b64}`;
}

function client() {
  return axios.create({
    baseURL: config.gateways.neero.baseUrl,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

function unwrap(res) {
  return res.data && res.data.data ? res.data.data : res.data;
}

function errorPayload(err) {
  return err.response?.data || err.message;
}

/**
 * Pull a human-readable label from a Neero payment-method payload.
 * Neero may return `shortInfo` at the root or nested under person/mobile details.
 */
function extractShortInfo(data) {
  if (!data || typeof data !== 'object') return null;

  const direct = data.shortInfo ?? data.short_info;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const person =
    data.personDetailsWithPhoneNumber ??
    data.personDetails ??
    data.neeroPersonDetails;
  if (person && typeof person === 'object') {
    const parts = [person.firstName, person.lastName, person.fullName, person.name]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim());
    if (parts.length) return parts.join(' ');
  }

  const mobile = data.mobileMoneyDetails;
  if (mobile && typeof mobile === 'object') {
    const holder = mobile.accountHolderName ?? mobile.holderName ?? mobile.name;
    if (typeof holder === 'string' && holder.trim()) return holder.trim();
  }

  return null;
}

async function fetchPaymentMethodById(paymentMethodId) {
  if (!paymentMethodId) return null;
  try {
    const res = await client().get(`/api/v1/payment-methods/${paymentMethodId}`);
    return unwrap(res);
  } catch {
    return null;
  }
}

/**
 * Resolve the merchant source payment method for cash-in / cash-out.
 *
 * Prefer NEERO_MERCHANT_PM_ID — the same account learner cash-ins credit.
 * Only create a dynamic NEERO_MERCHANT when the static id is not configured.
 */
async function resolveMerchantSourcePaymentMethod() {
  const cfg = config.gateways.neero;
  const { merchantKey, storeId, balanceId, operatorId, merchantPmId } = cfg;

  if (merchantPmId) {
    return { ok: true, paymentMethodId: merchantPmId, fromCache: true, source: 'static' };
  }

  if (merchantKey && storeId && balanceId && operatorId != null) {
    try {
      const res = await client().post('/api/v1/payment-methods', {
        type: 'NEERO_MERCHANT',
        neeroMerchantDetails: {
          merchantKey,
          storeId,
          balanceId,
          operatorId,
        },
      });
      const data = unwrap(res);
      const paymentMethodId = data.id || data.paymentMethodId;
      if (!paymentMethodId) {
        return { ok: false, error: 'merchant_pm_missing_id', raw: data };
      }
      return { ok: true, paymentMethodId, fromCache: false, source: 'dynamic' };
    } catch (err) {
      return { ok: false, error: errorPayload(err) };
    }
  }

  return { ok: false, error: 'Neero merchant payment method id not configured' };
}

/**
 * Normalize a Neero transaction-intent object (response body of POST cash-in /
 * cash-out and GET /transaction-intents/:id).
 *
 * The shape we receive is flat (no `data` envelope):
 *   { id, status, type: "CASHIN" | "CASHOUT", externalTransactionId,
 *     paymentRef, paymentToken, amount, currency, fees, statusUpdates, ... }
 *
 * Returns a stable subset; the full body is always exposed as `raw`.
 */
function extractIntent(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return {
    id: obj.id || obj.transactionIntentId || null,
    status: normalizeStatus(obj.status || obj.newStatus),
    rawStatus: obj.status || obj.newStatus || null,
    type: obj.type || null, // "CASHIN" | "CASHOUT"
    externalTransactionId: obj.externalTransactionId || null,
    paymentRef: obj.paymentRef || null,
    paymentToken: obj.paymentToken || null,
    amount: typeof obj.amount === 'number' ? obj.amount : null,
    currencyCode: obj.currency || obj.currencyCode || null,
    fees: obj.fees || null,
    statusUpdates: Array.isArray(obj.statusUpdates) ? obj.statusUpdates : null,
    error: obj.error || null,
  };
}

/**
 * Resolve the Neero payment method ID for a withdrawal/payment destination.
 *
 * All providers cache by (phoneNumber, provider). What differs is the body
 * shape sent to Neero on cache miss:
 *
 *   mtn / orange  →  { type: 'MOBILE_MONEY',
 *                       mobileMoneyDetails: { phoneNumber, countryIso, mobileMoneyProvider } }
 *
 *   neero         →  { type: 'NEERO_PERSON',
 *                       personDetailsWithPhoneNumber: { countryCode, phoneNumber } }
 *
 * Cache miss → POST /api/v1/payment-methods, persist the response, return id.
 * Returns { ok, paymentMethodId, fromCache } or { ok: false, error }.
 */
async function resolvePaymentMethodId({ phoneNumber, provider, countryIso = 'CM', forceRefresh = false }) {
  // Lazy-import to avoid circular dependencies at module load time
  const { default: NeeroPaymentMethod } = await import('../../models/NeeroPaymentMethod.js');

  if (!phoneNumber) {
    return { ok: false, error: 'phoneNumber is required to resolve a Neero payment method' };
  }

  const cachePhone =
    provider === 'neero' ? stripCountryCode(phoneNumber, countryIso) : String(phoneNumber).trim();

  if (!forceRefresh) {
    const cached = await NeeroPaymentMethod.findOne({ phoneNumber: cachePhone, provider });
    if (cached) {
      let shortInfo = cached.shortInfo || null;
      if (!shortInfo && cached.neeroPaymentMethodId) {
        const details = await fetchPaymentMethodById(cached.neeroPaymentMethodId);
        shortInfo = extractShortInfo(details);
        if (shortInfo) {
          await NeeroPaymentMethod.updateOne({ _id: cached._id }, { shortInfo });
        }
      }
      return {
        ok: true,
        paymentMethodId: cached.neeroPaymentMethodId,
        shortInfo,
        fromCache: true,
      };
    }
  }

  let body;
  if (provider === 'neero') {
    body = {
      type: 'NEERO_PERSON',
      personDetailsWithPhoneNumber: {
        countryCode: countryIso,
        phoneNumber: cachePhone,
      },
    };
  } else {
    const mobileMoneyProvider = PROVIDER_TO_NEERO[provider];
    if (!mobileMoneyProvider) {
      return { ok: false, error: `Unsupported provider: ${provider}` };
    }
    body = {
      type: 'MOBILE_MONEY',
      mobileMoneyDetails: { phoneNumber, countryIso, mobileMoneyProvider },
    };
  }

  try {
    const res = await client().post('/api/v1/payment-methods', body);
    const data = unwrap(res);
    const neeroPaymentMethodId = data.id || data.paymentMethodId;
    let shortInfo = extractShortInfo(data);

    if (!shortInfo && neeroPaymentMethodId) {
      const details = await fetchPaymentMethodById(neeroPaymentMethodId);
      shortInfo = extractShortInfo(details);
    }

    await NeeroPaymentMethod.findOneAndUpdate(
      { phoneNumber: cachePhone, provider },
      { phoneNumber: cachePhone, provider, neeroPaymentMethodId, countryIso, shortInfo },
      { upsert: true, new: true }
    );

    return { ok: true, paymentMethodId: neeroPaymentMethodId, shortInfo, fromCache: false };
  } catch (err) {
    return { ok: false, error: errorPayload(err) };
  }
}

/**
 * Create a MOBILE_MONEY payment method for the given MoMo number.
 * Returns { ok, paymentMethodId, raw }.
 * @deprecated Use resolvePaymentMethodId which includes local caching.
 */
export async function createMobileMoneyPaymentMethod({
  phoneNumber,
  provider,
  countryIso = 'CM',
}) {
  return resolvePaymentMethodId({ phoneNumber, provider, countryIso });
}

/**
 * Cash-In: customer MoMo → merchant balance.
 */
export async function initiatePayment({
  amount,
  currencyCode,
  phoneNumber,
  provider,
  countryIso = 'CM',
  mchTransactionRef,
}) {
  const { merchantPmId } = config.gateways.neero;
  if (!merchantPmId) {
    return { ok: false, error: 'Neero merchant payment method id not configured' };
  }

  const pm = await resolvePaymentMethodId({
    phoneNumber,
    provider,
    countryIso,
    forceRefresh: provider === 'neero',
  });
  if (!pm.ok) return pm;

  try {
    const res = await client().post('/api/v1/transaction-intents/cash-in', {
      amount,
      currencyCode,
      paymentType: 'MERCHANT_COLLECTION',
      sourcePaymentMethodId: pm.paymentMethodId,
      destinationPaymentMethodId: merchantPmId,
      externalTransactionId: mchTransactionRef,
      confirm: true,
    });
    const data = unwrap(res);
    const intent = extractIntent(data) || {};
    return {
      ok: true,
      reference: intent.id || mchTransactionRef,
      status: intent.status,
      type: intent.type,             // expect "CASHIN"
      paymentRef: intent.paymentRef,
      amount: intent.amount,
      currencyCode: intent.currencyCode,
      fees: intent.fees,
      raw: data,
      // MoMo collections are confirmed on the customer's phone — no redirect URL.
      paymentUrl: null,
    };
  } catch (err) {
    return { ok: false, error: errorPayload(err) };
  }
}

/**
 * Cash-Out: merchant balance → destination wallet/account.
 *
 * Two destinations are supported:
 *
 *  - Mobile money (provider = 'mtn' | 'orange'):
 *      phoneNumber is required. We resolve (or cache) the Neero MOBILE_MONEY
 *      payment method id and target it.
 *
 *  - Neero account (provider = 'neero'):
 *      neeroAccountId is required. It IS already a payment method id in
 *      Neero's system, so we use it directly as destinationPaymentMethodId
 *      and skip the /payment-methods round-trip.
 */
export async function initiateWithdrawal({
  amount,
  currencyCode,
  phoneNumber,
  provider,
  countryIso = 'CM',
  mchTransactionRef,
  destinationPaymentMethodId: destinationOverride,
}) {
  const paymentType = PROVIDER_TO_CASHOUT_TYPE[provider];
  if (!paymentType) {
    return { ok: false, error: `Unsupported withdrawal provider: ${provider}` };
  }

  const merchant = await resolveMerchantSourcePaymentMethod();
  if (!merchant.ok) return merchant;

  // Neero person: always re-resolve destination (never reuse a stale WDA id).
  const pm = await resolvePaymentMethodId({
    phoneNumber,
    provider,
    countryIso,
    forceRefresh: provider === 'neero',
  });
  if (!pm.ok) return pm;
  const destinationPaymentMethodId = pm.paymentMethodId;

  try {
    const res = await client().post('/api/v1/transaction-intents/cash-out', {
      amount,
      currencyCode,
      paymentType,
      sourcePaymentMethodId: merchant.paymentMethodId,
      destinationPaymentMethodId,
      externalTransactionId: mchTransactionRef,
      confirm: true,
      metadata: {
        merchant_reference: mchTransactionRef,
      },
    });
    const data = unwrap(res);
    const intent = extractIntent(data) || {};
    return {
      ok: true,
      reference: intent.id || mchTransactionRef,
      status: intent.status,
      type: intent.type,             // expect "CASHOUT"
      paymentRef: intent.paymentRef,
      amount: intent.amount,
      currencyCode: intent.currencyCode,
      fees: intent.fees,
      raw: data,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[neero] cash-out failed', {
      paymentType,
      amount,
      provider,
      merchantSource: merchant.source,
      sourcePaymentMethodId: merchant.paymentMethodId,
      destinationPaymentMethodId,
      phoneNumber,
      error: errorPayload(err),
    });
    return { ok: false, error: errorPayload(err) };
  }
}

/**
 * Live merchant balance from Neero (where learner payments are collected).
 * GET /api/v1/balances/payment-method/{paymentMethodId}
 * Only valid for NEERO_MERCHANT payment method ids.
 */
export async function getMerchantBalance({ paymentMethodId } = {}) {
  const merchantPmId = paymentMethodId || config.gateways.neero.merchantPmId;
  if (!merchantPmId) {
    return { ok: false, error: 'Neero merchant payment method id not configured' };
  }
  try {
    const res = await client().get(`/api/v1/balances/payment-method/${merchantPmId}`);
    const data = unwrap(res);
    const balance = typeof data.balance === 'number' ? Math.round(data.balance) : null;
    const currencyCode = data.currency || data.currencyCode || 'XAF';
    if (balance === null) {
      return { ok: false, error: 'invalid_balance_response', raw: data };
    }
    return {
      ok: true,
      balance,
      currencyCode,
      paymentMethodId: merchantPmId,
      raw: data,
    };
  } catch (err) {
    return { ok: false, error: errorPayload(err) };
  }
}

/**
 * Verify a transaction intent by its Neero ID.
 *
 * Reads the flat response body returned by GET /transaction-intents/:id:
 *   top-level: id, status, type ("CASHIN" | "CASHOUT"), externalTransactionId,
 *              paymentRef, amount, currency, fees, statusUpdates, error.
 *
 * Returns the normalized intent plus the raw payload, so callers can both
 * (a) authoritatively settle/fail the record and (b) capture metadata
 * (paymentRef, fees, etc.) without re-parsing.
 */
export async function verify({ reference }) {
  try {
    const res = await client().get(`/api/v1/transaction-intents/${reference}`);
    const data = unwrap(res);
    const intent = extractIntent(data) || {};
    return {
      ok: true,
      status: intent.status,
      type: intent.type,
      reference: intent.id || reference,
      externalTransactionId: intent.externalTransactionId,
      paymentRef: intent.paymentRef,
      amount: intent.amount,
      currencyCode: intent.currencyCode,
      fees: intent.fees,
      statusUpdates: intent.statusUpdates,
      error: intent.error,
      raw: data,
    };
  } catch (err) {
    return { ok: false, error: errorPayload(err) };
  }
}

/**
 * Parse the Neero webhook payload.
 *
 * Actual shape (from live callbacks):
 * {
 *   id: "<webhook-event-id>",
 *   data: {
 *     object: {
 *       transactionIntentId: "<neero-tx-id>",   ← our gatewayReference
 *       newStatus: "PENDING" | "SUCCESSFUL" | "FAILED",
 *       externalTransactionId: "PAY-XXXXXXXX",  ← our paymentId / withdrawalId
 *     }
 *   },
 *   type: "transactionIntent.statusUpdated"
 * }
 */
export function parseCallback({ headers, body }) {
  const expected = config.gateways.neero.webhookSecret;
  if (expected) {
    const incoming = headers['x-neero-signature'] || headers['x-webhook-secret'];
    if (incoming !== expected) return { ok: false, error: 'invalid_signature' };
  }

  const obj = body?.data?.object ?? body;
  const externalTransactionId =
    obj?.externalTransactionId || body?.externalTransactionId || null;
  const transactionIntentId =
    obj?.transactionIntentId || body?.transactionIntentId || null;
  const rawStatus = obj?.newStatus || obj?.status || body?.status || null;

  return {
    ok: true,
    externalTransactionId,   // our friendly id (PAY-xxx / WDR-xxx)
    transactionIntentId,     // neero's internal id — used to re-verify
    status: normalizeStatus(rawStatus),
    raw: body,
  };
}

/**
 * Neero statuses (from the collection):
 *   INITIALIZED → REQUIRES_PAYMENT_METHOD → WAITING_FOR_CONFIRMATION →
 *   REQUIRES_ACTION → PENDING → SUCCESSFUL / FAILED / CANCELLED / EXPIRED
 */
function normalizeStatus(s) {
  if (!s) return 'unknown';
  const v = String(s).toUpperCase();
  if (v === 'SUCCESSFUL') return 'successful';
  if (v === 'FAILED' || v === 'EXPIRED') return 'failed';
  if (v === 'CANCELLED' || v === 'CANCELED') return 'cancelled';
  if (
    v === 'INITIALIZED' ||
    v === 'PENDING' ||
    v === 'REQUIRES_PAYMENT_METHOD' ||
    v === 'WAITING_FOR_CONFIRMATION' ||
    v === 'REQUIRES_ACTION'
  ) {
    return 'pending';
  }
  return v.toLowerCase();
}

export const name = NAME;

export default {
  name: NAME,
  createMobileMoneyPaymentMethod,
  resolvePaymentMethodId,
  initiatePayment,
  initiateWithdrawal,
  getMerchantBalance,
  verify,
  parseCallback,
};
