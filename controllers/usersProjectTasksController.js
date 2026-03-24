const Task = require('../models/tasks');
const AssignedTask = require('../models/assignTasks');
const Profile = require('../models/profile');
const Project = require('../models/projects');
const { logActivity } = require('../utils/activityLogger');
const { sendToProjectRoom } = require('../socket');

const ALLOWED_FIELDS = [
  'title', 'description', 'status', 'priority', 'progress', 'dueDate',
  'assignedTo', 'sprintId', 'parentId', 'estimateHours', 'resolution',
  'labels', 'acceptanceCriteria',
];

exports.getProjectTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    const [projectTasks, profile] = await Promise.all([
      Task.find({ _id: { $in: project.tasks } }),
      Profile.findById(req.user.id),
    ]);

    if (!profile?.assignedTasks) {
      return res.status(200).json({ projectTasks, userTaskDetails: [] });
    }

    const assignedTaskDoc = await AssignedTask.findById(profile.assignedTasks);
    const userTaskDetails = assignedTaskDoc
      ? await Task.find({ _id: { $in: assignedTaskDoc.assignTasks }, projectId: req.params.projectId })
      : [];

    res.status(200).json({ projectTasks, userTaskDetails });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch project tasks' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const updates = req.body.updates;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be an array' });

    const updatedTasks = await Promise.all(updates.map(async ({ id, status }) => {
      const task = await Task.findById(id);
      if (!task) return null;

      const oldStatus = task.status;
      const changes = [];
      if (String(task.status) !== String(status)) {
        changes.push({ field: 'status', oldValue: task.status, newValue: status });
      }
      task.status = status;
      if (status === 'Completed' && task.progress !== 100) {
        changes.push({ field: 'progress', oldValue: task.progress, newValue: 100 });
        task.progress = 100;
      }
      await task.save();

      if (changes.length > 0) {
        await logActivity({
          actorId: req.user.id,
          action: 'status_changed',
          entityType: 'task',
          entityId: task._id,
          entityName: task.title,
          projectId: task.projectId,
          changes,
          description: `Task "${task.title}" moved from ${oldStatus} to ${status}`,
        });
      }

      sendToProjectRoom(String(task.projectId), 'task:status-changed', {
        task,
        oldStatus,
        newStatus: status,
        changes,
        actor: { userId: req.user.id },
        timestamp: Date.now(),
      });

      return task;
    }));

    res.status(200).json({ success: true, updatedTasks: updatedTasks.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating tasks' });
  }
};

exports.updateTaskStatusAndProgress = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const changes = [];
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined && String(task[key]) !== String(req.body[key])) {
        changes.push({ field: key, oldValue: task[key], newValue: req.body[key] });
        task[key] = req.body[key];
      }
    }

    if (task.status === 'Completed' && task.progress !== 100) {
      task.progress = 100;
      changes.push({ field: 'progress', oldValue: task.progress, newValue: 100 });
    }

    if (changes.length === 0) {
      return res.status(200).json({ success: true, message: 'Task unchanged', updatedTask: task });
    }

    await task.save();

    await logActivity({
      actorId: req.user.id,
      action: 'status_changed',
      entityType: 'task',
      entityId: task._id,
      entityName: task.title,
      projectId: task.projectId,
      changes,
      description: `Task "${task.title}" updated`,
    });

    sendToProjectRoom(String(task.projectId), 'task:updated', {
      task,
      changes,
      actor: { userId: req.user.id },
      timestamp: Date.now(),
    });

    res.status(200).json({ success: true, message: 'Task updated', updatedTask: task });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating task' });
  }
};
