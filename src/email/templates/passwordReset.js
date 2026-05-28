import { paragraph, renderLayout } from '../layout.js';

export function passwordResetEmail({ name, resetUrl, expiresInMinutes } = {}) {
  const who = name || 'there';
  const minutes = expiresInMinutes || 30;
  const subject = 'Reset your Collabor8r password';
  const intro = `Hi ${who},`;
  const ask = 'We received a request to reset your password. Use the button below to choose a new password.';
  const expiry = `This link expires in ${minutes} minutes.`;
  const footnote = 'If you did not ask for this, you can ignore this email. Your password stays the same.';

  const html = renderLayout({
    eyebrow: 'Account',
    title: 'Reset your password',
    body: [paragraph(intro), paragraph(ask), paragraph(expiry)],
    cta: { url: resetUrl, label: 'Choose a new password' },
    footnote,
  });
  const text = [
    intro,
    ask,
    expiry,
    `Choose a new password: ${resetUrl || ''}`,
    footnote,
  ].join('\n\n');
  return { subject, html, text };
}
