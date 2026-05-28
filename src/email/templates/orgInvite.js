import { detailRows, escapeHtml, formatExpiry, paragraph, renderLayout } from '../layout.js';
import { color as c } from '../theme.js';

export function orgInviteEmail({ inviterName, targetName, orgName, roleLabel, acceptUrl, message, expiresAt }) {
  const who = inviterName || 'Someone';
  const subject = `${who} invited you to join ${orgName}`;
  const expiry = formatExpiry(expiresAt);

  const quote = message
    ? `<p class="quote" style="margin:4px 0 18px;padding-left:12px;border-left:3px solid ${c.brand};font-size:15px;line-height:1.6;color:${c.muted}">${escapeHtml(message)}</p>`
    : '';

  const html = renderLayout({
    preheader: subject,
    eyebrow: 'Organization invite',
    title: `${who} invited you to ${orgName}`,
    body: [
      paragraph(`Joining gives you access to the projects in ${orgName}.`),
      quote,
      detailRows([
        { label: 'Organization', value: orgName },
        { label: 'Role', value: roleLabel },
        { label: 'Invited by', value: who },
        { label: 'Expires', value: expiry },
      ]),
    ],
    cta: { url: acceptUrl, label: 'Join organization' },
    footnote: 'This link only works for the email address it was sent to.',
  });

  const text = [
    `${who} invited you to ${orgName}.`,
    `Joining gives you access to the projects in ${orgName}.`,
    message ? `Message: ${message}` : '',
    `Organization: ${orgName}`,
    `Role: ${roleLabel}`,
    `Invited by: ${who}`,
    expiry ? `Expires: ${expiry}` : '',
    `Join organization: ${acceptUrl}`,
    'This link only works for the email address it was sent to.',
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}
