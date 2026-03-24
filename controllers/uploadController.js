// POST /uploads/task/:taskId → upload file(s) to task { files }
// POST /uploads/comment/:commentId → upload file(s) to comment { files }
// GET /uploads/task/:taskId → list files for task
// DELETE /uploads/:fileId → delete a file

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Task = require('../models/tasks');
const Comment = require('../models/comments');
const { logActivity } = require('../utils/activityLogger');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.xlsx', '.zip', '.csv', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

exports.uploadMiddleware = upload.array('files', 10);

exports.uploadToTask = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const files = req.files.map((f) => ({ name: f.originalname, path: f.filename, size: f.size, mimetype: f.mimetype }));
    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { $push: { attachments: { $each: files } } },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await logActivity({
      actorId: req.user.id,
      action: 'uploaded',
      entityType: 'task',
      entityId: task._id,
      entityName: task.title,
      projectId: task.projectId,
      description: `Uploaded ${files.length} file(s) to task "${task.title}"`,
    });

    res.status(201).json({ files, task });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
};

exports.uploadToComment = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const files = req.files.map((f) => ({ name: f.originalname, path: f.filename, size: f.size, mimetype: f.mimetype }));
    const comment = await Comment.findByIdAndUpdate(
      req.params.commentId,
      { $push: { attachments: { $each: files } } },
      { new: true }
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    res.status(201).json({ files, comment });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
};

exports.getTaskFiles = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).select('attachments');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task.attachments || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  }
};

exports.deleteFile = async (req, res) => {
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
    console.error('deleteFile:', err.message);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};
