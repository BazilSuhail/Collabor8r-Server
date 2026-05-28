import mongoose from 'mongoose';

const { Schema } = mongoose;

// Time-boxed sprint on a board, with cached counts and points.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
  name: { type: String, required: true, trim: true },
  goal: String,
  state: { type: String, enum: ['planned', 'active', 'closed'], default: 'planned' },
  startDate: Date,
  endDate: Date,
  capacityHours: { type: Number, default: null },
  counts: { type: Schema.Types.Mixed, default: () => ({ items: 0, done: 0, inProgress: 0, blocked: 0 }) },
  points: { type: Schema.Types.Mixed, default: () => ({ committed: 0, added: 0, removed: 0, done: 0 }) },
  velocity: { type: Number, default: null },
  retroNote: String,
  startedAt: Date,
  closedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, state: 1, startDate: -1 });
schema.index({ boardId: 1, state: 1 });

export default mongoose.model('Sprint', schema, 'sprints');
