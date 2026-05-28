import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    description: String,
    targets: Schema.Types.Mixed,
    businessHours: Schema.Types.Mixed,
    pauseStatusIds: { type: [String], default: [] },
    escalateToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, isDefault: 1 });

export default mongoose.model('SlaPolicy', schema, 'slaPolicies');
