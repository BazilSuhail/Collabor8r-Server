import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const templates = z.enum(['meetingNotes', 'prd', 'retro', 'rfc']).nullable();

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9]{1,9}$/).optional(),
  description: z.string().max(2000).optional(),
  iconUrl: z.string().max(500).optional(),
  visibility: z.enum(['project', 'org', 'private']).optional(),
});

export const updateSpaceSchema = createSpaceSchema.omit({ key: true }).partial().extend({
  homePageId: objectId.nullable().optional(),
});

export const listPagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  spaceId: objectId,
  parentId: z.union([objectId, z.literal('root')]).optional(),
});

export const createPageSchema = z.object({
  spaceId: objectId,
  parentId: objectId.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).optional(),
  body: z.any().optional(),
  icon: z.string().max(100).optional(),
  coverUrl: z.string().max(500).optional(),
  template: templates.optional(),
  isTemplate: z.boolean().optional(),
  status: z.enum(['draft', 'published']).optional(),
  position: z.number().int().min(0).optional(),
  relatedItemIds: z.array(objectId).max(30).optional(),
  changeSummary: z.string().max(300).optional(),
});

export const updatePageSchema = createPageSchema.omit({ spaceId: true }).partial().extend({
  template: templates.optional(),
  version: z.number().int().min(1).optional(),
});

export { templates };
