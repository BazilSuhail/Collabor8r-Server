import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const score = z.number().int().min(1).max(5);

export const createRiskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
  probability: score,
  impact: score,
  status: z.enum(['open', 'mitigating', 'accepted', 'closed']).optional(),
  ownerId: objectId.nullable().optional(),
  mitigation: z.string().max(5000).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  reviewDate: z.coerce.date().nullable().optional(),
  linkedItemIds: z.array(objectId).max(100).optional(),
});

export const updateRiskSchema = createRiskSchema.partial();
