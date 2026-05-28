import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const uploadUrlSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mime: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

export const createAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  mime: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  thumbnailKey: z.string().max(512).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  commentId: objectId.nullable().optional(),
});

export const attachmentListQuerySchema = pageQuerySchema;

export const attachmentParamsSchema = z.object({
  projectId: objectId,
  issueId: objectId,
  attachmentId: objectId,
});
