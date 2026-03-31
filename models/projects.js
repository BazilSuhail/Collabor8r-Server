const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  theme: {
    type: Number,
    min: 1,
    max: 7,
    default: 1
  },
  about: {
    type: String,
    default: ''
  },
  objectives: [
    {
      type: String,
    }
  ],
  tags: [
    {
      type: String,
      trim: true,
      lowercase: true,
    }
  ],
  category: {
    type: String,
    enum: ['software', 'marketing', 'design', 'research', 'business', 'other'],
    default: 'other'
  },
  links: [
    {
      title: String,
      url: String,
      kind: {
        type: String,
        enum: ['docs', 'repo', 'wiki', 'figma', 'other'],
        default: 'other'
      }
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
  visibility: {
    type: String,
    enum: ['private', 'team'],
    default: 'private'
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'onHold', 'completed', 'archived'],
    default: 'planning'
  },
  startDate: {
    type: Date
  },
  targetDate: {
    type: Date
  },
  version: {
    type: String,
    default: 'v1.0'
  },
  methodology: {
    type: String,
    enum: ['sprint', 'kanban'],
    default: 'sprint'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  leads: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile'
    }
  ],
  statuses: [
    {
      name: String,
      order: Number
    }
  ],
  team: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile'
    }
  ],
  tasks: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
