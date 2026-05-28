import mongoose from 'mongoose';

const { Schema } = mongoose;

// One row per changed field on an issue.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  field: { type: String, required: true },
  fromValue: String,
  toValue: String,
  fromId: { type: Schema.Types.Mixed, default: null },
  toId: { type: Schema.Types.Mixed, default: null },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: String,
  actorAvatar: String,
  at: { type: Date, default: Date.now },
  secondsInPreviousStatus: { type: Number, default: null }
}, { versionKey: false });

schema.index({ issueId: 1, at: 1 });
schema.index({ projectId: 1, field: 1, at: -1 });

export default mongoose.model('IssueHistory', schema, 'issueHistory');
