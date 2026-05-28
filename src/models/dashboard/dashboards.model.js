import mongoose from 'mongoose';

const { Schema } = mongoose;

const WIDGET_TYPES = [
  'stat', 'barChart', 'lineChart', 'donut', 'burndown', 'velocity',
  'cumulativeFlow', 'cycleTime', 'workload', 'activityFeed', 'list', 'text'
];

const widgetSchema = new Schema(
  {
    id: String,
    type: { type: String, enum: WIDGET_TYPES },
    title: String,
    subtitle: String,
    config: Schema.Types.Mixed,
    x: Number,
    y: Number,
    w: Number,
    h: Number,
    refreshSeconds: Number
  },
  { _id: false }
);

const schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    name: String,
    description: String,
    layout: Schema.Types.Mixed,
    widgets: {
      type: [widgetSchema],
      validate: { validator: (v) => v.length <= 24, message: 'widgets allows at most 24 items' }
    },
    sharedWith: Schema.Types.Mixed,
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ ownerId: 1, projectId: 1 });
schema.index({ projectId: 1, isDefault: 1 });

export default mongoose.model('Dashboard', schema, 'dashboards');
