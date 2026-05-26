import axios from 'axios';
import config from '../../config/index.js';

/**
 * Tranzak adapter.
 *
 * The official setup guide (see /docs) describes the developer portal and
 * webhook flow but doesn't include the exact REST routes — those live at
 * https://docs.developer.tranzak.me. The functions below follow Tranzak's
 * documented "Payment Request" pattern:
 *
 *   1. POST /xp021/v1/api/auth/token              -> obtain a bearer token
 *   2. POST /xp021/v1/api/payment/create-request  -> initiate a request
 *   3. (Webhook to our /api/public/callbacks/tranzak)
 *   4. GET  /xp021/v1/api/payment/details/:ref    -> verify
 *
 * Adjust the route strings here once you have the up-to-date Tranzak docs.
 * The shape of the return values is what the rest of the app depends on.
 */

const NAME = 'tranzak';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 30_000) return cachedToken;
  const { baseUrl, appId, apiKey } = config.gateways.tranzak;
  if (!appId || !apiKey) {
    const err = new Error('gateway_error');
    err.code = 'gateway_error';
    err.detail = 'Tranzak credentials not configured';
    throw err;
  }
  try {
    const res = await axios.post(`${baseUrl}/xp021/v1/api/auth/token`, {
      appId,
      apiKey,
    });
    const data = res.data && res.data.data ? res.data.data : res.data;
    cachedToken = data.token || data.accessToken;
    const expiresInSec = data.expiresIn || 3600;
    cachedTokenExpiry = Date.now() + expiresInSec * 1000;
    return cachedToken;
  } catch (err) {
    const e = new Error('gateway_error');
    e.code = 'gateway_error';
    e.detail = err.response?.data || err.message;
    throw e;
  }
}

export async function initiatePayment({ amount, currencyCode, mchTransactionRef, description, returnUrl }) {
  const { baseUrl } = config.gateways.tranzak;
  const token = await getToken();
  try {
    const res = await axios.post(
      `${baseUrl}/xp021/v1/api/payment/create-request`,
      {
        amount,
        currencyCode,
        description: description || 'Class fee payment',
        mchTransactionRef,
        returnUrl,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = res.data && res.data.data ? res.data.data : res.data;
    return {
      ok: true,
      reference: data.requestId || data.transactionId || mchTransactionRef,
      paymentUrl: data.paymentUrl || data.checkoutUrl || null,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data || err.message,
    };
  }
}

export async function initiateWithdrawal({ amount, currencyCode, phoneNumber, mchTransactionRef, description }) {
  const { baseUrl } = config.gateways.tranzak;
  const token = await getToken();
  try {
    const res = await axios.post(
      `${baseUrl}/xp021/v1/api/payout/simple`,
      {
        amount,
        currencyCode,
        mobileWalletNumber: phoneNumber,
        mchTransactionRef,
        description: description || 'Withdrawal',
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = res.data && res.data.data ? res.data.data : res.data;
    return {
      ok: true,
      reference: data.requestId || data.transactionId || mchTransactionRef,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data || err.message,
    };
  }
}

export async function verify({ reference }) {
  const { baseUrl } = config.gateways.tranzak;
  const token = await getToken();
  try {
    const res = await axios.get(`${baseUrl}/xp021/v1/api/payment/details/${reference}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.data && res.data.data ? res.data.data : res.data;
    return { ok: true, raw: data, status: normalizeStatus(data.status) };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

/**
 * Map Tranzak callback to a normalized event shape.
 * Headers are passed in for secret verification.
 */
export function parseCallback({ headers, body }) {
  const expectedKey = config.gateways.tranzak.webhookSecret;
  if (expectedKey) {
    const incomingKey = headers['x-auth-key'] || headers['authkey'] || headers['x-tranzak-key'];
    if (incomingKey !== expectedKey) {
      return { ok: false, error: 'invalid_signature' };
    }
  }
  return {
    ok: true,
    reference: body?.requestId || body?.transactionId || body?.mchTransactionRef,
    status: normalizeStatus(body?.status),
    raw: body,
  };
}

function normalizeStatus(s) {
  if (!s) return 'unknown';
  const v = String(s).toUpperCase();
  if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID'].includes(v)) return 'successful';
  if (['FAILED', 'ERROR'].includes(v)) return 'failed';
  if (['CANCELLED', 'CANCELED'].includes(v)) return 'cancelled';
  if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(v)) return 'pending';
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
