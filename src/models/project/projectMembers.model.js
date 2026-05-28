import mongoose from 'mongoose';

const { Schema } = mongoose;

// Membership of a user in a project, with denormalized sidebar snapshots.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'lead', 'developer', 'reporter', 'viewer', 'guest'], required: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'ProjectRole', default: null },
  isLead: { type: Boolean, default: false },
  status: { type: String, enum: ['invited', 'requested', 'active', 'suspended', 'removed'], default: 'active' },
  relation: { type: String, enum: ['created', 'invited', 'joined', 'requested', 'orgDefault'], default: 'joined' },
  notifyLevel: { type: String, enum: ['all', 'mentions', 'none'], default: 'all' },
  isFavorite: { type: Boolean, default: false },
  lastViewedAt: Date,
  lastReadAt: Date,
  userName: String,
  userAvatar: String,
  userTitle: String,
  projectName: String,
  projectKey: String,
  projectIcon: String,
  projectHeadline: String,
  orgName: String,
  joinedAt: Date,
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false });

schema.index({ projectId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, projectKey: 1 });
schema.index({ userId: 1, orgId: 1, status: 1 });
schema.index({ projectId: 1, role: 1, status: 1 });
schema.index({ userId: 1, isFavorite: 1 });

export default mongoose.model('ProjectMember', schema, 'projectMembers');
