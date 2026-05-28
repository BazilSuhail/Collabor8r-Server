import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import * as svc from './workflows.service.js';

export const listWorkflows = asyncHandler(async (req, res) => {
  const page = await svc.listWorkflows({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const getWorkflow = asyncHandler(async (req, res) => {
  ok(res, await svc.getWorkflow({ projectId: req.project._id, workflowId: req.params.workflowId }));
});

export const createWorkflow = asyncHandler(async (req, res) => {
  created(res, await svc.createWorkflow({ projectId: req.project._id, input: req.valid.body }));
});

export const updateWorkflow = asyncHandler(async (req, res) => {
  ok(res, await svc.updateWorkflow({ projectId: req.project._id, workflowId: req.params.workflowId, input: req.valid.body }));
});

export const publishWorkflow = asyncHandler(async (req, res) => {
  ok(res, await svc.publishWorkflow({ projectId: req.project._id, workflowId: req.params.workflowId, req }));
});

export const deleteWorkflow = asyncHandler(async (req, res) => {
  await svc.deleteWorkflow({ projectId: req.project._id, workflowId: req.params.workflowId });
  noContent(res);
});
