import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendEmail } from '../client.js';
import { roleChangedEmail } from '../templates/roleChanged.js';

// Sends the "role changed" email. Resolves true on success, false on failure or when no address is given.
export async function sendRoleChanged({ email, changedByName, projectName, projectId, oldRoleLabel, newRoleLabel }) {
  try {
    if (!email) return false;
    const projectUrl = `${env.publicBaseUrl}/p/${projectId}/board`;
    const { subject, html, text } = roleChangedEmail({
      changedByName,
      projectName,
      oldRoleLabel,
      newRoleLabel,
      projectUrl,
    });
    await sendEmail({ to: email, subject, html, text });
    return true;
  } catch (err) {
    logger.error(`[email] failed to send role-changed email to ${email}: ${err?.message || err}`);
    return false;
  }
}
