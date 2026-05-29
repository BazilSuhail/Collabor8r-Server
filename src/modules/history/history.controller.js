import { asyncHandler, paged } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { IssueHistory } from '../../models/index.js';
import { getVisibleIssue } from '../issue/issue.service.js';
import { canSeePrivateIssues } from '../../services/visibility.service.js';

export const listHistory = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  await getVisibleIssue(projectId, issueId, req.user.id, canSeePrivateIssues(req.projectRole));
  const { limit, cursor } = req.valid.query;
  const { items, meta } = await paginate(
    IssueHistory,
    { projectId, issueId },
    { sort: { at: -1, _id: -1 }, cursorField: 'at', limit, cursor }
  );
  paged(res, items, meta);
});
