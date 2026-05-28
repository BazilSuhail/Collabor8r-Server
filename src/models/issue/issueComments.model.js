import mongoose from 'mongoose';

const { Schema } = mongoose;

const max = (n) => ({ validator: (v) => v.length <= n, message: `max ${n} items` });

const ReactionSchema = new Schema({
  emoji: { type: String, required: true },
  userIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] }
}, { _id: false });

// Comment on an issue; replies reference parentId.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'IssueComment', default: null },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  authorName: String,
  authorAvatar: String,
  body: { type: Schema.Types.Mixed, default: null },
  mentions: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [], validate: max(20) },
  reactions: { type: [ReactionSchema], default: [], validate: max(20) },
  source: { type: String, enum: ['user', 'ai'], default: 'user' },
  internal: { type: Boolean, default: false },
  editedAt: Date,
  deletedAt: Date
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ issueId: 1, createdAt: 1 });
schema.index({ projectId: 1, createdAt: -1 });
schema.index({ authorId: 1, createdAt: -1 });

export default mongoose.model('IssueComment', schema, 'issueComments');
