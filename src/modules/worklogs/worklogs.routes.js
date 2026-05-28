import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './worklogs.controller.js';
import * as s from './worklogs.schemas.js';

// Mounted at /api/projects/:projectId
const router = Router({ mergeParams: true });
const params = validate(s.worklogParamsSchema, 'params');

router.get('/issues/:issueId/worklogs', auth, requireProjectRole('viewer'), validate(pageQuerySchema, 'query'), c.listWorklogs);
router.post('/issues/:issueId/worklogs', auth, requireProjectRole('developer'), validate(s.createWorklogSchema), c.createWorklog);
router.patch(
  '/issues/:issueId/worklogs/:worklogId',
  auth,
  requireProjectRole('developer'),
  params,
  validate(s.updateWorklogSchema),
  c.updateWorklog
);
router.delete('/issues/:issueId/worklogs/:worklogId', auth, requireProjectRole('developer'), params, c.deleteWorklog);
router.get('/worklogs', auth, requireProjectRole('viewer'), validate(s.timesheetQuerySchema, 'query'), c.listTimesheet);

export default router;
