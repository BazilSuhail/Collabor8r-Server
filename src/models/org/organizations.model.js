import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  logoUrl: String,
  coverUrl: String,
  description: String,
  website: String,
  industry: String,
  size: { type: String, enum: ['1-10', '11-50', '51-200', '201+'] },
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  billingEmail: String,
  seatLimit: Number,
  seatsUsed: { type: Number, default: 0 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinCode: String,
  joinCodeExpiresAt: Date,
  joinApproval: { type: String, enum: ['none', 'admin'], default: 'none' },
  verifiedDomains: [String],
  projectCreation: { type: String, enum: ['anyMember', 'adminsOnly'], default: 'anyMember' },
  defaultProjectVisibility: { type: String, enum: ['private', 'request', 'open'], default: 'private' },
  sso: mongoose.Schema.Types.Mixed,
  require2fa: { type: Boolean, default: false },
  ipAllowlist: [String],
  aiEnabled: { type: Boolean, default: false },
  aiKeepPromptHashes: { type: Boolean, default: false },
  counts: mongoose.Schema.Types.Mixed,
  archivedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ slug: 1 }, { unique: true });
schema.index({ joinCode: 1 }, { unique: true, sparse: true });
schema.index({ ownerId: 1 });

export default mongoose.model('Organization', schema, 'organizations');
