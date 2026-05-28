import mongoose from 'mongoose';

const { Schema } = mongoose;

// Request from a user to join a project, decided by a project admin.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userAvatar: String,
  userTitle: String,
  message: String,
  requestedRole: { type: String, enum: ['developer', 'reporter', 'viewer'], default: 'viewer' },
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: Date,
  declineReason: String
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ projectId: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, projectId: 1 });

export default mongoose.model('ProjectJoinRequest', schema, 'projectJoinRequests');
