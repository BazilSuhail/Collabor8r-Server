import mongoose from 'mongoose';

const { Schema } = mongoose;

const stepSchema = new Schema({ action: String, expected: String }, { _id: false });

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    folderId: { type: Schema.Types.ObjectId, default: null }, // folders are optional
    key: String,
    title: String,
    summary: String,
    steps: {
      type: [stepSchema],
      validate: { validator: (v) => v.length <= 50, message: 'steps allows at most 50 items' }
    },
    precondition: String,
    priority: String,
    tags: [String],
    status: { type: String, enum: ['draft', 'ready', 'deprecated'], default: 'draft' },
    automationStatus: { type: String, enum: ['manual', 'automated', 'planned'], default: 'manual' },
    linkedItemIds: [Schema.Types.ObjectId],
    lastResult: { type: String, enum: ['passed', 'failed', 'blocked', 'skipped', 'notRun'], default: 'notRun' },
    lastRunAt: Date,
    ownerId: Schema.Types.Mixed,
    ownerName: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, folderId: 1, key: 1 });
schema.index({ projectId: 1, lastResult: 1 });

export default mongoose.model('TestCase', schema, 'testCases');
