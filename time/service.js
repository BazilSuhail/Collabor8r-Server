// Time tracking: entries CRUD helpers + recalculate + unified report (projectId | sprintId).
const { TimeEntry } = require('./models');
const { Task } = require('../tasks/models');

async function recalculateTaskHours(taskId) {
  const task = await Task.findById(taskId);
  if (!task) return null;

  const entries = await TimeEntry.find({ taskId });
  const loggedHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  task.loggedHours = loggedHours;
  task.remainingHours = Math.max(0, (Number(task.estimateHours) || 0) - loggedHours);
  await task.save();
  return task;
}

// One handler for both project and sprint reports — scope by whichever id is provided.
async function report({ projectId, sprintId }) {
  const scope = projectId ? { projectId } : { sprintId };
  const tasks = await Task.find(scope).select('_id title');
  const taskIds = tasks.map((t) => t._id);
  const entries = await TimeEntry.find({ taskId: { $in: taskIds } }).populate('userId', 'name');
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  return { tasks, entries, totalHours, entryCount: entries.length };
}

module.exports = { recalculateTaskHours, report };
