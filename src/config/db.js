// Mongo connection, time-series collection setup and index sync.
import mongoose from 'mongoose';
import { env } from './env.js';
import { ProjectActivity } from '../models/index.js';
import { logger } from '../utils/logger.js';

// Creates projectActivity as a time-series collection. Fails clearly if a plain collection already exists.
export async function ensureTimeSeries() {
  const name = ProjectActivity.collection.collectionName;
  const [info] = await mongoose.connection.db.listCollections({ name }).toArray();
  if (!info) {
    await ProjectActivity.createCollection();
    return;
  }
  if (info.type !== 'timeseries') {
    throw new Error(
      `Collection "${name}" exists but is not a time-series collection. ` +
        `Back up or drop it (db.${name}.drop()) and restart so it can be recreated with time-series options.`,
    );
  }
  const wanted = env.activityRetentionDays * 86400;
  if (info.options?.expireAfterSeconds !== wanted) {
    await mongoose.connection.db.command({ collMod: name, expireAfterSeconds: wanted });
    logger.info(`Updated ${name} retention to ${env.activityRetentionDays} days`);
  }
}

export async function connectDb(uri = env.mongoUri) {
  mongoose.set('autoIndex', !env.isProd);
  await mongoose.connect(uri, { autoIndex: !env.isProd, serverSelectionTimeoutMS: 10000 });
  await ensureTimeSeries();
}

// Builds every model's indexes and drops ones no longer declared.
export async function syncAllIndexes() {
  const results = [];
  for (const model of Object.values(mongoose.models)) {
    if (model.modelName === 'ProjectActivity') await model.createIndexes();
    else await model.syncIndexes();
    results.push(model.modelName);
  }
  return results;
}
