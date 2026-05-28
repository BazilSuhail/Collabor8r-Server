import mongoose from 'mongoose';
import { BudgetLine, BudgetActual } from '../../models/index.js';

// Planned vs actual per budget line, with totals.
export async function budgetSummary(projectId) {
  const lines = await BudgetLine.find({ projectId }).select('name category planned forecast currency').lean();
  const sums = await BudgetActual.aggregate([
    { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
    { $group: { _id: '$budgetLineId', actual: { $sum: '$amount' } } },
  ]);
  const actualByLine = new Map(sums.map((s) => [String(s._id), s.actual]));
  const rows = lines.map((line) => {
    const actual = actualByLine.get(String(line._id)) ?? 0;
    const planned = line.planned ?? 0;
    return {
      lineId: line._id,
      name: line.name,
      category: line.category ?? '',
      currency: line.currency,
      planned,
      forecast: line.forecast ?? 0,
      actual,
      variance: planned - actual,
    };
  });
  const totals = rows.reduce(
    (t, r) => ({ planned: t.planned + r.planned, forecast: t.forecast + r.forecast, actual: t.actual + r.actual }),
    { planned: 0, forecast: 0, actual: 0 },
  );
  return { lines: rows, totals: { ...totals, variance: totals.planned - totals.actual } };
}
