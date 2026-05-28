import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination.js';

const releaseStatus = z.enum(['planned', 'in_progress', 'released', 'archived']);

export const createReleaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  status: releaseStatus.optional(),
  startDate: z.coerce.date().optional(),
  releaseDate: z.coerce.date().optional(),
  releaseNotes: z.string().max(20000).optional(),
});

export const updateReleaseSchema = createReleaseSchema.partial();

export const listReleasesQuerySchema = pageQuerySchema.extend({
  status: releaseStatus.optional(),
});
