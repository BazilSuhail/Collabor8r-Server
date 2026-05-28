import { z } from 'zod';
import { ORG_ROLES } from '../../config/constants.js';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const text = (max) => z.string().trim().max(max);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const SIZES = ['1-10', '11-50', '51-200', '201+'];
const nonEmpty = (d) => Object.keys(d).length > 0;

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: text(500).optional(),
  industry: text(80).optional(),
  size: z.enum(SIZES).optional(),
});

export const updateOrgSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: text(500),
    website: text(300),
    industry: text(80),
    size: z.enum(SIZES),
    logoUrl: text(500),
    coverUrl: text(500),
    billingEmail: email,
    joinApproval: z.enum(['none', 'admin']),
    projectCreation: z.enum(['anyMember', 'adminsOnly']),
    defaultProjectVisibility: z.enum(['private', 'request', 'open']),
    verifiedDomains: z.array(z.string().trim().toLowerCase().max(253)).max(20),
    require2fa: z.boolean(),
    ipAllowlist: z.array(text(64)).max(50),
    aiEnabled: z.boolean(),
    aiKeepPromptHashes: z.boolean(),
  })
  .partial()
  .refine(nonEmpty, { message: 'At least one field is required' });

export const changeOrgRoleSchema = z.object({
  role: z.enum(ORG_ROLES),
});

// Owners are never invited directly.
export const createOrgInviteSchema = z.object({
  email,
  role: z.enum(['admin', 'member', 'guest', 'viewer']),
  projectIds: z.array(objectId).max(50).optional(),
  message: text(500).optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(16).max(200),
});

export const createJoinRequestSchema = z.object({
  message: text(500).optional(),
});

export const decideSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  role: z.enum(['member', 'guest', 'viewer']).optional(),
  declineReason: text(300).optional(),
});

export const createOrgGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: text(300).optional(),
  color: text(20).optional(),
});

export const updateOrgGroupSchema = createOrgGroupSchema.partial();

export const listMembersQuerySchema = pageQuerySchema.extend({
  role: z.enum(ORG_ROLES).optional(),
  q: text(100).optional(),
});

export const listJoinRequestsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'declined']).optional(),
});
