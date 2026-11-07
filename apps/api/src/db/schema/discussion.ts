import { pgTable, bigserial, varchar, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { accounts } from './identity.js';
import { classSessions } from './cohort.js';

export const discussionThreads = pgTable('discussion_threads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sessionId: bigserial('session_id', { mode: 'number' }).notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  videoTimestampSec: integer('video_timestamp_sec'),
  isResolved: boolean('is_resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const discussionPosts = pgTable('discussion_posts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  threadId: bigserial('thread_id', { mode: 'number' }).notNull().references(() => discussionThreads.id, { onDelete: 'cascade' }),
  parentPostId: bigserial('parent_post_id', { mode: 'number' }),
  accountId: bigserial('account_id', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  contentMd: text('content_md').notNull(),
  isAiGenerated: boolean('is_ai_generated').notNull().default(false),
  isInstructorVerified: boolean('is_instructor_verified').notNull().default(false),
  verifiedById: bigserial('verified_by_id', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

