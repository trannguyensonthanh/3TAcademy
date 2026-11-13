import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/index.js';
import { redis } from './config/redis.js';
import { getConfiguredSepayWebhookUrls } from './modules/order/order.routes.js';

const server = app.listen(env.PORT, () => {
  const sepayUrls = getConfiguredSepayWebhookUrls();
  logger.info(`EduTech API server running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`SePay primary webhook URL: ${sepayUrls.primaryWebhookUrl}`);
  logger.info(`SePay backup webhook URL: ${sepayUrls.backupWebhookUrl}`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await pool.end();
      logger.info('PostgreSQL pool drained');
      await redis.quit();
      logger.info('Redis client disconnected');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
