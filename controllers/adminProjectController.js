const Profile = require('../models/profile');
const Project = require('../models/projects');
const Task = require('../models/tasks');
const AdminProject = require('../models/adminProjects');
const Invitation = require('../models/invitation');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');
const { logActivity } = require('../utils/activityLogger');

exports.getCreatedProjects = async (req, res) => {
  try {
    const adminProjects = await AdminProject.findById(req.user.id);
    if (!adminProjects) return res.status(404).json({ error: 'Admin projects not found.' });

    const projects = await Promise.all(adminProjects.projects.map((id) => Project.findById(id).lean()));
    const projectList = projects.filter(Boolean);

    const leadIds = [...new Set(projectList.flatMap((p) => p.leads || []))];
    const leads = leadIds.length
      ? await Profile.find({ _id: { $in: leadIds } }).select('name email avatar').lean()
      : [];
    const leadMap = Object.fromEntries(leads.map((l) => [l._id.toString(), l]));

    const createdByMap = {};
    for (const p of projectList) {
      if (p.createdBy && !createdByMap[p.createdBy.toString()]) {
        const creator = await Profile.findById(p.createdBy).select('name email avatar').lean();
        createdByMap[p.createdBy.toString()] = creator;
      }
    }

    const result = await Promise.all(projectList.map(async (project) => {
      const taskStatuses = { 'Not Started': 0, 'In Progress': 0, Paused: 0, Completed: 0 };
      let progressSum = 0;
      const taskIds = project.tasks || [];

      if (taskIds.length) {
        const tasks = await Task.find({ _id: { $in: taskIds } }).select('status progress').lean();
        for (const t of tasks) {
          taskStatuses[t.status] = (taskStatuses[t.status] || 0) + 1;
          progressSum += t.progress || 0;
        }
      }

      return {
        ...project,
        leads: (project.leads || []).map((id) => leadMap[id.toString()] || id),
        createdBy: createdByMap[project.createdBy?.toString()] || null,
        taskCount: taskIds.length,
        teamCount: project.team?.length || 0,
        stats: {
          notStarted: taskStatuses['Not Started'],
          inProgress: taskStatuses['In Progress'],
          paused: taskStatuses.Paused,
          completed: taskStatuses.Completed,
          avgProgress: taskIds.length ? Math.round(progressSum / taskIds.length) : 0,
        },
      };
    }));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [teamDetails, taskDetails, leadDetails] = await Promise.all([
      Promise.all(project.team.map((id) => Profile.findById(id).select('name email avatar -_id'))),
      Promise.all(project.tasks.slice(0, 5).map((id) => Task.findById(id, 'title priority dueDate -_id'))),
      Promise.all(project.leads.map((id) => Profile.findById(id).select('name email avatar'))),
    ]);

    res.status(200).json({
      ...project.toObject(),
      team: teamDetails.filter(Boolean),
      leads: leadDetails.filter(Boolean),
      taskCount: project.tasks.length,
      tasks: taskDetails.filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.searchUserByEmail = async (req, res) => {
  try {
    const { email, projectId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!projectId) return res.status(400).json({ error: 'Project ID is required.' });

    const user = await Profile.findOne({ email }).select('name email avatar _id');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const project = await Project.findById(projectId).select('team');
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (project.team.some((m) => m.toString() === user._id.toString())) {
      return res.status(400).json({ error: 'User is already in the team.' });
    }

    res.status(200).json({ userId: user._id, name: user.name, email: user.email, avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.addMemberToTeam = async (req, res) => {
  try {
    const { userId, projectId } = req.body;
    if (!userId || !projectId) return res.status(400).json({ error: 'userId and projectId are required' });

    const [userToInvite, sender, project] = await Promise.all([
      Profile.findById(userId).select('name email avatar'),
      Profile.findById(req.user.id).select('name email avatar'),
      Project.findById(projectId).select('name description'),
    ]);

    if (!userToInvite) return res.status(404).json({ error: 'No user found with this id' });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const message = req.body.message || '';
    const customMsg = message ? ` — ${message}` : '';
    const desc = `${sender?.name || 'Someone'} has invited you to join "${project.name}"${customMsg}`;

    const invite = new Invitation({
      email: userToInvite.email,
      projectId,
      projectName: project.name,
      projectDescription: project.description,
      invitedBy: req.user.id,
      type: 'teamMember',
      role: req.body.role || 'member',
      senderName: sender?.name || 'Someone',
      senderEmail: sender?.email || '',
      senderAvatar: sender?.avatar || '',
      description: desc,
    });
    await invite.save();

    sendInvitationEvent(userId, invite);

    await logActivity({
      actorId: req.user.id,
      action: 'invited',
      entityType: 'invitation',
      entityId: invite._id,
      entityName: userToInvite.email,
      projectId,
      projectName: project.name,
      description: `${sender?.name || 'Someone'} invited ${userToInvite.email} to "${project.name}"`,
    });

    await sendNotification(userId, 'teamMember', {
      projectId,
      projectName: project.name,
      from: req.user.id,
      senderName: sender?.name || 'Someone',
      senderEmail: sender?.email || '',
      title: `Project invitation from ${sender?.name || 'Someone'}`,
      description: `${sender?.name || 'Someone'} has invited you to join "${project.name}"${message ? ': ' + message : ''}`,
    });

    res.status(200).json({ message: 'Invitation sent', invitation: invite });
  } catch (err) {
    console.error('addMemberToTeam error:', err);
    res.status(500).json({ error: 'Failed to send invitation.' });
  }
};
