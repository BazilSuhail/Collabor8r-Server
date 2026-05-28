import bcrypt from 'bcryptjs';
import { User, Session } from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';
import { sendWelcome } from '../../email/dispatch/welcome.js';
import { sendPasswordChanged } from '../../email/dispatch/passwordChanged.js';
import { hashToken, randomToken, signAccessToken } from '../../utils/helpers.js';

const ACCESS_EXPIRES_IN = 900;
const BCRYPT_ROUNDS = env.bcryptRounds;
const RETIRED_KEEP = 20;
// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);
const BAD_LOGIN = 'Invalid email or password';

const refreshExpiry = () => new Date(Date.now() + env.refreshTtlDays * 86400000);

const parseAgent = (ua = '') => ({
  device: /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop',
  browser: /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Other',
  os: /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Other',
});

const buildTokens = (user, refreshToken, refreshExpiresAt) => ({
  accessToken: signAccessToken({ id: String(user._id), email: user.email }),
  refreshToken,
  expiresIn: ACCESS_EXPIRES_IN,
  refreshExpiresAt,
});

const selfView = (user) => ({
  id: String(user._id),
  email: user.email,
  displayName: user.displayName,
  firstName: user.firstName ?? null,
  lastName: user.lastName ?? null,
  avatarUrl: user.avatarUrl ?? null,
  timezone: user.timezone ?? null,
  locale: user.locale ?? null,
  preferences: user.preferences ?? {},
  createdAt: user.createdAt,
});

// Creates a session row and returns a fresh token pair.
export const issueTokens = async (user, meta = {}) => {
  const refreshToken = randomToken(32);
  const refreshExpiresAt = refreshExpiry();
  const now = new Date();
  await Session.create({
    userId: user._id,
    ...parseAgent(meta.userAgent),
    ip: meta.ip || null,
    createdAt: now,
    lastSeenAt: now,
    expireAt: refreshExpiresAt,
    refreshHash: hashToken(refreshToken),
    prevRefreshHash: null,
  });
  return buildTokens(user, refreshToken, refreshExpiresAt);
};

export const registerUser = async ({ email, password, displayName }, meta) => {
  if (await User.exists({ email })) throw new ApiError(409, 'Email already registered');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    email,
    passwordHash,
    displayName: displayName || email.split('@')[0],
    status: 'active',
  });
  const tokens = await issueTokens(user, meta);
  if (user.email) await sendWelcome({ email: user.email, name: user.displayName });
  return { user: selfView(user), tokens };
};

const isLocked = (user) => user.lockedUntil && user.lockedUntil > new Date();

// Counts a failure atomically and locks the account once the limit is reached.
const recordLoginFailure = async (userId) => {
  const user = await User.findByIdAndUpdate(userId, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' }).select('+failedLogins');
  if (user && user.failedLogins >= env.loginMaxFailures) {
    await User.updateOne(
      { _id: userId },
      { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + env.loginLockMinutes * 60000) } },
    );
  }
};

export const loginUser = async ({ email, password }, meta) => {
  const user = await User.findOne({ email }).select('+passwordHash +lockedUntil');
  if (user && isLocked(user)) throw new ApiError(429, 'Account temporarily locked, try again later');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    if (user) await recordLoginFailure(user._id);
    throw new ApiError(401, BAD_LOGIN);
  }
  if (user.status !== 'active') throw new ApiError(403, 'Account is not active');
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
  const tokens = await issueTokens(user, meta);
  return { user: selfView(user), tokens };
};

// Rotates the refresh token. Presenting an already rotated token revokes that whole session (token family).
export const refreshSession = async ({ refreshToken }, meta) => {
  const oldHash = hashToken(refreshToken);
  const now = new Date();
  const newToken = randomToken(32);
  const refreshExpiresAt = refreshExpiry();
  const session = await Session.findOneAndUpdate(
    { refreshHash: oldHash, revokedAt: null, expireAt: { $gt: now } },
    {
      $set: {
        refreshHash: hashToken(newToken),
        prevRefreshHash: oldHash,
        lastSeenAt: now,
        expireAt: refreshExpiresAt,
        ip: meta.ip || null,
      },
      $push: { retiredHashes: { $each: [oldHash], $slice: -RETIRED_KEEP } },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!session) {
    await Session.updateMany(
      { $or: [{ retiredHashes: oldHash }, { prevRefreshHash: oldHash }], revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
  const user = await User.findById(session.userId).select('email status').lean();
  if (!user || user.status !== 'active') throw new ApiError(401, 'Account is not active');
  return { tokens: buildTokens(user, newToken, refreshExpiresAt) };
};

export const logoutSession = async ({ refreshToken }) => {
  if (!refreshToken) return;
  await Session.updateOne(
    { refreshHash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

export const revokeAllSessions = async (userId) => {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

export const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return selfView(user);
};

export const changePassword = async (userId, { currentPassword, newPassword }, meta = {}) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();
  await revokeAllSessions(userId);
  if (user.email) await sendPasswordChanged({ email: user.email, name: user.displayName, changedAt: new Date(), ip: meta.ip });
};
