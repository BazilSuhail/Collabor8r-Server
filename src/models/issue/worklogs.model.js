import mongoose from 'mongoose';

const { Schema } = mongoose;

// Time spent on an issue by a user.
const schema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userAvatar: String,
  startedAt: Date,
  seconds: { type: Number, required: true, min: 1 },
  billable: { type: Boolean, default: false },
  comment: String,
  source: { type: String, enum: ['timer', 'manual'], default: 'manual' },
  date: { type: Date, required: true }
}, { timestamps: true, versionKey: false });

schema.index({ projectId: 1, userId: 1, date: 1 });
schema.index({ issueId: 1, startedAt: 1 });

export default mongoose.model('Worklog', schema, 'worklogs');
