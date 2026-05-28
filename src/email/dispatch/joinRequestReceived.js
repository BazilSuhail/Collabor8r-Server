import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendEmail } from '../client.js';
import { joinRequestReceivedEmail } from '../templates/joinRequestReceived.js';

// Sends one "join request received" email per unique admin address. Returns how many were actually sent.
export async function sendJoinRequestReceived({ adminEmails, requesterName, projectName, projectId, message, requestedRole }) {
  const base = env.publicBaseUrl.replace(/\/+$/, '');
  const reviewUrl = `${base}/p/${encodeURIComponent(projectId)}/settings/people`;

  const seen = new Set();
  const recipients = [];
  for (const raw of adminEmails || []) {
    const to = typeof raw === 'string' ? raw.trim() : '';
    if (!to || seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    recipients.push(to);
  }

  let sent = 0;
  for (const to of recipients) {
    try {
      const { subject, html, text } = joinRequestReceivedEmail({
        requesterName,
        projectName,
        message,
        requestedRole,
        reviewUrl,
      });
      const result = await sendEmail({ to, subject, html, text });
      if (result) sent += 1;
    } catch (err) {
      logger.error(`[email] join request notice to ${to} failed: ${err.message}`);
    }
  }
  return sent;
}
