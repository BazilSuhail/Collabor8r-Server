import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import * as svc from './forms.service.js';

export const listForms = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listForms(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createForm = asyncHandler(async (req, res) => {
  created(res, await svc.createForm(req.project, req.user.id, req.valid.body));
});

export const getForm = asyncHandler(async (req, res) => {
  ok(res, await svc.getForm(req.project._id, req.params.formId));
});

export const updateForm = asyncHandler(async (req, res) => {
  ok(res, await svc.updateForm(req.project._id, req.params.formId, req.valid.body));
});

export const deleteForm = asyncHandler(async (req, res) => {
  await svc.deleteForm(req.project._id, req.params.formId);
  noContent(res);
});

export const listSubmissions = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listSubmissions(req.project._id, req.params.formId, req.valid.query);
  paged(res, items, meta);
});

export const getPublicForm = asyncHandler(async (req, res) => {
  ok(res, await svc.getPublicForm(req.params.publicKey));
});

export const submitPublicForm = asyncHandler(async (req, res) => {
  created(res, await svc.submitPublicForm(req.params.publicKey, req.valid.body));
});
