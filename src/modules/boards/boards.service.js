import mongoose from 'mongoose';
import { ApiError } from '../../utils/http.js';
import { paginate } from '../../utils/pagination.js';
import { rankBetween } from '../../utils/rank.js';
import { privateFilter, getVisibleIssue } from '../issue/issue.service.js';
import { getPublicUsers } from '../user/user.service.js';
import { getWorkflowForIssueType } from '../workflows/workflows.service.js';
import { assertSprintInProject } from '../sprints/sprints.service.js';
import Board from '../../models/project/boards.model.js';
import Sprint from '../../models/project/sprints.model.js';
import Issue from '../../models/issue/issues.model.js';

const BOARD_ISSUE_LIMIT = 500;
const oid = (v) => new mongoose.Types.ObjectId(String(v));

function normalizeColumns(columns) {
  return columns.map((c, i) => ({
    id: c.id ? oid(c.id) : new mongoose.Types.ObjectId(),
    name: c.name,
    statusIds: c.statusIds.map(oid),
    wipLimit: c.wipLimit ?? null,
    color: c.color ?? '',
    sortOrder: c.sortOrder ?? i,
  }));
}

// One column per workflow status, in workflow order.
async function defaultColumns(projectId) {
  const wf = await getWorkflowForIssueType(projectId, null);
  return [...wf.statuses]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => ({ id: new mongoose.Types.ObjectId(), name: s.name, statusIds: [s.id], wipLimit: null, color: s.color ?? '', sortOrder: i }));
}

export function listBoards(projectId) {
  return Board.find({ projectId }).sort({ isDefault: -1, _id: 1 }).lean();
}

export async function getBoard(projectId, boardId) {
  const board = await Board.findOne({ _id: boardId, projectId }).lean();
  if (!board) throw new ApiError(404, 'Board not found');
  return board;
}

export async function createBoard({ projectId, input }) {
  const columns = input.columns ? normalizeColumns(input.columns) : await defaultColumns(projectId);
  const isDefault = Boolean(input.isDefault) || !(await Board.exists({ projectId }));
  if (isDefault) await Board.updateMany({ projectId }, { $set: { isDefault: false } });
  const board = await Board.create({ ...input, projectId, columns, isDefault });
  return board.toObject();
}

export async function updateBoard({ projectId, boardId, input }) {
  const set = { ...input, updatedAt: new Date() };
  if (input.columns) set.columns = normalizeColumns(input.columns);
  if (input.isDefault) await Board.updateMany({ projectId, _id: { $ne: boardId } }, { $set: { isDefault: false } });
  const board = await Board.findOneAndUpdate({ _id: boardId, projectId }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
  if (!board) throw new ApiError(404, 'Board not found');
  return board;
}

export async function deleteBoard({ projectId, boardId }) {
  if (await Sprint.exists({ projectId, boardId, state: { $ne: 'closed' } })) {
    throw new ApiError(409, 'Board has planned or active sprints');
  }
  const res = await Board.deleteOne({ _id: boardId, projectId });
  if (!res.deletedCount) throw new ApiError(404, 'Board not found');
}

const laneKey = (issue, swimlaneBy) => {
  switch (swimlaneBy) {
    case 'assignee': return String(issue.assigneeId ?? 'unassigned');
    case 'epic': return String(issue.epicId ?? 'none');
    case 'priority': return String(issue.priorityId ?? 'none');
    case 'type': return String(issue.type ?? 'none');
    default: return 'all';
  }
};

// Groups issues into board columns by status. Each item carries its swimlane key.
export async function getBoardIssues({ projectId, board, query, viewerId, seesPrivate = false }) {
  const statusIds = board.columns.flatMap((c) => c.statusIds);
  const filter = { projectId, statusId: { $in: statusIds } };
  if (!board.showSubtasks) filter.hierarchy = { $ne: 'subtask' };
  if (query.sprintId) filter.sprintId = query.sprintId;
  if (query.assigneeId) filter.assigneeId = query.assigneeId;
  if (query.label) filter.labels = query.label;
  if (!seesPrivate) filter.$and = [{ $or: privateFilter(viewerId) }];

  const issues = await Issue.find(filter).select('-description').sort({ rank: 1, _id: 1 }).limit(BOARD_ISSUE_LIMIT).lean();
  const assigneeIds = [...new Set(issues.filter((i) => i.assigneeId).map((i) => String(i.assigneeId)))];
  const users = await getPublicUsers(assigneeIds);

  const columns = [...board.columns]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, name: c.name, statusIds: c.statusIds, wipLimit: c.wipLimit ?? null, color: c.color ?? '', items: [] }));
  const lanes = new Set();
  for (const issue of issues) {
    const lane = laneKey(issue, board.swimlaneBy);
    lanes.add(lane);
    const user = issue.assigneeId ? users.get(String(issue.assigneeId)) : null;
    const item = {
      ...issue,
      lane,
      assigneeUser: user ? { id: String(issue.assigneeId), displayName: user.displayName, avatar: user.avatar } : null,
    };
    columns.find((c) => c.statusIds.some((s) => String(s) === String(issue.statusId)))?.items.push(item);
  }
  return {
    board: { id: board._id, name: board.name, type: board.type, swimlaneBy: board.swimlaneBy },
    lanes: [...lanes],
    columns,
  };
}

// Backlog: issues with no sprint or in a planned sprint, excluding done work, in rank order.
export async function getBacklog({ projectId, query, viewerId, seesPrivate = false }) {
  const plannedIds = await Sprint.find({ projectId, state: 'planned' }).distinct('_id');
  const filter = {
    projectId,
    statusCategory: { $ne: 'done' },
    $or: [{ sprintId: null }, { sprintId: { $in: plannedIds } }],
  };
  if (query.assigneeId) filter.assigneeId = query.assigneeId;
  if (!seesPrivate) filter.$and = [{ $or: privateFilter(viewerId) }];
  return paginate(Issue, filter, {
    sort: { rank: 1, _id: 1 },
    cursorField: 'rank',
    limit: query.limit ?? 25,
    cursor: query.cursor ?? null,
    select: '-description',
  });
}

export async function computeRank(projectId, { beforeId, afterId }) {
  const before = beforeId ? await Issue.findOne({ _id: beforeId, projectId }).select('rank').lean() : null;
  const after = afterId ? await Issue.findOne({ _id: afterId, projectId }).select('rank').lean() : null;
  if ((beforeId && !before) || (afterId && !after)) throw new ApiError(422, 'Neighbor issue not found in project');
  return rankBetween(before?.rank ?? null, after?.rank ?? null);
}

export async function rankIssueService({ projectId, issueId, input, viewerId, seesPrivate = false }) {
  await getVisibleIssue(projectId, issueId, viewerId, seesPrivate);
  const set = { rank: await computeRank(projectId, input) };
  if (input.sprintId !== undefined) {
    if (input.sprintId) await assertSprintInProject(projectId, input.sprintId);
    set.sprintId = input.sprintId ?? null;
  }
  return Issue.findOneAndUpdate({ _id: issueId, projectId }, { $set: set }, { returnDocument: 'after' }).select('-description').lean();
}
