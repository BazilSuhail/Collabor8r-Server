import { BRAND_NAME, color as c, dark as d, font, radius, size } from './theme.js';

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const P = `margin:0 0 14px;font-size:${size.body};line-height:1.6;color:${c.ink}`;

// Escapes `text` and wraps it in a styled paragraph.
export const paragraph = (text) => `<p class="ink" style="${P}">${escapeHtml(text)}</p>`;

// rows: [{ label, value }] -> two-column table; empty values are skipped.
export function detailRows(rows = []) {
  const tr = rows
    .filter((r) => r && r.value != null && r.value !== '')
    .map(
      (r, i) =>
        `<tr><td class="muted line" style="padding:10px 12px 10px 0;font-size:13px;color:${c.muted};white-space:nowrap;vertical-align:top;${i ? `border-top:1px solid ${c.line};` : ''}">${escapeHtml(r.label)}</td><td class="ink line" style="padding:10px 0;font-size:14px;font-weight:600;color:${c.ink};${i ? `border-top:1px solid ${c.line};` : ''}">${escapeHtml(r.value)}</td></tr>`,
    )
    .join('');
  return tr ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border-collapse:collapse">${tr}</table>` : '';
}

const TONES = {
  success: [c.success, c.successSoft],
  warning: [c.warning, c.warningSoft],
  info: [c.info, c.infoSoft],
  brand: [c.brand, c.brandSoft],
};

// Small pill; tone is success | warning | info | brand (default brand).
export function badge(text, tone = 'brand') {
  const [fg, bg] = TONES[tone] || TONES.brand;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:${radius.pill};background:${bg};color:${fg};font-size:12px;font-weight:700;line-height:1.5">${escapeHtml(text)}</span>`;
}

// Bulletproof button: coloured table cell with a padded link inside.
export function ctaButton({ url, label } = {}) {
  if (!url || !label) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-wrap" style="margin:8px 0 20px"><tr><td align="center" bgcolor="${c.brand}" style="border-radius:${radius.button};background:${c.brand}"><a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${font.sans};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:${radius.button}">${escapeHtml(label)}</a></td></tr></table>`;
}

// Legacy helper kept for existing templates.
export const button = (url, label) => ctaButton({ url, label });

export const formatExpiry = (dt) => (dt ? new Date(dt).toUTCString().slice(0, 16) : '');

const css = `
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse}
a{color:${c.brand}}
.content h1{margin:0 0 14px;font-size:${size.title};line-height:1.25;font-weight:800;color:${c.ink}}
.content p{${P}}
.content .quote{border-left:3px solid ${c.brand};padding-left:12px;color:${c.muted}}
@media (max-width:600px){
.shell{width:100%!important}
.outer{padding:16px 8px!important}
.card{padding:24px 20px!important}
.title,.content h1{font-size:${size.titleMobile}!important}
.btn-wrap{width:100%!important}
.btn-wrap a{display:block!important}
}
@media (prefers-color-scheme:dark){
.bg{background:${d.page}!important}
.card{background:${d.surface}!important;border-color:${d.line}!important}
.ink,.title,.content h1,.content p{color:${d.ink}!important}
.muted,.content .quote{color:${d.muted}!important}
.faint{color:${d.faint}!important}
.line{border-color:${d.line}!important}
.eyebrow{background:${d.brandSoft}!important}
}`;

/**
 * Full HTML email document.
 * body: trusted HTML (build it with paragraph/detailRows/badge) or an array of such strings.
 * cta: { url, label }. All other fields are plain text and get escaped.
 * Legacy shape { title, content, footer } still works: content = body, footer = footnote,
 * and the heading is omitted because legacy content carries its own <h1>.
 */
export function renderLayout({ preheader = '', eyebrow = '', title = '', body, cta, footnote, content, footer } = {}) {
  const legacy = body === undefined && content !== undefined;
  const inner = [].concat(legacy ? content : body ?? '').join('');
  const note = footnote ?? footer ?? '';
  const t = escapeHtml(title);

  const heading = !legacy && title
    ? `<h1 class="title" style="margin:0 0 14px;font-size:${size.title};line-height:1.25;font-weight:800;color:${c.ink}">${t}</h1>`
    : '';
  const eyebrowHtml = eyebrow
    ? `<td align="right"><span class="eyebrow" style="display:inline-block;padding:4px 10px;border-radius:${radius.pill};background:${c.brandSoft};color:${c.brand};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(eyebrow)}</span></td>`
    : '';
  const noteHtml = note
    ? `<p class="faint line" style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${c.line};font-size:${size.small};line-height:1.5;color:${c.faint}">${escapeHtml(note)}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${t}</title><style>${css}</style></head>
<body class="bg" style="margin:0;padding:0;background:${c.page};font-family:${font.sans}">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="${c.page}" style="background:${c.page}"><tr><td align="center" class="outer" style="padding:32px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="shell" style="width:${size.width};max-width:${size.width}">
<tr><td style="padding:0 4px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${font.sans};font-size:19px;font-weight:800;letter-spacing:-.01em;color:${c.ink}" class="ink"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.brand};margin-right:8px;vertical-align:middle;line-height:10px;font-size:0">&nbsp;</span><span style="vertical-align:middle">${BRAND_NAME}</span></td>${eyebrowHtml}
</tr></table></td></tr>
<tr><td class="card" bgcolor="${c.surface}" style="background:${c.surface};border:1px solid ${c.line};border-radius:${radius.card};padding:32px;font-family:${font.sans};color:${c.ink}">
<div class="content">${heading}${inner}${ctaButton(cta)}${noteHtml}</div>
</td></tr>
<tr><td class="muted" align="center" style="padding:20px 16px 0;font-family:${font.sans};font-size:${size.small};line-height:1.6;color:${c.muted}">You are receiving this because you have an account on ${BRAND_NAME}.<br><span class="faint" style="color:${c.faint}">${BRAND_NAME} &middot; [Company address]</span></td></tr>
</table>
</td></tr></table>
</body></html>`;
}
