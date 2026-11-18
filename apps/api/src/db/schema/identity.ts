import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  timestamp,
  smallint,
  jsonb,
  vector,
  uniqueIndex,
  integer,
  check,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accountRoleEnum, accountStatusEnum, authProviderEnum } from './enums.js';

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export interface UserNotificationPreferences {
  emailReminders?: boolean;
  liveSessionAlerts?: boolean;
  aiStudyNudges?: boolean;
  marketingUpdates?: boolean;
}

export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: accountRoleEnum('role').notNull().default('STUDENT'),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const accountIdentities = pgTable(
  'account_identities',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerUid: varchar('provider_uid', { length: 255 }).notNull(),
    providerEmail: citext('provider_email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_provider_uid').on(table.provider, table.providerUid)]
);

export const userProfiles = pgTable(
  'user_profiles',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    githubUrl: text('github_url'),
    linkedinUrl: text('linkedin_url'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    careerGoal: text('career_goal'),
    goalEmbedding: vector('goal_embedding', { dimensions: 1024 }),
    faceReferenceR2Key: text('face_reference_r2_key'),
    faceEmbedding: vector('face_embedding', { dimensions: 512 }),
    cvParsedData: jsonb('cv_parsed_data').notNull().default({}),
    preferences: jsonb('preferences').$type<UserNotificationPreferences>().notNull().default({}),
    interviewCredits: integer('interview_credits').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [check('chk_user_profiles_interview_credits', sql`${table.interviewCredits} >= 0`)]
);

export const instructorProfiles = pgTable(
  'instructor_profiles',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    headline: varchar('headline', { length: 200 }).notNull(),
    organization: varchar('organization', { length: 150 }),
    yearsOfExperience: smallint('years_of_experience'),
    expertiseSummaryMd: text('expertise_summary_md'),
    socialLinks: jsonb('social_links').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      'chk_instructor_years_exp',
      sql`${table.yearsOfExperience} IS NULL OR ${table.yearsOfExperience} >= 0`
    ),
  ]
);
