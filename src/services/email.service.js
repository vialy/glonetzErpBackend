import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) {
    // No SMTP configured — fall back to JSON transport (logs the email).
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  if (!to) return null;
  try {
    const info = await getTransporter().sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html,
    });
    if (config.env !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[email] -> ${to} | ${subject}`);
    }
    return info;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] send failed:', err.message);
    return null;
  }
}

// ---- Templated helpers ----

export function sendUserCredentials({ to, name, password, kind }) {
  const subject = `${config.appName} — Your account credentials`;
  const text = [
    `Hi ${name || ''},`,
    '',
    `An account has been created for you on ${config.appName}.`,
    `Login (${kind}): the email/phone the staff used to create your account.`,
    `Temporary password: ${password}`,
    '',
    'For security, you will be required to change this password the first time you sign in.',
    '',
    'Thanks,',
    config.appName,
  ].join('\n');
  return sendMail({ to, subject, text });
}

export function sendStaffCredentials({ to, name, role, password }) {
  const subject = `${config.appName} — Staff account created`;
  const text = [
    `Hi ${name || ''},`,
    '',
    `A staff account has been created for you on ${config.appName} with role: ${role}.`,
    `Login email: ${to}`,
    `Temporary password: ${password}`,
    '',
    'You will be required to change this password the first time you sign in.',
    '',
    'Thanks,',
    config.appName,
  ].join('\n');
  return sendMail({ to, subject, text });
}

export function sendNotification({ to, subject, body }) {
  return sendMail({ to, subject, text: body });
}

export default {
  sendMail,
  sendUserCredentials,
  sendStaffCredentials,
  sendNotification,
};
