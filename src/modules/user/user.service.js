import { User, Session, ApiToken, OrgMember, Project, NotificationPref } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { escapeRegex, hashToken, randomToken } from '../../utils/helpers.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

const selfView = (u) => ({
  id: String(u._id),
  email: u.email,
  emailVerified: Boolean(u.emailVerifiedAt),
  displayName: u.displayName,
  firstName: u.firstName ?? null,
  lastName: u.lastName ?? null,
  headline: u.headline ?? null,
  bio: u.bio ?? null,
  jobTitle: u.jobTitle ?? null,
  company: u.company ?? null,
  location: u.location ?? null,
  timezone: u.timezone ?? null,
  locale: u.locale ?? null,
  pronouns: u.pronouns ?? null,
  website: u.website ?? null,
  links: u.links ?? [],
  skills: u.skills ?? [],
  availability: u.availability ?? null,
  preferences: u.preferences ?? {},
  avatarUrl: u.avatarUrl ?? null,
  avatarKey: u.avatarKey ?? null,
  coverUrl: u.coverUrl ?? null,
  lastOrgId: u.lastOrgId ?? null,
  createdAt: u.createdAt,
});

const sessionView = (s) => ({
  id: String(s._id),
  device: s.device ?? null,
  browser: s.browser ?? null,
  os: s.os ?? null,
  ip: s.ip ?? null,
  lastSeenAt: s.lastSeenAt ?? null,
  createdAt: s.createdAt ?? null,
});

const apiTokenView = (t) => ({
  id: String(t._id),
  name: t.name,
  description: t.description ?? '',
  tokenPrefix: t.tokenPrefix,
  scopes: t.scopes ?? [],
  orgId: t.orgId ? String(t.orgId) : null,
  projectId: t.projectId ? String(t.projectId) : null,
  lastUsedAt: t.lastUsedAt ?? null,
  lastUsedIp: t.lastUsedIp ?? null,
  expiresAt: t.expiresAt ?? null,
  createdAt: t.createdAt ?? null,
});

const prefView = (p) => ({
  channel: p.channel,
  kind: p.kind,
  enabled: p.enabled,
  quietHours: p.quietHours ?? null,
});

// Public user fields for other modules (ids are strings, invalid ids skipped).
export const getPublicUsers = async (ids) => {
  const oids = ids.filter((id) => OBJECT_ID.test(String(id)));
  const users = oids.length
    ? await User.find({ _id: { $in: oids } }).select('displayName avatarUrl avatarKey email').lean()
    : [];
  return new Map(
    users.map((u) => [
      String(u._id),
      { id: String(u._id), displayName: u.displayName, avatar: u.avatarUrl ?? null, avatarKey: u.avatarKey ?? null, email: u.email },
    ]),
  );
};

export const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return selfView(user);
};

export const updateProfile = async (userId, patch) => {
  const user = await User.findByIdAndUpdate(userId, { $set: patch }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  return selfView(user);
};

// Searches only users who share at least one active organization with the caller.
export const searchUsers = async (callerId, q) => {
  const orgIds = await OrgMember.find({ userId: callerId, status: 'active' }).distinct('orgId');
  const peerIds = await OrgMember.find({ orgId: { $in: orgIds }, status: 'active' }).distinct('userId');
  const pattern = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({
    _id: { $in: peerIds },
    status: 'active',
    $or: [{ email: pattern }, { displayName: pattern }],
  })
    .select('displayName avatarUrl avatarKey email')
    .limit(20)
    .lean();
  return users.map((u) => ({
    id: String(u._id),
    displayName: u.displayName,
    avatar: u.avatarUrl ?? null,
    avatarKey: u.avatarKey ?? null,
    email: u.email,
  }));
};

export const listSessions = async (userId) => {
  const sessions = await Session.find({ userId, revokedAt: null, expireAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .select('device browser os ip lastSeenAt createdAt')
    .lean();
  return sessions.map(sessionView);
};

export const revokeSession = async (userId, sessionId) => {
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (!session) throw new ApiError(404, 'Session not found');
};

export const listApiTokens = async (userId) => {
  const tokens = await ApiToken.find({ userId, revokedAt: null })
    .select('-tokenHash')
    .sort({ createdAt: -1 })
    .lean();
  return tokens.map(apiTokenView);
};

// The raw token is returned once; only its hash is stored.
export const createApiToken = async (userId, input) => {
  let orgId = input.orgId ?? null;
  const projectId = input.projectId ?? null;
  if (orgId) {
    const member = await OrgMember.exists({ orgId, userId, status: 'active' });
    if (!member) throw new ApiError(403, 'Not a member of that organization');
  }
  if (projectId) {
    const project = await Project.findById(projectId).select('orgId ownerId').lean();
    if (!project) throw new ApiError(404, 'Project not found');
    const isOwner = project.ownerId && String(project.ownerId) === String(userId);
    const inOrg =
      project.orgId && (await OrgMember.exists({ orgId: project.orgId, userId, status: 'active' }));
    if (!isOwner && !inOrg) throw new ApiError(403, 'No access to that project');
    if (project.orgId && orgId && String(project.orgId) !== String(orgId)) {
      throw new ApiError(422, 'Project does not belong to that organization');
    }
    orgId = orgId ?? project.orgId ?? null;
  }
  // Omitted expiry defaults to 90 days; an explicit null still means no expiry.
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : input.expiresAt === undefined
      ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      : null;
  if (expiresAt && expiresAt <= new Date()) throw new ApiError(422, 'Expiry must be in the future');

  const raw = `pmk_${randomToken(24)}`;
  const doc = await ApiToken.create({
    userId,
    name: input.name,
    description: input.description ?? '',
    tokenPrefix: raw.slice(0, 8),
    tokenHash: hashToken(raw),
    scopes: input.scopes ?? [],
    orgId,
    projectId,
    expiresAt,
  });
  return { token: raw, ...apiTokenView(doc.toObject()) };
};

export const revokeApiToken = async (userId, tokenId) => {
  const token = await ApiToken.findOneAndUpdate(
    { _id: tokenId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (!token) throw new ApiError(404, 'API token not found');
};

export const getPrefs = async (userId) => {
  const prefs = await NotificationPref.find({ userId }).select('channel kind enabled quietHours').lean();
  return prefs.map(prefView);
};

// Missing rows mean enabled; updates upsert one row per channel and kind.
export const updatePrefs = async (userId, prefs) => {
  if (prefs.length) {
    const now = new Date();
    await NotificationPref.bulkWrite(
      prefs.map((p) => ({
        updateOne: {
          filter: { userId, channel: p.channel, kind: p.kind },
          update: {
            $set: {
              enabled: p.enabled,
              updatedAt: now,
              ...(p.quietHours !== undefined && { quietHours: p.quietHours }),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return getPrefs(userId);
};
