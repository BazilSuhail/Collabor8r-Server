import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    name: String,
    key: String,
    description: String,
    iconUrl: String,
    visibility: { type: String, enum: ['project', 'org', 'private'] },
    homePageId: { type: Schema.Types.ObjectId, ref: 'WikiPage' },
    createdBy: Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);

schema.index({ projectId: 1, key: 1 }, { unique: true, sparse: true });

export default mongoose.model('WikiSpace', schema, 'wikiSpaces');
