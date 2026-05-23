// Dashboard overview — GET /overview (mounted at /overview in server.js).
// include=assigned|progress (default: both)
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Task, AssignedTask } = require('../tasks/models');
const { Project, Membership } = require('../projects/models');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const include = String(req.query.include || 'assigned,progress');
    const out = {};

    if (include.includes('assigned')) {
      const assignedTasksDoc = await AssignedTask.findById(req.user.id);
      if (assignedTasksDoc) {
        const tasks = await Task.find({ _id: { $in: assignedTasksDoc.assignTasks } });
        const projectIds = [...new Set(tasks.map((t) => t.projectId?.toString()).filter(Boolean))];
        const projects = projectIds.length
          ? await Project.find({ _id: { $in: projectIds } }).select('name').lean()
          : [];
        const projectMap = Object.fromEntries(projects.map((p) => [p._id.toString(), p]));
        out.tasks = tasks.map((task) => ({
          ...task._doc,
          projectName: projectMap[task.projectId?.toString()]?.name || 'No Project Assigned',
        }));
      } else {
        out.tasks = [];
      }
    }

    if (include.includes('progress')) {
      const [assignedTasksDoc, membership] = await Promise.all([
        AssignedTask.findById(req.user.id),
        // Exclusive buckets — counts are plain array lengths, so they always
        // equal the sidebar list lengths of GET /projects?role=admin|manager|joined.
        Membership.findById(req.user.id).select('admin asLead joined -_id'),
      ]);
      const tasks = assignedTasksDoc
        ? await Task.find({ _id: { $in: assignedTasksDoc.assignTasks } }).select('title progress status').lean()
        : [];
      out.projectCounts = {
        adminProjectsCount: membership?.admin?.length || 0,
        joinedProjectsCount: membership?.joined?.length || 0,
        leadProjectCount: membership?.asLead?.length || 0,
      };
      out.progressTasks = tasks;
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching overview' });
  }
});

module.exports = router;
