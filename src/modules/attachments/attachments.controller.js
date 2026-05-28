import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './attachments.service.js';

const atLeast = (role, min) => (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK[min];

const seesPrivateOf = (req) => atLeast(req.projectRole, 'lead');

export const listAttachments = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const { items, meta } = await svc.listAttachments({ projectId, issueId, query: req.valid.query, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) });
  paged(res, items, meta);
});

export const createUploadUrl = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  ok(res, await svc.createUploadUrl({ projectId, issueId, name: req.valid.body.name, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) }));
});

export const createAttachment = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const doc = await svc.registerAttachment({ projectId, issueId, actorId: req.user.id, input: req.valid.body, seesPrivate: seesPrivateOf(req) });
  created(res, doc);
});

export const downloadUrl = asyncHandler(async (req, res) => {
  const { projectId, issueId, attachmentId } = req.valid.params;
  ok(res, await svc.getDownloadUrl({ projectId, issueId, attachmentId, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) }));
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  const { projectId, issueId, attachmentId } = req.valid.params;
  await svc.deleteAttachment({
    projectId,
    issueId,
    attachmentId,
    actorId: req.user.id,
    seesPrivate: seesPrivateOf(req),
    isLead: atLeast(req.projectRole, 'lead'),
  });
  noContent(res);
});
