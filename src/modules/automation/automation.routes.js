import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './automation.controller.js';
import * as s from './automation.schemas.js';

const router = Router({ mergeParams: true });
const read = [auth, requireProjectRole('viewer')];
const admin = [auth, requireProjectRole('admin')];

router.get('/rules', ...read, validate(pageQuerySchema, 'query'), c.listRules);
router.post('/rules', ...admin, validate(s.createRuleSchema), c.createRule);
router.get('/rules/:ruleId', ...read, c.getRule);
router.patch('/rules/:ruleId', ...admin, validate(s.updateRuleSchema), c.updateRule);
router.delete('/rules/:ruleId', ...admin, c.deleteRule);
router.post('/rules/:ruleId/toggle', ...admin, c.toggleRule);
router.post('/rules/:ruleId/run', ...admin, validate(s.manualRunSchema), c.runRule);
router.get('/rules/:ruleId/runs', ...read, validate(s.listRunsQuerySchema, 'query'), c.listRuleRuns);
router.get('/runs', ...read, validate(s.listRunsQuerySchema, 'query'), c.listRuns);

export default router;
