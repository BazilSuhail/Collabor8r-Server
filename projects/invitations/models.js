// Invitation schema (token-based project invites).
const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  senderName: {
    type: String
  },
  senderEmail: {
    type: String
  },
  senderAvatar: {
    type: String
  },
  projectName: {
    type: String
  },
  projectDescription: {
    type: String
  },
  type: {
    type: String,
    enum: ['teamMember', 'projectLead'],
  },
  description: {
    type: String
  },
  role: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  respondedAt: {
    type: Date
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

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = { Invitation };
