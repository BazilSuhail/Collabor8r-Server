// Authentication: JWT bearer, API tokens (pmk_) and scope checks.
import { ApiToken, User } from '../models/index.js';
import { ApiError } from '../utils/http.js';
import { hashToken, verifyAccessToken } from '../utils/helpers.js';

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const jwtUser = (token) => {
  const payload = verifyAccessToken(token);
  return { id: payload.sub, email: payload.email };
};

// Records without a status field count as active (legacy users are not locked out).
const isActiveUser = (id) =>
  User.exists({ _id: id, status: { $nin: ['suspended', 'deleted'] } });

export const auth = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'Authentication required'));
  let user;
  try {
    user = jwtUser(token);
    if (!(await isActiveUser(user.id))) throw new Error('inactive');
  } catch {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
  req.user = user;
  next();
};

export const authOrToken = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'Authentication required'));
  if (!token.startsWith('pmk_')) return auth(req, res, next);

  try {
    const now = new Date();
    const doc = await ApiToken.findOne({
      tokenHash: hashToken(token),
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();
    if (!doc || !(await isActiveUser(doc.userId))) {
      throw new ApiError(401, 'Invalid or expired token');
    }

    ApiToken.updateOne({ _id: doc._id }, { $set: { lastUsedAt: now, lastUsedIp: req.ip } })
      .exec()
      .catch(() => {});
    req.user = { id: String(doc.userId), email: null };
    req.apiToken = {
      id: String(doc._id),
      scopes: doc.scopes ?? [],
      orgId: doc.orgId ?? null,
      projectId: doc.projectId ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuth = (req, res, next) => {
  const token = bearer(req);
  if (token && !token.startsWith('pmk_')) {
    try {
      req.user = jwtUser(token);
    } catch {
      // Invalid token: continue as anonymous.
    }
  }
  next();
};

// JWT users pass; API tokens need the scope and must match the route's project/org.
export const requireScope = (scope) => (req, res, next) => {
  const token = req.apiToken;
  if (!token) return next();

  const scopeOk = token.scopes.includes(scope) || token.scopes.includes('*');
  const projectOk = !token.projectId || String(token.projectId) === String(req.project?._id);
  const orgId = req.org?._id ?? req.project?.orgId;
  const orgOk = !token.orgId || String(token.orgId) === String(orgId);
  if (!scopeOk || !projectOk || !orgOk) {
    return next(new ApiError(403, 'Token lacks permission for this resource'));
  }
  next();
};
