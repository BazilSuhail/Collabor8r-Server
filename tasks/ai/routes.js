// Task AI routes mounted at /tasks/ai/*
// Killed twins: /ai/summarize-comments → GET /tasks/:taskId/comments/summary; /ai/create-tasks → POST /tasks/bulk.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const { Project } = require('../../projects/models');
const { Profile } = require('../../auth/models');
const { Task } = require('../../tasks/models');
const taskService = require('../service');
const { promptLLM, promptLLMStructured } = require('../../lib/ai');

const PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_STATUSES = ['Not Started', 'In Progress', 'Paused', 'Completed'];

async function getProjectStatuses(projectId) {
  if (!projectId) return DEFAULT_STATUSES;
  const project = await Project.findById(projectId).select('statuses').lean();
  if (project?.statuses?.length > 0) return project.statuses.map((s) => s.name);
  return DEFAULT_STATUSES;
}

router.post('/draft', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const statuses = await getProjectStatuses(projectId);
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
          `Allowed statuses: ${statuses.join(', ')}`,
        ].join('\n');
      }
    }
    const schema = [
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "priority": "Low" | "Medium" | "High",',
      `  "status": ${statuses.map((s) => `"${s}"`).join(' | ')},`,
      '  "dueDate": string (ISO date) | null,',
      '  "estimateHours": number,',
      '  "acceptanceCriteria": [string],',
      '  "suggestedAssignee": string (team email) | null,',
      '  "issueType": "epic" | "story" | "task" | "sub-task" | "bug"',
      '}',
    ].join('\n');
    const parsed = await promptLLMStructured(
      `${context ? context + '\n\n' : ''}Draft a single task from this intent:\n"${prompt}"`,
      schema,
      {
        temperature: 0.4, maxTokens: 700,
        systemPrompt: 'You are a task planning assistant. Produce a focused, actionable task draft. Suggested assignee must be one of the team emails provided, or null. Return ISO date or null for dueDate.',
      }
    );
    res.json({
      task: {
        title: parsed.title || '',
        description: parsed.description || '',
        priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'Medium',
        status: statuses.includes(parsed.status) ? parsed.status : statuses[0],
        dueDate: parsed.dueDate ? new Date(parsed.dueDate).toISOString().slice(0, 10) : '',
        estimateHours: Number(parsed.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
        suggestedAssignee: parsed.suggestedAssignee || null,
        issueType: ['epic', 'story', 'task', 'sub-task', 'bug'].includes(parsed.issueType) ? parsed.issueType : 'task',
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'AI task draft failed', detail: err.message });
  }
});

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const statuses = await getProjectStatuses(projectId);
    const schema = [
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "priority": "Low" | "Medium" | "High",',
      '  "dueDate": string (ISO date) | null,',
      '  "estimateHours": number,',
      `  "status": ${statuses.map((s) => `"${s}"`).join(' | ')},`,
      '  "issueType": "epic" | "story" | "task" | "sub-task" | "bug"',
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
      status: statuses.includes(parsed.status) ? parsed.status : statuses[0],
      issueType: ['epic', 'story', 'task', 'sub-task', 'bug'].includes(parsed.issueType) ? parsed.issueType : 'task',
      dueDate,
      estimateHours: Number(parsed.estimateHours) || 0,
      projectId,
    }, req.user.id);
    res.status(201).json({ task, aiExtracted: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task from natural language', detail: err.message });
  }
});

router.post('/breakdown', authMiddleware, async (req, res) => {
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
});

router.post('/suggest-assignee', authMiddleware, async (req, res) => {
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
});

router.post('/recommend-metadata', authMiddleware, async (req, res) => {
  try {
    const { title, description, projectId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const statuses = await getProjectStatuses(projectId);
    const schema = '{ "priority": "Low" | "Medium" | "High", "status": string, "suggestedDueDate": string (ISO date) | null }';
    const parsed = await promptLLMStructured(
      `Title: ${title}\nDescription: ${description || ''}\nRecommend priority, status and a suggested due date (1-3 weeks out).`,
      schema,
      { temperature: 0.3, maxTokens: 200, systemPrompt: `Return JSON with a sensible priority, one of [${statuses.join(', ')}], and an ISO date or null.` }
    );
    res.json({
      priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'Medium',
      status: statuses.includes(parsed.status) ? parsed.status : statuses[0],
      suggestedDueDate: parsed.suggestedDueDate ? new Date(parsed.suggestedDueDate).toISOString().slice(0, 10) : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to recommend metadata', detail: err.message });
  }
});

router.post('/acceptance-criteria', authMiddleware, async (req, res) => {
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
});

router.post('/search', authMiddleware, async (req, res) => {
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
    res.json({ tasks: tasks.filter((t) => ids.includes(String(t._id))) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search tasks', detail: err.message });
  }
});

module.exports = router;
