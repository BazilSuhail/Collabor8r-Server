// Git commits linked to tasks/projects + GitHub webhook verification/handling.
const crypto = require('crypto');
const { GitCommit } = require('./models');
const { Task } = require('../tasks/models');
const { logActivity } = require('../utils/activityLogger');
const { sendToProjectRoom } = require('../socket');

async function linkCommit({ taskId, commitHash, message, author, branch, url, committedAt }, userId) {
  const task = await Task.findById(taskId).select('projectId title').lean();
  if (!task) throw new Error('Task not found');

  const existing = await GitCommit.findOne({ commitHash });
  if (existing) throw Object.assign(new Error('Commit already linked'), { code: 'DUPLICATE' });

  const commit = await GitCommit.create({
    taskId,
    projectId: task.projectId,
    commitHash,
    message,
    author: author || {},
    branch,
    url,
    committedAt: committedAt || Date.now(),
  });

  await logActivity({
    actorId: userId,
    action: 'linked',
    entityType: 'gitCommit',
    entityId: commit._id,
    entityName: commit.commitHash.slice(0, 8),
    projectId: task.projectId,
    description: `Commit ${commit.commitHash.slice(0, 8)} linked to task "${task.title}"`,
  });

  sendToProjectRoom(String(task.projectId), 'commit:linked', {
    commit,
    taskTitle: task.title,
    actor: { userId },
    timestamp: Date.now(),
  });

  return commit;
}

// Task-scoped list.
async function listByTask(taskId) {
  return GitCommit.find({ taskId }).sort({ committedAt: -1 }).lean();
}

// Project-scoped list with pagination + optional branch filter.
async function listByProject(projectId, { page = 1, limit = 50, branch } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  const query = { projectId };
  if (branch) query.branch = branch;

  const [commits, total] = await Promise.all([
    GitCommit.find(query)
      .populate('taskId', 'title status')
      .sort({ committedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    GitCommit.countDocuments(query),
  ]);

  return {
    commits,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  };
}

async function unlinkCommit(commitId, userId) {
  const commit = await GitCommit.findByIdAndDelete(commitId);
  if (!commit) throw new Error('Commit not found');

  await logActivity({
    actorId: userId,
    action: 'unlinked',
    entityType: 'gitCommit',
    entityId: commit._id,
    entityName: commit.commitHash.slice(0, 8),
    projectId: commit.projectId,
    description: `Commit ${commit.commitHash.slice(0, 8)} unlinked from task`,
  });

  sendToProjectRoom(String(commit.projectId), 'commit:unlinked', {
    commitId: commit._id,
    commitHash: commit.commitHash,
    actor: { userId },
    timestamp: Date.now(),
  });

  return commit;
}

// HMAC verification when GIT_WEBHOOK_SECRET is set (sha256= header or plain token).
function verifyWebhookSignature(req) {
  const secret = process.env.GIT_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = req.headers['x-hub-signature-256'] || req.headers['x-gitlab-token'];
  if (signature && signature.startsWith('sha256=')) {
    const raw = req.rawBuffer ||
      (typeof req.body === 'string' ? req.body :
        Buffer.isBuffer(req.body) ? req.body :
        Buffer.from(JSON.stringify(req.body)));
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return signature === secret;
}

// Matches task refs in commit messages: [#KEY-123] or task: KEY-123 / fixes: KEY-123
async function handleWebhook(payload) {
  const commits = payload.commits || [];
  const branch = (payload.ref || '').replace('refs/heads/', '');

  let linked = 0;
  for (const c of commits) {
    const taskIdMatch = c.message.match(/\[#(\w+-\d+)\]|\b(?:task|fix|closes?|resolves?)\s*[:#](\w+-\d+)/i);
    if (!taskIdMatch) continue;

    const taskRef = taskIdMatch[1] || taskIdMatch[2];
    const escapedRef = taskRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const task = await Task.findOne({ title: new RegExp(escapedRef, 'i') }).select('projectId title').lean();
    if (!task) continue;

    const existing = await GitCommit.findOne({ commitHash: c.id });
    if (existing) continue;

    await GitCommit.create({
      taskId: task._id,
      projectId: task.projectId,
      commitHash: c.id,
      message: c.message,
      author: { name: c.author?.name, email: c.author?.email },
      branch,
      url: c.url,
      committedAt: c.timestamp || Date.now(),
    });

    linked++;
  }

  return { linked };
}

module.exports = {
  linkCommit,
  listByTask,
  listByProject,
  unlinkCommit,
  verifyWebhookSignature,
  handleWebhook,
};
