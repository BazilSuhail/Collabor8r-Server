import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema({ label: String, url: String }, { _id: false });

const recentItemSchema = new mongoose.Schema({
  itemId: mongoose.Schema.Types.ObjectId,
  spaceId: mongoose.Schema.Types.ObjectId,
  key: String,
  title: String,
  at: Date,
}, { _id: false });

const achievementSchema = new mongoose.Schema({
  key: String,
  title: String,
  description: String,
  icon: String,
  earnedAt: Date,
  spaceId: mongoose.Schema.Types.ObjectId,
}, { _id: false });

const schema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true },
  emailVerifiedAt: Date,
  passwordHash: { type: String, select: false },
  totp: { type: mongoose.Schema.Types.Mixed, select: false },
  failedLogins: { type: Number, default: 0, select: false }, // consecutive bad passwords
  lockedUntil: { type: Date, select: false }, // set after too many failures
  status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  displayName: String,
  firstName: String,
  lastName: String,
  avatarUrl: String,
  avatarKey: { type: String, trim: true, default: null },
  coverUrl: String,
  headline: String,
  bio: { type: String, maxlength: 500 },
  jobTitle: String,
  company: String,
  location: String,
  timezone: String,
  locale: String,
  pronouns: String,
  website: String,
  links: {
    type: [linkSchema],
    validate: { validator: (v) => v.length <= 5, message: 'max 5 links' },
  },
  skills: {
    type: [String],
    validate: { validator: (v) => v.length <= 30, message: 'max 30 skills' },
  },
  availability: mongoose.Schema.Types.Mixed,
  preferences: mongoose.Schema.Types.Mixed,
  recentItems: {
    type: [recentItemSchema],
    validate: { validator: (v) => v.length <= 20, message: 'max 20 recent items' },
  },
  pinnedSpaceIds: {
    type: [mongoose.Schema.Types.ObjectId],
    validate: { validator: (v) => v.length <= 10, message: 'max 10 pinned spaces' },
  },
  lastOrgId: mongoose.Schema.Types.ObjectId,
  lastSpaceId: mongoose.Schema.Types.ObjectId,
  stats: mongoose.Schema.Types.Mixed,
  achievements: {
    type: [achievementSchema],
    validate: { validator: (v) => v.length <= 200, message: 'max 200 achievements' },
  },
  lastLoginAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ email: 1 }, { unique: true });
schema.index({ displayName: 'text', headline: 'text' });
schema.index({ skills: 1 });

export default mongoose.model('User', schema, 'users');
