import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendEmail } from '../client.js';
import { joinRequestDecidedEmail } from '../templates/joinRequestDecided.js';

// Sends the join request decision email. Resolves true on success, false on failure or when no address is given.
export async function sendJoinRequestDecided({ email, projectName, projectId, approved, role, declineReason }) {
  try {
    if (!email) return false;
    const base = env.publicBaseUrl.replace(/\/+$/, '');
    const projectUrl = `${base}/p/${projectId}/board`;
    const { subject, html, text } = joinRequestDecidedEmail({ projectName, approved, role, declineReason, projectUrl });
    await sendEmail({ to: email, subject, html, text });
    return true;
  } catch (err) {
    logger.error(`[email] failed to send join request decision email to ${email}: ${err?.message || err}`);
    return false;
  }
}
