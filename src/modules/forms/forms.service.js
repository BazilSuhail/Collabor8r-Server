import mongoose from 'mongoose';
import { Form, FormSubmission, Project } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { randomToken } from '../../utils/helpers.js';
import { emitEvent } from '../../services/events.service.js';
import { createIssueInternal } from '../issue/issue.service.js';

const oid = (v) => new mongoose.Types.ObjectId(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function formInProject(projectId, formId) {
  const form = await Form.findOne({ _id: formId, projectId }).lean();
  if (!form) throw new ApiError(404, 'Form not found');
  return form;
}

export function listForms(projectId, query) {
  return paginate(Form, { projectId }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function createForm(project, userId, body) {
  const form = await Form.create({
    ...body,
    projectId: project._id,
    orgId: project.orgId ?? null,
    publicToken: randomToken(12),
    isPublic: body.isPublic ?? false,
    fields: body.fields ?? [],
    submissionCount: 0,
    createdBy: userId,
  });
  return form.toObject();
}

export function getForm(projectId, formId) {
  return formInProject(projectId, formId);
}

export async function updateForm(projectId, formId, body) {
  await formInProject(projectId, formId);
  return Form.findOneAndUpdate({ _id: formId, projectId }, { $set: body }, { returnDocument: 'after', runValidators: true }).lean();
}

export async function deleteForm(projectId, formId) {
  await formInProject(projectId, formId);
  await FormSubmission.deleteMany({ formId: oid(formId), projectId });
  await Form.deleteOne({ _id: formId, projectId });
}

export async function listSubmissions(projectId, formId, query) {
  await formInProject(projectId, formId);
  return paginate(FormSubmission, { projectId, formId: oid(formId) }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function getPublicForm(publicKey) {
  const form = await Form.findOne({ publicToken: publicKey, isPublic: true }).select('name description fields issueTypeId').lean();
  if (!form) throw new ApiError(404, 'Form not found');
  return form;
}

// Checks answers against the form definition and returns only known field ids.
function validateAnswers(fields, answers) {
  const errors = [];
  const clean = {};
  for (const f of fields) {
    const raw = answers[f.id];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (f.required) errors.push({ path: f.id, message: `${f.label} is required` });
      continue;
    }
    let value = raw;
    if (f.type === 'number') {
      value = Number(raw);
      if (!Number.isFinite(value)) errors.push({ path: f.id, message: `${f.label} must be a number` });
    } else if (f.type === 'email') {
      if (typeof raw !== 'string' || !EMAIL.test(raw)) errors.push({ path: f.id, message: `${f.label} must be an email` });
    } else if (f.type === 'checkbox') {
      value = Boolean(raw);
    } else if (f.type === 'select') {
      if (!(f.options ?? []).includes(String(raw))) errors.push({ path: f.id, message: `${f.label} has an invalid option` });
    } else if (f.type === 'multiSelect') {
      const list = Array.isArray(raw) ? raw.map(String) : [];
      if (list.some((v) => !(f.options ?? []).includes(v))) errors.push({ path: f.id, message: `${f.label} has an invalid option` });
      value = list;
    } else if (f.type === 'date') {
      if (Number.isNaN(Date.parse(String(raw)))) errors.push({ path: f.id, message: `${f.label} must be a date` });
    } else {
      value = String(raw).slice(0, 5000);
    }
    clean[f.id] = value;
  }
  return { clean, errors };
}

export async function submitPublicForm(publicKey, body) {
  if (body.website) throw new ApiError(422, 'Submission rejected');
  const form = await Form.findOne({ publicToken: publicKey, isPublic: true }).lean();
  if (!form) throw new ApiError(404, 'Form not found');
  const { clean, errors } = validateAnswers(form.fields ?? [], body.answers);
  if (errors.length) throw new ApiError(422, 'Validation failed', errors);

  const titleField = (form.fields ?? []).find((f) => f.type === 'text' || f.type === 'email');
  const title = String((titleField && clean[titleField.id]) || form.name).slice(0, 200);
  const description = (form.fields ?? [])
    .filter((f) => clean[f.id] !== undefined)
    .map((f) => `${f.label}: ${Array.isArray(clean[f.id]) ? clean[f.id].join(', ') : clean[f.id]}`)
    .join('\n');

  const issue = await createIssueInternal({
    projectId: form.projectId,
    reporterId: null,
    input: { title, description, typeId: form.issueTypeId, priorityId: form.defaultPriorityId ?? undefined },
    source: 'form',
  });
  const submission = await FormSubmission.create({
    projectId: form.projectId,
    formId: form._id,
    answers: clean,
    submitterName: body.submitterName ?? '',
    submitterEmail: body.submitterEmail ?? '',
    itemId: issue._id,
    status: 'converted',
    submittedAt: new Date(),
  });
  await Form.updateOne({ _id: form._id }, { $inc: { submissionCount: 1 } });

  const project = await Project.findById(form.projectId).select('orgId').lean();
  emitEvent({
    type: 'form.submitted',
    orgId: project?.orgId ?? null,
    projectId: form.projectId,
    actorId: null,
    issueId: issue._id,
    payload: { formId: form._id, submissionId: submission._id },
    at: new Date(),
  });
  return { issueKey: issue.key };
}
