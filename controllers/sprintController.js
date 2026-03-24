// GET /sprints/:projectId → list sprints for a project
// POST /sprints/:projectId → create sprint { name, goal, startDate, endDate }
// GET /sprints/sprint/:sprintId → single sprint
// PUT /sprints/sprint/:sprintId → update sprint { name?, goal?, startDate?, endDate? }
// DELETE /sprints/sprint/:sprintId → delete sprint
// POST /sprints/sprint/:sprintId/activate → set as active
// POST /sprints/sprint/:sprintId/complete → mark completed
// POST /sprints/sprint/:sprintId/add-tasks → { taskIds: [] }
// POST /sprints/sprint/:sprintId/remove-tasks → { taskIds: [] }

const Sprint = require('../models/sprints');
const { createSprint, addTasksToSprint, removeTasksFromSprint, completeSprint } = require('../services/sprintService');
const { promptLLMStructured } = require('../utils/ai');
const { validate, required, isString, isDate, isArray, isMongoId } = require('../utils/validate');
const { logActivity } = require('../utils/activityLogger');

exports.getSprints = async (req, res) => {
  try {
    const sprints = await Sprint.find({ projectId: req.params.projectId }).sort({ startDate: -1 });
    res.json(sprints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
};

exports.createSprint = async (req, res) => {
  try {
    const errors = validate({
      name: [required, isString],
      startDate: [required, isDate],
      endDate: [required, isDate],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const sprint = await createSprint({ ...req.body, projectId: req.params.projectId }, req.user.id);
    res.status(201).json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sprint' });
  }
};

exports.getSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId).populate('tasks');
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sprint' });
  }
};

exports.updateSprint = async (req, res) => {
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
      actorId: req.user.id,
      action: 'updated',
      entityType: 'sprint',
      entityId: sprint._id,
      entityName: sprint.name,
      projectId: sprint.projectId,
      changes,
      description: `Sprint "${sprint.name}" updated`,
    });

    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update sprint' });
  }
};

exports.deleteSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findByIdAndDelete(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
    await require('../models/tasks').updateMany({ sprintId: req.params.sprintId }, { $unset: { sprintId: '' } });

    await logActivity({
      actorId: req.user.id,
      action: 'deleted',
      entityType: 'sprint',
      entityId: req.params.sprintId,
      entityName: sprint.name,
      projectId: sprint.projectId,
      description: `Sprint "${sprint.name}" deleted`,
    });

    res.json({ message: 'Sprint deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sprint' });
  }
};

exports.activateSprint = async (req, res) => {
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
      actorId: req.user.id,
      action: 'activated',
      entityType: 'sprint',
      entityId: sprint._id,
      entityName: sprint.name,
      projectId: sprint.projectId,
      changes: [{ field: 'isActive', oldValue: false, newValue: true }],
      description: `Sprint "${sprint.name}" activated`,
    });

    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate sprint' });
  }
};

exports.completeSprint = async (req, res) => {
  try {
    const sprint = await completeSprint(req.params.sprintId, req.user.id);
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to complete sprint' });
  }
};

exports.addTasksToSprint = async (req, res) => {
  try {
    const errors = validate({ taskIds: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const sprint = await addTasksToSprint(req.params.sprintId, req.body.taskIds, req.user.id);
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add tasks' });
  }
};

exports.removeTasksFromSprint = async (req, res) => {
  try {
    const errors = validate({ taskIds: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const sprint = await removeTasksFromSprint(req.params.sprintId, req.body.taskIds, req.user.id);
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove tasks' });
  }
};

exports.sprintRetrospective = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId).populate('tasks');
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const completed = sprint.tasks.filter((t) => t.status === 'Completed').length;
    const statusBreakdown = {};
    sprint.tasks.forEach((t) => { statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1; });

    const data = [
      `Sprint: ${sprint.name}`,
      `Goal: ${sprint.goal || 'N/A'}`,
      `Total tasks: ${sprint.tasks.length}`,
      `Completed: ${completed}`,
      `Incomplete: ${sprint.tasks.length - completed}`,
      `Breakdown: ${JSON.stringify(statusBreakdown)}`,
    ].join('\n');

    const schema = '{"whatWentWell": [string], "whatCouldImprove": [string], "actionItems": [string]}';
    const result = await promptLLMStructured(
      `Generate a sprint retrospective from:\n${data}`,
      schema,
      { temperature: 0.4 }
    );

    res.json({ ...result, stats: { totalTasks: sprint.tasks.length, completed, incomplete: sprint.tasks.length - completed } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate retrospective', detail: err.message });
  }
};
