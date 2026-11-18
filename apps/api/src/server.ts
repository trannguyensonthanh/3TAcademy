import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { db, pool } from './db/index.js';
import { courses, enrollments, orders, paymentTransactions, assessmentAttempts } from './db/schema/index.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { redis } from './config/redis.js';
import {
  getConfiguredSepayWebhookUrls,
  reconcileUnmatchedSepayTransactions,
} from './modules/order/order.routes.js';

async function initializeDatabaseOnStartup() {
  try {
    // 1. Always apply idempotent SQL schema migrations first so fresh & existing volumes match Drizzle
    await runMigrations({ closePool: false });

    // 2. Check if DB is empty or still holds an older zero-activity skeleton seed
    const [allCourses, allEnrollments, allOrders, allTxns, allAttempts] = await Promise.all([
      db.select({ id: courses.id }).from(courses),
      db.select({ id: enrollments.id }).from(enrollments),
      db.select({ id: orders.id }).from(orders),
      db.select({ id: paymentTransactions.id }).from(paymentTransactions),
      db.select({ id: assessmentAttempts.id }).from(assessmentAttempts),
    ]);

    const isDatabaseEmpty = allCourses.length === 0;
    const isLegacyEmptySkeleton =
      allEnrollments.length === 0 &&
      allOrders.length === 0 &&
      allTxns.length === 0 &&
      allAttempts.length === 0;

    if (isDatabaseEmpty || isLegacyEmptySkeleton) {
      logger.info(
        { isDatabaseEmpty, isLegacyEmptySkeleton },
        'Initializing clean, flow-consistent 32-table seed dataset...'
      );
      await runSeed(db);
      logger.info('Database seed initialization completed.');
    }

    // 3. Reconcile any pending/unmatched SePay webhook transactions without touching existing cohorts/sessions
    await reconcileUnmatchedSepayTransactions();
  } catch (err) {
    logger.warn({ err }, 'Database startup initialization encountered an error');
  }
}

const server = app.listen(env.PORT, () => {
  const sepayUrls = getConfiguredSepayWebhookUrls();
  logger.info(`EduTech API server running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`SePay primary webhook URL: ${sepayUrls.primaryWebhookUrl}`);
  logger.info(`SePay backup webhook URL: ${sepayUrls.backupWebhookUrl}`);
  void initializeDatabaseOnStartup();
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
