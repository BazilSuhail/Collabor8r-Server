// Report routes — budget/burndown/velocity/health under /reports/:projectId/*.
// Overview lives in reports/overview.js (mounted at /overview).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Task } = require('../tasks/models');
const { Project } = require('../projects/models');
const { Sprint } = require('../sprints/models');
const { GitCommit } = require('../git/models');
const { isDoneStatus } = require('../tasks/service');

router.get('/:projectId/budget', authMiddleware, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .select('name budget statuses').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ projectId: req.params.projectId })
      .select('estimateHours loggedHours remainingHours status').lean();

    const totalEstimate = tasks.reduce((sum, t) => sum + (t.estimateHours || 0), 0);
    const totalLogged = tasks.reduce((sum, t) => sum + (t.loggedHours || 0), 0);
    const totalRemaining = tasks.reduce((sum, t) => sum + (t.remainingHours || 0), 0);

    const budget = project.budget || {};
    const estimatedCost = totalEstimate * (budget.hourlyRate || 0);
    const loggedCost = totalLogged * (budget.hourlyRate || 0);
    const remainingCost = totalRemaining * (budget.hourlyRate || 0);

    const statusBreakdown = {};
    for (const t of tasks) {
      if (!statusBreakdown[t.status]) {
        statusBreakdown[t.status] = { count: 0, estimatedHours: 0, loggedHours: 0 };
      }
      statusBreakdown[t.status].count++;
      statusBreakdown[t.status].estimatedHours += t.estimateHours || 0;
      statusBreakdown[t.status].loggedHours += t.loggedHours || 0;
    }

    res.status(200).json({
      project: { name: project.name, budget },
      hours: { totalEstimate, totalLogged, totalRemaining },
      costs: { estimatedCost, loggedCost, remainingCost },
      utilization: totalEstimate > 0 ? Math.round((totalLogged / totalEstimate) * 100) : 0,
      statusBreakdown,
      taskCount: tasks.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate budget report' });
  }
});

router.get('/:projectId/burndown', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sprintId } = req.query;

    const project = await Project.findById(projectId).select('name startDate targetDate').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let startDate, endDate;
    if (sprintId) {
      const sprint = await Sprint.findById(sprintId).lean();
      if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
      startDate = sprint.startDate;
      endDate = sprint.endDate;
    } else {
      startDate = project.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      endDate = project.targetDate || new Date();
    }

    const query = { projectId, createdAt: { $gte: startDate, $lte: endDate } };
    if (sprintId) query.sprintId = sprintId;

    const tasks = await Task.find(query).select('status createdAt').sort({ createdAt: 1 }).lean();
    const totalTasks = tasks.length;
    const dayMap = {};
    const completedByDay = {};

    for (const t of tasks) {
      const day = new Date(t.createdAt).toISOString().split('T')[0];
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
    const completedTasks = tasks.filter((t) => isDoneStatus(t.status));
    for (const t of completedTasks) {
      const day = new Date(t.updatedAt || t.createdAt).toISOString().split('T')[0];
      completedByDay[day] = (completedByDay[day] || 0) + 1;
    }

    const points = [];
    let remaining = totalTasks;
    let completed = 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDuration = end - start;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const addedToday = dayMap[dayStr] || 0;
      const doneToday = completedByDay[dayStr] || 0;
      remaining += addedToday - doneToday;
      completed += doneToday;
      const idealRatio = totalDuration > 0 ? 1 - (d - start) / totalDuration : 1;
      points.push({
        date: dayStr,
        ideal: Math.max(0, Math.round(totalTasks * idealRatio)),
        remaining: Math.max(0, remaining),
        completed,
        added: addedToday,
      });
    }

    res.status(200).json({ project: project.name, sprintId: sprintId || null, totalTasks, points });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate burndown' });
  }
});

