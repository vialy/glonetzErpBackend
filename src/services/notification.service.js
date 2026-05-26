import { Setting } from '../models/index.js';
import emailService from './email.service.js';
import config from '../config/index.js';

/**
 * Notifies the staff emails currently registered in Settings for the given
 * event. Failures are swallowed so that the caller's flow never breaks
 * because we couldn't reach the SMTP server.
 */
export async function notify(event, { subject, body, meta }) {
  try {
    const settings = await Setting.getSingleton();
    const recipients = settings.notificationEmails || [];
    if (recipients.length === 0) return;
    const fullSubject = `[${config.appName}] ${subject}`;
    const fullBody = [
      body,
      '',
      meta ? '---' : '',
      meta ? JSON.stringify(meta, null, 2) : '',
    ]
      .filter(Boolean)
      .join('\n');
    await Promise.all(
      recipients.map((to) => emailService.sendNotification({ to, subject: fullSubject, body: fullBody }))
    );
    if (config.env !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[notify:${event}] sent to ${recipients.length} recipients`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] failed:', err.message);
  }
}

export default { notify };
