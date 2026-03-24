const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL not set — Redis features disabled');
}

const createRedisClient = (name) => {
  if (!REDIS_URL) return null;
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectionName: name,
  });
  client.on('error', (err) => {
    console.error(`❌ Redis [${name}] error:`, err.message);
  });
  client.on('connect', () => {
    console.log(`✅ Redis [${name}] connected`);
  });
  return client;
};

const pubClient = createRedisClient('pub');
const subClient = createRedisClient('sub');

module.exports = { pubClient, subClient, createRedisClient };
