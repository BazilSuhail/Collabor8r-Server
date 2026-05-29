// Runtime status snapshot + ASCII dashboard used by `/`, `/health`, `/api/health` and the startup banner.
import os from 'node:os';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

const MB = 1024 * 1024;
const mb = (n) => Math.round((n / MB) * 10) / 10;
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export function snapshot() {
  const m = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  const dbState = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
  return {
    status: 'ok',
    name: 'Collabor8r API',
    mode: env.isProd ? 'production' : 'development',
    node: process.version,
    pid: process.pid,
    port: env.port,
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
    database: dbState,
    backgroundJobs: Boolean(env.backgroundJobs),
    memory: {
      rssMb: mb(m.rss),
      heapUsedMb: mb(m.heapUsed),
      heapTotalMb: mb(m.heapTotal),
      externalMb: mb(m.external),
      systemTotalMb: mb(total),
      systemFreeMb: mb(free),
      systemUsedPct: Math.round(((total - free) / total) * 100),
    },
    cpu: { cores: os.cpus().length, load1m: Math.round(os.loadavg()[0] * 100) / 100 },
  };
}

export function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${d ? `${d}d ` : ''}${h}h ${m}m ${s}s`;
}

const bar = (pct, width = 20) => {
  const p = Math.max(0, Math.min(100, pct));
  const fill = Math.round((p / 100) * width);
  return `${'='.repeat(fill)}${'-'.repeat(width - fill)} ${p}%`;
};

const row = (k, v) => `${k.padEnd(10)}${v}`;

export function banner(s = snapshot()) {
  const heapPct = s.memory.heapTotalMb ? Math.round((s.memory.heapUsedMb / s.memory.heapTotalMb) * 100) : 0;
  const usedMb = Math.round(s.memory.systemTotalMb - s.memory.systemFreeMb);
  return [
    'Collabor8r API',
    '',
    row('status', `${s.status} (${s.mode})`),
    row('uptime', formatUptime(s.uptimeSec)),
    row('database', s.database),
    row('jobs', s.backgroundJobs ? 'running' : 'disabled'),
    row('port', String(s.port)),
    row('node', s.node),
    '',
    row('heap', `${s.memory.heapUsedMb} / ${s.memory.heapTotalMb} MB  ${bar(heapPct)}`),
    row('process', `${s.memory.rssMb} MB`),
    row('system', `${usedMb} / ${Math.round(s.memory.systemTotalMb)} MB  ${bar(s.memory.systemUsedPct)}`),
    row('cpu', `${s.cpu.cores} cores, load ${s.cpu.load1m}`),
  ].join('\n');
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function bannerHtml(s = snapshot()) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>Collabor8r API</title>
<style>body{margin:0;background:#111;color:#d4d4d4;font:14px/1.6 ui-monospace,Consolas,Menlo,monospace;display:flex;justify-content:center;padding:24px}
pre{margin:0;white-space:pre;overflow-x:auto}small{display:block;margin-top:12px;color:#777;text-align:center}</style></head>
<body><div><pre>${esc(banner(s))}</pre><small>refreshes every 5s</small></div></body></html>`;
}
