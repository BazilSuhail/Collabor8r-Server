// Usage: npm run db:indexes. Run once per deploy in production (autoIndex is off there).
import mongoose from 'mongoose';
import { connectDb, syncAllIndexes } from '../config/db.js';

try {
  await connectDb();
  const models = await syncAllIndexes();
  console.log(`Indexes synced for ${models.length} models`);
  await mongoose.disconnect();
} catch (err) {
  console.error('Index sync failed:', err.message);
  process.exit(1);
}
