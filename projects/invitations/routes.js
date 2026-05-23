// Nested invitation routes under /projects/:projectId/invitations
const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../../middleware/authMiddleware');
const { Invitation } = require('./models');
const invitationService = require('./service');
const { validate, required, isEmail } = require('../../lib/validate');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ email: [required, isEmail] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const invite = await invitationService.sendInvitation({
      email: req.body.email,
      userId: req.body.userId,
      projectId: req.params.projectId,
      invitedBy: req.user.id,
      role: req.body.role, // service validates: only 'lead' / 'member' ('joined' alias)
      type: req.body.type, // service derives from role when omitted
      message: req.body.message || '',
    });
    res.status(201).json(invite);
  } catch (err) {
    if (err.code === 'INVALID_ROLE' || err.code === 'INVALID_TYPE') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    if (err.message === 'Project not found' || err.message === 'No user found with this id') {
      return res.status(404).json({ error: err.message });
    }
    console.error('sendInvitation error:', err);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const invites = await Invitation.find({ projectId: req.params.projectId })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

module.exports = router;
