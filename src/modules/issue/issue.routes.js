import { Router } from 'express';
import { auth, authOrToken, requireScope } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './issue.controller.js';
import * as s from './issue.schemas.js';

const router = Router({ mergeParams: true });

const read = (min = 'viewer') => [authOrToken, requireProjectRole(min), requireScope('issues:read')];
const write = (min) => [authOrToken, requireProjectRole(min), requireScope('issues:write')];
const params = validate(s.issueParamsSchema, 'params');

router.get('/', ...read(), validate(s.listIssuesQuerySchema, 'query'), c.listIssues);
router.post('/', ...write('reporter'), validate(s.createIssueSchema), c.createIssue);
router.get('/by-key/:key', ...read(), validate(s.issueKeyParamsSchema, 'params'), c.getIssueByKey);
router.post('/bulk', auth, requireProjectRole('developer'), validate(s.bulkUpdateSchema), c.bulkUpdate);
router.get('/:issueId/children', auth, requireProjectRole('viewer'), params, c.listChildren);
router.get('/:issueId', ...read(), params, c.getIssue);
router.patch('/:issueId', ...write('reporter'), params, validate(s.updateIssueSchema), c.updateIssue);
router.post('/:issueId/transition', ...write('developer'), params, validate(s.transitionSchema), c.transitionIssue);
router.delete('/:issueId', auth, requireProjectRole('lead'), params, c.deleteIssue);

export default router;
