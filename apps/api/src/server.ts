import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { db, pool } from './db/index.js';
import { cohorts, courses, certificates, knowledgeChunks } from './db/schema/index.js';
import { runSeed } from './db/seed.js';
import { redis } from './config/redis.js';
import { getConfiguredSepayWebhookUrls } from './modules/order/order.routes.js';

async function ensureFreshDatabaseSeed() {
  try {
    const [allCourses, allCohorts, allCerts, allChunks] = await Promise.all([
      db.select({ id: courses.id }).from(courses),
      db.select().from(cohorts),
      db.select({ id: certificates.id }).from(certificates),
      db.select().from(knowledgeChunks),
    ]);

    const hasLegacyCohorts =
      allCohorts.length !== 4 ||
      allCohorts.some((c) => c.tuitionVnd !== 10000) ||
      allCohorts.some((c) => c.code === 'AI-ENG-2026-K02' || c.code === 'PY-SQL-2026-K04' || c.code === 'PY-SQL-2026-K05');

    const hasMissingEmbeddings =
      allChunks.length < 10 ||
      allChunks.some((ch) => !Array.isArray(ch.embedding) || ch.embedding.length !== 1024);

    // Also re-seed if legacy duplicate certificates CERT-3T-2026-8892/8893 exist
    const hasLegacySeedCerts = allCerts.length >= 3;

    if (allCourses.length < 4 || hasLegacyCohorts || hasMissingEmbeddings || hasLegacySeedCerts) {
      logger.info('Detected legacy or incomplete database seed — running clean minimal 10.000đ + RAG vector re-seed...');
      await runSeed(db);
      logger.info('Clean minimal database re-seed completed successfully.');
    }
  } catch (err) {
    logger.warn({ err }, 'Skipped automatic database seed check on startup');
  }
}

const server = app.listen(env.PORT, () => {
  const sepayUrls = getConfiguredSepayWebhookUrls();
  logger.info(`EduTech API server running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`SePay primary webhook URL: ${sepayUrls.primaryWebhookUrl}`);
  logger.info(`SePay backup webhook URL: ${sepayUrls.backupWebhookUrl}`);
  void ensureFreshDatabaseSeed();
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
