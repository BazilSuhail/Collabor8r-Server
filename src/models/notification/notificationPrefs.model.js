import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['inApp', 'email', 'push', 'slack'], required: true },
    kind: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    quietHours: Schema.Types.Mixed
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false }
);

schema.index({ userId: 1, channel: 1, kind: 1 }, { unique: true });

export default mongoose.model('NotificationPref', schema, 'notificationPrefs');
