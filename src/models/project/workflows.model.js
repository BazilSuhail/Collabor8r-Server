import mongoose from 'mongoose';

const { Schema } = mongoose;

const max = (n) => ({ validator: (v) => v.length <= n, message: `max ${n} items` });
const newId = () => new mongoose.Types.ObjectId();

const StatusSchema = new Schema({
  id: { type: Schema.Types.ObjectId, default: newId },
  name: { type: String, required: true },
  category: { type: String, enum: ['todo', 'inprogress', 'done'], required: true },
  color: String,
  icon: String,
  description: String,
  sortOrder: { type: Number, default: 0 }
}, { _id: false });

const TransitionSchema = new Schema({
  id: { type: Schema.Types.ObjectId, default: newId },
  name: { type: String, required: true },
  from: { type: [Schema.Types.ObjectId], default: [] },
  to: { type: Schema.Types.ObjectId, required: true },
  screenFields: { type: [String], default: [] },
  requiredFields: { type: [String], default: [] },
  conditions: { type: [Schema.Types.Mixed], default: [] },
  validators: { type: [Schema.Types.Mixed], default: [] },
  postActions: { type: [Schema.Types.Mixed], default: [] }
}, { _id: false });

// Status and transition rules for a project.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  status: { type: String, enum: ['draft', 'live'], default: 'draft' },
  version: { type: Number, default: 1 },
  issueTypeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'IssueType' }], default: [] },
  publishedAt: Date,
  statuses: { type: [StatusSchema], default: [], validate: max(50) },
  transitions: { type: [TransitionSchema], default: [], validate: max(200) }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, status: 1 });

export default mongoose.model('Workflow', schema, 'workflows');
