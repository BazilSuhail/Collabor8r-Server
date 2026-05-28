import mongoose from 'mongoose';

const { Schema } = mongoose;

const fieldSchema = new Schema(
  {
    id: String,
    label: String,
    type: String,
    required: { type: Boolean, default: false },
    options: [String],
    helpText: String
  },
  { _id: false }
);

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    description: String,
    fields: {
      type: [fieldSchema],
      validate: { validator: (v) => v.length <= 40, message: 'fields allows at most 40 items' }
    },
    publicToken: String,
    isPublic: { type: Boolean, default: false },
    issueTypeId: { type: Schema.Types.ObjectId, ref: 'IssueType' },
    defaultPriorityId: { type: Schema.Types.ObjectId, ref: 'Priority' },
    submissionCount: { type: Number, default: 0 },
    createdBy: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ publicToken: 1 }, { unique: true, sparse: true });
schema.index({ projectId: 1 });

export default mongoose.model('Form', schema, 'forms');
