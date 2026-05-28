import { escapeHtml, paragraph, renderLayout } from '../layout.js';

const MAX_ITEMS = 10;

export function mentionDigestEmail({ name, items = [], appUrl = '' } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return { subject: '', html: null, text: null };

  const count = list.length;
  const subject = `${count} new mention${count === 1 ? '' : 's'} in Collabor8r`;
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  const shown = list.slice(0, MAX_ITEMS);
  const more = count - shown.length;
  const notificationsUrl = `${appUrl}/notifications`;

  const itemBlocks = shown
    .map(
      (it) =>
        `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e9e2d8;border-radius:10px">` +
        `<div style="font-size:15px;line-height:1.5;color:#1d1915"><strong>${escapeHtml(it.actorName)}</strong> ${escapeHtml(it.title)}</div>` +
        `<div style="font-size:13px;line-height:1.5;color:#6b645c;margin:2px 0 6px">${escapeHtml(it.projectName)}</div>` +
        `<a href="${escapeHtml(it.url)}" target="_blank" style="font-size:13px;color:#e4572e">View mention</a>` +
        `</div>`,
    )
    .join('');
  const moreHtml = more > 0 ? paragraph(`and ${more} more`) : '';

  const html = renderLayout({
    preheader: subject,
    eyebrow: 'Digest',
    title: 'You were mentioned',
    body: [paragraph(`Hi ${firstName}, you have new mentions.`), itemBlocks, moreHtml],
    cta: { url: notificationsUrl, label: 'Open notifications' },
    footnote: 'You can change email preferences in Settings.',
  });

  const lines = shown.map((it) => `- ${it.actorName} ${it.title} (${it.projectName}): ${it.url}`);
  if (more > 0) lines.push(`and ${more} more`);
  const text = [
    `Hi ${firstName}, you have new mentions.`,
    lines.join('\n'),
    `Open notifications: ${notificationsUrl}`,
    'You can change email preferences in Settings.',
  ].join('\n\n');

  return { subject, html, text };
}
