import { pgTable, bigserial, varchar, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { accountRoleEnum, accountStatusEnum, authProviderEnum } from './enums.js';

export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: accountRoleEnum('role').notNull().default('STUDENT'),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountIdentities = pgTable('account_identities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  provider: authProviderEnum('provider').notNull(),
  providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_provider_subject').on(table.provider, table.providerSubject),
]);

export const userProfiles = pgTable('user_profiles', {
  accountId: bigserial('account_id', { mode: 'number' }).primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  careerGoal: text('career_goal'),
  faceReferenceR2Key: text('face_reference_r2_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const instructorProfiles = pgTable('instructor_profiles', {
  accountId: bigserial('account_id', { mode: 'number' }).primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  headline: varchar('headline', { length: 255 }).notNull(),
  organization: varchar('organization', { length: 200 }),
  yearsOfExperience: integer('years_of_experience'),
  expertiseSummaryMd: text('expertise_summary_md'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const instructorAvailabilities = pgTable('instructor_availabilities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0 = Sun, 1 = Mon ...
  startMinute: integer('start_minute').notNull(), // 0..1439
  endMinute: integer('end_minute').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

