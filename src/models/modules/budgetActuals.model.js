import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    budgetLineId: { type: Schema.Types.ObjectId, ref: 'BudgetLine', required: true },
    amount: Number,
    currency: String,
    description: String,
    vendor: String,
    incurredOn: Date,
    itemId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
    receiptKey: String,
    enteredBy: Schema.Types.Mixed,
    enteredByName: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

schema.index({ budgetLineId: 1, incurredOn: -1 });
schema.index({ projectId: 1, incurredOn: -1 });

export default mongoose.model('BudgetActual', schema, 'budgetActuals');
