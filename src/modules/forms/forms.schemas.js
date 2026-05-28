import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const field = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  type: z.enum(['text', 'longText', 'number', 'email', 'select', 'multiSelect', 'date', 'checkbox']),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
  helpText: z.string().max(500).optional(),
});

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  fields: z.array(field).max(40).optional(),
  issueTypeId: objectId,
  defaultPriorityId: objectId.nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const updateFormSchema = createFormSchema.partial();

export const submitFormSchema = z.object({
  answers: z.record(z.string(), z.any()),
  submitterName: z.string().trim().max(120).optional(),
  submitterEmail: z.email().max(254).optional(),
  website: z.string().max(200).optional(),
});
