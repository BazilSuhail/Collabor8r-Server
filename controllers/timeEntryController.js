// POST /time/entries → log time { taskId, hours, description?, date? }
// GET /time/entries/task/:taskId → all entries for a task
// GET /time/entries/user → current user's entries
// GET /time/report/project/:projectId → aggregate by project
// GET /time/report/sprint/:sprintId → aggregate by sprint
// PUT /time/entries/:entryId → edit entry { hours?, description?, date? }
// DELETE /time/entries/:entryId → delete entry

const TimeEntry = require('../models/timeEntry');
const Task = require('../models/tasks');
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

    task.loggedHours = (task.loggedHours || 0) + Number(req.body.hours);
    await task.save();

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
    const entry = await TimeEntry.findOneAndUpdate(
      { _id: req.params.entryId, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update time entry' });
  }
};

exports.deleteTimeEntry = async (req, res) => {
  try {
    const entry = await TimeEntry.findOneAndDelete({ _id: req.params.entryId, userId: req.user.id });
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });
    res.json({ message: 'Time entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
};
