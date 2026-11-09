import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import { pool } from './index.js';


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigrations(){
  logger.info("startdatabase migratio....ing ")

  try {
    const sqlFilePath = path.join(__dirname, "migrations", "0000_baseline.sql");
    const sql = await fs.readFile(sqlFilePath, "utf-8")
    await pool.query(sql);
    logger.info('database migration (33 tables + pgvector) completed successfully!')
  } catch (error){
    logger.error( {error}, 'Migration failed')
    process.exitCode = 1;

  } finally {
    await pool.end();
  }
}

runMigrations();