import { ClassSession, Cohort, CohortScheduleSlot } from '../types/domain';

export const DAY_OF_WEEK_LABELS: Record<CohortScheduleSlot['dayOfWeek'], string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  0: 'Chủ Nhật',
};

export function getDayOfWeekLabel(dayOfWeek: CohortScheduleSlot['dayOfWeek']): string {
  return DAY_OF_WEEK_LABELS[dayOfWeek] ?? 'Chủ Nhật';
}

function getVietnameseDaySortOrder(dayOfWeek: CohortScheduleSlot['dayOfWeek']): number {
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

/**
 * Định dạng mảng `scheduleSlots` chuẩn PostgreSQL JSONB thành chuỗi lịch học thân thiện:
 * - Nếu tất cả các buổi trong tuần có cùng khung giờ (VD: Thứ 3 và Thứ 7 cùng học 19:30 - 21:30):
 *   -> "Thứ 3 & Thứ 7 (19:30 - 21:30)"
 * - Nếu các buổi trong tuần có khung giờ khác nhau (VD: Thứ 2 học 19:30 - 21:30 và Thứ 6 học 16:30 - 18:30):
 *   -> "Thứ 2 (19:30 - 21:30) · Thứ 6 (16:30 - 18:30)"
 */
export function formatScheduleSlots(slots: CohortScheduleSlot[]): string {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'Chưa xếp lịch học';
  }

  const sorted = [...slots].sort((a, b) => {
    const dayDiff =
      getVietnameseDaySortOrder(a.dayOfWeek) - getVietnameseDaySortOrder(b.dayOfWeek);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  if (sorted.length === 1) {
    const only = sorted[0];
    return `${getDayOfWeekLabel(only.dayOfWeek)} (${only.startTime} - ${only.endTime})`;
  }

  const firstTimeRange = `${sorted[0].startTime} - ${sorted[0].endTime}`;
  const allSameTimeRange = sorted.every(
    (slot) => `${slot.startTime} - ${slot.endTime}` === firstTimeRange
  );

  if (allSameTimeRange) {
    const dayNames = sorted.map((slot) => getDayOfWeekLabel(slot.dayOfWeek));
    if (dayNames.length === 2) {
      return `${dayNames[0]} & ${dayNames[1]} (${firstTimeRange})`;
    }
    const allButLast = dayNames.slice(0, -1).join(', ');
    const last = dayNames[dayNames.length - 1];
    return `${allButLast} & ${last} (${firstTimeRange})`;
  }

  return sorted
    .map(
      (slot) => `${getDayOfWeekLabel(slot.dayOfWeek)} (${slot.startTime} - ${slot.endTime})`
    )
    .join(' · ');
}

function parseTimeMinutes(hhmm: string): number {
  const [hStr = '0', mStr = '0'] = (hhmm || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function doScheduleSlotsOverlap(
  slotA: CohortScheduleSlot,
  slotB: CohortScheduleSlot
): boolean {
  if (slotA.dayOfWeek !== slotB.dayOfWeek) return false;
  const startA = parseTimeMinutes(slotA.startTime);
  const endA = parseTimeMinutes(slotA.endTime);
  const startB = parseTimeMinutes(slotB.startTime);
  const endB = parseTimeMinutes(slotB.endTime);
  return startA < endB && startB < endA;
}

/**
 * Formats an integer amount into Vietnamese Dong (e.g., 8.500.000 ₫).
 */
export function formatVnd(amount: number): string {
  const safe = Math.max(0, Math.round(amount));
  const formatted = safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} ₫`;
}

/**
 * Formats seconds into MM:SS or HH:MM:SS timestamp string.
 */
export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Định dạng chuỗi thời gian ISO (hoặc nhãn lịch học) sang định dạng Tiếng Việt dễ đọc:
 * VD: "2026-03-03T12:30:00.000Z" -> "Thứ 3, 03/03/2026 · 19:30"
 */
export function formatSessionDateTimeVi(isoOrText?: string | null): string {
  if (!isoOrText) return 'Theo lịch cố định của lớp';
  const trimmed = isoOrText.trim();
  if (!trimmed) return 'Theo lịch cố định của lớp';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }
  try {
    const weekday = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    const dayMonthYear = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    const timeStr = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    const normalizedWeekday = weekday
      .replace(/^Th\s*(\d)$/i, 'Thứ $1')
      .replace(/^CN$/i, 'Chủ Nhật');
    return `${normalizedWeekday}, ${dayMonthYear} · ${timeStr}`;
  } catch {
    return trimmed;
  }
}

/**
 * Làm sạch chuỗi tóm tắt buổi học để không hiển thị ký tự Markdown thô (###, **, `, $...$) trên giao diện.
 */
export function formatCleanSummaryText(rawMd?: string | null): string {
  if (!rawMd) return 'Tóm tắt trọng tâm và ghi chú thực hành của buổi học.';
  const cleaned = rawMd
    .replace(/^#{1,6}\s*Tóm tắt trọng tâm Buổi\s*\d+\s*:?\s*/gim, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\$[^$]+\$/g, (math) => {
      if (math.includes('RRF')) return '1 / (k + rank)';
      return math.replace(/[$\\_{}]/g, '');
    })
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Tóm tắt trọng tâm và ghi chú thực hành của buổi học.';
}

/**
 * Evaluates password strength on a 0-3 scale (WEAK / MEDIUM / STRONG) for Auth view.
 */
export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3;
  label: string;
  level: 'EMPTY' | 'WEAK' | 'MEDIUM' | 'STRONG';
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password || password.length === 0) {
    return { score: 0, label: 'Chưa nhập mật khẩu', level: 'EMPTY' };
  }
  let points = 0;
  if (password.length >= 8) points += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) points += 1;

  if (points <= 1) {
    return { score: 1, label: 'Yếu — Cần tối thiểu 8 ký tự, chữ hoa & số', level: 'WEAK' };
  }
  if (points === 2) {
    return { score: 2, label: 'Khá — Nên thêm ký tự đặc biệt hoặc chữ số', level: 'MEDIUM' };
  }
  return { score: 3, label: 'Mạnh — Đạt chuẩn bảo mật tài khoản học viên', level: 'STRONG' };
}

