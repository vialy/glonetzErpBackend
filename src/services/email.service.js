import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) {
    // No SMTP configured — fall back to JSON transport (logs the email).
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  const options = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  };
  // In development, rebuild the transporter so a backend restart picks up .env edits.
  if (config.env !== 'production') {
    return nodemailer.createTransport(options);
  }
  if (!transporter) {
    transporter = nodemailer.createTransport(options);
  }
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
    if (String(err.message).includes('authentication failed')) {
      // eslint-disable-next-line no-console
      console.error(
        '[email] SMTP auth rejected — check SMTP_USER/SMTP_PASS in .env, use the mailbox password from hPanel, '
        + 'and enable third-party access (Hostinger/Titan: Settings → Enable Titan on other apps). '
        + 'Host may need to be smtp.titan.email instead of smtp.hostinger.com.',
      );
    }
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
  const roleLabel =
    role === 'manager' ? 'gestionnaire'
    : role === 'auditor' ? 'comptable'
    : role === 'collaborateur' ? 'collaborateur'
    : role
  const subject = `${config.appName} — Vos identifiants de connexion`
  const text = [
    `Bonjour ${name || ''},`,
    '',
    `Un compte personnel a été créé pour vous sur ${config.appName} avec le rôle : ${roleLabel}.`,
    `E-mail de connexion : ${to}`,
    `Mot de passe temporaire : ${password}`,
    '',
    'Pour des raisons de sécurité, vous devrez changer ce mot de passe lors de votre première connexion.',
    '',
    'Cordialement,',
    config.appName,
  ].join('\n')
  return sendMail({ to, subject, text })
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
