import mongoose from 'mongoose';

const { Schema } = mongoose;

const triggerSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['itemCreated', 'statusChanged', 'fieldChanged', 'commentAdded', 'prMerged', 'scheduled', 'dueSoon'],
      required: true
    },
    config: Schema.Types.Mixed
  },
  { _id: false }
);

const conditionSchema = new Schema(
  { field: String, op: String, value: Schema.Types.Mixed },
  { _id: false }
);

const actionSchema = new Schema(
  { type: String, config: Schema.Types.Mixed },
  { _id: false }
);

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    description: String,
    enabled: { type: Boolean, default: false },
    trigger: { type: triggerSchema, required: true },
    conditions: {
      type: [conditionSchema],
      validate: { validator: (v) => v.length <= 10, message: 'conditions allows at most 10 items' }
    },
    actions: {
      type: [actionSchema],
      validate: { validator: (v) => v.length <= 10, message: 'actions allows at most 10 items' }
    },
    lastRunAt: Date,
    lastRunStatus: String,
    runCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    createdBy: Schema.Types.Mixed,
    createdByName: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, enabled: 1 });
schema.index({ 'trigger.type': 1, enabled: 1 });

export default mongoose.model('AutomationRule', schema, 'automationRules');
