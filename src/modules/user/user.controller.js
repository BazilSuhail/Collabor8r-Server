import { asyncHandler, created, noContent, ok } from '../../utils/http.js';
import * as userService from './user.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  ok(res, await userService.getProfile(req.user.id));
});

export const updateProfile = asyncHandler(async (req, res) => {
  ok(res, await userService.updateProfile(req.user.id, req.valid.body));
});

export const searchUsers = asyncHandler(async (req, res) => {
  ok(res, await userService.searchUsers(req.user.id, req.valid.query.q));
});

export const listSessions = asyncHandler(async (req, res) => {
  ok(res, await userService.listSessions(req.user.id));
});

export const revokeSession = asyncHandler(async (req, res) => {
  await userService.revokeSession(req.user.id, req.valid.params.sessionId);
  noContent(res);
});

export const listApiTokens = asyncHandler(async (req, res) => {
  ok(res, await userService.listApiTokens(req.user.id));
});

export const createApiToken = asyncHandler(async (req, res) => {
  created(res, await userService.createApiToken(req.user.id, req.valid.body));
});

export const revokeApiToken = asyncHandler(async (req, res) => {
  await userService.revokeApiToken(req.user.id, req.valid.params.tokenId);
  noContent(res);
});

export const getPrefs = asyncHandler(async (req, res) => {
  ok(res, await userService.getPrefs(req.user.id));
});

export const updatePrefs = asyncHandler(async (req, res) => {
  ok(res, await userService.updatePrefs(req.user.id, req.valid.body.prefs));
});
