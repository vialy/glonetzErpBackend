import { Setting } from '../../models/index.js';
import config, { PAYMENT_PROVIDERS, NOTIFICATION_EVENTS } from '../../config/index.js';
import neero from './neero.js';
import simulator from './simulator.js';
import notifier from '../notification.service.js';

const REAL_ADAPTERS = {
  [PAYMENT_PROVIDERS.NEERO]: neero,
};

/**
 * Returns the adapter that should actually be called.
 *
 * Rules:
 *   - If `Setting.activeGateway === 'none'` → null (callers raise `gateway_unavailable`).
 *   - Otherwise:
 *       * In production       → the real adapter (Neero).
 *       * Outside production  → the simulator. We expose the *configured*
 *         gateway name on the simulator so the persisted records still say
 *         "neero" — handy for end-to-end test snapshots — without
 *         the simulator code path branching elsewhere.
 *
 * The single returned object always has:
 *   .name, .initiatePayment, .initiateWithdrawal, .verify, .parseCallback
 */
export async function getActiveGateway() {
  const settings = await Setting.getSingleton();
  if (!settings.activeGateway || settings.activeGateway === PAYMENT_PROVIDERS.NONE) {
    return null;
  }
  if (config.isProduction) {
    return REAL_ADAPTERS[settings.activeGateway] || null;
  }
  // Outside production — wrap the simulator so its reported name matches the
  // user's configured gateway (purely cosmetic).
  return {
    ...simulator,
    name: settings.activeGateway,
  };
}

/**
 * Look up a callback adapter by gateway name. This is used by the public
 * /api/public/callbacks/<gateway> endpoints — those always parse the real
 * gateway payload shape, regardless of NODE_ENV, since you can also hit them
 * locally with curl to exercise the flow.
 */
export function getByName(name) {
  return REAL_ADAPTERS[name] || null;
}

export async function initiatePaymentViaActive(params) {
  const adapter = await getActiveGateway();
  if (!adapter) {
    const err = new Error('gateway_unavailable');
    err.code = 'gateway_unavailable';
    throw err;
  }
  const result = await adapter.initiatePayment(params);
  if (!result.ok) {
    await notifier.notify(NOTIFICATION_EVENTS.GATEWAY_ERROR, {
      subject: 'Payment gateway error',
      body: `Initiating a payment via ${adapter.name} failed.`,
      meta: { params, error: result.error },
    });
    const err = new Error('gateway_error');
    err.code = 'gateway_error';
    err.detail = result.error;
    throw err;
  }
  return { adapter, result };
}

export async function initiateWithdrawalViaActive(params) {
  const adapter = await getActiveGateway();
  if (!adapter) {
    const err = new Error('gateway_unavailable');
    err.code = 'gateway_unavailable';
    throw err;
  }
  const result = await adapter.initiateWithdrawal(params);
  if (!result.ok) {
    await notifier.notify(NOTIFICATION_EVENTS.WITHDRAWAL_FAILED, {
      subject: 'Withdrawal failed',
      body: `Initiating a withdrawal via ${adapter.name} failed.`,
      meta: { params, error: result.error },
    });
    const err = new Error('gateway_error');
    err.code = 'gateway_error';
    err.detail = result.error;
    throw err;
  }
  return { adapter, result };
}

export default {
  getActiveGateway,
  getByName,
  initiatePaymentViaActive,
  initiateWithdrawalViaActive,
};
