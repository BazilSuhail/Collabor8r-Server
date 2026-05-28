import { z } from 'zod';
import { asyncHandler, ok } from '../../utils/http.js';
import { objectId } from '../../utils/helpers.js';
import * as svc from './reports.service.js';

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sprintId: objectId.optional(),
});

export const getSummary = asyncHandler(async (req, res) => {
  ok(res, await svc.getSummary(req.project._id));
});

export const getCreatedVsResolved = asyncHandler(async (req, res) => {
  ok(res, await svc.getCreatedVsResolved(req.project._id, req.valid.query));
});

export const getBurndown = asyncHandler(async (req, res) => {
  ok(res, await svc.getBurndown(req.project._id, req.valid.query));
});

export const getVelocity = asyncHandler(async (req, res) => {
  ok(res, await svc.getVelocity(req.project._id));
});

export const getTimeSpent = asyncHandler(async (req, res) => {
  ok(res, await svc.getTimeSpent(req.project._id, req.valid.query));
});

export const getWorkload = asyncHandler(async (req, res) => {
  ok(res, await svc.getWorkload(req.project._id));
});
