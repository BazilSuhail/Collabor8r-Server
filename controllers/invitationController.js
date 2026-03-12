// POST /invitations → send invite { email, projectId?, organizationId?, role? }
// GET /invitations/pending → pending invites for current user
// POST /invitations/:token/accept → accept invite
// POST /invitations/:token/decline → decline invite
// GET /invitations/project/:projectId → invites for a project

const Invitation = require('../models/invitation');
const Profile = require('../models/profile');
const Project = require('../models/projects');
const JoinProject = require('../models/joinProjects');
const { projectService } = require('../services');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');
const { validate, required, isString, isEmail } = require('../utils/validate');

exports.sendInvitation = async (req, res) => {
  try {
    const errors = validate({ email: [required, isEmail] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const email = req.body.email.toLowerCase().trim();

    const existing = await Invitation.findOne({ email, projectId: req.body.projectId, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'Invitation already pending' });

    const [sender, project] = await Promise.all([
      Profile.findById(req.user.id).select('name email avatar'),
      req.body.projectId ? Project.findById(req.body.projectId).select('name description') : null,
    ]);

    const customMsg = req.body.message ? ` — ${req.body.message}` : '';
    const desc = project
      ? `${sender?.name || 'Someone'} has invited you to join "${project.name}"${customMsg}`
      : `${sender?.name || 'Someone'} has invited you${customMsg}`;

    const invite = new Invitation({
      ...req.body,
      email,
      invitedBy: req.user.id,
      type: req.body.projectId ? 'teamMember' : 'organization',
      senderName: sender?.name || 'Someone',
      senderEmail: sender?.email || '',
      senderAvatar: sender?.avatar || '',
      projectName: project?.name || '',
      projectDescription: project?.description || '',
      description: desc,
    });
    await invite.save();

    const invitedUser = await Profile.findOne({ email }).select('_id');
    if (invitedUser) {
      sendInvitationEvent(invitedUser._id, invite);
    }

    res.status(201).json(invite);
  } catch (err) {
    console.error('sendInvitation error:', err);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

exports.getPendingInvitations = async (req, res) => {
  try {
    const profile = await Profile.findById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const invites = await Invitation.find({ email: profile.email.toLowerCase(), status: 'pending' })
      .populate('invitedBy', 'name email').populate('projectId', 'name');
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
};

exports.acceptInvitation = async (req, res) => {
  try {
    const invite = await Invitation.findOne({ token: req.params.token, status: 'pending' });
    if (!invite) return res.status(404).json({ error: 'Invitation not found or expired' });
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invitation expired' });
    }

    if (invite.projectId) {
      const profile = await Profile.findOne({ email: invite.email });
      if (profile) {
        await projectService.addTeamMember(invite.projectId, profile._id, req.user.id);

        if (invite.role === 'manager') {
          await Project.findByIdAndUpdate(invite.projectId, { 'projectManager.status': 'Approved' });

          let joinProject = await JoinProject.findById(profile._id);
          if (!joinProject) {
            joinProject = new JoinProject({ _id: profile._id, projects: [], asManager: [invite.projectId] });
            await joinProject.save();
          } else if (!joinProject.asManager.includes(invite.projectId)) {
            joinProject.asManager.push(invite.projectId);
            await joinProject.save();
          }
        }
      }
    }

    invite.status = 'accepted';
    invite.respondedAt = new Date();
    await invite.save();

    if (invite.invitedBy) {
      sendNotification(invite.invitedBy, 'invitationResponse', {
        invitationId: invite._id,
        projectId: invite.projectId,
        projectName: invite.projectName,
        email: invite.email,
        response: 'accepted',
        message: `${invite.senderName || 'Someone'} accepted the invitation to "${invite.projectName}"`,
      });
    }

    res.json({ message: 'Invitation accepted', invitation: invite });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to accept invitation' });
  }
};

exports.declineInvitation = async (req, res) => {
  try {
    const invite = await Invitation.findOne({ token: req.params.token, status: 'pending' });
    if (!invite) return res.status(404).json({ error: 'Invitation not found' });

    invite.status = 'declined';
    invite.respondedAt = new Date();
    await invite.save();

    if (invite.invitedBy) {
      sendNotification(invite.invitedBy, 'invitationResponse', {
        invitationId: invite._id,
        projectId: invite.projectId,
        projectName: invite.projectName,
        email: invite.email,
        response: 'declined',
        message: `${invite.senderName || 'Someone'} declined the invitation to "${invite.projectName}"`,
      });
    }

    res.json({ message: 'Invitation declined', invitation: invite });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
};

exports.getProjectInvitations = async (req, res) => {
  try {
    const invites = await Invitation.find({ projectId: req.params.projectId })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
};
