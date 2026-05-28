import mongoose from 'mongoose';

const { Schema } = mongoose;

// Pending project invitation; only the token hash is stored.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  email: { type: String, lowercase: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  role: { type: String, enum: ['admin', 'lead', 'developer', 'reporter', 'viewer', 'guest'], required: true },
  message: String,
  tokenHash: { type: String, required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  invitedByName: String,
  status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
  expiresAt: Date,
  acceptedAt: Date,
  revokedAt: Date
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ projectId: 1, status: 1 });
schema.index({ email: 1, status: 1 });

export default mongoose.model('ProjectInvite', schema, 'projectInvites');
