import { randomUUID } from 'node:crypto';
import {
  Issue,
  IssueType,
  Priority,
  Project,
  CustomField,
  Component,
  SavedFilter,
  IssueComment,
  IssueAttachment,
  IssueLink,
  IssueHistory,
  Worklog,
  SlaTimer,
} from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { escapeRegex } from '../../utils/helpers.js';
import { paginate } from '../../utils/pagination.js';
import { rankAfter } from '../../utils/rank.js';
import { nextSeq, issueCounterId } from '../../services/counter.service.js';
import { getProjectAccess } from '../../services/access.service.js';
import { emitEvent } from '../../services/events.service.js';
import { logActivity, actorOf } from '../../services/activity.service.js';
import { writeHistory, diffFields } from '../../services/history.service.js';
import { bumpRollup } from '../../services/rollup.service.js';
import { notify } from '../../services/notify.service.js';
import { getPublicUsers } from '../user/user.service.js';
import { getWorkflowForIssueType, getInitialStatus, applyTransition } from '../workflows/workflows.service.js';
import { assertSprintInProject } from '../sprints/sprints.service.js';
import { assertReleaseInProject } from '../releases/releases.service.js';

const DONE = 'done';
const mk = (v) => String(v).replace(/[.$]/g, '_');
const isDone = (category) => category === DONE;
const invalid = (path, message) => new ApiError(422, 'Validation failed', [{ path, message }]);

export function issueSnapshot(issue) {
  return {
    _id: issue._id,
    key: issue.key,
    number: issue.number,
    title: issue.title,
    typeName: issue.typeName,
    statusId: issue.statusId,
    statusName: issue.statusName,
    statusCategory: issue.statusCategory,
    assigneeId: issue.assigneeId ?? null,
    reporterId: issue.reporterId ?? null,
    priorityId: issue.priorityId ?? null,
    sprintId: issue.sprintId ?? null,
    parentId: issue.parentId ?? null,
  };
}

const statusFields = (s) => ({
  statusId: s.id ?? s.key,
  statusName: s.name,
  statusCategory: s.category,
  statusColor: s.color ?? null,
});

const priorityFields = (p) => ({
  priorityId: p?._id ?? null,
  priorityName: p?.name ?? null,
  priorityRank: p?.rank ?? null,
  priorityIcon: p?.icon ?? null,
});

const usersFor = (ids) => {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  return list.length ? getPublicUsers(list) : new Map();
};

const personSnap = (users, id) => {
  if (!id) return null;
  const u = users.get(String(id));
  return { name: u?.displayName ?? null, avatarUrl: u?.avatar ?? null };
};

const actorFor = (id) => (id ? actorOf({ id: String(id) }) : { id: null, name: 'Public form', avatar: null });

const flagsFor = (doc, now = new Date()) => ({
  isBlocked: doc.flags?.isBlocked ?? false,
  blockedReason: doc.flags?.blockedReason ?? null,
  isOverdue: !!doc.dueDate && new Date(doc.dueDate) < now && doc.statusCategory !== DONE,
  isStale: doc.flags?.isStale ?? false,
  needsAttention: doc.flags?.needsAttention ?? false,
  hasDescription: !!doc.description,
});

// Checklist items keep doneBy/doneAt from the previous state when still done.
function toChecklist(items = [], actorId, now, prev = []) {
  const before = new Map(prev.map((i) => [i.id, i]));
  return items.map((i) => {
    const id = i.id ?? randomUUID();
    const done = !!i.done;
    const old = before.get(id);
    if (!done) return { id, text: i.text, done: false, doneBy: null, doneAt: null };
    if (old?.done) return { id, text: i.text, done: true, doneBy: old.doneBy ?? null, doneAt: old.doneAt ?? null };
    return { id, text: i.text, done: true, doneBy: actorId ?? null, doneAt: now };
  });
}

async function loadProject(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
}

async function loadPriority(projectId, id) {
  if (!id) return null;
  const priority = await Priority.findOne({ _id: id, projectId }).lean();
  if (!priority) throw invalid('priorityId', 'Unknown priority');
  return priority;
}

