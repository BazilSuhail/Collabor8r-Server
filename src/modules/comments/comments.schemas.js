import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(20000),
  internal: z.boolean().optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(20000),
});

export const commentListQuerySchema = pageQuerySchema;

export const commentParamsSchema = z.object({
  projectId: objectId,
  issueId: objectId,
  commentId: objectId,
});
