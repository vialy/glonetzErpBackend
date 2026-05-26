import axios from 'axios';
import config from '../../config/index.js';

/**
 * Neero adapter — implements the flow documented in
 * `Neero API documentation.docx`:
 *
 *   - Basic auth (Username = secret key, Password = empty).
 *   - Payment methods: MOBILE_MONEY (customer) and NEERO_MERCHANT (merchant).
 *   - Cash-In  : POST /api/v1/transaction-intents/cash-in
 *   - Cash-Out : POST /api/v1/transaction-intents/cash-out
 *   - Status   : GET  /api/v1/transaction-intents/:id
 *
 * The merchant payment method ID is created once on the dashboard / via the
 * payment-methods endpoint and stored in env (`NEERO_MERCHANT_PM_ID`).
 *
 * Customer payment method IDs are created on the fly each time we collect
 * from a new MoMo number (Neero returns a permanent ID per phone number).
 */

const NAME = 'neero';

function authHeader() {
  const key = config.gateways.neero.secretKey;
  if (!key) {
    const err = new Error('gateway_error');
    err.code = 'gateway_error';
    err.detail = 'Neero secret key not configured';
    throw err;
  }
  const b64 = Buffer.from(`${key}:`).toString('base64');
  return `Basic ${b64}`;
}

export async function createMobileMoneyPaymentMethod({ phoneNumber, provider, countryIso = 'CM' }) {
  const { baseUrl } = config.gateways.neero;
  const providerCode = provider === 'mtn' ? 'MTN_MOMO' : 'ORANGE_MONEY';
  try {
    const res = await axios.post(
      `${baseUrl}/api/v1/payment-methods`,
      {
        type: 'MOBILE_MONEY',
        mobileMoneyDetails: {
          phoneNumber,
          countryIso,
          mobileMoneyProvider: providerCode,
        },
      },
      { headers: { Authorization: authHeader() } }
    );
    const data = res.data && res.data.data ? res.data.data : res.data;
    return { ok: true, paymentMethodId: data.id || data.paymentMethodId, raw: data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

export async function initiatePayment({
  amount,
  currencyCode,
  phoneNumber,
  provider,
  countryIso = 'CM',
  mchTransactionRef,
}) {
  const { baseUrl, merchantPmId } = config.gateways.neero;
  if (!merchantPmId) {
    return { ok: false, error: 'Neero merchant payment method id not configured' };
  }
  const pm = await createMobileMoneyPaymentMethod({ phoneNumber, provider, countryIso });
  if (!pm.ok) return pm;

  try {
    const res = await axios.post(
      `${baseUrl}/api/v1/transaction-intents/cash-in`,
      {
        amount,
        currencyCode,
        paymentType: 'MERCHANT_COLLECTION',
        destinationPaymentMethodId: merchantPmId,
        sourcePaymentMethodId: pm.paymentMethodId,
        confirm: true,
        externalReference: mchTransactionRef,
      },
      { headers: { Authorization: authHeader() } }
    );
    const data = res.data && res.data.data ? res.data.data : res.data;
    return {
      ok: true,
      reference: data.id || data.transactionIntentId || mchTransactionRef,
      status: normalizeStatus(data.status),
      raw: data,
      paymentUrl: null, // Neero MoMo collections are confirmed on the user's phone
    };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

export async function initiateWithdrawal({
  amount,
  currencyCode,
  phoneNumber,
  provider,
  countryIso = 'CM',
  mchTransactionRef,
}) {
  const { baseUrl, merchantPmId } = config.gateways.neero;
  if (!merchantPmId) {
    return { ok: false, error: 'Neero merchant payment method id not configured' };
  }
  const pm = await createMobileMoneyPaymentMethod({ phoneNumber, provider, countryIso });
  if (!pm.ok) return pm;

  const paymentType = provider === 'mtn' ? 'MTN_MOMO_TRANSFER' : 'ORANGE_MONEY_TRANSFER';
  try {
    const res = await axios.post(
      `${baseUrl}/api/v1/transaction-intents/cash-out`,
      {
        amount,
        currencyCode,
        paymentType,
        destinationPaymentMethodId: pm.paymentMethodId,
        sourcePaymentMethodId: merchantPmId,
        confirm: true,
        externalReference: mchTransactionRef,
      },
      { headers: { Authorization: authHeader() } }
    );
    const data = res.data && res.data.data ? res.data.data : res.data;
    return {
      ok: true,
      reference: data.id || data.transactionIntentId || mchTransactionRef,
      status: normalizeStatus(data.status),
      raw: data,
    };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

export async function verify({ reference }) {
  const { baseUrl } = config.gateways.neero;
  try {
    const res = await axios.get(`${baseUrl}/api/v1/transaction-intents/${reference}`, {
      headers: { Authorization: authHeader() },
    });
    const data = res.data && res.data.data ? res.data.data : res.data;
    return { ok: true, status: normalizeStatus(data.status), raw: data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

export function parseCallback({ headers, body }) {
  const expected = config.gateways.neero.webhookSecret;
  if (expected) {
    const incoming = headers['x-neero-signature'] || headers['x-webhook-secret'];
    if (incoming !== expected) return { ok: false, error: 'invalid_signature' };
  }
  return {
    ok: true,
    reference: body?.id || body?.transactionIntentId || body?.externalReference,
    status: normalizeStatus(body?.status),
    raw: body,
  };
}

function normalizeStatus(s) {
  if (!s) return 'unknown';
  const v = String(s).toUpperCase();
  if (v === 'SUCCESSFUL') return 'successful';
  if (v === 'FAILED') return 'failed';
  if (v === 'CANCELLED' || v === 'CANCELED') return 'cancelled';
  if (v === 'INITIALIZED' || v === 'PENDING') return 'pending';
  return v.toLowerCase();
}

export const name = NAME;

export default {
  name: NAME,
  initiatePayment,
  initiateWithdrawal,
  verify,
  parseCallback,
};
