const Profile = require('../models/profile');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AssignedTask = require('../models/assignTasks');
const AdminProject = require('../models/adminProjects');
const JoinProject = require('../models/joinProjects');
const Notification = require('../models/notifications');
const VerificationCode = require('../models/verificationCode');
const { generateCode, sendVerificationCode } = require('../utils/email');
const { validate, required, isString, isEmail } = require('../utils/validate');

exports.signUp = async (req, res) => {
  const { name, gender, phone, email, dob, password } = req.body;
  try {
    let profile = await Profile.findOne({ email });
    if (profile) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    profile = new Profile({ name, gender, phone, email, dob, password: hashedPassword });
    await profile.save();

    const userId = profile._id;
    await Promise.all([
      new AssignedTask({ _id: userId, assignTasks: [] }).save(),
      new AdminProject({ _id: userId, projects: [] }).save(),
      new JoinProject({ _id: userId, projects: [], asManager: [] }).save(),
      new Notification({ _id: userId, notifications: [] }).save(),
    ]);

    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.signIn = async (req, res) => {
  const { email, password } = req.body;
  try {
    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, profile.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: profile._id }, process.env.JWT_SECRET, { expiresIn: '22h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.checkEmailExists = async (req, res) => {
  const { email } = req.body;
  try {
    const profile = await Profile.findOne({ email });
    res.status(profile ? 400 : 200).json(
      profile ? { exists: true, message: 'Email already registered' } : { exists: false, message: 'Email is available' }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ success: false, message: 'No account found with that email.' });

    const code = generateCode();
    await new VerificationCode({ email, code, purpose: 'password-reset' }).save();
    await sendVerificationCode(email, code, 'password-reset');

    res.status(200).json({ success: true, message: 'Verification code sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const record = await VerificationCode.findOne({ email, code, purpose: 'password-reset', isUsed: false });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    record.isUsed = true;
    await record.save();

    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'User does not exist' });

    profile.password = await bcrypt.hash(newPassword, 10);
    await profile.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.sendCode = async (req, res) => {
  const errors = validate({ email: [required, isEmail], purpose: [required] }, req.body);
  if (errors) return res.status(400).json({ errors });

  const { email, purpose } = req.body;
  if (!['registration', 'login'].includes(purpose)) {
    return res.status(400).json({ error: 'purpose must be "registration" or "login"' });
  }

  try {
    if (purpose === 'registration') {
      const exists = await Profile.findOne({ email });
      if (exists) return res.status(400).json({ error: 'Email already registered' });
    }
    if (purpose === 'login') {
      const exists = await Profile.findOne({ email });
      if (!exists) return res.status(400).json({ error: 'No account found with this email' });
    }

    await VerificationCode.deleteMany({ email, purpose, isUsed: false });

    const code = generateCode();
    await new VerificationCode({ email, code, purpose }).save();
    await sendVerificationCode(email, code, purpose);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send code' });
  }
};

exports.signUpWithCode = async (req, res) => {
  const errors = validate({
    email: [required, isEmail], code: [required, isString],
    name: [required, isString], gender: [required], phone: [required], dob: [required],
  }, req.body);
  if (errors) return res.status(400).json({ errors });

  const { email, code, name, gender, phone, dob } = req.body;

  try {
    const record = await VerificationCode.findOne({ email, code, purpose: 'registration', isUsed: false });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    let profile = await Profile.findOne({ email });
    if (profile) return res.status(400).json({ error: 'User already exists' });

    record.isUsed = true;
    await record.save();

    profile = new Profile({ name, gender, phone, email, dob, password: '' });
    await profile.save();

    const userId = profile._id;
    await Promise.all([
      new AssignedTask({ _id: userId, assignTasks: [] }).save(),
      new AdminProject({ _id: userId, projects: [] }).save(),
      new JoinProject({ _id: userId, projects: [], asManager: [] }).save(),
      new Notification({ _id: userId, notifications: [] }).save(),
    ]);

    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ token, message: 'Account created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.signInWithCode = async (req, res) => {
  const errors = validate({ email: [required, isEmail], code: [required, isString] }, req.body);
  if (errors) return res.status(400).json({ errors });

  const { email, code } = req.body;

  try {
    const record = await VerificationCode.findOne({ email, code, purpose: 'login', isUsed: false });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'No account found' });

    record.isUsed = true;
    await record.save();

    const token = jwt.sign({ id: profile._id }, process.env.JWT_SECRET, { expiresIn: '22h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
