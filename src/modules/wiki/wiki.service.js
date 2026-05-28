import mongoose from 'mongoose';
import { WikiSpace, WikiPage, WikiPageVersion } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { slugify } from '../../utils/helpers.js';
import { actorOf, logActivity } from '../../services/activity.service.js';
import { emitEvent } from '../../services/events.service.js';

const MAX_VERSIONS = 200;
const oid = (v) => new mongoose.Types.ObjectId(v);

// Word count and read time from the rich text JSON.
function plainText(node) {
  if (Array.isArray(node)) return node.map(plainText).join(' ');
  if (node && typeof node === 'object') return `${node.text ?? ''} ${plainText(node.content)}`;
  return typeof node === 'string' ? node : '';
}

function stats(body) {
  const words = plainText(body).split(/\s+/).filter(Boolean).length;
  return { wordCount: words, readMinutes: Math.max(1, Math.ceil(words / 200)) };
}

async function spaceInProject(projectId, spaceId) {
  const space = await WikiSpace.findOne({ _id: spaceId, projectId }).lean();
  if (!space) throw new ApiError(404, 'Space not found');
  return space;
}

async function pageInProject(projectId, pageId) {
  const page = await WikiPage.findOne({ _id: pageId, projectId }).lean();
  if (!page) throw new ApiError(404, 'Page not found');
  return page;
}

