const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['created', 'updated', 'deleted', 'assigned', 'unassigned', 'status_changed', 'comment_added', 'comment_edited', 'comment_deleted', 'uploaded']
  },
  entityType: {
    type: String,
    required: true,
    enum: ['task', 'project', 'comment', 'sprint', 'label']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  changes: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }
  ],
  description: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
