import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sourceText: String,
    targetText: String,
    sourceLang: String,
    targetLang: String,
    status: { type: String, enum: ['draft', 'reviewed', 'approved'], default: 'draft' },
    ownerId: Schema.Types.Mixed,
    ownerName: Schema.Types.Mixed,
    glossaryTermIds: { type: [Schema.Types.ObjectId], ref: 'CatGlossaryTerm', default: [] }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, status: 1, sourceLang: 1, targetLang: 1 });

export default mongoose.model('CatEntry', schema, 'catEntries');
