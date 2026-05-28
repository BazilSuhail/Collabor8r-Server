import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { writeAudit } from '../../services/audit.service.js';
import * as svc from './automation.service.js';
import { runRuleManually } from './automation.runner.js';

const audit = (req, action, rule, after) => writeAudit({
  req,
  orgId: req.project.orgId ?? null,
  projectId: req.project._id,
  action,
  targetType: 'automationRule',
  targetId: rule._id,
  targetName: rule.name,
  after,
});

export const listRules = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listRules(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createRule = asyncHandler(async (req, res) => {
  const rule = await svc.createRule(req.project._id, req.user.id, req.valid.body);
  await audit(req, 'automation.created', rule, req.valid.body);
  created(res, rule);
});

export const getRule = asyncHandler(async (req, res) => {
  ok(res, await svc.getRule(req.project._id, req.params.ruleId));
});

export const updateRule = asyncHandler(async (req, res) => {
  const rule = await svc.updateRule(req.project._id, req.params.ruleId, req.valid.body);
  await audit(req, 'automation.updated', rule, req.valid.body);
  ok(res, rule);
});

export const deleteRule = asyncHandler(async (req, res) => {
  const rule = await svc.getRule(req.project._id, req.params.ruleId);
  await svc.deleteRule(req.project._id, req.params.ruleId);
  await audit(req, 'automation.deleted', rule);
  noContent(res);
});

export const toggleRule = asyncHandler(async (req, res) => {
  const rule = await svc.toggleRule(req.project._id, req.params.ruleId);
  await audit(req, 'automation.toggled', rule, { enabled: rule.enabled });
  ok(res, rule);
});

export const runRule = asyncHandler(async (req, res) => {
  const rule = await svc.getRule(req.project._id, req.params.ruleId);
  const { run, matched, log } = await runRuleManually(rule, req.valid.body.issueId, req.user.id);
  ok(res, { run, matched, log });
});

export const listRuleRuns = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listRuleRuns(req.project._id, req.params.ruleId, req.valid.query);
  paged(res, items, meta);
});

export const listRuns = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listRuns(req.project._id, req.valid.query);
  paged(res, items, meta);
});
