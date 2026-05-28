import { createHmac } from 'node:crypto';
import { Issue, IssueAttachment, IssueComment } from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { randomToken } from '../../utils/helpers.js';
import { emitEvent } from '../../services/events.service.js';
import { logActivity, actorOf } from '../../services/activity.service.js';
import { getVisibleIssue, issueSnapshot } from '../issue/issue.service.js';

const sanitize = (name) => name.replace(/[^\w.-]+/g, '_').slice(0, 120);
const sameId = (a, b) => String(a) === String(b);

// Placeholder signed URL: no bytes pass through the server.
function signedUrl(method, storageKey) {
  const exp = Math.floor(Date.now() / 1000) + env.uploadUrlTtlSec;
  const sig = createHmac('sha256', env.uploadSigningSecret).update(`${method}:${storageKey}:${exp}`).digest('hex');
  return {
    url: `${env.publicBaseUrl}/uploads/${storageKey}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export async function createUploadUrl({ projectId, issueId, name, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const storageKey = `projects/${projectId}/issues/${issueId}/${randomToken(12)}-${sanitize(name)}`;
  const { url, expiresAt } = signedUrl('PUT', storageKey);
  return { storageKey, uploadUrl: url, expiresAt };
}

export async function registerAttachment({ projectId, issueId, actorId, input, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  const prefix = `projects/${projectId}/issues/${issueId}/`;
  if (!input.storageKey.startsWith(prefix)) {
    throw new ApiError(422, 'Validation failed', [{ path: 'storageKey', message: 'Storage key does not belong to this issue' }]);
  }
  if (input.commentId && !(await IssueComment.exists({ _id: input.commentId, projectId, issueId }))) {
    throw new ApiError(422, 'Validation failed', [{ path: 'commentId', message: 'Comment must belong to this issue' }]);
  }

  const prev = await IssueAttachment.findOne({ projectId, issueId, name: input.name, deletedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  const actor = await actorOf({ id: String(actorId) });
  const now = new Date();
  const doc = await IssueAttachment.create({
    projectId,
    issueId,
    commentId: input.commentId ?? null,
    name: input.name,
    description: input.description ?? '',
    mime: input.mime,
    size: input.size,
    storageKey: input.storageKey,
    thumbnailKey: input.thumbnailKey ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    version: prev ? (prev.version ?? 1) + 1 : 1,
    previousVersionId: prev?._id ?? null,
    uploadedBy: actorId,
    uploaderName: actor.name,
    uploaderAvatar: actor.avatar,
    createdAt: now,
  });

  await Issue.updateOne({ _id: issueId, projectId }, { $inc: { 'counts.attachments': 1 } });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueUpdated',
    actor,
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `attached ${input.name} to ${issue.key}`,
  });
  emitEvent({
    type: 'issue.updated',
    orgId: issue.orgId,
    projectId,
    actorId,
    issueId: issue._id,
    issue: issueSnapshot(issue),
    payload: { attachmentId: String(doc._id) },
    at: now,
  });
  return doc.toObject();
}

export async function listAttachments({ projectId, issueId, query, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  return paginate(IssueAttachment, { projectId, issueId, deletedAt: null }, {
    sort: { createdAt: -1, _id: -1 },
    cursorField: 'createdAt',
    limit: query.limit,
    cursor: query.cursor,
  });
}

export async function getDownloadUrl({ projectId, issueId, attachmentId, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const att = await IssueAttachment.findOne({ _id: attachmentId, projectId, issueId, deletedAt: null }).lean();
  if (!att) throw new ApiError(404, 'Attachment not found');
  const { url, expiresAt } = signedUrl('GET', att.storageKey);
  return { url, expiresAt };
}

export async function deleteAttachment({ projectId, issueId, attachmentId, actorId, isLead, seesPrivate = false }) {
  const issue = await getVisibleIssue(projectId, issueId, actorId, seesPrivate);
  const att = await IssueAttachment.findOne({ _id: attachmentId, projectId, issueId, deletedAt: null }).lean();
  if (!att) throw new ApiError(404, 'Attachment not found');
  if (!sameId(att.uploadedBy, actorId) && !isLead) {
    throw new ApiError(403, 'Only the uploader or a lead can delete this attachment');
  }
  await IssueAttachment.updateOne({ _id: attachmentId, projectId }, { $set: { deletedAt: new Date() } });
  await Issue.updateOne({ _id: issueId, projectId }, { $inc: { 'counts.attachments': -1 } });
  await logActivity({
    projectId,
    orgId: issue.orgId,
    kind: 'issueUpdated',
    actor: await actorOf({ id: String(actorId) }),
    item: { id: issue._id, key: issue.key, title: issue.title },
    summary: `removed ${att.name} from ${issue.key}`,
  });
}
