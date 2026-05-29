import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../../utils/logger.js';
import { AutomationRule, AutomationRun, Issue, Webhook } from '../../models/index.js';
import { onEvent } from '../../services/events.service.js';
import { notify } from '../../services/notify.service.js';
import { updateIssueInternal, transitionIssueInternal } from '../issue/issue.service.js';
import { patchFieldsSchema, PATCH_WRITABLE_KEYS, SETFIELD_DENIED_KEYS } from '../issue/issue.schemas.js';
import { addCommentInternal } from '../comments/comments.service.js';
import { deliverWebhook } from '../webhooks/webhooks.dispatcher.js';

const DAY = 86400000;
const MAX_DEPTH = 3;
// Carries the automation chain (depth and rule ids) across events emitted by rule actions.
const chain = new AsyncLocalStorage();

const TRIGGER_BY_EVENT = {
  'issue.created': 'itemCreated',
  'issue.transitioned': 'statusChanged',
  'issue.updated': 'fieldChanged',
  'comment.added': 'commentAdded',
};

const FIELD_ALIAS = { priority: 'priorityId', assignee: 'assigneeId', issueType: 'type', status: 'statusId' };

const NUM_FIELDS = new Set(['storyPoints', 'estimateSec', 'remainingSec']);
const BOOL_FIELDS = new Set(['isPrivate']);
const LIST_FIELDS = new Set(['labels', 'watcherIds', 'releaseIds', 'componentIds', 'allowedUserIds']);
const TEXT_FIELDS = new Set(['title', 'summary', 'description']);
const CUSTOM_FIELD = /^customFields\.([A-Za-z0-9_-]{1,64})$/;

// Turns a setField config into a validated issue patch. Throws a plain Error (fails the run) for blocked or invalid fields.
export function buildSetFieldPatch(cfg) {
  const field = String(cfg?.field ?? '');
  let value = cfg?.value;
  const cf = CUSTOM_FIELD.exec(field);
  const key = cf ? 'customFields' : FIELD_ALIAS[field] ?? field;
  const fail = () => new Error(`setField: "${field}" is not a writable field or the value is invalid`);
  if (!PATCH_WRITABLE_KEYS.has(key) || SETFIELD_DENIED_KEYS.has(key)) throw fail();
  if (cf) return { customFields: { [cf[1]]: value } };
  if (typeof value === 'string') {
    if (NUM_FIELDS.has(key)) value = value.trim() === '' ? null : Number(value);
    else if (BOOL_FIELDS.has(key)) value = value === 'true';
    else if (LIST_FIELDS.has(key)) value = value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (value === '' && !TEXT_FIELDS.has(key)) value = null;
  }
  const parsed = patchFieldsSchema.pick({ [key]: true }).safeParse({ [key]: value });
  if (!parsed.success) throw fail();
  return parsed.data;
}

const fieldValue = (issue, field) => issue[FIELD_ALIAS[field] ?? field];

function matches(actual, op, value) {
  const list = Array.isArray(actual) ? actual.map(String) : null;
  const str = actual == null ? '' : String(actual);
  const target = String(value ?? '');
  const targets = Array.isArray(value) ? value.map(String) : [target];
  const equal = list ? list.includes(target) : str === target;
  switch (op) {
    case 'equals': return equal;
    case 'notEquals': return !equal;
    case 'in': return targets.includes(str);
    case 'notIn': return !targets.includes(str);
    case 'contains': return list ? list.includes(target) : str.toLowerCase().includes(target.toLowerCase());
    case 'isEmpty': return list ? list.length === 0 : str === '';
    case 'isNotEmpty': return list ? list.length > 0 : str !== '';
    default: return false;
  }
}

