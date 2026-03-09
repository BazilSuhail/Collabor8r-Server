const Task = require('../models/tasks');
const AssignedTask = require('../models/assignTasks');
const Profile = require('../models/profile');
const Project = require('../models/projects');
const { logActivity } = require('../utils/activityLogger');

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

    const updatedTasks = await Promise.all(updates.map(({ id, status }) =>
      Task.findByIdAndUpdate(id, { status }, { new: true })
    ));

    res.status(200).json({ success: true, updatedTasks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating tasks' });
  }
};

exports.updateTaskStatusAndProgress = async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.taskId, req.body, { new: true });
    if (!updatedTask) return res.status(404).json({ success: false, message: 'Task not found' });

    await logActivity({ actorId: req.user.id, action: 'updated', entityType: 'task', entityId: req.params.taskId, projectId: updatedTask.projectId, changes: [{ field: 'status', newValue: req.body.status }, { field: 'progress', newValue: req.body.progress }] });

    res.status(200).json({ success: true, message: 'Task updated', updatedTask });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating task' });
  }
};
