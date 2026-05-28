import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  email: { type: String, lowercase: true, trim: true },
  role: { type: String, enum: ['owner', 'admin', 'member', 'guest', 'viewer'], required: true },
  projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  tokenHash: { type: String, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invitedByName: String,
  message: String,
  status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
  revokedAt: Date,
}, { versionKey: false });

schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ orgId: 1, status: 1, email: 1 });
schema.index({ expiresAt: 1 });

export default mongoose.model('OrgInvite', schema, 'orgInvites');
