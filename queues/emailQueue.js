const { Queue, Worker } = require('bullmq');
const { createRedisClient } = require('../config/redis');

if (!process.env.REDIS_URL) {
  module.exports = { emailQueue: null };
} else {
  const connection = createRedisClient('email-queue');

  const emailQueue = new Queue('emails', { connection });
  const emailWorker = new Worker(
  'emails',
  async (job) => {
    const { to, subject, html } = job.data;

    const nodemailer = require('nodemailer');

    if (!emailWorker._transporter) {
      emailWorker._transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }

    const from = process.env.EMAIL_FROM || 'noreply@collabor8r.app';
    const info = await emailWorker._transporter.sendMail({ from, to, subject, html });
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return info;
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

emailWorker.on('failed', (job, err) => {
  console.error(`❌ Email job ${job.id} failed:`, err.message);
});

emailWorker.on('completed', (job) => {
  console.log(`✅ Email job ${job.id} completed`);
});

  module.exports = { emailQueue };
}
