import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

export const createLinkSchema = z.object({
  targetIssueId: objectId,
  type: z.enum(['blocks', 'relates', 'duplicates', 'clones']),
});

export const linkParamsSchema = z.object({
  projectId: objectId,
  issueId: objectId,
  linkId: objectId,
});