/**
 * Core Business Rule:
 * A ClassSession is marked Completed (isCompleted = true) ONLY when the student
 * passes the session's short competency quiz (SESSION_ASSIGNMENT) with >= 70% score,
 * NEVER by passive video watching alone.
 */
export interface QuizEvaluationOutput {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  updatedSession: ClassSession;
}

export function evaluateSessionQuizAndUnlock(
  session: ClassSession,
  selectedAnswers: number[]
): QuizEvaluationOutput {
  const totalQuestions = session.quizQuestions.length;
  if (totalQuestions === 0) {
    return {
      scorePercent: 100,
      correctCount: 0,
      totalQuestions: 0,
      passed: true,
      updatedSession: {
        ...session,
        isCompleted: true,
        quizStatus: 'PASSED',
        quizScore: 100,
      },
    };
  }

  let correctCount = 0;
  session.quizQuestions.forEach((q, idx) => {
    if (typeof q.correctIndex === 'number' && selectedAnswers[idx] === q.correctIndex) {
      correctCount += 1;
    }
  });

  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= 70;

  const updatedSession: ClassSession = {
    ...session,
    isCompleted: passed ? true : session.isCompleted,
    quizStatus: passed ? 'PASSED' : 'PENDING',
    quizScore: scorePercent,
  };

  return {
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
    updatedSession,
  };
}

/**
 * Checks that passive video progress update NEVER marks an incomplete session as completed
 * unless quizStatus is already PASSED.
 */
export function updateSessionWatchPosition(
  session: ClassSession,
  newPositionSec: number
): ClassSession {
  const clamped = Math.min(Math.max(0, newPositionSec), session.durationSeconds);
  return {
    ...session,
    lastPositionSec: clamped,
    // Strictly preserve competency gate: watching 100% of video does NOT set isCompleted = true
    isCompleted: session.quizStatus === 'PASSED',
  };
}

/**
 * Computes overall cohort competency progress and Final Exam eligibility.
 */
export interface CohortCompetencyProgress {
  completedCount: number;
  totalCount: number;
  percentage: number;
  averageQuizScore: number;
  eligibleForFinalExam: boolean;
}

export function calculateCohortCompetencyProgress(
  sessions: ClassSession[]
): CohortCompetencyProgress {
  const totalCount = sessions.length;
  if (totalCount === 0) {
    return {
      completedCount: 0,
      totalCount: 0,
      percentage: 0,
      averageQuizScore: 0,
      eligibleForFinalExam: false,
    };
  }

  const completedSessions = sessions.filter((s) => s.isCompleted && s.quizStatus === 'PASSED');
  const completedCount = completedSessions.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  const scoredSessions = sessions.filter((s) => typeof s.quizScore === 'number');
  const averageQuizScore =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce((acc, s) => acc + (s.quizScore ?? 0), 0) / scoredSessions.length
        )
      : 0;

  // Eligible for Final AI Proctored Exam when all sessions in the cohort are completed (100%)
  const eligibleForFinalExam = totalCount > 0 && completedCount === totalCount;

  return {
    completedCount,
    totalCount,
    percentage,
    averageQuizScore,
    eligibleForFinalExam,
  };
}

