import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://edutech_user:edutech_secret_2026@localhost:5432/edutech_db',
  },
  verbose: true,
  strict: true,
});
