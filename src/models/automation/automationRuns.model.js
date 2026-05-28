import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'AutomationRule', required: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
    status: { type: String, enum: ['success', 'failed', 'skipped'] },
    triggeredBy: String,
    error: String,
    durationMs: Number,
    log: { type: [Schema.Types.Mixed], default: [] },
    at: { type: Date, default: Date.now },
    expireAt: Date
  },
  { versionKey: false }
);

schema.index({ ruleId: 1, at: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AutomationRun', schema, 'automationRuns');
