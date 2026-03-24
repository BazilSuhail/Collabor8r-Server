const Sprint = require('../models/sprints');
const Task = require('../models/tasks');
const { logActivity } = require('../utils/activityLogger');

async function createSprint(data, userId) {
  const activeSprint = await Sprint.findOne({ projectId: data.projectId, isActive: true });
  if (activeSprint) {
    activeSprint.isActive = false;
    await activeSprint.save();
  }

  const sprint = new Sprint({
    name: data.name,
    goal: data.goal,
    projectId: data.projectId,
    startDate: data.startDate,
    endDate: data.endDate,
    isActive: true,
  });

  await sprint.save();

  await logActivity({
    actorId: userId,
    action: 'created',
    entityType: 'sprint',
    entityId: sprint._id,
    entityName: sprint.name,
    projectId: data.projectId,
    description: `Sprint "${sprint.name}" created`,
  });

  return sprint;
}

async function addTasksToSprint(sprintId, taskIds, userId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error('Sprint not found');

  for (const taskId of taskIds) {
    if (!sprint.tasks.includes(taskId)) {
      sprint.tasks.push(taskId);
      await Task.findByIdAndUpdate(taskId, { sprintId });
    }
  }

  await sprint.save();

  await logActivity({
    actorId: userId,
    action: 'updated',
    entityType: 'sprint',
    entityId: sprintId,
    entityName: sprint.name,
    projectId: sprint.projectId,
    changes: [{ field: 'tasks', oldValue: null, newValue: taskIds }],
    description: `Added ${taskIds.length} task(s) to sprint "${sprint.name}"`,
  });

  return sprint;
}

async function removeTasksFromSprint(sprintId, taskIds, userId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error('Sprint not found');

  sprint.tasks = sprint.tasks.filter((t) => !taskIds.includes(String(t)));
  await sprint.save();

  await Task.updateMany(
    { _id: { $in: taskIds }, sprintId },
    { $unset: { sprintId: '' } },
  );

  await logActivity({
    actorId: userId,
    action: 'updated',
    entityType: 'sprint',
    entityId: sprintId,
    entityName: sprint.name,
    projectId: sprint.projectId,
    changes: [{ field: 'tasks', oldValue: taskIds, newValue: null }],
    description: `Removed ${taskIds.length} task(s) from sprint "${sprint.name}"`,
  });

  return sprint;
}

async function completeSprint(sprintId, userId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error('Sprint not found');

  sprint.isActive = false;
  sprint.isCompleted = true;
  await sprint.save();

  await logActivity({
    actorId: userId,
    action: 'completed',
    entityType: 'sprint',
    entityId: sprintId,
    entityName: sprint.name,
    projectId: sprint.projectId,
    changes: [{ field: 'isCompleted', oldValue: false, newValue: true }],
    description: `Sprint "${sprint.name}" completed`,
  });

  return sprint;
}

module.exports = { createSprint, addTasksToSprint, removeTasksFromSprint, completeSprint };
