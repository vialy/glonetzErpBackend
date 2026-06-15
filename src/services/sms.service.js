import config from '../config/index.js';

/**
 * SMS service — thin abstraction with `stub` and `twilio` providers.
 * The provider is selected via SMS_PROVIDER env var.
 *
 *   - stub   : logs the message to stdout (dev/staging fallback).
 *   - twilio : sends via the Twilio REST API. Credentials come from
 *              TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
 *              TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM.
 */

// Lazy singleton so we don't instantiate the Twilio client unless needed.
let twilioClient = null;
async function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const { accountSid, authToken } = config.sms.twilio;
  if (!accountSid || !authToken) {
    throw new Error('Twilio is not configured (missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
  }
  // Dynamic import keeps Twilio off the hot path for stub deployments.
  const { default: twilio } = await import('twilio');
  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

export async function sendSms({ to, body }) {
  if (!to) return null;
  const provider = config.sms.provider;
  switch (provider) {
    case 'twilio': {
      try {
        const client = await getTwilioClient();
        const { from, messagingServiceSid } = config.sms.twilio;
        const payload = { to, body };
        if (messagingServiceSid) {
          payload.messagingServiceSid = messagingServiceSid;
        } else if (from) {
          payload.from = from;
        } else {
          throw new Error('Twilio sender not configured (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)');
        }
        const message = await client.messages.create(payload);
        return { provider: 'twilio', sid: message.sid, to, status: message.status };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[sms:twilio] send failed:', err?.message || err);
        return { provider: 'twilio', to, error: err?.message || String(err) };
      }
    }
    case 'stub':
    default: {
      if (config.env !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`[sms:stub] -> ${to} | ${body}`);
      }
      return { provider: 'stub', to, body };
    }
  }
}

export function sendUserCredentials({ to, name, password }) {
  const body = `${config.appName}: Hi ${name || ''}, your temporary password is ${password}. You will be asked to change it on first login.`;
  return sendSms({ to, body });
}

export function sendOtp({ to, otp }) {
  const body = `${config.appName}: Your verification code is ${otp}. It expires in 10 minutes.`;
  return sendSms({ to, body });
}

export default { sendSms, sendUserCredentials, sendOtp };
