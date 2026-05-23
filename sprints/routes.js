// Sprint routes — CRUD, activate/complete, task membership, canonical retrospective, AI create.
// Kills POST /ai/retrospective → GET /sprints/:sprintId/retrospective
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Sprint } = require('./models');
const { Task } = require('../tasks/models');
const { Project } = require('../projects/models');
const { createSprint, addTasksToSprint, removeTasksFromSprint, completeSprint } = require('./service');
const { isDoneStatus } = require('../tasks/service');
const { promptLLMStructured } = require('../lib/ai');
const { validate, required, isString, isDate, isArray } = require('../lib/validate');
const { logActivity } = require('../utils/activityLogger');
const { sendToProjectRoom } = require('../socket');

// AI create — POST /sprints/ai/create
router.post('/ai/create', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findById(projectId).select('name').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const schema = [
      '{',
      '  "name": string,',
      '  "goal": string | null,',
      '  "startDate": string (ISO date, default today if not specified),',
      '  "endDate": string (ISO date, default 2 weeks after start if not specified),',
      '  "durationDays": number | null (optional explicit duration)',
      '}',
    ].join('\n');

    const parsed = await promptLLMStructured(
      `Create a sprint for project "${project.name}" from this intent:\n"${prompt}"`,
      schema,
      {
        temperature: 0.3, maxTokens: 400,
        systemPrompt: 'You are a sprint planning assistant. Extract a concise sprint name (max 6 words), a clear goal, and sensible dates. Use ISO date strings (YYYY-MM-DD). If dates are implied relatively (e.g. "next week"), compute them relative to today. Today is ' + new Date().toISOString().slice(0, 10) + '.',
      }
    );

    const today = new Date().toISOString().slice(0, 10);
    const start = parsed.startDate ? new Date(parsed.startDate) : new Date(today);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date from AI' });

    const durationDays = Number(parsed.durationDays);
    let end = parsed.endDate ? new Date(parsed.endDate) : null;
    if (!end || isNaN(end.getTime())) {
      end = new Date(start.getTime() + (durationDays > 0 ? durationDays : 14) * 24 * 60 * 60 * 1000);
    }
    if (end <= start) end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

    const sprint = await createSprint({
      name: parsed.name || prompt.slice(0, 60),
      goal: parsed.goal || '',
      projectId,
      startDate: start,
      endDate: end,
    }, req.user.id);

    res.status(201).json({ sprint, aiExtracted: { name: parsed.name, goal: parsed.goal, startDate: start, endDate: end } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sprint from natural language', detail: err.message });
  }
});

// GET /sprints?projectId=
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    res.json(await Sprint.find({ projectId }).sort({ startDate: -1 }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
});

// POST /sprints — projectId in body (was POST /sprints/:projectId)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const errors = validate({
      name: [required, isString],
      startDate: [required, isDate],
      endDate: [required, isDate],
      projectId: [required],
    }, req.body);
    if (errors) return res.status(400).json({ errors });
    const sprint = await createSprint(req.body, req.user.id);
    res.status(201).json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sprint' });
  }
});

// GET /sprints/:sprintId
router.get('/:sprintId', authMiddleware, async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    const tasks = await Task.find({ sprintId: sprint._id });
    res.json({ ...sprint.toObject(), tasks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sprint' });
  }
});

// PUT /sprints/:sprintId
router.put('/:sprintId', authMiddleware, async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    const changes = [];
    for (const key of ['name', 'goal', 'startDate', 'endDate']) {
      if (req.body[key] !== undefined && String(sprint[key]) !== String(req.body[key])) {
        changes.push({ field: key, oldValue: sprint[key], newValue: req.body[key] });
        sprint[key] = req.body[key];
      }
    }
    await sprint.save();
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'sprint',
      entityId: sprint._id, entityName: sprint.name, projectId: sprint.projectId,
      changes, description: `Sprint "${sprint.name}" updated`,
    });
    sendToProjectRoom(String(sprint.projectId), 'sprint:updated', {
      sprint, changes, actor: { userId: req.user.id }, timestamp: Date.now(),
    });
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update sprint' });
  }
});

// DELETE /sprints/:sprintId
router.delete('/:sprintId', authMiddleware, async (req, res) => {
  try {
    const sprint = await Sprint.findByIdAndDelete(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    await Task.updateMany({ sprintId: req.params.sprintId }, { $unset: { sprintId: '' } });
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'sprint',
      entityId: req.params.sprintId, entityName: sprint.name, projectId: sprint.projectId,
      description: `Sprint "${sprint.name}" deleted`,
    });
    sendToProjectRoom(String(sprint.projectId), 'sprint:deleted', {
      sprintId: sprint._id, actor: { userId: req.user.id }, timestamp: Date.now(),
    });
    res.json({ message: 'Sprint deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sprint' });
  }
});

router.post('/:sprintId/activate', authMiddleware, async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    await Sprint.updateMany(
      { projectId: sprint.projectId, isActive: true, _id: { $ne: sprint._id } },
      { isActive: false }
    );
    sprint.isActive = true;
    sprint.isCompleted = false;
    await sprint.save();
    await logActivity({
      actorId: req.user.id, action: 'activated', entityType: 'sprint',
      entityId: sprint._id, entityName: sprint.name, projectId: sprint.projectId,
      changes: [{ field: 'isActive', oldValue: false, newValue: true }],
      description: `Sprint "${sprint.name}" activated`,
    });
    sendToProjectRoom(String(sprint.projectId), 'sprint:activated', {
      sprint, actor: { userId: req.user.id }, timestamp: Date.now(),
    });
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate sprint' });
  }
});

router.post('/:sprintId/complete', authMiddleware, async (req, res) => {
  try {
    res.json(await completeSprint(req.params.sprintId, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to complete sprint' });
  }
});

router.post('/:sprintId/tasks/add', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ taskIds: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });
    res.json(await addTasksToSprint(req.params.sprintId, req.body.taskIds, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add tasks' });
  }
});

router.post('/:sprintId/tasks/remove', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ taskIds: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });
    res.json(await removeTasksFromSprint(req.params.sprintId, req.body.taskIds, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove tasks' });
  }
});

// Canonical retrospective (kills POST /ai/retrospective)
router.get('/:sprintId/retrospective', authMiddleware, async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    const tasks = await Task.find({ sprintId: sprint._id });
    const completed = tasks.filter((t) => isDoneStatus(t.status)).length;
    const statusBreakdown = {};
    tasks.forEach((t) => { statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1; });
    const data = [
      `Sprint: ${sprint.name}`,
      `Goal: ${sprint.goal || 'N/A'}`,
      `Total tasks: ${tasks.length}`,
      `Completed: ${completed}`,
      `Incomplete: ${tasks.length - completed}`,
      `Breakdown: ${JSON.stringify(statusBreakdown)}`,
    ].join('\n');
    const schema = '{"whatWentWell": [string], "whatCouldImprove": [string], "actionItems": [string]}';
    const result = await promptLLMStructured(
      `Generate a sprint retrospective from:\n${data}`,
      schema,
      { temperature: 0.4 }
    );
    res.json({ ...result, stats: { totalTasks: tasks.length, completed, incomplete: tasks.length - completed } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate retrospective', detail: err.message });
  }
});

module.exports = router;
