// Git routes — commits linked to tasks/projects + GitHub webhook.
// GET /git/commits?taskId=|projectId= merges task- and project-scoped lists.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const gitService = require('./service');
const { validate, required, isString, isMongoId } = require('../lib/validate');

router.post('/commits', authMiddleware, async (req, res) => {
  try {
    const errors = validate({
      taskId: [required, isMongoId],
      commitHash: [required, isString],
      message: [required, isString],
    }, req.body);
    if (errors) return res.status(400).json({ errors });
    const commit = await gitService.linkCommit({ ...req.body }, req.user.id);
    res.status(201).json(commit);
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    if (err.message === 'Task not found') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to link commit' });
  }
});

// Unified list: ?taskId= for task scope, ?projectId= (with optional page/limit/branch) for project scope.
router.get('/commits', authMiddleware, async (req, res) => {
  try {
    const { taskId, projectId, page, limit, branch } = req.query;
    if (taskId) {
      const commits = await gitService.listByTask(taskId);
      return res.status(200).json({ commits });
    }
    if (projectId) {
      const result = await gitService.listByProject(projectId, { page, limit, branch });
      return res.status(200).json(result);
    }
    res.status(400).json({ error: 'taskId or projectId is required' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

router.delete('/commits/:commitId', authMiddleware, async (req, res) => {
  try {
    await gitService.unlinkCommit(req.params.commitId, req.user.id);
    res.status(200).json({ message: 'Commit unlinked' });
  } catch (err) {
    res.status(err.message === 'Commit not found' ? 404 : 500).json({ error: err.message || 'Failed to unlink commit' });
  }
});

// Unauthenticated webhook (signature verified inside service when GIT_WEBHOOK_SECRET set).
router.post('/webhook', async (req, res) => {
  try {
    if (!gitService.verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const { linked } = await gitService.handleWebhook(req.body);
    res.status(200).json({ message: 'Webhook processed', linked });
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
