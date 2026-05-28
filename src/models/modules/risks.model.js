import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: String,
    description: String,
    category: String,
    probability: { type: Number, min: 1, max: 5 },
    impact: { type: Number, min: 1, max: 5 },
    score: Number,
    status: { type: String, enum: ['open', 'mitigating', 'accepted', 'closed'], default: 'open' },
    ownerId: Schema.Types.Mixed,
    ownerName: Schema.Types.Mixed,
    mitigation: String,
    dueDate: Date,
    reviewDate: Date,
    linkedItemIds: [Schema.Types.ObjectId]
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, status: 1, score: -1 });

export default mongoose.model('Risk', schema, 'risks');
