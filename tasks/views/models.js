// Saved task-view schemas: boards, saved filters, project labels.
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
}, { timestamps: true });

const BoardConfig = mongoose.model('BoardConfig', boardConfigSchema);

const savedFilterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  query: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

const SavedFilter = mongoose.model('SavedFilter', savedFilterSchema);

const labelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#3498db'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  }
});

const Label = mongoose.model('Label', labelSchema);

module.exports = { BoardConfig, SavedFilter, Label };
