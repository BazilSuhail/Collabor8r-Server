import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AiDraft, AiUsage, IssueType, Project } from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { isoDay } from '../../utils/helpers.js';
import { getProjectAccess } from '../../services/access.service.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import { createIssueInternal } from '../issue/issue.service.js';
import { isAiConfigured, generateText } from './ai.client.js';

const DAY = 86400000;
// Estimated micro-dollars per token, used only for the usage meter.
const COST = { input: 1, output: 5 };
const oid = (v) => new mongoose.Types.ObjectId(v);

// Prompts are hardcoded here. Only their hash is stored with a draft.
const KINDS = {
  issueFromText: {
    storedKind: 'issues',
    maxTokens: 600,
    system: 'You turn a request into one work item. Reply with JSON only: {"title": string, "description": string}.',
  },
  subtasks: {
    storedKind: 'issues',
    maxTokens: 800,
    system: 'You split a work item into subtasks. Reply with JSON only: {"items": [{"title": string, "description": string}]}. Use at most 8 items.',
  },
  summarize: {
    storedKind: 'summary',
    maxTokens: 600,
    system: 'You summarize text for a busy reader. Reply with JSON only: {"summary": string, "highlights": string[]}.',
  },
  wikiOutline: {
    storedKind: 'wikiPage',
    maxTokens: 800,
    system: 'You draft a wiki page outline. Reply with JSON only: {"title": string, "sections": [{"heading": string, "points": string[]}]}.',
  },
  // Draft-only kinds: accepting them creates no records.
  issueFill: {
    storedKind: 'issues',
    maxTokens: 800,
    system: 'You are Jerry, a project assistant. Turn the request into one work item. Reply with JSON only: {"title": string, "summary": string, "description": string, "priority": "low"|"medium"|"high"|"urgent"|null, "typeName": string|null, "labels": string[], "dueDate": "YYYY-MM-DD"|null, "storyPoints": number|null, "reply": string}. "reply" is one short friendly sentence to the user.',
  },
  findIssues: {
    storedKind: 'search',
    maxTokens: 300,
    system: 'You are Jerry, a project assistant. Turn the request into a short keyword search over work items. Reply with JSON only: {"query": string, "reply": string}. "query" is 1 to 6 plain keywords. "reply" is one short friendly sentence.',
  },
};

const dayKey = (date) => date.toISOString().slice(0, 10);
const publicDraft = ({ promptHash, ...rest }) => rest;

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ApiError(502, 'AI returned invalid output');
  }
}

async function assertReporter(userId, projectId) {
  const access = await getProjectAccess(userId, projectId);
  if (!access) throw new ApiError(404, 'Project not found');
  if ((PROJECT_ROLE_RANK[access.role] ?? 0) < PROJECT_ROLE_RANK.reporter) throw new ApiError(403, 'Reporter role required');
  return access;
}

async function assertUnderDailyCap(userId) {
  const usage = await AiUsage.findOne({ _id: `${userId}:${dayKey(isoDay())}` }).lean();
  if ((usage?.calls ?? 0) >= env.aiDailyCallLimit) throw new ApiError(429, 'Daily AI limit reached');
}

async function bumpAiUsage({ userId, orgId, projectId, kind, inputTokens, outputTokens }) {
  const day = isoDay();
  const costMicros = inputTokens * COST.input + outputTokens * COST.output;
  await AiUsage.updateOne(
    { _id: `${userId}:${dayKey(day)}` },
    {
      $setOnInsert: { userId, orgId, projectId, date: day },
      $inc: { calls: 1, inputTokens, outputTokens, costMicros, [`byKind.${kind}`]: 1 },
    },
    { upsert: true },
  );
}