async function assertAssignable(projectId, userId) {
  const access = await getProjectAccess(String(userId), String(projectId));
  if (!access) throw invalid('assigneeId', 'Assignee must be a project member');
}

async function assertComponents(projectId, ids = []) {
  if (!ids.length) return;
  const count = await Component.countDocuments({ _id: { $in: ids }, projectId });
  if (count !== new Set(ids.map(String)).size) throw invalid('componentIds', 'Unknown component');
}

async function assertReleases(projectId, ids = []) {
  for (const id of ids) await assertReleaseInProject(projectId, id);
}

async function checkHierarchy(projectId, type, parentId, epicId) {
  if (type.hierarchy === 'epic' && parentId) throw invalid('parentId', 'Epics cannot have a parent');
  if (type.hierarchy === 'subtask' && !parentId) throw invalid('parentId', 'Subtasks need a parent');
  if (parentId && !(await Issue.exists({ _id: parentId, projectId }))) {
    throw invalid('parentId', 'Parent must be in this project');
  }
  if (epicId && !(await Issue.exists({ _id: epicId, projectId }))) {
    throw invalid('epicId', 'Epic must be in this project');
  }
}

async function checkCustomFields(projectId, typeId, values, { create = false } = {}) {
  const defs = await CustomField.find({ projectId }).lean();
  const byId = new Map(defs.map((d) => [String(d._id), d]));
  const applies = (d) => !d.issueTypeIds?.length || d.issueTypeIds.some((t) => String(t) === String(typeId));
  const errors = [];
  for (const key of Object.keys(values)) {
    const def = byId.get(key);
    if (!def) errors.push({ path: `customFields.${key}`, message: 'Unknown field' });
    else if (!applies(def)) errors.push({ path: `customFields.${key}`, message: 'Field does not apply to this type' });
  }
  if (create) {
    for (const d of defs) {
      if (d.required && applies(d) && (values[String(d._id)] ?? '') === '') {
        errors.push({ path: `customFields.${d._id}`, message: 'Required' });
      }
    }
  }
  if (errors.length) throw new ApiError(422, 'Validation failed', errors);
  return values;
}

function assertRequiredFields(type, values) {
  const missing = (type.requiredFields ?? []).filter((name) => {
    const v = values[name];
    return v === undefined || v === null || v === '';
  });
  if (missing.length) {
    throw new ApiError(422, 'Validation failed', missing.map((name) => ({ path: name, message: 'Required for this type' })));
  }
}

async function insertIssue(projectId, project, doc) {
  for (let attempt = 1; ; attempt += 1) {
    const number = await nextSeq(issueCounterId(projectId));
    try {
      const created = await Issue.create({ ...doc, number, key: `${project.key}-${number}` });
      return created.toObject();
    } catch (err) {
      if (err?.code !== 11000 || attempt >= 2) throw err;
    }
  }
}

async function staleError(projectId, issueId) {
  const exists = await Issue.exists({ _id: issueId, projectId });
  return exists ? new ApiError(409, 'Issue was changed by someone else') : new ApiError(404, 'Issue not found');
}

export async function getIssueInProject(projectId, issueId) {
  const issue = await Issue.findOne({ _id: issueId, projectId }).lean();
  if (!issue) throw new ApiError(404, 'Issue not found');
  return issue;
}

export async function getIssueByKey(projectId, key) {
  const issue = await Issue.findOne({ projectId, key: key.toUpperCase() }).lean();
  if (!issue) throw new ApiError(404, 'Issue not found');
  return issue;
}

// Private issues are visible to leads, reporter, assignee and listed users.
export function assertVisible(issue, viewerId, seesPrivate) {
  if (!issue.isPrivate || seesPrivate) return;
  const allowed = [issue.reporterId, issue.assigneeId, ...(issue.allowedUserIds ?? [])].some(
    (id) => id && String(id) === String(viewerId)
  );
  if (!allowed) throw new ApiError(404, 'Issue not found');
}

// Loads an issue and applies assertVisible; for use by sub-resource services.
export async function getVisibleIssue(projectId, issueId, viewerId, seesPrivate) {
  const issue = await getIssueInProject(projectId, issueId);
  assertVisible(issue, viewerId, seesPrivate);
  return issue;
}

