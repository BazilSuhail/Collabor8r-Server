const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const { initSocket } = require('./socket');

dotenv.config();
connectDB();
const app = express();

const server = http.createServer(app);
initSocket(server);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  const memory = process.memoryUsage();
  console.log(`Memory usage: RSS ${Math.round(memory.rss / 1024 / 1024 * 100) / 100} MB | Heap ${Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100}/${Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100} MB`)
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

app.use('/overview', require('./routes/dashboardRoutes'));
app.use('/profile', require('./routes/profileRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/admin-projects', require('./routes/adminProjectRoutes'));
app.use('/manageusers', require('./routes/addUsersRoutes'));
app.use('/joinedprojects', require('./routes/joinedProjectRoutes'));
app.use('/manageTasks', require('./routes/taskRoutes'));
app.use('/projecttasks', require('./routes/usersProjectTasksRoutes'));
app.use('/comments', require('./routes/commentsRoutes'));
app.use('/projects', require('./routes/projectRoutes'));
app.use('/project-tasks', require('./routes/projectTasksRoutes'));

app.use('/sprints', require('./routes/sprintRoutes'));
app.use('/activity', require('./routes/activityRoutes'));
app.use('/time', require('./routes/timeRoutes'));
app.use('/task-links', require('./routes/taskLinkRoutes'));
app.use('/filters', require('./routes/filterRoutes'));
app.use('/boards', require('./routes/boardRoutes'));
app.use('/labels', require('./routes/labelRoutes'));
app.use('/webhooks', require('./routes/webhookRoutes'));
app.use('/organizations', require('./routes/organizationRoutes'));
app.use('/invitations', require('./routes/invitationRoutes'));
app.use('/uploads', require('./routes/uploadRoutes'));
app.use('/ai', require('./routes/aiRoutes'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  const mem = process.memoryUsage();
  console.log('═══════════════════════════════════════════');
  console.log(`  🚀  REST API  →  http://localhost:${PORT}`);
  console.log(`  ⚡  Socket.IO →  ws://localhost:${PORT}`);
  console.log(`  📁  Uploads   →  http://localhost:${PORT}/uploads`);
  console.log(`  💾  Memory    →  RSS ${Math.round(mem.rss / 1024 / 1024 * 100) / 100} MB | Heap ${Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100}/${Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100} MB`);
  console.log('═══════════════════════════════════════════');
});
