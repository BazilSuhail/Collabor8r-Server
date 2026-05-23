// One-off: backfill extended profile fields (headline, bio, location, jobTitle,
// skills, languages, socialLinks, availability, statusEmoji, pronouns) into
// existing Profile docs. Only touches MISSING fields — never overwrites user data.
// Idempotent — safe to re-run; second run reports 0 updates.
// Usage: MONGODB_URI=... node scripts/migrate-profile-fields.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Profile } = require('../auth/models');

const SCALAR_DEFAULTS = {
  headline: '',
  bio: '',
  location: '',
  jobTitle: '',
  availability: 'available',
  statusEmoji: '',
  pronouns: '',
};
const ARRAY_DEFAULTS = { skills: [], languages: [] };
const SOCIAL_DEFAULTS = { github: '', linkedin: '', website: '' };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  const fields = [
    ...Object.keys(SCALAR_DEFAULTS),
    ...Object.keys(ARRAY_DEFAULTS),
    'socialLinks',
  ];
  const ops = [];

  for await (const doc of Profile.find({}).select(fields.join(' ')).lean().cursor()) {
    const $set = {};

    for (const [key, def] of Object.entries(SCALAR_DEFAULTS)) {
      if (doc[key] === undefined || doc[key] === null) $set[key] = def;
    }
    for (const [key, def] of Object.entries(ARRAY_DEFAULTS)) {
      if (doc[key] === undefined || doc[key] === null) $set[key] = [...def];
    }
    if (doc.socialLinks === undefined || doc.socialLinks === null) {
      $set.socialLinks = { ...SOCIAL_DEFAULTS };
    } else {
      for (const [sub, def] of Object.entries(SOCIAL_DEFAULTS)) {
        if (doc.socialLinks[sub] === undefined || doc.socialLinks[sub] === null) {
          $set[`socialLinks.${sub}`] = def;
        }
      }
    }

    if (Object.keys($set).length) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
    }
  }

  if (ops.length) await Profile.bulkWrite(ops, { ordered: false });

  console.log(`Scanned profiles; updated ${ops.length} doc(s) with missing fields`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
