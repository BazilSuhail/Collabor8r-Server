// Project AI routes mounted at /projects/:projectId/ai/*
// Kills standalone /ai/roadmap, /ai/detect-risks, /ai/suggest-tasks (now project-scoped).
const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../../middleware/authMiddleware');
const { Project } = require('../../projects/models');
const { Profile } = require('../../auth/models');
const { Task } = require('../../tasks/models');
const taskService = require('../../tasks/service');
const { promptLLMStructured } = require('../../lib/ai');

const PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_STATUSES = ['Not Started', 'In Progress', 'Paused', 'Completed'];

async function getProjectStatuses(projectId) {
  if (!projectId) return DEFAULT_STATUSES;
  const project = await Project.findById(projectId).select('statuses').lean();
  if (project?.statuses?.length > 0) return project.statuses.map((s) => s.name);
  return DEFAULT_STATUSES;
}

router.post('/assist', authMiddleware, async (req, res) => {
  try {
    const prompt = req.body.prompt;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const schema = [
      '{',
      '  "name": string,',
      '  "description": string,',
      '  "about": string,',
      '  "objectives": [string],',
      '  "tags": [string],',
      '  "category": "software" | "marketing" | "design" | "research" | "business" | "other",',
      '  "methodology": "sprint" | "kanban",',
      '  "startDate": string (ISO date) | null,',
      '  "targetDate": string (ISO date) | null,',
      '  "version": string,',
      '  "links": [{ "title": string, "url": string, "kind": "docs" | "repo" | "wiki" | "figma" | "other" }]',
      '}',
    ].join('\n');
    const parsed = await promptLLMStructured(
      `Draft a project plan from this user intent:\n"${prompt}"`,
      schema,
      {
        temperature: 0.4, maxTokens: 800,
        systemPrompt: 'You are a project planning assistant. Extract a complete project draft as JSON. Set links to an empty array unless the user explicitly provided URLs. Provide a concise but informative description and about. Infer category and methodology from context. Return ISO dates or null.',
      }
    );
    res.json({
      project: {
        name: parsed.name || '',
        description: parsed.description || '',
        about: parsed.about || '',
        objectives: Array.isArray(parsed.objectives) ? parsed.objectives : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
        category: ['software', 'marketing', 'design', 'research', 'business', 'other'].includes(parsed.category) ? parsed.category : 'other',
        methodology: ['sprint', 'kanban'].includes(String(parsed.methodology || '').toLowerCase())
          ? String(parsed.methodology).toLowerCase()
          : 'sprint',
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
        version: parsed.version || 'v1.0',
        links: Array.isArray(parsed.links) ? parsed.links : [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'AI project draft failed', detail: err.message });
  }
});

router.post('/roadmap', authMiddleware, async (req, res) => {
  try {
    const { goal } = req.body;
    const projectId = req.params.projectId;
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
        temperature: 0.4, maxTokens: 1500,
        systemPrompt: 'You are a project planning assistant. Produce a JSON roadmap with phases and actionable, non-duplicative tasks. Existing task titles must not be repeated.',
      }
    );
    res.json({ roadmap: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate roadmap', detail: err.message });
  }
});

router.post('/risks', authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await Project.findById(projectId).select('name');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ projectId });
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const { isDoneStatus } = require('../../tasks/service');
    const overdue = tasks.filter((t) => !isDoneStatus(t.status) && t.dueDate && new Date(t.dueDate) < now);
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
});

router.post('/suggest-tasks', authMiddleware, async (req, res) => {
  try {
    const { prompt, roadmap } = req.body;
    const projectId = req.params.projectId;
    if (!prompt?.trim() && !roadmap) return res.status(400).json({ error: 'prompt or roadmap is required' });

    const statuses = await getProjectStatuses(projectId);
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
      `Allowed statuses: ${statuses.join(', ')}`,
    ].join('\n');

    const schema = [
      '{',
      '  "tasks": [',
      '    {',
      '      "title": string,',
      '      "description": string,',
      '      "priority": "Low" | "Medium" | "High",',
      `      "status": ${statuses.map((s) => `"${s}"`).join(' | ')},`,
      '      "dueDate": string (ISO date) | null,',
      '      "estimateHours": number,',
      '      "acceptanceCriteria": [string],',
      '      "suggestedAssignee": string (team email) | null,',
      '      "issueType": "epic" | "story" | "task" | "sub-task" | "bug"',
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
        temperature: 0.4, maxTokens: 1200,
        systemPrompt: 'You are a task planning assistant. Return JSON with tasks ready to be created. Never reuse an existing task title.',
      }
    );

    res.json({
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((t) => ({
        title: t.title || '',
        description: t.description || '',
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
        status: statuses.includes(t.status) ? t.status : statuses[0],
        issueType: ['epic', 'story', 'task', 'sub-task', 'bug'].includes(t.issueType) ? t.issueType : 'task',
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
        estimateHours: Number(t.estimateHours) || 0,
        acceptanceCriteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
        suggestedAssignee: t.suggestedAssignee || null,
      })) : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest tasks', detail: err.message });
  }
});

module.exports = router;
