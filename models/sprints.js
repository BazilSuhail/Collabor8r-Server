const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  goal: {
    type: String
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  tasks: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }
  ],
}, {
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false }
});

sprintSchema.virtual('status').get(function () {
  if (this.isCompleted) return 'completed';
  if (this.isActive) return 'active';
  return 'planned';
});

sprintSchema.virtual('taskCount').get(function () {
  return (this.tasks || []).length;
});

module.exports = mongoose.model('Sprint', sprintSchema);
