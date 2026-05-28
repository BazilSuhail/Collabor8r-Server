import mongoose from 'mongoose';

const { Schema } = mongoose;

// Project component tags for issues.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  leadId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  leadName: String,
  color: String,
  counts: { type: Schema.Types.Mixed, default: () => ({ items: 0 }) }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ projectId: 1, name: 1 }, { unique: true });

export default mongoose.model('Component', schema, 'components');
