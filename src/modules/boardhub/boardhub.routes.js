import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './boardhub.controller.js';
import * as s from './boardhub.schemas.js';

const router = Router();

router.get('/projects', auth, c.listProjects);
router.put('/order', auth, validate(s.orderSchema), c.saveOrder);
router.get('/projects/:projectId/issues', auth, requireProjectRole('guest'), c.projectIssues);

export default router;
