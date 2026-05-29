// Generic CRUD router factory, scoped to a project or an organization.
import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/projectRole.js';
import { requireOrgRole } from '../middleware/orgRole.js';
import { validate } from '../middleware/validate.js';
import { ORG_ROLE_RANK, PROJECT_ROLE_RANK } from '../config/constants.js';
import { writeAudit } from '../services/audit.service.js';
import { ApiError, asyncHandler, created, noContent, ok, paged } from './http.js';
import { escapeRegex, objectId, pick } from './helpers.js';
import { pageQuerySchema, paginate, parsePageQuery } from './pagination.js';

const PROTECTED = ['projectId', 'orgId', '_id'];
const stripProtected = (body) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => !PROTECTED.includes(key)));
const labelOf = (doc) => doc.name ?? doc.key ?? doc.title ?? String(doc._id);

const DEFAULT_ROLES = {
  project: { read: 'viewer', create: 'developer', update: 'developer', remove: 'lead' },
  org: { read: 'member', create: 'admin', update: 'admin', remove: 'admin' },
};

// List query schema: paging + q + each configured filter key as a plain string (ids as 24-hex).
// Strings only, so qs objects like ?status[$ne]=x fail validation instead of reaching Mongo.
// A custom listQuerySchema must declare its own filter keys.
export const buildListSchema = (filterFields = []) =>
  pageQuerySchema.extend({
    q: z.string().trim().max(200).optional(),
    ...Object.fromEntries(
      filterFields.map((key) => [key, (/Id$/.test(key) ? objectId : z.string().trim().min(1).max(100)).optional()]),
    ),
  });

const buildCrud = (kind, options) => {
  const {
    Model,
    name,
    createSchema,
    updateSchema,
    listQuerySchema,
    filterFields = [],
    searchFields = [],
    sort = { _id: -1 },
    ownerField,
    beforeCreate,
    afterWrite,
    beforeDelete,
    authMiddleware = auth,
  } = options;
  const roles = { ...DEFAULT_ROLES[kind], ...options.roles };
  const isProject = kind === 'project';
  const listSchema = listQuerySchema ?? buildListSchema(filterFields);

  const guard = (minRole) => (isProject ? requireProjectRole(minRole) : requireOrgRole(minRole));
  const rankOf = (req) => (isProject ? PROJECT_ROLE_RANK[req.projectRole] : ORG_ROLE_RANK[req.orgRole]);
  const minRank = (minRole) => (isProject ? PROJECT_ROLE_RANK[minRole] : ORG_ROLE_RANK[minRole]);
  const scopeOf = (req) => (isProject ? { projectId: req.project._id } : { orgId: req.org._id });
  const createScopeOf = (req) => {
    if (!isProject) return { orgId: req.org._id };
    const scope = { projectId: req.project._id };
    if (Model.schema.path('orgId')) scope.orgId = req.project.orgId ?? null;
    return scope;
  };
  const auditScopeOf = (req) =>
    isProject
      ? { projectId: req.project._id, orgId: req.project.orgId ?? null }
      : { projectId: null, orgId: req.org._id };
  const canWrite = (req, doc, minRole) =>
    (ownerField && String(doc[ownerField]) === req.user.id) || rankOf(req) >= minRank(minRole);
  const idOf = (req) => {
    const parsed = objectId.safeParse(req.params.id);
    if (!parsed.success) throw new ApiError(404, `${name} not found`);
    return parsed.data;
  };
  const audit = (req, action, doc, before, after) =>
    writeAudit({
      req,
      ...auditScopeOf(req),
      action: `${name}.${action}`,
      targetType: name,
      targetId: doc._id,
      targetName: labelOf(doc),
      before,
      after,
    });

  const router = Router({ mergeParams: true });

  router.get(
    '/',
    authMiddleware,
    guard(roles.read),
    validate(listSchema, 'query'),
    asyncHandler(async (req, res) => {
      const filter = scopeOf(req);
      for (const key of filterFields) {
        if (req.valid.query[key] !== undefined) filter[key] = req.valid.query[key];
      }
      const q = req.valid.query.q;
      if (q && searchFields.length) {
        const pattern = escapeRegex(q);
        const search = { $or: searchFields.map((field) => ({ [field]: { $regex: pattern, $options: 'i' } })) };
        filter.$and = [...(filter.$and ?? []), search];
      }
      const { items, meta } = await paginate(Model, filter, { sort, ...parsePageQuery(req.valid.query) });
      paged(res, items, meta);
    }),
  );

  router.get(
    '/:id',
    authMiddleware,
    guard(roles.read),
    asyncHandler(async (req, res) => {
      const doc = await Model.findOne({ _id: idOf(req), ...scopeOf(req) }).lean();
      if (!doc) throw new ApiError(404, `${name} not found`);
      ok(res, doc);
    }),
  );

  router.post(
    '/',
    authMiddleware,
    guard(roles.create),
    validate(createSchema, 'body'),
    asyncHandler(async (req, res) => {
      let body = stripProtected(req.valid.body);
      if (beforeCreate) body = stripProtected(await beforeCreate(req, body));
      if (ownerField) body[ownerField] = req.user.id;

      const doc = await Model.create({ ...body, ...createScopeOf(req) });
      if (afterWrite) await afterWrite(req, doc, 'create');
      await audit(req, 'created', doc, null, body);
      created(res, doc.toObject());
    }),
  );

  router.patch(
    '/:id',
    authMiddleware,
    guard(ownerField ? 'guest' : roles.update),
    validate(updateSchema, 'body'),
    asyncHandler(async (req, res) => {
      const id = idOf(req);
      const scope = scopeOf(req);
      const existing = await Model.findOne({ _id: id, ...scope }).lean();
      if (!existing) throw new ApiError(404, `${name} not found`);
      if (!canWrite(req, existing, roles.update)) throw new ApiError(403, 'Insufficient role');

      const body = stripProtected(req.valid.body);
      if (ownerField) delete body[ownerField];
      const keys = Object.keys(body);
      const updated = keys.length
        ? await Model.findOneAndUpdate({ _id: id, ...scope }, { $set: body }, { returnDocument: 'after', runValidators: true }).lean()
        : existing;
      if (!updated) throw new ApiError(404, `${name} not found`);

      if (afterWrite) await afterWrite(req, updated, 'update');
      await audit(req, 'updated', updated, pick(existing, keys), pick(updated, keys));
      ok(res, updated);
    }),
  );

  router.delete(
    '/:id',
    authMiddleware,
    guard(ownerField ? 'guest' : roles.remove),
    asyncHandler(async (req, res) => {
      const id = idOf(req);
      const scope = scopeOf(req);
      const existing = await Model.findOne({ _id: id, ...scope }).lean();
      if (!existing) throw new ApiError(404, `${name} not found`);
      if (!canWrite(req, existing, roles.remove)) throw new ApiError(403, 'Insufficient role');

      if (beforeDelete) await beforeDelete(req, existing);
      await Model.deleteOne({ _id: id, ...scope });
      if (afterWrite) await afterWrite(req, existing, 'delete');
      await audit(req, 'deleted', existing, null, null);
      noContent(res);
    }),
  );

  return router;
};

export const makeProjectCrud = (options) => buildCrud('project', options);

export const makeOrgCrud = (options) => buildCrud('org', options);
