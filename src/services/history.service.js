// Issue field history: one issueHistory row per changed field.
import { IssueHistory } from '../models/index.js';
import { actorOf } from './activity.service.js';

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

const normalize = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v.toHexString === 'function') return v.toHexString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const displayOf = (v) => normalize(v);
const idOf = (v) => {
  const str = normalize(v);
  return str !== null && OBJECT_ID.test(str) ? str : null;
};

export const diffFields = (before, after, fields) => {
  const changes = {};
  for (const field of fields) {
    const from = before?.[field];
    const to = after?.[field];
    if (normalize(from) !== normalize(to)) changes[field] = { from, to };
  }
  return changes;
};

export const writeHistory = async ({ issueId, projectId, actorId = null, changes }) => {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return;

  const actor = actorId ? await actorOf({ id: String(actorId) }) : null;
  const at = new Date();
  const rows = [];
  for (const [field, { from, to }] of entries) {
    let secondsInPreviousStatus;
    if (field === 'status') {
      const last = await IssueHistory.findOne({ issueId, field: 'status' }).sort({ at: -1 }).select('at').lean();
      secondsInPreviousStatus = last ? Math.round((at - last.at) / 1000) : null;
    }
    rows.push({
      projectId,
      issueId,
      field,
      fromValue: displayOf(from),
      toValue: displayOf(to),
      fromId: idOf(from),
      toId: idOf(to),
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorAvatar: actor?.avatar ?? null,
      at,
      secondsInPreviousStatus: secondsInPreviousStatus ?? null,
    });
  }
  await IssueHistory.insertMany(rows);
};
