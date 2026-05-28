import mongoose from 'mongoose';
import { AutomationRule, AutomationRun } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { actorOf } from '../../services/activity.service.js';

const oid = (v) => new mongoose.Types.ObjectId(v);

async function ruleInProject(projectId, ruleId) {
  const rule = await AutomationRule.findOne({ _id: ruleId, projectId }).lean();
  if (!rule) throw new ApiError(404, 'Rule not found');
  return rule;
}

export function listRules(projectId, query) {
  return paginate(AutomationRule, { projectId }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function createRule(projectId, userId, body) {
  const author = await actorOf({ id: userId });
  const rule = await AutomationRule.create({
    ...body,
    projectId,
    createdBy: userId,
    createdByName: author.name,
    runCount: 0,
    errorCount: 0,
  });
  return rule.toObject();
}

export function getRule(projectId, ruleId) {
  return ruleInProject(projectId, ruleId);
}

export async function updateRule(projectId, ruleId, body) {
  await ruleInProject(projectId, ruleId);
  return AutomationRule.findOneAndUpdate({ _id: ruleId, projectId }, { $set: body }, { returnDocument: 'after', runValidators: true }).lean();
}

export async function deleteRule(projectId, ruleId) {
  await ruleInProject(projectId, ruleId);
  await AutomationRule.deleteOne({ _id: ruleId, projectId });
}

export async function toggleRule(projectId, ruleId) {
  const rule = await ruleInProject(projectId, ruleId);
  return AutomationRule.findOneAndUpdate({ _id: ruleId, projectId }, { $set: { enabled: !rule.enabled } }, { returnDocument: 'after' }).lean();
}

export async function listRuleRuns(projectId, ruleId, query) {
  await ruleInProject(projectId, ruleId);
  const filter = { projectId, ruleId: oid(ruleId) };
  if (query.status) filter.status = query.status;
  return paginate(AutomationRun, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export function listRuns(projectId, query) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  return paginate(AutomationRun, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}
