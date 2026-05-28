import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const providers = z.enum(['github', 'gitlab', 'bitbucket', 'slack', 'teams', 'google', 'jira_import']);

export const createIntegrationSchema = z.object({
  provider: providers,
  displayName: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.any()).optional(),
});

export const updateIntegrationSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export const createIntegrationLinkSchema = z.object({
  issueId: objectId,
  externalType: z.enum(['commit', 'pullRequest', 'build', 'deploy', 'message']),
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300).optional(),
  url: z.string().max(2000).optional(),
  status: z.enum(['open', 'merged', 'closed', 'passed', 'failed', 'success']).optional(),
  author: z.string().max(120).optional(),
  at: z.coerce.date().optional(),
});

export const listLinksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  issueId: objectId.optional(),
});
