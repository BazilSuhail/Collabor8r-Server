import mongoose from 'mongoose';
import { Notification } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';

const oid = (v) => new mongoose.Types.ObjectId(v);

function scopeFilter(userId, projectId) {
  const filter = { userId: oid(userId) };
  if (projectId) filter.projectId = oid(projectId);
  return filter;
}

export function listNotifications(userId, query) {
  const filter = scopeFilter(userId, query.projectId);
  if (query.unread) filter.readAt = null;
  return paginate(Notification, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export function unreadCount(userId, projectId) {
  return Notification.countDocuments({ ...scopeFilter(userId, projectId), readAt: null });
}

export async function markRead(userId, notificationId) {
  const now = new Date();
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: oid(userId), readAt: null },
    { $set: { readAt: now } },
    { returnDocument: 'after' },
  ).lean();
  if (updated) return updated;
  const existing = await Notification.findOne({ _id: notificationId, userId: oid(userId) }).lean();
  if (!existing) throw new ApiError(404, 'Notification not found');
  return existing;
}

export async function markAllRead(userId, projectId) {
  const res = await Notification.updateMany({ ...scopeFilter(userId, projectId), readAt: null }, { $set: { readAt: new Date() } });
  return { updated: res.modifiedCount ?? 0 };
}
