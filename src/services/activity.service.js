// Project activity feed writer and cached actor lookup.
import { logger } from '../utils/logger.js';
import { ProjectActivity, User } from '../models/index.js';
import { ACTIVITY_KINDS } from '../config/constants.js';

const ACTOR_TTL_MS = 60_000;
const actorCache = new Map();

// Accepts a user document or { id }; loads the user when only an id is given.
export const actorOf = async (user) => {
  const id = String(user.id ?? user._id);
  if (user.displayName !== undefined) {
    return { id, name: user.displayName ?? null, avatar: user.avatarUrl ?? null };
  }
  const hit = actorCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;

  const doc = await User.findById(id).select('displayName avatarUrl').lean();
  const value = { id, name: doc?.displayName ?? null, avatar: doc?.avatarUrl ?? null };
  actorCache.set(id, { value, expires: Date.now() + ACTOR_TTL_MS });
  return value;
};

export const logActivity = async ({ projectId, orgId = null, kind, actor, item, summary, aiCreated = false }) => {
  if (!ACTIVITY_KINDS.includes(kind)) {
    logger.error(`Unknown activity kind: ${kind}`);
    return;
  }
  try {
    await ProjectActivity.create({
      at: new Date(),
      projectId,
      orgId,
      kind,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorAvatar: actor?.avatar ?? null,
      itemId: item?.id ?? null,
      itemKey: item?.key ?? null,
      itemTitle: item?.title ?? null,
      summary,
      aiCreated,
    });
  } catch (err) {
    logger.error('Activity write failed:', err.message);
  }
};
