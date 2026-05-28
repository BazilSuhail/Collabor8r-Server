// Minimal logger: one line per entry, request id included when inside a request.
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.js';

export const requestContext = new AsyncLocalStorage();

const write = (level, args) => {
  const requestId = requestContext.getStore()?.requestId;
  const parts = args.map((a) => (a instanceof Error ? (env.isProd ? `${a.name}: ${a.message}` : a.stack) : typeof a === 'string' ? a : JSON.stringify(a)));
  const line = `${new Date().toISOString()} ${level}${requestId ? ` [${requestId}]` : ''} ${parts.join(' ')}`;
  (level === 'info' ? console.log : console.error)(line);
};

export const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};
