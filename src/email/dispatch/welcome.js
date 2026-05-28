import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendEmail } from '../client.js';
import { welcomeEmail } from '../templates/welcome.js';

// Sends the welcome email. Resolves true on success, false on failure or when no address is given.
export async function sendWelcome({ email, name }) {
  try {
    if (!email) return false;
    const { subject, html, text } = welcomeEmail({ name, appUrl: env.publicBaseUrl });
    await sendEmail({ to: email, subject, html, text });
    return true;
  } catch (err) {
    logger.error(`[email] failed to send welcome email to ${email}: ${err?.message || err}`);
    return false;
  }
}
