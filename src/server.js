// Entry point: connect Mongo, start background jobs, listen, shut down cleanly.
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { banner } from './utils/status.js';
import { registerAutomationRunner } from './modules/automation/automation.runner.js';
import { registerWebhookDispatcher } from './modules/webhooks/webhooks.dispatcher.js';
import { registerSlaTicker } from './modules/servicedesk/sla.ticker.js';

let server;
let stopping = false;

const shutdown = async (reason, code = 0) => {
  if (stopping) return;
  stopping = true;
  logger.info(`${reason}: shutting down`);
  const timer = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, env.shutdownTimeoutMs);
  timer.unref();
  try {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections?.();
      });
    }
    await mongoose.disconnect();
  } catch (err) {
    logger.error('Error during shutdown', err);
    code ||= 1;
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  shutdown('uncaughtException', 1);
});

try {
  await connectDb();
} catch (err) {
  logger.error('Database startup failed:', err.message);
  process.exit(1);
}
logger.info('MongoDB connected');

if (env.backgroundJobs) {
  registerAutomationRunner();
  registerWebhookDispatcher();
  registerSlaTicker();
  logger.info('Background jobs started');
} else {
  logger.info('Background jobs disabled (BACKGROUND_JOBS=false)');
}

server = app.listen(env.port, () => {
  logger.info(`API listening on port ${env.port}`);
  console.log(`
${banner()}
`);
});
// Keep-alive longer than typical proxy idle timeouts avoids sporadic 502s behind a load balancer.
server.keepAliveTimeout = 65000;
