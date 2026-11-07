import { pgTable, bigserial, varchar, text, integer, smallint, timestamp, boolean, numeric, real, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  assessmentPurposeEnum,
  gradingModeEnum,
  assessmentItemTypeEnum,
  answerGradingStatusEnum,
  integrityVerdictEnum,
} from './enums.js';
import { cohorts, classSessions } from './cohort.js';
import { skills } from './catalog.js';
import { accounts } from './identity.js';

export const assessments = pgTable('assessments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cohortId: bigserial('cohort_id', { mode: 'number' }).notNull().references(() => cohorts.id, { onDelete: 'cascade' }),
  sessionId: bigserial('session_id', { mode: 'number' }).references(() => classSessions.id, { onDelete: 'set null' }),
  purpose: assessmentPurposeEnum('purpose').notNull(),
  gradingMode: gradingModeEnum('grading_mode').notNull().default('AUTO'),
  title: varchar('title', { length: 255 }).notNull(),
  instructionsMd: text('instructions_md'),
  durationMinutes: integer('duration_minutes'),
  passScorePct: smallint('pass_score_pct').notNull().default(60),
  maxAttempts: smallint('max_attempts').default(1),
  dueAt: timestamp('due_at', { withTimezone: true }),
  proctoringConfig: jsonb('proctoring_config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentItems = pgTable('assessment_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  assessmentId: bigserial('assessment_id', { mode: 'number' }).notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  itemOrder: smallint('item_order').notNull(),
  itemType: assessmentItemTypeEnum('item_type').notNull(),
  skillId: integer('skill_id').notNull().references(() => skills.id, { onDelete: 'restrict' }),
  points: numeric('points', { precision: 5, scale: 2 }).notNull().default('1.00'),
  promptData: jsonb('prompt_data').notNull(),
  gradingConfig: jsonb('grading_config').notNull(),
  explanationMd: text('explanation_md'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentAttempts = pgTable('assessment_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  assessmentId: bigserial('assessment_id', { mode: 'number' }).notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  attemptNumber: smallint('attempt_number').notNull().default(1),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  gradingCompletedAt: timestamp('grading_completed_at', { withTimezone: true }),
  totalScore: numeric('total_score', { precision: 6, scale: 2 }),
  isPassed: boolean('is_passed'),
  totalRiskScore: smallint('total_risk_score').notNull().default(0),
  integrityVerdict: integrityVerdictEnum('integrity_verdict').notNull().default('CLEAN'),
  verdictNote: text('verdict_note'),
  verdictBy: bigserial('verdict_by', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  verdictAt: timestamp('verdict_at', { withTimezone: true }),
});

export const submissionAnswers = pgTable('submission_answers', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  attemptId: bigserial('attempt_id', { mode: 'number' }).notNull().references(() => assessmentAttempts.id, { onDelete: 'cascade' }),
  itemId: bigserial('item_id', { mode: 'number' }).notNull().references(() => assessmentItems.id, { onDelete: 'restrict' }),
  responseData: jsonb('response_data').notNull().default({}),
  gradingStatus: answerGradingStatusEnum('grading_status').notNull().default('AUTO_GRADED'),
  autoScore: numeric('auto_score', { precision: 5, scale: 2 }),
  manualScore: numeric('manual_score', { precision: 5, scale: 2 }),
  finalScore: numeric('final_score', { precision: 5, scale: 2 }),
  isCorrect: boolean('is_correct'),
  feedbackMd: text('feedback_md'),
  reviewComments: jsonb('review_comments').notNull().default([]),
  gradedBy: bigserial('graded_by', { mode: 'number' }).references(() => accounts.id, { onDelete: 'set null' }),
  gradedAt: timestamp('graded_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_attempt_item').on(table.attemptId, table.itemId),
]);

export const proctoringEvents = pgTable('proctoring_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  attemptId: bigserial('attempt_id', { mode: 'number' }).notNull().references(() => assessmentAttempts.id, { onDelete: 'cascade' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  videoOffsetSec: integer('video_offset_sec'),
  tier: varchar('tier', { length: 10 }).notNull(), // 'EDGE' | 'SERVER'
  eventType: varchar('event_type', { length: 40 }).notNull(),
  confidence: real('confidence'),
  snapshotR2Key: text('snapshot_r2_key'),
  riskDelta: smallint('risk_delta').notNull().default(0),
});

