// Project routes — consolidated list (?role=&include=), CRUD, members, workflow, summary, AI, join.
// Nested: /:projectId/invitations (invitations/routes), /:projectId/ai/* (ai/routes).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Project, Membership } = require('./models');
const { Profile } = require('../auth/models');
const { Task } = require('../tasks/models');
const projectService = require('./service');
const { sendToProjectRoom, getOnlineProjectMembers } = require('../socket');
const { promptLLM } = require('../lib/ai');
const { validate, required, isString, isEmail } = require('../lib/validate');
const { logActivity } = require('../utils/activityLogger');
const { joinByProjectId } = require('./invitations/service');
const { Invitation } = require('./invitations/models');
const invitationRoutes = require('./invitations/routes');
const projectAiRoutes = require('./ai/routes');

router.use('/:projectId/invitations', invitationRoutes);
router.use('/:projectId/ai', projectAiRoutes);

// GET /projects?role=admin|manager|joined (aliases: created|lead|member)&include=stats
// Mutually exclusive sidebar buckets — reads the exclusive Membership arrays directly
// (pending invitations never appear in any list — they live in GET /invitations/pending):
//   admin/created  → Membership.admin   (projects you created)
//   manager/lead   → Membership.asLead  (accepted leads)
//   joined/member  → Membership.joined  (team, not lead, not creator)
// omit role → union of all three arrays
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { include } = req.query;
    const role = String(req.query.role || '').toLowerCase();
    const userId = req.user.id;
    const wantsStats = String(include || '').includes('stats');

    const membership = await Membership.findById(userId).select('admin asLead joined');
    let ids;
    if (role === 'admin' || role === 'created') {
      ids = membership?.admin || [];
    } else if (role === 'manager' || role === 'lead') {
      ids = membership?.asLead || [];
    } else if (role === 'joined' || role === 'member') {
      ids = membership?.joined || [];
    } else {
      ids = [...new Set([
        ...(membership?.admin || []),
        ...(membership?.asLead || []),
        ...(membership?.joined || []),
      ].map(String))];
    }
    if (!ids.length) return res.status(200).json([]);

    const projects = await Project.find({ _id: { $in: ids } })
      .select('name description createdBy leads theme team status')
      .lean();

    if (!projects.length) return res.status(200).json([]);

    const creatorIds = [...new Set(projects.map((p) => p.createdBy).filter(Boolean))];
    const leadIds = [...new Set(projects.flatMap((p) => p.leads || []))];
    const projectIds = projects.map((p) => p._id);

    const [creators, leads, taskCounts, allTasks] = await Promise.all([
      creatorIds.length ? Profile.find({ _id: { $in: creatorIds } }).select('name avatar').lean() : [],
      leadIds.length ? Profile.find({ _id: { $in: leadIds } }).select('name email avatar').lean() : [],
      Task.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: '$projectId', count: { $sum: 1 } } },
      ]),
      wantsStats
        ? Task.find({ projectId: { $in: projectIds } }).select('projectId status progress').lean()
        : Promise.resolve([]),
    ]);

    const creatorMap = Object.fromEntries(creators.map((c) => [c._id.toString(), c]));
    const leadMap = Object.fromEntries(leads.map((l) => [l._id.toString(), l]));
    const countMap = Object.fromEntries(taskCounts.map((c) => [String(c._id), c.count]));

    const tasksByProject = {};
    for (const t of allTasks) {
      const pid = t.projectId.toString();
      if (!tasksByProject[pid]) tasksByProject[pid] = [];
      tasksByProject[pid].push(t);
    }

    const result = projects.map((project) => {
      const pid = project._id.toString();
      const base = {
        _id: project._id,
        name: project.name,
        description: project.description,
        theme: project.theme,
        status: project.status,
        leads: (project.leads || []).map((id) => leadMap[id.toString()] || id),
        createdBy: creatorMap[project.createdBy?.toString()]
          ? { name: creatorMap[project.createdBy.toString()].name, avatar: creatorMap[project.createdBy.toString()].avatar }
          : null,
        taskCount: countMap[pid] || 0,
        teamCount: project.team?.length || 0,
      };
      if (wantsStats) {
        const tasks = tasksByProject[pid] || [];
        const taskStatuses = {};
        let progressSum = 0;
        for (const t of tasks) {
          taskStatuses[t.status] = (taskStatuses[t.status] || 0) + 1;
          progressSum += t.progress || 0;
        }
        base.stats = {
          ...taskStatuses,
          avgProgress: tasks.length ? Math.round(progressSum / tasks.length) : 0,
        };
      }
      return base;
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('list projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /projects — create (was POST /projects/create).
router.post('/', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], description: [required, isString], leadEmail: [required, isEmail] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const lead = await Profile.findOne({ email: String(req.body.leadEmail).toLowerCase().trim() }).select('_id email');
    if (!lead) return res.status(404).json({ error: 'Project lead not found. Please provide a valid registered lead email.' });
    const project = await projectService.createProject(req.body, req.user.id);
    res.status(201).json({ message: 'Project created successfully!', project });
  } catch (err) {
    console.error('createProject error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// GET /projects/:projectId — details with online flags (merges admin + joined details).
router.get('/:projectId', authMiddleware, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const allMemberIds = [...new Set([
      ...(project.team || []).map((id) => id.toString()),
      ...(project.leads || []).map((id) => id.toString()),
    ])];
    const [allMembers, taskCount, onlineMemberIds] = await Promise.all([
      allMemberIds.length ? Profile.find({ _id: { $in: allMemberIds } }).select('name email avatar').lean() : [],
      Task.countDocuments({ projectId: req.params.projectId }),
      getOnlineProjectMembers(req.params.projectId),
    ]);
    const memberMap = Object.fromEntries(allMembers.map((m) => [m._id.toString(), m]));
    const onlineSet = new Set(onlineMemberIds.map((id) => id.toString()));

    const hydrate = (id) => {
      const p = memberMap[id.toString()];
      if (!p) return null;
      return { ...p, isOnline: onlineSet.has(id.toString()) };
    };

    res.status(200).json({
      ...project,
      team: (project.team || []).map(hydrate).filter(Boolean),
      leads: (project.leads || []).map(hydrate).filter(Boolean),
      taskCount,
      onlineMembers: onlineMemberIds,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /projects/:projectId — update (was PUT /:projectId/update); optional lead invite via invitation service.
router.put('/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      name, description, about, theme, leadEmail,
      objectives, tags, category, methodology,
      startDate, targetDate, version, links,
    } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    // Only the creator or an accepted lead may update a project (same rule as workflow/WIP).
    const isPrivileged = project.createdBy.toString() === req.user.id
      || project.leads.some((id) => id.toString() === req.user.id);
    if (!isPrivileged) {
      return res.status(403).json({ error: 'Only the creator or project leads can update this project' });
    }

    // Validate leadEmail BEFORE mutating so a 404 never leaves partial updates behind.
    let leadUser = null;
    if (leadEmail) {
      leadUser = await Profile.findOne({ email: String(leadEmail).toLowerCase().trim() }).select('_id email');
      if (!leadUser) return res.status(404).json({ error: 'User not found.' });
    }

    const fields = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (about !== undefined) fields.about = about;
    if (theme !== undefined) fields.theme = projectService.normalizeTheme(theme);
    if (objectives !== undefined) fields.objectives = Array.isArray(objectives) ? objectives : [];
    if (tags !== undefined) fields.tags = Array.isArray(tags) ? tags : [];
    if (category !== undefined) fields.category = category;
    if (methodology !== undefined) fields.methodology = projectService.normalizeMethodology(methodology);
    if (startDate !== undefined) fields.startDate = startDate || null;
    if (targetDate !== undefined) fields.targetDate = targetDate || null;
    if (version !== undefined) fields.version = version;
    if (links !== undefined) fields.links = Array.isArray(links) ? links : [];

    const updated = await Project.findByIdAndUpdate(projectId, fields, { returnDocument: 'after' });

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

    sendToProjectRoom(String(projectId), 'project:updated', {
      project: updated,
      changes,
      actor: { userId: req.user.id },
      timestamp: Date.now(),
    });

    let leadChanged = false;
    if (leadUser) {
      const isSelf = String(leadUser._id) === String(req.user.id);
      if (isSelf) {
        // Choosing yourself as lead: accepted immediately — team + leads + membership.
        await projectService.addTeamMember(projectId, req.user.id, req.user.id, { idempotent: true });
        await projectService.acceptLeadRole(projectId, req.user.id, req.user.id);
        leadChanged = true;
      } else {
        const alreadyLead = project.leads.some((l) => String(l) === String(leadUser._id));
        const pendingLead = await Invitation.findOne({
          projectId,
          email: String(leadUser.email).toLowerCase(),
          role: 'lead',
          status: 'pending',
        });
        // Invitation ONLY — they enter project.leads (and lead privileges) on accept,
        // never at invite time. Re-sending to a pending lead is a silent no-op.
        if (!alreadyLead && !pendingLead) {
          const { sendInvitation } = require('./invitations/service');
          await sendInvitation({
            userId: leadUser._id,
            email: leadUser.email,
            projectId,
            projectName: name || project.name,
            projectDescription: project.description,
            invitedBy: req.user.id,
            type: 'projectLead',
            role: 'lead',
          });
        }
      }
    }

    // Refetch so the response includes the lead change captured after `updated`.
    res.status(200).json(leadChanged ? await Project.findById(projectId) : updated);
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    console.error('updateProject error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /projects/:projectId/lead-response — accept/reject lead role.
router.put('/:projectId/lead-response', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { response } = req.body;
    const updatedProject = await Project.findById(projectId);
    if (!updatedProject) return res.status(404).json({ error: 'Project not found.' });
    if (response === 'Accept') {
      // Security: only a user with a (pending/accepted) lead invitation may accept —
      // otherwise anyone could self-promote to lead of any project.
      const profile = await Profile.findById(req.user.id).select('email');
      const invite = await Invitation.findOne({
        projectId,
        email: String(profile?.email || '').toLowerCase(),
        role: 'lead',
        status: { $in: ['pending', 'accepted'] },
      });
      if (!invite) {
        return res.status(403).json({ error: 'No lead invitation for this project' });
      }
      await projectService.addTeamMember(projectId, req.user.id, req.user.id, { idempotent: true });
      await projectService.acceptLeadRole(projectId, req.user.id, req.user.id);
    }
    res.status(200).json(await Project.findById(projectId));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /projects/:projectId/summary — canonical project AI summary (kills /ai/project-summary).
router.get('/:projectId/summary', authMiddleware, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const tasks = await Task.find({ projectId: req.params.projectId });
    const statusCounts = {};
    tasks.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });
    const summary = await promptLLM([
      `Project: ${project.name}`,
      `Total tasks: ${tasks.length}`,
      `Status breakdown: ${JSON.stringify(statusCounts)}`,
      `Team size: ${project.team.length}`,
      'Write a brief 2-3 sentence project status summary.',
    ].join('\n'), { temperature: 0.3, maxTokens: 300 });
    res.json({ summary, stats: { totalTasks: tasks.length, ...statusCounts } });
  } catch (err) {
    res.status(500).json({ error: 'AI summary failed', detail: err.message });
  }
});

// POST /projects/:projectId/join — direct join (was POST /manageusers/accept-invite).
// Security: requires a pending/accepted invitation for the caller's email
// (or already being on the team) — otherwise anyone could join any project.
router.post('/:projectId/join', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).select('team');
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const alreadyMember = (project.team || []).some((m) => String(m) === String(req.user.id));
    if (!alreadyMember) {
      const profile = await Profile.findById(req.user.id).select('email');
      const invite = await Invitation.findOne({
        projectId,
        email: String(profile?.email || '').toLowerCase(),
        status: { $in: ['pending', 'accepted'] },
      });
      if (!invite) return res.status(403).json({ error: 'No invitation to this project' });
    }

    await joinByProjectId(projectId, req.user.id);
    res.status(200).json({ message: 'Project invitation accepted successfully.' });
  } catch (err) {
    if (err.message === 'Project not found') return res.status(404).json({ error: 'Project not found.' });
    res.status(500).json({ error: err.message || 'Failed to accept invitation.' });
  }
});

// GET /projects/:projectId/members — team list; ?q=email for user search (merges searchUserByEmail + getAllUsers).
router.get('/:projectId/members', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    const project = await Project.findById(req.params.projectId).select('team');
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (q) {
      const user = await Profile.findOne({ email: q }).select('name email avatar _id');
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (project.team.some((m) => m.toString() === user._id.toString())) {
        return res.status(400).json({ error: 'User is already in the team.' });
      }
      return res.status(200).json({ userId: user._id, name: user.name, email: user.email, avatar: user.avatar });
    }

    const users = await Profile.find({ _id: { $in: project.team } }).select('email avatar name').lean();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Workflow config
router.get('/:projectId/workflow', authMiddleware, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .select('statuses workflowRules wipLimits').lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const statusCounts = await Task.aggregate([
      { $match: { projectId: project._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = {};
    for (const s of statusCounts) counts[s._id] = s.count;
    res.status(200).json({
      statuses: project.statuses,
      workflowRules: project.workflowRules,
      wipLimits: project.wipLimits,
      currentCounts: counts,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workflow config' });
  }
});

router.put('/:projectId/workflow', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { enabled, transitions } = req.body;
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.leads.some((id) => id.toString() === req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only project leads or creator can configure workflow' });
    }
    if (transitions) {
      const statusNames = project.statuses.map((s) => s.name);
      for (const t of transitions) {
        if (!statusNames.includes(t.from) || !statusNames.includes(t.to)) {
          return res.status(400).json({ error: `Invalid status in transition: ${t.from} -> ${t.to}` });
        }
      }
    }
    project.workflowRules = {
      enabled: enabled !== undefined ? enabled : project.workflowRules?.enabled || false,
      transitions: transitions || project.workflowRules?.transitions || [],
    };
    await project.save();
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'project',
      entityId: projectId, entityName: project.name, projectId,
      changes: [{ field: 'workflowRules', oldValue: null, newValue: project.workflowRules }],
      description: `Workflow rules ${project.workflowRules.enabled ? 'enabled' : 'disabled'} for "${project.name}"`,
    });
    sendToProjectRoom(String(projectId), 'project:workflow-updated', {
      workflowRules: project.workflowRules, actor: { userId: req.user.id }, timestamp: Date.now(),
    });
    res.status(200).json({ workflowRules: project.workflowRules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workflow rules' });
  }
});

router.put('/:projectId/wip-limits', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { enabled, limits } = req.body;
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.leads.some((id) => id.toString() === req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only project leads or creator can configure WIP limits' });
    }
    if (limits) {
      const statusNames = project.statuses.map((s) => s.name);
      for (const l of limits) {
        if (!statusNames.includes(l.status)) return res.status(400).json({ error: `Invalid status in WIP limit: ${l.status}` });
        if (l.max < 1) return res.status(400).json({ error: `WIP limit max must be >= 1 for "${l.status}"` });
      }
    }
    project.wipLimits = {
      enabled: enabled !== undefined ? enabled : project.wipLimits?.enabled || false,
      limits: limits || project.wipLimits?.limits || [],
    };
    await project.save();
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'project',
      entityId: projectId, entityName: project.name, projectId,
      changes: [{ field: 'wipLimits', oldValue: null, newValue: project.wipLimits }],
      description: `WIP limits ${project.wipLimits.enabled ? 'enabled' : 'disabled'} for "${project.name}"`,
    });
    sendToProjectRoom(String(projectId), 'project:wip-updated', {
      wipLimits: project.wipLimits, actor: { userId: req.user.id }, timestamp: Date.now(),
    });
    res.status(200).json({ wipLimits: project.wipLimits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update WIP limits' });
  }
});

module.exports = router;
