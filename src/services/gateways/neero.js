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
async function resolvePaymentMethodId({ phoneNumber, provider, countryIso = 'CM' }) {
  // Lazy-import to avoid circular dependencies at module load time
  const { default: NeeroPaymentMethod } = await import('../../models/NeeroPaymentMethod.js');

  if (!phoneNumber) {
    return { ok: false, error: 'phoneNumber is required to resolve a Neero payment method' };
  }

  const cached = await NeeroPaymentMethod.findOne({ phoneNumber, provider });
  if (cached) {
    return { ok: true, paymentMethodId: cached.neeroPaymentMethodId, fromCache: true };
  }

  let body;
  if (provider === 'neero') {
    // Personal Neero account — Neero looks the account up by phone.
    body = {
      type: 'NEERO_PERSON',
      personDetailsWithPhoneNumber: { countryCode: countryIso, phoneNumber },
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

    await NeeroPaymentMethod.findOneAndUpdate(
      { phoneNumber, provider },
      { phoneNumber, provider, neeroPaymentMethodId, countryIso },
      { upsert: true, new: true }
    );

    return { ok: true, paymentMethodId: neeroPaymentMethodId, fromCache: false };
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

  const pm = await resolvePaymentMethodId({ phoneNumber, provider, countryIso });
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
}) {
  const { merchantPmId } = config.gateways.neero;
  if (!merchantPmId) {
    return { ok: false, error: 'Neero merchant payment method id not configured' };
  }

  const paymentType = PROVIDER_TO_CASHOUT_TYPE[provider];
  if (!paymentType) {
    return { ok: false, error: `Unsupported withdrawal provider: ${provider}` };
  }

  // Resolve destination payment method id — every provider hits the local
  // (phoneNumber, provider) cache; on miss the right body shape is sent.
  const pm = await resolvePaymentMethodId({ phoneNumber, provider, countryIso });
  if (!pm.ok) return pm;
  const destinationPaymentMethodId = pm.paymentMethodId;

  try {
    const res = await client().post('/api/v1/transaction-intents/cash-out', {
      amount,
      currencyCode,
      paymentType,
      sourcePaymentMethodId: merchantPmId,
      destinationPaymentMethodId,
      externalTransactionId: mchTransactionRef,
      confirm: true,
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
      error: errorPayload(err),
    });
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
  verify,
  parseCallback,
};
