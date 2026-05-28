import mongoose from 'mongoose';

const { Schema } = mongoose;

// Project labels; issues store label names, usageCount orders the picker.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  color: String,
  description: String,
  usageCount: { type: Number, default: 0 }
}, { versionKey: false });

schema.index({ projectId: 1, name: 1 }, { unique: true });
schema.index({ projectId: 1, usageCount: -1 });

export default mongoose.model('Label', schema, 'labels');
