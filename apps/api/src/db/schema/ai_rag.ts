import { pgTable, bigserial, varchar, text, integer, smallint, timestamp, real, jsonb, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { chunkVisibilityEnum } from './enums.js';
import { courses, skills } from './catalog.js';
import { cohorts, classSessions } from './cohort.js';
import { accounts } from './identity.js';

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sourceType: varchar('source_type', { length: 30 }).notNull(), // 'VIDEO_TRANSCRIPT', 'ATTACHMENT_DOC', 'FAQ'
  courseId: bigserial('course_id', { mode: 'number' }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
  cohortId: bigserial('cohort_id', { mode: 'number' }).references(() => cohorts.id, { onDelete: 'cascade' }),
  sessionId: bigserial('session_id', { mode: 'number' }).references(() => classSessions.id, { onDelete: 'cascade' }),
  attachmentId: bigserial('attachment_id', { mode: 'number' }),
  chunkOrder: integer('chunk_order').notNull(),
  content: text('content').notNull(),
  videoStartSec: integer('video_start_sec'),
  videoEndSec: integer('video_end_sec'),
  docPageNumber: smallint('doc_page_number'),
  visibility: chunkVisibilityEnum('visibility').notNull().default('ENROLLED_ONLY'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentSkillStates = pgTable('student_skill_states', {
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
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
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 20 }).notNull(), // 'ADVISOR_GLOBAL', 'SESSION_TUTOR', 'LIVE_COPILOT'
  cohortId: bigserial('cohort_id', { mode: 'number' }).references(() => cohorts.id, { onDelete: 'cascade' }),
  sessionId: bigserial('session_id', { mode: 'number' }).references(() => classSessions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  contextSummary: text('context_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatSessionId: bigserial('chat_session_id', { mode: 'number' }).notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 15 }).notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  citations: jsonb('citations').notNull().default([]),
  llmProvider: varchar('llm_provider', { length: 30 }),
  llmModel: varchar('llm_model', { length: 80 }),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

