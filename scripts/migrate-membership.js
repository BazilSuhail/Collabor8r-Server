// One-off: rebuild Membership docs into the exclusive admin/asLead/joined buckets
// (old shape was { projects, asLead } with asLead ⊆ projects).
// Rule per project: createdBy → admin; leads − creator → asLead; team − leads − creator → joined.
// Idempotent — drops and recreates all Membership docs from the projects collection.
// Usage: MONGODB_URI=mongodb://localhost:27017/collabora8r node scripts/migrate-membership.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Project, Membership } = require('../projects/models');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  const buckets = new Map();
  const bucketFor = (uid) => {
    if (!buckets.has(uid)) buckets.set(uid, { admin: new Set(), asLead: new Set(), joined: new Set() });
    return buckets.get(uid);
  };
  const add = (uid, bucket, pid) => bucketFor(uid)[bucket].add(String(pid));

  let projectCount = 0;
  for await (const p of Project.find({}).select('createdBy leads team').lean().cursor()) {
    projectCount += 1;
    const pid = String(p._id);
    const creator = String(p.createdBy);
    add(creator, 'admin', pid);

    const leadSet = new Set((p.leads || []).map(String));
    for (const l of leadSet) {
      if (l !== creator) add(l, 'asLead', pid);
    }
    for (const t of new Set((p.team || []).map(String))) {
      if (t !== creator && !leadSet.has(t)) add(t, 'joined', pid);
    }
  }

  await Membership.deleteMany({});
  const docs = [...buckets.entries()].map(([uid, b]) => ({
    _id: uid,
    admin: [...b.admin],
    asLead: [...b.asLead],
    joined: [...b.joined],
  }));
  if (docs.length) await Membership.insertMany(docs, { ordered: false });

  const totals = docs.reduce(
    (acc, d) => ({
      admin: acc.admin + d.admin.length,
      asLead: acc.asLead + d.asLead.length,
      joined: acc.joined + d.joined.length,
    }),
    { admin: 0, asLead: 0, joined: 0 }
  );
  console.log(`Migrated ${projectCount} projects → ${docs.length} membership docs`);
  console.log(`  admin: ${totals.admin} | asLead: ${totals.asLead} | joined: ${totals.joined}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
