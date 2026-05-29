import mongoose from 'mongoose';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { emitEvent } from '../../services/events.service.js';
import { notify } from '../../services/notify.service.js';
import { actorOf, logActivity } from '../../services/activity.service.js';
import { writeHistory } from '../../services/history.service.js';
import { logger } from '../../utils/logger.js';
import Sprint from '../../models/project/sprints.model.js';
import Board from '../../models/project/boards.model.js';
import ProjectMember from '../../models/project/projectMembers.model.js';
import Issue from '../../models/issue/issues.model.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function assertDateOrder(start, end) {
  if (start && end && end < start) throw new ApiError(422, 'endDate must be on or after startDate');
}

export async function assertSprintInProject(projectId, sprintId) {
  const sprint = await Sprint.findOne({ _id: sprintId, projectId }).lean();
  if (!sprint) throw new ApiError(404, 'Sprint not found');
  return sprint;
}

export async function getActiveSprint(projectId, boardId) {
  const filter = { projectId, state: 'active' };
  if (boardId) filter.boardId = boardId;
  return Sprint.findOne(filter).lean();
}

async function notifyMembers(project, title, sprintId, actorId) {
  const userIds = await ProjectMember.find({ projectId: project._id, status: 'active' }).distinct('userId');
  await notify({
    userIds,
    type: 'statusChanged',
    title,
    projectId: project._id,
    orgId: project.orgId ?? null,
    link: { kind: 'sprint', id: String(sprintId) },
    actorId,
  });
}

