import mongoose from 'mongoose';

const { Schema } = mongoose;

// Per-project role definitions with permission strings.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  description: String,
  color: String,
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false },
  memberCount: { type: Number, default: 0 }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, name: 1 }, { unique: true });

export default mongoose.model('ProjectRole', schema, 'projectRoles');
