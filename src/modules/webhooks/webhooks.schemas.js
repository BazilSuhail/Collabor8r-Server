import { z } from 'zod';
import { EVENT_TYPES } from '../../config/constants.js';
import { checkWebhookUrlSyntax } from './webhooks.ssrf.js';

export const createWebhookSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.url().max(2000).superRefine((val, ctx) => {
    const msg = checkWebhookUrlSyntax(val);
    if (msg) ctx.addIssue({ code: 'custom', message: msg });
  }),
  events: z.array(z.enum(EVENT_TYPES)).min(1).max(EVENT_TYPES.length),
  active: z.boolean().optional(),
});

export const updateWebhookSchema = createWebhookSchema.partial();
