import { paragraph, renderLayout } from '../layout.js';

const POINTS = [
  'Create a project for each piece of work you run',
  'Invite your team and set who can see and change what',
  'Track issues on a board from to-do through to done',
];

export function welcomeEmail({ name, appUrl } = {}) {
  const first = String(name ?? '').trim().split(/\s+/)[0] || 'there';
  const dashboardUrl = `${appUrl}/dashboard`;
  const subject = `Welcome to Collabor8r, ${first}`;
  const intro = 'Collabor8r keeps your projects, your team and your issues in one place. Here is where to start.';
  const html = renderLayout({
    eyebrow: 'Welcome',
    title: `You're in, ${first}`,
    body: [
      paragraph(intro),
      ...POINTS.map((p) => paragraph(`✓ ${p}`)),
    ],
    cta: { url: dashboardUrl, label: 'Open your workspace' },
    footnote: 'Need help? Reply to this email.',
    preheader: `Your Collabor8r workspace is ready, ${first}.`,
  });
  const text = [
    `Hi ${first},`,
    intro,
    ...POINTS.map((p) => `✓ ${p}`),
    `Open your workspace: ${dashboardUrl}`,
    'Need help? Reply to this email.',
  ].join('\n\n');
  return { subject, html, text };
}
