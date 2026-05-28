import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const step = z.object({
  action: z.string().trim().min(1).max(1000),
  expected: z.string().max(1000).optional(),
});

export const createTestCaseSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  folderId: objectId.nullable().optional(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().max(2000).optional(),
  steps: z.array(step).max(50).optional(),
  precondition: z.string().max(2000).optional(),
  priority: z.string().max(40).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  status: z.enum(['draft', 'ready', 'deprecated']).optional(),
  automationStatus: z.enum(['manual', 'automated', 'planned']).optional(),
  linkedItemIds: z.array(objectId).max(100).optional(),
  ownerId: objectId.nullable().optional(),
});

export const updateTestCaseSchema = createTestCaseSchema.partial();

export const createTestRunSchema = z.object({
  name: z.string().trim().min(1).max(200),
  environment: z.string().max(120).optional(),
  buildVersion: z.string().max(120).optional(),
  status: z.enum(['planned', 'inProgress', 'completed']).optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

export const updateTestRunSchema = createTestRunSchema.partial();

export const createTestResultSchema = z.object({
  caseId: objectId,
  status: z.enum(['passed', 'failed', 'blocked', 'skipped']),
  notes: z.string().max(5000).optional(),
  durationSec: z.number().int().min(0).optional(),
  bugItemId: objectId.nullable().optional(),
});
