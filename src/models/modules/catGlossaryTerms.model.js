import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    term: String,
    definition: String,
    language: String,
    forbidden: { type: Boolean, default: false },
    createdBy: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, term: 1, language: 1 }, { unique: true });

export default mongoose.model('CatGlossaryTerm', schema, 'catGlossaryTerms');
