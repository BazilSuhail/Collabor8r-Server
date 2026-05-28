import mongoose from 'mongoose';

const { Schema } = mongoose;

// Issue type definitions per project (epic, story, task, subtask).
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  icon: String,
  color: String,
  hierarchy: { type: String, enum: ['epic', 'story', 'task', 'subtask'], default: 'task' },
  defaultTemplate: {
    type: Schema.Types.Mixed,
    default: () => ({ description: null, checklist: [] })
  },
  requiredFields: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false }
}, { versionKey: false });

schema.index({ projectId: 1, sortOrder: 1 });

export default mongoose.model('IssueType', schema, 'issueTypes');
