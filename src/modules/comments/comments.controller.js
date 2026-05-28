import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './comments.service.js';

const atLeast = (role, min) => (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK[min];

export const listComments = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const { items, meta } = await svc.listComments({
    projectId,
    issueId,
    query: req.valid.query,
    seesInternal: atLeast(req.projectRole, 'developer'),
    viewerId: req.user.id,
    seesPrivate: atLeast(req.projectRole, 'lead'),
  });
  paged(res, items, meta);
});

export const createComment = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const comment = await svc.addCommentInternal({
    projectId,
    issueId,
    authorId: req.user.id,
    seesPrivate: atLeast(req.projectRole, 'lead'),
    body: req.valid.body.body,
    internal: Boolean(req.valid.body.internal) && atLeast(req.projectRole, 'developer'),
  });
  created(res, comment);
});

export const updateComment = asyncHandler(async (req, res) => {
  const { projectId, issueId, commentId } = req.valid.params;
  const comment = await svc.updateComment({
    projectId,
    issueId,
    commentId,
    body: req.valid.body.body,
    actorId: req.user.id,
    isLead: atLeast(req.projectRole, 'lead'),
    seesPrivate: atLeast(req.projectRole, 'lead'),
  });
  ok(res, comment);
});

export const deleteComment = asyncHandler(async (req, res) => {
  const { projectId, issueId, commentId } = req.valid.params;
  await svc.deleteComment({
    projectId,
    issueId,
    commentId,
    actorId: req.user.id,
    isLead: atLeast(req.projectRole, 'lead'),
    seesPrivate: atLeast(req.projectRole, 'lead'),
  });
  noContent(res);
});
