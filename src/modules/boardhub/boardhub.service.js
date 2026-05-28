import mongoose from 'mongoose';
import { Issue, Organization, Project, ProjectMember, User, Workflow } from '../../models/index.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (id) => (id ? String(id) : null);

async function memberships(userId) {
  const members = await ProjectMember.find({ userId, status: 'active' }).select('projectId role').lean();
  const projects = await Project.find({ _id: { $in: members.map((m) => m.projectId) }, status: 'active' })
    .select('key name icon color orgId')
    .lean();
  const roles = new Map(members.map((m) => [String(m.projectId), m.role]));
  return { projects, roles };
}

export async function listBoardProjects(userId) {
  const [{ projects, roles }, user] = await Promise.all([
    memberships(userId),
    User.findById(userId).select('preferences').lean(),
  ]);
  const ids = projects.map((p) => p._id);
  const [rows, orgs] = await Promise.all([
    ids.length
      ? Issue.aggregate([
          { $match: { projectId: { $in: ids }, deletedAt: null } },
          { $group: { _id: { p: '$projectId', c: '$statusCategory' }, n: { $sum: 1 } } },
        ])
      : [],
    Organization.find({ _id: { $in: projects.map((p) => p.orgId).filter(Boolean) } }).select('name').lean(),
  ]);
  const counts = new Map();
  for (const r of rows) {
    const key = String(r._id.p);
    const c = counts.get(key) ?? { todo: 0, inProgress: 0, done: 0 };
    if (r._id.c === 'todo') c.todo = r.n;
    else if (r._id.c === 'inprogress') c.inProgress = r.n;
    else if (r._id.c === 'done') c.done = r.n;
    counts.set(key, c);
  }
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  const pos = new Map((user?.preferences?.boardOrder ?? []).map((id, i) => [String(id), i]));
  return projects
    .map((p) => ({
      id: String(p._id),
      key: p.key,
      name: p.name,
      icon: p.icon ?? null,
      color: p.color ?? null,
      orgId: str(p.orgId),
      orgName: orgName.get(String(p.orgId)) ?? null,
      role: roles.get(String(p._id)),
      counts: counts.get(String(p._id)) ?? { todo: 0, inProgress: 0, done: 0 },
    }))
    .sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity) || a.key.localeCompare(b.key));
}

export async function saveOrder(userId, projectIds) {
  const { roles } = await memberships(userId);
  const saved = [...new Set(projectIds.map((id) => id.toLowerCase()))].filter((id) => roles.has(id));
  await User.updateOne({ _id: userId }, { $set: { 'preferences.boardOrder': saved } });
  return { projectIds: saved };
}

export async function projectBoard({ project, viewerId, seesPrivate }) {
  const filter = { projectId: project._id, deletedAt: null };
  if (!seesPrivate) {
    filter.$or = [
      { isPrivate: { $ne: true } },
      { allowedUserIds: oid(viewerId) },
      { reporterId: oid(viewerId) },
      { assigneeId: oid(viewerId) },
    ];
  }
  const [workflows, issues] = await Promise.all([
    Workflow.find({ projectId: project._id, status: 'live' }).select('statuses').lean(),
    Issue.find(filter)
      .select('key number title summary priorityId priorityName priorityRank assignee assigneeId statusId statusCategory dueDate rank updatedAt version labels')
      .sort({ rank: 1, number: 1 })
      .limit(300)
      .lean(),
  ]);
  const byId = new Map();
  for (const s of workflows.flatMap((w) => w.statuses)) if (!byId.has(String(s.id))) byId.set(String(s.id), s);
  const statuses = [...byId.values()]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((s) => ({ id: String(s.id), name: s.name, category: s.category, color: s.color ?? null }));
  return {
    project: { id: String(project._id), key: project.key, name: project.name },
    statuses,
    issues: issues.map((i) => ({
      id: String(i._id),
      key: i.key,
      number: i.number,
      title: i.title,
      summary: i.summary ?? null,
      priority: i.priorityId ? { id: String(i.priorityId), name: i.priorityName ?? null, rank: i.priorityRank ?? null } : null,
      assignee: i.assigneeId ? { id: String(i.assigneeId), name: i.assignee?.name ?? null, avatarUrl: i.assignee?.avatarUrl ?? null } : null,
      statusId: String(i.statusId),
      statusCategory: i.statusCategory,
      dueDate: i.dueDate ?? null,
      rank: i.rank,
      updatedAt: i.updatedAt,
      version: i.version,
      labels: i.labels ?? [],
    })),
  };
}
