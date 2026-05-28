import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sendEmail } from '../client.js';
import { addedToProjectEmail } from '../templates/addedToProject.js';

// Sends the "added to project" email. Resolves true on success, false on failure or when no address is given.
export async function sendAddedToProject({ email, addedByName, projectName, projectId, roleLabel }) {
  try {
    if (!email) return false;
    const projectUrl = `${env.publicBaseUrl}/p/${projectId}/board`;
    const { subject, html, text } = addedToProjectEmail({ addedByName, projectName, roleLabel, projectUrl });
    await sendEmail({ to: email, subject, html, text });
    return true;
  } catch (err) {
    logger.error(`[email] failed to send added-to-project email to ${email}: ${err?.message || err}`);
    return false;
  }
}
