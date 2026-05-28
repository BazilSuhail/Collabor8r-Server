import { ctaButton, detailRows, paragraph, renderLayout } from '../layout.js';

export function addedToProjectEmail({ addedByName, projectName, roleLabel, projectUrl } = {}) {
  const who = addedByName || 'Someone';
  const subject = `${who} added you to ${projectName}`;
  const sentence = `${who} added you to the project ${projectName} with the role ${roleLabel}.`;
  const html = renderLayout({
    eyebrow: 'Project access',
    title: `You have been added to ${projectName}`,
    body: [
      paragraph(sentence),
      detailRows([
        { label: 'Project', value: projectName },
        { label: 'Your role', value: roleLabel },
        { label: 'Added by', value: addedByName || 'Someone' },
      ]),
    ],
    cta: { url: projectUrl, label: 'Open project' },
    footnote: 'If you did not expect this, contact the project admin.',
  });
  const text = [
    `You have been added to ${projectName}`,
    sentence,
    `Project: ${projectName}`,
    `Your role: ${roleLabel}`,
    `Added by: ${who}`,
    `Open project: ${projectUrl}`,
    'If you did not expect this, contact the project admin.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { subject, html, text };
}
