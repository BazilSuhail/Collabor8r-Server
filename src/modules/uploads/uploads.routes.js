// Local storage for signed attachment URLs. The signature is the credential, so no auth header is needed.
import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';

const router = Router();
const root = path.resolve(env.uploadDir);
const CTYPE_SUFFIX = '.ctype';

function keyOf(req) {
  const parts = req.params.key;
  const segments = Array.isArray(parts) ? parts : [parts];
  const bad = segments.some((s) => !s || s === '.' || s === '..' || /[\\\0:]/.test(s));
  if (bad || segments.length === 0 || segments[segments.length - 1].endsWith(CTYPE_SUFFIX)) {
    throw new ApiError(403, 'Invalid or expired upload URL');
  }
  return segments.join('/');
}

// Same scheme as attachments.service signedUrl: HMAC_SHA256(secret, "METHOD:key:exp") as hex.
function verify(req, method, key) {
  const { exp, sig } = req.query;
  const fail = () => new ApiError(403, 'Invalid or expired upload URL');
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(exp)) throw fail();
  if (Number(exp) < Math.floor(Date.now() / 1000)) throw fail();
  const expected = createHmac('sha256', env.uploadSigningSecret).update(`${method}:${key}:${exp}`).digest();
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw fail();
}

function fileFor(key) {
  const file = path.resolve(root, ...key.split('/'));
  if (!file.startsWith(root + path.sep)) throw new ApiError(403, 'Invalid or expired upload URL');
  return file;
}

// Counts bytes and fails the pipeline once the limit is passed.
function limiter(max) {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > max) return cb(new ApiError(413, `File exceeds ${max} bytes`));
      cb(null, chunk);
    },
  });
}

router.put('/*key', async (req, res) => {
  const key = keyOf(req);
  verify(req, 'PUT', key);
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > env.uploadMaxBytes) throw new ApiError(413, `File exceeds ${env.uploadMaxBytes} bytes`);

  const file = fileFor(key);
  const tmp = `${file}.${randomBytes(6).toString('hex')}.part`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await pipeline(req, limiter(env.uploadMaxBytes), createWriteStream(tmp, { flags: 'wx' }));
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    if (err instanceof ApiError) res.set('Connection', 'close');
    throw err;
  }
  const type = String(req.headers['content-type'] || '').slice(0, 200);
  await writeFile(file + CTYPE_SUFFIX, type || 'application/octet-stream');
  res.status(204).end();
});

router.get('/*key', async (req, res) => {
  const key = keyOf(req);
  verify(req, 'GET', key);
  const file = fileFor(key);
  const info = await stat(file).catch(() => null);
  if (!info || !info.isFile()) throw new ApiError(404, 'File not found');
  const type = await readFile(file + CTYPE_SUFFIX, 'utf8').catch(() => 'application/octet-stream');
  const name = path.basename(file).replace(/[^\w.-]+/g, '_');
  res.set({
    'Content-Type': type || 'application/octet-stream',
    'Content-Length': info.size,
    'Content-Disposition': `attachment; filename="${name}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  await pipeline(createReadStream(file), res);
});

export default router;
