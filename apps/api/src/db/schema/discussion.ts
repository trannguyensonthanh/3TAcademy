import { pgTable, bigserial, bigint, varchar, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { accounts } from './identity.js';
import { classSessions } from './cohort.js';

export const discussionThreads = pgTable('discussion_threads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sessionId: bigint('session_id', { mode: 'number' }).notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  authorId: bigint('author_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  videoTimestampSec: integer('video_timestamp_sec'),
  isResolved: boolean('is_resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const discussionPosts = pgTable('discussion_posts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  threadId: bigint('thread_id', { mode: 'number' }).notNull().references(() => discussionThreads.id, { onDelete: 'cascade' }),
  parentPostId: bigint('parent_post_id', { mode: 'number' }),
  authorId: bigint('author_id', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  contentMd: text('content_md').notNull(),
  isAiGenerated: boolean('is_ai_generated').notNull().default(false),
  isInstructorVerified: boolean('is_instructor_verified').notNull().default(false),
  verifiedBy: bigint('verified_by', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  recipientId: bigint('recipient_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 40 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
