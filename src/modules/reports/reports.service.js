import mongoose from 'mongoose';
import { Issue, Sprint, IssueHistory } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { getRollups } from '../../services/rollup.service.js';
import { getPublicUsers } from '../user/user.service.js';
import { isoDay } from '../../utils/helpers.js';
import { hiddenIssueIds } from '../../services/visibility.service.js';

const DAY = 86400000;
const oid = (v) => new mongoose.Types.ObjectId(v);

// Rollup counts are nested (status: {key: n}); flatten to dotted keys.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !(v instanceof Date)) flatten(v, key, out);
    else out[key] = Number(v) || 0;
  }
  return out;
}

function sumPrefix(flat, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = Math.max(0, (out[k.slice(prefix.length)] ?? 0) + v);
  }
  return out;
}

function dateWindow(query, defaultDays = 30) {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - (defaultDays - 1) * DAY);
  return { from, to };
}

async function rowsFor(projectId, from, to) {
  const rows = await getRollups({ projectId, from, to });
  return rows.map((r) => ({ date: r.date, flat: flatten(r.counts) }));
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export async function getSummary(projectId) {
  const rows = await rowsFor(projectId, new Date(0), new Date());
  const total = { status: {}, type: {}, created: 0, resolved: 0 };
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.flat)) {
      if (k.startsWith('status.')) total.status[k.slice(7)] = (total.status[k.slice(7)] ?? 0) + v;
      else if (k.startsWith('type.')) total.type[k.slice(5)] = (total.type[k.slice(5)] ?? 0) + v;
      else if (k === 'created') total.created += v;
      else if (k === 'resolved') total.resolved += v;
    }
  }
  return {
    byStatus: Object.fromEntries(Object.entries(total.status).map(([k, v]) => [k, Math.max(0, v)])),
    byType: Object.fromEntries(Object.entries(total.type).map(([k, v]) => [k, Math.max(0, v)])),
    created: total.created,
    resolved: total.resolved,
  };
}

export async function getCreatedVsResolved(projectId, query) {
  const { from, to } = dateWindow(query);
  const rows = await rowsFor(projectId, from, to);
  return rows.map((r) => ({ date: dayKey(r.date), created: r.flat.created ?? 0, resolved: r.flat.resolved ?? 0 }));
}

