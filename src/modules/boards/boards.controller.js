import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './boards.service.js';

const viewerOf = (req) => ({
  viewerId: req.user.id,
  seesPrivate: (PROJECT_ROLE_RANK[req.projectRole] ?? 0) >= PROJECT_ROLE_RANK.lead,
});

export const listBoards = asyncHandler(async (req, res) => {
  ok(res, await svc.listBoards(req.project._id));
});

export const getBoard = asyncHandler(async (req, res) => {
  ok(res, await svc.getBoard(req.project._id, req.params.boardId));
});

export const createBoard = asyncHandler(async (req, res) => {
  created(res, await svc.createBoard({ projectId: req.project._id, input: req.valid.body }));
});

export const updateBoard = asyncHandler(async (req, res) => {
  ok(res, await svc.updateBoard({ projectId: req.project._id, boardId: req.params.boardId, input: req.valid.body }));
});

export const deleteBoard = asyncHandler(async (req, res) => {
  await svc.deleteBoard({ projectId: req.project._id, boardId: req.params.boardId });
  noContent(res);
});

export const getBoardIssues = asyncHandler(async (req, res) => {
  const board = await svc.getBoard(req.project._id, req.params.boardId);
  ok(res, await svc.getBoardIssues({ projectId: req.project._id, board, query: req.valid.query, ...viewerOf(req) }));
});

export const getBacklog = asyncHandler(async (req, res) => {
  const page = await svc.getBacklog({ projectId: req.project._id, query: req.valid.query, ...viewerOf(req) });
  paged(res, page.items, page.meta);
});

export const rankIssue = asyncHandler(async (req, res) => {
  ok(res, await svc.rankIssueService({ projectId: req.project._id, issueId: req.params.issueId, input: req.valid.body, ...viewerOf(req) }));
});
