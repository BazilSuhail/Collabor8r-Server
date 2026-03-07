const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  role: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(24).toString('hex')
  },
  expiresAt: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      return date;
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Invitation', invitationSchema);
