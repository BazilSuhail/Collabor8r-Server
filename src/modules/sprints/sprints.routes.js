import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './sprints.controller.js';
import * as s from './sprints.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(s.listSprintsQuerySchema, 'query'), c.listSprints);
router.post('/', auth, requireProjectRole('lead'), validate(s.createSprintSchema), c.createSprint);
router.get('/:sprintId', auth, requireProjectRole('viewer'), c.getSprint);
router.patch('/:sprintId', auth, requireProjectRole('lead'), validate(s.updateSprintSchema), c.updateSprint);
router.post('/:sprintId/start', auth, requireProjectRole('lead'), validate(s.startSprintSchema), c.startSprint);
router.post('/:sprintId/complete', auth, requireProjectRole('lead'), validate(s.completeSprintSchema), c.completeSprint);
router.delete('/:sprintId', auth, requireProjectRole('lead'), c.deleteSprint);

export default router;
