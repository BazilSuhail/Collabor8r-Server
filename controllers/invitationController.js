// POST /invitations → send invite { email, projectId, role? }
// GET /invitations/pending → pending invites for current user
// POST /invitations/:token/accept → accept invite
// POST /invitations/:token/decline → decline invite
// GET /invitations/project/:projectId → invites for a project

const Invitation = require('../models/invitation');
const Profile = require('../models/profile');
const Project = require('../models/projects');
const Membership = require('../models/membership');
const { projectService } = require('../services');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');
const { validate, required, isString, isEmail } = require('../utils/validate');
const { logActivity } = require('../utils/activityLogger');

exports.sendInvitation = async (req, res) => {
  try {
    const errors = validate({ email: [required, isEmail], projectId: [required] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const email = req.body.email.toLowerCase().trim();

    const existing = await Invitation.findOne({ email, projectId: req.body.projectId, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'Invitation already pending' });

    const [sender, project] = await Promise.all([
      Profile.findById(req.user.id).select('name email avatar'),
      Project.findById(req.body.projectId).select('name description'),
    ]);

    const customMsg = req.body.message ? ` — ${req.body.message}` : '';
    const desc = `${sender?.name || 'Someone'} has invited you to join "${project?.name || 'a project'}"${customMsg}`;

    const invite = new Invitation({
      ...req.body,
      email,
      invitedBy: req.user.id,
      type: 'teamMember',
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

    await logActivity({
      actorId: req.user.id,
      action: 'invited',
      entityType: 'invitation',
      entityId: invite._id,
      entityName: email,
      projectId: req.body.projectId,
      projectName: project?.name,
      description: `${sender?.name || 'Someone'} invited ${email} to "${project?.name || 'a project'}"`,
    });

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

        if (invite.role === 'lead') {
          await Project.findByIdAndUpdate(invite.projectId, { $addToSet: { leads: profile._id } });

          let membership = await Membership.findById(profile._id);
          if (!membership) {
            membership = new Membership({ _id: profile._id, projects: [], asLead: [invite.projectId] });
            await membership.save();
          } else if (!membership.asLead.includes(invite.projectId)) {
            membership.asLead.push(invite.projectId);
            await membership.save();
          }
        }
      }
    }

    invite.status = 'accepted';
    invite.respondedAt = new Date();
    await invite.save();

    await logActivity({
      actorId: req.user.id,
      action: 'accepted',
      entityType: 'invitation',
      entityId: invite._id,
      entityName: invite.email,
      projectId: invite.projectId,
      projectName: invite.projectName,
      description: `Invitation accepted by ${invite.email} for "${invite.projectName}"`,
    });

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

    await logActivity({
      actorId: req.user.id,
      action: 'declined',
      entityType: 'invitation',
      entityId: invite._id,
      entityName: invite.email,
      projectId: invite.projectId,
      projectName: invite.projectName,
      description: `Invitation declined by ${invite.email} for "${invite.projectName}"`,
    });

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
