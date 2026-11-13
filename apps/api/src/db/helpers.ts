import { eq, ilike, and } from 'drizzle-orm';
import { db } from './index.js';
import {
  cohorts,
  classSessions,
  assessments,
  accounts,
  userProfiles,
  instructorProfiles,
} from './schema/index.js';

/**
 * Normalizes a mastery score from DB (which may be stored on a 0..1 scale or 0..100 scale)
 * into a 0..100 integer for Frontend consumption.
 */
export function normalizeMasteryScore(raw: number | null | undefined): number {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return 0;
  const num = Number(raw);
  if (num > 0 && num <= 1.0) {
    return Math.min(100, Math.max(0, Math.round(num * 100)));
  }
  return Math.min(100, Math.max(0, Math.round(num)));
}

/**
 * Converts a 0..100 score into a 0..1 float for safe storage in PostgreSQL
 * regardless of whether the DB check constraint is 0..1 or 0..100.
 */
export function toDbMasteryScore(score0to100: number): number {
  const clamped = Math.min(100, Math.max(0, score0to100));
  if (clamped > 1.0) {
    return Number((clamped / 100).toFixed(4));
  }
  return Number(clamped.toFixed(4));
}

/**
 * Resolves a Cohort record by numeric ID or cohort code.
 */
export async function resolveCohort(idOrCode: string | string[] | number | undefined | null) {
  const firstVal = Array.isArray(idOrCode) ? idOrCode[0] : idOrCode;
  if (firstVal === undefined || firstVal === null || firstVal === '') return undefined;
  const raw = String(firstVal).trim();
  const numId = Number(raw);

  if (Number.isInteger(numId) && numId > 0) {
    const [byId] = await db.select().from(cohorts).where(eq(cohorts.id, numId)).limit(1);
    if (byId) return byId;
  }

  const [byCode] = await db
    .select()
    .from(cohorts)
    .where(ilike(cohorts.code, raw))
    .limit(1);
  if (byCode) return byCode;

  const [byPartial] = await db
    .select()
    .from(cohorts)
    .where(ilike(cohorts.code, `%${raw}%`))
    .limit(1);
  return byPartial;
}

/**
 * Resolves a ClassSession record by numeric ID or session identifier.
 */
export async function resolveSession(
  idOrCode: string | string[] | number | undefined | null,
  cohortIdHint?: number
) {
  const firstVal = Array.isArray(idOrCode) ? idOrCode[0] : idOrCode;
  if (firstVal === undefined || firstVal === null || firstVal === '') return undefined;
  const raw = String(firstVal).trim();
  const numId = Number(raw);

  if (Number.isInteger(numId) && numId > 0) {
    const [byId] = await db.select().from(classSessions).where(eq(classSessions.id, numId)).limit(1);
    if (byId) return byId;
  }

  const kMatch = raw.match(/sess(?:ion)?-(?:([a-z0-9]+)-)?0*(\d+)$/i);
  if (kMatch) {
    const cohortAlias = kMatch[1];
    const orderNum = Number(kMatch[2]);

    if (cohortIdHint && orderNum > 0) {
      const [byHintAndOrder] = await db
        .select()
        .from(classSessions)
        .where(and(eq(classSessions.cohortId, cohortIdHint), eq(classSessions.sessionOrder, orderNum)))
        .limit(1);
      if (byHintAndOrder) return byHintAndOrder;
    }

    if (cohortAlias) {
      const cohort = await resolveCohort(cohortAlias);
      if (cohort && orderNum > 0) {
        const [byCohortAndOrder] = await db
          .select()
          .from(classSessions)
          .where(and(eq(classSessions.cohortId, cohort.id), eq(classSessions.sessionOrder, orderNum)))
          .limit(1);
        if (byCohortAndOrder) return byCohortAndOrder;
      }
    }

    if (orderNum > 0) {
      const [byIdFallback] = await db
        .select()
        .from(classSessions)
        .where(eq(classSessions.id, orderNum))
        .limit(1);
      if (byIdFallback) return byIdFallback;

      const [byOrderFallback] = await db
        .select()
        .from(classSessions)
        .where(eq(classSessions.sessionOrder, orderNum))
        .limit(1);
      if (byOrderFallback) return byOrderFallback;
    }
  }

  return undefined;
}

