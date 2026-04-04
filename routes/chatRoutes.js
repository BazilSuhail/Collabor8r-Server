const express = require('express');
const router = express.Router();
const chat = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/:projectId/messages', authMiddleware, chat.getMessages);
router.post('/:projectId/messages', authMiddleware, chat.sendMessage);

module.exports = router;
