import mongoose from 'mongoose';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { emitEvent } from '../../services/events.service.js';
import { actorOf, logActivity } from '../../services/activity.service.js';
import Release from '../../models/project/releases.model.js';
import Issue from '../../models/issue/issues.model.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

export async function assertReleaseInProject(projectId, releaseId) {
  const release = await Release.findOne({ _id: releaseId, projectId }).lean();
  if (!release) throw new ApiError(404, 'Release not found');
  return release;
}

// Recomputes item and done counts from issues tagged with the release.
async function refreshCounts(projectId, releaseId) {
  const [agg] = await Issue.aggregate([
    { $match: { projectId: oid(projectId), releaseIds: oid(releaseId) } },
    {
      $group: {
        _id: null,
        items: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, 1, 0] } },
      },
    },
  ]);
  return Release.findByIdAndUpdate(
    releaseId,
    { $set: { counts: { items: agg?.items ?? 0, done: agg?.done ?? 0 } } },
    { returnDocument: 'after' },
  ).lean();
}

export function listReleases({ projectId, query }) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  return paginate(Release, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

export async function getRelease({ projectId, releaseId }) {
  await assertReleaseInProject(projectId, releaseId);
  return refreshCounts(projectId, releaseId);
}

export async function createRelease({ projectId, input }) {
  const release = await Release.create({ ...input, projectId, counts: { items: 0, done: 0 } });
  return release.toObject();
}

export async function updateRelease({ projectId, releaseId, input }) {
  if (input.status === 'released') throw new ApiError(422, 'Use the ship endpoint to release');
  const release = await Release.findOneAndUpdate(
    { _id: releaseId, projectId },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!release) throw new ApiError(404, 'Release not found');
  return release;
}

// Marks a planned or in-progress release as released and stamps releaseDate with the ship time.
export async function shipRelease({ project, releaseId, actorId }) {
  const projectId = project._id;
  await assertReleaseInProject(projectId, releaseId);
  const shipped = await Release.findOneAndUpdate(
    { _id: releaseId, projectId, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'released', releaseDate: new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!shipped) throw new ApiError(409, 'Release is already released or archived');
  const counted = await refreshCounts(projectId, releaseId);
  emitEvent({ type: 'release.shipped', orgId: project.orgId ?? null, projectId, actorId, payload: { releaseId: String(releaseId) }, at: new Date() });
  await logActivity({
    projectId,
    orgId: project.orgId ?? null,
    kind: 'releaseShipped',
    actor: await actorOf({ id: actorId }),
    item: { id: releaseId, title: shipped.name },
    summary: `Shipped ${shipped.name}`,
  });
  return counted;
}

export async function deleteRelease({ projectId, releaseId }) {
  await assertReleaseInProject(projectId, releaseId);
  await Release.deleteOne({ _id: releaseId, projectId });
  await Issue.updateMany({ projectId, releaseIds: releaseId }, { $pull: { releaseIds: releaseId } });
}
