// Environment validation. Fails fast with a readable message; dev defaults only outside production.
import 'dotenv/config';
import { z } from 'zod';

// Dev defaults (and short secrets) are allowed only when NODE_ENV is explicitly "development" or "test".
// Unset, misspelled or "production" all take the strict path: secrets required, 32+ chars.
const isLoose = ['development', 'test'].includes(process.env.NODE_ENV);
const isProd = !isLoose;
const DEV = {
  MONGO_URI: 'mongodb://127.0.0.1:27017/pm_suite',
  JWT_SECRET: 'dev-secret-change-me-dev-secret-change-me',
  CLIENT_ORIGIN: 'http://localhost:5173',
  UPLOAD_SIGNING_SECRET: 'dev-upload-secret-dev-upload-secret',
};

// Treats empty strings as unset so `.env` placeholders like `KEY=` fall back to defaults.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const int = (def, min = 0) => z.coerce.number().int().min(min).default(def);
const bool = (def) =>
  z.enum(['true', 'false', '1', '0']).default(def ? 'true' : 'false').transform((v) => v === 'true' || v === '1');

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000, 0), // 0 picks a free port
  MONGO_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
  JWT_SECRET: z.string().min(isProd ? 32 : 16, `must be at least ${isProd ? 32 : 16} characters`),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: int(30, 1),
  BCRYPT_ROUNDS: int(12, 4).pipe(z.number().max(15)),
  CLIENT_ORIGIN: z.string().min(1),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  UPLOAD_SIGNING_SECRET: z.string().min(isProd ? 32 : 16, `must be at least ${isProd ? 32 : 16} characters`),
  UPLOAD_URL_TTL_SEC: int(900, 1),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  UPLOAD_MAX_BYTES: int(26214400, 1),
  GROQ_API_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Collabor8r <onboarding@resend.dev>'),
  AI_MODEL: z.string().default('openai/gpt-oss-120b'),
  AI_DAILY_CALL_LIMIT: int(100),
  WEBHOOK_TIMEOUT_MS: int(5000, 100),
  ACTIVITY_RETENTION_DAYS: int(365, 1),
  AUDIT_RETENTION_DAYS: int(365, 1),
  AUTH_RATE_LIMIT: int(10, 1),
  API_RATE_LIMIT: int(600, 1),
  LOGIN_MAX_FAILURES: int(10, 1),
  LOGIN_LOCK_MINUTES: int(15, 1),
  TRUST_PROXY: z.string().default('false'),
  BACKGROUND_JOBS: bool(true),
  SHUTDOWN_TIMEOUT_MS: int(10000, 100),
});

const input = { ...raw };
if (isLoose) for (const [k, v] of Object.entries(DEV)) input[k] ??= v;

const parsed = base.safeParse(input);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => {
    const key = i.path.join('.');
    return `  ${key}: ${input[key] === undefined ? 'is required' : i.message}`;
  });
  console.error(`Invalid environment configuration${isProd ? ' (production)' : ''}:\n${lines.join('\n')}`);
  process.exit(1);
}
const e = parsed.data;

const origins = e.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
if (origins.includes('*')) {
  console.error('Invalid environment configuration:\n  CLIENT_ORIGIN: wildcard origins are not allowed');
  process.exit(1);
}

// "true"/"false" -> boolean, digits -> hop count, anything else (e.g. "loopback") passes through.
const trustProxy = e.TRUST_PROXY === 'true' ? true : e.TRUST_PROXY === 'false' ? false : /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY;

export const env = {
  nodeEnv: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  port: e.PORT,
  mongoUri: e.MONGO_URI,
  jwtSecret: e.JWT_SECRET,
  accessTtl: e.JWT_ACCESS_TTL,
  refreshTtlDays: e.REFRESH_TTL_DAYS,
  bcryptRounds: e.BCRYPT_ROUNDS,
  clientOrigins: origins,
  publicBaseUrl: e.PUBLIC_BASE_URL,
  uploadSigningSecret: e.UPLOAD_SIGNING_SECRET,
  uploadUrlTtlSec: e.UPLOAD_URL_TTL_SEC,
  uploadDir: e.UPLOAD_DIR,
  uploadMaxBytes: e.UPLOAD_MAX_BYTES,
  groqApiKey: e.GROQ_API_KEY,
  resendApiKey: e.RESEND_API_KEY,
  emailFrom: e.EMAIL_FROM,
  aiModel: e.AI_MODEL,
  aiDailyCallLimit: e.AI_DAILY_CALL_LIMIT,
  webhookTimeoutMs: e.WEBHOOK_TIMEOUT_MS,
  activityRetentionDays: e.ACTIVITY_RETENTION_DAYS,
  auditRetentionDays: e.AUDIT_RETENTION_DAYS,
  authRateLimit: e.AUTH_RATE_LIMIT,
  apiRateLimit: e.API_RATE_LIMIT,
  loginMaxFailures: e.LOGIN_MAX_FAILURES,
  loginLockMinutes: e.LOGIN_LOCK_MINUTES,
  trustProxy,
  backgroundJobs: e.BACKGROUND_JOBS,
  shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
};
