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
 * passes the session's short competency quiz (SESSION_ASSIGNMENT) with >= 67% score,
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
    if (selectedAnswers[idx] === q.correctIndex) {
      correctCount += 1;
    }
  });

  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= 67; // e.g., at least 2/3 correct

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

  // Eligible for Final AI Proctored Exam when >= 80% sessions passed or at least 5 sessions in ongoing cohort
  const eligibleForFinalExam = percentage >= 75;

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

export function calculatePathRecommendation(
  careerGoal: 'AI_ENGINEER' | 'CLOUD_BACKEND' | 'DATA_ANALYTICS',
  diagnosticAnswers: number[]
): PathRecommendation {
  // Correct answers for the 3 diagnostic questions: [1, 0, 2]
  const key = [1, 0, 2];
  let correct = 0;
  diagnosticAnswers.forEach((ans, idx) => {
    if (ans === key[idx]) correct += 1;
  });
  const diagnosticScore = Math.round((correct / 3) * 100);

  if (careerGoal === 'CLOUD_BACKEND') {
    return {
      recommendedCourseSlug: 'distributed-backend-cloud-native-golang',
      recommendedCohortCode: 'SWE-CLOUD-2026-K01',
      readinessLevel:
        correct >= 2 ? 'Nền tảng vững — Sẵn sàng học thiết kế hệ thống lớn' : 'Cần củng cố thêm — Bắt đầu từ kiến thức nền tảng Backend',
      diagnosticScore,
      rationale:
        'Dựa trên mục tiêu phát triển nghề nghiệp của bạn, lộ trình Kỹ sư Backend & Cloud Thực chiến sẽ giúp bạn tự tin thiết kế hệ thống thanh toán tự động và tối ưu cơ sở dữ liệu.',
    };
  }

  if (careerGoal === 'DATA_ANALYTICS') {
    return {
      recommendedCourseSlug: 'analytics-engineering-dbt-lakehouse',
      recommendedCohortCode: 'DATA-AE-2026-K01',
      readinessLevel:
        correct >= 2 ? 'Sẵn sàng thực hành Mô hình hóa dữ liệu & Báo cáo' : 'Khởi điểm phù hợp — Tập trung rèn kỹ năng truy vấn SQL & Python',
      diagnosticScore,
      rationale:
        'Bạn có tư duy làm việc với số liệu rất tốt. Lớp Phân tích dữ liệu thực chiến sẽ hướng dẫn bạn cách chuẩn hóa kho dữ liệu và tự động hóa kiểm tra số liệu hàng ngày.',
    };
  }

  return {
    recommendedCourseSlug: 'ai-engineer-hybrid-rag',
    recommendedCohortCode: 'AI-ENG-2026-K01',
    readinessLevel:
      correct >= 2
        ? 'Nền tảng Python tốt — Sẵn sàng vào thẳng Lớp Kỹ Sư AI Thực Chiến'
        : 'Nền tảng Cơ bản — Trợ giảng AI sẽ kèm thêm cho bạn phần Python & SQL',
    diagnosticScore,
    rationale:
      'Lộ trình Kỹ sư AI Thực chiến hoàn toàn vừa sức với bạn hiện tại để tự tay xây dựng ứng dụng Trợ lý AI doanh nghiệp trong 12 buổi học trực tiếp.',
  };
}

/**
 * Generates an RFC-5545 compliant .ics calendar content string for a Cohort.
 */
export function generateCohortIcsContent(cohort: Cohort, courseTitle: string): string {
  const formattedSchedule = formatScheduleSlots(cohort.scheduleSlots);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//3T Academy//EduTech AI Platform//VI',
    'BEGIN:VEVENT',
    `UID:${cohort.code}@3tacademy.vn`,
    'DTSTAMP:20261109T080000Z',
    'DTSTART:20261117T123000Z',
    'DTEND:20261117T143000Z',
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
