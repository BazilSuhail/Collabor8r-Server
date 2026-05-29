import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const { Schema } = mongoose;

const max = (n) => ({ validator: (v) => v.length <= n, message: `max ${n} items` });

const ChecklistSchema = new Schema({
  id: { type: String, default: () => randomUUID() },
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  doneAt: Date
}, { _id: false });

// Work item. Optimistic locking uses the version field (optimisticConcurrency).
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  number: { type: Number, required: true },
  key: { type: String, required: true },
  type: { type: Schema.Types.ObjectId, ref: 'IssueType', required: true },
  typeName: String,
  typeIcon: String,
  hierarchy: { type: String, enum: ['epic', 'story', 'task', 'subtask'], required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
  epicId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
  title: { type: String, required: true, trim: true },
  summary: String,
  description: { type: Schema.Types.Mixed, default: null },
  checklist: { type: [ChecklistSchema], default: [], validate: max(50) },
  statusId: { type: Schema.Types.ObjectId, required: true },
  statusName: String,
  statusCategory: { type: String, enum: ['todo', 'inprogress', 'done'], required: true },
  statusColor: String,
  priorityId: { type: Schema.Types.ObjectId, ref: 'Priority', default: null },
  priorityName: String,
  priorityRank: Number,
  priorityIcon: String,
  resolutionId: { type: Schema.Types.ObjectId, ref: 'Resolution', default: null },
  resolvedAt: Date,
  closedAt: Date,
  assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  assignee: { type: Schema.Types.Mixed, default: null },
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reporter: { type: Schema.Types.Mixed, default: null },
  watcherIds: { type: [Schema.Types.ObjectId], default: [], validate: max(200) },
  sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', default: null },
  boardId: { type: Schema.Types.ObjectId, ref: 'Board', default: null },
  releaseIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Release' }], default: [], validate: max(10) },
  componentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Component' }], default: [], validate: max(10) },
  labels: { type: [String], default: [], validate: max(20) },
  storyPoints: { type: Number, default: null },
  estimateSec: { type: Number, default: 0 },
  remainingSec: { type: Number, default: 0 },
  spentSec: { type: Number, default: 0 },
  startDate: Date,
  dueDate: Date,
  rank: { type: String, required: true },
  customFields: { type: Schema.Types.Mixed, default: () => ({}) },
  flags: {
    type: Schema.Types.Mixed,
    default: () => ({ isBlocked: false, blockedReason: null, isOverdue: false, isStale: false, needsAttention: false, hasDescription: false })
  },
  counts: {
    type: Schema.Types.Mixed,
    default: () => ({ comments: 0, attachments: 0, subtasks: 0, subtasksDone: 0, links: 0, history: 0 })
  },
  lastActivityAt: Date,
  lastActivityBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  isPrivate: { type: Boolean, default: false },
  allowedUserIds: { type: [Schema.Types.ObjectId], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: Date
}, { timestamps: true, optimisticConcurrency: true, versionKey: 'version' });

schema.index({ projectId: 1, number: 1 }, { unique: true });
schema.index({ projectId: 1, key: 1 }, { unique: true });
schema.index({ projectId: 1, statusId: 1, rank: 1 });
schema.index({ projectId: 1, sprintId: 1, rank: 1 });
schema.index({ projectId: 1, assigneeId: 1, statusCategory: 1 });
schema.index({ projectId: 1, dueDate: 1, statusCategory: 1 });
schema.index({ projectId: 1, parentId: 1 });
schema.index({ projectId: 1, epicId: 1, rank: 1 });
schema.index({ projectId: 1, labels: 1 });
schema.index({ projectId: 1, lastActivityAt: -1 });
schema.index({ projectId: 1, 'flags.needsAttention': 1 });
// Rank-ordered cursor pagination across the whole project.
schema.index({ projectId: 1, rank: 1, _id: 1 });

export default mongoose.model('Issue', schema, 'issues');
