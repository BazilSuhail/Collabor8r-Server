// GET /activity/project/:projectId → activity feed for project
// GET /activity/task/:taskId → activity feed for a task
// GET /activity/user → current user's recent activity

const ActivityLog = require('../models/activityLog');

exports.getProjectActivity = async (req, res) => {
  try {
    const logs = await ActivityLog.find({ projectId: req.params.projectId })
      .sort({ timestamp: -1 }).limit(50).populate('actorId', 'name email avatar');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
};

exports.getTaskActivity = async (req, res) => {
  try {
    const logs = await ActivityLog.find({ entityType: 'task', entityId: req.params.taskId })
      .sort({ timestamp: -1 }).populate('actorId', 'name email avatar');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
};

exports.getUserActivity = async (req, res) => {
  try {
    const logs = await ActivityLog.find({ actorId: req.user.id })
      .sort({ timestamp: -1 }).limit(30).populate('actorId', 'name email avatar');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
};