// Sprint-scoped burndown computed at read time from sprint membership (IssueHistory field 'sprintId')
// plus the sprint's current issues. Points come from the issue, completion from resolvedAt.
export async function getBurndown(projectId, query) {
  if (!query.sprintId) throw new ApiError(422, 'sprintId is required');
  const sprint = await Sprint.findOne({ _id: query.sprintId, projectId }).lean();
  if (!sprint) throw new ApiError(404, 'Sprint not found');
  const sid = oid(query.sprintId);
  const sidStr = String(sid);
  const pid = oid(projectId);
  const start = isoDay(new Date(sprint.startedAt ?? sprint.startDate ?? sprint.createdAt));
  const end = isoDay(new Date(sprint.endDate ?? new Date()));
  const days = Math.max(1, Math.round((end - start) / DAY));
  const chartTo = sprint.closedAt ? Math.min(end.getTime(), isoDay(new Date(sprint.closedAt)).getTime()) : Math.min(end.getTime(), Date.now());
  const startMs = new Date(sprint.startedAt ?? start).getTime();

  // History stores ids as hex strings in Mixed fields; match both string and ObjectId forms.
  const both = [sidStr, sid];
  const hist = await IssueHistory.find({ projectId: pid, field: 'sprintId', $or: [{ toId: { $in: both } }, { fromId: { $in: both } }] })
    .sort({ at: 1 })
    .select('issueId fromId toId at')
    .lean();
  const evByIssue = new Map();
  for (const h of hist) {
    const k = String(h.issueId);
    if (!evByIssue.has(k)) evByIssue.set(k, []);
    evByIssue.get(k).push(h);
  }
  const issues = await Issue.find({ projectId: pid, $or: [{ sprintId: sid }, { _id: { $in: [...evByIssue.keys()].map(oid) } }] })
    .select('storyPoints resolvedAt createdAt sprintId')
    .lean();

  // Membership intervals per issue.
  const spans = [];
  for (const it of issues) {
    const ev = evByIssue.get(String(it._id)) ?? [];
    const pts = Number(it.storyPoints) || 0;
    const doneAt = it.resolvedAt ? new Date(it.resolvedAt).getTime() : null;
    let openAt = null;
    // No join event: created straight into the sprint, member from createdAt.
    if (!ev.some((e) => String(e.toId) === sidStr) && (String(it.sprintId) === sidStr || ev.length)) openAt = new Date(it.createdAt).getTime();
    for (const e of ev) {
      const at = new Date(e.at).getTime();
      if (String(e.toId) === sidStr && openAt === null) openAt = at;
      else if (String(e.fromId) === sidStr && openAt !== null) {
        spans.push({ pts, from: openAt, to: at, doneAt });
        openAt = null;
      }
    }
    if (openAt !== null) spans.push({ pts, from: openAt, to: null, doneAt });
  }

  const committed = spans.filter((s) => s.from <= startMs && (s.to === null || s.to > startMs)).reduce((n, s) => n + s.pts, 0);
  const points = [];
  let last = { remaining: committed, scopeAdded: 0 };
  for (let i = 0; i <= days; i += 1) {
    const d = new Date(start.getTime() + i * DAY);
    if (d.getTime() <= chartTo) {
      const t = d.getTime() + DAY - 1;
      let remaining = 0;
      let scopeAdded = 0;
      for (const s of spans) {
        if (!(s.from <= t && (s.to === null || s.to > t))) continue;
        if (!(s.doneAt !== null && s.doneAt <= t)) remaining += s.pts;
        if (s.from > startMs) scopeAdded += s.pts;
      }
      last = { remaining, scopeAdded };
    }
    // Days after today/close carry the last value forward so the chart never sees a missing point.
    points.push({
      date: dayKey(d),
      remaining: last.remaining,
      ideal: Math.round(committed * (1 - i / days) * 10) / 10,
      scopeAdded: last.scopeAdded,
    });
  }
  return { sprintId: sprint._id, committed, points };
}

export async function getVelocity(projectId) {
  const sprints = await Sprint.find({ projectId, state: 'closed' })
    .sort({ closedAt: -1 })
    .limit(10)
    .select('name velocity points closedAt')
    .lean();
  const list = sprints.map((s) => ({
    sprintId: s._id,
    name: s.name,
    velocity: s.velocity ?? s.points?.done ?? 0,
    committed: s.points?.committed ?? 0,
    done: s.points?.done ?? 0,
    closedAt: s.closedAt ?? null,
  }));
  const average = list.length ? Math.round((list.reduce((n, s) => n + s.velocity, 0) / list.length) * 10) / 10 : 0;
  return { sprints: list, average };
}

export async function getTimeSpent(projectId, query) {
  const { from, to } = dateWindow(query);
  const rows = await rowsFor(projectId, from, to);
  return rows.map((r) => ({ date: dayKey(r.date), hours: Math.round(((r.flat.spentSec ?? 0) / 3600) * 10) / 10 }));
}

export async function getWorkload(projectId, viewerId = null, seesPrivate = true) {
  const hidden = viewerId ? await hiddenIssueIds(oid(projectId), viewerId, seesPrivate) : [];
  const rows = await Issue.aggregate([
    { $match: { projectId: oid(projectId), ...(hidden.length ? { _id: { $nin: hidden } } : {}), deletedAt: null, statusCategory: { $ne: 'done' }, assigneeId: { $ne: null } } },
    { $group: { _id: '$assigneeId', openItems: { $sum: 1 }, openPoints: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
    { $sort: { openItems: -1 } },
  ]);
  const users = await getPublicUsers(rows.map((r) => String(r._id)));
  return rows.map((r) => ({
    userId: r._id,
    name: users.get(String(r._id))?.displayName ?? null,
    openItems: r.openItems,
    openPoints: r.openPoints,
  }));
}
