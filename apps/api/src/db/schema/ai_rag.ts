import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  integer,
  timestamp,
  real,
  jsonb,
  vector,
  primaryKey,
  uuid,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { chunkVisibilityEnum, mockInterviewStatusEnum } from './enums.js';
import { courses, skills, tsvector } from './catalog.js';
import { cohorts, classSessions, sessionAttachments } from './cohort.js';
import { accounts } from './identity.js';

export type ChatScope = 'ADVISOR_GLOBAL' | 'SESSION_TUTOR' | 'LIVE_COPILOT';
export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type MockInterviewTargetLevel = 'INTERN' | 'FRESHER' | 'JUNIOR' | 'SENIOR';

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    visibility: chunkVisibilityEnum('visibility').notNull().default('ENROLLED_ONLY'),
    courseId: bigint('course_id', { mode: 'number' }).references(() => courses.id, {
      onDelete: 'cascade',
    }),
    cohortId: bigint('cohort_id', { mode: 'number' }).references(() => cohorts.id, {
      onDelete: 'cascade',
    }),
    sessionId: bigint('session_id', { mode: 'number' }).references(() => classSessions.id, {
      onDelete: 'cascade',
    }),
    attachmentId: bigint('attachment_id', { mode: 'number' }).references(
      () => sessionAttachments.id,
      { onDelete: 'cascade' }
    ),
    sourceType: varchar('source_type', { length: 30 }).notNull(), // 'VIDEO_TRANSCRIPT', 'ATTACHMENT_DOC', 'FAQ'
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    startSec: integer('start_sec'),
    endSec: integer('end_sec'),
    pageNumber: integer('page_number'),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(sql`to_tsvector('simple', content)`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_chunks_access_filter').on(table.visibility, table.courseId, table.cohortId),
    index('idx_chunks_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_chunks_search_tsv_gin').using('gin', table.searchTsv),
  ]
);

export const studentSkillStates = pgTable(
  'student_skill_states',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    masteryScore: real('mastery_score').notNull().default(0.0),
    evidenceCount: integer('evidence_count').notNull().default(0),
    trend: real('trend').notNull().default(0.0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.skillId] }),
    check('chk_student_skill_mastery', sql`${table.masteryScore} BETWEEN 0.0 AND 100.0`),
  ]
);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    publicId: uuid('public_id').notNull().defaultRandom().unique(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).$type<ChatScope>().notNull(),
    cohortId: bigint('cohort_id', { mode: 'number' }).references(() => cohorts.id, {
      onDelete: 'cascade',
    }),
    sessionId: bigint('session_id', { mode: 'number' }).references(() => classSessions.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 255 }),
    contextSummary: text('context_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_chat_sessions_owner').on(table.accountId, table.updatedAt),
    check(
      'chk_chat_sessions_scope',
      sql`${table.scope} IN ('ADVISOR_GLOBAL', 'SESSION_TUTOR', 'LIVE_COPILOT')`
    ),
  ]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chatSessionId: bigint('chat_session_id', { mode: 'number' })
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 15 }).$type<ChatMessageRole>().notNull(),
    content: text('content').notNull(),
    detectedTopic: varchar('detected_topic', { length: 100 }),
    citations: jsonb('citations').notNull().default([]),
    llmProvider: varchar('llm_provider', { length: 30 }),
    llmModel: varchar('llm_model', { length: 80 }),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    latencyMs: integer('latency_ms'),
    langfuseTraceId: varchar('langfuse_trace_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_chat_messages_session').on(table.chatSessionId, table.createdAt),
    index('idx_chat_messages_topic')
      .on(table.detectedTopic)
      .where(sql`${table.role} = 'user' AND ${table.detectedTopic} IS NOT NULL`),
    check('chk_chat_messages_role', sql`${table.role} IN ('user', 'assistant', 'system')`),
  ]
);

export const mockInterviews = pgTable(
  'mock_interviews',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    targetLevel: varchar('target_level', { length: 20 })
      .$type<MockInterviewTargetLevel>()
      .notNull(),
    targetRole: varchar('target_role', { length: 150 }).notNull(),
    jdRawText: text('jd_raw_text').notNull(),
    cvScreeningResult: jsonb('cv_screening_result'),
    transcriptLog: jsonb('transcript_log').notNull().default([]),
    evaluationReport: jsonb('evaluation_report'),
    status: mockInterviewStatusEnum('status').notNull().default('CV_SCREENING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_mock_interviews_account').on(table.accountId, table.createdAt),
    check(
      'chk_mock_interviews_level',
      sql`${table.targetLevel} IN ('INTERN', 'FRESHER', 'JUNIOR', 'SENIOR')`
    ),
  ]
);
