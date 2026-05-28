import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  actorId: mongoose.Schema.Types.Mixed,
  actorName: mongoose.Schema.Types.Mixed,
  actorIp: mongoose.Schema.Types.Mixed,
  action: { type: String, required: true },
  targetType: String,
  targetId: mongoose.Schema.Types.ObjectId,
  targetName: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  at: { type: Date, default: Date.now },
  expireAt: Date,
}, { versionKey: false });

schema.index({ orgId: 1, at: -1 });
schema.index({ projectId: 1, at: -1 });
schema.index({ actorId: 1, at: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuditLog', schema, 'auditLog');
