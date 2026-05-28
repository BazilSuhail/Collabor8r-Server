import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

// Resolves without throwing when no API key is set, so invites still work in development.
export async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    logger.warn(`[email] RESEND_API_KEY not set; skipping email to ${to}`);
    return null;
  }
  const { data, error } = await resend.emails.send({ from: env.emailFrom, to, subject, html, text });
  if (error) throw new Error(error.message || 'Resend failed to send email');
  return data;
}
