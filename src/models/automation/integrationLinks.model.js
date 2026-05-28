import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: 'Integration', required: true },
    provider: String,
    externalType: { type: String, enum: ['commit', 'pullRequest', 'build', 'deploy', 'message'] },
    externalId: String,
    title: String,
    url: String,
    status: { type: String, enum: ['open', 'merged', 'closed', 'passed', 'failed', 'success'] },
    author: String,
    at: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

schema.index({ issueId: 1, at: -1 });
schema.index({ provider: 1, externalId: 1 }, { unique: true });

export default mongoose.model('IntegrationLink', schema, 'integrationLinks');
