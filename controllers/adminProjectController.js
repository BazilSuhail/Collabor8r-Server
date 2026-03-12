const Profile = require('../models/profile');
const Project = require('../models/projects');
const Task = require('../models/tasks');
const AdminProject = require('../models/adminProjects');
const Invitation = require('../models/invitation');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');

exports.getCreatedProjects = async (req, res) => {
  try {
    const adminProjects = await AdminProject.findById(req.user.id);
    if (!adminProjects) return res.status(404).json({ error: 'Admin projects not found.' });

    const projects = await Promise.all(adminProjects.projects.map((id) => Project.findById(id)));
    res.status(200).json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [teamDetails, taskDetails] = await Promise.all([
      Promise.all(project.team.map((id) => Profile.findById(id).select('name email avatar -_id'))),
      Promise.all(project.tasks.slice(0, 5).map((id) => Task.findById(id, 'title priority dueDate -_id'))),
    ]);

    res.status(200).json({
      ...project.toObject(),
      team: teamDetails.filter(Boolean),
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
