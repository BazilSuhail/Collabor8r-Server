import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const condition = z.object({
  field: z.string().trim().min(1).max(64),
  op: z.enum(['equals', 'notEquals', 'in', 'notIn', 'contains', 'isEmpty', 'isNotEmpty']),
  value: z.any().optional(),
});

const action = z.object({
  type: z.enum(['setField', 'transition', 'assign', 'addComment', 'addLabel', 'notify', 'webhook']),
  config: z.record(z.string(), z.any()).optional(),
});

const trigger = z.object({
  type: z.enum(['itemCreated', 'statusChanged', 'fieldChanged', 'commentAdded', 'prMerged', 'scheduled', 'dueSoon']),
  config: z.record(z.string(), z.any()).optional(),
});

export const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  trigger,
  conditions: z.array(condition).max(10).optional(),
  actions: z.array(action).min(1).max(10),
});

export const updateRuleSchema = createRuleSchema.partial();

export const manualRunSchema = z.object({
  issueId: objectId,
});

export const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  status: z.enum(['success', 'failed', 'skipped']).optional(),
});
