import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    environment: String,
    buildVersion: String,
    status: { type: String, enum: ['planned', 'inProgress', 'completed'], default: 'planned' },
    counts: { type: Schema.Types.Mixed, default: {} },
    startedAt: Date,
    completedAt: Date,
    createdBy: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

schema.index({ projectId: 1, status: 1, createdAt: -1 });

export default mongoose.model('TestRun', schema, 'testRuns');
