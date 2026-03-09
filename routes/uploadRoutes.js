const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/uploadController');

router.post('/task/:taskId', authMiddleware, ctrl.uploadMiddleware, ctrl.uploadToTask);
router.post('/comment/:commentId', authMiddleware, ctrl.uploadMiddleware, ctrl.uploadToComment);
router.get('/task/:taskId', authMiddleware, ctrl.getTaskFiles);
router.delete('/:fileId', authMiddleware, ctrl.deleteFile);

module.exports = router;