export function listSprints({ projectId, query }) {
  const filter = { projectId };
  if (query.state) filter.state = query.state;
  if (query.boardId) filter.boardId = query.boardId;
  return paginate(Sprint, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

export async function createSprint({ project, input, actorId }) {
  assertDateOrder(input.startDate, input.endDate);
  if (!(await Board.exists({ _id: input.boardId, projectId: project._id }))) {
    throw new ApiError(422, 'Board not found in project');
  }
  const sprint = await Sprint.create({
    ...input,
    projectId: project._id,
    state: 'planned',
    goal: input.goal ?? '',
    createdBy: actorId,
    counts: { items: 0, done: 0, inProgress: 0, blocked: 0 },
    points: { committed: 0, added: 0, removed: 0, done: 0 },
  });
  return sprint.toObject();
}

export async function updateSprint({ projectId, sprintId, input }) {
  const sprint = await assertSprintInProject(projectId, sprintId);
  if (sprint.state === 'closed') throw new ApiError(409, 'Closed sprints cannot be edited');
  assertDateOrder(input.startDate ?? sprint.startDate, input.endDate ?? sprint.endDate);
  return Sprint.findOneAndUpdate(
    { _id: sprintId, projectId },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
}

// Planned -> active. Needs dates, one active sprint per board, and snapshots committed points.
export async function startSprint({ project, sprintId, input, actorId }) {
  const projectId = project._id;
  const sprint = await assertSprintInProject(projectId, sprintId);
  if (sprint.state !== 'planned') throw new ApiError(409, 'Only planned sprints can be started');
  const startDate = input.startDate ?? sprint.startDate;
  const endDate = input.endDate ?? sprint.endDate;
  if (!startDate || !endDate) throw new ApiError(422, 'Sprint needs startDate and endDate');
  assertDateOrder(startDate, endDate);
  const boardId = sprint.boardId;
  const busy = 'Another sprint is already active on this board';
  if (await Sprint.exists({ projectId, boardId, state: 'active' })) throw new ApiError(409, busy);

  // Claim the planned -> active transition atomically.
  const claimed = await Sprint.findOneAndUpdate(
    { _id: sprintId, projectId, state: 'planned' },
    { $set: { state: 'active', startDate, endDate, startedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) throw new ApiError(409, 'Only planned sprints can be started');
  // Back out if a concurrent start activated another sprint on this board.
  if (await Sprint.exists({ projectId, boardId, state: 'active', _id: { $ne: sprintId } })) {
    await Sprint.updateOne({ _id: sprintId }, { $set: { state: 'planned', startedAt: null } });
    throw new ApiError(409, busy);
  }

  const [agg] = await Issue.aggregate([
    { $match: { projectId: oid(projectId), sprintId: oid(sprintId) } },
    { $group: { _id: null, items: { $sum: 1 }, points: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
  ]);
  const started = await Sprint.findOneAndUpdate(
    { _id: sprintId },
    { $set: { 'points.committed': agg?.points ?? 0, 'counts.items': agg?.items ?? 0 } },
    { returnDocument: 'after' },
  ).lean();

  emitEvent({ type: 'sprint.started', orgId: project.orgId ?? null, projectId, actorId, payload: { sprintId: String(sprintId) }, at: new Date() });
  await logActivity({
    projectId,
    orgId: project.orgId ?? null,
    kind: 'sprintStarted',
    actor: await actorOf({ id: actorId }),
    item: { id: sprintId, title: sprint.name },
    summary: `Started sprint ${sprint.name}`,
  });
  await notifyMembers(project, `Sprint "${sprint.name}" started`, sprintId, actorId);
  return started;
}

// Active -> closed. Records stats and velocity, then moves unresolved issues per carryOver.
export async function completeSprint({ project, sprintId, input, actorId }) {
  const projectId = project._id;
  const sprint = await assertSprintInProject(projectId, sprintId);
  if (sprint.state !== 'active') throw new ApiError(409, 'Only active sprints can be completed');

  let nextId = null;
  if (input.carryOver !== 'backlog') {
    if (String(input.carryOver) === String(sprintId)) throw new ApiError(422, 'carryOver must be a different sprint');
    const next = await assertSprintInProject(projectId, input.carryOver);
    if (next.state === 'closed') throw new ApiError(422, 'Carry-over sprint is closed');
    nextId = next._id;
  }

  // Close first so a retry sees the sprint as closed and gets 409.
  const closed = await Sprint.findOneAndUpdate(
    { _id: sprintId, projectId, state: 'active' },
    { $set: { state: 'closed', closedAt: new Date(), retroNote: input.retroNote ?? sprint.retroNote ?? '' } },
    { returnDocument: 'after' },
  ).lean();
  if (!closed) throw new ApiError(409, 'Sprint is already closed');

  const pid = oid(projectId);
  const sid = oid(sprintId);
  const [stats] = await Issue.aggregate([
    { $match: { projectId: pid, sprintId: sid } },
    {
      $group: {
        _id: null,
        items: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$statusCategory', 'inprogress'] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$flags.isBlocked', true] }, 1, 0] } },
        donePoints: { $sum: { $cond: [{ $eq: ['$statusCategory', 'done'] }, { $ifNull: ['$storyPoints', 0] }, 0] } },
      },
    },
  ]);
  const s = stats ?? { items: 0, done: 0, inProgress: 0, blocked: 0, donePoints: 0 };

  const unresolved = { projectId: pid, sprintId: sid, statusCategory: { $ne: 'done' } };
  const carriedCount = await Issue.countDocuments(unresolved);
  // Capture carried ids first so membership history can be written after the move (best effort).
  let carriedIds = [];
  try {
    carriedIds = (await Issue.find(unresolved).select('_id').lean()).map((i) => i._id);
  } catch (err) {
    logger.warn('carry-over id capture failed', err);
  }
  await Issue.updateMany(unresolved, { $set: { sprintId: nextId } });
  try {
    for (const issueId of carriedIds) {
      await writeHistory({ issueId, projectId, actorId, changes: { sprintId: { from: sid, to: nextId } } });
    }
  } catch (err) {
    logger.warn('carry-over sprintId history write failed', err);
  }

  const completed = await Sprint.findOneAndUpdate(
    { _id: sprintId },
    {
      $set: {
        'counts.items': s.items,
        'counts.done': s.done,
        'counts.inProgress': s.inProgress,
        'counts.blocked': s.blocked,
        'points.done': s.donePoints,
        velocity: s.donePoints,
      },
    },
    { returnDocument: 'after' },
  ).lean();

  emitEvent({
    type: 'sprint.completed',
    orgId: project.orgId ?? null,
    projectId,
    actorId,
    payload: { sprintId: String(sprintId), carriedCount, nextSprintId: nextId ? String(nextId) : null },
    at: new Date(),
  });
  await logActivity({
    projectId,
    orgId: project.orgId ?? null,
    kind: 'sprintClosed',
    actor: await actorOf({ id: actorId }),
    item: { id: sprintId, title: sprint.name },
    summary: `Completed sprint ${sprint.name}`,
  });
  await notifyMembers(project, `Sprint "${sprint.name}" completed`, sprintId, actorId);
  return { ...completed, carriedCount };
}

// Only planned sprints can be deleted; their issues return to the backlog.
export async function deleteSprint({ projectId, sprintId }) {
  const sprint = await assertSprintInProject(projectId, sprintId);
  if (sprint.state !== 'planned') throw new ApiError(409, 'Only planned sprints can be deleted');
  await Issue.updateMany({ projectId, sprintId }, { $set: { sprintId: null } });
  await Sprint.deleteOne({ _id: sprintId, projectId });
}
