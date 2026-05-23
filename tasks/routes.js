// Task routes — consolidated list/filter, CRUD, bulk, links, subtasks; mounts views/AI/comments/attachments.
// GET /tasks?projectId=&status=... single list replaces /manageTasks/filter, /projecttasks/*, /project-tasks/*.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Task, AssignedTask, TaskLink } = require('./models');
const { Project } = require('../projects/models');
const { Profile } = require('../auth/models');
const taskService = require('./service');
const { promptLLMStructured } = require('../lib/ai');
const { validate, required, isString, isMongoId } = require('../lib/validate');
const { logActivity } = require('../utils/activityLogger');

// Mount sub-domain routers first (static prefixes before /:taskId)
router.use('/', require('./views/routes'));
router.use('/ai', require('./ai/routes'));
router.use('/', require('./comments/routes'));
router.use('/', require('./attachments/routes'));

// GET /tasks — unified list. Query: projectId, status, priority, issueType, assignedTo, sprintId,
// label, epicId, parentId, search, page, limit, sort, include=userTasks|project|names
// (assignedTo is always hydrated to profile — include=assignees accepted for compatibility)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const include = String(req.query.include || '');
    const result = await taskService.filterTasks({
      projectId: req.query.projectId,
      status: req.query.status,
      priority: req.query.priority,
      issueType: req.query.issueType,
      assignedTo: req.query.assignedTo,
      sprintId: req.query.sprintId,
      label: req.query.label,
      epicId: req.query.epicId,
      parentId: req.query.parentId,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
    });

    if (result.tasks.length > 0) {
      const assignedIds = [...new Set(result.tasks.map((t) => t.assignedTo?.toString()).filter(Boolean))];
      const users = assignedIds.length
        ? await Profile.find({ _id: { $in: assignedIds } }).select('_id email name avatar').lean()
        : [];
      const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
      result.tasks = result.tasks.map((task) => ({
        ...task,
        assignedTo: task.assignedTo ? userMap[task.assignedTo.toString()] || null : null,
      }));
    }

    if (include.includes('userTasks') && req.user.id) {
      result.userTaskDetails = await taskService.getAssignedTasks(req.user.id, {
        scopeProjectId: req.query.projectId,
      });
    }

    if (include.includes('project') && req.query.projectId) {
      const project = await Project.findById(req.query.projectId).select('name team').lean();
      result.project = project;
      if (project) result.projectTeam = project.team.length;
    }

    if (include.includes('names') && result.tasks.length) {
      const projectIds = [...new Set(result.tasks.map((t) => String(t.projectId)))];
      const projects = projectIds.length
        ? await Project.find({ _id: { $in: projectIds } }).select('name').lean()
        : [];
      const nameMap = Object.fromEntries(projects.map((p) => [String(p._id), p.name]));
      result.tasks = result.tasks.map((t) => ({ ...t, projectName: nameMap[String(t.projectId)] || 'Unknown' }));
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// POST /tasks — create (with optional ai extract)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const errors = validate({
      title: [required, isString],
      description: [required, isString],
      dueDate: [required],
      projectId: [required, isMongoId],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const taskData = { ...req.body };
    let aiExtracted = null;
    if (req.body.ai === true) {
      try {
        const schema = '{"priority": "Low" | "Medium" | "High", "dueDate": string (ISO date) | null, "estimateHours": number | null}';
        const parsed = await promptLLMStructured(
          `Task title: ${taskData.title}\nDescription: ${taskData.description || ''}\nInfer priority, due date and estimated hours.`,
          schema,
          { systemPrompt: 'Extract task metadata as JSON. Use reasonable defaults.' }
        );
        aiExtracted = parsed;
        if (parsed.priority) taskData.priority = parsed.priority;
        if (parsed.dueDate) taskData.dueDate = new Date(parsed.dueDate);
        if (parsed.estimateHours) taskData.estimateHours = Number(parsed.estimateHours);
      } catch {
        aiExtracted = null;
      }
    }

    const task = await taskService.createTask(taskData, req.user.id);
    res.status(201).json({ task, aiExtracted });
  } catch (err) {
    console.error('createTask:', err.message);
    if (err.message && err.message.startsWith('Invalid status')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// POST /tasks/bulk — create many (kills POST /ai/create-tasks)
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { projectId, tasks } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: 'tasks array is required' });

    const project = await Project.findById(projectId).select('team statuses').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const statuses = project.statuses?.length
      ? project.statuses.map((s) => s.name)
      : ['Not Started', 'In Progress', 'Paused', 'Completed'];
    const members = project.team?.length
      ? await Profile.find({ _id: { $in: project.team } }).select('_id email').lean()
      : [];
    const emailToId = Object.fromEntries(members.map((m) => [m.email, m._id]));

    const created = [];
    for (const t of tasks) {
      const dueDate = t.dueDate ? new Date(t.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const task = await taskService.createTask({
        title: t.title,
        description: t.description || 'Created from suggestion.',
        priority: ['Low', 'Medium', 'High'].includes(t.priority) ? t.priority : 'Medium',
        status: statuses.includes(t.status) ? t.status : statuses[0],
        issueType: ['epic', 'story', 'task', 'sub-task', 'bug'].includes(t.issueType) ? t.issueType : 'task',
        dueDate,
        estimateHours: Number(t.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
        projectId,
        assignedTo: t.suggestedAssignee ? emailToId[t.suggestedAssignee] : undefined,
      }, req.user.id);
      created.push(task);
    }
    res.status(201).json({ tasks: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tasks', detail: err.message });
  }
});

// PATCH /tasks/bulk-status — batch status updates (was PATCH /projecttasks/tasks/update)
router.patch('/bulk-status', authMiddleware, async (req, res) => {
  try {
    const updates = req.body.updates;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be an array' });
    const updatedTasks = await taskService.bulkStatusUpdate(updates, req.user.id);
    res.status(200).json({ success: true, updatedTasks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating tasks' });
  }
});

// GET /tasks/blocked?projectId=
router.get('/blocked', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const blockedIds = await taskService.getBlockedTasks(projectId);
    const blockedTasks = blockedIds.length
      ? await Task.find({ _id: { $in: blockedIds } }).select('title status priority assignedTo')
          .populate('assignedTo', 'name email avatar').lean()
      : [];
    res.status(200).json({ blockedTasks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blocked tasks' });
  }
});

// GET /tasks/assigned — my assigned tasks (merges /manageTasks/user/:userId + dashboard assigned-tasks)
// Query: projectId (optional scope), include=names
router.get('/assigned', authMiddleware, async (req, res) => {
  try {
    const include = String(req.query.include || '');
    const tasks = await taskService.getAssignedTasks(req.user.id, {
      scopeProjectId: req.query.projectId,
      withProjectNames: include.includes('names') || !req.query.projectId,
    });
    if (include.includes('doc')) {
      // legacy dashboard shape: { tasks: [...] }
      return res.status(200).json({ tasks });
    }
    res.status(200).json({ tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assigned tasks' });
  }
});

// GET /tasks/:taskId — single task (was GET /project-tasks/:id)
router.get('/:taskId', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId).populate('assignedTo', 'name email avatar');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /tasks/:taskId — edit
router.patch('/:taskId', authMiddleware, async (req, res) => {
  try {
    const task = await taskService.updateTask(req.params.taskId, req.body, req.user.id);
    res.status(200).json({ message: 'Task updated successfully', task });
  } catch (err) {
    if (err.message === 'Task not found') return res.status(404).json({ error: err.message });
    if (err.message && err.message.startsWith('Invalid status')) return res.status(400).json({ error: err.message });
    if (err.message && err.message.startsWith('Workflow violation')) return res.status(400).json({ error: err.message, workflowViolation: true });
    if (err.wipExceeded) return res.status(409).json({ error: err.message, wipExceeded: true });
    if (err.blocked) return res.status(409).json({ error: err.message, blocked: true, blockers: err.blockers });
    res.status(500).json({ error: err.message || 'Failed to update task' });
  }
});

// PUT /tasks/:taskId/status — status + progress (was PUT /projecttasks/update-task-progress/:taskId)
router.put('/:taskId/status', authMiddleware, async (req, res) => {
  try {
    const data = {};
    for (const key of taskService.ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    try {
      const task = await taskService.updateTask(req.params.taskId, data, req.user.id);
      res.status(200).json({ success: true, message: 'Task updated', updatedTask: task });
    } catch (e) {
      if (e.message === 'Task not found') return res.status(404).json({ success: false, message: 'Task not found' });
      if (e.wipExceeded || e.blocked) {
        return res.status(409).json({
          success: false, message: e.message,
          ...(e.wipExceeded ? { wipExceeded: e } : {}),
          ...(e.blocked ? { blockers: e.blockers } : {}),
        });
      }
      if (/Workflow violation|Invalid status/.test(e.message)) {
        return res.status(400).json({ success: false, message: e.message });
      }
      throw e;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating task' });
  }
});

// DELETE /tasks/:taskId
router.delete('/:taskId', authMiddleware, async (req, res) => {
  try {
    await taskService.deleteTask(req.params.taskId, req.user.id);
    res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(err.message === 'Task not found' ? 404 : 500).json({ error: err.message || 'Failed to delete task' });
  }
});

// GET /tasks/:taskId/subtasks
router.get('/:taskId/subtasks', authMiddleware, async (req, res) => {
  try {
    res.status(200).json({ subtasks: await taskService.getSubtasks(req.params.taskId) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subtasks' });
  }
});

// GET /tasks/:taskId/parent
router.get('/:taskId/parent', authMiddleware, async (req, res) => {
  try {
    const parent = await taskService.getParentTask(req.params.taskId);
    if (!parent) return res.status(404).json({ error: 'No parent task' });
    res.status(200).json({ parent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch parent task' });
  }
});

// Task links
router.post('/links', authMiddleware, async (req, res) => {
  try {
    const errors = validate({
      sourceTaskId: [required, isMongoId],
      targetTaskId: [required, isMongoId],
      linkType: [required],
      projectId: [required, isMongoId],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const existing = await TaskLink.findOne({
      $or: [
        { sourceTaskId: req.body.sourceTaskId, targetTaskId: req.body.targetTaskId },
        { sourceTaskId: req.body.targetTaskId, targetTaskId: req.body.sourceTaskId },
      ],
    });
    if (existing) return res.status(409).json({ error: 'Link already exists' });

    const link = new TaskLink(req.body);
    await link.save();

    const [source, target] = await Promise.all([
      Task.findById(req.body.sourceTaskId).select('title projectId'),
      Task.findById(req.body.targetTaskId).select('title projectId'),
    ]);

    await logActivity({
      actorId: req.user.id, action: 'created', entityType: 'taskLink',
      entityId: link._id,
      entityName: `${source?.title || req.body.sourceTaskId} → ${target?.title || req.body.targetTaskId} (${req.body.linkType})`,
      projectId: req.body.projectId || source?.projectId,
      changes: [{ field: 'linkType', oldValue: null, newValue: req.body.linkType }],
      description: `Linked tasks "${source?.title || ''}" and "${target?.title || ''}" (${req.body.linkType})`,
    });

    res.status(201).json(link);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create link' });
  }
});

router.get('/:taskId/links', authMiddleware, async (req, res) => {
  try {
    const links = await TaskLink.find({
      $or: [{ sourceTaskId: req.params.taskId }, { targetTaskId: req.params.taskId }],
    }).populate('sourceTaskId targetTaskId', 'title');
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

router.delete('/links/:linkId', authMiddleware, async (req, res) => {
  try {
    const link = await TaskLink.findByIdAndDelete(req.params.linkId);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const [source, target] = await Promise.all([
      Task.findById(link.sourceTaskId).select('title'),
      Task.findById(link.targetTaskId).select('title'),
    ]);
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'taskLink',
      entityId: link._id,
      entityName: `${source?.title || ''} → ${target?.title || ''} (${link.linkType})`,
      projectId: link.projectId,
      changes: [{ field: 'linkType', oldValue: link.linkType, newValue: null }],
      description: `Removed "${link.linkType}" link between "${source?.title || ''}" and "${target?.title || ''}"`,
    });
    res.json({ message: 'Link deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

module.exports = router;
