import { renderLayout, paragraph, detailRows, escapeHtml } from '../layout.js';

// Notifies a member that their role on a project changed.
export function roleChangedEmail({ changedByName, projectName, oldRoleLabel, newRoleLabel, projectUrl } = {}) {
  const by = String(changedByName ?? '').trim() || 'Someone';
  const subject = `Your role in ${projectName} changed to ${newRoleLabel}`;

  const html = renderLayout({
    preheader: `${by} changed your role in ${projectName} to ${newRoleLabel}.`,
    eyebrow: 'Role update',
    title: 'Your role changed',
    body: [
      paragraph(`${by} changed your role in ${projectName}.`),
      detailRows([
        { label: 'Project', value: projectName },
        { label: 'Previous role', value: oldRoleLabel },
        { label: 'New role', value: newRoleLabel },
        { label: 'Changed by', value: by },
      ]),
    ],
    cta: { url: projectUrl, label: 'Open project' },
    footnote: 'Your access now follows the new role.',
  });

  const text = [
    'Role update',
    '',
    'Your role changed',
    '',
    `${by} changed your role in ${projectName}.`,
    '',
    `Project: ${projectName}`,
    `Previous role: ${oldRoleLabel}`,
    `New role: ${newRoleLabel}`,
    `Changed by: ${by}`,
    '',
    `Open project: ${projectUrl}`,
    '',
    'Your access now follows the new role.',
  ]
    .filter((line, i, arr) => line !== '' || (arr[i - 1] !== '' && i !== 0))
    .join('\n');

  return { subject, html, text };
}
