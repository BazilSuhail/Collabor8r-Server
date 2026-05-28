import mongoose from 'mongoose';

const { Schema } = mongoose;

// Link between two issues in the same project.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  fromIssueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  toIssueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  fromKey: String,
  toKey: String,
  fromTitle: String,
  toTitle: String,
  type: {
    type: String,
    enum: ['blocks', 'isBlockedBy', 'relates', 'duplicates', 'isDuplicatedBy', 'clones', 'custom'],
    required: true
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ fromIssueId: 1, type: 1 });
schema.index({ toIssueId: 1, type: 1 });

export default mongoose.model('IssueLink', schema, 'issueLinks');
