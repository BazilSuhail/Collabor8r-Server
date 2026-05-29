import mongoose from 'mongoose';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { writeAudit } from '../../services/audit.service.js';
import { getPublicUsers } from '../user/user.service.js';
import Workflow from '../../models/project/workflows.model.js';
import Issue from '../../models/issue/issues.model.js';

const VALIDATOR_TYPES = ['requiredField', 'assigneeRequired', 'resolutionRequired', 'onlyRoles', 'subtasksDone'];
const CATEGORY_WORDS = ['todo', 'inprogress', 'done'];
const POST_ACTION_TYPES = ['setResolution', 'clearResolution', 'assignToReporter'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sameId = (a, b) => String(a) === String(b);

const rule = (r) => ({
  type: r.type,
  field: r.field ?? '',
  roles: r.roles ?? [],
  resolutionId: r.resolutionId ? oid(r.resolutionId) : null,
});

// Turns input (or stored docs) into ObjectId-based statuses and transitions. Missing ids are generated.
function normalize({ statuses = [], transitions = [] }) {
  return {
    statuses: statuses.map((s, i) => ({
      id: s.id ? oid(s.id) : new mongoose.Types.ObjectId(),
      name: s.name,
      category: s.category,
      color: s.color ?? '',
      icon: s.icon ?? '',
      description: s.description ?? '',
      sortOrder: s.sortOrder ?? i,
    })),
    transitions: transitions.map((t) => ({
      id: t.id ? oid(t.id) : new mongoose.Types.ObjectId(),
      name: t.name,
      from: t.from.map(oid),
      to: oid(t.to),
      screenFields: t.screenFields ?? [],
      requiredFields: t.requiredFields ?? [],
      conditions: (t.conditions ?? []).map(rule),
      validators: (t.validators ?? []).map(rule),
      postActions: (t.postActions ?? []).map(rule),
    })),
  };
}

// Structural checks: unique status ids, known references, supported rule types.
function assertDefinition({ statuses, transitions }) {
  const ids = new Set(statuses.map((s) => String(s.id)));
  if (ids.size !== statuses.length) throw new ApiError(422, 'Duplicate status id');
  const known = (id) => ids.has(String(id));
  for (const t of transitions) {
    if (!known(t.to) || !t.from.every(known)) {
      throw new ApiError(422, `Transition "${t.name}" references an unknown status`);
    }
    for (const r of [...t.conditions, ...t.validators]) {
      if (!VALIDATOR_TYPES.includes(r.type)) throw new ApiError(422, `Unsupported validator "${r.type}"`);
      if (r.type === 'requiredField' && !r.field) throw new ApiError(422, 'requiredField needs a field');
      if (r.type === 'onlyRoles' && !r.roles.length) throw new ApiError(422, 'onlyRoles needs roles');
    }
    for (const a of t.postActions) {
      if (!POST_ACTION_TYPES.includes(a.type)) throw new ApiError(422, `Unsupported post-action "${a.type}"`);
      if (a.type === 'setResolution' && !a.resolutionId) throw new ApiError(422, 'setResolution needs resolutionId');
    }
  }
}

async function findWorkflow(projectId, workflowId) {
  const wf = await Workflow.findOne({ _id: workflowId, projectId }).lean();
  if (!wf) throw new ApiError(404, 'Workflow not found');
  return wf;
}

// The schema has no issue-type link, so the project's live workflow applies to every issue type.
export async function getWorkflowForIssueType(projectId, _issueTypeId) {
  const wf = await Workflow.findOne({ projectId, status: 'live' }).sort({ version: -1 }).lean();
  if (!wf) throw new ApiError(422, 'Project has no live workflow');
  return wf;
}

export function getInitialStatus(workflow) {
  const sorted = [...workflow.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const s = sorted.find((x) => x.category === 'todo') ?? sorted[0];
  if (!s) throw new ApiError(422, 'Workflow has no statuses');
  return { id: s.id, name: s.name, category: s.category, color: s.color ?? '' };
}

export function getAvailableTransitions(workflow, fromStatusId) {
  return workflow.transitions.filter((t) => t.from.some((f) => sameId(f, fromStatusId)));
}

export function listWorkflows({ projectId, query }) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  return paginate(Workflow, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

export function getWorkflow({ projectId, workflowId }) {
  return findWorkflow(projectId, workflowId);
}

export async function createWorkflow({ projectId, input }) {
  const def = normalize(input);
  assertDefinition(def);
  const wf = await Workflow.create({ projectId, name: input.name, description: input.description ?? '', status: 'draft', version: 0, ...def });
  return wf.toObject();
}

// Only draft workflows are editable; live ones are replaced by publishing a new draft.
export async function updateWorkflow({ projectId, workflowId, input }) {
  const wf = await findWorkflow(projectId, workflowId);
  if (wf.status !== 'draft') throw new ApiError(409, 'Only draft workflows can be edited');
  const def = normalize({ statuses: input.statuses ?? wf.statuses, transitions: input.transitions ?? wf.transitions });
  assertDefinition(def);
  const set = { ...def, updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  return Workflow.findOneAndUpdate({ _id: workflowId, projectId }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
}

export async function publishWorkflow({ projectId, workflowId, req }) {
  const wf = await findWorkflow(projectId, workflowId);
  if (wf.status === 'live') throw new ApiError(409, 'Workflow is already live');
  assertDefinition({ statuses: wf.statuses, transitions: wf.transitions });
  const categories = new Set(wf.statuses.map((s) => s.category));
  if (!categories.has('todo')) throw new ApiError(422, 'At least one todo status is required');
  if (!categories.has('done')) throw new ApiError(422, 'At least one done status is required');

  const live = await Workflow.findOne({ projectId, status: 'live' }).lean();
  if (live) {
    const keep = new Set(wf.statuses.map((s) => String(s.id)));
    const removed = live.statuses.filter((s) => !keep.has(String(s.id))).map((s) => s.id);
    if (removed.length && await Issue.exists({ projectId, statusId: { $in: removed } })) {
      throw new ApiError(409, 'Statuses in use by issues cannot be removed');
    }
  }
  await Workflow.updateMany({ projectId, status: 'live', _id: { $ne: wf._id } }, { $set: { status: 'draft' } });
  const published = await Workflow.findOneAndUpdate(
    { _id: workflowId, projectId },
    { $set: { status: 'live', updatedAt: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  await writeAudit({ req, orgId: req?.project?.orgId ?? null, projectId, action: 'workflow.published', targetType: 'workflow', targetId: wf._id, targetName: wf.name, before: { status: wf.status }, after: { status: 'live', version: published.version } });
  return published;
}

export async function deleteWorkflow({ projectId, workflowId }) {
  const wf = await findWorkflow(projectId, workflowId);
  if (wf.status === 'live') throw new ApiError(409, 'Live workflow cannot be deleted');
  if (await Issue.exists({ projectId, statusId: { $in: wf.statuses.map((s) => s.id) } })) {
    throw new ApiError(409, 'Workflow is in use by issues');
  }
  await Workflow.deleteOne({ _id: workflowId, projectId });
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function readField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// Returns a failure message for a rule, or null when it passes.
function checkRule(rule, merged, issue, req) {
  switch (rule.type) {
    case 'requiredField':
      return isEmpty(readField(merged, rule.field)) ? `${rule.field} is required` : null;
    case 'assigneeRequired':
      return merged.assigneeId ? null : 'An assignee is required';
    case 'resolutionRequired':
      return merged.resolutionId ? null : 'A resolution is required';
    case 'onlyRoles':
      // Explicit flag set only by the automation runner; a missing req never bypasses.
      if (req?.isSystem === true) return null;
      return rule.roles.includes(req?.projectRole) ? null : 'Your role cannot perform this transition';
    case 'subtasksDone':
      return (issue.counts?.subtasks ?? 0) <= (issue.counts?.subtasksDone ?? 0) ? null : 'All subtasks must be done';
    default:
      return 'Unsupported validator';
  }
}

// Validates a transition and returns the status and field changes. Does not write the issue.
export async function applyTransition({ issue, transitionId, toStatus, fields = {}, req }) {
  const workflow = await getWorkflowForIssueType(issue.projectId, issue.type);
  const from = String(issue.statusId);
  let transition;
  if (transitionId) {
    transition = workflow.transitions.find((t) => sameId(t.id, transitionId));
  } else if (CATEGORY_WORDS.includes(toStatus)) {
    // Category word (todo, inprogress, done): pick the allowed transition into that category, lowest status sortOrder first.
    const byId = new Map(workflow.statuses.map((s) => [String(s.id), s]));
    transition = workflow.transitions
      .filter((t) => t.from.some((f) => sameId(f, from)) && !sameId(t.to, from) && byId.get(String(t.to))?.category === toStatus)
      .sort((a, b) => (byId.get(String(a.to)).sortOrder ?? 0) - (byId.get(String(b.to)).sortOrder ?? 0))[0];
  } else {
    transition = workflow.transitions.find((t) => sameId(t.to, toStatus) && t.from.some((f) => sameId(f, from)));
  }
  if (!transition || !transition.from.some((f) => sameId(f, from))) {
    throw new ApiError(422, 'Transition not allowed from the current status');
  }
  const target = workflow.statuses.find((s) => sameId(s.id, transition.to));
  if (!target) throw new ApiError(422, 'Transition target status not found');

  // customFields merge per key so validators see existing values and the write does not replace the object.
  const merged = { ...issue, ...fields, customFields: { ...(issue.customFields ?? {}), ...(fields.customFields ?? {}) } };
  const errors = [];
  for (const field of transition.requiredFields) {
    if (isEmpty(readField(merged, field))) errors.push({ path: field, message: `${field} is required` });
  }
  for (const rule of [...transition.conditions, ...transition.validators]) {
    const message = checkRule(rule, merged, issue, req);
    if (message) errors.push({ path: rule.field || rule.type, message });
  }
  if (errors.length) throw new ApiError(422, 'Transition validation failed', errors);

  const now = new Date();
  const wasDone = issue.statusCategory === 'done';
  const isDone = target.category === 'done';
  const { customFields: customPatch, ...plainFields } = fields;
  const setFields = {
    ...plainFields,
    statusId: target.id,
    statusName: target.name,
    statusCategory: target.category,
    statusColor: target.color ?? '',
  };
  // A dotted $set fails when the stored customFields is null/non-object; write the merged object then.
  if (customPatch && (!issue.customFields || typeof issue.customFields !== 'object')) setFields.customFields = { ...customPatch };
  else for (const [k, v] of Object.entries(customPatch ?? {})) setFields[`customFields.${k}`] = v; // keys vetted by the service
  if (isDone && !wasDone) setFields.resolvedAt = now;
  if (!isDone && wasDone) setFields.resolvedAt = null;

  for (const action of transition.postActions) {
    if (action.type === 'setResolution') setFields.resolutionId = action.resolutionId;
    if (action.type === 'clearResolution') setFields.resolutionId = null;
    if (action.type === 'assignToReporter') {
      const info = (await getPublicUsers([String(issue.reporterId)])).get(String(issue.reporterId));
      setFields.assigneeId = issue.reporterId;
      setFields.assignee = { name: info?.displayName ?? '', avatarUrl: info?.avatar ?? '' };
    }
  }
  return {
    toStatus: { id: target.id, name: target.name, category: target.category, color: target.color ?? '' },
    setFields,
  };
}
