import mongoose from 'mongoose';

const { Schema } = mongoose;

// Release train entry that issues can be tagged with.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  status: { type: String, enum: ['planned', 'in_progress', 'released', 'archived'], default: 'planned' },
  startDate: Date,
  releaseDate: Date,
  releaseNotes: String,
  counts: { type: Schema.Types.Mixed, default: () => ({ items: 0, done: 0 }) }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, status: 1, releaseDate: 1 });

export default mongoose.model('Release', schema, 'releases');
