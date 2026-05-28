import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    approverId: Schema.Types.Mixed,
    approverName: Schema.Types.Mixed,
    approverAvatar: Schema.Types.Mixed,
    decision: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    comment: String,
    decidedAt: Date,
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date
  },
  { versionKey: false }
);

schema.index({ issueId: 1, decision: 1 });
schema.index({ approverId: 1, decision: 1 });

export default mongoose.model('Approval', schema, 'approvals');
