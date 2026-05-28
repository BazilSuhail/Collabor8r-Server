import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    kind: {
      type: String,
      enum: [
        'mention', 'assigned', 'commented', 'statusChanged', 'dueSoon', 'overdue', 'approval',
        'slaBreach', 'invite', 'joinDecision', 'achievement', 'digest'
      ],
      required: true
    },
    title: String,
    body: String,
    actorId: Schema.Types.Mixed,
    actorName: Schema.Types.Mixed,
    actorAvatar: Schema.Types.Mixed,
    target: Schema.Types.Mixed,
    readAt: Date,
    archivedAt: Date,
    expireAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

schema.index({ userId: 1, readAt: 1, createdAt: -1 });
schema.index({ userId: 1, projectId: 1, createdAt: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Notification', schema, 'notifications');
