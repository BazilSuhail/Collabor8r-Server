import { Router } from 'express';
import { makeProjectCrud } from '../../utils/crud.js';
import { CatEntry, CatGlossaryTerm } from '../../models/index.js';
import { actorOf } from '../../services/activity.service.js';
import * as s from './cat.schemas.js';

const router = Router({ mergeParams: true });

router.use('/cat-entries', makeProjectCrud({
  Model: CatEntry,
  name: 'catEntry',
  createSchema: s.createCatEntrySchema,
  updateSchema: s.updateCatEntrySchema,
  filterFields: ['status', 'sourceLang', 'targetLang'],
  searchFields: ['sourceText', 'targetText'],
  beforeCreate: async (req, body) => ({
    ...body,
    ownerName: body.ownerId ? (await actorOf({ id: String(body.ownerId) })).name : '',
  }),
}));

router.use('/cat-glossary', makeProjectCrud({
  Model: CatGlossaryTerm,
  name: 'catTerm',
  createSchema: s.createCatTermSchema,
  updateSchema: s.updateCatTermSchema,
  filterFields: ['language', 'forbidden'],
  searchFields: ['term'],
}));

export default router;
