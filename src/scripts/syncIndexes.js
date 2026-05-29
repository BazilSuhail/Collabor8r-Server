// Usage: npm run db:indexes [-- --dry-run] [-- --drop]
// Default is ADDITIVE: builds declared indexes that are missing and never drops anything.
//   --dry-run  print declared-vs-existing diff per model, change nothing
//   --drop     explicit opt-in: after building, also drop indexes that are not declared in the schema
// Run once per deploy in production (autoIndex is off there). ProjectActivity (time-series) is never dropped from.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const drop = args.has('--drop');

let failed = 0;
try {
  await connectDb();
  for (const model of Object.values(mongoose.models)) {
    const name = model.modelName;
    try {
      const diff = await model.diffIndexes();
      const toCreate = diff.toCreate ?? [];
      const toDrop = diff.toDrop ?? [];
      if (dryRun) {
        console.log(`[${name}] create: ${JSON.stringify(toCreate)} | undeclared (dropped only with --drop): ${JSON.stringify(toDrop)}`);
        continue;
      }
      // Build first, so a failed build never leaves a collection without its index.
      await model.createIndexes();
      console.log(`[${name}] built ${toCreate.length} missing index(es)`);
      if (drop && name !== 'ProjectActivity') {
        for (const idxName of toDrop) {
          await model.collection.dropIndex(idxName);
          console.log(`[${name}] dropped ${idxName}`);
        }
      } else if (toDrop.length) {
        console.log(`[${name}] kept undeclared: ${toDrop.join(', ')}`);
      }
    } catch (err) {
      // Isolate per model (e.g. IndexOptionsConflict, duplicate data) so one failure does not abort the rest.
      failed += 1;
      console.error(`[${name}] index sync failed: ${err.message}`);
    }
  }
  console.log(dryRun ? 'Dry run complete' : `Index sync done${failed ? ` with ${failed} model failure(s)` : ''}`);
  await mongoose.disconnect();
  if (failed) process.exit(1);
} catch (err) {
  console.error('Index sync failed:', err.message);
  process.exit(1);
}
