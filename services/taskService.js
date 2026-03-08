const Task = require('../models/tasks');
const Project = require('../models/projects');
const AssignedTask = require('../models/assignTasks');
const Profile = require('../models/profile');
const { logActivity } = require('../utils/activityLogger');
const { dispatchWebhook } = require('../utils/webhookDispatcher');

async function createTask(data, userId) {
  const { title, description, status, priority, dueDate, assignedTo, projectId, sprintId, parentId, estimateHours, labels } = data;

  const newTask = new Task({
    title, description, status, priority,
    progress: 0,
    assignedTo, dueDate, projectId,
    sprintId, parentId, estimateHours, labels,
  });

  const savedTask = await newTask.save();

  await Project.findByIdAndUpdate(projectId, {
    $push: { tasks: savedTask._id },
  });

  if (assignedTo) {
    let assignedTask = await AssignedTask.findById(assignedTo);
    if (!assignedTask) {
      assignedTask = new AssignedTask({ _id: assignedTo, assignTasks: [savedTask._id] });
      await assignedTask.save();
      await Profile.findByIdAndUpdate(assignedTo, { $set: { assignedTasks: assignedTask._id } });
    } else {
      assignedTask.assignTasks.push(savedTask._id);
      await assignedTask.save();
      const profile = await Profile.findById(assignedTo);
      if (!profile.assignedTasks || !profile.assignedTasks.equals(assignedTask._id)) {
        await Profile.findByIdAndUpdate(assignedTo, { $set: { assignedTasks: assignedTask._id } });
      }
    }
  }

  await logActivity({
    actorId: userId,
    action: 'created',
    entityType: 'task',
    entityId: savedTask._id,
    projectId,
    description: `Task "${title}" created`,
  });

  await dispatchWebhook('task.created', { task: savedTask });

  return savedTask;
}

async function updateTask(taskId, data, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');

  const oldValues = {};
  const changes = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && task[key] !== undefined && String(task[key]) !== String(value)) {
      oldValues[key] = task[key];
      changes.push({ field: key, oldValue: task[key], newValue: value });
      task[key] = value;
    }
  }

  if (changes.length === 0) return task;

  await task.save();

  if (data.assignedTo && data.assignedTo !== String(oldValues.assignedTo)) {
    if (oldValues.assignedTo) {
      await AssignedTask.updateOne(
        { _id: oldValues.assignedTo },
        { $pull: { assignTasks: taskId } },
      );
    }
    let assignedTask = await AssignedTask.findById(data.assignedTo);
    if (!assignedTask) {
      assignedTask = new AssignedTask({ _id: data.assignedTo, assignTasks: [taskId] });
      await assignedTask.save();
    } else {
      await AssignedTask.updateOne(
        { _id: data.assignedTo },
        { $addToSet: { assignTasks: taskId } },
      );
    }
  }

  await logActivity({
    actorId: userId,
    action: 'updated',
    entityType: 'task',
    entityId: taskId,
    projectId: task.projectId,
    changes,
    description: `Task "${task.title}" updated`,
  });

  await dispatchWebhook('task.updated', { task, changes });

  return task;
}

async function deleteTask(taskId, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');

  await AssignedTask.findByIdAndUpdate(task.assignedTo, { $pull: { assignTasks: taskId } });
  await Project.findByIdAndUpdate(task.projectId, { $pull: { tasks: taskId } });
  await Task.findByIdAndDelete(taskId);

  await logActivity({
    actorId: userId,
    action: 'deleted',
    entityType: 'task',
    entityId: taskId,
    projectId: task.projectId,
    description: `Task "${task.title}" deleted`,
  });

  await dispatchWebhook('task.deleted', { taskId });
}

module.exports = { createTask, updateTask, deleteTask };
