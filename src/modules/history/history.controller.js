import { asyncHandler, paged } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { IssueHistory } from '../../models/index.js';
import { getIssueInProject } from '../issue/issue.service.js';

export const listHistory = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  await getIssueInProject(projectId, issueId);
  const { limit, cursor } = req.valid.query;
  const { items, meta } = await paginate(
    IssueHistory,
    { projectId, issueId },
    { sort: { at: -1, _id: -1 }, cursorField: 'at', limit, cursor }
  );
  paged(res, items, meta);
});
