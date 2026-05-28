import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    provider: {
      type: String,
      enum: ['github', 'gitlab', 'bitbucket', 'slack', 'teams', 'google', 'jira_import'],
      required: true
    },
    displayName: String,
    config: { type: Schema.Types.Mixed, select: false },
    status: { type: String, enum: ['connected', 'error', 'disconnected'], default: 'disconnected' },
    lastSyncAt: Date,
    lastError: String,
    connectedBy: Schema.Types.Mixed,
    connectedByName: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, provider: 1 });
schema.index({ orgId: 1, provider: 1 });

export default mongoose.model('Integration', schema, 'integrations');
