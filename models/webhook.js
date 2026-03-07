const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  name: {
    type: String
  },
  url: {
    type: String,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  events: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  secret: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Webhook', webhookSchema);
