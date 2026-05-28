import mongoose from 'mongoose';

const { Schema } = mongoose;

// Priority levels for a project; rank 1 is the highest.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  icon: String,
  color: String,
  rank: { type: Number, required: true },
  isDefault: { type: Boolean, default: false }
}, { versionKey: false });

schema.index({ projectId: 1, rank: 1 });

export default mongoose.model('Priority', schema, 'priorities');
