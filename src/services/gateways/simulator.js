import config from '../../config/index.js';

/**
 * In-process gateway simulator used outside production.
 *
 * Why this exists:
 *   The spec calls for payments to be testable without hitting real gateways
 *   on development & staging. In particular, `+237670000001` (configurable via
 *   `DEV_TEST_PHONE`) is the magic number that lets the QA team produce both
 *   successful and failed outcomes deterministically.
 *
 * Choosing the outcome:
 *   The caller passes `simulateOutcome` ('success' | 'failed').
 *   - 'failed' -> the simulator returns a non-ok result, mirroring a real
 *     gateway error path.
 *   - anything else (or missing) -> 'success'.
 *
 * The simulator returns the SAME shape the real adapters return so the rest of
 * the codebase doesn't have to know whether it's talking to a real gateway.
 */

const NAME = 'simulator';

function shouldSimulate(phoneNumber) {
  // In production we never simulate.
  if (config.isProduction) return false;
  if (!phoneNumber) return true; // dev with no phone -> still simulate
  // Anywhere outside production, all calls go through the simulator. The
  // configured `devTestPhone` is the explicit "I want to test outcome
  // branches" affordance, but it's not the only number that's simulated.
  return true;
}

function buildResult({ outcome, mchTransactionRef }) {
  const reference = `SIM-${Date.now()}-${(mchTransactionRef || '').slice(0, 8)}`;
  if (outcome === 'failed') {
    return {
      ok: false,
      error: {
        simulated: true,
        message: 'Simulated failure (NODE_ENV != production and outcome=failed)',
      },
    };
  }
  return {
    ok: true,
    reference,
    status: 'successful',
    paymentUrl: null,
    raw: {
      simulated: true,
      reference,
      mchTransactionRef,
      status: 'SUCCESSFUL',
    },
  };
}

async function initiatePayment({ phoneNumber, mchTransactionRef, simulateOutcome }) {
  if (!shouldSimulate(phoneNumber)) {
    return { ok: false, error: 'simulator_should_not_run_in_production' };
  }
  return buildResult({ outcome: simulateOutcome, mchTransactionRef });
}

async function initiateWithdrawal({ phoneNumber, mchTransactionRef, simulateOutcome }) {
  if (!shouldSimulate(phoneNumber)) {
    return { ok: false, error: 'simulator_should_not_run_in_production' };
  }
  return buildResult({ outcome: simulateOutcome, mchTransactionRef });
}

async function verify({ reference }) {
  return { ok: true, status: 'successful', raw: { simulated: true, reference } };
}

function parseCallback({ body }) {
  // The simulator doesn't receive real webhooks, but support manual
  // /api/public/callbacks for local testing by accepting an explicit body.
  return {
    ok: true,
    reference: body?.reference || body?.mchTransactionRef,
    status: body?.status === 'failed' ? 'failed' : 'successful',
    raw: body,
  };
}

export const name = NAME;

export default {
  name: NAME,
  initiatePayment,
  initiateWithdrawal,
  verify,
  parseCallback,
};
