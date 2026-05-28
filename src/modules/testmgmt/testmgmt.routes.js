import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { makeProjectCrud } from '../../utils/crud.js';
import { asyncHandler, ok, created } from '../../utils/http.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import { TestCase, TestRun } from '../../models/index.js';
import { randomToken } from '../../utils/helpers.js';
import * as s from './testmgmt.schemas.js';
import * as svc from './testmgmt.service.js';

const router = Router({ mergeParams: true });
const viewer = [auth, requireProjectRole('viewer')];
const developer = [auth, requireProjectRole('developer')];

router.get('/test-runs/:runId/results', ...viewer, validate(pageQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listResults(req.project._id, req.params.runId, req.valid.query);
  ok(res, items, meta);
}));

router.get('/test-runs/:runId/results/:resultId', ...viewer, asyncHandler(async (req, res) => {
  ok(res, await svc.getResult(req.project._id, req.params.runId, req.params.resultId));
}));

router.delete('/test-runs/:runId/results/:resultId', auth, requireProjectRole('lead'), asyncHandler(async (req, res) => {
  ok(res, await svc.deleteResult(req.project._id, req.params.runId, req.params.resultId));
}));

router.post('/test-runs/:runId/results', ...developer, validate(s.createTestResultSchema), asyncHandler(async (req, res) => {
  created(res, await svc.upsertResult(req.project._id, req.user.id, req.params.runId, req.valid.body));
}));

router.post('/test-runs/:runId/complete', ...developer, asyncHandler(async (req, res) => {
  ok(res, await svc.completeRun(req.project._id, req.params.runId));
}));

router.use('/test-cases', makeProjectCrud({
  Model: TestCase,
  name: 'testCase',
  createSchema: s.createTestCaseSchema,
  updateSchema: s.updateTestCaseSchema,
  filterFields: ['folderId', 'status', 'lastResult'],
  searchFields: ['title', 'key'],
  beforeCreate: async (req, body) => {
    if (body.key) return body;
    const count = await TestCase.countDocuments({ projectId: req.project._id });
    return { ...body, key: `TC-${count + 1}-${randomToken(3)}` };
  },
}));

router.use('/test-runs', makeProjectCrud({
  Model: TestRun,
  name: 'testRun',
  createSchema: s.createTestRunSchema,
  updateSchema: s.updateTestRunSchema,
  filterFields: ['status'],
  searchFields: ['name'],
  beforeCreate: async (req, body) => ({
    ...body,
    status: body.status ?? 'planned',
    counts: { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 },
    createdBy: req.user.id,
  }),
}));

export default router;
