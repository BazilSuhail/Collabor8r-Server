const Project = require('../models/projects');
const Task = require('../models/tasks');
const Profile = require('../models/profile');

exports.getProjectTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const tasks = await Task.find({ projectId: req.params.projectId });
    const tasksWithUsers = await Promise.all(tasks.map(async (task) => {
      if (!task) return null;
      const user = task.assignedTo ? await Profile.findById(task.assignedTo).select('name email avatar').lean() : null;
      return { task, user };
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
