import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import { PROJECT_ROLES } from '../../config/constants.js';

const visibility = z.enum(['private', 'request', 'open']);
const defaultView = z.enum(['board', 'backlog', 'list', 'timeline']);
const roleFields = { role: z.enum(PROJECT_ROLES).optional(), roleId: objectId.optional() };
const hasRole = (v) => Boolean(v.role || v.roleId);
const roleMsg = { message: 'role or roleId is required' };

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().regex(/^[A-Za-z]{2,10}$/, 'key must be 2-10 letters'),
  description: z.string().max(2000).optional(),
  headline: z.string().max(200).optional(),
  template: z.enum(['scrum', 'kanban', 'bug', 'service', 'blank']).optional(),
  visibility: visibility.optional(),
  defaultView: defaultView.optional(),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  themeKey: z.string().max(20).nullable().optional(),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  headline: z.string().max(200).optional(),
  visibility: visibility.optional(),
  defaultView: defaultView.optional(),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  themeKey: z.string().max(20).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  leadId: objectId.nullable().optional(),
  health: z.enum(['on_track', 'at_risk', 'off_track', 'not_set']).optional(),
  healthNote: z.string().max(500).optional(),
});

export const listProjectsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['active', 'archived']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const memberListQuerySchema = pageQuerySchema.extend({
  status: z.enum(['active', 'suspended', 'invited', 'requested', 'removed']).optional(),
});

export const addProjectMemberSchema = z.object({ userId: objectId, ...roleFields }).refine(hasRole, roleMsg);
export const changeProjectRoleSchema = z.object(roleFields).refine(hasRole, roleMsg);

export const createProjectInviteSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(PROJECT_ROLES).optional(),
  message: z.string().max(500).optional(),
});

export const listInvitesQuerySchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});

export const acceptInviteSchema = z.object({ token: z.string().min(16).max(200) });

export const createJoinRequestSchema = z.object({
  requestedRole: z.enum(['developer', 'reporter', 'viewer']).optional(),
  message: z.string().max(500).optional(),
});

export const listJoinRequestsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'declined']).optional(),
});

export const decideJoinRequestSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  declineReason: z.string().max(500).optional(),
});