router.get('/:projectId/velocity', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sprintCount: rawSprintCount = 5 } = req.query;
    const sprintCount = Math.min(50, Math.max(1, parseInt(rawSprintCount, 10) || 5));

    const project = await Project.findById(projectId).select('name').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const sprints = await Sprint.find({ projectId, isCompleted: true })
      .sort({ endDate: -1 }).limit(sprintCount).lean();

    const sprintIds = sprints.map((s) => s._id);
    const allTasks = sprintIds.length
      ? await Task.find({ sprintId: { $in: sprintIds } })
          .select('sprintId status estimateHours loggedHours').lean()
      : [];

    const tasksBySprint = new Map();
    for (const t of allTasks) {
      const sid = String(t.sprintId);
      if (!tasksBySprint.has(sid)) tasksBySprint.set(sid, []);
      tasksBySprint.get(sid).push(t);
    }

    const sprintData = sprints.map((sprint) => {
      const tasks = tasksBySprint.get(String(sprint._id)) || [];
      const completed = tasks.filter((t) => isDoneStatus(t.status));
      const totalPoints = tasks.reduce((sum, t) => sum + (t.estimateHours || 0), 0);
      const completedPoints = completed.reduce((sum, t) => sum + (t.estimateHours || 0), 0);
      return {
        sprintId: sprint._id, name: sprint.name,
        startDate: sprint.startDate, endDate: sprint.endDate,
        totalTasks: tasks.length, completedTasks: completed.length,
        totalPoints, completedPoints, velocity: completedPoints,
      };
    });

    const avgVelocity = sprintData.length > 0
      ? Math.round(sprintData.reduce((sum, s) => sum + s.velocity, 0) / sprintData.length)
      : 0;

    res.status(200).json({
      project: project.name, sprints: sprintData, avgVelocity,
      trend: sprintData.map((s) => s.velocity),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate velocity report' });
  }
});

router.get('/:projectId/health', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ projectId })
      .select('status priority dueDate estimateHours loggedHours progress createdAt').lean();
    const commits = await GitCommit.countDocuments({ projectId });

    const now = new Date();
    const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && !isDoneStatus(t.status));
    const completed = tasks.filter((t) => isDoneStatus(t.status));
    const inProgress = tasks.filter((t) => t.status === 'In Progress');
    const totalEstimate = tasks.reduce((sum, t) => sum + (t.estimateHours || 0), 0);
    const totalLogged = tasks.reduce((sum, t) => sum + (t.loggedHours || 0), 0);
    const highPriorityOpen = tasks.filter((t) => t.priority === 'High' && !isDoneStatus(t.status));
    const avgProgress = tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
      : 0;

    const issues = [];
    if (overdue.length > 0) issues.push(`${overdue.length} overdue task(s)`);
    if (highPriorityOpen.length > 0) issues.push(`${highPriorityOpen.length} high-priority task(s) still open`);
    if (totalEstimate > 0 && totalLogged > totalEstimate * 1.2) issues.push('Over budget (logged > 120% of estimate)');
    if (tasks.length > 0 && completed.length / tasks.length < 0.3 && project.targetDate && new Date(project.targetDate) < now) {
      issues.push('Behind schedule (< 30% complete near target date)');
    }

    let healthScore = 100;
    if (overdue.length > 0) healthScore -= overdue.length * 5;
    if (highPriorityOpen.length > 0) healthScore -= highPriorityOpen.length * 3;
    if (totalEstimate > 0 && totalLogged > totalEstimate) healthScore -= 15;
    healthScore = Math.max(0, Math.min(100, healthScore));

    let healthStatus;
    if (healthScore >= 80) healthStatus = 'healthy';
    else if (healthScore >= 50) healthStatus = 'at-risk';
    else healthStatus = 'critical';

    res.status(200).json({
      project: { name: project.name, status: project.status },
      stats: {
        totalTasks: tasks.length, completed: completed.length,
        inProgress: inProgress.length, overdue: overdue.length,
        avgProgress, totalEstimate, totalLogged, commits,
      },
      healthScore, healthStatus, issues,
      highPriorityOpen: highPriorityOpen.map((t) => ({
        id: t._id, title: t.title, dueDate: t.dueDate, progress: t.progress,
      })),
      overdueTasks: overdue.map((t) => ({
        id: t._id, title: t.title, dueDate: t.dueDate, progress: t.progress,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate health report' });
  }
});

module.exports = router;
