import { Issue, IssueLink } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { emitEvent } from '../../services/events.service.js';
import { logActivity, actorOf } from '../../services/activity.service.js';
import { getVisibleIssue, assertVisible, privateFilter, issueSnapshot } from '../issue/issue.service.js';

// Label shown from the other end of a stored link.
const INVERSE = { blocks: 'isBlockedBy', duplicates: 'isDuplicatedBy', relates: 'relates', clones: 'clones' };

const PRIVATE_TITLE = 'Private issue';

export async function listLinks({ projectId, issueId, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const rows = await IssueLink.find({
    projectId,
    $or: [{ fromIssueId: issueId }, { toIssueId: issueId }],
  })
    .sort({ createdAt: -1 })
    .lean();
  // Other ends the viewer cannot see (private-issue rule, applied in Mongo).
  const otherIds = rows.map((l) => (String(l.fromIssueId) === String(issueId) ? l.toIssueId : l.fromIssueId));
  const hiddenDocs = seesPrivate
    ? []
    : await Issue.find({ projectId, _id: { $in: otherIds }, isPrivate: true, $nor: privateFilter(viewerId) }, { _id: 1 }).lean();
  const hidden = new Set(hiddenDocs.map((i) => String(i._id)));
  return rows.map((l) => {
    const outgoing = String(l.fromIssueId) === String(issueId);
    const otherHidden = hidden.has(String(outgoing ? l.toIssueId : l.fromIssueId));
    return {
      _id: l._id,
      type: outgoing ? l.type : (INVERSE[l.type] ?? l.type),
      issueId: outgoing ? l.toIssueId : l.fromIssueId,
      key: outgoing ? l.toKey : l.fromKey,
      title: otherHidden ? PRIVATE_TITLE : outgoing ? l.toTitle : l.fromTitle,
      createdBy: l.createdBy ?? null,
      createdAt: l.createdAt,
    };
  });
}

export async function createLink({ projectId, issueId, targetIssueId, type, actorId, seesPrivate = false }) {
  const from = await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  if (String(targetIssueId) === String(issueId)) {
    throw new ApiError(422, 'Validation failed', [{ path: 'targetIssueId', message: 'An issue cannot link to itself' }]);
  }
  const to = await Issue.findOne({ _id: targetIssueId, projectId }).lean();
  if (!to) {
    throw new ApiError(422, 'Validation failed', [{ path: 'targetIssueId', message: 'Target issue must be in the same project' }]);
  }
  // A target the actor cannot see keeps its key but not its title.
  let toTitle = to.title;
  try {
    assertVisible(to, actorId, seesPrivate);
  } catch {
    toTitle = PRIVATE_TITLE;
  }
  const existing = await IssueLink.exists({
    projectId,
    $or: [
      { fromIssueId: from._id, toIssueId: to._id },
      { fromIssueId: to._id, toIssueId: from._id },
    ],
  });
  if (existing) throw new ApiError(409, 'Issues are already linked');

  const link = await IssueLink.create({
    projectId,
    fromIssueId: from._id,
    toIssueId: to._id,
    fromKey: from.key,
    toKey: to.key,
    fromTitle: from.title,
    toTitle,
    type,
    createdBy: actorId,
    createdAt: new Date(),
  });

  await logActivity({
    projectId,
    orgId: from.orgId,
    kind: 'issueUpdated',
    actor: await actorOf({ id: String(actorId) }),
    item: { id: from._id, key: from.key, title: from.title },
    summary: `linked ${from.key} to ${to.key} (${type})`,
  });
  emitEvent({
    type: 'issue.updated',
    orgId: from.orgId,
    projectId,
    actorId,
    issueId: from._id,
    issue: issueSnapshot(from),
    payload: { linkId: String(link._id), type },
    at: new Date(),
  });
  return link.toObject();
}

export async function deleteLink({ projectId, issueId, linkId, actorId, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  const link = await IssueLink.findOneAndDelete({
    _id: linkId,
    projectId,
    $or: [{ fromIssueId: issueId }, { toIssueId: issueId }],
  }).lean();
  if (!link) throw new ApiError(404, 'Link not found');

  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueUpdated',
    actor: await actorOf({ id: String(actorId) }),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `removed link from ${issue.key}`,
  });
  emitEvent({
    type: 'issue.updated',
    orgId: issue.orgId,
    projectId,
    actorId,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    payload: { linkId: String(linkId) },
    at: new Date(),
  });
}
