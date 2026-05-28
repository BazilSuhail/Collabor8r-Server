import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const dateRange = (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
const rangeMsg = { message: 'endDate must be on or after startDate' };

export const createSprintSchema = z.object({
  boardId: objectId,
  name: z.string().trim().min(1).max(120),
  goal: z.string().max(500).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  capacityHours: z.number().min(0).max(100000).optional(),
}).refine(dateRange, rangeMsg);

export const updateSprintSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().max(500).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  capacityHours: z.number().min(0).max(100000).nullable().optional(),
  retroNote: z.string().max(2000).optional(),
});

// Body is optional; dates default to the sprint's stored values.
export const startSprintSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(dateRange, rangeMsg).default({});

// carryOver: 'backlog' moves unresolved issues to no sprint; an id moves them to that sprint.
export const completeSprintSchema = z.object({
  carryOver: z.union([z.literal('backlog'), objectId]).default('backlog'),
  retroNote: z.string().max(2000).optional(),
}).default({});

export const listSprintsQuerySchema = pageQuerySchema.extend({
  state: z.enum(['planned', 'active', 'closed']).optional(),
  boardId: objectId.optional(),
});
