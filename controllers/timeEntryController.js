// POST /time/entries → log time { taskId, hours, description?, date? }
// GET /time/entries/task/:taskId → all entries for a task
// GET /time/entries/user → current user's entries
// GET /time/report/project/:projectId → aggregate by project
// GET /time/report/sprint/:sprintId → aggregate by sprint
// PUT /time/entries/:entryId → edit entry { hours?, description?, date? }
// DELETE /time/entries/:entryId → delete entry

const TimeEntry = require('../models/timeEntry');
const Task = require('../models/tasks');
const { recalculateTaskHours } = require('../services/timeService');
const { logActivity } = require('../utils/activityLogger');
const { validate, required, isNumber, isString, isDate, isMongoId } = require('../utils/validate');

exports.logTime = async (req, res) => {
  try {
    const errors = validate({
      taskId: [required, isMongoId],
      hours: [required, isNumber],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const task = await Task.findById(req.body.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const entry = new TimeEntry({ ...req.body, userId: req.user.id });
    await entry.save();

    await recalculateTaskHours(task._id);

    await logActivity({
      actorId: req.user.id,
      action: 'logged',
      entityType: 'time',
      entityId: entry._id,
      entityName: task.title,
      projectId: task.projectId,
      changes: [{ field: 'hours', oldValue: 0, newValue: Number(req.body.hours) }],
      description: `Logged ${req.body.hours}h on task "${task.title}"`,
    });

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log time' });
  }
};

exports.getTaskTimeEntries = async (req, res) => {
  try {
    const entries = await TimeEntry.find({ taskId: req.params.taskId })
      .sort({ date: -1 }).populate('userId', 'name email');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
};

exports.getUserTimeEntries = async (req, res) => {
  try {
    const entries = await TimeEntry.find({ userId: req.user.id })
      .sort({ date: -1 }).populate('taskId', 'title');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
};

exports.getProjectTimeReport = async (req, res) => {
  try {
    const tasks = await Task.find({ projectId: req.params.projectId }).select('_id title');
    const taskIds = tasks.map((t) => t._id);
    const entries = await TimeEntry.find({ taskId: { $in: taskIds } }).populate('userId', 'name');
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    res.json({ tasks, entries, totalHours, entryCount: entries.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

exports.getSprintTimeReport = async (req, res) => {
  try {
    const tasks = await Task.find({ sprintId: req.params.sprintId }).select('_id title');
    const taskIds = tasks.map((t) => t._id);
    const entries = await TimeEntry.find({ taskId: { $in: taskIds } }).populate('userId', 'name');
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    res.json({ tasks, entries, totalHours, entryCount: entries.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

exports.updateTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });
    if (String(entry.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized to edit this entry' });

    const oldHours = entry.hours;
    const oldDescription = entry.description;
    const updates = {};
    if (req.body.hours !== undefined) updates.hours = req.body.hours;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.date !== undefined) updates.date = req.body.date;

    Object.assign(entry, updates);
    await entry.save();

    const task = await Task.findById(entry.taskId);
    await recalculateTaskHours(entry.taskId);

    await logActivity({
      actorId: req.user.id,
      action: 'updated',
      entityType: 'time',
      entityId: entry._id,
      entityName: task?.title || 'Time entry',
      projectId: task?.projectId,
      changes: [
        ...(req.body.hours !== undefined && Number(req.body.hours) !== Number(oldHours) ? [{ field: 'hours', oldValue: oldHours, newValue: req.body.hours }] : []),
        ...(req.body.description !== undefined && req.body.description !== oldDescription ? [{ field: 'description', oldValue: oldDescription, newValue: req.body.description }] : []),
      ],
      description: `Updated time entry on task "${task?.title || ''}"`,
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update time entry' });
  }
};

exports.deleteTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });
    if (String(entry.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized to delete this entry' });

    const task = await Task.findById(entry.taskId);
    await entry.deleteOne();
    await recalculateTaskHours(entry.taskId);

    await logActivity({
      actorId: req.user.id,
      action: 'deleted',
      entityType: 'time',
      entityId: entry._id,
      entityName: task?.title || 'Time entry',
      projectId: task?.projectId,
      changes: [{ field: 'hours', oldValue: entry.hours, newValue: 0 }],
      description: `Deleted time entry (${entry.hours}h) on task "${task?.title || ''}"`,
    });

    res.json({ message: 'Time entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
};
