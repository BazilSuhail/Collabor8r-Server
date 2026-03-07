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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Sprint', sprintSchema);
