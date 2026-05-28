import { Router } from 'express';
import { makeProjectCrud } from '../../utils/crud.js';
import { Risk } from '../../models/index.js';
import { actorOf } from '../../services/activity.service.js';
import * as s from './risks.schemas.js';

const router = Router({ mergeParams: true });

const ownerNameOf = async (ownerId) => (ownerId ? (await actorOf({ id: String(ownerId) })).name : '');

// Score and owner name are derived on every write.
router.use('/risks', makeProjectCrud({
  Model: Risk,
  name: 'risk',
  createSchema: s.createRiskSchema,
  updateSchema: s.updateRiskSchema,
  filterFields: ['status', 'category'],
  searchFields: ['title', 'category'],
  beforeCreate: async (req, body) => ({
    ...body,
    score: body.probability * body.impact,
    ownerName: await ownerNameOf(body.ownerId),
  }),
  afterWrite: async (req, doc, action) => {
    if (action === 'delete') return;
    const score = (doc.probability ?? 0) * (doc.impact ?? 0);
    const ownerName = await ownerNameOf(doc.ownerId);
    if (doc.score !== score || doc.ownerName !== ownerName) {
      await Risk.updateOne({ _id: doc._id }, { $set: { score, ownerName } });
      doc.score = score;
      doc.ownerName = ownerName;
    }
  },
}));

export default router;
