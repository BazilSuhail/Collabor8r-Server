import { detailRows, escapeHtml, paragraph, renderLayout } from '../layout.js';
import { color as c, size } from '../theme.js';

export function joinRequestReceivedEmail({ requesterName, projectName, message, requestedRole, reviewUrl } = {}) {
  const who = requesterName || 'Someone';
  const subject = `${who} asked to join ${projectName}`;
  const title = `${who} wants to join ${projectName}`;

  const quote = message
    ? `<p class="quote" style="margin:0 0 14px;padding-left:12px;border-left:3px solid ${c.brand};font-size:${size.body};line-height:1.6;white-space:pre-wrap;color:${c.muted}">${escapeHtml(message)}</p>`
    : '';

  const html = renderLayout({
    eyebrow: 'Join request',
    title,
    body: [
      paragraph(`${who} has asked to join ${projectName || 'your project'}. Review the request to approve or decline it.`),
      quote,
      detailRows([
        { label: 'Project', value: projectName },
        { label: 'Requested role', value: requestedRole },
      ]),
    ],
    cta: { url: reviewUrl, label: 'Review request' },
    footnote: 'You are getting this because you manage this project.',
  });

  const text = [
    `${who} has asked to join ${projectName || 'your project'}. Review the request to approve or decline it.`,
    message ? `Message: ${message}` : '',
    `Project: ${projectName || ''}`,
    requestedRole ? `Requested role: ${requestedRole}` : '',
    reviewUrl ? `Review request: ${reviewUrl}` : '',
    'You are getting this because you manage this project.',
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}
