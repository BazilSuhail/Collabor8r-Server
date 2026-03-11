const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_HOST) {
    throw new Error('EMAIL_HOST not set in .env — configure Gmail SMTP to send emails');
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const transport = getTransporter();
  const from = process.env.EMAIL_FROM || 'noreply@collabor8r.app';

  const info = await transport.sendMail({ from, to, subject, html });
  console.log(`Email sent to ${to}: ${info.messageId}`);
  return info;
}

function generateCode(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationCode(email, code, purpose) {
  const labels = { registration: 'Registration', login: 'Login', 'password-reset': 'Password Reset' };
  const label = labels[purpose] || 'Verification';

  return sendEmail({
    to: email,
    subject: `Your ${label} Code — Collabora8r`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Collabora8r</h2>
        <p>Your ${label.toLowerCase()} code is:</p>
        <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.5rem; text-align: center;
                    padding: 1rem; background: #f3f4f6; border-radius: 0.5rem; margin: 1rem 0;">
          ${code}
        </div>
        <p style="color: #6b7280; font-size: 0.875rem;">This code expires in 5 minutes.</p>
        <p style="color: #9ca3af; font-size: 0.75rem;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, generateCode, sendVerificationCode };
