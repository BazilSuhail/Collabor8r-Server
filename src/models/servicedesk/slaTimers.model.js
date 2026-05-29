import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    slaPolicyId: { type: Schema.Types.ObjectId, ref: 'SlaPolicy', required: true },
    metric: { type: String, enum: ['firstResponse', 'resolution'] },
    startedAt: Date,
    pausedAt: Date,
    pausedSeconds: { type: Number, default: 0 },
    dueAt: Date,
    status: { type: String, enum: ['running', 'paused', 'met', 'breached'], default: 'running' },
    metAt: Date,
    breachedAt: Date
  },
  { versionKey: false }
);

schema.index({ issueId: 1, metric: 1 }, { unique: true });
schema.index({ projectId: 1, status: 1, dueAt: 1 });
schema.index({ status: 1, dueAt: 1 }); // breach ticker scan (no projectId)

export default mongoose.model('SlaTimer', schema, 'slaTimers');
