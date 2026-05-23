// Project domain schemas: project itself + user↔project membership.
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
    type: String,
    default: '/themes/1.jpg'
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
      order: Number,
    }
  ],
  workflowRules: {
    enabled: { type: Boolean, default: false },
    transitions: [
      {
        from: { type: String, required: true },
        to: { type: String, required: true },
      }
    ],
  },
  wipLimits: {
    enabled: { type: Boolean, default: false },
    limits: [
      {
        status: { type: String, required: true },
        max: { type: Number, required: true, min: 1 },
      }
    ],
  },
  team: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile'
    }
  ],
  budget: {
    totalHours: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    totalBudget: { type: Number, default: 0 },
  },
}, { timestamps: true });

// Role list filters (GET /projects?role=…) — array fields index multikey entries per id.
projectSchema.index({ createdBy: 1 });
projectSchema.index({ leads: 1 });
projectSchema.index({ team: 1 });
// Single-array compound. NOTE: never index [team] and [leads] together —
// MongoDB rejects compound multikey indexes over two parallel arrays (error 171).
projectSchema.index({ leads: 1, createdBy: 1 });

const Project = mongoose.model('Project', projectSchema);

// Exclusive per-user role buckets — a project ID lives in EXACTLY ONE array:
//   admin  → projects created by this user
//   asLead → accepted lead role, not creator
//   joined → team member, not lead, not creator
// Writers enforce exclusivity (see projects/service.js); queries are a pure _id $in.
const membershipSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  admin: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
  ],
  asLead: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
  ],
  joined: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
  ],
});

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = { Project, Membership };
