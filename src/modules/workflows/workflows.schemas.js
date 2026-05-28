import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const statusInput = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(1).max(60),
  category: z.enum(['todo', 'inprogress', 'done']),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
  description: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Validator, condition and post-action rules; supported types are checked in the service.
const rule = z.object({
  type: z.string().min(1).max(40),
  field: z.string().max(120).optional(),
  roles: z.array(z.string().max(40)).max(10).optional(),
  resolutionId: objectId.optional(),
});

const transitionInput = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(1).max(60),
  from: z.array(objectId).min(1).max(50),
  to: objectId,
  screenFields: z.array(z.string().max(120)).max(50).optional(),
  requiredFields: z.array(z.string().max(120)).max(50).optional(),
  conditions: z.array(rule).max(20).optional(),
  validators: z.array(rule).max(20).optional(),
  postActions: z.array(rule).max(20).optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  statuses: z.array(statusInput).max(50).optional(),
  transitions: z.array(transitionInput).max(200).optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  statuses: z.array(statusInput).max(50).optional(),
  transitions: z.array(transitionInput).max(200).optional(),
});

export const listWorkflowsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['draft', 'live']).optional(),
});
