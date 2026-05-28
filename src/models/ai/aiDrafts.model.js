import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    kind: {
      type: String,
      enum: [
        'project', 'issues', 'grooming', 'triage', 'summary', 'comment', 'search',
        'standup', 'releaseNotes', 'wikiPage', 'riskSuggestions'
      ],
      required: true
    },
    promptHash: String,
    contextIds: { type: [Schema.Types.ObjectId], default: [] },
    status: {
      type: String,
      enum: ['pending', 'ready', 'accepting', 'accepted', 'discarded', 'failed'],
      default: 'pending'
    },
    createdIssueKeys: { type: [String], default: [] },
    output: Schema.Types.Mixed,
    error: String,
    expireAt: Date
  },
  { timestamps: true, versionKey: false }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiDraft', schema, 'aiDrafts');
