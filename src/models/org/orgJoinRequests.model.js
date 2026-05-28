import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userAvatar: String,
  userHeadline: String,
  message: String,
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  declineReason: String,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ orgId: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, orgId: 1 });

export default mongoose.model('OrgJoinRequest', schema, 'orgJoinRequests');
