import { badge, detailRows, paragraph, renderLayout } from '../layout.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "12 November 2026, 09:30 UTC", or '' when the date is missing or invalid.
function formatReadable(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function inviteExpiringEmail({ inviterName, targetName, projectName, acceptUrl, expiresAt }) {
  const who = inviterName || 'Someone';
  const subject = `Your invite to ${projectName} expires soon`;
  const expiry = formatReadable(expiresAt);
  const greeting = targetName ? `Hi ${targetName},` : 'Hi there,';

  const html = renderLayout({
    preheader: `${who} invited you to ${projectName}. Accept before the invite expires.`,
    eyebrow: 'Reminder',
    title: 'Your invite expires soon',
    body: [
      paragraph(`${greeting} ${who} invited you to join ${projectName}. Accept it before the link expires.`),
      badge('Expires soon', 'warning'),
      detailRows([
        { label: 'Project', value: projectName },
        { label: 'Invited by', value: who },
        { label: 'Expires', value: expiry },
      ]),
    ].join(''),
    cta: { url: acceptUrl, label: 'Accept invite' },
    footnote: 'This link only works for the email address it was sent to.',
  });

  const text = [
    greeting,
    `${who} invited you to join ${projectName}. Accept it before the link expires.`,
    `Project: ${projectName}`,
    `Invited by: ${who}`,
    expiry ? `Expires: ${expiry}` : '',
    `Accept invite: ${acceptUrl}`,
    'This link only works for the email address it was sent to.',
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}