async function uniqueSlug(spaceId, title) {
  const base = slugify(title) || 'page';
  let slug = base;
  let n = 1;
  while (await WikiPage.exists({ spaceId, slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

async function trimVersions(pageId) {
  const count = await WikiPageVersion.countDocuments({ pageId });
  if (count <= MAX_VERSIONS) return;
  const old = await WikiPageVersion.find({ pageId }).sort({ versionNo: 1 }).limit(count - MAX_VERSIONS).select('_id').lean();
  await WikiPageVersion.deleteMany({ _id: { $in: old.map((d) => d._id) } });
}

export function listSpaces(projectId, query) {
  return paginate(WikiSpace, { projectId }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

export async function createSpace(project, userId, body) {
  const key = (body.key || body.name.replace(/[^a-zA-Z0-9]/g, '')).slice(0, 10).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new ApiError(422, 'Invalid space key');
  const space = await WikiSpace.create({
    projectId: project._id,
    orgId: project.orgId ?? null,
    name: body.name,
    key,
    description: body.description ?? '',
    iconUrl: body.iconUrl ?? '',
    visibility: body.visibility ?? 'project',
    createdBy: userId,
  });
  return space.toObject();
}

export async function updateSpace(projectId, spaceId, body) {
  const space = await WikiSpace.findOneAndUpdate({ _id: spaceId, projectId }, { $set: body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!space) throw new ApiError(404, 'Space not found');
  return space;
}

export async function deleteSpace(projectId, spaceId) {
  await spaceInProject(projectId, spaceId);
  await WikiPageVersion.deleteMany({ spaceId });
  await WikiPage.deleteMany({ spaceId, projectId });
  await WikiSpace.deleteOne({ _id: spaceId, projectId });
}

export function listPages(projectId, query) {
  const filter = { projectId, spaceId: oid(query.spaceId) };
  if (query.parentId !== undefined) filter.parentId = query.parentId === 'root' ? null : oid(query.parentId);
  return paginate(WikiPage, filter, { ...parsePageQuery(query, {}), sort: { _id: -1 }, select: '-body', lean: true });
}

export function getPage(projectId, pageId) {
  return pageInProject(projectId, pageId);
}

export async function createPage(project, userId, body) {
  const space = await spaceInProject(project._id, body.spaceId);
  if (body.parentId) {
    const parent = await WikiPage.exists({ _id: body.parentId, spaceId: space._id });
    if (!parent) throw new ApiError(422, 'Parent page must be in the same space');
  }
  const author = await actorOf({ id: userId });
  const now = new Date();
  const status = body.status ?? 'draft';
  const page = await WikiPage.create({
    spaceId: space._id,
    projectId: project._id,
    orgId: project.orgId ?? null,
    parentId: body.parentId ?? null,
    title: body.title,
    slug: await uniqueSlug(space._id, body.title),
    summary: body.summary ?? '',
    body: body.body ?? {},
    icon: body.icon ?? '',
    coverUrl: body.coverUrl ?? '',
    template: body.template ?? null,
    isTemplate: body.isTemplate ?? false,
    status,
    position: body.position ?? 0,
    ...stats(body.body),
    currentVersion: 1,
    authorId: userId,
    authorName: author.name,
    lastEditedBy: userId,
    lastEditedByName: author.name,
    relatedItemIds: body.relatedItemIds ?? [],
    publishedAt: status === 'published' ? now : null,
  });
  await WikiPageVersion.create({
    pageId: page._id,
    spaceId: space._id,
    versionNo: 1,
    title: page.title,
    body: page.body,
    changeSummary: body.changeSummary ?? 'Created',
    authorId: userId,
    authorName: author.name,
  });
  await logActivity({
    projectId: project._id,
    orgId: project.orgId ?? null,
    kind: 'pageUpdated',
    actor: author,
    item: { id: page._id, title: page.title },
    summary: `Created page ${page.title}`,
  });
  emitEvent({ type: 'page.updated', orgId: project.orgId ?? null, projectId: project._id, actorId: userId, payload: { pageId: page._id }, at: now });
  return page.toObject();
}

const PAGE_FIELDS = ['title', 'summary', 'body', 'icon', 'coverUrl', 'template', 'isTemplate', 'status', 'position', 'parentId', 'relatedItemIds'];

export async function updatePage(project, userId, pageId, body) {
  const page = await pageInProject(project._id, pageId);
  if (body.version !== undefined && body.version !== page.currentVersion) {
    throw new ApiError(409, 'Page was modified by someone else');
  }
  if (body.parentId && String(body.parentId) === String(pageId)) throw new ApiError(422, 'A page cannot be its own parent');
  const contentChanged = body.title !== undefined || body.body !== undefined;
  const author = await actorOf({ id: userId });
  const now = new Date();
  const set = {};
  for (const k of PAGE_FIELDS) if (body[k] !== undefined) set[k] = body[k];
  if (set.status === 'published' && page.status !== 'published') set.publishedAt = now;
  if (contentChanged) Object.assign(set, stats(set.body ?? page.body));
  set.lastEditedBy = userId;
  set.lastEditedByName = author.name;

  const updated = await WikiPage.findOneAndUpdate(
    { _id: page._id, projectId: project._id, currentVersion: page.currentVersion },
    { $set: set, ...(contentChanged ? { $inc: { currentVersion: 1 } } : {}) },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) throw new ApiError(409, 'Page was modified by someone else');

  if (contentChanged) {
    await WikiPageVersion.create({
      pageId: updated._id,
      spaceId: updated.spaceId,
      versionNo: updated.currentVersion,
      title: updated.title,
      body: updated.body,
      changeSummary: body.changeSummary ?? '',
      authorId: userId,
      authorName: author.name,
    });
    await trimVersions(updated._id);
  }
  await logActivity({
    projectId: project._id,
    orgId: project.orgId ?? null,
    kind: 'pageUpdated',
    actor: author,
    item: { id: updated._id, title: updated.title },
    summary: `Updated page ${updated.title}`,
  });
  emitEvent({ type: 'page.updated', orgId: project.orgId ?? null, projectId: project._id, actorId: userId, payload: { pageId: updated._id }, at: now });
  return updated;
}

export async function deletePage(projectId, pageId) {
  const page = await pageInProject(projectId, pageId);
  await WikiPage.updateMany({ spaceId: page.spaceId, parentId: page._id }, { $set: { parentId: page.parentId ?? null } });
  await WikiSpace.updateOne({ _id: page.spaceId, homePageId: page._id }, { $set: { homePageId: null } });
  await WikiPageVersion.deleteMany({ pageId: page._id });
  await WikiPage.deleteOne({ _id: page._id, projectId });
}

export async function listVersions(projectId, pageId, query) {
  await pageInProject(projectId, pageId);
  return paginate(WikiPageVersion, { pageId: oid(pageId) }, { ...parsePageQuery(query, {}), select: '-body', lean: true });
}

export async function getVersion(projectId, pageId, versionId) {
  await pageInProject(projectId, pageId);
  const version = await WikiPageVersion.findOne({ _id: versionId, pageId }).lean();
  if (!version) throw new ApiError(404, 'Version not found');
  return version;
}

export async function restoreVersion(project, userId, pageId, versionId) {
  const version = await getVersion(project._id, pageId, versionId);
  return updatePage(project, userId, pageId, {
    title: version.title,
    body: version.body,
    changeSummary: `Restored version ${version.versionNo}`,
  });
}
