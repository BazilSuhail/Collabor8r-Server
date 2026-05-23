// Auth domain schemas: user identity + verification codes.
const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'male', 'female', 'other'],
    required: true,
    set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  dob: {
    type: Date,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: "1"
  },
  assignedTasks: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  headline: { type: String, default: '' },
  bio: { type: String, default: '' },
  location: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  skills: { type: [String], default: [] },
  languages: { type: [String], default: [] },
  socialLinks: {
    github: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  availability: {
    type: String,
    enum: ['available', 'busy', 'away'],
    default: 'available',
  },
  statusEmoji: { type: String, default: '' },
  pronouns: { type: String, default: '' },
});

const Profile = mongoose.model('Profile', profileSchema);

const verificationCodeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ['registration', 'login', 'password-reset'],
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000),
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

verificationCodeSchema.index({ email: 1, purpose: 1 });
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const VerificationCode = mongoose.model('VerificationCode', verificationCodeSchema);

module.exports = { Profile, VerificationCode };
