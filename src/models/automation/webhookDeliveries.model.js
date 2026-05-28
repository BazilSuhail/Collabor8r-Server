import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    event: String,
    payloadId: Schema.Types.ObjectId,
    status: String,
    requestBody: String,
    responseCode: Number,
    attempts: { type: Number, default: 0 },
    nextAttemptAt: Date,
    durationMs: Number,
    error: String,
    createdAt: { type: Date, default: Date.now },
    expireAt: Date
  },
  { versionKey: false }
);

schema.index({ webhookId: 1, createdAt: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('WebhookDelivery', schema, 'webhookDeliveries');
