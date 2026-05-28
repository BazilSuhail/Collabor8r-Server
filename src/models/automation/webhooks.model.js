import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    name: String,
    url: String,
    secretHash: String,
    secret: { type: String, select: false },
    events: [String],
    active: { type: Boolean, default: true },
    lastStatus: { type: Schema.Types.Mixed, default: null },
    lastDeliveredAt: { type: Schema.Types.Mixed, default: null },
    failureCount: { type: Schema.Types.Mixed, default: 0 },
    createdBy: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, active: 1 });
schema.index({ orgId: 1, active: 1 });

export default mongoose.model('Webhook', schema, 'webhooks');
