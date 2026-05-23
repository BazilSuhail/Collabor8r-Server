const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const { initSocket } = require('./socket');

dotenv.config();
connectDB();

if (process.env.REDIS_URL) {
  require('./queues/notificationQueue');
  require('./queues/emailQueue');
  require('./queues/activityQueue');
  console.log('⚡ BullMQ workers started');
} else {
  console.log('⚡ BullMQ workers skipped (no REDIS_URL)');
}

const app = express();
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
initSocket(server);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : '*';
app.use(cors({ origin: corsOrigins }));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'ok',
    message: 'Collabor8r API is running',
    port: PORT,
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024 * 100) / 100 + ' MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100 + ' MB',
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100 + ' MB',
      external: Math.round(memory.external / 1024 / 1024 * 100) / 100 + ' MB'
    }
  });
});

// Feature-first mounts — each domain owns its routes.
app.use('/auth', require('./auth/routes'));
app.use('/profile', require('./users/routes'));
app.use('/notifications', require('./notifications/routes'));
app.use('/projects', require('./projects/routes'));
app.use('/invitations', require('./projects/invitations/routes_global'));
app.use('/tasks', require('./tasks/routes'));
app.use('/sprints', require('./sprints/routes'));
app.use('/time', require('./time/routes'));
app.use('/activity', require('./activity/routes'));
app.use('/reports', require('./reports/routes'));
app.use('/overview', require('./reports/overview'));
app.use('/chat', require('./chat/routes'));
app.use('/git', require('./git/routes'));

let httpServer = server;
httpServer.listen(PORT, () => {
  const mem = process.memoryUsage();
  console.log('═══════════════════════════════════════════');
  console.log(`  🚀  REST API  →  http://localhost:${PORT}`);
  console.log(`  ⚡  Socket.IO →  ws://localhost:${PORT}`);
  console.log(`  📁  Uploads   →  http://localhost:${PORT}/uploads`);
  console.log(`  💾  Memory    →  RSS ${Math.round(mem.rss / 1024 / 1024 * 100) / 100} MB | Heap ${Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100}/${Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100} MB`);
  console.log('═══════════════════════════════════════════');
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully`);
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  const mongoose = require('mongoose');
  await mongoose.connection.close(false);
  console.log('MongoDB connection closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
