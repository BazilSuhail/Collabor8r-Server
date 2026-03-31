const Project = require('../models/projects');
const Profile = require('../models/profile');
const Task = require('../models/tasks');
const Label = require('../models/label');
const Comment = require('../models/comments');
const Sprint = require('../models/sprints');
const { taskService, sprintService } = require('../services');
const { promptLLM, promptLLMStructured } = require('../utils/ai');

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Not Started', 'In Progress', 'Paused', 'Completed'];

exports.draftTask = async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    let context = '';
    if (projectId) {
      const project = await Project.findById(projectId).select('name team').lean();
      if (project) {
        const [members, existingTasks] = await Promise.all([
          Profile.find({ _id: { $in: project.team } }).select('name email').lean(),
          Task.find({ projectId }).select('title').limit(50).lean(),
        ]);
        context = [
          `Project: ${project.name}`,
          `Team: ${members.map((m) => `${m.name} (${m.email})`).join(', ')}`,
          `Existing tasks: ${existingTasks.map((t) => t.title).join('; ') || 'none'}`,
        ].join('\n');
      }
    }

    const schema = [
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "priority": "Low" | "Medium" | "High",',
      '  "status": "Not Started" | "In Progress" | "Paused" | "Completed",',
      '  "dueDate": string (ISO date) | null,',
      '  "estimateHours": number,',
      '  "acceptanceCriteria": [string],',
      '  "suggestedAssignee": string (team email) | null',
      '}',
    ].join('\n');

    const parsed = await promptLLMStructured(
      `${context ? context + '\n\n' : ''}Draft a single task from this intent:\n"${prompt}"`,
      schema,
      {
        temperature: 0.4,
        maxTokens: 700,
        systemPrompt: 'You are a task planning assistant. Produce a focused, actionable task draft. Suggested assignee must be one of the team emails provided, or null. Return ISO date or null for dueDate.',
      }
    );

    res.json({
      task: {
        title: parsed.title || '',
        description: parsed.description || '',
        priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'Medium',
        status: STATUSES.includes(parsed.status) ? parsed.status : 'Not Started',
        dueDate: parsed.dueDate ? new Date(parsed.dueDate).toISOString().slice(0, 10) : '',
        estimateHours: Number(parsed.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
        suggestedAssignee: parsed.suggestedAssignee || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'AI task draft failed', detail: err.message });
  }
};

