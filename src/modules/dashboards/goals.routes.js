import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './dashboards.controller.js';
import * as s from './dashboards.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(s.listGoalsQuerySchema, 'query'), c.listGoals);
router.post('/', auth, requireProjectRole('lead'), validate(s.createGoalSchema), c.createGoal);
router.get('/:goalId', auth, requireProjectRole('viewer'), c.getGoal);
router.patch('/:goalId', auth, requireProjectRole('lead'), validate(s.updateGoalSchema), c.updateGoal);
router.delete('/:goalId', auth, requireProjectRole('lead'), c.deleteGoal);
router.post('/:goalId/progress', auth, requireProjectRole('developer'), validate(s.progressSchema), c.recordProgress);

export default router;
