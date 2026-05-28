import { detailRows, escapeHtml, formatExpiry, paragraph, renderLayout } from '../layout.js';
import { color as c, font, radius, size } from '../theme.js';

const QUOTE = `margin:4px 0 18px;padding:12px 16px;border-left:3px solid ${c.brand};border-radius:0 ${radius.button} ${radius.button} 0;background:${c.brandSoft};font-family:${font.sans};font-size:${size.body};line-height:1.6;font-style:italic;color:${c.ink}`;

export function projectInviteEmail({ inviterName, targetName, projectName, roleLabel, acceptUrl, message, expiresAt }) {
  const who = inviterName || 'Someone';
  const subject = `${who} invited you to join the project ${projectName}`;
  const expiry = formatExpiry(expiresAt);
  const title = `${who} invited you to ${projectName}`;

  const intro = paragraph(`You have been invited to join ${projectName} as ${roleLabel}.`);
  const quote = message ? `<div class="quote" style="${QUOTE}">${escapeHtml(message)}</div>` : '';
  const details = detailRows([
    { label: 'Project', value: projectName },
    { label: 'Role', value: roleLabel },
    { label: 'Invited by', value: who },
    { label: 'Expires', value: expiry },
  ]);

  const html = renderLayout({
    preheader: `${who} invited you to ${projectName}`,
    eyebrow: 'Project invite',
    title,
    body: [intro, quote, details],
    cta: { url: acceptUrl, label: 'Accept invite' },
    footnote: 'This link only works for the email address it was sent to. If you did not expect this, you can ignore it.',
  });

  const text = [
    title,
    `You have been invited to join ${projectName} as ${roleLabel}.`,
    message ? `Message: ${message}` : '',
    `Project: ${projectName}`,
    `Role: ${roleLabel}`,
    `Invited by: ${who}`,
    expiry ? `Expires: ${expiry}` : '',
    `Accept invite: ${acceptUrl}`,
    'This link only works for the email address it was sent to. If you did not expect this, you can ignore it.',
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}