export async function createDraft(userId, body) {
  if (!isAiConfigured()) throw new ApiError(503, 'AI not configured');
  const access = await assertReporter(userId, body.projectId);
  await assertUnderDailyCap(userId);

  const spec = KINDS[body.kind];
  const promptHash = crypto.createHash('sha256').update(spec.system + body.text).digest('hex');
  const draft = await AiDraft.create({
    userId,
    projectId: body.projectId,
    orgId: access.project?.orgId ?? null,
    kind: spec.storedKind,
    promptHash,
    contextIds: body.contextIds ?? [],
    status: 'pending',
    expireAt: new Date(Date.now() + DAY),
  });

  try {
    const result = await generateText({ system: spec.system, user: body.text, maxTokens: spec.maxTokens });
    await bumpAiUsage({
      userId,
      orgId: draft.orgId,
      projectId: body.projectId,
      kind: body.kind,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    const output = { kind: body.kind, ...parseJson(result.text) };
    await AiDraft.updateOne({ _id: draft._id }, { $set: { status: 'ready', output } });
    return publicDraft({ ...draft.toObject(), status: 'ready', output });
  } catch (err) {
    await AiDraft.updateOne({ _id: draft._id }, { $set: { status: 'failed', error: String(err.message ?? err).slice(0, 300) } });
    throw err;
  }
}

export function listMyDrafts(userId, query) {
  return paginate(AiDraft, { userId: oid(userId) }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, select: '-promptHash', lean: true });
}

export async function getDraft(userId, draftId) {
  const draft = await AiDraft.findOne({ _id: draftId, userId }).select('-promptHash').lean();
  if (!draft) throw new ApiError(404, 'Draft not found');
  return draft;
}

// Issue type for AI-created items: the caller's choice, else the project's default or the first of the wanted hierarchy.
async function resolveTypeId(projectId, typeId, hierarchy) {
  if (typeId) return typeId;
  if (hierarchy) {
    const t = await IssueType.findOne({ projectId, hierarchy }).select('_id').lean();
    if (t) return t._id;
  }
  const project = await Project.findById(projectId).select('defaults').lean();
  return project?.defaults?.issueTypeId;
}

export async function acceptDraft(userId, draftId, edits = {}) {
  const existing = await AiDraft.findOne({ _id: draftId, userId }).select('projectId').lean();
  if (!existing) throw new ApiError(404, 'Draft not found');
  await assertReporter(userId, existing.projectId);

  // Atomically claim the draft so concurrent accepts cannot both create issues.
  const draft = await AiDraft.findOneAndUpdate(
    { _id: draftId, userId, projectId: existing.projectId, status: 'ready' },
    { $set: { status: 'accepting' } },
    { returnDocument: 'after' },
  ).lean();
  if (!draft) throw new ApiError(409, 'Draft is not ready');

  const output = draft.output ?? {};
  const created = [];
  try {
  if (draft.output?.kind === 'issueFromText') {
    const issue = await createIssueInternal({
      projectId: draft.projectId,
      reporterId: userId,
      input: {
        title: edits.title ?? output.title,
        description: edits.description ?? output.description,
        typeId: await resolveTypeId(draft.projectId, edits.typeId),
      },
      source: 'ai',
      actor: { id: userId },
    });
    created.push(issue.key);
  }
  if (draft.output?.kind === 'subtasks') {
    const parentId = draft.contextIds?.[0];
    const items = edits.items ?? output.items ?? [];
    for (const item of items) {
      const issue = await createIssueInternal({
        projectId: draft.projectId,
        reporterId: userId,
        input: { title: item.title, description: item.description, typeId: await resolveTypeId(draft.projectId, edits.typeId, 'subtask'), parentId },
        source: 'ai',
        actor: { id: userId },
      });
      created.push(issue.key);
    }
  }

  } catch (err) {
    // Release the claim so the user can retry.
    await AiDraft.updateOne({ _id: draftId, status: 'accepting' }, { $set: { status: 'ready' } });
    throw err;
  }

  const updated = await AiDraft.findOneAndUpdate(
    { _id: draftId, userId, status: 'accepting' },
    { $set: { status: 'accepted', createdIssueKeys: created } },
    { returnDocument: 'after' },
  ).select('-promptHash').lean();
  return { draft: updated, created };
}

export async function discardDraft(userId, draftId) {
  const draft = await AiDraft.findOneAndUpdate(
    { _id: draftId, userId, status: { $in: ['pending', 'ready', 'failed'] } },
    { $set: { status: 'discarded' } },
    { returnDocument: 'after' },
  ).select('-promptHash').lean();
  if (!draft) throw new ApiError(404, 'Draft not found or already decided');
  return draft;
}

export async function getUsage(userId) {
  const now = isoDay();
  const today = await AiUsage.findOne({ _id: `${userId}:${dayKey(now)}` }).select('-_id -userId').lean();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [month] = await AiUsage.aggregate([
    { $match: { userId: oid(userId), date: { $gte: monthStart } } },
    {
      $group: {
        _id: null,
        calls: { $sum: '$calls' },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        costMicros: { $sum: '$costMicros' },
      },
    },
  ]);
  const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 };
  return {
    dailyLimit: env.aiDailyCallLimit,
    today: today ?? zero,
    month: month ? { calls: month.calls, inputTokens: month.inputTokens, outputTokens: month.outputTokens, costMicros: month.costMicros } : zero,
  };
}
