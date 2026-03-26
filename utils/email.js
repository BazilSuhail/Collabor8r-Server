const nodemailer = require('nodemailer');

let emailQueue = null;
try {
  emailQueue = require('../queues/emailQueue').emailQueue;
} catch (_) {}

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
  if (emailQueue) {
    await emailQueue.add('send', { to, subject, html }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return { queued: true };
  }

  const transport = getTransporter();
  const from = process.env.EMAIL_FROM || 'noreply@collabor8r.app';

  const info = await transport.sendMail({ from, to, subject, html });
  console.log(`Email sent to ${to}: ${info.messageId}`);
  return info;
}

function generateCode(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getEmailContent(code, purpose) {
  const content = {
    registration: {
      heading: 'Welcome to Collabora8r!',
      body: `
        <p style="color: #431407; font-size: 1rem; margin: 0 0 16px 0; line-height: 1.7;">
          You're almost there! Use the code below to activate your account and start managing your projects with ease.
        </p>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 8px 0; font-weight: 600;">What you can do with Collabora8r:</p>
        <ul style="color: #431407; font-size: 0.9rem; margin: 0 0 20px 0; padding-left: 20px; line-height: 1.7;">
          <li>Create and assign tasks with priorities, deadlines, and labels</li>
          <li>Collaborate in real time with your team via comments and notifications</li>
          <li>Plan sprints and track progress with Kanban boards and Gantt charts</li>
          <li>Log time, manage files, and generate project reports</li>
          <li>Use AI-powered features for task breakdowns, risk detection, and retrospectives</li>
        </ul>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 20px 0; line-height: 1.6;">
          Enter the verification code below in the app to complete your registration:
        </p>
      `,
      note: 'If you did not create an account, someone may have entered your email by mistake — you can safely ignore this message.',
    },
    login: {
      heading: 'Sign In to Collabora8r',
      body: `
        <p style="color: #431407; font-size: 1rem; margin: 0 0 16px 0; line-height: 1.7;">
          A sign-in was requested for your Collabora8r account. Use the code below to securely log in and access your projects, tasks, and team workspace.
        </p>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 8px 0; font-weight: 600;">Your workspace at a glance:</p>
        <ul style="color: #431407; font-size: 0.9rem; margin: 0 0 20px 0; padding-left: 20px; line-height: 1.7;">
          <li>Dashboard with project stats and assigned task overview</li>
          <li>Real-time notifications for project updates and invitations</li>
          <li>Task management with status tracking and progress reporting</li>
          <li>Team collaboration through comments, file sharing, and activity logs</li>
        </ul>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 20px 0; line-height: 1.6;">
          Enter the code below in the app to continue:
        </p>
      `,
      note: 'If you did not try to sign in, your account credentials may be at risk. Please reset your password or contact support.',
    },
    'password-reset': {
      heading: 'Reset Your Collabora8r Password',
      body: `
        <p style="color: #431407; font-size: 1rem; margin: 0 0 16px 0; line-height: 1.7;">
          A password reset was requested for your Collabora8r account. Use the code below to create a new password and regain access to your projects and team workspace.
        </p>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 8px 0; font-weight: 600;">After resetting, you can:</p>
        <ul style="color: #431407; font-size: 0.9rem; margin: 0 0 20px 0; padding-left: 20px; line-height: 1.7;">
          <li>Sign in securely with your new password</li>
          <li>Pick up where you left off — all your projects, tasks, and data are preserved</li>
          <li>Enable two-factor authentication via email codes for added security</li>
        </ul>
        <p style="color: #431407; font-size: 1rem; margin: 0 0 20px 0; line-height: 1.6;">
          Enter the code below in the app to proceed with the password reset:
        </p>
      `,
      note: 'If you did not request a password reset, your account may be compromised. Please contact support immediately.',
    },
  };

  const { heading, body, note } = content[purpose] || content.login;
  const labels = { registration: 'Registration', login: 'Login', 'password-reset': 'Password Reset' };
  const label = labels[purpose] || 'Verification';

  return { html: `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 16px;">
      <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 1.4rem; font-weight: 700;">Collabora8r</h1>
        <p style="color: #ffedd5; margin: 4px 0 0 0; font-size: 0.8rem;">Project Management Suite</p>
      </div>
      <div style="background: #ffffff; border: 1px solid #fed7aa; border-top: none; border-radius: 0 0 12px 12px; padding: 28px 24px;">
        <h2 style="color: #431407; font-size: 1.15rem; margin: 0 0 16px 0; font-weight: 600;">${heading}</h2>
        ${body}
        <div style="font-size: 2rem; font-weight: 800; letter-spacing: 0.5rem; padding: 14px 16px; background: #fff7ed; border: 2px solid #fdba74; border-radius: 10px; margin: 0 0 16px 0; color: #c2410c; text-align: center;">
          ${code}
        </div>
        <div style="background: #fff7ed; border-radius: 8px; padding: 12px 16px; margin: 0 0 16px 0;">
          <p style="color: #9a3412; font-size: 0.8rem; margin: 0; line-height: 1.5;">
            This code expires in <strong>5 minutes</strong>. For your security, do not share this code with anyone.
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #ffedd5; margin: 20px 0;">
        <p style="color: #c2410c; font-size: 0.75rem; margin: 0 0 6px 0; line-height: 1.5;">${note}</p>
        <p style="color: #ea580c; font-size: 0.8rem; margin: 14px 0 0 0; font-weight: 500;">&mdash; The Collabora8r Team</p>
      </div>
      <div style="padding: 12px 0 0 0;">
        <p style="color: #c2410c; font-size: 0.65rem; margin: 0;">Collabora8r &bull; Project Management Suite</p>
      </div>
    </div>
  `, subject: `Your ${label} Code — Collabora8r` };
}

async function sendVerificationCode(email, code, purpose) {
  console.log(`[Verification] Code for ${email} (${purpose}): ${code}`);

  const { html, subject } = getEmailContent(code, purpose);

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

module.exports = { sendEmail, generateCode, sendVerificationCode };
