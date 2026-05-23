// Notification routes — own resource, no longer nested under /profile.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getNotifications, markAsRead, getUnreadCount } = require('./service');

router.get('/', authMiddleware, async (req, res) => {
  try {
    res.status(200).json(await getNotifications(req.user.id));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/read', authMiddleware, async (req, res) => {
  try {
    const { index } = req.body;
    const result = await markAsRead(req.user.id, index);
    res.status(200).json({ message: 'Notifications marked as read', result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    res.status(200).json({ unreadCount: await getUnreadCount(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

module.exports = router;
