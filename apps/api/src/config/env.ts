import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

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
  VNPAY_TMN_CODE: z.string().optional(),
  VNPAY_HASH_SECRET: z.string().optional(),
  VNPAY_URL: z.string().optional(),
  VNPAY_RETURN_URL: z.string().optional(),
  SEPAY_API_KEY: z.string().optional(),
  SEPAY_BANK_NAME: z.string().default('MBBank'),
  SEPAY_ACCOUNT_NUMBER: z.string().default('0987654321'),
  SEPAY_ACCOUNT_HOLDER: z.string().default('CONG TY CONG NGHE VA GIAO DUC 3T'),
});

export const env = envSchema.parse(process.env);
