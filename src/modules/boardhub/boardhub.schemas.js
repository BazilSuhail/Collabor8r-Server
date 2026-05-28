import { z } from 'zod';

export const orderSchema = z.object({
  projectIds: z.array(z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')).max(200),
});
