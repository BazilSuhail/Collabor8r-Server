// Task attachment upload routes — mounted under /tasks.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../../middleware/authMiddleware');
const upload = require('../../lib/upload');
const { Task } = require('../models');
const { Comment } = require('../comments/models');
const { logActivity } = require('../../utils/activityLogger');

const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');
const uploadMiddleware = upload.array('files', 10);

router.post('/:taskId/attachments', authMiddleware, uploadMiddleware, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const files = req.files.map((f) => ({ name: f.originalname, path: f.filename, size: f.size, mimetype: f.mimetype }));
    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { $push: { attachments: { $each: files } } },
      { returnDocument: 'after' }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await logActivity({
      actorId: req.user.id, action: 'uploaded', entityType: 'task',
      entityId: task._id, entityName: task.title, projectId: task.projectId,
      description: `Uploaded ${files.length} file(s) to task "${task.title}"`,
    });
    res.status(201).json({ files, task });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/:taskId/attachments', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).select('attachments');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task.attachments || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Static prefix to avoid clash with /:taskId/...
router.post('/comments/:commentId/attachments', authMiddleware, uploadMiddleware, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const files = req.files.map((f) => ({ name: f.originalname, path: f.filename, size: f.size, mimetype: f.mimetype }));
    const comment = await Comment.findByIdAndUpdate(
      req.params.commentId,
      { $push: { attachments: { $each: files } } },
      { returnDocument: 'after' }
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    res.status(201).json({ files, comment });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.delete('/attachments/:fileId', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const task = await Task.findOne({ 'attachments._id': fileId });
    const comment = await Comment.findOne({ 'attachments._id': fileId });
    const owner = task || comment;
    if (!owner) return res.status(404).json({ error: 'File not found' });

    const attachment = (task?.attachments || comment?.attachments || []).find((a) => String(a._id) === String(fileId));
    if (attachment?.path) {
      const filePath = path.join(uploadDir, path.basename(attachment.path));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.error('deleteFile: physical file removal failed:', unlinkErr.message);
      }
    }

    if (task) {
      task.attachments = task.attachments.filter((a) => String(a._id) !== String(fileId));
      await task.save();
    } else {
      comment.attachments = comment.attachments.filter((a) => String(a._id) !== String(fileId));
      await comment.save();
    }
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
