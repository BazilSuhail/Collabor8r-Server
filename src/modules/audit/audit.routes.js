import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireOrgRole } from '../../middleware/orgRole.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './audit.controller.js';

const router = Router();

router.get('/orgs/:orgId/audit', auth, requireOrgRole('admin'), validate(c.auditQuerySchema, 'query'), c.listOrgAudit);
router.get('/projects/:projectId/audit', auth, requireProjectRole('admin'), validate(c.auditQuerySchema, 'query'), c.listProjectAudit);

export default router;
