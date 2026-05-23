// Global invitation token routes: pending list + accept/decline by token.
// Project-scoped send/list lives nested at /projects/:projectId/invitations.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const { Invitation } = require('./models');
const { Profile } = require('../../auth/models');
const invitationService = require('./service');

router.get('/pending', authMiddleware, async (req, res) => {
  try {
    const profile = await Profile.findById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const invites = await Invitation.find({ email: profile.email.toLowerCase(), status: 'pending' })
      .populate('invitedBy', 'name email')
      .populate('projectId', 'name');
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.post('/:token/accept', authMiddleware, async (req, res) => {
  try {
    const invite = await invitationService.acceptByToken(req.params.token, req.user.id);
    res.json({ message: 'Invitation accepted', invitation: invite });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'EXPIRED') return res.status(400).json({ error: err.message });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to accept invitation' });
  }
});

router.post('/:token/decline', authMiddleware, async (req, res) => {
  try {
    const invite = await invitationService.declineByToken(req.params.token, req.user.id);
    res.json({ message: 'Invitation declined', invitation: invite });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

module.exports = router;
