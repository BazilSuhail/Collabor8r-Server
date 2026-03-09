// POST /ai/create-task → { prompt, projectId } → creates task via LLM
// POST /ai/breakdown-task → { taskDescription } → returns subtasks
// POST /ai/suggest-assignee → { projectId, taskDescription } → suggests user
// POST /ai/recommend-metadata → { title, description } → { priority, status, dueDate }
// GET /ai/project-summary/:projectId → smart project status
// POST /ai/search-tasks → { query, projectId } → semantic search
// POST /ai/summarize-comments → { taskId } → comment summary
// POST /ai/generate-acceptance-criteria → { title, description } → criteria list
// POST /ai/detect-risks → { projectId } → risks report
// POST /ai/retrospective → { sprintId } → retro insights

const { promptLLM, promptLLMStructured } = require('../utils/ai');
const { taskService } = require('../services');
const Task = require('../models/tasks');
const Project = require('../models/projects');
const Comment = require('../models/comments');
const Sprint = require('../models/sprints');
const Profile = require('../models/profile');

exports.createTask = async (req, res) => {
  try {
    const { prompt, projectId } = req.body;
    if (!prompt || !projectId) return res.status(400).json({ error: 'prompt and projectId required' });

    const schema = '{"title": string, "description": string, "priority": "Low" | "Medium" | "High", "dueDate": string (ISO date)}';
    const parsed = await promptLLMStructured(
      `Extract task details from: "${prompt}"`,
      schema,
      { systemPrompt: 'Extract task details as JSON. Infer priority and dueDate from context. Use reasonable defaults.' }
    );

    const task = await taskService.createTask({
      title: parsed.title || prompt.slice(0, 100),
      description: parsed.description || prompt,
      priority: parsed.priority || 'Medium',
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : new Date(Date.now() + 7 * 86400000),
      projectId,
      status: 'Not Started',
    }, req.user.id);

    res.status(201).json({ task, aiExtracted: parsed });
  } catch (err) {
    res.status(500).json({ error: 'AI task creation failed', detail: err.message });
  }
};

exports.breakdownTask = async (req, res) => {
  try {
    const { taskDescription } = req.body;
    if (!taskDescription) return res.status(400).json({ error: 'taskDescription required' });

    const schema = '{"subtasks": [{"title": string, "description": string, "estimateHours": number}]}';
    const result = await promptLLMStructured(
      `Break this task into 3-7 logical subtasks with estimates:\n${taskDescription}`,
      schema
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'AI breakdown failed', detail: err.message });
  }
};

exports.suggestAssignee = async (req, res) => {
  try {
    const { projectId, taskDescription } = req.body;
    if (!projectId || !taskDescription) return res.status(400).json({ error: 'projectId and taskDescription required' });

    const project = await Project.findById(projectId).populate('team', 'name email');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const teamList = project.team.map((m) => `${m.name} (${m.email})`).join(', ');
    const prompt = `Given this team: ${teamList}\nAnd this task: "${taskDescription}"\nWho is the best person to assign it to? Respond with just the email.`;

    const suggestedEmail = await promptLLM(prompt, { temperature: 0.2, maxTokens: 100 });
    const member = project.team.find((m) => m.email === suggestedEmail.trim());

    res.json({ suggestedEmail: suggestedEmail.trim(), suggestedUser: member || null });
  } catch (err) {
    res.status(500).json({ error: 'AI suggestion failed', detail: err.message });
  }
};

exports.recommendMetadata = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const schema = '{"priority": "Low" | "Medium" | "High", "status": string, "suggestedDueDate": string (ISO date) | null}';
    const result = await promptLLMStructured(
      `Title: ${title}\nDescription: ${description || ''}\nRecommend priority, status, and due date.`,
      schema
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'AI recommendation failed', detail: err.message });
  }
};

exports.projectSummary = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).populate('tasks');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const statusCounts = { 'Not Started': 0, 'In Progress': 0, 'Paused': 0, 'Completed': 0 };
    project.tasks.forEach((t) => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

    const prompt = [
      `Project: ${project.name}`,
      `Total tasks: ${project.tasks.length}`,
      `Status breakdown: ${JSON.stringify(statusCounts)}`,
      `Team size: ${project.team.length}`,
      'Write a brief 2-3 sentence project status summary.',
    ].join('\n');

    const summary = await promptLLM(prompt, { temperature: 0.3, maxTokens: 300 });
    res.json({ summary, stats: { totalTasks: project.tasks.length, ...statusCounts } });
  } catch (err) {
    res.status(500).json({ error: 'AI summary failed', detail: err.message });
  }
};

