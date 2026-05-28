import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    spaceId: { type: Schema.Types.ObjectId, ref: 'WikiSpace', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    parentId: { type: Schema.Types.ObjectId, ref: 'WikiPage', default: null },
    title: String,
    slug: String,
    summary: String,
    body: Schema.Types.Mixed,
    icon: String,
    coverUrl: String,
    template: { type: String, enum: [null, 'meetingNotes', 'prd', 'retro', 'rfc'], default: null },
    isTemplate: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    position: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    readMinutes: { type: Number, default: 0 },
    currentVersion: { type: Number, default: 1 },
    authorId: Schema.Types.Mixed,
    authorName: Schema.Types.Mixed,
    lastEditedBy: Schema.Types.Mixed,
    lastEditedByName: Schema.Types.Mixed,
    relatedItemIds: {
      type: [Schema.Types.ObjectId],
      validate: { validator: (v) => v.length <= 30, message: 'relatedItemIds allows at most 30 items' }
    },
    publishedAt: Date
  },
  { timestamps: true, versionKey: false }
);

schema.index({ spaceId: 1, slug: 1 }, { unique: true });
schema.index({ spaceId: 1, parentId: 1, position: 1 });
schema.index({ projectId: 1, updatedAt: -1 });

export default mongoose.model('WikiPage', schema, 'wikiPages');
