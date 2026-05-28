import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireOrgRole } from '../../middleware/orgRole.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './project.controller.js';
import * as s from './project.schemas.js';

const router = Router();

// Self may remove own membership; removing anyone else needs admin.
const selfOrAdmin = (req, res, next) => (
  req.params.userId === req.user.id ? requireProjectRole('guest') : requireProjectRole('admin')
)(req, res, next);

router.get('/orgs/:orgId/projects', auth, requireOrgRole('guest'), validate(s.listProjectsQuerySchema, 'query'), c.listOrgProjects);
router.post('/orgs/:orgId/projects', auth, requireOrgRole('member'), validate(s.createProjectSchema), c.createOrgProject);

router.get('/projects/personal', auth, c.listPersonalProjects);
router.post('/projects/personal', auth, validate(s.createProjectSchema), c.createPersonalProject);
router.post('/projects/invites/accept', auth, validate(s.acceptInviteSchema), c.acceptProjectInvite);

router.get('/projects/:projectId', auth, requireProjectRole('guest'), c.getProject);
router.patch('/projects/:projectId', auth, requireProjectRole('admin'), validate(s.updateProjectSchema), c.updateProject);
router.delete('/projects/:projectId', auth, requireProjectRole('admin'), c.archiveProject);

router.get('/projects/:projectId/members', auth, requireProjectRole('viewer'), validate(s.memberListQuerySchema, 'query'), c.listProjectMembers);
router.post('/projects/:projectId/members', auth, requireProjectRole('admin'), validate(s.addProjectMemberSchema), c.addProjectMember);
router.patch('/projects/:projectId/members/:userId', auth, requireProjectRole('admin'), validate(s.changeProjectRoleSchema), c.changeProjectRole);
router.delete('/projects/:projectId/members/:userId', auth, selfOrAdmin, c.removeProjectMember);

router.get('/projects/:projectId/invites', auth, requireProjectRole('admin'), validate(s.listInvitesQuerySchema, 'query'), c.listProjectInvites);
router.post('/projects/:projectId/invites', auth, requireProjectRole('admin'), validate(s.createProjectInviteSchema), c.createProjectInvite);
router.delete('/projects/:projectId/invites/:inviteId', auth, requireProjectRole('admin'), c.revokeProjectInvite);

router.get('/projects/:projectId/join-requests', auth, requireProjectRole('admin'), validate(s.listJoinRequestsQuerySchema, 'query'), c.listJoinRequests);
router.post('/projects/:projectId/join-requests', auth, validate(s.createJoinRequestSchema), c.createJoinRequest);
router.post('/projects/:projectId/join-requests/:requestId/decide', auth, requireProjectRole('admin'), validate(s.decideJoinRequestSchema), c.decideJoinRequest);

export default router;
