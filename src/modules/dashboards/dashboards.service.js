import mongoose from 'mongoose';
import { Dashboard, Goal, Issue } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { actorOf } from '../../services/activity.service.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';

const oid = (v) => new mongoose.Types.ObjectId(v);
const canManage = (doc, userId, role) => String(doc.ownerId) === String(userId) || (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK.lead;

async function dashboardInProject(projectId, id) {
  const dash = await Dashboard.findOne({ _id: id, projectId }).lean();
  if (!dash) throw new ApiError(404, 'Dashboard not found');
  return dash;
}

async function goalInProject(projectId, id) {
  const goal = await Goal.findOne({ _id: id, projectId }).lean();
  if (!goal) throw new ApiError(404, 'Goal not found');
  return goal;
}

async function clearOtherDefaults(projectId, exceptId) {
  await Dashboard.updateMany({ projectId, isDefault: true, _id: { $ne: exceptId } }, { $set: { isDefault: false } });
}

export function listDashboards(projectId, userId, query) {
  const filter = {
    projectId,
    $or: [
      { ownerId: oid(userId) },
      { 'sharedWith.scope': 'project' },
      { 'sharedWith.scope': 'users', 'sharedWith.userIds': oid(userId) },
    ],
  };
  return paginate(Dashboard, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function createDashboard(project, userId, body) {
  const dash = await Dashboard.create({ ...body, projectId: project._id, orgId: project.orgId ?? null, ownerId: userId });
  if (dash.isDefault) await clearOtherDefaults(project._id, dash._id);
  return dash.toObject();
}

export async function getDashboard(projectId, userId, id) {
  const dash = await dashboardInProject(projectId, id);
  const visible = String(dash.ownerId) === String(userId)
    || dash.sharedWith?.scope === 'project'
    || (dash.sharedWith?.scope === 'users' && (dash.sharedWith.userIds ?? []).some((u) => String(u) === String(userId)));
  if (!visible) throw new ApiError(404, 'Dashboard not found');
  return dash;
}

export async function updateDashboard(project, userId, role, id, body) {
  const dash = await dashboardInProject(project._id, id);
  if (!canManage(dash, userId, role)) throw new ApiError(403, 'Only the owner or a lead can edit this dashboard');
  const updated = await Dashboard.findOneAndUpdate({ _id: id, projectId: project._id }, { $set: body }, { returnDocument: 'after', runValidators: true }).lean();
  if (body.isDefault) await clearOtherDefaults(project._id, id);
  return updated;
}

export async function deleteDashboard(projectId, userId, role, id) {
  const dash = await dashboardInProject(projectId, id);
  if (!canManage(dash, userId, role)) throw new ApiError(403, 'Only the owner or a lead can delete this dashboard');
  await Dashboard.deleteOne({ _id: id, projectId });
}

// Goal progress: linked metrics are read from issues; custom goals keep the stored value.
async function withProgress(projectId, goal) {
  let current = goal.current ?? 0;
  if (goal.metric !== 'custom' && goal.linkedItemIds?.length) {
    const match = { projectId: oid(projectId), _id: { $in: goal.linkedItemIds.map(oid) }, deletedAt: null };
    const [agg] = await Issue.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          doneCount: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, 1, 0] } },
          donePoints: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, { $ifNull: ['$storyPoints', 0] }, 0] } },
          spentSec: { $sum: { $ifNull: ['$spentSec', 0] } },
        },
      },
    ]);
    if (goal.metric === 'itemCount') current = agg?.doneCount ?? 0;
    if (goal.metric === 'points') current = agg?.donePoints ?? 0;
    if (goal.metric === 'timeSpent') current = Math.round(((agg?.spentSec ?? 0) / 3600) * 10) / 10;
  }
  const progress = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
  return { ...goal, current, progress };
}

export async function listGoals(projectId, query) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  const { items, meta } = await paginate(Goal, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
  return { items: await Promise.all(items.map((g) => withProgress(projectId, g))), meta };
}

export async function createGoal(project, userId, body) {
  const owner = body.ownerId ? await actorOf({ id: body.ownerId }) : null;
  const goal = await Goal.create({
    ...body,
    projectId: project._id,
    orgId: project.orgId ?? null,
    ownerName: owner?.name ?? '',
    current: body.current ?? 0,
    status: body.status ?? 'on_track',
  });
  return goal.toObject();
}

export async function getGoal(projectId, id) {
  return withProgress(projectId, await goalInProject(projectId, id));
}

export async function updateGoal(projectId, id, body) {
  await goalInProject(projectId, id);
  const set = { ...body };
  if (body.ownerId !== undefined) set.ownerName = body.ownerId ? (await actorOf({ id: body.ownerId })).name : '';
  const goal = await Goal.findOneAndUpdate({ _id: id, projectId }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
  return withProgress(projectId, goal);
}

export async function deleteGoal(projectId, id) {
  await goalInProject(projectId, id);
  await Goal.deleteOne({ _id: id, projectId });
}

export async function recordProgress(projectId, id, current) {
  const goal = await goalInProject(projectId, id);
  const status = current >= goal.target ? 'done' : goal.status === 'done' ? 'on_track' : goal.status;
  const updated = await Goal.findOneAndUpdate({ _id: id, projectId }, { $set: { current, status } }, { returnDocument: 'after' }).lean();
  return withProgress(projectId, updated);
}
