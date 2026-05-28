import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: String,
    category: String,
    planned: { type: Number, default: 0 },
    forecast: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    currency: String,
    startDate: Date,
    endDate: Date,
    ownerId: Schema.Types.Mixed,
    ownerName: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, category: 1 });

export default mongoose.model('BudgetLine', schema, 'budgetLines');