exports.createTaskFromNL = async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const schema = [
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "priority": "Low" | "Medium" | "High",',
      '  "dueDate": string (ISO date) | null,',
      '  "estimateHours": number,',
      '  "status": "Not Started" | "In Progress" | "Paused" | "Completed"',
      '}',
    ].join('\n');

    const parsed = await promptLLMStructured(
      `Create a task from this intent:\n"${prompt}"`,
      schema,
      { temperature: 0.4, maxTokens: 500, systemPrompt: 'Extract task metadata as JSON with sensible defaults.' }
    );

    const dueDate = parsed.dueDate ? new Date(parsed.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const task = await taskService.createTask({
      title: parsed.title || prompt.slice(0, 120),
      description: parsed.description || 'Created via natural language.',
      priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'Medium',
      status: STATUSES.includes(parsed.status) ? parsed.status : 'Not Started',
      dueDate,
      estimateHours: Number(parsed.estimateHours) || 0,
      projectId,
    }, req.user.id);

    res.status(201).json({ task, aiExtracted: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task from natural language', detail: err.message });
  }
};

exports.breakdownTask = async (req, res) => {
  try {
    const { taskDescription } = req.body;
    if (!taskDescription?.trim()) return res.status(400).json({ error: 'taskDescription is required' });

    const schema = '{ "subtasks": [{ "title": string, "description": string, "estimateHours": number }] }';
    const parsed = await promptLLMStructured(
      `Break this task into 3-6 concrete subtasks:\n"${taskDescription}"`,
      schema,
      { temperature: 0.4, maxTokens: 600, systemPrompt: 'Return subtasks as JSON with short titles, one-line descriptions, and hour estimates.' }
    );

    res.json({ subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to break down task', detail: err.message });
  }
};

exports.suggestAssignee = async (req, res) => {
  try {
    const { projectId, taskDescription } = req.body;
    if (!projectId || !taskDescription?.trim()) {
      return res.status(400).json({ error: 'projectId and taskDescription are required' });
    }

    const project = await Project.findById(projectId).select('team').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const members = await Profile.find({ _id: { $in: project.team } }).select('name email avatar').lean();
    if (members.length === 0) return res.json({ suggestedUser: null });

    const roster = members.map((m) => `${m.name} (${m.email})`).join(', ');
    const schema = '{ "suggestedEmail": string | null, "reason": string }';
    const parsed = await promptLLMStructured(
      `Task: "${taskDescription}"\nTeam roster: ${roster}\nPick the best member to assign this task, or null if none fit.`,
      schema,
      { temperature: 0.3, maxTokens: 250, systemPrompt: 'Choose the most suitable team member for the task. Respond with JSON only.' }
    );

    const suggestedUser = members.find((m) => m.email === parsed.suggestedEmail) || null;
    res.json({
      suggestedEmail: suggestedUser ? suggestedUser.email : null,
      reason: parsed.reason || '',
      suggestedUser: suggestedUser || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest assignee', detail: err.message });
  }
};

exports.recommendMetadata = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const schema = '{ "priority": "Low" | "Medium" | "High", "status": string, "suggestedDueDate": string (ISO date) | null }';
    const parsed = await promptLLMStructured(
      `Title: ${title}\nDescription: ${description || ''}\nRecommend priority, status and a suggested due date (1-3 weeks out).`,
      schema,
      { temperature: 0.3, maxTokens: 200, systemPrompt: 'Return JSON with a sensible priority, one of [Not Started, In Progress, Paused, Completed], and an ISO date or null.' }
    );

    res.json({
      priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'Medium',
      status: STATUSES.includes(parsed.status) ? parsed.status : 'Not Started',
      suggestedDueDate: parsed.suggestedDueDate ? new Date(parsed.suggestedDueDate).toISOString().slice(0, 10) : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to recommend metadata', detail: err.message });
  }
};

exports.generateAcceptanceCriteria = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const schema = '{ "criteria": [string] }';
    const parsed = await promptLLMStructured(
      `Task: ${title}\n${description ? 'Details: ' + description : ''}\nGenerate 3-5 acceptance criteria.`,
      schema,
      { temperature: 0.4, maxTokens: 350, systemPrompt: 'Return concrete, testable acceptance criteria as JSON array.' }
    );

    res.json({ criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate acceptance criteria', detail: err.message });
  }
};

exports.summarizeComments = async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });

    const comments = await Comment.find({ taskId }).sort({ createdAt: 1 }).lean();
    if (comments.length === 0) return res.json({ summary: 'No comments yet.', commentCount: 0 });

    const thread = comments.map((c) => c.content).join('\n');
    const summary = await promptLLM(
      `Summarize this task discussion thread in 2-3 sentences:\n${thread}`,
      { temperature: 0.3, maxTokens: 300 }
    );

    res.json({ summary, commentCount: comments.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to summarize comments', detail: err.message });
  }
};

exports.projectSummary = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ projectId: req.params.projectId });

    const statusCounts = { 'Not Started': 0, 'In Progress': 0, 'Paused': 0, 'Completed': 0 };
    tasks.forEach((t) => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

    const summary = await promptLLM(
      [
        `Project: ${project.name}`,
        `Total tasks: ${tasks.length}`,
        `Status breakdown: ${JSON.stringify(statusCounts)}`,
        `Team size: ${project.team.length}`,
        'Write a brief 2-3 sentence project status summary.',
      ].join('\n'),
      { temperature: 0.3, maxTokens: 300 }
    );

    res.json({ summary, stats: { totalTasks: tasks.length, ...statusCounts } });
  } catch (err) {
    res.status(500).json({ error: 'AI summary failed', detail: err.message });
  }
};

exports.detectRisks = async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findById(projectId).select('name');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ projectId });

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const overdue = tasks.filter((t) => t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < now);
    const stalled = tasks.filter((t) => t.status === 'In Progress' && new Date(t.updatedAt || t.createdAt) < weekAgo);
    const unassigned = tasks.filter((t) => !t.assignedTo);

    const data = [
      `Project: ${project.name}`,
      `Overdue (${overdue.length}): ${overdue.map((t) => t.title).join('; ')}`,
      `Stalled (${stalled.length}): ${stalled.map((t) => t.title).join('; ')}`,
      `Unassigned (${unassigned.length}): ${unassigned.map((t) => t.title).join('; ')}`,
    ].join('\n');

    const schema = '{ "risks": [{ "severity": "high" | "medium" | "low", "description": string, "suggestion": string }] }';
    const parsed = await promptLLMStructured(
      `Scan the project for risks and suggest mitigations:\n${data}`,
      schema,
      { temperature: 0.4, maxTokens: 600, systemPrompt: 'Return a JSON array of risks (at most one per issue) with severity, description and a concrete suggestion.' }
    );

    res.json({
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      stats: { totalTasks: tasks.length, overdue: overdue.length, stalled: stalled.length, unassigned: unassigned.length },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to detect risks', detail: err.message });
  }
};

