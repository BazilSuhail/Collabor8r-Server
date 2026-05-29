import { Issue, IssueComment } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { bumpRollup } from '../../services/rollup.service.js';
import { emitEvent } from '../../services/events.service.js';
import { logActivity, actorOf } from '../../services/activity.service.js';
import { notify, notifyMentions } from '../../services/notify.service.js';
import { getVisibleIssue, issueSnapshot } from '../issue/issue.service.js';

const sameId = (a, b) => String(a) === String(b);

export async function addCommentInternal({ projectId, issueId, authorId = null, body, internal = false, seesPrivate = true }) {
  // Internal callers (automation, forms) omit seesPrivate and are trusted; the API controller passes it.
  const issue = await getVisibleIssue(projectId, issueId, authorId, seesPrivate);
  const now = new Date();
  const actor = authorId ? await actorOf({ id: String(authorId) }) : { id: null, name: 'System', avatar: null };
  const link = { kind: 'issue', id: String(issue._id), key: issue.key };

  const mentions = await notifyMentions(body, {
    projectId,
    orgId: issue.orgId,
    actorId: authorId,
    title: `Mentioned in ${issue.key}`,
    link,
    issue,
    internal,
  });

  const comment = await IssueComment.create({
    projectId,
    issueId,
    parentId: null,
    authorId,
    authorName: actor.name,
    authorAvatar: actor.avatar,
    body,
    mentions,
    reactions: [],
    source: 'user',
    internal,
    createdAt: now,
  });

  await Issue.updateOne(
    { _id: issue._id, projectId },
    { $inc: { 'counts.comments': 1 }, $set: { lastActivityAt: now, lastActivityBy: authorId } }
  );
  await bumpRollup({ projectId, orgId: issue.orgId, date: now, inc: { comments: 1 } });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'commentAdded',
    actor,
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `commented on ${issue.key}`,
  });
  emitEvent({
    type: 'comment.added',
    orgId: issue.orgId,
    projectId,
    actorId: authorId,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    payload: { commentId: String(comment._id), internal },
    at: now,
  });

  if (!internal) {
    const mentioned = new Set(mentions.map(String));
    const watchers = [...new Set([...(issue.watcherIds ?? []), issue.assigneeId, issue.reporterId].filter(Boolean).map(String))].filter(
      (id) => !sameId(id, authorId) && !mentioned.has(id)
    );
    if (watchers.length) {
      await notify({
        userIds: watchers,
        type: 'commented',
        title: `New comment on ${issue.key}`,
        projectId,
        orgId: issue.orgId,
        link,
        actorId: authorId,
      });
    }
  }
  return comment.toObject();
}

async function findComment(projectId, issueId, commentId) {
  const comment = await IssueComment.findOne({ _id: commentId, projectId, issueId, deletedAt: null }).lean();
  if (!comment) throw new ApiError(404, 'Comment not found');
  return comment;
}

export async function listComments({ projectId, issueId, query, seesInternal, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const filter = { projectId, issueId, deletedAt: null };
  if (!seesInternal) filter.internal = { $ne: true };
  return paginate(IssueComment, filter, {
    sort: { createdAt: 1, _id: 1 },
    cursorField: 'createdAt',
    limit: query.limit,
    cursor: query.cursor,
  });
}

export async function updateComment({ projectId, issueId, commentId, body, actorId, isLead, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  const comment = await findComment(projectId, issueId, commentId);
  if (!sameId(comment.authorId, actorId) && !isLead) {
    throw new ApiError(403, 'Only the author or a lead can edit this comment');
  }
  return IssueComment.findOneAndUpdate(
    { _id: commentId, projectId, issueId, deletedAt: null },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: 'after' }
  ).lean();
}

export async function deleteComment({ projectId, issueId, commentId, actorId, isLead, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  const comment = await findComment(projectId, issueId, commentId);
  if (!sameId(comment.authorId, actorId) && !isLead) {
    throw new ApiError(403, 'Only the author or a lead can delete this comment');
  }
  await IssueComment.updateOne({ _id: commentId, projectId }, { $set: { deletedAt: new Date() } });
  await Issue.updateOne({ _id: issueId, projectId }, { $inc: { 'counts.comments': -1 } });
}
