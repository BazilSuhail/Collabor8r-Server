import { Issue, Worklog } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { isoDay } from '../../utils/helpers.js';
import { paginate } from '../../utils/pagination.js';
import { bumpRollup } from '../../services/rollup.service.js';
import { emitEvent } from '../../services/events.service.js';
import { logActivity, actorOf } from '../../services/activity.service.js';
import { getVisibleIssue, issueSnapshot } from '../issue/issue.service.js';
import { withIssueVisibility } from '../../services/visibility.service.js';

const sameId = (a, b) => String(a) === String(b);

async function recordSpent(issue, projectId, seconds, actorId, summary, worklogId) {
  await bumpRollup({ projectId, orgId: issue.orgId, inc: { spentSec: seconds } });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueUpdated',
    actor: await actorOf({ id: String(actorId) }),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary,
  });
  emitEvent({
    type: 'issue.updated',
    orgId: issue.orgId,
    projectId,
    actorId,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    payload: { worklogId: String(worklogId) },
    at: new Date(),
  });
}

export async function addWorklog({ projectId, issueId, userId, input, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, userId, seesPrivate);
  const actor = await actorOf({ id: String(userId) });
  const startedAt = input.startedAt ?? new Date();
  const seconds = input.seconds;

  const doc = await Worklog.create({
    projectId,
    issueId,
    userId,
    userName: actor.name,
    userAvatar: actor.avatar,
    startedAt,
    seconds,
    billable: input.billable ?? false,
    comment: input.comment ?? '',
    source: input.source ?? 'manual',
    date: isoDay(input.date ?? startedAt),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (input.adjustRemaining) {
    await Issue.updateOne({ _id: issueId, projectId }, [
      {
        $set: {
          spentSec: { $add: [{ $ifNull: ['$spentSec', 0] }, seconds] },
          remainingSec: { $max: [0, { $subtract: [{ $ifNull: ['$remainingSec', 0] }, seconds] }] },
        },
      },
    ]);
  } else {
    await Issue.updateOne({ _id: issueId, projectId }, { $inc: { spentSec: seconds } });
  }

  await recordSpent(issue, projectId, seconds, userId, `logged ${seconds}s on ${issue.key}`, doc._id);
  return doc.toObject();
}

export async function listWorklogs({ projectId, issueId, query, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  return paginate(Worklog, { projectId, issueId }, { limit: query.limit, cursor: query.cursor });
}

export async function updateWorklog({ projectId, issueId, worklogId, input, userId, isLead, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, userId, seesPrivate);
  const wl = await Worklog.findOne({ _id: worklogId, projectId, issueId }).lean();
  if (!wl) throw new ApiError(404, 'Worklog not found');
  if (!sameId(wl.userId, userId) && !isLead) throw new ApiError(403, 'Only the author or a lead can edit this worklog');

  const set = { updatedAt: new Date() };
  if (input.seconds !== undefined) set.seconds = input.seconds;
  if (input.startedAt !== undefined) set.startedAt = input.startedAt;
  if (input.date !== undefined) set.date = isoDay(input.date);
  else if (input.startedAt !== undefined) set.date = isoDay(input.startedAt);
  if (input.billable !== undefined) set.billable = input.billable;
  if (input.comment !== undefined) set.comment = input.comment;

  const updated = await Worklog.findOneAndUpdate({ _id: worklogId, projectId }, { $set: set }, { returnDocument: 'after' }).lean();
  const delta = (input.seconds ?? wl.seconds) - wl.seconds;
  if (delta) {
    await Issue.updateOne({ _id: issueId, projectId }, { $inc: { spentSec: delta } });
    await recordSpent(issue, projectId, delta, userId, `changed time on ${issue.key}`, worklogId);
  }
  return updated;
}

export async function deleteWorklog({ projectId, issueId, worklogId, userId, isLead, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, userId, seesPrivate);
  const wl = await Worklog.findOne({ _id: worklogId, projectId, issueId }).lean();
  if (!wl) throw new ApiError(404, 'Worklog not found');
  if (!sameId(wl.userId, userId) && !isLead) throw new ApiError(403, 'Only the author or a lead can delete this worklog');

  await Worklog.deleteOne({ _id: worklogId, projectId });
  await Issue.updateOne({ _id: issueId, projectId }, { $inc: { spentSec: -wl.seconds } });
  await recordSpent(issue, projectId, -wl.seconds, userId, `removed time from ${issue.key}`, worklogId);
}

// viewerId/seesPrivate: pass from the controller to hide private-issue worklogs; omitted viewerId = unfiltered (legacy).
export async function timesheet({ projectId, query, viewerId = null, seesPrivate = false }) {
  let filter = { projectId };
  if (query.userId) filter.userId = query.userId;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = isoDay(query.from);
    if (query.to) filter.date.$lte = isoDay(query.to);
  }
  if (viewerId) filter = await withIssueVisibility(filter, 'issueId', { projectId, viewerId, seesPrivate });
  return paginate(Worklog, filter, { limit: query.limit, cursor: query.cursor });
}
