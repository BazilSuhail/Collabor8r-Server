// Private-issue visibility helpers for lists/feeds that are not scoped to a single issue.
// Mirrors issue.service.js assertVisible/privateFilter (kept local to avoid an import cycle).
import { Issue } from '../models/index.js';
import { PROJECT_ROLE_RANK } from '../config/constants.js';

// Leads and above see every private issue.
export const canSeePrivateIssues = (role) => (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK.lead;

// Same rule as assertVisible, for an already-loaded issue and a resolved rank/role.
export const canUserSeeIssue = (issue, userId, role) => {
  if (!issue?.isPrivate || canSeePrivateIssues(role)) return true;
  return [issue.reporterId, issue.assigneeId, ...(issue.allowedUserIds ?? [])].some(
    (id) => id && String(id) === String(userId)
  );
};

// Ids of private issues the viewer may NOT see. [] for privileged viewers (no query).
export async function hiddenIssueIds(projectId, viewerId, seesPrivate) {
  if (seesPrivate) return [];
  return Issue.distinct('_id', {
    projectId,
    isPrivate: true,
    $nor: [{ allowedUserIds: viewerId }, { reporterId: viewerId }, { assigneeId: viewerId }],
  });
}

// Adds { [field]: { $nin: hidden } } to a filter. `both` also lists string forms (for Mixed fields).
export async function withIssueVisibility(filter, field, { projectId, viewerId, seesPrivate, both = false }) {
  const hidden = await hiddenIssueIds(projectId, viewerId, seesPrivate);
  if (!hidden.length) return filter;
  const list = both ? [...hidden, ...hidden.map(String)] : hidden;
  return { ...filter, [field]: { $nin: list } };
}
