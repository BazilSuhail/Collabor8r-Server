import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './history.controller.js';

// Mounted at /api/projects/:projectId/issues/:issueId/history
const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(pageQuerySchema, 'query'), c.listHistory);

export default router;
