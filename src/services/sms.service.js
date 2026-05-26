import config from '../config/index.js';

/**
 * SMS service — thin abstraction with a `stub` provider that simply logs.
 * Swap in Twilio / Africa's Talking later by extending the switch below.
 */
export async function sendSms({ to, body }) {
  if (!to) return null;
  const provider = config.sms.provider;
  switch (provider) {
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
