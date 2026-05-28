import mongoose from 'mongoose';

const { Schema } = mongoose;

// Closing reasons such as Done, Won't do, Duplicate.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  countsAsDone: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { versionKey: false });

schema.index({ projectId: 1, sortOrder: 1 });

export default mongoose.model('Resolution', schema, 'resolutions');
