const Project = require('../models/projects');
const Profile = require('../models/profile');
const JoinProject = require('../models/joinProjects');
const Invitation = require('../models/invitation');
const { projectService } = require('../services');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');
const { promptLLM, promptLLMStructured } = require('../utils/ai');
const { validate, required, isString, isEmail } = require('../utils/validate');
const { logActivity } = require('../utils/activityLogger');

exports.aiAssistProject = async (req, res) => {
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
        temperature: 0.4,
        maxTokens: 800,
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
        methodology: ['sprint', 'kanban'].includes(parsed.methodology) ? parsed.methodology : 'sprint',
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
        version: parsed.version || 'v1.0',
        links: Array.isArray(parsed.links) ? parsed.links : [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'AI project draft failed', detail: err.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], description: [required, isString], leadEmail: [required, isEmail] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const lead = await Profile.findOne({ email: req.body.leadEmail }).select('_id email');
    if (!lead) return res.status(404).json({ error: 'Project lead not found. Please provide a valid registered lead email.' });

    const project = await projectService.createProject(req.body, req.user.id);
    res.status(201).json({ message: 'Project created successfully!', project });
  } catch (err) {
    console.error('createProject error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      name, description, about, theme, leadEmail,
      objectives, tags, category, methodology,
      startDate, targetDate, version, links,
    } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const fields = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (about !== undefined) fields.about = about;
    if (theme !== undefined) fields.theme = theme;
    if (objectives !== undefined) fields.objectives = Array.isArray(objectives) ? objectives : [];
    if (tags !== undefined) fields.tags = Array.isArray(tags) ? tags : [];
    if (category !== undefined) fields.category = category;
    if (methodology !== undefined) fields.methodology = methodology;
    if (startDate !== undefined) fields.startDate = startDate || null;
    if (targetDate !== undefined) fields.targetDate = targetDate || null;
    if (version !== undefined) fields.version = version;
    if (links !== undefined) fields.links = Array.isArray(links) ? links : [];

    const updated = await Project.findByIdAndUpdate(projectId, fields, { new: true });

    const changes = Object.keys(fields)
      .filter((k) => k !== 'leads')
      .map((k) => ({ field: k, oldValue: project[k], newValue: fields[k] }));

    await logActivity({
      actorId: req.user.id,
      action: 'updated',
      entityType: 'project',
      entityId: projectId,
      entityName: project.name,
      projectId,
      projectName: project.name,
      changes,
      description: `Project "${project.name}" updated`,
    });

    if (leadEmail) {
      const user = await Profile.findOne({ email: leadEmail }).select('_id email');
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const alreadyLead = project.leads.some((l) => String(l) === String(user._id));
      if (!alreadyLead) {
        const sender = await Profile.findById(req.user.id).select('name email avatar');
        await Project.findByIdAndUpdate(projectId, { $addToSet: { leads: user._id } });

        const projectName = name || project.name;
        const desc = `${sender?.name || 'Someone'} has invited you as Project Lead for "${projectName}"`;
        const invite = new Invitation({
          email: user.email,
          projectId,
          projectName,
          projectDescription: project.description,
          invitedBy: req.user.id,
          type: 'projectLead',
          role: 'lead',
          senderName: sender?.name || 'Someone',
          senderEmail: sender?.email || '',
          senderAvatar: sender?.avatar || '',
          description: desc,
        });
        await invite.save();

        sendInvitationEvent(user._id, invite);

        await sendNotification(user._id, 'projectLead', {
          projectId, projectName,
          from: req.user.id,
          senderName: sender?.name || 'Someone',
          senderEmail: sender?.email || '',
          title: `Lead invitation from ${sender?.name || 'Someone'}`,
          description: `${sender?.name || 'Someone'} has invited you as Lead for "${projectName}"`,
        });
      }
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error('updateProject error:', err);
    res.status(500).json({ error: 'Server error.' });
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

exports.leadResponse = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { response } = req.body;

    const updatedProject = await Project.findById(projectId);
    if (!updatedProject) return res.status(404).json({ error: 'Project not found.' });

    if (response === 'Accept') {
      await Project.findByIdAndUpdate(projectId, { $addToSet: { leads: req.user.id } }, { new: true });

      let joinProject = await JoinProject.findById(req.user.id);
      if (!joinProject) {
        joinProject = new JoinProject({ _id: req.user.id, asLead: [projectId], projects: [] });
        await joinProject.save();
      } else if (!joinProject.asLead.includes(projectId)) {
        joinProject.asLead.push(projectId);
        await joinProject.save();
      }
    }

    const fresh = await Project.findById(projectId);
    res.status(200).json(fresh);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};