export async function createIssueInternal({ projectId, reporterId = null, input, source = 'api', actor }) {
  const project = await loadProject(projectId);
  const type = await IssueType.findOne({ _id: input.typeId, projectId }).lean();
  if (!type) throw invalid('typeId', 'Unknown issue type');

  const parentId = input.parentId ?? null;
  const epicId = input.epicId ?? null;
  await checkHierarchy(projectId, type, parentId, epicId);

  const workflow = await getWorkflowForIssueType(projectId, type._id);
  const status = statusFields(getInitialStatus(workflow));

  const priority =
    (await loadPriority(projectId, input.priorityId ?? project.defaults?.priorityId)) ??
    (await Priority.findOne({ projectId, isDefault: true }).lean());

  const assigneeId = input.assigneeId ?? null;
  if (assigneeId) await assertAssignable(projectId, assigneeId);

  const sprint = input.sprintId ? await assertSprintInProject(projectId, input.sprintId) : null;
  await assertReleases(projectId, input.releaseIds);
  await assertComponents(projectId, input.componentIds);

  const customFields = await checkCustomFields(projectId, type._id, input.customFields ?? {}, { create: true });
  const tpl = type.defaultTemplate ?? {};
  const description = input.description ?? tpl.description ?? null;
  assertRequiredFields(type, { ...input, description, ...customFields });

  const now = new Date();
  const users = await usersFor([reporterId, assigneeId]);
  const watcherIds = [...new Set([reporterId, assigneeId, ...(input.watcherIds ?? [])].filter(Boolean).map(String))];
  const last = await Issue.findOne({ projectId }).sort({ rank: -1 }).select('rank').lean();

  const doc = {
    projectId,
    orgId: project.orgId ?? null,
    type: type._id,
    typeName: type.name,
    typeIcon: type.icon ?? null,
    hierarchy: type.hierarchy,
    parentId,
    epicId,
    title: input.title,
    summary: input.summary ?? '',
    description,
    checklist: toChecklist(input.checklist ?? tpl.checklist ?? [], reporterId, now),
    ...status,
    ...priorityFields(priority),
    resolutionId: null,
    assigneeId,
    assignee: personSnap(users, assigneeId),
    reporterId,
    reporter: personSnap(users, reporterId),
    watcherIds,
    sprintId: input.sprintId ?? null,
    boardId: sprint?.boardId ?? project.defaults?.boardId ?? null,
    releaseIds: input.releaseIds ?? [],
    componentIds: input.componentIds ?? [],
    labels: input.labels ?? [],
    storyPoints: input.storyPoints ?? null,
    estimateSec: input.estimateSec ?? null,
    remainingSec: input.estimateSec ?? null,
    spentSec: 0,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    rank: rankAfter(last?.rank ?? null),
    customFields,
    isPrivate: input.isPrivate ?? false,
    allowedUserIds: input.allowedUserIds ?? [],
    counts: { comments: 0, attachments: 0, subtasks: 0, subtasksDone: 0, links: 0, history: 0 },
    lastActivityAt: now,
    lastActivityBy: reporterId,
    createdBy: reporterId,
    createdAt: now,
    updatedAt: now,
  };
  doc.flags = flagsFor(doc, now);

  const issue = await insertIssue(projectId, project, doc);
  const who = reporterId ?? actor?.id ?? null;

  if (parentId) await Issue.updateOne({ _id: parentId, projectId }, { $inc: { 'counts.subtasks': 1 } });

  await bumpRollup({
    projectId,
    orgId: issue.orgId,
    date: now,
    inc: {
      created: 1,
      [`status.${mk(issue.statusId)}`]: 1,
      [`type.${mk(issue.typeName)}`]: 1,
      'points.created': issue.storyPoints ?? 0,
    },
  });
  await writeHistory({ issueId: issue._id, projectId, actorId: who, changes: { status: { from: null, to: issue.statusName } } });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueCreated',
    actor: await actorFor(who),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `created ${issue.key}`,
    aiCreated: source === 'ai',
  });
  emitEvent({
    type: 'issue.created',
    orgId: issue.orgId,
    projectId,
    actorId: who,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    at: now,
  });
  if (assigneeId && String(assigneeId) !== String(who)) {
    await notify({
      userIds: [assigneeId],
      type: 'assigned',
      title: `Assigned to you: ${issue.key}`,
      projectId,
      orgId: issue.orgId,
      link: { kind: 'issue', id: String(issue._id), key: issue.key },
      actorId: who,
    });
  }
  return issue;
}

