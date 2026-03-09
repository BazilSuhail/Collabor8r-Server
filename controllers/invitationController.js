// POST /invitations → send invite { email, projectId?, organizationId?, role? }
// GET /invitations/pending → pending invites for current user
// POST /invitations/:token/accept → accept invite
// POST /invitations/:token/decline → decline invite
// GET /invitations/project/:projectId → invites for a project

const Invitation = require('../models/invitation');
const Profile = require('../models/profile');
const Project = require('../models/projects');
const { projectService } = require('../services');
const { validate, required, isString, isEmail } = require('../utils/validate');

exports.sendInvitation = async (req, res) => {
  try {
    const errors = validate({ email: [required, isEmail] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const existing = await Invitation.findOne({
      email: req.body.email,
      projectId: req.body.projectId,
      status: 'pending',
    });
    if (existing) return res.status(409).json({ error: 'Invitation already pending' });

    const invite = new Invitation({ ...req.body, invitedBy: req.user.id });
    await invite.save();
    res.status(201).json(invite);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

exports.getPendingInvitations = async (req, res) => {
  try {
    const profile = await Profile.findById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const invites = await Invitation.find({ email: profile.email, status: 'pending' })
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
      }
    }

    invite.status = 'accepted';
    await invite.save();
    res.json({ message: 'Invitation accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to accept invitation' });
  }
};

exports.declineInvitation = async (req, res) => {
  try {
    const invite = await Invitation.findOneAndUpdate(
      { token: req.params.token, status: 'pending' },
      { status: 'declined' },
      { new: true }
    );
    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    res.json({ message: 'Invitation declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
};

exports.getProjectInvitations = async (req, res) => {
  try {
    const invites = await Invitation.find({ projectId: req.params.projectId })
      .populate('invitedBy', 'name email');
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
};
