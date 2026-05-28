// Shared role lists, rank maps, event types and activity kinds.

export const ORG_ROLES = ['owner', 'admin', 'member', 'guest', 'viewer'];
export const ORG_ROLE_RANK = { viewer: 1, guest: 2, member: 3, admin: 4, owner: 5 };

// Ordered highest first; used to map custom roles onto a system role.
export const PROJECT_ROLES = ['admin', 'lead', 'developer', 'reporter', 'viewer', 'guest'];
export const PROJECT_ROLE_RANK = { guest: 1, viewer: 2, reporter: 3, developer: 4, lead: 5, admin: 6 };

export const EVENT_TYPES = [
  'issue.created',
  'issue.updated',
  'issue.transitioned',
  'issue.deleted',
  'comment.added',
  'sprint.started',
  'sprint.completed',
  'member.added',
  'member.removed',
  'release.shipped',
  'page.updated',
  'form.submitted',
  'approval.decided',
];

export const ACTIVITY_KINDS = [
  'issueCreated',
  'issueUpdated',
  'statusChanged',
  'commentAdded',
  'sprintStarted',
  'sprintClosed',
  'memberAdded',
  'memberRemoved',
  'releaseShipped',
  'pageUpdated',
];

// Cumulative: each role includes the permissions of the role below it.
const VIEWER = ['project.view', 'issue.view', 'wiki.view', 'report.view'];
const REPORTER = [...VIEWER, 'issue.create', 'issue.comment', 'label.create', 'saved_filter.manage'];
const DEVELOPER = [
  ...REPORTER,
  'issue.edit',
  'issue.transition',
  'issue.link',
  'worklog.manage',
  'attachment.manage',
  'wiki.edit',
  'rank.manage',
];
const LEAD = [
  ...DEVELOPER,
  'issue.delete',
  'sprint.manage',
  'release.manage',
  'board.manage',
  'component.manage',
];
const ADMIN = [
  ...LEAD,
  'project.manage',
  'member.manage',
  'role.manage',
  'workflow.manage',
  'automation.manage',
  'webhook.manage',
  'audit.view',
];

export const DEFAULT_PROJECT_ROLE_PERMISSIONS = {
  guest: ['project.view', 'issue.view'],
  viewer: VIEWER,
  reporter: REPORTER,
  developer: DEVELOPER,
  lead: LEAD,
  admin: ADMIN,
};