export async function updateIssueInternal({ projectId, issueId, patch, expectedVersion, actorId }) {
  const before = await getIssueInProject(projectId, issueId);
  const now = new Date();
  const set = { ...patch };

  if ('priorityId' in patch) Object.assign(set, priorityFields(await loadPriority(projectId, patch.priorityId)));
  if (patch.assigneeId) await assertAssignable(projectId, patch.assigneeId);
  if ('assigneeId' in patch) set.assignee = personSnap(await usersFor([patch.assigneeId]), patch.assigneeId);
  if (patch.sprintId) {
    const sprint = await assertSprintInProject(projectId, patch.sprintId);
    set.boardId = sprint.boardId ?? null;
  }
  if (patch.releaseIds) await assertReleases(projectId, patch.releaseIds);
  if (patch.componentIds) await assertComponents(projectId, patch.componentIds);

  if ('parentId' in patch || 'epicId' in patch) {
    const type = await IssueType.findOne({ _id: before.type, projectId }).lean();
    const parentId = 'parentId' in patch ? patch.parentId : before.parentId;
    const epicId = 'epicId' in patch ? patch.epicId : before.epicId;
    if (type) await checkHierarchy(projectId, type, parentId ?? null, epicId ?? null);
    if ('parentId' in patch && String(patch.parentId ?? '') !== String(before.parentId ?? '')) {
      const subDone = isDone(before.statusCategory) ? 1 : 0;
      if (before.parentId) {
        await Issue.updateOne(
          { _id: before.parentId, projectId },
          { $inc: { 'counts.subtasks': -1, 'counts.subtasksDone': -subDone } }
        );
      }
      if (patch.parentId) {
        await Issue.updateOne(
          { _id: patch.parentId, projectId },
          { $inc: { 'counts.subtasks': 1, 'counts.subtasksDone': subDone } }
        );
      }
    }
  }

  if (patch.customFields) {
    await checkCustomFields(projectId, before.type, patch.customFields);
    set.customFields = { ...(before.customFields ?? {}), ...patch.customFields };
  }
  if (patch.checklist) set.checklist = toChecklist(patch.checklist, actorId, now, before.checklist ?? []);

  const after = { ...before, ...set };
  set.flags = flagsFor(after, now);
  set.updatedAt = now;
  set.lastActivityAt = now;
  set.lastActivityBy = actorId ?? null;

  const changes = diffFields(before, after, Object.keys(patch));
  const filter = { _id: before._id, projectId };
  if (expectedVersion !== undefined) filter.version = expectedVersion;

  const updated = await Issue.findOneAndUpdate(filter, { $set: set, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true }).lean();
  if (!updated) throw await staleError(projectId, issueId);

  if (Object.keys(changes).length) {
    await writeHistory({ issueId: before._id, projectId, actorId, changes });
    await logActivity({
      projectId,
      orgId: before.orgId,
      kind: 'issueUpdated',
      actor: await actorFor(actorId),
      item: { id: before._id, key: before.key, title: updated.title },
      summary: `updated ${before.key}`,
    });
    emitEvent({
      type: 'issue.updated',
      orgId: before.orgId,
      projectId,
      actorId,
      issueId: before._id,
      issue: issueSnapshot(updated),
      changes,
      at: now,
    });
  }
  if (patch.assigneeId && String(patch.assigneeId) !== String(actorId)) {
    await notify({
      userIds: [patch.assigneeId],
      type: 'assigned',
      title: `Assigned to you: ${before.key}`,
      projectId,
      orgId: before.orgId,
      link: { kind: 'issue', id: String(before._id), key: before.key },
      actorId,
    });
  }
  return updated;
}

