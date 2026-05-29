import mongoose from 'mongoose';
import { SlaTimer, Approval, ProjectMember, Project } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { actorOf } from '../../services/activity.service.js';
import { emitEvent } from '../../services/events.service.js';
import { notify } from '../../services/notify.service.js';
import { getIssueInProject, getVisibleIssue } from '../issue/issue.service.js';

const oid = (v) => new mongoose.Types.ObjectId(v);

async function timerInProject(projectId, timerId) {
  const timer = await SlaTimer.findOne({ _id: timerId, projectId }).lean();
  if (!timer) throw new ApiError(404, 'Timer not found');
  return timer;
}

export function listSlaTimers(projectId, query) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  if (query.issueId) filter.issueId = oid(query.issueId);
  return paginate(SlaTimer, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function setTimerPaused(projectId, timerId, pause) {
  const timer = await timerInProject(projectId, timerId);
  const now = new Date();
  if (pause) {
    if (timer.status !== 'running') throw new ApiError(409, 'Timer is not running');
    return SlaTimer.findOneAndUpdate({ _id: timerId, projectId }, { $set: { status: 'paused', pausedAt: now } }, { returnDocument: 'after' }).lean();
  }
  if (timer.status !== 'paused') throw new ApiError(409, 'Timer is not paused');
  const pausedMs = now - new Date(timer.pausedAt ?? now);
  return SlaTimer.findOneAndUpdate(
    { _id: timerId, projectId },
    {
      $set: { status: 'running', pausedAt: null, dueAt: new Date(new Date(timer.dueAt).getTime() + pausedMs) },
      $inc: { pausedSeconds: Math.round(pausedMs / 1000) },
    },
    { returnDocument: 'after' },
  ).lean();
}

// viewerId omitted = legacy unfiltered; controller should pass req.user.id and canSeePrivateIssues(req.projectRole).
export async function listApprovals(projectId, issueId, query, viewerId = null, seesPrivate = false) {
  if (viewerId) await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  else await getIssueInProject(projectId, issueId);
  return paginate(Approval, { projectId, issueId: oid(issueId) }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

// seesPrivate undefined = legacy unfiltered; controller should pass canSeePrivateIssues(req.projectRole).
export async function requestApprovals(project, userId, issueId, approverIds, seesPrivate) {
  const issue =
    seesPrivate === undefined
      ? await getIssueInProject(project._id, issueId)
      : await getVisibleIssue(project._id, issueId, userId, seesPrivate);
  const unique = [...new Set(approverIds.map(String))];
  const members = await ProjectMember.countDocuments({ projectId: project._id, userId: { $in: unique.map(oid) }, status: 'active' });
  if (members !== unique.length) throw new ApiError(422, 'Approvers must be active project members');
  const requestedAt = new Date();
  const rows = [];
  for (const approverId of unique) {
    const approver = await actorOf({ id: approverId });
    rows.push({
      projectId: project._id,
      issueId,
      approverId,
      approverName: approver.name,
      approverAvatar: approver.avatar ?? null,
      decision: 'pending',
      requestedBy: userId,
      requestedAt,
    });
  }
  const created = await Approval.insertMany(rows);
  await notify({
    userIds: unique,
    type: 'approval',
    title: `Approval requested: ${issue.key}`,
    projectId: project._id,
    orgId: project.orgId ?? null,
    link: { kind: 'issue', id: issueId, key: issue.key },
    actorId: userId,
  });
  return created.map((d) => d.toObject());
}

export async function decideApproval(projectId, userId, approvalId, decision, comment) {
  const approval = await Approval.findOne({ _id: approvalId, projectId }).lean();
  if (!approval) throw new ApiError(404, 'Approval not found');
  if (String(approval.approverId) !== String(userId)) throw new ApiError(403, 'Only the approver can decide');
  const now = new Date();
  const updated = await Approval.findOneAndUpdate(
    { _id: approvalId, projectId, decision: 'pending' },
    { $set: { decision, comment: comment ?? '', decidedAt: now } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw new ApiError(409, 'Approval already decided');

  // Any decline declines the whole request; the others in the batch are closed.
  const batch = { projectId, issueId: approval.issueId, requestedAt: approval.requestedAt };
  if (decision === 'rejected') {
    await Approval.updateMany({ ...batch, decision: 'pending' }, { $set: { decision: 'rejected', comment: 'Declined by another approver', decidedAt: now } });
  }
  const pending = await Approval.countDocuments({ ...batch, decision: 'pending' });
  const outcome = decision === 'rejected' ? 'declined' : pending === 0 ? 'approved' : 'pending';

  const project = await Project.findById(projectId).select('orgId').lean();
  const orgId = project?.orgId ?? null;
  await notify({
    userIds: [approval.requestedBy],
    type: 'approval',
    title: `Approval ${decision}`,
    body: comment ?? '',
    projectId,
    orgId,
    link: { kind: 'issue', id: approval.issueId },
    actorId: userId,
  });
  emitEvent({
    type: 'approval.decided',
    orgId,
    projectId,
    actorId: userId,
    issueId: approval.issueId,
    payload: { approvalId, decision, outcome },
    at: now,
  });
  return updated;
}
