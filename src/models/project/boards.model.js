import mongoose from 'mongoose';

const { Schema } = mongoose;

const max = (n) => ({ validator: (v) => v.length <= n, message: `max ${n} items` });

const ColumnSchema = new Schema({
  id: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
  name: { type: String, required: true },
  statusIds: { type: [Schema.Types.ObjectId], default: [] },
  wipLimit: { type: Number, default: null },
  wipPolicy: String,
  color: String,
  sortOrder: { type: Number, default: 0 }
}, { _id: false });

// Board layout: columns mapped to workflow statuses, swimlanes and view options.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: ['scrum', 'kanban'], default: 'kanban' },
  columns: { type: [ColumnSchema], default: [], validate: max(15) },
  swimlaneBy: { type: String, enum: ['none', 'assignee', 'epic', 'priority', 'type'], default: 'none' },
  cardFields: { type: [String], default: [] },
  showSubtasks: { type: Boolean, default: true },
  showDoneColumn: { type: Boolean, default: true },
  filter: { type: Schema.Types.Mixed, default: () => ({ savedFilterId: null, query: '' }) },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, isDefault: 1 });

export default mongoose.model('Board', schema, 'boards');
