// Shared helpers: access tokens, hashing, ids, strings.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

const ALG = 'HS256';

export const signAccessToken = ({ id, email }) =>
  jwt.sign({ sub: id, email, typ: 'access' }, env.jwtSecret, {
    algorithm: ALG,
    expiresIn: env.accessTtl,
  });

export const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALG] });
  if (payload.typ !== 'access') throw new jwt.JsonWebTokenError('Wrong token type');
  return { sub: payload.sub, email: payload.email };
};

export const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// 24-char hex Mongo id.
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const slugify = (str) =>
  String(str)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((key) => obj[key] !== undefined).map((key) => [key, obj[key]]));

export const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// UTC midnight of the given date.
export const isoDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
