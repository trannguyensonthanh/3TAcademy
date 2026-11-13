import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVnd,
  formatTimestamp,
  evaluatePasswordStrength,
  evaluateSessionQuizAndUnlock,
  updateSessionWatchPosition,
  calculateCohortCompetencyProgress,
  checkCohortScheduleConflict,
  formatScheduleSlots,
  calculatePathRecommendation,
  isEligibleToEnroll,
} from './academyLogic';
import { ClassSession, Cohort } from '../types/domain';

const sampleSession: ClassSession = {
  id: 'sess-4',
  cohortId: 'cohort-ai-k01',
  sessionOrder: 4,
  title: 'Buổi 4: Kỹ thuật Chunking & Parsing chống Zip-bomb',
  activityTags: ['THEORY', 'LIVE_CODING'],
  hostInstructorName: 'TS. Trần Minh Khoa',
  scheduledStart: '2026-11-05T19:30:00+07:00',
  scheduledEnd: '2026-11-05T21:30:00+07:00',
  status: 'REPLAY_READY',
  videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-4/master.m3u8',
  videoProvider: 'R2_HLS_AES128',
  durationSeconds: 7200,
  isCompleted: false,
  lastPositionSec: 2535,
  aiSummaryMd: 'Tóm tắt kỹ thuật Semantic Chunking và giới hạn bộ nhớ.',
  attachmentsCount: 3,
  quizStatus: 'PENDING',
  quizScore: null,
  aiCitations: [],
  quizQuestions: [
    {
      id: 'q1',
      question: 'Tại sao cần giới hạn tỷ lệ giải nén khi xử lý tài liệu PDF/DOCX đầu vào?',
      options: [
        'Để giảm chi phí lưu trữ S3',
        'Để phòng chống tấn công Zip-bomb làm tràn bộ nhớ Worker',
        'Để tăng tốc độ hiển thị font chữ',
      ],
      correctIndex: 1,
      explanation: 'File DOCX thực chất là gói nén ZIP; kiểm tra tỷ lệ nén ngăn chặn Zip-bomb.',
    },
    {
      id: 'q2',
      question: 'Chiến lược Chunking nào giữ nguyên ngữ cảnh bảng biểu Markdown tốt nhất?',
      options: [
        'Fixed-size 200 ký tự',
        'Structure-aware Recursive Markdown Splitter',
        'Cắt ngẫu nhiên theo dòng',
      ],
      correctIndex: 1,
      explanation: 'Structure-aware giữ nguyên cấu trúc bảng và tiêu đề phân cấp.',
    },
    {
      id: 'q3',
      question: 'Overlap giữa các chunk có tác dụng chính là gì?',
      options: [
        'Tránh đứt gãy ngữ nghĩa ở ranh giới giữa hai đoạn văn bản',
        'Làm giảm kích thước vector index',
        'Thay thế hoàn toàn bước Reranking',
      ],
      correctIndex: 0,
      explanation: 'Overlap bảo toàn mạch ngữ nghĩa tại điểm cắt.',
    },
  ],
};

test('formatVnd formats Vietnamese currency accurately with dot separators', () => {
  assert.equal(formatVnd(8500000), '8.500.000 ₫');
  assert.equal(formatVnd(0), '0 ₫');
});

test('formatTimestamp formats seconds into MM:SS and HH:MM:SS', () => {
  assert.equal(formatTimestamp(2535), '42:15');
  assert.equal(formatTimestamp(3665), '01:01:05');
});

test('passive video watching to 100% NEVER unlocks session completion without passing quiz', () => {
  const watchedToEnd = updateSessionWatchPosition(sampleSession, 7200);
  assert.equal(watchedToEnd.lastPositionSec, 7200);
  assert.equal(watchedToEnd.isCompleted, false);
});

test('evaluateSessionQuizAndUnlock unlocks session completion ONLY when score >= 67%', () => {
  // Fail case: only 1/3 correct (33%)
  const failedAttempt = evaluateSessionQuizAndUnlock(sampleSession, [1, 0, 2]);
  assert.equal(failedAttempt.passed, false);
  assert.equal(failedAttempt.scorePercent, 33);
  assert.equal(failedAttempt.updatedSession.isCompleted, false);
  assert.equal(failedAttempt.updatedSession.quizStatus, 'PENDING');

  // Pass case: 3/3 correct (100%)
  const passedAttempt = evaluateSessionQuizAndUnlock(sampleSession, [1, 1, 0]);
  assert.equal(passedAttempt.passed, true);
  assert.equal(passedAttempt.scorePercent, 100);
  assert.equal(passedAttempt.updatedSession.isCompleted, true);
  assert.equal(passedAttempt.updatedSession.quizStatus, 'PASSED');
});

