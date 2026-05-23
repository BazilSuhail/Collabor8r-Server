// Activity feed: one list handler for project | task | user scopes via query params.
const { ActivityLog } = require('./models');

async function listActivity({ projectId, taskId, userId, limit }) {
  const query = {};
  if (projectId) query.projectId = projectId;
  if (taskId) {
    query.entityType = 'task';
    query.entityId = taskId;
  }
  if (userId) query.actorId = userId;

  const lim = Math.min(Number(limit) || (userId && !projectId && !taskId ? 30 : 50), 100);

  return ActivityLog.find(query)
    .sort({ timestamp: -1 })
    .limit(lim)
    .populate('actorId', 'name email avatar');
}

module.exports = { listActivity };