/**
 * Resolves an Assessment record by numeric ID or assessment identifier.
 */
export async function resolveAssessment(idOrCode: string | string[] | number | undefined | null) {
  const firstVal = Array.isArray(idOrCode) ? idOrCode[0] : idOrCode;
  if (firstVal === undefined || firstVal === null || firstVal === '') return undefined;
  const raw = String(firstVal).trim();
  const numId = Number(raw);

  if (Number.isInteger(numId) && numId > 0) {
    const [byId] = await db.select().from(assessments).where(eq(assessments.id, numId)).limit(1);
    if (byId) return byId;
  }

  const lower = raw.toLowerCase();

  if (lower.includes('final') || lower.startsWith('exam-')) {
    const cleaned = lower
      .replace(/^final-exam-/, '')
      .replace(/^exam-final-/, '')
      .replace(/^exam-/, '');
    const cohort = await resolveCohort(cleaned);
    if (cohort) {
      const [finalExam] = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.cohortId, cohort.id), eq(assessments.purpose, 'FINAL_EXAM')))
        .limit(1);
      if (finalExam) return finalExam;
    }
    const [anyFinalExam] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.purpose, 'FINAL_EXAM'))
      .limit(1);
    if (anyFinalExam) return anyFinalExam;
  }

  if (lower.startsWith('quiz-')) {
    const sessPart = lower.replace(/^quiz-/, '');
    const session = await resolveSession(sessPart.startsWith('sess') ? sessPart : `sess-${sessPart}`);
    if (session) {
      const [sessQuiz] = await db
        .select()
        .from(assessments)
        .where(eq(assessments.sessionId, session.id))
        .limit(1);
      if (sessQuiz) return sessQuiz;
    }
  }

  const trailingDigits = raw.match(/(\d+)$/);
  if (trailingDigits) {
    const fallbackId = Number(trailingDigits[1]);
    const [byId] = await db.select().from(assessments).where(eq(assessments.id, fallbackId)).limit(1);
    if (byId) return byId;
  }

  return undefined;
}

export function formatScheduleLabels(slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) {
  if (!slots || slots.length === 0) {
    return {
      scheduleLabel: '',
      timeRangeLabel: '',
    };
  }
  const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const days = slots.map((s) => dayNames[s.dayOfWeek] || `Thứ ${s.dayOfWeek + 1}`);
  const firstSlot = slots[0]!;
  return {
    scheduleLabel: days.join(' & '),
    timeRangeLabel: `${firstSlot.startTime} - ${firstSlot.endTime}`,
  };
}

export async function buildInstructorStaffMap() {
  const [allProfiles, allInstructorMeta, allAccounts] = await Promise.all([
    db.select().from(userProfiles),
    db.select().from(instructorProfiles),
    db.select().from(accounts),
  ]);

  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const instructorMap = new Map(allInstructorMeta.map((ip) => [ip.accountId, ip]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  return function getStaffForInstructor(instructorId: number) {
    const prof = profileMap.get(instructorId);
    const inst = instructorMap.get(instructorId);
    const acc = accountMap.get(instructorId);
    const fullName = prof?.fullName || acc?.email || '';
    const headline = inst?.headline || prof?.bio || '';
    const avatarUrl = prof?.avatarUrl || '';
    const organization = inst?.organization || '3T AI Academy';

    return {
      instructorName: fullName,
      instructorHeadline: headline,
      instructorAvatarUrl: avatarUrl,
      instructorOrganization: organization,
      staff: [
        {
          id: String(instructorId),
          role: 'INSTRUCTOR' as const,
          fullName,
          headline,
          title: headline,
          bio: inst?.expertiseSummaryMd || prof?.bio || '',
          avatarUrl,
          organization,
        },
      ],
    };
  };
}
