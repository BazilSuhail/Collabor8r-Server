import { badge, escapeHtml, paragraph, renderLayout } from '../layout.js';
import { color as c, size } from '../theme.js';

export function joinRequestDecidedEmail({ projectName, approved, role, declineReason, projectUrl } = {}) {
  const name = projectName || 'the project';
  const roleLabel = role || 'Member';

  if (approved) {
    const subject = `You're in: ${name}`;
    const body = [
      paragraph(`Your request to join ${name} was approved. You now have access to the project.`),
      `<p class="ink" style="margin:0 0 14px;font-size:${size.body};line-height:1.6;color:${c.ink}">Your role: ${badge(roleLabel, 'success')}</p>`,
    ];
    const html = renderLayout({
      preheader: `Your request to join ${name} was approved.`,
      eyebrow: 'Request approved',
      title: `Welcome to ${name}`,
      body,
      cta: { url: projectUrl, label: 'Open project' },
    });
    const text = [
      `Welcome to ${name}.`,
      `Your request to join ${name} was approved. You now have access to the project as ${roleLabel}.`,
      projectUrl ? `Open project: ${projectUrl}` : '',
    ].filter(Boolean).join('\n\n');
    return { subject, html, text };
  }

  const subject = `Your request to join ${name}`;
  const reason = declineReason
    ? `<div class="quote" style="margin:0 0 18px;border-left:3px solid ${c.brand};padding-left:12px;font-size:${size.body};line-height:1.6;color:${c.muted}">${escapeHtml(declineReason)}</div>`
    : '';
  const body = [
    paragraph(`Thanks for your interest in ${name}. Unfortunately, your request to join was not approved this time.`),
    reason,
  ];
  const html = renderLayout({
    preheader: `Your request to join ${name} was not approved.`,
    eyebrow: 'Request declined',
    title: 'Your request was not approved',
    body,
    footnote: 'You can request access again later.',
  });
  const text = [
    `Thanks for your interest in ${name}. Unfortunately, your request to join was not approved this time.`,
    declineReason ? `Reason: ${declineReason}` : '',
    'You can request access again later.',
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
