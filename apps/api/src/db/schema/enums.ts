import { pgEnum } from 'drizzle-orm/pg-core';

export const accountRoleEnum = pgEnum('account_role', ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'LOCKED']);
export const instructorTierEnum = pgEnum('instructor_tier', ['STAFF', 'GUEST']);
export const authProviderEnum = pgEnum('auth_provider', ['LOCAL', 'GOOGLE']);

export const skillRelationRoleEnum = pgEnum('skill_relation_role', ['PREREQUISITE', 'LEARNING_OUTCOME']);
export const courseStatusEnum = pgEnum('course_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const cohortStatusEnum = pgEnum('cohort_status', ['DRAFT', 'OPENING', 'ONGOING', 'COMPLETED', 'ARCHIVED']);
export const cohortStaffRoleEnum = pgEnum('cohort_staff_role', ['INSTRUCTOR', 'TA', 'GUEST']);
export const sessionStatusEnum = pgEnum('session_status', ['SCHEDULED', 'LIVE', 'PROCESSING_REPLAY', 'REPLAY_READY']);
export const videoSourceProviderEnum = pgEnum('video_source_provider', ['R2_HLS_AES128', 'YOUTUBE_PUBLIC', 'BUNNY_STREAM']);

export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['ACTIVE', 'COMPLETED', 'REVOKED']);

export const assessmentPurposeEnum = pgEnum('assessment_purpose', ['SESSION_ASSIGNMENT', 'FINAL_EXAM']);
export const gradingModeEnum = pgEnum('grading_mode', ['AUTO', 'MANUAL', 'HYBRID']);
export const assessmentItemTypeEnum = pgEnum('assessment_item_type', [
  'SINGLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE',
  'SHORT_ANSWER', 'ESSAY', 'FILE_SUBMISSION', 'CODING'
]);
export const answerGradingStatusEnum = pgEnum('answer_grading_status', ['AUTO_GRADED', 'PENDING_MANUAL', 'MANUALLY_GRADED']);
export const integrityVerdictEnum = pgEnum('integrity_verdict', ['CLEAN', 'FLAGGED', 'CONFIRMED_CHEAT', 'CLEARED_BY_INSTRUCTOR']);
export const chunkVisibilityEnum = pgEnum('chunk_visibility', ['PUBLIC', 'ENROLLED_ONLY']);
