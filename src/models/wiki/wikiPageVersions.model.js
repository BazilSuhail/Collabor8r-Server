import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    pageId: { type: Schema.Types.ObjectId, ref: 'WikiPage', required: true },
    spaceId: { type: Schema.Types.ObjectId, ref: 'WikiSpace', required: true },
    versionNo: { type: Number, required: true },
    title: String,
    body: Schema.Types.Mixed,
    changeSummary: String,
    authorId: Schema.Types.Mixed,
    authorName: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

schema.index({ pageId: 1, versionNo: -1 });

export default mongoose.model('WikiPageVersion', schema, 'wikiPageVersions');
