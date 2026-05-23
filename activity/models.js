// Activity/audit log schema.
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  actorName: {
    type: String
  },
  actorAvatar: {
    type: String
  },
  action: {
    type: String,
    required: true,
    enum: ['created', 'updated', 'deleted', 'assigned', 'unassigned', 'status_changed', 'comment_added', 'comment_edited', 'comment_deleted', 'uploaded', 'completed', 'activated', 'accepted', 'declined', 'invited', 'logged', 'removed']
  },
  entityType: {
    type: String,
    required: true,
    enum: ['task', 'project', 'comment', 'sprint', 'label', 'board', 'time', 'taskLink', 'invitation', 'filter']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityName: {
    type: String
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  projectName: {
    type: String
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

activityLogSchema.index({ projectId: 1, timestamp: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
activityLogSchema.index({ actorId: 1, timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = { ActivityLog };
