import { pgTable, bigserial, bigint, varchar, text, integer, timestamp, real, jsonb, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { chunkVisibilityEnum } from './enums.js';
import { courses, skills } from './catalog.js';
import { cohorts, classSessions, sessionAttachments } from './cohort.js';
import { accounts } from './identity.js';

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  visibility: chunkVisibilityEnum('visibility').notNull().default('ENROLLED_ONLY'),
  courseId: bigint('course_id', { mode: 'number' }).references(() => courses.id, { onDelete: 'cascade' }),
  cohortId: bigint('cohort_id', { mode: 'number' }).references(() => cohorts.id, { onDelete: 'cascade' }),
  sessionId: bigint('session_id', { mode: 'number' }).references(() => classSessions.id, { onDelete: 'cascade' }),
  attachmentId: bigint('attachment_id', { mode: 'number' }).references(() => sessionAttachments.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 30 }).notNull(), // 'VIDEO_TRANSCRIPT', 'ATTACHMENT_DOC', 'FAQ'
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  startSec: integer('start_sec'),
  endSec: integer('end_sec'),
  pageNumber: integer('page_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentSkillStates = pgTable('student_skill_states', {
  accountId: bigint('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  skillId: integer('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  masteryScore: real('mastery_score').notNull().default(0.0),
  evidenceCount: integer('evidence_count').notNull().default(0),
  trend: real('trend').notNull().default(0.0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.accountId, table.skillId] }),
]);

export const chatSessions = pgTable('chat_sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  publicId: uuid('public_id').notNull().defaultRandom().unique(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 20 }).notNull(), // 'ADVISOR_GLOBAL', 'SESSION_TUTOR', 'LIVE_COPILOT'
  cohortId: bigint('cohort_id', { mode: 'number' }).references(() => cohorts.id, { onDelete: 'cascade' }),
  sessionId: bigint('session_id', { mode: 'number' }).references(() => classSessions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  contextSummary: text('context_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatSessionId: bigint('chat_session_id', { mode: 'number' }).notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 15 }).notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  citations: jsonb('citations').notNull().default([]),
  llmProvider: varchar('llm_provider', { length: 30 }),
  llmModel: varchar('llm_model', { length: 80 }),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  langfuseTraceId: varchar('langfuse_trace_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
