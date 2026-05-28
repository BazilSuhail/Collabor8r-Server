import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member', 'guest', 'viewer'], required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  title: String,
  groupIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrgGroup' }],
    validate: { validator: (v) => v.length <= 20, message: 'max 20 groups' },
  },
  userName: String,
  userAvatar: String,
  userHeadline: String,
  joinedAt: { type: Date, default: Date.now },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastActiveAt: Date,
}, { versionKey: false });

schema.index({ orgId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, status: 1 });
schema.index({ orgId: 1, role: 1 });

export default mongoose.model('OrgMember', schema, 'orgMembers');
