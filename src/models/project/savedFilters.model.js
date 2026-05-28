import mongoose from 'mongoose';

const { Schema } = mongoose;

// Saved issue filters, personal or shared with a project or org.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  query: { type: String, default: '' },
  columns: { type: [String], default: [] },
  sort: { type: Schema.Types.Mixed, default: () => ({ field: 'rank', direction: 'asc' }) },
  groupBy: { type: String, enum: ['none', 'status', 'assignee', 'epic', 'priority', 'sprint'], default: 'none' },
  sharedWith: {
    scope: { type: String, enum: ['private', 'project', 'org'], default: 'private' },
    userIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      validate: { validator: (v) => v.length <= 100, message: 'max 100 items' }
    }
  },
  isPinned: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
  lastUsedAt: Date
}, { timestamps: true, versionKey: false });

schema.index({ ownerId: 1, projectId: 1, isPinned: 1 });
schema.index({ projectId: 1, 'sharedWith.scope': 1 });

export default mongoose.model('SavedFilter', schema, 'savedFilters');
