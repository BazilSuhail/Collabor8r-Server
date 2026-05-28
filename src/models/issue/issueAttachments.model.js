import mongoose from 'mongoose';

const { Schema } = mongoose;

// File metadata for an issue; bytes live in external storage.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  commentId: { type: Schema.Types.ObjectId, ref: 'IssueComment', default: null },
  name: { type: String, required: true, trim: true },
  description: String,
  mime: String,
  size: { type: Number, required: true },
  storageKey: { type: String, required: true },
  thumbnailKey: String,
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  version: { type: Number, default: 1 },
  previousVersionId: { type: Schema.Types.ObjectId, ref: 'IssueAttachment', default: null },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploaderName: String,
  uploaderAvatar: String,
  deletedAt: Date
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ issueId: 1, createdAt: -1 });
schema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model('IssueAttachment', schema, 'issueAttachments');
