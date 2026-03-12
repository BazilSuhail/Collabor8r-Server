const express = require('express');
const { getNotifications, markNotificationsRead, getUnreadCount, getProfile, updateProfile } = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, getProfile);
router.put('/', authMiddleware, updateProfile);
router.get('/get-notifications', authMiddleware, getNotifications);
router.put('/notifications/mark-read', authMiddleware, markNotificationsRead);
router.get('/notifications/unread-count', authMiddleware, getUnreadCount);

module.exports = router;