export async function transitionIssueInternal({ projectId, issueId, transitionId, toStatus, actorId, fields = {}, req }) {
  const issue = await getIssueInProject(projectId, issueId);
  const result = await applyTransition({ issue, transitionId, toStatus, actorId, fields, req });
  const next = statusFields(result.toStatus);
  const now = new Date();
  const wasDone = isDone(issue.statusCategory);
  const nowDone = isDone(next.statusCategory);

  const set = { ...next, ...(result.setFields ?? {}) };
  if (nowDone && !wasDone) {
    set.resolvedAt = now;
    set.closedAt = now;
  }
  if (!nowDone && wasDone) {
    set.resolvedAt = null;
    set.closedAt = null;
  }
  set.updatedAt = now;
  set.lastActivityAt = now;
  set.lastActivityBy = actorId ?? null;
  set.flags = flagsFor({ ...issue, ...set }, now);

  const updated = await Issue.findOneAndUpdate(
    { _id: issue._id, projectId, version: issue.version },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true }
  ).lean();
  if (!updated) throw new ApiError(409, 'Issue was changed by someone else');

  const delta = nowDone === wasDone ? 0 : nowDone ? 1 : -1;
  if (issue.parentId && delta) {
    await Issue.updateOne({ _id: issue.parentId, projectId }, { $inc: { 'counts.subtasksDone': delta } });
  }

  const sp = issue.storyPoints ?? 0;
  const inc = { resolved: delta, 'points.resolved': delta * sp };
  const oldKey = `status.${mk(issue.statusId)}`;
  const newKey = `status.${mk(updated.statusId)}`;
  if (oldKey !== newKey) {
    inc[oldKey] = -1;
    inc[newKey] = 1;
  }
  await bumpRollup({ projectId, orgId: issue.orgId, date: now, inc });

  const changes = diffFields(issue, updated, ['statusName', 'resolutionId']);
  await writeHistory({ issueId: issue._id, projectId, actorId, changes });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'statusChanged',
    actor: await actorFor(actorId),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `moved ${issue.key} to ${updated.statusName}`,
  });
  emitEvent({
    type: 'issue.transitioned',
    orgId: issue.orgId,
    projectId,
    actorId,
    issueId: issue._id,
    issue: issueSnapshot(updated),
    changes: { status: { from: issue.statusName, to: updated.statusName } },
    at: now,
  });

  const people = [...new Set([...(issue.watcherIds ?? []), issue.assigneeId, issue.reporterId].filter(Boolean).map(String))].filter(
    (id) => id !== String(actorId)
  );
  if (people.length) {
    await notify({
      userIds: people,
      type: 'statusChanged',
      title: `${issue.key} moved to ${updated.statusName}`,
      projectId,
      orgId: issue.orgId,
      link: { kind: 'issue', id: String(issue._id), key: issue.key },
      actorId,
    });
  }
  return updated;
}

export async function deleteIssue({ projectId, issueId, actorId }) {
  const issue = await getIssueInProject(projectId, issueId);
  await Promise.all([
    IssueComment.deleteMany({ projectId, issueId }),
    IssueAttachment.deleteMany({ projectId, issueId }),
    IssueLink.deleteMany({ projectId, $or: [{ fromIssueId: issueId }, { toIssueId: issueId }] }),
    Worklog.deleteMany({ projectId, issueId }),
    IssueHistory.deleteMany({ projectId, issueId }),
    SlaTimer.deleteMany({ projectId, issueId }),
    Issue.deleteOne({ _id: issueId, projectId }),
  ]);

  if (issue.parentId) {
    const inc = { 'counts.subtasks': -1 };
    if (isDone(issue.statusCategory)) inc['counts.subtasksDone'] = -1;
    await Issue.updateOne({ _id: issue.parentId, projectId }, { $inc: inc });
  }

  const sp = issue.storyPoints ?? 0;
  const done = isDone(issue.statusCategory);
  await bumpRollup({
    projectId,
    orgId: issue.orgId,
    inc: {
      created: -1,
      [`status.${mk(issue.statusId)}`]: -1,
      [`type.${mk(issue.typeName)}`]: -1,
      'points.created': -sp,
      resolved: done ? -1 : 0,
      'points.resolved': done ? -sp : 0,
      spentSec: -(issue.spentSec ?? 0),
    },
  });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueUpdated',
    actor: await actorFor(actorId),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `deleted ${issue.key}`,
  });
  emitEvent({
    type: 'issue.deleted',
    orgId: issue.orgId,
    projectId,
    actorId,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    at: new Date(),
  });
}

