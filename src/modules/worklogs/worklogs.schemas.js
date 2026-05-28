import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const worklogFields = {
  seconds: z.number().int().min(1).max(86400 * 366),
  startedAt: z.coerce.date(),
  date: z.coerce.date(),
  billable: z.boolean(),
  comment: z.string().trim().max(2000),
};

export const createWorklogSchema = z.object({
  seconds: worklogFields.seconds,
  startedAt: worklogFields.startedAt.optional(),
  date: worklogFields.date.optional(),
  billable: worklogFields.billable.optional(),
  comment: worklogFields.comment.optional(),
  source: z.enum(['timer', 'manual']).optional(),
  adjustRemaining: z.boolean().optional(),
});

export const updateWorklogSchema = z.object({
  seconds: worklogFields.seconds.optional(),
  startedAt: worklogFields.startedAt.optional(),
  date: worklogFields.date.optional(),
  billable: worklogFields.billable.optional(),
  comment: worklogFields.comment.optional(),
});

export const worklogParamsSchema = z.object({
  projectId: objectId,
  issueId: objectId,
  worklogId: objectId,
});

export const timesheetQuerySchema = pageQuerySchema.extend({
  userId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
