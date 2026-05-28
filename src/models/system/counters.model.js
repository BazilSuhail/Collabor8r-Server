import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export default mongoose.model('Counter', schema, 'counters');
