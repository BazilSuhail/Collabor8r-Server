const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Paused','Completed'],
    default: 'Not Started'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile'
  },
  sprintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint'
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  estimateHours: {
    type: Number,
    default: 0
  },
  loggedHours: {
    type: Number,
    default: 0
  },
  remainingHours: {
    type: Number,
    default: 0
  },
  resolution: {
    type: String,
    enum: ['Done', "Won't Fix", 'Duplicate', 'Cannot Reproduce', null],
    default: null
  },
  labels: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Label'
    }
  ],
  attachments: [
    {
      name: String,
      path: String,
      size: Number,
      mimetype: String,
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  comments: [
    {
      type: String,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
