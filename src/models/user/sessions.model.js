import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: String,
  browser: String,
  os: String,
  ip: String,
  location: String,
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: Date,
  revokedAt: Date,
  expireAt: { type: Date, required: true },
  refreshHash: { type: String, required: true },
  prevRefreshHash: String,
  retiredHashes: { type: [String], default: [] }, // previously rotated tokens, for reuse detection
}, { versionKey: false });

schema.index({ userId: 1, revokedAt: 1 });
schema.index({ refreshHash: 1 }, { unique: true });
schema.index({ prevRefreshHash: 1 }, { sparse: true });
schema.index({ retiredHashes: 1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', schema, 'sessions');
