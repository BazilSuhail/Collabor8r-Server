const Task = require('../models/tasks');
const Comment = require('../models/comments');
const Profile = require('../models/profile');
const { logActivity } = require('../utils/activityLogger');
const { validate, required, isString } = require('../utils/validate');

exports.getCommentsForTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const comments = await Comment.find({ _id: { $in: task.comments } }).lean();
    const commentsWithUser = await Promise.all(comments.map(async (c) => {
      const user = await Profile.findById(c.userId, 'name email avatar').lean();
      return { ...c, user: user || { name: 'Unknown', email: 'N/A', avatar: null } };
    }));

    res.status(200).json({ comments: commentsWithUser });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
};

exports.addCommentToTask = async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const { taskId } = req.params;
    const { content, userId } = req.body;

    const comment = new Comment({ content, userId: userId || req.user.id, taskId });
    await comment.save();
    await Task.findByIdAndUpdate(taskId, { $push: { comments: comment._id.toString() } });

    await logActivity({ actorId: req.user.id, action: 'comment_added', entityType: 'comment', entityId: comment._id, projectId: (await Task.findById(taskId).select('projectId').lean())?.projectId });

    res.status(201).json({ message: 'Comment added successfully.', comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment.' });
  }
};

exports.editComment = async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const comment = await Comment.findByIdAndUpdate(req.params.commentId, { content }, { new: true }).populate('userId', 'name');
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    await logActivity({ actorId: req.user.id, action: 'comment_edited', entityType: 'comment', entityId: comment._id });

    res.status(200).json({ message: 'Comment updated successfully.', comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update comment.' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findByIdAndDelete(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    await Task.findByIdAndUpdate(comment.taskId, { $pull: { comments: comment._id.toString() } });
    await logActivity({ actorId: req.user.id, action: 'comment_deleted', entityType: 'comment', entityId: req.params.commentId });

    res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
};

exports.getProjectCreatorName = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).select('name');
    if (!profile) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ name: profile.name });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
