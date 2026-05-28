import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

export const AI_KINDS = ['issueFromText', 'summarize', 'subtasks', 'wikiOutline', 'issueFill', 'findIssues'];

export const createDraftSchema = z.object({
  kind: z.enum(AI_KINDS),
  projectId: objectId,
  text: z.string().trim().min(1).max(8000),
  contextIds: z.array(objectId).max(20).optional(),
}).refine((d) => d.kind !== 'subtasks' || (d.contextIds?.length ?? 0) > 0, {
  message: 'subtasks needs the parent issue id in contextIds',
  path: ['contextIds'],
});

export const acceptDraftSchema = z.object({
  edits: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(8000).optional(),
    typeId: objectId.optional(),
    items: z.array(z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().max(4000).optional(),
    })).max(8).optional(),
  }).optional(),
});
