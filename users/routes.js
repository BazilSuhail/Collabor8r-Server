// User/profile routes.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Profile } = require('../auth/models');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const profile = await Profile.findById(req.user.id).select('-password');
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', authMiddleware, async (req, res) => {
  try {
    const {
      name, gender, phone, email, dob, avatar,
      headline, bio, location, jobTitle,
      skills, languages, socialLinks, availability, statusEmoji, pronouns,
    } = req.body;

    if (availability !== undefined && !['available', 'busy', 'away'].includes(availability)) {
      return res.status(400).json({ error: 'availability must be "available", "busy", or "away"' });
    }
    if (skills !== undefined && !Array.isArray(skills)) {
      return res.status(400).json({ error: 'skills must be an array of strings' });
    }
    if (languages !== undefined && !Array.isArray(languages)) {
      return res.status(400).json({ error: 'languages must be an array of strings' });
    }
    if (socialLinks !== undefined && (typeof socialLinks !== 'object' || socialLinks === null || Array.isArray(socialLinks))) {
      return res.status(400).json({ error: 'socialLinks must be an object' });
    }

    const fields = {
      name, gender, phone, email, dob, avatar,
      headline, bio, location, jobTitle,
      skills, languages, availability, statusEmoji, pronouns,
    };
    if (socialLinks !== undefined) fields.socialLinks = socialLinks;

    const updated = await Profile.findByIdAndUpdate(
      req.user.id,
      fields,
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Profile not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
