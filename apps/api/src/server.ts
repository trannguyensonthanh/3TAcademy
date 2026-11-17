import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { db, pool } from './db/index.js';
import { cohorts, courses, certificates, knowledgeChunks, userProfiles, classSessions, enrollments, sessionSubtitles, orders, paymentTransactions } from './db/schema/index.js';
import { runSeed } from './db/seed.js';
import { redis } from './config/redis.js';
import {
  getConfiguredSepayWebhookUrls,
  reconcileUnmatchedSepayTransactions,
} from './modules/order/order.routes.js';
import { eq } from 'drizzle-orm';

async function ensureFreshDatabaseSeed() {
  try {
    // First reconcile any pending/unmatched SePay webhook transactions so real student payments are immediately fulfilled
    await reconcileUnmatchedSepayTransactions();

    const [
      allCourses,
      allCohorts,
      allCerts,
      allChunks,
      allProfiles,
      allSessions,
      allEnrollments,
      allOrders,
      allTxns,
    ] = await Promise.all([
      db.select({ id: courses.id }).from(courses),
      db.select().from(cohorts),
      db.select({ id: certificates.id }).from(certificates),
      db.select().from(knowledgeChunks),
      db.select({ cvParsedData: userProfiles.cvParsedData }).from(userProfiles),
      db.select().from(classSessions),
      db.select({ id: enrollments.id }).from(enrollments),
      db.select({ id: orders.id }).from(orders),
      db.select({ id: paymentTransactions.id }).from(paymentTransactions),
    ]);

    const hasLegacyCohorts =
      allCohorts.length !== 4 ||
      allCohorts.some((c) => c.tuitionVnd !== 10000) ||
      allCohorts.some(
        (c) =>
          c.code === 'AI-ENG-2026-K02' ||
          c.code === 'PY-SQL-2026-K04' ||
          c.code === 'PY-SQL-2026-K05'
      );

    const hasMissingEmbeddings =
      allChunks.length < 10 ||
      allChunks.some((ch) => !Array.isArray(ch.embedding) || ch.embedding.length !== 1024) ||
      allChunks.some((ch) => ch.content.includes('học phí ưu đãi thử nghiệm'));

    const hasRawMarkdownSessionSummaries = allSessions.some(
      (s) =>
        (s.aiSummaryMd || '').includes('### Tóm tắt trọng tâm') ||
        (s.aiSummaryMd || '').includes('$RRF')
    );

    const aiCohort = allCohorts.find((c) => c.code === 'AI-ENG-2026-K01');
    const pyCohort = allCohorts.find((c) => c.code === 'PY-SQL-2026-K01');
    const hasAllSixReplayReadyInAiOrPy = allSessions.some(
      (s) =>
        s.sessionOrder === 6 &&
        s.status === 'REPLAY_READY' &&
        (s.cohortId === aiCohort?.id || s.cohortId === pyCohort?.id)
    );

    const hasLegacySeedCerts = allCerts.length >= 3;
    const hasLegacyPrebakedStudentCv = allProfiles.some((p) => {
      const cv = (p.cvParsedData ?? {}) as Record<string, unknown>;
      return (
        cv.fileName === 'LeHoangMai_Junior_AIEngineer_CV_2026.pdf' ||
        cv.fileName === 'NguyenVanAn_Fresher_AIEngineer_CV_2026.pdf'
      );
    });

    const hasUserActivity =
      allEnrollments.length > 0 || allOrders.length > 0 || allTxns.length > 0;

    if (
      allCourses.length < 4 ||
      hasLegacyCohorts ||
      hasMissingEmbeddings ||
      hasLegacySeedCerts ||
      hasLegacyPrebakedStudentCv ||
      ((hasRawMarkdownSessionSummaries || hasAllSixReplayReadyInAiOrPy) && !hasUserActivity)
    ) {
      logger.info(
        'Detected legacy or unformatted database seed — running clean minimal database re-seed...'
      );
      await runSeed(db);
      logger.info('Clean minimal database re-seed completed successfully.');
    } else if (hasRawMarkdownSessionSummaries || hasAllSixReplayReadyInAiOrPy) {
      for (const s of allSessions) {
        if ((s.aiSummaryMd || '').includes('###') || (s.aiSummaryMd || '').includes('$')) {
          const cleaned = (s.aiSummaryMd || '')
            .replace(/^#{1,6}\s*Tóm tắt trọng tâm Buổi\s*\d+\s*:?\s*/gim, '')
            .replace(/^#+\s*/gm, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\$[^$]+\$/g, 'RRF_Score(d) = 1/(k + rank_dense) + 1/(k + rank_bm25)')
            .replace(/\s*\n\s*/g, ' ')
            .trim();
          await db
            .update(classSessions)
            .set({ aiSummaryMd: cleaned })
            .where(eq(classSessions.id, s.id));
        }
        if (
          s.sessionOrder === 6 &&
          s.status === 'REPLAY_READY' &&
          (s.cohortId === aiCohort?.id || s.cohortId === pyCohort?.id)
        ) {
          await db
            .delete(sessionSubtitles)
            .where(eq(sessionSubtitles.sessionId, s.id));
          await db
            .update(classSessions)
            .set({ status: 'SCHEDULED', videoR2Key: null })
            .where(eq(classSessions.id, s.id));
        }
      }
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
