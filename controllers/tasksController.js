const Task = require('../models/tasks');
const Profile = require('../models/profile');
const AssignedTask = require('../models/assignTasks');
const Project = require('../models/projects');
const { taskService } = require('../services');
const { validate, required, isString, isMongoId } = require('../utils/validate');

exports.createTask = async (req, res) => {
  try {
    const errors = validate({
      title: [required, isString],
      description: [required, isString],
      dueDate: [required],
      projectId: [required, isMongoId],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const task = await taskService.createTask(req.body, req.user.id);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
};

exports.getTasksByProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).select('tasks name team');
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    const tasks = await Promise.all(
      project.tasks.map(async (taskId) => {
        const task = await Task.findById(taskId).select('-comments').lean();
        if (!task) return null;
        const assignedTo = task.assignedTo
          ? await Profile.findById(task.assignedTo).select('-_id email name avatar').lean()
          : null;
        return { ...task, assignedTo };
      })
    );

    res.status(200).json({ projectName: project.name, validTasks: tasks.filter(Boolean), projectTeam: project.team.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
};

exports.getTasksByUser = async (req, res) => {
  try {
    const assignedTasks = await AssignedTask.findOne({ _id: req.params.userId }).populate('assignTasks');
    res.status(200).json(assignedTasks);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
};

exports.editTask = async (req, res) => {
  try {
    const task = await taskService.updateTask(req.params.taskId, req.body, req.user.id);
    res.status(200).json({ message: 'Task updated successfully', task });
  } catch (err) {
    res.status(err.message === 'Task not found' ? 404 : 500).json({ error: err.message || 'Failed to update task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    await taskService.deleteTask(req.params.taskId, req.user.id);
    res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(err.message === 'Task not found' ? 404 : 500).json({ error: err.message || 'Failed to delete task' });
  }
};
