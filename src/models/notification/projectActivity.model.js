import mongoose from 'mongoose';
import { env } from '../../config/env.js';

const { Schema } = mongoose;

const schema = new Schema(
  {
    at: { type: Date, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    kind: {
      type: String,
      enum: [
        'issueCreated', 'issueUpdated', 'statusChanged', 'commentAdded', 'sprintStarted',
        'sprintClosed', 'memberAdded', 'memberRemoved', 'releaseShipped', 'pageUpdated'
      ],
      required: true
    },
    actorId: Schema.Types.Mixed,
    actorName: Schema.Types.Mixed,
    actorAvatar: Schema.Types.Mixed,
    itemId: Schema.Types.Mixed,
    itemKey: Schema.Types.Mixed,
    itemTitle: Schema.Types.Mixed,
    summary: String,
    aiCreated: { type: Boolean, default: false }
  },
  {
    timeseries: { timeField: 'at', metaField: 'projectId', granularity: 'hours' },
    expireAfterSeconds: env.activityRetentionDays * 86400,
    autoCreate: false, // created explicitly by ensureTimeSeries()
    versionKey: false
  }
);

export default mongoose.model('ProjectActivity', schema, 'projectActivity');