export async function bulkUpdate({ projectId, issueIds, patch, actorId, seesPrivate = false }) {
  const result = { updated: [], failed: [] };
  for (const issueId of issueIds) {
    try {
      await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
      const issue = await updateIssueInternal({ projectId, issueId, patch, actorId });
      result.updated.push(String(issue._id));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      result.failed.push({ issueId, message: err.message });
    }
  }
  return result;
}

export async function listChildren(projectId, issueId, viewerId, seesPrivate = false) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const filter = { projectId, parentId: issueId };
  if (!seesPrivate) filter.$or = privateFilter(viewerId);
  return Issue.find(filter).sort({ rank: 1, _id: 1 }).lean();
}

// Minimal saved-filter grammar: "field = value" or "field != value", joined by AND.
const JQL_FIELDS = {
  assignee: 'assigneeId',
  reporter: 'reporterId',
  status: 'statusName',
  category: 'statusCategory',
  type: 'typeName',
  priority: 'priorityName',
  label: 'labels',
  sprint: 'sprintId',
  epic: 'epicId',
};
const OBJECT_ID_FIELDS = new Set(['assigneeId', 'reporterId', 'sprintId', 'epicId']);

function jqlClauses(text, viewerId) {
  return String(text ?? '')
    .split(/\s+AND\s+/i)
    .map((part) => part.trim())
    .flatMap((part) => {
      const m = part.match(/^(\w+)\s*(=|!=)\s*"?([^"]*)"?$/);
      const path = m ? JQL_FIELDS[m[1].toLowerCase()] : null;
      if (!path) return [];
      const raw = m[3].trim();
      let value = raw;
      if (raw === 'me' && OBJECT_ID_FIELDS.has(path)) value = viewerId;
      if (raw === 'empty') value = null;
      return [m[2] === '!=' ? { [path]: { $ne: value } } : { [path]: value }];
    });
}

// Mongo form of assertVisible, for list queries.
export const privateFilter = (viewerId) => [
  { isPrivate: { $ne: true } },
  { allowedUserIds: viewerId },
  { reporterId: viewerId },
  { assigneeId: viewerId },
];

export async function searchIssues({ projectId, query, viewerId, seesPrivate }) {
  const { limit, cursor, status, assignee, sprint, epic, label, type, q, savedFilter } = query;
  const and = [];
  if (status) {
    // A status id, a category (todo, inprogress, done) or a status name.
    if (/^[a-f\d]{24}$/i.test(status)) and.push({ statusId: status });
    else if (['todo', 'inprogress', 'done'].includes(status)) and.push({ statusCategory: status });
    else and.push({ statusName: new RegExp(`^${escapeRegex(status)}$`, 'i') });
  }
  if (assignee) and.push({ assigneeId: assignee === 'me' ? viewerId : assignee === 'none' ? null : assignee });
  if (sprint) and.push({ sprintId: sprint === 'none' ? null : sprint });
  if (epic) and.push({ epicId: epic });
  if (label) and.push({ labels: label });
  if (type) and.push({ type });
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    and.push({ $or: [{ title: rx }, { summary: rx }, { key: rx }] });
  }
  if (savedFilter) {
    const sf = await SavedFilter.findOne({ _id: savedFilter, projectId }).lean();
    if (!sf) throw new ApiError(404, 'Saved filter not found');
    and.push(...jqlClauses(sf.query, viewerId));
  }
  if (!seesPrivate) {
    and.push({
      $or: [
        { isPrivate: { $ne: true } },
        { allowedUserIds: viewerId },
        { reporterId: viewerId },
        { assigneeId: viewerId },
      ],
    });
  }
  const filter = and.length ? { projectId, $and: and } : { projectId };
  return paginate(Issue, filter, { sort: { rank: 1, _id: 1 }, cursorField: 'rank', limit, cursor });
}