test('calculateCohortCompetencyProgress computes completion counts accurately', () => {
  const s1 = { ...sampleSession, id: 's1', isCompleted: true, quizStatus: 'PASSED' as const, quizScore: 100 };
  const s2 = { ...sampleSession, id: 's2', isCompleted: false, quizStatus: 'PENDING' as const, quizScore: 33 };
  const progress = calculateCohortCompetencyProgress([s1, s2]);
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.totalCount, 2);
  assert.equal(progress.percentage, 50);
  assert.equal(progress.eligibleForFinalExam, false);
});

test('evaluatePasswordStrength returns WEAK, MEDIUM, STRONG appropriately', () => {
  assert.equal(evaluatePasswordStrength('abc').level, 'WEAK');
  assert.equal(evaluatePasswordStrength('Abcdefgh').level, 'MEDIUM');
  assert.equal(evaluatePasswordStrength('Abcdefgh9!').level, 'STRONG');
});

test('formatScheduleSlots formats same-time and different-time weekly slots accurately', () => {
  assert.equal(
    formatScheduleSlots([
      { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
      { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
    ]),
    'Thứ 3 & Thứ 7 (19:30 - 21:30)'
  );

  assert.equal(
    formatScheduleSlots([
      { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
      { dayOfWeek: 5, startTime: '16:30', endTime: '18:30' },
    ]),
    'Thứ 2 (19:30 - 21:30) · Thứ 6 (16:30 - 18:30)'
  );
});

test('checkCohortScheduleConflict detects overlapping weekly study slots by dayOfWeek and time range', () => {
  const enrolled: Cohort = {
    id: 'c1',
    courseId: 'course-1',
    instructorId: 'usr-inst-khoa',
    code: 'AI-ENG-2026-K01',
    name: 'Đợt K01',
    curriculumVersion: 'v2.4',
    tuitionVnd: 8500000,
    enrolledCount: 34,
    enrollmentOpenAt: '2026-10-01',
    startDate: '2026-11-17',
    endDate: '2026-12-28',
    scheduleSlots: [
      { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
      { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
    ],
    status: 'ONGOING',
    staff: [],
  };
  const conflictingTarget: Cohort = {
    ...enrolled,
    id: 'c2',
    code: 'SWE-CLOUD-2026-K01',
    scheduleSlots: [
      { dayOfWeek: 2, startTime: '20:00', endTime: '22:00' },
      { dayOfWeek: 5, startTime: '16:30', endTime: '18:30' },
    ],
  };
  const sameDayDifferentHoursTarget: Cohort = {
    ...enrolled,
    id: 'c3',
    code: 'PY-SQL-2026-K04',
    scheduleSlots: [
      { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
      { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
    ],
  };

  assert.equal(checkCohortScheduleConflict(conflictingTarget, [enrolled])?.code, 'AI-ENG-2026-K01');
  assert.equal(checkCohortScheduleConflict(sameDayDifferentHoursTarget, [enrolled]), null);
});

test('calculatePathRecommendation maps career goal and diagnostic answers to cohort', () => {
  const rec = calculatePathRecommendation('AI_ENGINEER', [1, 0, 2]);
  assert.equal(rec.recommendedCohortCode, 'AI-ENG-2026-K01');
  assert.equal(rec.diagnosticScore, 100);
});

test('isEligibleToEnroll blocks GUEST and non-student roles, allows STUDENT only', () => {
  // GUEST cannot enroll
  const guestCheck = isEligibleToEnroll('GUEST');
  assert.equal(guestCheck.eligible, false);
  assert.match(guestCheck.reason ?? '', /Yêu cầu đăng nhập tài khoản Học viên/);

  // INSTRUCTOR and ADMIN cannot enroll
  const instCheck = isEligibleToEnroll('INSTRUCTOR');
  assert.equal(instCheck.eligible, false);

  const adminCheck = isEligibleToEnroll('ADMIN');
  assert.equal(adminCheck.eligible, false);

  // Only STUDENT is eligible
  const studentCheck = isEligibleToEnroll('STUDENT');
  assert.equal(studentCheck.eligible, true);
  assert.equal(studentCheck.reason, undefined);
});
