import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

export const createCustomerSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  company: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  avatarUrl: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createRequestTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  icon: z.string().max(60).optional(),
  formId: objectId.nullable().optional(),
  issueTypeId: objectId,
  slaPolicyId: objectId.nullable().optional(),
  approvalRequired: z.boolean().optional(),
  approverIds: z.array(objectId).max(20).optional(),
  defaultPriorityId: objectId.nullable().optional(),
  defaultAssigneeId: objectId.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateRequestTypeSchema = createRequestTypeSchema.partial();

const targets = z.object({
  firstResponseMinutes: z.number().int().min(0).nullable().optional(),
  resolutionMinutes: z.number().int().min(0).nullable().optional(),
});

const businessHours = z.object({
  timezone: z.string().max(64),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

export const createSlaPolicySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  targets: targets.optional(),
  businessHours: businessHours.optional(),
  pauseStatusIds: z.array(z.string().max(64)).max(20).optional(),
  escalateToUserId: objectId.nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const updateSlaPolicySchema = createSlaPolicySchema.partial();

export const createApprovalSchema = z.object({
  approverIds: z.array(objectId).min(1).max(20),
});

export const decideApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional(),
});

export const slaTimerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  status: z.enum(['running', 'paused', 'met', 'breached']).optional(),
  issueId: objectId.optional(),
});
