import { sendEmail } from '../client.js';
import { passwordChangedEmail } from '../templates/passwordChanged.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export async function sendPasswordChanged({ email, name, changedAt, ip }) {
  if (!email) return false;
  try {
    const supportUrl = `${env.publicBaseUrl.replace(/\/+$/, '')}/profile/security`;
    const { subject, html, text } = passwordChangedEmail({
      name,
      changedAt: changedAt ?? new Date(),
      ip,
      supportUrl,
    });
    await sendEmail({ to: email, subject, html, text });
    return true;
  } catch (err) {
    logger.error('Failed to send password changed email', err);
    return false;
  }
}
