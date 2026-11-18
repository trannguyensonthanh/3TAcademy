import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  integer,
  smallint,
  real,
  timestamp,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orderStatusEnum, enrollmentStatusEnum } from './enums.js';
import { accounts } from './identity.js';
import { courses } from './catalog.js';
import { cohorts, classSessions } from './cohort.js';

export type PaymentMatchStatus = 'MATCHED' | 'UNMATCHED_ORDER' | 'AMOUNT_MISMATCH';
export type EnrollmentRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderCode: varchar('order_code', { length: 40 }).notNull().unique(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    cohortId: bigint('cohort_id', { mode: 'number' })
      .notNull()
      .references(() => cohorts.id, { onDelete: 'restrict' }),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    status: orderStatusEnum('status').notNull().default('PENDING'),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('chk_orders_amount_vnd', sql`${table.amountVnd} >= 0`)]
);

export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id, {
      onDelete: 'restrict',
    }),
    gateway: varchar('gateway', { length: 30 }).notNull().default('SEPAY_VIETQR'),
    gatewayTxnId: varchar('gateway_txn_id', { length: 100 }).notNull().unique(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    responseCode: varchar('response_code', { length: 40 }).notNull(),
    rawPayload: jsonb('raw_payload').notNull(),
    matchStatus: varchar('match_status', { length: 30 })
      .$type<PaymentMatchStatus>()
      .notNull()
      .default('MATCHED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_payment_match_status',
      sql`${table.matchStatus} IN ('MATCHED', 'UNMATCHED_ORDER', 'AMOUNT_MISMATCH')`
    ),
  ]
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    cohortId: bigint('cohort_id', { mode: 'number' })
      .notNull()
      .references(() => cohorts.id, { onDelete: 'restrict' }),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id, {
      onDelete: 'restrict',
    }),
    enrolledByAdmin: bigint('enrolled_by_admin', { mode: 'number' }).references(() => accounts.id, {
      onDelete: 'set null',
    }),
    status: enrollmentStatusEnum('status').notNull().default('ACTIVE'),
    finalExamPassed: boolean('final_exam_passed').notNull().default(false),
    dropoutRiskScore: real('dropout_risk_score').notNull().default(0.0),
    riskLevel: varchar('risk_level', { length: 15 })
      .$type<EnrollmentRiskLevel>()
      .notNull()
      .default('LOW'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_enrollments_account_cohort').on(table.accountId, table.cohortId),
    check('chk_enrollments_dropout_risk', sql`${table.dropoutRiskScore} BETWEEN 0.0 AND 1.0`),
    check('chk_enrollments_risk_level', sql`${table.riskLevel} IN ('LOW', 'MEDIUM', 'HIGH')`),
  ]
);

export const sessionProgress = pgTable(
  'session_progress',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sessionId: bigint('session_id', { mode: 'number' })
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    lastPositionSec: integer('last_position_sec').notNull().default(0),
    maxWatchedSec: integer('max_watched_sec').notNull().default(0),
    attendedLive: boolean('attended_live').notNull().default(false),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.sessionId] }),
    check('chk_session_progress_pos', sql`${table.lastPositionSec} >= 0`),
    check('chk_session_progress_max_watched', sql`${table.maxWatchedSec} >= 0`),
  ]
);

export const courseReviews = pgTable(
  'course_reviews',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    courseId: bigint('course_id', { mode: 'number' })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    cohortId: bigint('cohort_id', { mode: 'number' })
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_course_reviews_cohort_account').on(table.cohortId, table.accountId),
    check('chk_course_reviews_rating', sql`${table.rating} BETWEEN 1 AND 5`),
  ]
);

export const certificates = pgTable('certificates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  enrollmentId: bigint('enrollment_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => enrollments.id, { onDelete: 'restrict' }),
  accountId: bigint('account_id', { mode: 'number' })
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  certificateCode: varchar('certificate_code', { length: 64 }).notNull().unique(),
  hmacSignature: varchar('hmac_signature', { length: 128 }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeReason: text('revoke_reason'),
});
