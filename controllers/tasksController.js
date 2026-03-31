const Task = require('../models/tasks');
const Profile = require('../models/profile');
const AssignedTask = require('../models/assignTasks');
const Project = require('../models/projects');
const { taskService } = require('../services');
const { promptLLMStructured } = require('../utils/ai');
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

    const taskData = { ...req.body };
    let aiExtracted = null;

    if (req.body.ai === true) {
      try {
        const schema = '{"priority": "Low" | "Medium" | "High", "dueDate": string (ISO date) | null, "estimateHours": number | null}';
        const parsed = await promptLLMStructured(
          `Task title: ${taskData.title}\nDescription: ${taskData.description || ''}\nInfer priority, due date and estimated hours.`,
          schema,
          { systemPrompt: 'Extract task metadata as JSON. Use reasonable defaults.' }
        );
        aiExtracted = parsed;
        if (parsed.priority) taskData.priority = parsed.priority;
        if (parsed.dueDate) taskData.dueDate = new Date(parsed.dueDate);
        if (parsed.estimateHours) taskData.estimateHours = Number(parsed.estimateHours);
      } catch {
        aiExtracted = null;
      }
    }

    const task = await taskService.createTask(taskData, req.user.id);
    res.status(201).json({ task, aiExtracted });
  } catch (err) {
    console.error('❌ createTask:', err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

exports.getTasksByProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).select('name team');
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    const projectTasks = await Task.find({ projectId: req.params.projectId });
    const assignedIds = [...new Set(projectTasks.map((t) => t.assignedTo?.toString()).filter(Boolean))];
    const users = assignedIds.length
      ? await Profile.find({ _id: { $in: assignedIds } }).select('-_id email name avatar').lean()
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
    const tasks = projectTasks.map((task) => ({
      ...task._doc,
      assignedTo: task.assignedTo ? userMap[task.assignedTo.toString()] || null : null,
    }));

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
