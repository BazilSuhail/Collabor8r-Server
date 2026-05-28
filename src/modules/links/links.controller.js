import { asyncHandler, ok, created, noContent } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './links.service.js';

const seesPrivateOf = (req) => (PROJECT_ROLE_RANK[req.projectRole] ?? 0) >= PROJECT_ROLE_RANK.lead;

export const listLinks = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  ok(res, await svc.listLinks({ projectId, issueId, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) }));
});

export const createLink = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const link = await svc.createLink({
    projectId,
    issueId,
    targetIssueId: req.valid.body.targetIssueId,
    type: req.valid.body.type,
    actorId: req.user.id,
    seesPrivate: seesPrivateOf(req),
  });
  created(res, link);
});

export const deleteLink = asyncHandler(async (req, res) => {
  const { projectId, issueId, linkId } = req.valid.params;
  await svc.deleteLink({ projectId, issueId, linkId, actorId: req.user.id, seesPrivate: seesPrivateOf(req) });
  noContent(res);
});