exports.searchTasks = async (req, res) => {
  try {
    const { query, projectId } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    const filter = projectId ? { projectId } : {};
    const tasks = await Task.find(filter).select('title description status priority').lean();
    const taskList = tasks.map((t) => `- ${t.title}: ${t.description?.slice(0, 100) || ''} [${t.status}]`).join('\n');

    const schema = '{"matchingIds": [string]}';
    const result = await promptLLMStructured(
      `Query: "${query}"\nAvailable tasks:\n${taskList}\nReturn the _ids of tasks that match the query semantically.`,
      schema,
      { temperature: 0.1 }
    );

    const matched = tasks.filter((t) => result.matchingIds.includes(String(t._id)));
    res.json({ tasks: matched });
  } catch (err) {
    res.status(500).json({ error: 'AI search failed', detail: err.message });
  }
};

exports.summarizeComments = async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId required' });

    const comments = await Comment.find({ taskId }).populate('userId', 'name').sort({ createdAt: -1 }).lean();
    if (!comments.length) return res.json({ summary: 'No comments on this task.' });

    const text = comments.map((c) => `${c.userId?.name || 'Unknown'}: ${c.content}`).join('\n');
    const summary = await promptLLM(
      `Summarize this discussion thread in 2-3 bullet points:\n${text}`,
      { temperature: 0.3, maxTokens: 250 }
    );

    res.json({ summary, commentCount: comments.length });
  } catch (err) {
    res.status(500).json({ error: 'AI summarization failed', detail: err.message });
  }
};

exports.generateAcceptanceCriteria = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const schema = '{"criteria": [string]}';
    const result = await promptLLMStructured(
      `Generate 3-5 acceptance criteria for:\nTitle: ${title}\nDescription: ${description || ''}`,
      schema
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed', detail: err.message });
  }
};

exports.detectRisks = async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const tasks = await Task.find({ projectId }).lean();
    const overdue = tasks.filter((t) => t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < new Date());
    const stalled = tasks.filter((t) => t.status === 'Paused');
    const noAssignee = tasks.filter((t) => !t.assignedTo);

    const data = [
      `Total tasks: ${tasks.length}`,
      `Overdue: ${overdue.length}`,
      `Stalled: ${stalled.length}`,
      `Unassigned: ${noAssignee.length}`,
    ].join('\n');

    const schema = '{"risks": [{"severity": "Low" | "Medium" | "High", "description": string, "suggestion": string}]}';
    const result = await promptLLMStructured(
      `Analyze project risks from this data:\n${data}\nIdentify key risks and suggest mitigations.`,
      schema,
      { temperature: 0.3 }
    );

    res.json({ ...result, stats: { totalTasks: tasks.length, overdue: overdue.length, stalled: stalled.length, unassigned: noAssignee.length } });
  } catch (err) {
    res.status(500).json({ error: 'AI risk detection failed', detail: err.message });
  }
};

exports.retrospective = async (req, res) => {
  try {
    const { sprintId } = req.body;
    if (!sprintId) return res.status(400).json({ error: 'sprintId required' });

    const sprint = await Sprint.findById(sprintId).populate('tasks');
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const completed = sprint.tasks.filter((t) => t.status === 'Completed').length;
    const incomplete = sprint.tasks.length - completed;
    const statusBreakdown = {};
    sprint.tasks.forEach((t) => { statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1; });

    const data = [
      `Sprint: ${sprint.name}`,
      `Goal: ${sprint.goal || 'N/A'}`,
      `Total tasks: ${sprint.tasks.length}`,
      `Completed: ${completed}`,
      `Incomplete: ${incomplete}`,
      `Breakdown: ${JSON.stringify(statusBreakdown)}`,
    ].join('\n');

    const schema = '{"whatWentWell": [string], "whatCouldImprove": [string], "actionItems": [string]}';
    const result = await promptLLMStructured(
      `Generate a sprint retrospective from:\n${data}`,
      schema,
      { temperature: 0.4 }
    );

    res.json({ ...result, stats: { totalTasks: sprint.tasks.length, completed, incomplete } });
  } catch (err) {
    res.status(500).json({ error: 'AI retrospective failed', detail: err.message });
  }
};
