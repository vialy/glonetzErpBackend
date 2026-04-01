// utils/email/sendEmail.js
import transporter from "./transporter.js";

export async function sendEmail({
  to,
  subject,
  html,
  text,
  cc,
  bcc,
  replyTo,
  attachments = [],
}) {
  if (!to) throw new Error("Recipient email (to) is required");
  if (!subject) throw new Error("Email subject is required");
  if (!html && !text) throw new Error("Either html or text content is required");

  const mailOptions = {
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    text,
    cc,
    bcc,
    replyTo,
    attachments,
  };

  const info = await transporter.sendMail(mailOptions);

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  };
}