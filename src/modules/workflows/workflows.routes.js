import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './workflows.controller.js';
import * as s from './workflows.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(s.listWorkflowsQuerySchema, 'query'), c.listWorkflows);
router.post('/', auth, requireProjectRole('admin'), validate(s.createWorkflowSchema), c.createWorkflow);
router.get('/:workflowId', auth, requireProjectRole('viewer'), c.getWorkflow);
router.patch('/:workflowId', auth, requireProjectRole('admin'), validate(s.updateWorkflowSchema), c.updateWorkflow);
router.post('/:workflowId/publish', auth, requireProjectRole('admin'), c.publishWorkflow);
router.delete('/:workflowId', auth, requireProjectRole('admin'), c.deleteWorkflow);

export default router;
