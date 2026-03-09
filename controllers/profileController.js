const Profile = require('../models/profile');
const { getNotifications } = require('../services/notificationService');

exports.getProfile = async (req, res) => {
  try {
    const profile = await Profile.findById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, gender, phone, email, dob, avatar } = req.body;
    const updated = await Profile.findByIdAndUpdate(req.user.id, { name, gender, phone, email, dob, avatar }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Profile not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await getNotifications(req.user.id);
    res.status(200).json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
