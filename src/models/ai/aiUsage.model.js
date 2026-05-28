import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    _id: String,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    date: { type: Date, required: true },
    calls: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costMicros: { type: Number, default: 0 },
    byKind: { type: Schema.Types.Mixed, default: {} }
  },
  { versionKey: false }
);

schema.index({ orgId: 1, date: 1 });
schema.index({ userId: 1, date: 1 });

export default mongoose.model('AiUsage', schema, 'aiUsage');
