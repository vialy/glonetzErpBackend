// utils/email/templates.js

export function otpEmailTemplate({ name = "User", code }) {
  return {
    subject: "Your Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2>Hello ${name},</h2>
        <p>Your verification code is:</p>
        <div style="
          display: inline-block;
          font-size: 28px;
          font-weight: bold;
          letter-spacing: 4px;
          background: #f4f4f4;
          padding: 12px 20px;
          border-radius: 8px;
          margin: 10px 0;
        ">
          ${code}
        </div>
        <p>This code will expire soon.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
    text: `Hello ${name}, your verification code is: ${code}`,
  };
}

export function welcomeEmailTemplate({ name = "User" }) {
  return {
    subject: "Welcome!",
    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>Welcome, ${name} 🎉</h2>
        <p>We’re glad to have you onboard.</p>
      </div>
    `,
    text: `Welcome, ${name}! We're glad to have you onboard.`,
  };
}

export function genericNotificationTemplate({
  title = "Notification",
  message = "",
}) {
  return {
    subject: title,
    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    `,
    text: `${title}\n\n${message}`,
  };
}