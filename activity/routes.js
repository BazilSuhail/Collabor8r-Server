// Activity feed — single query-param-driven endpoint (merges project/task/user scopes).
// GET /activity?projectId=&taskId=&limit=  (defaults to current user when no scope given)
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listActivity } = require('./service');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { projectId, taskId, limit } = req.query;
    const logs = await listActivity({
      projectId,
      taskId,
      userId: (!projectId && !taskId) ? req.user.id : req.query.userId,
      limit,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
