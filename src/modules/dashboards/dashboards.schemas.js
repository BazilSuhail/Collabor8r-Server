import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const widget = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['stat', 'barChart', 'lineChart', 'donut', 'burndown', 'velocity', 'cumulativeFlow', 'cycleTime', 'workload', 'activityFeed', 'list', 'text']),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(200).optional(),
  config: z.record(z.string(), z.any()).optional(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
  h: z.number().int().min(1).max(48),
  refreshSeconds: z.number().int().min(0).optional(),
});

const layout = z.object({
  columns: z.number().int().min(1).max(24),
  rowHeight: z.number().int().min(20).max(200),
});

const sharedWith = z.object({
  scope: z.enum(['private', 'project', 'users']),
  userIds: z.array(objectId).max(100).optional(),
});

export const createDashboardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  layout: layout.optional(),
  widgets: z.array(widget).max(24).optional(),
  sharedWith: sharedWith.optional(),
  isDefault: z.boolean().optional(),
});

export const updateDashboardSchema = createDashboardSchema.partial();

const metrics = z.enum(['itemCount', 'points', 'timeSpent', 'custom']);
const goalStatus = z.enum(['on_track', 'at_risk', 'off_track', 'done']);

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  metric: metrics,
  target: z.number().min(0),
  current: z.number().min(0).optional(),
  unit: z.string().max(30).optional(),
  ownerId: objectId.nullable().optional(),
  linkedItemIds: z.array(objectId).max(100).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  status: goalStatus.optional(),
});

export const updateGoalSchema = createGoalSchema.partial();

export const progressSchema = z.object({
  current: z.number().min(0),
});

export const listGoalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  status: goalStatus.optional(),
});

export const listDashboardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});
