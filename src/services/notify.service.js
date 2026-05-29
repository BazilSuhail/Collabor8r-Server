// In-app notification emitter with mention parsing.
import { logger } from '../utils/logger.js';
import { Notification, NotificationPref, Project, ProjectMember, User } from '../models/index.js';
import { actorOf } from './activity.service.js';
import { getProjectAccess } from './access.service.js';
import { canUserSeeIssue } from './visibility.service.js';
import { PROJECT_ROLE_RANK } from '../config/constants.js';

const RETENTION_MS = 90 * 86_400_000;
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const MENTION_ID = /@\[([a-fA-F0-9]{24})\]/g;
const MENTION_EMAIL = /(?:^|\s)@([^\s@]+@[^\s@]+)/g;

export const notify = async ({ userIds, type, title, body, projectId, orgId, link, actorId }) => {
  const actorKey = actorId ? String(actorId) : null;
  const recipients = [...new Set(userIds.map(String))].filter((id) => id !== actorKey);
  if (recipients.length === 0) return;

  const disabled = await NotificationPref.find({
    userId: { $in: recipients },
    channel: 'inApp',
    kind: type,
    enabled: false,
  })
    .select('userId')
    .lean();
  const muted = new Set(disabled.map((p) => String(p.userId)));
  const targets = recipients.filter((id) => !muted.has(id));
  if (targets.length === 0) return;

  const actor = actorKey ? await actorOf({ id: actorKey }) : null;
  const expireAt = new Date(Date.now() + RETENTION_MS);
  const docs = targets.map((userId) => ({
    userId,
    orgId: orgId ?? null,
    projectId: projectId ?? null,
    kind: type,
    title,
    body: body ?? null,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorAvatar: actor?.avatar ?? null,
    target: link ? { type: link.kind, id: String(link.id), url: link.url ?? null } : undefined,
    expireAt,
  }));

  try {
    await Notification.insertMany(docs);
  } catch (err) {
    logger.error('Notification write failed:', err.message);
  }
};

// Notifies project members named as @email or @[userId] in text.
export const notifyMentions = async (text, ctx) => {
  const { projectId, orgId, actorId, title, body, link, issue = null, internal = false } = ctx;
  const ids = new Set();
  const emails = new Set();
  for (const m of String(text ?? '').matchAll(MENTION_ID)) ids.add(m[1]);
  for (const m of String(text ?? '').matchAll(MENTION_EMAIL)) emails.add(m[1].toLowerCase());

  if (emails.size) {
    const users = await User.find({ email: { $in: [...emails] } }).select('_id').lean();
    for (const u of users) ids.add(String(u._id));
  }
  const candidates = [...ids].filter((id) => OBJECT_ID.test(id));
  if (candidates.length === 0) return [];

  const [members, project] = await Promise.all([
    ProjectMember.find({ projectId, userId: { $in: candidates }, status: 'active' })
      .select('userId')
      .lean(),
    Project.findById(projectId).select('ownerId').lean(),
  ]);
  const allowed = new Set(members.map((m) => String(m.userId)));
  if (project) allowed.add(String(project.ownerId));

  let recipients = candidates.filter((id) => allowed.has(id) && id !== String(actorId ?? ''));

  // Skip people who cannot see the issue (private) or the comment (internal = developer and above).
  if (issue && (issue.isPrivate || internal) && recipients.length) {
    const kept = [];
    for (const id of recipients) {
      let role = null;
      try {
        role = (await getProjectAccess(id, projectId))?.role ?? null;
      } catch (err) {
        logger.error('Mention access check failed:', err.message);
      }
      if (!role) continue; // fail closed
      if (internal && (PROJECT_ROLE_RANK[role] ?? 0) < PROJECT_ROLE_RANK.developer) continue;
      if (!canUserSeeIssue(issue, id, role)) continue;
      kept.push(id);
    }
    recipients = kept;
  }
  await notify({ userIds: recipients, type: 'mention', title, body, projectId, orgId, link, actorId });
  return recipients;
};
