import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRootEnvPath = path.resolve(__dirname, '../../.env');
const workspaceRootEnvPath = path.resolve(__dirname, '../../../../.env');

// Load apps/api/.env first (more specific), then fallback to monorepo root .env
for (const envPath of [apiRootEnvPath, workspaceRootEnvPath]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  INTERNAL_API_KEY: z.string().min(16, 'INTERNAL_API_KEY must be at least 16 chars'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  HMAC_CERTIFICATE_SECRET: z.string().default('3t-academy-hmac-certificate-secret-key-2026'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  LIVEKIT_API_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  SEPAY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  SEPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  PUBLIC_API_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .default('https://guided-wallaby-measured.ngrok-free.app')
      .transform((val) => val.replace(/\/+$/, ''))
  ),
  SEPAY_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  SEPAY_WEBHOOK_BACKUP_URL: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  SEPAY_BANK_NAME: z.preprocess(emptyToUndefined, z.string().trim().default('MBBank')),
  SEPAY_ACCOUNT_NUMBER: z.preprocess(emptyToUndefined, z.string().trim().default('0389998888')),
  SEPAY_ACCOUNT_HOLDER: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('HOC VIEN CONG NGHE 3T ACADEMY')
  ),
  CPAY_API_URL: z.string().optional(),
  CPAY_MERCHANT_ID: z.string().optional(),
  CPAY_SECRET_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
