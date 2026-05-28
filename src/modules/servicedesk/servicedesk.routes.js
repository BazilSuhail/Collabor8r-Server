import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { makeProjectCrud } from '../../utils/crud.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import { Customer, RequestType, SlaPolicy } from '../../models/index.js';
import * as c from './servicedesk.controller.js';
import * as s from './servicedesk.schemas.js';

const router = Router({ mergeParams: true });
const viewer = [auth, requireProjectRole('viewer')];
const developer = [auth, requireProjectRole('developer')];
const lead = [auth, requireProjectRole('lead')];

router.use('/customers', makeProjectCrud({
  Model: Customer,
  name: 'customer',
  createSchema: s.createCustomerSchema,
  updateSchema: s.updateCustomerSchema,
  filterFields: ['company'],
  searchFields: ['name', 'email', 'company'],
  roles: { read: 'viewer', create: 'developer', update: 'developer', remove: 'developer' },
}));

router.use('/request-types', makeProjectCrud({
  Model: RequestType,
  name: 'requestType',
  createSchema: s.createRequestTypeSchema,
  updateSchema: s.updateRequestTypeSchema,
  filterFields: ['isActive'],
  searchFields: ['name'],
  roles: { read: 'viewer', create: 'lead', update: 'lead', remove: 'lead' },
}));

router.use('/sla-policies', makeProjectCrud({
  Model: SlaPolicy,
  name: 'slaPolicy',
  createSchema: s.createSlaPolicySchema,
  updateSchema: s.updateSlaPolicySchema,
  searchFields: ['name'],
  roles: { read: 'viewer', create: 'lead', update: 'lead', remove: 'lead' },
  afterWrite: async (req, doc) => {
    if (doc.isDefault) await SlaPolicy.updateMany({ projectId: req.project._id, _id: { $ne: doc._id }, isDefault: true }, { $set: { isDefault: false } });
  },
}));

router.get('/sla-timers', ...viewer, validate(s.slaTimerQuerySchema, 'query'), c.listSlaTimers);
router.post('/sla-timers/:timerId/pause', ...developer, c.pauseTimer);
router.post('/sla-timers/:timerId/resume', ...developer, c.resumeTimer);

router.get('/issues/:issueId/approvals', ...viewer, validate(pageQuerySchema, 'query'), c.listApprovals);
router.post('/issues/:issueId/approvals', ...developer, validate(s.createApprovalSchema), c.requestApprovals);
router.post('/approvals/:approvalId/decide', auth, requireProjectRole('guest'), validate(s.decideApprovalSchema), c.decideApproval);

export default router;
