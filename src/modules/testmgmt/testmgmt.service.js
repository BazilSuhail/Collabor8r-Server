import mongoose from 'mongoose';
import { TestCase, TestRun, TestResult } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { actorOf } from '../../services/activity.service.js';

const oid = (v) => new mongoose.Types.ObjectId(v);
const STATUSES = ['passed', 'failed', 'blocked', 'skipped'];

// Rebuilds the run's progress counts from its stored results.
export async function recomputeCounts(projectId, runId) {
  const rows = await TestResult.aggregate([
    { $match: { projectId: oid(projectId), runId: oid(runId) } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const counts = { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const r of rows) {
    if (STATUSES.includes(r._id)) counts[r._id] = r.n;
  }
  counts.total = await TestCase.countDocuments({ projectId, status: 'ready' });
  await TestRun.updateOne({ _id: runId, projectId }, { $set: { counts } });
  return counts;
}

async function runInProject(projectId, runId) {
  const run = await TestRun.findOne({ _id: runId, projectId }).lean();
  if (!run) throw new ApiError(404, 'Test run not found');
  return run;
}

export async function listResults(projectId, runId, query) {
  await runInProject(projectId, runId);
  return paginate(TestResult, { projectId: oid(projectId), runId: oid(runId) }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function upsertResult(projectId, userId, runId, body) {
  const run = await runInProject(projectId, runId);
  const testCase = await TestCase.findOne({ _id: body.caseId, projectId }).select('_id').lean();
  if (!testCase) throw new ApiError(422, 'Test case not found in project');
  const tester = await actorOf({ id: userId });
  const now = new Date();
  const result = await TestResult.findOneAndUpdate(
    { runId: oid(runId), caseId: oid(body.caseId) },
    {
      $set: {
        projectId: oid(projectId),
        status: body.status,
        notes: body.notes ?? '',
        durationSec: body.durationSec ?? 0,
        bugItemId: body.bugItemId ?? null,
        testedBy: userId,
        testedByName: tester.name,
        testedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  await TestCase.updateOne({ _id: body.caseId, projectId }, { $set: { lastResult: body.status, lastRunAt: now } });
  if (run.status === 'planned') {
    await TestRun.updateOne({ _id: runId, projectId }, { $set: { status: 'inProgress', startedAt: now } });
  }
  await recomputeCounts(projectId, runId);
  return result;
}

export async function completeRun(projectId, runId) {
  const run = await runInProject(projectId, runId);
  if (run.status === 'completed') throw new ApiError(409, 'Test run already completed');
  await recomputeCounts(projectId, runId);
  return TestRun.findOneAndUpdate(
    { _id: runId, projectId },
    { $set: { status: 'completed', completedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
}

export async function getResult(projectId, runId, resultId) {
  await runInProject(projectId, runId);
  const result = await TestResult.findOne({ _id: resultId, runId, projectId }).lean();
  if (!result) throw new ApiError(404, 'Test result not found');
  return result;
}

export async function deleteResult(projectId, runId, resultId) {
  await runInProject(projectId, runId);
  const result = await TestResult.findOneAndDelete({ _id: resultId, runId, projectId }).lean();
  if (!result) throw new ApiError(404, 'Test result not found');
  await recomputeCounts(projectId, runId);
  return null;
}