async function runAction(action, { event, rule, issueId, projectId, actorId }) {
  const cfg = action.config ?? {};
  switch (action.type) {
    case 'setField':
      return updateIssueInternal({ projectId, issueId, patch: buildSetFieldPatch(cfg), actorId });
    case 'assign':
      return updateIssueInternal({ projectId, issueId, patch: { assigneeId: cfg.assigneeId ?? null }, actorId });
    case 'transition':
      return transitionIssueInternal({ projectId, issueId, toStatus: cfg.toStatus, actorId, fields: {}, req: { isSystem: true } });
    case 'addComment':
      return addCommentInternal({ projectId, issueId, authorId: actorId ?? rule.createdBy, body: cfg.body, internal: Boolean(cfg.internal) });
    case 'addLabel': {
      if (typeof cfg.label !== 'string' || !cfg.label.trim() || cfg.label.length > 50) return null; // nothing valid to add
      const issue = await Issue.findOne({ _id: issueId, projectId }).select('labels').lean();
      const labels = [...new Set([...(issue?.labels ?? []), cfg.label])];
      return updateIssueInternal({ projectId, issueId, patch: { labels }, actorId });
    }
    case 'notify': {
      const issue = await Issue.findOne({ _id: issueId, projectId }).select('assigneeId key').lean();
      const userIds = cfg.userIds?.length ? cfg.userIds : issue?.assigneeId ? [issue.assigneeId] : [];
      return notify({
        userIds,
        type: 'statusChanged',
        title: cfg.title ?? rule.name,
        body: cfg.body,
        projectId,
        orgId: event.orgId ?? null,
        link: { kind: 'issue', id: issueId, key: issue?.key },
        actorId,
      });
    }
    case 'webhook': {
      const hook = await Webhook.findOne({ _id: cfg.webhookId, projectId }).select('+secret').lean();
      if (!hook) throw new Error('Webhook not found');
      const delivery = await deliverWebhook(hook, event, { attempt: 1 });
      if (delivery.error || delivery.responseCode >= 400) throw new Error(`Webhook failed: ${delivery.error || delivery.responseCode}`);
      return delivery;
    }
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

export async function evaluateRule(rule, event) {
  const log = [];
  const issue = event.issueId ? await Issue.findOne({ _id: event.issueId, projectId: rule.projectId }).lean() : null;
  if (!issue) return { matched: false, log: ['no issue in project'] };
  const matched = (rule.conditions ?? []).every((c) => matches(fieldValue(issue, c.field), c.op, c.value));
  log.push(matched ? 'conditions matched' : 'conditions not matched');
  return { matched, log };
}

async function executeRule(rule, event) {
  const started = Date.now();
  const { matched, log } = await evaluateRule(rule, event);
  let status = 'skipped';
  let error = '';
  if (matched) {
    status = 'success';
    try {
      for (const action of rule.actions ?? []) {
        await runAction(action, { event, rule, issueId: event.issueId, projectId: rule.projectId, actorId: event.actorId ?? null });
        log.push(`${action.type} ok`);
      }
    } catch (err) {
      status = 'failed';
      error = String(err.message ?? err).slice(0, 500);
    }
  }
  const at = new Date();
  const run = await AutomationRun.create({
    projectId: rule.projectId,
    ruleId: rule._id,
    itemId: event.issueId ?? null,
    status,
    triggeredBy: event.type,
    error,
    durationMs: Date.now() - started,
    at,
    expireAt: new Date(at.getTime() + 30 * DAY),
  });
  await AutomationRule.updateOne(
    { _id: rule._id },
    { $set: { lastRunAt: at, lastRunStatus: status }, $inc: { runCount: 1, ...(status === 'failed' ? { errorCount: 1 } : {}) } },
  );
  return { run, matched, log };
}

async function handleEvent(event) {
  const store = chain.getStore();
  const depth = store?.depth ?? event.payload?.automationDepth ?? 0;
  if (depth >= MAX_DEPTH) return;
  const trigger = TRIGGER_BY_EVENT[event.type];
  if (!trigger || !event.projectId || !event.issueId) return;
  const ruleIds = store?.ruleIds ?? [];
  const rules = await AutomationRule.find({ projectId: event.projectId, enabled: true, 'trigger.type': trigger }).lean();
  for (const rule of rules) {
    const id = String(rule._id);
    if (ruleIds.includes(id)) continue;
    await chain.run({ depth: depth + 1, ruleIds: [...ruleIds, id] }, () => executeRule(rule, event));
  }
}

export async function runRuleManually(rule, issueId, actorId) {
  const event = { type: 'manual', orgId: null, projectId: rule.projectId, actorId, issueId, at: new Date() };
  const store = chain.getStore();
  const depth = store?.depth ?? 0;
  return chain.run({ depth: depth + 1, ruleIds: [...(store?.ruleIds ?? []), String(rule._id)] }, () => executeRule(rule, event));
}

let registered = false;

// Registers the event handler once per process; calling again is a no-op.
export function registerAutomationRunner() {
  if (registered) return;
  registered = true;
  onEvent(async (event) => {
    try {
      await handleEvent(event);
    } catch (err) {
      logger.error('automation runner failed', err);
    }
  });
}
