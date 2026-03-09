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
const { validate, required, isString, isDate, isArray, isMongoId } = require('../utils/validate');

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
    const sprint = await Sprint.findByIdAndUpdate(req.params.sprintId, req.body, { new: true });
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
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
    res.json({ message: 'Sprint deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sprint' });
  }
};

exports.activateSprint = async (req, res) => {
  try {
    await Sprint.updateMany({ projectId: req.params.projectId, isActive: true }, { isActive: false });
    const sprint = await Sprint.findByIdAndUpdate(req.params.sprintId, { isActive: true }, { new: true });
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
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
    const sprint = await removeTasksFromSprint(req.params.sprintId, req.body.taskIds);
    res.json(sprint);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove tasks' });
  }
};
