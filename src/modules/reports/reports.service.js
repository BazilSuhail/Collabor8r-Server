import mongoose from 'mongoose';
import { Issue, Sprint } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { getRollups } from '../../services/rollup.service.js';
import { actorOf } from '../../services/activity.service.js';

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

export async function getBurndown(projectId, query) {
  if (!query.sprintId) throw new ApiError(422, 'sprintId is required');
  const sprint = await Sprint.findOne({ _id: query.sprintId, projectId }).lean();
  if (!sprint) throw new ApiError(404, 'Sprint not found');
  const committed = sprint.points?.committed ?? 0;
  const start = new Date(sprint.startDate ?? sprint.createdAt);
  const end = new Date(sprint.endDate ?? new Date());
  const days = Math.max(1, Math.round((end - start) / DAY));
  const rows = await rowsFor(projectId, start, new Date(Math.min(end.getTime(), Date.now())));
  let resolved = 0;
  const byDay = new Map(rows.map((r) => [dayKey(r.date), r.flat['points.resolved'] ?? 0]));
  const points = [];
  for (let i = 0; i <= days; i += 1) {
    const d = new Date(start.getTime() + i * DAY);
    resolved += byDay.get(dayKey(d)) ?? 0;
    points.push({
      date: dayKey(d),
      remaining: Math.max(0, committed - resolved),
      ideal: Math.round((committed * (1 - i / days)) * 10) / 10,
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

export async function getWorkload(projectId) {
  const rows = await Issue.aggregate([
    { $match: { projectId: oid(projectId), deletedAt: null, statusCategory: { $ne: 'done' }, assigneeId: { $ne: null } } },
    { $group: { _id: '$assigneeId', openItems: { $sum: 1 }, openPoints: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
    { $sort: { openItems: -1 } },
  ]);
  return Promise.all(rows.map(async (r) => {
    const user = await actorOf({ id: String(r._id) });
    return { userId: r._id, name: user.name, openItems: r.openItems, openPoints: r.openPoints };
  }));
}
