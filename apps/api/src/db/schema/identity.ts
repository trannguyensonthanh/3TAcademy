import { pgTable, bigserial, bigint, varchar, text, timestamp, smallint, jsonb, vector, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { accountRoleEnum, accountStatusEnum, authProviderEnum } from './enums.js';

export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  role: accountRoleEnum('role').notNull().default('STUDENT'),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountIdentities = pgTable('account_identities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  provider: authProviderEnum('provider').notNull(),
  providerUid: varchar('provider_uid', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_provider_uid').on(table.provider, table.providerUid),
]);

export const userProfiles = pgTable('user_profiles', {
  accountId: bigint('account_id', { mode: 'number' }).primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  careerGoal: text('career_goal'),
  goalEmbedding: vector('goal_embedding', { dimensions: 1024 }),
  faceReferenceR2Key: text('face_reference_r2_key'),
  faceEmbedding: vector('face_embedding', { dimensions: 512 }),
  cvParsedData: jsonb('cv_parsed_data').notNull().default({}),
  interviewCredits: integer('interview_credits').notNull().default(2),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const instructorProfiles = pgTable('instructor_profiles', {
  accountId: bigint('account_id', { mode: 'number' }).primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  headline: varchar('headline', { length: 200 }).notNull(),
  organization: varchar('organization', { length: 150 }),
  yearsOfExperience: smallint('years_of_experience'),
  expertiseSummaryMd: text('expertise_summary_md'),
  socialLinks: jsonb('social_links').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
