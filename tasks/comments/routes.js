// Task comment routes — mounted under /tasks.
// Paths: /:taskId/comments, /:taskId/comments/summary, /comments/:commentId
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const commentService = require('./service');
const { validate, required, isString } = require('../../lib/validate');

// Comment CRUD by commentId — static prefix so it doesn't clash with /:taskId/comments
router.put('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const comment = await commentService.edit(req.params.commentId, req.body.content, req.user.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    res.status(200).json({ message: 'Comment updated successfully.', comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update comment.' });
  }
});

router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const comment = await commentService.remove(req.params.commentId, req.user.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

router.post('/:taskId/comments', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const comment = await commentService.add(req.params.taskId, req.body.content, req.body.userId || req.user.id);
    res.status(201).json({ message: 'Comment added successfully.', comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

router.get('/:taskId/comments', authMiddleware, async (req, res) => {
  try {
    const comments = await commentService.listForTask(req.params.taskId);
    if (!comments) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json({ comments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// Canonical summarize — kills POST /ai/summarize-comments
router.get('/:taskId/comments/summary', authMiddleware, async (req, res) => {
  try {
    const result = await commentService.summarize(req.params.taskId);
    if (!result) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to summarize comments' });
  }
});

module.exports = router;
