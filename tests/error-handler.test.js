import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { errorHandler } from '../src/middleware/error.js';
import { ApiError } from '../src/utils/http.js';

const run = (err) => {
  const out = {};
  const res = { headersSent: false, status(c) { out.status = c; return this; }, json(b) { out.body = b; } };
  errorHandler(err, { method: 'GET', originalUrl: '/x?y=1', id: 'r1' }, res, () => {});
  return out;
};

test('BSONError from invalid ObjectId maps to 400', () => {
  let err;
  try { new mongoose.Types.ObjectId('not-an-id'); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(run(err).status, 400);
});

test('unrelated BSONError stays 500', () => {
  const err = new Error('document exceeds max size');
  err.name = 'BSONError';
  assert.equal(run(err).status, 500);
});

test('CastError -> 400', () => {
  const err = new Error('x'); err.name = 'CastError'; err.path = 'a'; err.kind = 'ObjectId';
  assert.equal(run(err).status, 400);
});

test('E11000 -> 409', () => {
  const err = new Error('dup'); err.code = 11000; err.keyValue = { key: 'a' };
  assert.equal(run(err).status, 409);
});

test('ApiError passes through', () => {
  assert.equal(run(new ApiError(404, 'nope')).status, 404);
});
