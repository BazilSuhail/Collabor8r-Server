import { z } from 'zod';
import { asyncHandler, ok, paged } from '../../utils/http.js';
import { objectId } from '../../utils/helpers.js';
import * as svc from './notifications.service.js';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  projectId: objectId.optional(),
});

export const scopeQuerySchema = z.object({
  projectId: objectId.optional(),
});

export const readAllSchema = z.object({
  projectId: objectId.optional(),
}).optional();

export const listNotifications = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listNotifications(req.user.id, req.valid.query);
  paged(res, items, meta);
});

export const unreadCount = asyncHandler(async (req, res) => {
  ok(res, { count: await svc.unreadCount(req.user.id, req.valid.query.projectId) });
});

export const markRead = asyncHandler(async (req, res) => {
  ok(res, await svc.markRead(req.user.id, req.params.notificationId));
});

export const markAllRead = asyncHandler(async (req, res) => {
  ok(res, await svc.markAllRead(req.user.id, req.valid.body?.projectId));
});
