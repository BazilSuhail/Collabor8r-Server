import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const lang = z.string().trim().min(2).max(12);

export const createCatEntrySchema = z.object({
  sourceText: z.string().trim().min(1).max(5000),
  targetText: z.string().max(5000).optional(),
  sourceLang: lang,
  targetLang: lang,
  status: z.enum(['draft', 'reviewed', 'approved']).optional(),
  ownerId: objectId.nullable().optional(),
  glossaryTermIds: z.array(objectId).max(100).optional(),
});

export const updateCatEntrySchema = createCatEntrySchema.partial();

export const createCatTermSchema = z.object({
  term: z.string().trim().min(1).max(120),
  definition: z.string().max(1000).optional(),
  language: lang,
  forbidden: z.boolean().optional(),
});

export const updateCatTermSchema = createCatTermSchema.partial();
