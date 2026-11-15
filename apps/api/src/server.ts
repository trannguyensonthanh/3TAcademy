import { eq } from 'drizzle-orm';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { db, pool } from './db/index.js';
import { cohorts, classSessions, courses } from './db/schema/index.js';
import { runSeed } from './db/seed.js';
import { redis } from './config/redis.js';
import { getConfiguredSepayWebhookUrls } from './modules/order/order.routes.js';

async function ensureFreshDatabaseSeed() {
  try {
    const [allCourses, sweCohorts] = await Promise.all([
      db.select({ id: courses.id }).from(courses),
      db.select().from(cohorts).where(eq(cohorts.code, 'SWE-ARCH-2026-K01')).limit(1),
    ]);

    const sweCohort = sweCohorts[0];
    let needsReseed = allCourses.length < 4 || !sweCohort || sweCohort.startDate === '2026-05-06';

    if (!needsReseed && sweCohort) {
      const sweSessions = await db
        .select({
          id: classSessions.id,
          livekitRoomName: classSessions.livekitRoomName,
        })
        .from(classSessions)
        .where(eq(classSessions.cohortId, sweCohort.id));

      if (
        sweSessions.length < 6 ||
        sweSessions.some((s) => s.livekitRoomName === 'room-swe-k01-s04-live')
      ) {
        needsReseed = true;
      }
    }

    if (needsReseed) {
      logger.info('Detected stale or incomplete database seed — running automatic re-seed...');
      await runSeed(db);
      logger.info('Automatic database re-seed completed successfully.');
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
