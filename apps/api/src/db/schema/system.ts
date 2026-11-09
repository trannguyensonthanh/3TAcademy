import { pgTable, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const systemSettings = pgTable('system_settings', {
  key: varchar('setting_key', { length: 100 }).primaryKey(),
  value: text('setting_value').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
