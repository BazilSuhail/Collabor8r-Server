const Task = require('../models/tasks');
const TimeEntry = require('../models/timeEntry');

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

module.exports = { recalculateTaskHours };
