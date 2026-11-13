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
  LIVEKIT_API_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .default('wss://project-3t-academy-live-3vunmpp5.livekit.cloud')
  ),
  LIVEKIT_API_KEY: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('APIAK2UGEYhMadd')
  ),
  LIVEKIT_API_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('KVR8YFo2c2FwZEwCAOMhP2sFzQlwZ7ylmgTdPeRKavV')
  ),
  R2_ACCOUNT_ID: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('e3075f23d1126bc8bfb3bb679a533e58')
  ),
  R2_ACCESS_KEY_ID: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('371c3ac7558bb2bb64f62df8aca59deb')
  ),
  R2_SECRET_ACCESS_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .default('12c612ace0b0fc2ad6a41d062695cb0cf419938bc5eeb1cc5ae9fc994dc58114')
  ),
  R2_BUCKET_NAME: z.preprocess(
    emptyToUndefined,
    z.string().trim().default('edutech-storage')
  ),
  R2_PUBLIC_DOMAIN: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .default('https://pub-7ab9c21bfa214570bd20463f8f4522c2.r2.dev')
      .transform((val) => val.replace(/\/+$/, ''))
  ),
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
