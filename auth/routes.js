// Auth routes — rate-limited signup/signin/code flows. Token TTL unified in auth/service (24h).
const express = require('express');
const router = express.Router();
const authService = require('./service');
const { Profile } = require('./models');
const { validate, required, isString, isEmail, isDate, minLength } = require('../lib/validate');

const rateBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests, try again later' });
    }
    next();
  };
}
if (rateBuckets.size > 10000) rateBuckets.clear();
const authLimiter = rateLimit(30, 60 * 1000);
const sensitiveLimiter = rateLimit(5, 60 * 1000);

router.post('/signup', authLimiter, async (req, res) => {
  const { name, gender, phone, email, dob, password } = req.body;
  try {
    const errors = validate({
      name: [required, isString],
      gender: [required, isString],
      phone: [required, isString],
      email: [required, isString, isEmail],
      dob: [required, isDate],
      password: [required, isString, (v, f) => minLength(v, f, 6)],
    }, req.body);
    if (errors) return res.status(400).json({ error: 'Validation failed', errors });

    const normalizedGender = String(gender).charAt(0).toUpperCase() + String(gender).slice(1).toLowerCase();
    if (!['Male', 'Female', 'Other'].includes(normalizedGender)) {
      return res.status(400).json({ error: 'Validation failed', errors: ['gender must be one of: Male, Female, Other'] });
    }

    const existing = await Profile.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered', field: 'email' });

    const profile = await authService.createAccount({
      name, gender: normalizedGender, phone, email, dob, password,
    });
    res.status(201).json({ token: authService.issueToken(profile._id), message: 'Account created successfully' });
  } catch (err) {
    console.error('signUp error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

router.post('/signin', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const errors = validate({ email: [required, isString, isEmail], password: [required, isString] }, req.body);
  if (errors) return res.status(400).json({ error: 'Validation failed', errors });
  try {
    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'No account found with this email', field: 'email' });
    const isMatch = await authService.comparePassword(password, profile.password);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect password', field: 'password' });
    res.json({ token: authService.issueToken(profile._id) });
  } catch (err) {
    console.error('signIn error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

router.post('/check-email', authLimiter, async (req, res) => {
  try {
    const profile = await Profile.findOne({ email: req.body.email });
    res.status(profile ? 400 : 200).json(
      profile ? { exists: true, message: 'Email already registered' } : { exists: false, message: 'Email is available' }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Single send-code endpoint absorbs forgot-password via purpose=password-reset.
router.post('/send-code', sensitiveLimiter, async (req, res) => {
  const errors = validate({ email: [required, isEmail], purpose: [required] }, req.body);
  if (errors) return res.status(400).json({ errors });
  const { email, purpose } = req.body;
  if (!['registration', 'login', 'password-reset'].includes(purpose)) {
    return res.status(400).json({ error: 'purpose must be "registration", "login", or "password-reset"' });
  }
  try {
    if (purpose === 'registration') {
      const exists = await Profile.findOne({ email });
      if (exists) return res.status(400).json({ error: 'Email already registered' });
    }
    if (purpose === 'login' || purpose === 'password-reset') {
      const exists = await Profile.findOne({ email });
      if (!exists) return res.status(400).json({ error: 'No account found with this email' });
    }
    await authService.sendCode(email, purpose);
    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) {
    console.error('sendCode error:', err);
    res.status(500).json({ error: 'Failed to send code', detail: err.message });
  }
});

router.post('/signup-code', sensitiveLimiter, async (req, res) => {
  const errors = validate({
    email: [required, isEmail], code: [required, isString],
    name: [required, isString], gender: [required], phone: [required], dob: [required],
  }, req.body);
  if (errors) return res.status(400).json({ errors });
  const { email, code, name, gender, phone, dob } = req.body;
  try {
    const record = await authService.consumeCode(email, code, 'registration');
    if (!record) return res.status(400).json({ error: 'Invalid or expired code' });
    const existing = await Profile.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });
    const profile = await authService.createAccount({ name, gender, phone, email, dob, password: '' });
    res.status(201).json({ token: authService.issueToken(profile._id), message: 'Account created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/signin-code', authLimiter, async (req, res) => {
  const errors = validate({ email: [required, isEmail], code: [required, isString] }, req.body);
  if (errors) return res.status(400).json({ errors });
  const { email, code } = req.body;
  try {
    const record = await authService.consumeCode(email, code, 'login');
    if (!record) return res.status(400).json({ error: 'Invalid or expired code' });
    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'No account found' });
    res.json({ token: authService.issueToken(profile._id) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset-password', sensitiveLimiter, async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const record = await authService.consumeCode(email, code, 'password-reset');
    if (!record) return res.status(400).json({ error: 'Invalid or expired code' });
    const profile = await Profile.findOne({ email });
    if (!profile) return res.status(400).json({ error: 'User does not exist' });
    profile.password = await authService.hashPassword(newPassword);
    await profile.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
