import { pgTable, bigserial, varchar, text, integer, smallint, timestamp, boolean, bigint, jsonb } from 'drizzle-orm/pg-core';
import { orderStatusEnum, enrollmentStatusEnum } from './enums.js';
import { accounts } from './identity.js';
import { cohorts, classSessions } from './cohort.js';

export const orders = pgTable('orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderCode: varchar('order_code', { length: 40 }).notNull().unique(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  cohortId: bigserial('cohort_id', { mode: 'number' }).notNull().references(() => cohorts.id, { onDelete: 'restrict' }),
  amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
  status: orderStatusEnum('status').notNull().default('PENDING'),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  isLateOverride: boolean('is_late_override').notNull().default(false),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentTransactions = pgTable('payment_transactions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: bigserial('order_id', { mode: 'number' }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  gateway: varchar('gateway', { length: 20 }).notNull().default('VNPAY'),
  gatewayTxnId: varchar('gateway_txn_id', { length: 100 }).notNull().unique(),
  amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
  responseCode: varchar('response_code', { length: 10 }).notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable('enrollments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  cohortId: bigserial('cohort_id', { mode: 'number' }).notNull().references(() => cohorts.id, { onDelete: 'restrict' }),
  status: enrollmentStatusEnum('status').notNull().default('ACTIVE'),
  finalExamPassed: boolean('final_exam_passed').notNull().default(false),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const sessionProgress = pgTable('session_progress', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  sessionId: bigserial('session_id', { mode: 'number' }).notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  lastPositionSec: integer('last_position_sec').notNull().default(0),
  watchedSeconds: integer('watched_seconds').notNull().default(0),
  attendedLiveSeconds: integer('attended_live_seconds').notNull().default(0),
  isCompleted: boolean('is_completed').notNull().default(false),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courseReviews = pgTable('course_reviews', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cohortId: bigserial('cohort_id', { mode: 'number' }).notNull().references(() => cohorts.id, { onDelete: 'cascade' }),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certificates = pgTable('certificates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  certificateCode: varchar('certificate_code', { length: 50 }).notNull().unique(),
  enrollmentId: bigserial('enrollment_id', { mode: 'number' }).notNull().unique().references(() => enrollments.id, { onDelete: 'restrict' }),
  accountId: bigserial('account_id', { mode: 'number' }).notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  signatureSha256: varchar('signature_sha256', { length: 64 }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeReason: text('revoke_reason'),
});
