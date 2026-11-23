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

const PLACEHOLDER_ENV_VALUES = new Set([
  'https://media.yourdomain.com',
  'wss://your-livekit.livekit.cloud',
  'ws://localhost:7880',
  'your-livekit-api-key',
  'your-livekit-api-secret',
  'your-r2-account-id',
  'your-r2-access-key',
  'your-r2-secret-key',
  'your_cloudflare_account_id',
  'your_r2_access_key_id',
  'your_r2_secret_access_key',
  'devkey',
  'secret',
]);

const mediaEnvPreprocess = (val: unknown) => {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim().replace(/\/+$/, '');
  if (!trimmed || PLACEHOLDER_ENV_VALUES.has(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgres://edutech_user:edutech_secret_2026@localhost:54320/edutech_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  INTERNAL_API_KEY: z
    .string()
    .min(16, 'INTERNAL_API_KEY must be at least 16 chars')
    .default('internal_shared_secret_2026'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars')
    .default('jwt_access_super_secret_key_2026_dev'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars')
    .default('jwt_refresh_super_secret_key_2026_dev'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  HMAC_CERTIFICATE_SECRET: z.string().default('3t-academy-hmac-certificate-secret-key-2026'),
  AI_SERVICE_URL: z.string().default('http://127.0.0.1:8000'),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  GEMINI_MODEL: z.string().trim().default('gemini-3.5-flash'),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  LIVEKIT_API_URL: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  LIVEKIT_API_KEY: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  LIVEKIT_API_SECRET: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  R2_ACCOUNT_ID: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  R2_ACCESS_KEY_ID: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  R2_SECRET_ACCESS_KEY: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('')
  ),
  R2_BUCKET_NAME: z.preprocess(
    mediaEnvPreprocess,
    z.string().trim().default('edutech-storage')
  ),
  R2_PUBLIC_DOMAIN: z.preprocess(
    mediaEnvPreprocess,
    z
      .string()
      .trim()
      .default('')
      .transform((val) => val.replace(/\/+$/, ''))
  ),
  SEPAY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  SEPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  PUBLIC_API_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .default('http://localhost:4000')
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
