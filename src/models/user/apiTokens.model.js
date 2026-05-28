import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  tokenPrefix: { type: String, maxlength: 8 },
  tokenHash: { type: String, required: true },
  scopes: [String],
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  lastUsedAt: Date,
  lastUsedIp: String,
  expiresAt: Date,
  revokedAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ userId: 1, revokedAt: 1 });

export default mongoose.model('ApiToken', schema, 'apiTokens');
