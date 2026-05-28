import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    title: String,
    description: String,
    metric: { type: String, enum: ['itemCount', 'points', 'timeSpent', 'custom'] },
    target: Number,
    current: { type: Number, default: 0 },
    unit: String,
    ownerId: Schema.Types.Mixed,
    ownerName: Schema.Types.Mixed,
    linkedItemIds: {
      type: [Schema.Types.ObjectId],
      validate: { validator: (v) => v.length <= 100, message: 'linkedItemIds allows at most 100 items' }
    },
    startDate: Date,
    dueDate: Date,
    status: { type: String, enum: ['on_track', 'at_risk', 'off_track', 'done'] }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, status: 1, dueDate: 1 });

export default mongoose.model('Goal', schema, 'goals');
