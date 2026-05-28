import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    formId: { type: Schema.Types.ObjectId, ref: 'Form', required: true },
    answers: Schema.Types.Mixed,
    submitterName: String,
    submitterEmail: String,
    itemId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
    status: { type: String, enum: ['new', 'converted', 'rejected'], default: 'new' },
    submittedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

schema.index({ formId: 1, submittedAt: -1 });
schema.index({ projectId: 1, status: 1 });

export default mongoose.model('FormSubmission', schema, 'formSubmissions');
