const ActivityLog = require('../models/activityLog');

async function logActivity({ actorId, action, entityType, entityId, projectId, changes, description }) {
  try {
    const entry = new ActivityLog({ actorId, action, entityType, entityId, projectId, changes, description });
    await entry.save();
    return entry;
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

module.exports = { logActivity };
