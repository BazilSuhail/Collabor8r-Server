const Project = require('../models/projects');
const Task = require('../models/tasks');
const Profile = require('../models/profile');

exports.getProjectTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const tasks = await Task.find({ projectId: req.params.projectId });
    const assignedIds = [...new Set(tasks.map((t) => t.assignedTo?.toString()).filter(Boolean))];
    const users = assignedIds.length
      ? await Profile.find({ _id: { $in: assignedIds } }).select('name email avatar').lean()
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
    const tasksWithUsers = tasks.map((task) => ({
      task,
      user: task.assignedTo ? userMap[task.assignedTo.toString()] || null : null,
    }));

    res.status(200).json({ project, tasks: tasksWithUsers.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getTaskDetails = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
