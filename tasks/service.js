// Core task business logic: CRUD, status pipeline (workflow/WIP/blocked), subtasks, links, bulk.
const { Task, AssignedTask, TaskLink } = require('./models');
const { Project } = require('../projects/models');
const { Profile } = require('../auth/models');
const { logActivity } = require('../utils/activityLogger');
const { sendToProjectRoom } = require('../socket');
const { sendNotification } = require('../notifications/service');

const DONE_STATUSES = ['Completed', 'Done', 'Closed', 'Resolved', 'Finished'];
const DONE_STATUS_RE = /^(Completed|Done|Closed|Resolved|Finished)$/i;

// Whitelist applied on every single-task update path (previously only on one route).
const ALLOWED_FIELDS = [
  'title', 'description', 'status', 'priority', 'progress', 'dueDate',
  'assignedTo', 'sprintId', 'parentId', 'epicId', 'issueType', 'estimateHours', 'resolution',
  'labels', 'acceptanceCriteria',
];

function isDoneStatus(status) {
  return DONE_STATUSES.some((s) => s.toLowerCase() === String(status || '').toLowerCase());
}

async function validateStatus(projectId, status, prefetchedProject) {
  if (!status) return status;
  const project = prefetchedProject || await Project.findById(projectId).select('statuses').lean();
  if (project && project.statuses && project.statuses.length > 0) {
    const allowed = project.statuses.map((s) => s.name);
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status "${status}". Allowed: ${allowed.join(', ')}`);
    }
  }
  return status;
}

async function validateWorkflowTransition(projectId, fromStatus, toStatus, prefetchedProject) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return;
  const project = prefetchedProject || await Project.findById(projectId).select('workflowRules').lean();
  if (!project || !project.workflowRules || !project.workflowRules.enabled) return;
  if (!project.workflowRules.transitions || project.workflowRules.transitions.length === 0) return;

  const allowed = project.workflowRules.transitions.some(
    (t) => t.from === fromStatus && t.to === toStatus
  );
  if (!allowed) {
    throw new Error(`Workflow violation: cannot move from "${fromStatus}" to "${toStatus}". Allowed transitions from "${fromStatus}": ${
      project.workflowRules.transitions.filter((t) => t.from === fromStatus).map((t) => t.to).join(', ') || 'none'
    }`);
  }
}

async function checkWipLimit(projectId, status, prefetchedProject) {
  if (!status) return null;
  const project = prefetchedProject || await Project.findById(projectId).select('wipLimits').lean();
  if (!project || !project.wipLimits || !project.wipLimits.enabled) return null;
  if (!project.wipLimits.limits || project.wipLimits.limits.length === 0) return null;

  const limit = project.wipLimits.limits.find((l) => l.status === status);
  if (!limit) return null;

  const currentCount = await Task.countDocuments({ projectId, status });
  if (currentCount >= limit.max) {
    return { exceeded: true, status, current: currentCount, max: limit.max };
  }
  return null;
}

async function createTask(data, userId) {
  const { title, description, status, priority, dueDate, assignedTo, projectId, sprintId, parentId, epicId, issueType, estimateHours, labels, acceptanceCriteria } = data;

  const validatedStatus = await validateStatus(projectId, status);

  const taskData = {
    title, description, priority,
    progress: 0,
    dueDate, projectId, labels,
  };
  if (validatedStatus) taskData.status = validatedStatus;
  if (issueType) taskData.issueType = issueType;
  if (acceptanceCriteria) taskData.acceptanceCriteria = acceptanceCriteria;
  if (assignedTo) taskData.assignedTo = assignedTo;
  if (sprintId) taskData.sprintId = sprintId;
  if (parentId) taskData.parentId = parentId;
  if (epicId) taskData.epicId = epicId;
  if (estimateHours) {
    taskData.estimateHours = Number(estimateHours);
    taskData.remainingHours = Number(estimateHours);
  }

  const newTask = new Task(taskData);
  const savedTask = await newTask.save();

  if (assignedTo) {
    let assignedTask = await AssignedTask.findById(assignedTo);
    if (!assignedTask) {
      assignedTask = new AssignedTask({ _id: assignedTo, assignTasks: [savedTask._id] });
      await assignedTask.save();
      await Profile.findByIdAndUpdate(assignedTo, { $set: { assignedTasks: assignedTask._id } });
    } else {
      assignedTask.assignTasks.push(savedTask._id);
      await assignedTask.save();
      const profile = await Profile.findById(assignedTo);
      if (!profile.assignedTasks || !profile.assignedTasks.equals(assignedTask._id)) {
        await Profile.findByIdAndUpdate(assignedTo, { $set: { assignedTasks: assignedTask._id } });
      }
    }
  }

  await logActivity({
    actorId: userId,
    action: 'created',
    entityType: 'task',
    entityId: savedTask._id,
    entityName: title,
    projectId,
    description: `Task "${title}" created`,
  });

  sendToProjectRoom(projectId, 'task:created', {
    task: savedTask,
    actor: { userId },
    timestamp: Date.now(),
  });

  if (assignedTo && String(assignedTo) !== String(userId)) {
    const actor = await Profile.findById(userId).select('name').lean();
    sendNotification(assignedTo, 'taskAssigned', {
      taskId: savedTask._id,
      taskTitle: title,
      projectId,
      actorName: actor?.name || 'Someone',
      message: `${actor?.name || 'Someone'} assigned you to "${title}"`,
    });
  }

  if (dueDate) {
    const due = new Date(dueDate);
    const hoursUntilDue = (due.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue > 0 && hoursUntilDue <= 24 && assignedTo) {
      sendNotification(assignedTo, 'dueDateApproaching', {
        taskId: savedTask._id,
        taskTitle: title,
        projectId,
        dueDate,
        message: `"${title}" is due within 24 hours`,
      });
    }
  }

  return savedTask;
}

// Single canonical update pipeline: allowlist → validate → save → side effects.
async function updateTask(taskId, data, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');

  if (data.status !== undefined && data.status !== task.status) {
    await validateStatus(task.projectId, data.status);
    await validateWorkflowTransition(task.projectId, task.status, data.status);

    const wipExceeded = await checkWipLimit(task.projectId, data.status);
    if (wipExceeded) {
      const err = new Error(`WIP limit exceeded for "${wipExceeded.status}": ${wipExceeded.current}/${wipExceeded.max} tasks`);
      err.wipExceeded = true;
      throw err;
    }

    const blocked = await checkBlockedStatus(taskId, data.status);
    if (blocked) {
      const err = new Error(`Task is blocked by: ${blocked.blockers.map((b) => b.title).join(', ')}`);
      err.blocked = true;
      err.blockers = blocked.blockers;
      throw err;
    }
  }

  const oldValues = {};
  const changes = [];

  for (const key of ALLOWED_FIELDS) {
    const value = data[key];
    if (value !== undefined && task[key] !== undefined && String(task[key]) !== String(value)) {
      oldValues[key] = task[key];
      changes.push({ field: key, oldValue: task[key], newValue: value });
      task[key] = value;
    }
  }

  if (changes.length === 0) return task;

  if (data.estimateHours !== undefined) {
    task.remainingHours = Math.max(0, (Number(data.estimateHours) || 0) - (task.loggedHours || 0));
  }

  if (isDoneStatus(task.status) && task.progress !== 100 && !changes.some((c) => c.field === 'progress')) {
    changes.push({ field: 'progress', oldValue: task.progress, newValue: 100 });
    task.progress = 100;
  }

  await task.save();

  if (data.assignedTo && String(data.assignedTo) !== String(oldValues.assignedTo || '')) {
    if (oldValues.assignedTo) {
      await AssignedTask.updateOne(
        { _id: oldValues.assignedTo },
        { $pull: { assignTasks: taskId } },
      );
    }
    let assignedTask = await AssignedTask.findById(data.assignedTo);
    if (!assignedTask) {
      assignedTask = new AssignedTask({ _id: data.assignedTo, assignTasks: [taskId] });
      await assignedTask.save();
    } else {
      await AssignedTask.updateOne(
        { _id: data.assignedTo },
        { $addToSet: { assignTasks: taskId } },
      );
    }

    if (String(data.assignedTo) !== String(userId)) {
      const actor = await Profile.findById(userId).select('name').lean();
      sendNotification(data.assignedTo, 'taskAssigned', {
        taskId: task._id,
        taskTitle: task.title,
        projectId: task.projectId,
        actorName: actor?.name || 'Someone',
        message: `${actor?.name || 'Someone'} assigned you to "${task.title}"`,
      });
    }
  }

  if (changes.some((c) => c.field === 'status') && task.assignedTo && String(task.assignedTo) !== String(userId)) {
    const oldStatus = changes.find((c) => c.field === 'status')?.oldValue;
    const actor = await Profile.findById(userId).select('name').lean();
    sendNotification(task.assignedTo, 'taskStatusChanged', {
      taskId: task._id,
      taskTitle: task.title,
      projectId: task.projectId,
      oldStatus,
      newStatus: task.status,
      actorName: actor?.name || 'Someone',
      message: `${actor?.name || 'Someone'} moved "${task.title}" from ${oldStatus} to ${task.status}`,
    });
  }

  if (changes.some((c) => c.field === 'status') && isDoneStatus(task.status)) {
    const unblocked = await unblockDownstreamTasks(taskId);
    if (unblocked.length > 0) {
      sendToProjectRoom(String(task.projectId), 'task:unblocked', {
        unblockedTaskIds: unblocked,
        unblockedBy: task.title,
        actor: { userId },
        timestamp: Date.now(),
      });
    }
  }

  if (task.parentId) {
    const avgProgress = await rollupParentProgress(taskId);
    if (avgProgress !== null) {
      changes.push({ field: 'parentProgress', oldValue: null, newValue: avgProgress });
    }
  }

  const statusChanged = changes.some((c) => c.field === 'status');
  await logActivity({
    actorId: userId,
    action: statusChanged ? 'status_changed' : 'updated',
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
    projectId: task.projectId,
    changes,
    description: `Task "${task.title}" updated`,
  });

  sendToProjectRoom(String(task.projectId), statusChanged ? 'task:status-changed' : 'task:updated', {
    task,
    changes,
    ...(statusChanged ? { oldStatus: changes.find((c) => c.field === 'status')?.oldValue, newStatus: task.status } : {}),
    actor: { userId },
    timestamp: Date.now(),
  });

  return task;
}

// Batch status updates with per-item errors; prefetched projects for WIP/workflow checks.
async function bulkStatusUpdate(updates, userId) {
  const ids = updates.map((u) => u && u.id).filter(Boolean);
  const tasks = ids.length ? await Task.find({ _id: { $in: ids } }) : [];
  const taskMap = new Map(tasks.map((t) => [String(t._id), t]));

  const projectIds = [...new Set(tasks.map((t) => String(t.projectId)))];
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } })
        .select('statuses workflowRules wipLimits')
        .lean()
    : [];
  const projectMap = new Map(projects.map((p) => [String(p._id), p]));

  const actor = await Profile.findById(userId).select('name').lean();
  const actorName = actor?.name || 'Someone';

  const results = [];
  for (const { id, status } of updates) {
    const task = taskMap.get(String(id));
    if (!task) {
      results.push({ id, error: 'Task not found' });
      continue;
    }
    const project = projectMap.get(String(task.projectId));

    try {
      await validateStatus(task.projectId, status, project);
    } catch (e) {
      results.push({ id, error: e.message });
      continue;
    }

    if (status !== task.status) {
      try {
        await validateWorkflowTransition(task.projectId, task.status, status, project);
      } catch (e) {
        results.push({ id, error: e.message });
        continue;
      }

      const wipExceeded = await checkWipLimit(task.projectId, status, project);
      if (wipExceeded) {
        results.push({ id, error: `WIP limit exceeded for "${status}": ${wipExceeded.current}/${wipExceeded.max}`, wipExceeded });
        continue;
      }

      const blocked = await checkBlockedStatus(id, status);
      if (blocked) {
        results.push({ id, error: `Blocked by: ${blocked.blockers.map((b) => b.title).join(', ')}`, blockers: blocked.blockers });
        continue;
      }
    }

    const oldStatus = task.status;
    const changes = [];
    if (String(task.status) !== String(status)) {
      changes.push({ field: 'status', oldValue: task.status, newValue: status });
    }
    task.status = status;
    if (isDoneStatus(status) && task.progress !== 100) {
      changes.push({ field: 'progress', oldValue: task.progress, newValue: 100 });
      task.progress = 100;
    }
    await task.save();

    if (task.parentId) await rollupParentProgress(id);

    if (isDoneStatus(task.status)) {
      const unblocked = await unblockDownstreamTasks(id);
      if (unblocked.length > 0) {
        sendToProjectRoom(String(task.projectId), 'task:unblocked', {
          unblockedTaskIds: unblocked,
          unblockedBy: task.title,
          actor: { userId },
          timestamp: Date.now(),
        });
      }
    }

    if (changes.length > 0) {
      await logActivity({
        actorId: userId,
        actorName,
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
      actor: { userId },
      timestamp: Date.now(),
    });

    if (task.assignedTo && String(task.assignedTo) !== String(userId)) {
      sendNotification(task.assignedTo, 'taskStatusChanged', {
        taskId: task._id,
        taskTitle: task.title,
        projectId: task.projectId,
        oldStatus,
        newStatus: status,
        actorName,
        message: `${actorName} moved "${task.title}" from ${oldStatus} to ${status}`,
      });
    }

    results.push(task);
  }

  return results;
}

async function deleteTask(taskId, userId) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error('Task not found');

  const subtasks = await Task.find({ parentId: taskId }).select('_id assignedTo attachments').lean();

  await AssignedTask.findByIdAndUpdate(task.assignedTo, { $pull: { assignTasks: taskId } });

  for (const sub of subtasks) {
    await AssignedTask.findByIdAndUpdate(sub.assignedTo, { $pull: { assignTasks: sub._id } });
  }

  const fs = require('fs');
  const path = require('path');
  const uploadDir = path.join(__dirname, '..', 'uploads');
  const attachments = [
    ...(task.attachments || []),
    ...subtasks.flatMap((s) => s.attachments || []),
  ];
  for (const att of attachments) {
    if (!att.path) continue;
    try {
      const filePath = path.join(uploadDir, path.basename(att.path));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }

  await Task.deleteMany({ parentId: taskId });
  await TaskLink.deleteMany({ $or: [{ sourceTaskId: taskId }, { targetTaskId: taskId }] });
  await Task.findByIdAndDelete(taskId);

  await logActivity({
    actorId: userId,
    action: 'deleted',
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
    projectId: task.projectId,
    description: `Task "${task.title}" deleted${subtasks.length > 0 ? ` with ${subtasks.length} subtask(s)` : ''}`,
  });

  sendToProjectRoom(String(task.projectId), 'task:deleted', {
    taskId,
    subtaskIds: subtasks.map((s) => s._id),
    actor: { userId },
    timestamp: Date.now(),
  });
}

async function getSubtasks(taskId) {
  return Task.find({ parentId: taskId })
    .select('title status priority progress issueType assignedTo dueDate')
    .populate('assignedTo', 'name email avatar')
    .sort({ createdAt: 1 })
    .lean();
}

async function getParentTask(taskId) {
  const task = await Task.findById(taskId).select('parentId').lean();
  if (!task || !task.parentId) return null;
  return Task.findById(task.parentId)
    .select('title status progress issueType assignedTo dueDate')
    .populate('assignedTo', 'name email avatar')
    .lean();
}

async function rollupParentProgress(taskId) {
  const task = await Task.findById(taskId).select('parentId').lean();
  if (!task || !task.parentId) return null;

  const siblings = await Task.find({ parentId: task.parentId }).select('progress').lean();
  if (siblings.length === 0) return null;

  const avgProgress = Math.round(siblings.reduce((sum, t) => sum + (t.progress || 0), 0) / siblings.length);
  await Task.findByIdAndUpdate(task.parentId, { progress: avgProgress });
  return avgProgress;
}

async function getBlockedTasks(projectId) {
  const links = await TaskLink.find({
    projectId,
    linkType: { $in: ['blocks', 'depends-on'] },
  }).lean();

  return links.map((l) => (l.linkType === 'blocks' ? l.targetTaskId : l.sourceTaskId));
}

async function checkBlockedStatus(taskId, newStatus) {
  const task = await Task.findById(taskId).select('status projectId').lean();
  if (!task) return null;

  const activeBlockedLinks = await TaskLink.find({
    $or: [
      { targetTaskId: taskId, linkType: 'blocks' },
      { sourceTaskId: taskId, linkType: 'depends-on' },
    ],
  }).lean();

  if (activeBlockedLinks.length === 0) return null;

  const blockerIds = activeBlockedLinks.map((l) =>
    l.linkType === 'blocks' ? l.sourceTaskId : l.targetTaskId
  );

  const incompleteBlockers = await Task.find({
    _id: { $in: blockerIds },
    status: { $not: DONE_STATUS_RE },
  }).select('title status').lean();

  if (incompleteBlockers.length > 0 && !isDoneStatus(newStatus)) {
    return {
      blocked: true,
      blockers: incompleteBlockers.map((b) => ({ id: b._id, title: b.title, status: b.status })),
    };
  }

  return null;
}

async function unblockDownstreamTasks(completedTaskId) {
  const links = await TaskLink.find({
    $or: [
      { sourceTaskId: completedTaskId, linkType: 'blocks' },
      { targetTaskId: completedTaskId, linkType: 'depends-on' },
    ],
  }).lean();

  if (links.length === 0) return [];

  const blockedIds = [...new Set(links.map((l) =>
    l.linkType === 'blocks' ? String(l.targetTaskId) : String(l.sourceTaskId)
  ))];

  const allBlockerLinks = await TaskLink.find({
    $or: [
      { targetTaskId: { $in: blockedIds }, linkType: 'blocks' },
      { sourceTaskId: { $in: blockedIds }, linkType: 'depends-on' },
    ],
  }).lean();

  const blockersByBlocked = new Map();
  for (const l of allBlockerLinks) {
    const blockedId = l.linkType === 'blocks' ? String(l.targetTaskId) : String(l.sourceTaskId);
    const blockerId = l.linkType === 'blocks' ? String(l.sourceTaskId) : String(l.targetTaskId);
    if (!blockersByBlocked.has(blockedId)) blockersByBlocked.set(blockedId, []);
    blockersByBlocked.get(blockedId).push(blockerId);
  }

  const uniqueBlockerIds = [...new Set(
    [...blockersByBlocked.values()].flat().filter((id) => id !== String(completedTaskId))
  )];

  const incompleteBlockers = uniqueBlockerIds.length
    ? await Task.find({
        _id: { $in: uniqueBlockerIds },
        status: { $not: DONE_STATUS_RE },
      }).select('_id').lean()
    : [];
  const incompleteSet = new Set(incompleteBlockers.map((t) => String(t._id)));

  const unblocked = [];
  for (const blockedId of blockedIds) {
    const blockerIds = blockersByBlocked.get(blockedId) || [];
    const otherIncomplete = blockerIds.filter(
      (id) => id !== String(completedTaskId) && incompleteSet.has(id)
    );
    if (otherIncomplete.length === 0) unblocked.push(blockedId);
  }

  return unblocked;
}

async function filterTasks({ projectId, status, priority, issueType, assignedTo, sprintId, label, search, epicId, parentId, page = 1, limit = 50, sort = '-createdAt' }) {
  const query = {};
  if (projectId) query.projectId = projectId;
  if (status) {
    query.status = status.includes(',')
      ? { $in: status.split(',').map((s) => s.trim()) }
      : status;
  }
  if (priority) {
    query.priority = priority.includes(',')
      ? { $in: priority.split(',').map((p) => p.trim()) }
      : priority;
  }
  if (issueType) {
    query.issueType = issueType.includes(',')
      ? { $in: issueType.split(',').map((t) => t.trim()) }
      : issueType;
  }
  if (assignedTo) query.assignedTo = assignedTo;
  if (sprintId) query.sprintId = sprintId;
  if (epicId) query.epicId = epicId;
  if (parentId) query.parentId = parentId;
  if (label) {
    query.labels = label.includes(',')
      ? { $in: label.split(',').map((l) => l.trim()) }
      : label;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [tasks, total] = await Promise.all([
    Task.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
    Task.countDocuments(query),
  ]);

  return {
    tasks,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  };
}

// Unified project-task list: replaces 3 near-identical handlers via options.
async function listProjectTasks(projectId, { includeUserTasks = false, userId } = {}) {
  const project = await Project.findById(projectId);
  if (!project) return null;

  const projectTasks = await Task.find({ projectId }).lean();

  let userTaskDetails;
  if (includeUserTasks && userId) {
    const profile = await Profile.findById(userId);
    if (profile?.assignedTasks) {
      const assignedTaskDoc = await AssignedTask.findById(profile.assignedTasks);
      userTaskDetails = assignedTaskDoc
        ? await Task.find({ _id: { $in: assignedTaskDoc.assignTasks }, projectId }).lean()
        : [];
    } else {
      userTaskDetails = [];
    }
  }

  return { project, projectTasks, userTaskDetails };
}

// Unified "my assigned tasks": replaces dashboard + manageTasks/user/* paths.
async function getAssignedTasks(userId, { scopeProjectId, withProjectNames = false } = {}) {
  const profile = await Profile.findById(userId);
  if (!profile?.assignedTasks) return [];

  const assignedTaskDoc = await AssignedTask.findById(profile.assignedTasks);
  if (!assignedTaskDoc) return [];

  const query = { _id: { $in: assignedTaskDoc.assignTasks } };
  if (scopeProjectId) query.projectId = scopeProjectId;

  let tasks = await Task.find(query).lean();

  if (withProjectNames) {
    const projectIds = [...new Set(tasks.map((t) => String(t.projectId)))];
    const projects = projectIds.length
      ? await Project.find({ _id: { $in: projectIds } }).select('name').lean()
      : [];
    const nameMap = Object.fromEntries(projects.map((p) => [String(p._id), p.name]));
    tasks = tasks.map((t) => ({ ...t, projectName: nameMap[String(t.projectId)] || 'Unknown' }));
  }

  return tasks;
}

module.exports = {
  createTask, updateTask, bulkStatusUpdate, deleteTask, filterTasks,
  validateStatus, getSubtasks, getParentTask, rollupParentProgress,
  getBlockedTasks, checkBlockedStatus, unblockDownstreamTasks,
  validateWorkflowTransition, checkWipLimit, isDoneStatus,
  listProjectTasks, getAssignedTasks, ALLOWED_FIELDS,
};
