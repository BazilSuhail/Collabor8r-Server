import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './reports.controller.js';

const router = Router({ mergeParams: true });
const read = [auth, requireProjectRole('viewer')];
const query = validate(c.reportQuerySchema, 'query');

router.get('/summary', ...read, c.getSummary);
router.get('/created-vs-resolved', ...read, query, c.getCreatedVsResolved);
router.get('/burndown', ...read, query, c.getBurndown);
router.get('/velocity', ...read, c.getVelocity);
router.get('/time-spent', ...read, query, c.getTimeSpent);
router.get('/workload', ...read, c.getWorkload);

export default router;
