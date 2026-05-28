import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  date: { type: Date, required: true },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

schema.index({ projectId: 1, date: 1 });

export default mongoose.model('Rollup', schema, 'rollups');