/**
 * Detects schedule conflict between a target cohort and the student's active enrolled cohorts
 * by comparing overlapping `dayOfWeek` and `startTime - endTime` in `scheduleSlots`.
 */
export function findOverlappingSlotPair(
  targetCohort: Cohort,
  existingCohort: Cohort
): { targetSlot: CohortScheduleSlot; existingSlot: CohortScheduleSlot } | null {
  if (
    Array.isArray(targetCohort.scheduleSlots) &&
    targetCohort.scheduleSlots.length > 0 &&
    Array.isArray(existingCohort.scheduleSlots) &&
    existingCohort.scheduleSlots.length > 0
  ) {
    for (const tSlot of targetCohort.scheduleSlots) {
      for (const eSlot of existingCohort.scheduleSlots) {
        if (doScheduleSlotsOverlap(tSlot, eSlot)) {
          return { targetSlot: tSlot, existingSlot: eSlot };
        }
      }
    }
    return null;
  }
  return null;
}

export function checkCohortScheduleConflict(
  targetCohort: Cohort,
  enrolledCohorts: Cohort[]
): Cohort | null {
  for (const existing of enrolledCohorts) {
    if (existing.id === targetCohort.id) continue;
    if (existing.status === 'COMPLETED') continue;

    const overlapped = findOverlappingSlotPair(targetCohort, existing);
    if (overlapped) {
      return existing;
    }
  }
  return null;
}

export const formatCurrencyVnd = formatVnd;

/**
 * Calculates personalized learning path & cohort recommendation
 * based on Onboarding career goal and 3 diagnostic answers.
 */
export interface PathRecommendation {
  recommendedCourseSlug: string;
  recommendedCohortCode: string;
  readinessLevel: string;
  diagnosticScore: number;
  rationale: string;
}

export const CANONICAL_COURSE_SLUGS = {
  AI_ENGINEER: 'ai-engineering-rag-agents-llmops',
  CLOUD_BACKEND: 'backend-architecture-distributed-systems',
  DATA_ANALYTICS: 'data-engineering-streaming-lakehouse',
  PYTHON_SQL: 'python-sql-for-data-and-ai',
} as const;

export function calculatePathRecommendation(
  careerGoal: 'AI_ENGINEER' | 'CLOUD_BACKEND' | 'DATA_ANALYTICS' | 'PYTHON_SQL',
  diagnosticAnswers: number[]
): PathRecommendation {
  // Correct answers for the 3 diagnostic questions: [1, 0, 2]
  const key = [1, 0, 2];
  let correct = 0;
  diagnosticAnswers.forEach((ans, idx) => {
    if (ans === key[idx]) correct += 1;
  });
  const diagnosticScore = Math.round((correct / 3) * 100);

  if (careerGoal === 'PYTHON_SQL') {
    return {
      recommendedCourseSlug: CANONICAL_COURSE_SLUGS.PYTHON_SQL,
      recommendedCohortCode: 'PY-SQL-2026-K01',
      readinessLevel:
        correct >= 2
          ? 'Nền tảng tư duy tốt — Nắm vững nhanh Python & PostgreSQL thực chiến'
          : 'Khởi điểm lý tưởng — Xây gốc lập trình Python & SQL bài bản từ đầu',
      diagnosticScore,
      rationale:
        'Lộ trình Lập trình Python & SQL Thực chiến sẽ trang bị nền tảng xử lý dữ liệu và truy vấn tối ưu để bạn tiến xa sang mảng Dữ liệu hoặc Kỹ sư AI.',
    };
  }

  if (careerGoal === 'CLOUD_BACKEND') {
    return {
      recommendedCourseSlug: CANONICAL_COURSE_SLUGS.CLOUD_BACKEND,
      recommendedCohortCode: 'SWE-ARCH-2026-K01',
      readinessLevel:
        correct >= 2
          ? 'Nền tảng vững — Sẵn sàng học thiết kế hệ thống phân tán chịu tải cao'
          : 'Cần củng cố thêm — Bắt đầu từ kiến trúc Backend & PostgreSQL ACID',
      diagnosticScore,
      rationale:
        'Dựa trên mục tiêu phát triển nghề nghiệp của bạn, lộ trình Kiến trúc Backend Chuyên sâu sẽ giúp bạn thiết kế hệ thống thanh toán tự động, chống race-condition và tối ưu cơ sở dữ liệu.',
    };
  }

  if (careerGoal === 'DATA_ANALYTICS') {
    return {
      recommendedCourseSlug: CANONICAL_COURSE_SLUGS.DATA_ANALYTICS,
      recommendedCohortCode: 'DATA-PIPE-2026-K01',
      readinessLevel:
        correct >= 2
          ? 'Sẵn sàng thực hành Streaming Pipeline & Kiến trúc Lakehouse'
          : 'Khởi điểm phù hợp — Tập trung rèn kỹ năng đường ống dữ liệu & SQL phân tích',
      diagnosticScore,
      rationale:
        'Bạn có tư duy làm việc với dữ liệu rất tốt. Lớp Kỹ thuật Dữ liệu: Streaming Pipeline & Lakehouse hướng dẫn bạn chuẩn hóa luồng sự kiện Kafka, DuckDB và kiểm định chất lượng dữ liệu.',
    };
  }

  return {
    recommendedCourseSlug: CANONICAL_COURSE_SLUGS.AI_ENGINEER,
    recommendedCohortCode: 'AI-ENG-2026-K01',
    readinessLevel:
      correct >= 2
        ? 'Nền tảng Python tốt — Sẵn sàng vào thẳng Lớp Kỹ sư AI Thực chiến'
        : 'Nền tảng Cơ bản — Trợ giảng AI sẽ kèm thêm cho bạn phần Python & Hybrid RAG',
    diagnosticScore,
    rationale:
      'Lộ trình Kỹ sư AI Thực chiến giúp bạn tự tay xây dựng hệ thống Hybrid RAG (pgvector HNSW + RRF), Multi-Agent và LLMOps chuẩn doanh nghiệp trong 6 buổi chuyên sâu.',
  };
}

function toIcsUtcTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Generates an RFC-5545 compliant .ics calendar content string from real Cohort startDate & scheduleSlots.
 */
export function generateCohortIcsContent(cohort: Cohort, courseTitle: string): string {
  const formattedSchedule = formatScheduleSlots(cohort.scheduleSlots);
  const firstSlot = cohort.scheduleSlots?.[0];
  const [startHour = '19', startMin = '30'] = (firstSlot?.startTime || '19:30').split(':');
  const [endHour = '21', endMin = '30'] = (firstSlot?.endTime || '21:30').split(':');

  const rawDate = (cohort.startDate || '').trim();
  const baseDateStr = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
    ? rawDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const startDateObj = new Date(`${baseDateStr}T${startHour.padStart(2, '0')}:${startMin.padStart(2, '0')}:00+07:00`);
  const endDateObj = new Date(`${baseDateStr}T${endHour.padStart(2, '0')}:${endMin.padStart(2, '0')}:00+07:00`);
  const safeStart = Number.isNaN(startDateObj.getTime()) ? new Date() : startDateObj;
  const safeEnd = Number.isNaN(endDateObj.getTime())
    ? new Date(safeStart.getTime() + 2 * 3600 * 1000)
    : endDateObj;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//3T Academy//EduTech AI Platform//VI',
    'BEGIN:VEVENT',
    `UID:${cohort.code}@3t.edu.vn`,
    `DTSTAMP:${toIcsUtcTimestamp(new Date())}`,
    `DTSTART:${toIcsUtcTimestamp(safeStart)}`,
    `DTEND:${toIcsUtcTimestamp(safeEnd)}`,
    `SUMMARY:[3T Academy] ${cohort.code} - ${courseTitle}`,
    `DESCRIPTION:Lịch học trực tiếp đợt ${cohort.code} (${formattedSchedule}). Truy cập phòng Live và AI Tutor tại 3T Academy.`,
    'LOCATION:3T Academy Live Studio & Multi-modal Workspace',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Kiểm tra tính hợp lệ về phân quyền khi ghi danh đợt học:
 * BẮT BUỘC người dùng phải đăng nhập tài khoản học viên (STUDENT).
 * Các tài khoản GUEST (khách chưa đăng nhập), INSTRUCTOR (giảng viên), hoặc ADMIN (quản trị) không được phép ghi danh.
 */
export function isEligibleToEnroll(role: string): { eligible: boolean; reason?: string } {
  if (role === 'GUEST') {
    return {
      eligible: false,
      reason: 'Yêu cầu đăng nhập tài khoản Học viên trước khi ghi danh đợt học.',
    };
  }
  if (role !== 'STUDENT') {
    return {
      eligible: false,
      reason: `Tài khoản vai trò ${role} không áp dụng ghi danh khóa học.`,
    };
  }
  return { eligible: true };
}
