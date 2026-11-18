import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolveMigrationsDir(): Promise<string> {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.resolve(__dirname, '../../src/db/migrations'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Could not locate SQL migrations directory from ${__dirname}`);
}

export async function runMigrations(options?: { closePool?: boolean }): Promise<void> {
  const shouldClosePool = options?.closePool ?? false;
  logger.info('Starting database schema migrations (32 tables + pgvector)...');

  try {
    const migrationsDir = await resolveMigrationsDir();
    const entries = await fs.readdir(migrationsDir);
    const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS __schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedRes = await pool.query<{ filename: string }>(
      'SELECT filename FROM __schema_migrations'
    );
    const appliedSet = new Set(appliedRes.rows.map((r) => r.filename));

    // Pre-existing DB check: if accounts already exists before tracking was added,
    // 0000_baseline.sql is now idempotent too, so running it + 0001 is completely safe.
    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        continue;
      }
      const sqlFilePath = path.join(migrationsDir, file);
      const sqlText = await fs.readFile(sqlFilePath, 'utf-8');
      logger.info({ migration: file }, 'Applying SQL migration...');
      await pool.query(sqlText);
      await pool.query(
        'INSERT INTO __schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [file]
      );
    }

    logger.info('Database migrations (32 tables + pgvector) are up to date.');
  } catch (error) {
    logger.error({ err: error }, 'Database migration failed');
    throw error;
  } finally {
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (isDirectEntry) {
  runMigrations({ closePool: true }).catch(() => {
    process.exitCode = 1;
  });
}
