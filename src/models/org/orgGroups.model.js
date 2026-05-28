import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  description: String,
  color: String,
  memberCount: { type: Number, default: 0 },
  memberIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    validate: { validator: (v) => v.length <= 500, message: 'max 500 members' },
  },
}, { timestamps: true, versionKey: false });

schema.index({ orgId: 1, name: 1 }, { unique: true });

export default mongoose.model('OrgGroup', schema, 'orgGroups');
