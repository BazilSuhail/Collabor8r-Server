import mongoose from 'mongoose';

const { Schema } = mongoose;

const OptionSchema = new Schema({
  value: { type: String, required: true },
  label: String,
  color: String
}, { _id: false });

// Project-defined custom field definitions.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  fieldType: {
    type: String,
    enum: ['text', 'longText', 'number', 'money', 'date', 'select', 'multiSelect', 'user', 'url', 'checkbox', 'rating', 'formula'],
    required: true
  },
  options: { type: [OptionSchema], default: [] },
  formula: String,
  required: { type: Boolean, default: false },
  showOnCard: { type: Boolean, default: false },
  showInList: { type: Boolean, default: false },
  issueTypeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'IssueType' }], default: [] },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, sortOrder: 1 });

export default mongoose.model('CustomField', schema, 'customFields');
