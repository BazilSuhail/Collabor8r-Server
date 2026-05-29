import mongoose from 'mongoose';

const { Schema } = mongoose;

// Project header, feature toggles and counters.
const schema = new Schema({
  scope: { type: String, enum: ['personal', 'org'], required: true },
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  headline: String,
  iconUrl: String,
  icon: String,
  color: String,
  coverUrl: String,
  themeKey: { type: String, trim: true, default: null },
  categoryId: { type: Schema.Types.ObjectId, default: null },
  leadId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  leadName: String,
  leadAvatar: String,
  visibility: { type: String, enum: ['private', 'request', 'open'], default: 'private' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  archivedAt: Date,
  template: { type: String, enum: ['scrum', 'kanban', 'bug', 'service', 'blank'], default: 'blank' },
  startDate: Date,
  targetDate: Date,
  health: { type: String, enum: ['on_track', 'at_risk', 'off_track', 'not_set'], default: 'not_set' },
  healthNote: String,
  healthUpdatedAt: Date,
  healthUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  defaultView: { type: String, enum: ['board', 'backlog', 'list', 'timeline'], default: 'board' },
  modules: { type: Schema.Types.Mixed, default: {} },
  counts: { type: Schema.Types.Mixed, default: {} },
  defaults: { type: Schema.Types.Mixed, default: {} },
  seq: { type: Number, default: 0 },
  lastActivityAt: Date
}, { timestamps: true, versionKey: false });

// Replaces the old sparse unique { scope, orgId, key } (named scope_1_orgId_1_key_1), which wrongly made
// every personal project (orgId null) share one key space. After these build, drop the old one manually:
//   db.projects.dropIndex('scope_1_orgId_1_key_1')   (syncIndexes is additive and never drops it)
schema.index({ orgId: 1, key: 1 }, { unique: true, partialFilterExpression: { scope: 'org' }, name: 'uniq_org_key' });
schema.index({ ownerId: 1, key: 1 }, { unique: true, partialFilterExpression: { scope: 'personal' }, name: 'uniq_personal_key' });
schema.index({ ownerId: 1, scope: 1, status: 1 });
schema.index({ orgId: 1, status: 1, name: 1 });
schema.index({ orgId: 1, health: 1 });

export default mongoose.model('Project', schema, 'projects');
