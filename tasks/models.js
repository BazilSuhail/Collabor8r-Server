// Task domain schemas: tasks, per-user assignment index, task↔task links.
const mongoose = require('mongoose');

const DEFAULT_STATUSES = ['Not Started', 'In Progress', 'Paused', 'Completed'];
const ISSUE_TYPES = ['epic', 'story', 'task', 'sub-task', 'bug'];

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
    default: 'Not Started'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  issueType: {
    type: String,
    enum: ISSUE_TYPES,
    default: 'task'
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
  epicId: {
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
  acceptanceCriteria: [
    {
      type: String,
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
}, { timestamps: true });

taskSchema.index({ projectId: 1 });
taskSchema.index({ sprintId: 1 });
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, issueType: 1 });
taskSchema.index({ projectId: 1, assignedTo: 1 });
taskSchema.index({ epicId: 1 });
taskSchema.index({ parentId: 1 });

taskSchema.statics.DEFAULT_STATUSES = DEFAULT_STATUSES;
taskSchema.statics.ISSUE_TYPES = ISSUE_TYPES;

const Task = mongoose.model('Task', taskSchema);

const assignedTaskSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  assignTasks: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
  ],
});

const AssignedTask = mongoose.model('AssignedTask', assignedTaskSchema);

const taskLinkSchema = new mongoose.Schema({
  sourceTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  targetTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  linkType: {
    type: String,
    enum: ['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on'],
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  }
}, { timestamps: true });

const TaskLink = mongoose.model('TaskLink', taskLinkSchema);

module.exports = { Task, AssignedTask, TaskLink };
