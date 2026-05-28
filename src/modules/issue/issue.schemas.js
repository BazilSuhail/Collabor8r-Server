import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const checklistItem = z.object({
  id: z.string().max(64).optional(),
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
});

// Shared issue fields. Status is never writable through create or patch.
const fields = {
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().max(500),
  description: z.any(),
  parentId: objectId.nullable(),
  epicId: objectId.nullable(),
  priorityId: objectId.nullable(),
  assigneeId: objectId.nullable(),
  watcherIds: z.array(objectId).max(200),
  sprintId: objectId.nullable(),
  releaseIds: z.array(objectId).max(10),
  componentIds: z.array(objectId).max(10),
  labels: z.array(z.string().trim().min(1).max(50)).max(20),
  storyPoints: z.number().min(0).max(100000).nullable(),
  estimateSec: z.number().int().min(0).nullable(),
  remainingSec: z.number().int().min(0).nullable(),
  startDate: z.coerce.date().nullable(),
  dueDate: z.coerce.date().nullable(),
  checklist: z.array(checklistItem).max(50),
  customFields: z.record(z.string(), z.any()),
  isPrivate: z.boolean(),
  allowedUserIds: z.array(objectId).max(200),
  status: z.never().optional(),
  statusId: z.never().optional(),
};

const patchShape = z.object(fields).partial();

export const createIssueSchema = z
  .object({ typeId: objectId })
  .extend(patchShape.shape)
  .extend({ title: fields.title });

export const updateIssueSchema = patchShape.extend({
  version: z.number().int().min(0).optional(),
});

export const transitionSchema = z
  .object({
    transitionId: z.string().min(1).max(100).optional(),
    toStatus: z.string().min(1).max(100).optional(),
    fields: z.record(z.string(), z.any()).optional(),
  })
  .refine((b) => b.transitionId || b.toStatus, { message: 'transitionId or toStatus is required' });

export const bulkUpdateSchema = z.object({
  issueIds: z.array(objectId).min(1).max(100),
  patch: patchShape,
});

export const listIssuesQuerySchema = pageQuerySchema.extend({
  status: z.string().max(60).optional(),
  assignee: z.string().max(40).optional(),
  sprint: z.string().max(40).optional(),
  epic: objectId.optional(),
  label: z.string().max(50).optional(),
  type: objectId.optional(),
  q: z.string().trim().max(200).optional(),
  savedFilter: objectId.optional(),
});

export const issueParamsSchema = z.object({ projectId: objectId, issueId: objectId });

export const issueKeyParamsSchema = z.object({
  projectId: objectId,
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/),
});

export const myWorkQuerySchema = pageQuerySchema.extend({
  projectId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