exports.searchTasks = async (req, res) => {
  try {
    const { query, projectId } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

    const filter = projectId ? { projectId } : {};
    const tasks = await Task.find(filter).select('title description status priority dueDate').limit(200).lean();
    if (tasks.length === 0) return res.json({ tasks: [] });

    const catalog = tasks.map((t) => `${t._id} :: ${t.title} — ${t.description || ''} [${t.status}]`).join('\n');
    const schema = '{ "ids": [string] }';
    const parsed = await promptLLMStructured(
      `Given this task catalog:\n${catalog}\n\nReturn the ids (max 10) most relevant to: "${query}"`,
      schema,
      { temperature: 0.2, maxTokens: 300, systemPrompt: 'Return task ids as a JSON array of strings.' }
    );

    const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
    const selected = tasks.filter((t) => ids.includes(String(t._id)));
    res.json({ tasks: selected });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search tasks', detail: err.message });
  }
};

exports.roadmap = async (req, res) => {
  try {
    const { projectId, goal } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findById(projectId).select('name description objectives team').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [members, existingTasks] = await Promise.all([
      Profile.find({ _id: { $in: project.team } }).select('name email').lean(),
      Task.find({ projectId }).select('title status').limit(100).lean(),
    ]);

    const context = [
      `Project: ${project.name}`,
      `Description: ${project.description || ''}`,
      `Objectives: ${(project.objectives || []).join('; ') || 'none'}`,
      `Team: ${members.map((m) => `${m.name} (${m.email})`).join(', ') || 'none'}`,
      `Existing tasks (${existingTasks.length}): ${existingTasks.map((t) => `[${t.status}] ${t.title}`).join('; ') || 'none'}`,
    ].join('\n');

    const schema = [
      '{',
      '  "summary": string,',
      '  "phases": [',
      '    {',
      '      "name": string,',
      '      "description": string,',
      '      "tasks": [',
      '        { "title": string, "description": string, "priority": "Low" | "Medium" | "High", "estimateHours": number, "acceptanceCriteria": [string] }',
      '      ]',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const parsed = await promptLLMStructured(
      `${context}\n\n${goal ? `Planning goal: ${goal}\n` : ''}Create a delivery roadmap for this project: an ordered set of phases (2-6) and concrete tasks per phase. Do not duplicate existing task titles.`,
      schema,
      {
        temperature: 0.4,
        maxTokens: 1500,
        systemPrompt: 'You are a project planning assistant. Produce a JSON roadmap with phases and actionable, non-duplicative tasks. Existing task titles must not be repeated.',
      }
    );

    res.json({ roadmap: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate roadmap', detail: err.message });
  }
};

exports.suggestTasks = async (req, res) => {
  try {
    const { projectId, prompt, roadmap } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!prompt?.trim() && !roadmap) return res.status(400).json({ error: 'prompt or roadmap is required' });

    const project = await Project.findById(projectId).select('name team').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [members, existingTasks] = await Promise.all([
      Profile.find({ _id: { $in: project.team } }).select('name email').lean(),
      Task.find({ projectId }).select('title').limit(100).lean(),
    ]);

    const context = [
      `Project: ${project.name}`,
      `Team: ${members.map((m) => `${m.name} (${m.email})`).join(', ') || 'none'}`,
      `Existing tasks: ${existingTasks.map((t) => t.title).join('; ') || 'none'}`,
    ].join('\n');

    const schema = [
      '{',
      '  "tasks": [',
      '    {',
      '      "title": string,',
      '      "description": string,',
      '      "priority": "Low" | "Medium" | "High",',
      '      "status": "Not Started",',
      '      "dueDate": string (ISO date) | null,',
      '      "estimateHours": number,',
      '      "acceptanceCriteria": [string],',
      '      "suggestedAssignee": string (team email) | null',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const source = roadmap
      ? `Use this roadmap to pick the most valuable tasks to create now:\n${JSON.stringify(roadmap)}`
      : `Suggest 3-8 concrete tasks to work on now for: "${prompt}"`;

    const parsed = await promptLLMStructured(
      `${context}\n\n${source}\n\nReturn tasks that do NOT duplicate the existing task titles. Assign each to a team member email from the Team list, or null.`,
      schema,
      {
        temperature: 0.4,
        maxTokens: 1200,
        systemPrompt: 'You are a task planning assistant. Return JSON with tasks ready to be created. Never reuse an existing task title.',
      }
    );

    res.json({
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((t) => ({
        title: t.title || '',
        description: t.description || '',
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
        status: STATUSES.includes(t.status) ? t.status : 'Not Started',
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
        estimateHours: Number(t.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
        suggestedAssignee: t.suggestedAssignee || null,
      })) : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest tasks', detail: err.message });
  }
};

exports.createTasksFromSuggestions = async (req, res) => {
  try {
    const { projectId, tasks } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: 'tasks array is required' });

    const project = await Project.findById(projectId).select('team').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const members = project.team?.length
      ? await Profile.find({ _id: { $in: project.team } }).select('_id email').lean()
      : [];
    const emailToId = Object.fromEntries(members.map((m) => [m.email, m._id]));

    const created = [];
    for (const t of tasks) {
      const dueDate = t.dueDate ? new Date(t.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const task = await taskService.createTask({
        title: t.title,
        description: t.description || 'Created from AI suggestion.',
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
        status: STATUSES.includes(t.status) ? t.status : 'Not Started',
        dueDate,
        estimateHours: Number(t.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
        projectId,
        assignedTo: t.suggestedAssignee ? emailToId[t.suggestedAssignee] : undefined,
      }, req.user.id);
      created.push(task);
    }

    res.status(201).json({ tasks: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tasks from suggestions', detail: err.message });
  }
};

exports.createSprintFromNL = async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findById(projectId).select('name').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const schema = [
      '{',
      '  "name": string,',
      '  "goal": string | null,',
      '  "startDate": string (ISO date, default today if not specified),',
      '  "endDate": string (ISO date, default 2 weeks after start if not specified),',
      '  "durationDays": number | null (optional explicit duration)',
      '}',
    ].join('\n');

    const parsed = await promptLLMStructured(
      `Create a sprint for project "${project.name}" from this intent:\n"${prompt}"`,
      schema,
      {
        temperature: 0.3,
        maxTokens: 400,
        systemPrompt: 'You are a sprint planning assistant. Extract a concise sprint name (max 6 words), a clear goal, and sensible dates. Use ISO date strings (YYYY-MM-DD). If dates are implied relatively (e.g. "next week"), compute them relative to today. Today is ' + new Date().toISOString().slice(0, 10) + '.',
      }
    );

    const today = new Date().toISOString().slice(0, 10);
    const start = parsed.startDate ? new Date(parsed.startDate) : new Date(today);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date from AI' });

    const durationDays = Number(parsed.durationDays);
    let end = parsed.endDate ? new Date(parsed.endDate) : null;
    if (!end || isNaN(end.getTime())) {
      end = new Date(start.getTime() + (durationDays > 0 ? durationDays : 14) * 24 * 60 * 60 * 1000);
    }
    if (end <= start) end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

    const sprint = await sprintService.createSprint({
      name: parsed.name || prompt.slice(0, 60),
      goal: parsed.goal || '',
      projectId,
      startDate: start,
      endDate: end,
    }, req.user.id);

    res.status(201).json({ sprint, aiExtracted: { name: parsed.name, goal: parsed.goal, startDate: start, endDate: end } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sprint from natural language', detail: err.message });
  }
};

exports.retrospective = async (req, res) => {
  try {
    const { sprintId } = req.body;
    if (!sprintId) return res.status(400).json({ error: 'sprintId is required' });

    const sprint = await Sprint.findById(sprintId);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const tasks = await Task.find({ sprintId });

    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const statusBreakdown = {};
    tasks.forEach((t) => { statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1; });

    const schema = '{ "whatWentWell": [string], "whatCouldImprove": [string], "actionItems": [string] }';
    const parsed = await promptLLMStructured(
      [
        `Sprint: ${sprint.name}`,
        `Goal: ${sprint.goal || 'N/A'}`,
        `Total tasks: ${tasks.length}`,
        `Completed: ${completed}`,
        `Breakdown: ${JSON.stringify(statusBreakdown)}`,
      ].join('\n'),
      schema,
      { temperature: 0.4 }
    );

    res.json({ ...parsed, stats: { totalTasks: tasks.length, completed, incomplete: tasks.length - completed } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate retrospective', detail: err.message });
  }
};
