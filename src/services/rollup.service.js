// Daily project rollups, incremented with upserts.
import { Rollup } from '../models/index.js';
import { isoDay } from '../utils/helpers.js';

const dayKey = (day) => day.toISOString().slice(0, 10);

export const bumpRollup = async ({ projectId, orgId = null, date = new Date(), inc }) => {
  const $inc = {};
  for (const [metric, n] of Object.entries(inc ?? {})) {
    if (n) $inc[`counts.${metric}`] = n;
  }
  if (Object.keys($inc).length === 0) return;

  const day = isoDay(date);
  await Rollup.updateOne(
    { _id: `${projectId}:${dayKey(day)}` },
    { $setOnInsert: { projectId, orgId, date: day }, $inc },
    { upsert: true },
  );
};

export const getRollups = async ({ projectId, from, to }) => {
  const rows = await Rollup.find({ projectId, date: { $gte: isoDay(from), $lte: to } })
    .sort({ date: 1 })
    .select('date counts')
    .lean();
  return rows.map((row) => ({ date: row.date, counts: row.counts }));
};
