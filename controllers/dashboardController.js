const AssignedTasks = require('../models/assignTasks');
const Tasks = require('../models/tasks');
const Project = require('../models/projects');
const Membership = require('../models/membership');

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
    const [assignedTasksDoc, membership] = await Promise.all([
      AssignedTasks.findById(req.user.id),
      Membership.findById(req.user.id).select('projects asLead -_id'),
    ]);

    if (!assignedTasksDoc) return res.status(404).json({ error: 'No assigned tasks found' });

    const tasks = await Tasks.find({ _id: { $in: assignedTasksDoc.assignTasks } }).select('title progress status').lean();

    const adminCount = membership?.projects?.length
      ? (await Project.find({ _id: { $in: membership.projects }, createdBy: req.user.id }).select('_id').lean()).length
      : 0;

    res.status(200).json({
      projectCounts: {
        adminProjectsCount: adminCount,
        joinedProjectsCount: (membership?.projects?.length || 0) - adminCount,
        leadProjectCount: membership?.asLead?.length || 0,
      },
      tasks,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching progress overview' });
  }
};
