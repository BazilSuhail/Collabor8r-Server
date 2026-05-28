import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    email: String,
    name: String,
    company: String,
    phone: String,
    avatarUrl: String,
    notes: String,
    requestCount: { type: Number, default: 0 },
    lastRequestAt: Date,
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

schema.index({ projectId: 1, email: 1 }, { unique: true });

export default mongoose.model('Customer', schema, 'customers');
