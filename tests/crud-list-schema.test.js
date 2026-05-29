import test from 'node:test';
import assert from 'node:assert/strict';
import { buildListSchema } from '../src/utils/crud.js';

const id = 'a'.repeat(24);

test('declared filter keys kept, unknown stripped', () => {
  const out = buildListSchema(['status', 'budgetLineId']).parse({ status: 'open', budgetLineId: id, junk: 'x', limit: '10' });
  assert.equal(out.status, 'open');
  assert.equal(out.budgetLineId, id);
  assert.equal(out.junk, undefined);
  assert.equal(out.limit, 10);
});

test('undeclared filter key is stripped', () => {
  assert.equal(buildListSchema([]).parse({ status: 'open' }).status, undefined);
});

test('bad ids and operator injection rejected', () => {
  const s = buildListSchema(['status', 'folderId']);
  assert.equal(s.safeParse({ folderId: 'nope' }).success, false);
  assert.equal(s.safeParse({ status: { $ne: 'x' } }).success, false);
  assert.equal(s.safeParse({ status: ['a', 'b'] }).success, false);
  assert.equal(s.safeParse({ folderId: { $ne: id } }).success, false);
  assert.equal(s.safeParse({ status: '' }).success, false);
});
