// Auth domain logic: account bootstrap, token issue (unified 24h), code send/consume.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Profile, VerificationCode } = require('./models');
const { AssignedTask } = require('../tasks/models');
const { Membership } = require('../projects/models');
const { Notification } = require('../notifications/models');
const { generateCode, sendVerificationCode } = require('../lib/email');

// Unified expiry — was inconsistently 8h (signup) vs 22h (signin).
const TOKEN_EXPIRY = '24h';

function issueToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Shared bootstrap: create Profile + AssignedTask + Membership + Notification docs.
async function createAccount({ name, gender, phone, email, dob, password }) {
  const hashedPassword = password ? await hashPassword(password) : '';
  const profile = new Profile({ name, gender, phone, email, dob, password: hashedPassword });
  await profile.save();

  const userId = profile._id;
  await Promise.all([
    new AssignedTask({ _id: userId, assignTasks: [] }).save(),
    new Membership({ _id: userId, admin: [], asLead: [], joined: [] }).save(),
    new Notification({ _id: userId, notifications: [] }).save(),
  ]);

  return profile;
}

// Generates + emails a verification code for registration | login | password-reset.
async function sendCode(email, purpose) {
  await VerificationCode.deleteMany({ email, purpose, isUsed: false });
  const code = generateCode();
  await new VerificationCode({ email, code, purpose }).save();
  await sendVerificationCode(email, code, purpose);
  return code;
}

// Validates and consumes a code. Returns the record or null if invalid/expired.
async function consumeCode(email, code, purpose) {
  const record = await VerificationCode.findOne({ email, code, purpose, isUsed: false });
  if (!record || record.expiresAt < new Date()) return null;
  record.isUsed = true;
  await record.save();
  return record;
}

module.exports = {
  TOKEN_EXPIRY,
  issueToken,
  hashPassword,
  comparePassword,
  createAccount,
  sendCode,
  consumeCode,
};
