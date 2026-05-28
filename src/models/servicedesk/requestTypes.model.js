import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    description: String,
    icon: String,
    formId: { type: Schema.Types.ObjectId, ref: 'Form', default: null },
    issueTypeId: { type: Schema.Types.ObjectId, ref: 'IssueType', required: true },
    slaPolicyId: { type: Schema.Types.ObjectId, ref: 'SlaPolicy', default: null },
    approvalRequired: { type: Boolean, default: false },
    approverIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    defaultPriorityId: { type: Schema.Types.ObjectId, ref: 'Priority' },
    defaultAssigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { versionKey: false }
);

schema.index({ projectId: 1, sortOrder: 1 });

export default mongoose.model('RequestType', schema, 'requestTypes');
