// Time routes — entries CRUD + unified report (?projectId=|?sprintId=).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { TimeEntry } = require('./models');
const { Task } = require('../tasks/models');
const { recalculateTaskHours, report } = require('./service');
const { logActivity } = require('../utils/activityLogger');
const { validate, required, isNumber, isMongoId } = require('../lib/validate');

router.post('/entries', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ taskId: [required, isMongoId], hours: [required, isNumber] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const task = await Task.findById(req.body.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const entry = new TimeEntry({ ...req.body, userId: req.user.id });
    await entry.save();
    await recalculateTaskHours(task._id);
    await logActivity({
      actorId: req.user.id, action: 'logged', entityType: 'time',
      entityId: entry._id, entityName: task.title, projectId: task.projectId,
      changes: [{ field: 'hours', oldValue: 0, newValue: Number(req.body.hours) }],
      description: `Logged ${req.body.hours}h on task "${task.title}"`,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log time' });
  }
});

// GET /time/entries?taskId=&userId= — merges task + user entry lists
router.get('/entries', authMiddleware, async (req, res) => {
  try {
    const { taskId, userId } = req.query;
    const query = {};
    if (taskId) query.taskId = taskId;
    else query.userId = userId || req.user.id;
    const entries = await TimeEntry.find(query)
      .sort({ date: -1 })
      .populate(taskId ? 'userId' : 'taskId', taskId ? 'name email' : 'title');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// GET /time/report?projectId=&sprintId= — merges project + sprint reports
router.get('/report', authMiddleware, async (req, res) => {
  try {
    const { projectId, sprintId } = req.query;
    if (!projectId && !sprintId) return res.status(400).json({ error: 'projectId or sprintId is required' });
    res.json(await report({ projectId, sprintId }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

router.put('/entries/:entryId', authMiddleware, async (req, res) => {
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
      actorId: req.user.id, action: 'updated', entityType: 'time',
      entityId: entry._id, entityName: task?.title || 'Time entry', projectId: task?.projectId,
      changes: [
        ...(req.body.hours !== undefined && Number(req.body.hours) !== Number(oldHours)
          ? [{ field: 'hours', oldValue: oldHours, newValue: req.body.hours }] : []),
        ...(req.body.description !== undefined && req.body.description !== oldDescription
          ? [{ field: 'description', oldValue: oldDescription, newValue: req.body.description }] : []),
      ],
      description: `Updated time entry on task "${task?.title || ''}"`,
    });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

router.delete('/entries/:entryId', authMiddleware, async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });
    if (String(entry.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized to delete this entry' });
    const task = await Task.findById(entry.taskId);
    await entry.deleteOne();
    await recalculateTaskHours(entry.taskId);
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'time',
      entityId: entry._id, entityName: task?.title || 'Time entry', projectId: task?.projectId,
      changes: [{ field: 'hours', oldValue: entry.hours, newValue: 0 }],
      description: `Deleted time entry (${entry.hours}h) on task "${task?.title || ''}"`,
    });
    res.json({ message: 'Time entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

module.exports = router;
