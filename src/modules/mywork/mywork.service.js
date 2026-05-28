import { Issue, Worklog } from '../../models/index.js';
import { isoDay } from '../../utils/helpers.js';
import { paginate } from '../../utils/pagination.js';
import { listAccessibleProjectIds } from '../../services/access.service.js';

// Projects the caller can access, optionally narrowed to one of them.
async function scopeProjects(userId, projectId) {
  const ids = await listAccessibleProjectIds(userId);
  if (!projectId) return ids;
  return ids.filter((id) => String(id) === String(projectId));
}

export async function listMyIssues({ userId, query }) {
  const projectIds = await scopeProjects(userId, query.projectId);
  const filter = {
    projectId: { $in: projectIds },
    assigneeId: userId,
    statusCategory: { $ne: 'done' },
  };
  return paginate(Issue, filter, {
    sort: { updatedAt: -1, _id: -1 },
    cursorField: 'updatedAt',
    limit: query.limit,
    cursor: query.cursor,
  });
}

export async function listMyWorklogs({ userId, query }) {
  const projectIds = await scopeProjects(userId, query.projectId);
  const filter = { userId, projectId: { $in: projectIds } };
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = isoDay(query.from);
    if (query.to) filter.date.$lte = isoDay(query.to);
  }
  return paginate(Worklog, filter, { limit: query.limit, cursor: query.cursor });
}
