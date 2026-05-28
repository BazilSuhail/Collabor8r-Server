import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireOrgRole } from '../../middleware/orgRole.js';
import { validate } from '../../middleware/validate.js';
import { makeOrgCrud } from '../../utils/crud.js';
import { OrgGroup } from '../../models/index.js';
import {
  acceptInviteSchema,
  changeOrgRoleSchema,
  createJoinRequestSchema,
  createOrgGroupSchema,
  createOrgInviteSchema,
  createOrgSchema,
  decideSchema,
  listJoinRequestsQuerySchema,
  listMembersQuerySchema,
  updateOrgGroupSchema,
  updateOrgSchema,
} from './org.schemas.js';
import {
  acceptInvite,
  changeMemberRole,
  createInvite,
  createJoinRequest,
  createOrg,
  decideJoinRequest,
  deleteOrg,
  getOrg,
  listInvites,
  listJoinRequests,
  listMembers,
  listMyOrgs,
  removeMember,
  revokeInvite,
  updateOrg,
} from './org.controller.js';

const router = Router();

// Registered before /:orgId so the literal segment is not read as an id.
router.post('/invites/accept', auth, validate(acceptInviteSchema), acceptInvite);

router.get('/', auth, listMyOrgs);
router.post('/', auth, validate(createOrgSchema), createOrg);
router.get('/:orgId', auth, requireOrgRole('guest'), getOrg);
router.patch('/:orgId', auth, requireOrgRole('admin'), validate(updateOrgSchema), updateOrg);
router.delete('/:orgId', auth, requireOrgRole('owner'), deleteOrg);

router.get('/:orgId/members', auth, requireOrgRole('member'), validate(listMembersQuerySchema, 'query'), listMembers);
router.patch(
  '/:orgId/members/:userId',
  auth,
  requireOrgRole('admin'),
  validate(changeOrgRoleSchema),
  changeMemberRole,
);
// Minimum rank is viewer so any member can leave; the service enforces admin rank for other members.
router.delete('/:orgId/members/:userId', auth, requireOrgRole('viewer'), removeMember);

router.get('/:orgId/invites', auth, requireOrgRole('admin'), listInvites);
router.post('/:orgId/invites', auth, requireOrgRole('admin'), validate(createOrgInviteSchema), createInvite);
router.delete('/:orgId/invites/:inviteId', auth, requireOrgRole('admin'), revokeInvite);

router.get(
  '/:orgId/join-requests',
  auth,
  requireOrgRole('admin'),
  validate(listJoinRequestsQuerySchema, 'query'),
  listJoinRequests,
);
// The path segment may be an org id or slug, so no org guard here.
router.post('/:orgId/join-requests', auth, validate(createJoinRequestSchema), createJoinRequest);
router.post(
  '/:orgId/join-requests/:requestId/decide',
  auth,
  requireOrgRole('admin'),
  validate(decideSchema),
  decideJoinRequest,
);

router.use(
  '/:orgId/groups',
  makeOrgCrud({
    Model: OrgGroup,
    name: 'group',
    createSchema: createOrgGroupSchema,
    updateSchema: updateOrgGroupSchema,
    searchFields: ['name'],
    roles: { read: 'member', create: 'admin', update: 'admin', remove: 'admin' },
    beforeCreate: async (req, body) => ({ ...body, memberCount: 0, memberIds: [] }),
  }),
);

export default router;
