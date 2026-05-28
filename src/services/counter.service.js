// Atomic sequence counters.
import { Counter } from '../models/index.js';

export const nextSeq = async (counterId) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return doc.seq;
};

export const issueCounterId = (projectId) => `project:${projectId}:issue`;
