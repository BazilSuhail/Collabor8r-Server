// Task comments: CRUD + LLM summarize (canonical — single implementation).
const { Comment } = require('./models');
const { Task } = require('../../tasks/models');
const { Profile } = require('../../auth/models');
const { promptLLM } = require('../../lib/ai');
const { logActivity } = require('../../utils/activityLogger');
const { sendToProjectRoom } = require('../../socket');
const { sendNotification } = require('../../notifications/service');

async function listForTask(taskId) {
  const task = await Task.findById(taskId).lean();
  if (!task) return null;

  const comments = await Comment.find({ taskId }).lean();
  const userIds = [...new Set(comments.map((c) => c.userId?.toString()).filter(Boolean))];
  const users = userIds.length
    ? await Profile.find({ _id: { $in: userIds } }).select('name email avatar').lean()
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  return comments.map((c) => ({
    ...c,
    user: userMap[c.userId?.toString()] || { name: 'Unknown', email: 'N/A', avatar: null },
  }));
}

// Canonical summarize — author-attributed, newest-first, 2-3 bullet points.
async function summarize(taskId) {
  const task = await Task.findById(taskId).lean();
  if (!task) return null;

  const comments = await Comment.find({ taskId })
    .populate('userId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  if (!comments.length) return { summary: 'No comments to summarize.', commentCount: 0 };

  const text = comments.map((c) => `${c.userId?.name || 'Unknown'}: ${c.content}`).join('\n');
  const summary = await promptLLM(
    `Summarize this discussion thread in 2-3 bullet points:\n${text}`,
    { temperature: 0.3, maxTokens: 250 }
  );

  return { summary, commentCount: comments.length };
}

async function add(taskId, content, userId) {
  const comment = new Comment({ content, userId, taskId });
  await comment.save();

  const task = await Task.findById(taskId).select('projectId title assignedTo').lean();

  await logActivity({
    actorId: userId,
    action: 'comment_added',
    entityType: 'comment',
    entityId: comment._id,
    entityName: content?.slice(0, 50),
    projectId: task?.projectId,
    description: `Comment added on task "${task?.title || ''}"`,
  });

  if (task?.projectId) {
    sendToProjectRoom(String(task.projectId), 'comment:created', {
      comment,
      taskId,
      taskTitle: task.title,
      actor: { userId },
      timestamp: Date.now(),
    });

    if (task.assignedTo && String(task.assignedTo) !== String(userId)) {
      const actor = await Profile.findById(userId).select('name').lean();
      sendNotification(task.assignedTo, 'commentAdded', {
        taskId: task._id,
        taskTitle: task.title,
        projectId: task.projectId,
        actorName: actor?.name || 'Someone',
        commentPreview: content?.slice(0, 100),
        message: `${actor?.name || 'Someone'} commented on "${task.title}"`,
      });
    }
  }

  return comment;
}

async function edit(commentId, content, userId) {
  const comment = await Comment.findByIdAndUpdate(commentId, { content }, { returnDocument: 'after' })
    .populate('userId', 'name');
  if (!comment) return null;

  await logActivity({
    actorId: userId,
    action: 'comment_edited',
    entityType: 'comment',
    entityId: comment._id,
    entityName: comment.content?.slice(0, 50),
  });

  const task = await Task.findById(comment.taskId).select('projectId title').lean();
  if (task?.projectId) {
    sendToProjectRoom(String(task.projectId), 'comment:edited', {
      comment,
      taskId: comment.taskId,
      taskTitle: task.title,
      actor: { userId },
      timestamp: Date.now(),
    });
  }

  return comment;
}

async function remove(commentId, userId) {
  const comment = await Comment.findByIdAndDelete(commentId);
  if (!comment) return null;

  await logActivity({
    actorId: userId,
    action: 'comment_deleted',
    entityType: 'comment',
    entityId: comment._id,
    entityName: comment.content?.slice(0, 50),
  });

  const task = await Task.findById(comment.taskId).select('projectId title').lean();
  if (task?.projectId) {
    sendToProjectRoom(String(task.projectId), 'comment:deleted', {
      commentId: comment._id,
      taskId: comment.taskId,
      taskTitle: task.title,
      actor: { userId },
      timestamp: Date.now(),
    });
  }

  return comment;
}

module.exports = { listForTask, summarize, add, edit, remove };
