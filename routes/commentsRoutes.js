const express = require('express');
const { addCommentToTask, getCommentsForTask, editComment, deleteComment, getProjectCreatorName } = require('../controllers/commentsController');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

router.post('/tasks/:taskId/comments', authMiddleware, addCommentToTask);
router.get('/tasks/:taskId/comments', authMiddleware, getCommentsForTask);
router.put('/:commentId', authMiddleware, editComment);
router.delete('/:commentId', authMiddleware, deleteComment);
router.get('/:id/name', authMiddleware, getProjectCreatorName);

module.exports = router;
