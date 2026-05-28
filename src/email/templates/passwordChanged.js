import { renderLayout, paragraph, detailRows, badge } from '../layout.js';
import { BRAND_NAME } from '../theme.js';

const SUBJECT = 'Your Collabor8r password was changed';
const BODY_TEXT =
  'Your password was changed and all of your sessions have been signed out. Sign in again on each device with your new password.';
const FOOTNOTE = 'If this was not you, reset your password right away.';
const CTA_LABEL = 'Secure my account';

// Formats a date as a readable UTC date and time, e.g. "9 Nov 2026, 14:05 UTC".
// Falls back to the raw value when it cannot be parsed.
function formatWhen(value) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(d);
  return `${date}, ${time} UTC`;
}

export function passwordChangedEmail({ name, changedAt, ip, supportUrl } = {}) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const when = formatWhen(changedAt);
  const ipValue = ip ? String(ip) : 'Unknown';
  const hasIp = Boolean(ip);

  const body = [
    paragraph(greeting),
    paragraph(BODY_TEXT),
    ...(hasIp ? [] : [`<div style="margin:0 0 12px">${badge('Action needed', 'warning')}</div>`]),
    detailRows([
      { label: 'When', value: when },
      { label: 'IP address', value: ipValue },
    ]),
  ];

  const html = renderLayout({
    preheader: 'Your Collabor8r password was changed. All sessions were signed out.',
    eyebrow: 'Security',
    title: 'Your password was changed',
    body,
    cta: { url: supportUrl, label: CTA_LABEL },
    footnote: FOOTNOTE,
  });

  const textLines = [
    greeting,
    '',
    BODY_TEXT,
    '',
    `When: ${when}`,
    `IP address: ${ipValue}`,
    ...(hasIp ? [] : ['', 'Action needed']),
    '',
    ...(supportUrl ? [`${CTA_LABEL}: ${supportUrl}`, ''] : []),
    FOOTNOTE,
    '',
    `${BRAND_NAME}`,
  ];

  return { subject: SUBJECT, html, text: textLines.join('\n') };
}
