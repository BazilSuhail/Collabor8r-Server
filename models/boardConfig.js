const mongoose = require('mongoose');

const boardConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Board'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  columns: [
    {
      name: String,
      statuses: [String],
      wipLimit: Number
    }
  ],
  swimlane: {
    type: String,
    enum: ['assignee', 'epic', 'priority', null],
    default: null
  },
  filters: {
    type: mongoose.Schema.Types.Mixed
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile'
  }
});

module.exports = mongoose.model('BoardConfig', boardConfigSchema);
