const AssignedTasks = require('../models/assignTasks');
const Tasks = require('../models/tasks');
const Project = require('../models/projects');
const AdminProject = require('../models/adminProjects');
const JoinProject = require('../models/joinProjects');

exports.fetchAssignedTasks = async (req, res) => {
  try {
    const assignedTasksDoc = await AssignedTasks.findById(req.user.id);
    if (!assignedTasksDoc) return res.status(404).json({ error: 'No assigned tasks found' });

    const tasks = await Tasks.find({ _id: { $in: assignedTasksDoc.assignTasks } });
    const tasksWithProject = await Promise.all(tasks.map(async (task) => {
      const project = await Project.findById(task.projectId);
      return { ...task._doc, projectName: project ? project.name : 'No Project Assigned' };
    }));

    res.status(200).json({ tasks: tasksWithProject });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching assigned tasks' });
  }
};

exports.fetchProgressOverview = async (req, res) => {
  try {
    const [assignedTasksDoc, adminProjects, joinedProjects] = await Promise.all([
      AssignedTasks.findById(req.user.id),
      AdminProject.findById(req.user.id).select('projects -_id'),
      JoinProject.findById(req.user.id).select('asManager projects -_id'),
    ]);

    if (!assignedTasksDoc) return res.status(404).json({ error: 'No assigned tasks found' });

    const tasks = await Tasks.find({ _id: { $in: assignedTasksDoc.assignTasks } }).select('title progress status').lean();

    res.status(200).json({
      projectCounts: {
        adminProjectsCount: adminProjects?.projects?.length || 0,
        joinedProjectsCount: joinedProjects?.projects?.length || 0,
        managerProjectCount: joinedProjects?.asManager?.length || 0,
      },
      tasks,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching progress overview' });
  }
};
