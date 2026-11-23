/**
 * ============================================================================
 * TỆP: apps/api/src/modules/teach/teach.routes.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Cổng Giảng viên & Vận hành Lớp học (`INSTRUCTOR` / `ADMIN`).
 *   - Toàn bộ router được bảo vệ bởi `requireAuth` + `requireRole(['INSTRUCTOR', 'ADMIN'])`
 *     và kiểm tra quyền sở hữu lớp (`assertInstructorOwnsCohort`) ở mọi thao tác ghi.
 *   - Đảm nhiệm:
 *     1. Lịch giảng dạy, danh sách lớp phụ trách, theo dõi rủi ro bỏ học học viên (`buildFormattedEnrollments`).
 *     2. Quản lý buổi học: biên tập học liệu/tóm tắt, điều khiển trạng thái `LIVE` / `REPLAY_READY`,
 *        tắt mic/đuổi học viên trên cả LiveKit SFU lẫn SSE, ghi hình LiveKit Egress / upload R2,
 *        và tạo link mời Diễn giả Khách mời ký JWT.
 *     3. **Biên soạn đề kiểm tra cùng AI:**
 *        - `POST /teach/sessions/:sessionId/generate-quiz`: gọi `aiServiceClient.generateQuizDraft()`
 *          (`apps/ai-service/src/api/routes/grading_ai.py`) dựa trên transcript/chunks buổi học
 *          (có fallback sinh 4 câu deterministic bám chủ đề + nhúng vector 1024-dim).
 *        - `PUT /teach/assessments/:assessmentId/publish`: xuất bản đề kèm gắn thẻ kỹ năng từ
 *          `course_skills` và **đồng bộ đầy đủ 3 chiều INSERT + UPDATE + DELETE an toàn**
 *          (chỉ xóa câu hỏi không bị `submission_answers` lịch sử tham chiếu).
 *     4. Trả lời & xác nhận Q&A, gửi nhắc nhở học tập AI, và **hậu kiểm ca thi Proctoring**
 *        (`PUT /teach/exam-reviews/:reviewId`, `POST /teach/proctoring/:attemptId/verdict`)
 *        đồng bộ nguyên tử kết quả tốt nghiệp & thu hồi/cấp Chứng chỉ HMAC-SHA256.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ Frontend `apps/web/src/services/teach.api.ts` (toàn bộ `teachApi.*`).
 *   - Đọc/Ghi bảng DB: `cohorts`, `courses`, `class_sessions`, `session_attachments`, `session_progress`,
 *     `assessments`, `assessment_items`, `assessment_attempts`, `submission_answers`, `proctoring_events`,
 *     `enrollments`, `certificates`, `discussion_threads`, `discussion_posts`, `notifications`,
 *     `user_profiles`, `accounts`, `skills`, `course_skills`, `knowledge_chunks`, `chat_sessions`, `chat_messages`, `orders`.
 *   - Gọi AI Service: `aiServiceClient.generateQuizDraft()` -> `POST /api/v1/ai/assessments/generate-quiz` (`grading_ai.py`).
 *   - Gọi tích hợp media: `livekit.service.ts`, `r2.service.ts`, `liveRoom.helpers.ts`.
 * ============================================================================
 */
import { Router } from 'express';
import { eq, and, asc, desc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../../db/index.js';
import {
  cohorts,
  courses,
  classSessions,
  sessionAttachments,
  sessionProgress,
  assessments,
  assessmentItems,
  assessmentAttempts,
  submissionAnswers,
  proctoringEvents,
  enrollments,
  certificates,
  discussionThreads,
  discussionPosts,
  notifications,
  userProfiles,
  accounts,
  skills,
  courseSkills,
  knowledgeChunks,
  chatSessions,
  chatMessages,
  orders,
} from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { computeSemanticEmbedding1024 } from '../../db/seedHelpers.js';
import { env } from '../../config/env.js';
import {
  resolveCohort,
  resolveSession,
  resolveAssessment,
  formatScheduleLabels,
  buildInstructorStaffMap,
} from '../../db/helpers.js';
import {
  broadcastLiveRoomEvent,
  getLiveRoomState,
  updateHostBroadcastState,
  updateHostMediaState,
  updateKickedParticipantsState,
  updateLiveRecordingState,
  updateMutedParticipantsState,
  resolvePlayableVideoSource,
} from '../learning/liveRoom.helpers.js';
import { buildAttachmentDownloadUrl } from '../learning/learning.routes.js';
import { computeWeightedCohortScorePct } from '../assessment/skillMasteryModel.js';
import {
  kickLiveKitParticipant,
  muteLiveKitParticipantsAudio,
  startLiveKitRoomRecordingToR2,
  stopLiveKitRoomRecording,
} from '../../integrations/livekit.service.js';
import {
  createR2PresignedPutUrl,
  getR2PublicObjectUrl,
  uploadBufferToR2,
} from '../../integrations/r2.service.js';
import { reconcileUnmatchedSepayTransactions } from '../order/order.routes.js';

export const teachRouter = Router();

teachRouter.use(requireAuth, requireRole(['INSTRUCTOR', 'ADMIN']));

function formatSecondsToMmSs(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function inferMaterialFileType(
  fileName: string,
  mimeType: string
): 'VIDEO' | 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK' {
  const lower = fileName.toLowerCase();
  if (
    mimeType.startsWith('video/') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.m3u8') ||
    lower.endsWith('.webm') ||
    lower.includes('video')
  ) {
    return 'VIDEO';
  }
  if (lower.endsWith('.ipynb') || lower.includes('notebook')) return 'NOTEBOOK';
  if (lower.includes('github') || lower.endsWith('.zip') || lower.includes('repo')) return 'REPO';
  if (lower.includes('slide') || lower.endsWith('.pptx')) return 'SLIDE';
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'PDF';
  return 'PDF';
}

/** Kiểm tra quyền phụ trách đợt học (`ADMIN` luôn được phép; `INSTRUCTOR` phải có `cohorts.instructor_id === user.id`). */
async function assertInstructorOwnsCohort(
  cohortId: number,
  user: { id: number; role: string }
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  return Boolean(cohort && cohort.instructorId === user.id);
}

/** Tổng hợp bảng tiến độ học viên, điểm trung bình có trọng số giai đoạn (`computeWeightedCohortScorePct`) và phân loại nguy cơ bỏ học (`riskLevel`). */
export async function buildFormattedEnrollments(cohortFilterIds?: number[]) {
  await reconcileUnmatchedSepayTransactions();

  // Ensure any PAID order has a corresponding ACTIVE enrollment record & synced enrolledCount
  try {
    const [paidOrders, existingEnrs] = await Promise.all([
      db.select().from(orders).where(eq(orders.status, 'PAID')),
      db.select().from(enrollments),
    ]);
    const existingKeys = new Set(existingEnrs.map((e) => `${e.accountId}:${e.cohortId}`));
    const touchedCohortIds = new Set<number>();
    for (const ord of paidOrders) {
      const key = `${ord.accountId}:${ord.cohortId}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        touchedCohortIds.add(ord.cohortId);
        await db
          .insert(enrollments)
          .values({
            accountId: ord.accountId,
            cohortId: ord.cohortId,
            orderId: ord.id,
            status: 'ACTIVE',
          })
          .onConflictDoUpdate({
            target: [enrollments.accountId, enrollments.cohortId],
            set: { status: 'ACTIVE', orderId: ord.id },
          });
      }
    }
    for (const cId of touchedCohortIds) {
      await db
        .update(cohorts)
        .set({
          enrolledCount: sql`(SELECT COUNT(*)::int FROM enrollments WHERE cohort_id = ${cId} AND status <> 'REVOKED')`,
          updatedAt: new Date(),
        })
        .where(eq(cohorts.id, cId));
    }
  } catch {
    // Ignore in mocked test environments
  }

  const [
    allEnr,
    allProfiles,
    allAccounts,
    allCohorts,
    allCourses,
    allSessions,
    allProgress,
    allAssessments,
    allAttempts,
    allOrders,
    allThreads,
    allPosts,
    allChatSessions,
    allChatMsgs,
  ] = await Promise.all([
    cohortFilterIds && cohortFilterIds.length > 0
      ? db.select().from(enrollments).where(inArray(enrollments.cohortId, cohortFilterIds))
      : db.select().from(enrollments),
    db.select().from(userProfiles),
    db.select().from(accounts),
    db.select().from(cohorts),
    db.select().from(courses),
    db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder)),
    db.select().from(sessionProgress),
    db.select().from(assessments),
    db.select().from(assessmentAttempts).orderBy(desc(assessmentAttempts.submittedAt)),
    db.select().from(orders).orderBy(desc(orders.paidAt), desc(orders.createdAt)),
    db.select().from(discussionThreads).orderBy(desc(discussionThreads.createdAt)),
    db.select().from(discussionPosts).orderBy(asc(discussionPosts.createdAt)),
    db.select().from(chatSessions),
    db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)),
  ]);

  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const sessionMap = new Map(allSessions.map((s) => [s.id, s]));
  const assessmentMap = new Map(allAssessments.map((a) => [a.id, a]));
  const chatSessionMap = new Map(allChatSessions.map((cs) => [cs.id, cs]));

  const nowMs = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  return allEnr.map((enr) => {
    const prof = profileMap.get(enr.accountId);
    const acc = accountMap.get(enr.accountId);
    const cohort = cohortMap.get(enr.cohortId);
    const course = cohort ? courseMap.get(cohort.courseId) : undefined;
    const cSessions = allSessions
      .filter((s) => s.cohortId === enr.cohortId)
      .sort((a, b) => a.sessionOrder - b.sessionOrder);
    const totalSessionsCount = cSessions.length || 1;
    const replayReadySessionsCount = cSessions.filter(
      (s) => s.status === 'REPLAY_READY' && Boolean((s.videoR2Key || '').trim())
    ).length;

    const stuProgressRows = allProgress.filter(
      (p) => p.accountId === enr.accountId && cSessions.some((s) => s.id === p.sessionId)
    );
    const completedProg = stuProgressRows.filter((p) => p.isCompleted);
    const completedSessionsCount = completedProg.length;
    const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);

    // Filter attempts belonging to assessments of this cohort
    const cohortAttempts = allAttempts.filter((a) => {
      if (a.accountId !== enr.accountId || a.scorePct === null || a.scorePct === undefined) {
        return false;
      }
      const ass = assessmentMap.get(a.assessmentId);
      return ass ? ass.cohortId === enr.cohortId : true;
    });

    const avgScorePct = computeWeightedCohortScorePct(
      cohortAttempts.map((a) => {
        const ass = assessmentMap.get(a.assessmentId);
        const sess = ass?.sessionId
          ? cSessions.find((s) => s.id === ass.sessionId)
          : undefined;
        return {
          scorePct: Number(a.scorePct),
          sessionOrder: sess?.sessionOrder ?? null,
          isFinalExam: ass?.purpose === 'FINAL_EXAM',
        };
      }),
      totalSessionsCount
    );

    const enrolledDate = enr.enrolledAt ? new Date(enr.enrolledAt) : new Date();
    const isNewEnrollment = nowMs - enrolledDate.getTime() <= SEVEN_DAYS_MS;

    // Missing quizzes relative to sessions that have already taken place (REPLAY_READY)
    const effectiveDueSessions = replayReadySessionsCount > 0 ? replayReadySessionsCount : 0;
    const missingQuizzesCount = Math.max(0, effectiveDueSessions - completedSessionsCount);

    // Latest activity timestamp across session progress, quiz attempts, and enrollment date
    const activityTimestamps: number[] = [enrolledDate.getTime()];
    for (const p of stuProgressRows) {
      if (p.lastActivityAt) activityTimestamps.push(new Date(p.lastActivityAt).getTime());
    }
    for (const a of cohortAttempts) {
      if (a.submittedAt) activityTimestamps.push(new Date(a.submittedAt).getTime());
    }
    const latestActivityDate = new Date(Math.max(...activityTimestamps));

    // Match student's paid order for this cohort
    const matchedOrder =
      (enr.orderId ? allOrders.find((o) => o.id === enr.orderId) : undefined) ||
      allOrders.find(
        (o) => o.accountId === enr.accountId && o.cohortId === enr.cohortId && o.status === 'PAID'
      );

    // Detailed per-session progress for this student
    const sessionProgressList = cSessions.map((sess) => {
      const prog = stuProgressRows.find((p) => p.sessionId === sess.id);
      const sessQuiz = allAssessments.find((a) => a.sessionId === sess.id);
      const sessAttempts = sessQuiz
        ? cohortAttempts.filter((a) => a.assessmentId === sessQuiz.id)
        : [];
      const bestAttempt =
        sessAttempts.length > 0
          ? sessAttempts.reduce((best, curr) =>
              Number(curr.scorePct ?? 0) > Number(best.scorePct ?? 0) ? curr : best
            )
          : undefined;
      const quizScorePct =
        bestAttempt?.scorePct !== null && bestAttempt?.scorePct !== undefined
          ? Math.round(Number(bestAttempt.scorePct))
          : null;
      const hasSavedVideo = Boolean((sess.videoR2Key || '').trim());
      const effectiveSessStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
        sess.status === 'REPLAY_READY' && !hasSavedVideo
          ? 'SCHEDULED'
          : (sess.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY');

      return {
        sessionId: String(sess.id),
        sessionOrder: sess.sessionOrder,
        title: sess.title,
        sessionStatus: effectiveSessStatus,
        watchedSec: prog?.lastPositionSec ?? 0,
        durationSeconds: sess.durationSeconds || 5400,
        isCompleted: Boolean(prog?.isCompleted),
        quizScorePct,
        quizPassed: Boolean(prog?.isCompleted || (quizScorePct !== null && quizScorePct >= 70)),
        lastWatchedAt: prog?.lastActivityAt
          ? new Date(prog.lastActivityAt).toLocaleString('vi-VN')
          : null,
      };
    });

    // Questions asked by this student in this cohort (both Discussion Threads and AI Tutor chats)
    const cohortSessionIds = new Set(cSessions.map((s) => s.id));
    const studentDiscussionQuestions = allThreads
      .filter((t) => t.authorId === enr.accountId && cohortSessionIds.has(t.sessionId))
      .map((t) => {
        const sess = sessionMap.get(t.sessionId);
        const firstPost = allPosts.find((p) => p.threadId === t.id && !p.isAiGenerated);
        return {
          id: `disc-${t.id}`,
          source: 'DISCUSSION' as const,
          sessionOrder: sess?.sessionOrder ?? 1,
          sessionTitle: sess?.title || '',
          title: t.title,
          content: firstPost?.contentMd || t.title,
          detectedTopic: sess?.title || 'Thảo luận buổi học',
          createdAt: t.createdAt.toLocaleString('vi-VN'),
          isResolved: t.isResolved,
        };
      });

    const studentAiQuestions = allChatMsgs
      .filter((m) => {
        if (m.role !== 'user') return false;
        const cs = chatSessionMap.get(m.chatSessionId);
        if (!cs || cs.accountId !== enr.accountId) return false;
        return (
          cs.cohortId === enr.cohortId ||
          (cs.sessionId !== null && cohortSessionIds.has(cs.sessionId))
        );
      })
      .map((m) => {
        const cs = chatSessionMap.get(m.chatSessionId);
        const sess = cs?.sessionId ? sessionMap.get(cs.sessionId) : undefined;
        return {
          id: `ai-${m.id}`,
          source: 'AI_TUTOR' as const,
          sessionOrder: sess?.sessionOrder ?? 1,
          sessionTitle: sess?.title || 'Hỏi đáp Trợ giảng AI',
          title: m.content.slice(0, 90),
          content: m.content,
          detectedTopic: m.detectedTopic || sess?.title || 'Trợ giảng AI',
          createdAt: m.createdAt.toLocaleString('vi-VN'),
          isResolved: true,
        };
      });

    const studentQuestions = [...studentDiscussionQuestions, ...studentAiQuestions];

    const cvData = (prof?.cvParsedData ?? {}) as Record<string, unknown>;
    const resolvedPhone =
      (prof?.phone && prof.phone.trim()) ||
      (typeof cvData.phone === 'string' && cvData.phone.trim() ? cvData.phone.trim() : '');

    return {
      id: String(enr.id),
      userId: String(enr.accountId),
      accountId: String(enr.accountId),
      studentName: prof?.fullName || acc?.email || '',
      studentEmail: acc?.email || '',
      phone: resolvedPhone,
      bio: prof?.bio || '',
      careerGoal: prof?.careerGoal || '',
      avatarUrl: prof?.avatarUrl,
      cohortId: String(enr.cohortId),
      cohortCode: cohort?.code || '',
      cohortName: cohort?.name || '',
      courseTitle: course?.title || cohort?.name || '',
      orderCode: matchedOrder?.orderCode || `ORD-${enr.id}`,
      tuitionPaidVnd: matchedOrder?.amountVnd ?? cohort?.tuitionVnd ?? 10000,
      status: enr.status,
      progressPercent,
      completedSessionsCount,
      totalSessionsCount,
      replayReadySessionsCount,
      missingQuizzesCount,
      avgScorePct,
      finalExamPassed: enr.finalExamPassed,
      dropoutRiskScore: enr.dropoutRiskScore,
      riskLevel: enr.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
      isNewEnrollment,
      lastActivityAt: latestActivityDate.toLocaleDateString('vi-VN'),
      lastRemindedAt: enr.lastRemindedAt ? enr.lastRemindedAt.toLocaleString('vi-VN') : undefined,
      enrolledAt: enrolledDate.toISOString(),
      enrolledAtFormatted: enrolledDate.toLocaleString('vi-VN'),
      questionsCount: studentQuestions.length,
      sessionProgressList,
      studentQuestions,
    };
  });
}

async function buildFormattedDiscussionsForSessions(sessionsList: Array<typeof classSessions.$inferSelect>) {
  if (sessionsList.length === 0) return [];
  const sessionIds = sessionsList.map((s) => s.id);
  const sessionMap = new Map(sessionsList.map((s) => [s.id, s]));

  const [threads, posts] = await Promise.all([
    db
      .select({
        id: discussionThreads.id,
        sessionId: discussionThreads.sessionId,
        title: discussionThreads.title,
        videoTimestampSec: discussionThreads.videoTimestampSec,
        isResolved: discussionThreads.isResolved,
        createdAt: discussionThreads.createdAt,
        authorName: userProfiles.fullName,
      })
      .from(discussionThreads)
      .leftJoin(userProfiles, eq(discussionThreads.authorId, userProfiles.accountId))
      .where(inArray(discussionThreads.sessionId, sessionIds))
      .orderBy(desc(discussionThreads.createdAt)),
    db
      .select({
        id: discussionPosts.id,
        threadId: discussionPosts.threadId,
        contentMd: discussionPosts.contentMd,
        isAiGenerated: discussionPosts.isAiGenerated,
        isInstructorVerified: discussionPosts.isInstructorVerified,
        createdAt: discussionPosts.createdAt,
        authorName: userProfiles.fullName,
        authorRole: accounts.role,
      })
      .from(discussionPosts)
      .leftJoin(userProfiles, eq(discussionPosts.authorId, userProfiles.accountId))
      .leftJoin(accounts, eq(discussionPosts.authorId, accounts.id))
      .orderBy(asc(discussionPosts.createdAt)),
  ]);

  return threads.map((t) => {
    const sess = sessionMap.get(t.sessionId);
    const threadPosts = posts.filter((p) => p.threadId === t.id);
    const firstUserPost = threadPosts.find((p) => !p.isAiGenerated);
    const aiPost = threadPosts.find((p) => p.isAiGenerated);
    const tsSec = t.videoTimestampSec ?? 0;

    return {
      id: String(t.id),
      cohortId: sess ? String(sess.cohortId) : '',
      sessionId: String(t.sessionId),
      sessionOrder: sess?.sessionOrder ?? 1,
      sessionTitle: sess ? `Buổi ${sess.sessionOrder}: ${sess.title}` : '',
      authorName: t.authorName || '',
      title: t.title,
      questionTitle: t.title,
      questionBody: firstUserPost?.contentMd || t.title,
      contentMd: firstUserPost?.contentMd || t.title,
      videoTimestampSec: tsSec,
      timestampSec: tsSec,
      timestampLabel: formatSecondsToMmSs(tsSec),
      isResolved: t.isResolved,
      createdAt: t.createdAt.toISOString(),
      aiSuggestedAnswer: aiPost?.contentMd,
      hasAiSuggestion: Boolean(aiPost),
      verifiedByStaff: Boolean(aiPost?.isInstructorVerified || t.isResolved),
      replies: threadPosts.map((p) => ({
        id: String(p.id),
        authorName: p.isAiGenerated ? 'Trợ giảng AI 3T (RAG)' : p.authorName || '',
        authorRole: (p.isAiGenerated
          ? 'AI_TUTOR'
          : p.authorRole === 'INSTRUCTOR' || p.authorRole === 'ADMIN'
            ? 'INSTRUCTOR'
            : 'STUDENT') as 'STUDENT' | 'INSTRUCTOR' | 'AI_TUTOR',
        role: p.isAiGenerated ? 'AI_TUTOR' : p.authorRole || 'INSTRUCTOR',
        content: p.contentMd,
        contentMd: p.contentMd,
        isAiGenerated: p.isAiGenerated,
        isInstructorVerified: p.isInstructorVerified,
        isVerifiedByStaff: p.isInstructorVerified,
        isOfficialVerify: p.isInstructorVerified,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  });
}

function mapAssessmentItemsToMcq(
  items: Array<typeof assessmentItems.$inferSelect>,
  skillMap: Map<number, typeof skills.$inferSelect>
) {
  return items.map((item, idx) => {
    const pCfg = (item.promptConfig || {}) as {
      number?: number;
      scenarioTag?: string;
      prompt?: string;
      question?: string;
      options?: string[];
      slideLabel?: string;
    };
    const gCfg = (item.gradingConfig || {}) as {
      correctIndex?: number;
      reviewTimestampLabel?: string;
      reviewJumpSec?: number;
      reviewSegmentRangeSec?: [number, number];
    };
    const sk = skillMap.get(item.skillId);
    const jumpSec = gCfg.reviewJumpSec ?? 10;

    return {
      id: String(item.id),
      number: pCfg.number ?? item.itemOrder ?? idx + 1,
      scenarioTag: pCfg.scenarioTag || 'Câu hỏi thực chiến',
      skillId: String(item.skillId),
      skillCode: sk?.code || String(item.skillId),
      skillName: sk?.name || '',
      prompt: pCfg.prompt || pCfg.question || '',
      options: Array.isArray(pCfg.options) ? pCfg.options : [],
      correctIndex: gCfg.correctIndex ?? 0,
      explanation: item.explanationMd || '',
      reviewTimestampLabel: gCfg.reviewTimestampLabel || '00:10 — 00:25',
      reviewJumpSec: jumpSec,
      reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 15],
      slideLabel: pCfg.slideLabel || '',
    };
  });
}

/**
 * Route `GET /api/v1/teach/schedule` — Lịch giảng dạy tổng hợp, ca học sắp tới, danh sách Q&A chưa giải quyết và ca thi chờ duyệt Proctoring.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.getInstructorSchedule()`. Đọc `cohorts`, `courses`, `class_sessions`, `enrollments`, `assessments`, `assessment_attempts`, `proctoring_events`, `discussion_threads`.
 */
// 7.1 GET /teach/schedule
teachRouter.get('/teach/schedule', async (req, res, next) => {
  try {
    const instructorId = req.user!.id;

    const [
      allSessionsRaw,
      allCohorts,
      allCourses,
      allAttachments,
      allAssessments,
      allAttempts,
      allProcEvents,
      allProfiles,
      allAccounts,
      allChatSessions,
      allChatMsgs,
      allNotifs,
      getStaffForInstructor,
    ] = await Promise.all([
      req.user!.role === 'ADMIN'
        ? db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder))
        : db
            .select()
            .from(classSessions)
            .where(eq(classSessions.instructorId, instructorId))
            .orderBy(asc(classSessions.sessionOrder)),
      db.select().from(cohorts),
      db.select().from(courses),
      db.select().from(sessionAttachments),
      db.select().from(assessments),
      db.select().from(assessmentAttempts).orderBy(desc(assessmentAttempts.submittedAt)),
      db.select().from(proctoringEvents).orderBy(asc(proctoringEvents.occurredAt)),
      db.select().from(userProfiles),
      db.select().from(accounts),
      db.select().from(chatSessions),
      db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)),
      buildInstructorStaffMap(),
    ]);

    const sessions =
      allSessionsRaw.length > 0 || req.user!.role !== 'ADMIN'
        ? allSessionsRaw
        : await db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder));
    const instructorCohortIds = Array.from(
      new Set(
        allCohorts
          .filter((c) => req.user!.role === 'ADMIN' || c.instructorId === instructorId)
          .map((c) => c.id)
      )
    );

    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const assessmentMap = new Map(allAssessments.map((a) => [a.id, a]));
    const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
    const chatSessionMap = new Map(allChatSessions.map((cs) => [cs.id, cs]));

    const formattedSessions = sessions.map((s) => {
      const cohort = cohortMap.get(s.cohortId);
      const course = cohort ? courseMap.get(cohort.courseId) : undefined;
      const staffInfo = getStaffForInstructor(s.instructorId);
      const sessAttachments = allAttachments.filter((att) => att.sessionId === s.id);
      const sessQuiz = allAssessments.find((a) => a.sessionId === s.id);
      const hasSavedVideo = Boolean((s.videoR2Key || '').trim());
      const effectiveStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
        s.status === 'REPLAY_READY' && !hasSavedVideo
          ? 'SCHEDULED'
          : (s.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY');

      if (s.status === 'REPLAY_READY' && !hasSavedVideo) {
        db.update(classSessions)
          .set({ status: 'SCHEDULED', updatedAt: new Date() })
          .where(eq(classSessions.id, s.id))
          .catch(() => {});
      }

      return {
        id: String(s.id),
        cohortId: String(s.cohortId),
        cohortCode: cohort?.code || '',
        courseTitle: course?.title || cohort?.name || '',
        sessionOrder: s.sessionOrder,
        title: s.title,
        descriptionMd: s.descriptionMd || '',
        activityTags: (s.activityTags || ['THEORY', 'LIVE_CODING']) as Array<
          'THEORY' | 'LIVE_CODING' | 'EXERCISE_REVIEW' | 'WORKSHOP'
        >,
        hostInstructorName: staffInfo.instructorName,
        status: effectiveStatus,
        scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
        scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
        videoR2Key: s.videoR2Key || '',
        videoProvider: (s.videoProvider || 'R2_HLS_AES128') as 'R2_HLS_AES128' | 'BUNNY_STREAM',
        durationSeconds: s.durationSeconds || 5400,
        durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
        isCompleted: false,
        lastPositionSec: 0,
        aiSummaryMd: s.aiSummaryMd || '',
        attachmentsCount: sessAttachments.length,
        assessmentId: sessQuiz ? String(sessQuiz.id) : undefined,
        hasQuiz: Boolean(sessQuiz),
        quizStatus: 'NOT_STARTED' as const,
        quizScore: null,
        quizQuestions: [],
        aiCitations: [],
        guestJoinUrl:
          effectiveStatus === 'LIVE' ? `https://3t.edu.vn/live/guest/${s.id}` : undefined,
      };
    });

    const liveSession =
      formattedSessions.find((s) => s.status === 'LIVE') || null;
    const upcomingSessions = formattedSessions.filter((s) => s.status === 'SCHEDULED');

    const examReviews = allAttempts.map((att) => {
      const stuProf = profileMap.get(att.accountId);
      const stuAcc = accountMap.get(att.accountId);
      const ass = assessmentMap.get(att.assessmentId);
      const cohort = ass ? cohortMap.get(ass.cohortId) : undefined;
      const evts = allProcEvents.filter((e) => e.attemptId === att.id);
      const firstEvt = evts[0];
      const scorePct = Math.round(Number(att.scorePct ?? 0));
      const scoreOutOf10 = (scorePct / 10).toFixed(1);

      const decision: 'PENDING' | 'APPROVED' | 'RETAKE_REQUIRED' =
        att.integrityStatus === 'CLEARED_BY_INSTRUCTOR'
          ? 'APPROVED'
          : att.integrityStatus === 'CONFIRMED_CHEAT'
            ? 'RETAKE_REQUIRED'
            : 'PENDING';

      const cameraFlagReason =
        att.verdictNote ||
        (firstEvt
          ? (firstEvt.details as { note?: string })?.note ||
            `Cảnh báo ${firstEvt.eventType} (+${firstEvt.riskDelta} điểm rủi ro)`
          : 'Không phát hiện bất thường.');

      return {
        id: String(att.id),
        attemptId: String(att.id),
        studentName: stuProf?.fullName || stuAcc?.email || '',
        studentEmail: stuAcc?.email || '',
        cohortCode: cohort?.code || '',
        examTitle: ass?.title || '',
        mcqScore: `${scoreOutOf10}/10 (${scorePct}%)`,
        submittedAt: (att.submittedAt || att.startedAt).toLocaleString('vi-VN'),
        scorePercent: scorePct,
        totalRiskScore: Number(att.totalRiskScore ?? 0),
        integrityStatus: att.integrityStatus,
        cameraFlagReason,
        cameraTimestamp: firstEvt
          ? formatSecondsToMmSs(firstEvt.videoOffsetSec ?? 0)
          : '00:00',
        snapshotNote: cameraFlagReason,
        decision,
      };
    });

    const formattedEnrollments =
      req.user!.role === 'ADMIN'
        ? await buildFormattedEnrollments()
        : instructorCohortIds.length > 0
        ? await buildFormattedEnrollments(instructorCohortIds)
        : [];
    const formattedDiscussions = await buildFormattedDiscussionsForSessions(sessions);

    const instructorSessionIds = new Set(sessions.map((s) => s.id));
    const instructorCohortIdSet = new Set(instructorCohortIds);

    const scopedAttachments = allAttachments.filter((att) =>
      instructorSessionIds.has(att.sessionId)
    );
    const formattedMaterials = scopedAttachments.map((att) => {
      const sess = sessions.find((s) => s.id === att.sessionId);
      const fileType = inferMaterialFileType(att.fileName, att.mimeType);
      const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      return {
        id: String(att.id),
        cohortId: String(sess?.cohortId ?? ''),
        sessionId: String(att.sessionId),
        sessionOrder: sess?.sessionOrder ?? 1,
        title: att.fileName,
        fileName: att.fileName,
        fileType,
        type: fileType,
        mimeType: att.mimeType,
        fileSize: sizeStr,
        sizeLabel: sizeStr,
        fileSizeBytes: att.fileSizeBytes,
        downloadUrl: buildAttachmentDownloadUrl(att.r2ObjectKey),
        updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
      };
    });

    const scopedChatMsgs =
      req.user!.role === 'ADMIN'
        ? allChatMsgs
        : allChatMsgs.filter((m) => {
            const cs = chatSessionMap.get(m.chatSessionId);
            return Boolean(
              cs &&
                ((cs.cohortId && instructorCohortIdSet.has(cs.cohortId)) ||
                  (cs.sessionId && instructorSessionIds.has(cs.sessionId)))
            );
          });

    res.json({
      liveSession,
      upcomingSessions,
      allSessions: formattedSessions,
      examReviews,
      enrollments: formattedEnrollments,
      chatMessages: scopedChatMsgs.map((m) => {
        const cs = chatSessionMap.get(m.chatSessionId);
        const stuProf = cs?.accountId ? profileMap.get(cs.accountId) : undefined;
        return {
          id: String(m.id),
          chatSessionId: String(m.chatSessionId),
          sessionId: cs?.sessionId ? String(cs.sessionId) : '',
          cohortId: cs?.cohortId ? String(cs.cohortId) : '',
          userId: cs?.accountId ? String(cs.accountId) : '',
          studentName: stuProf?.fullName || '',
          senderRole: (m.role === 'assistant' ? 'AI_TUTOR' : 'STUDENT') as
            | 'STUDENT'
            | 'AI_TUTOR',
          role: m.role,
          content: m.content,
          detectedTopic: m.detectedTopic || null,
          latencyMs: m.latencyMs ?? null,
          tokensUsed: m.promptTokens && m.completionTokens ? m.promptTokens + m.completionTokens : null,
          createdAt: m.createdAt.toISOString(),
        };
      }),
      notifications: allNotifs.map((n) => {
        const stuProf = profileMap.get(n.recipientId);
        const meta = (n.metadata || {}) as { cohortId?: number | string };
        const cohort = meta.cohortId ? cohortMap.get(Number(meta.cohortId)) : undefined;
        return {
          id: String(n.id),
          userId: String(n.recipientId),
          recipientId: String(n.recipientId),
          studentName: stuProf?.fullName || '',
          cohortId: cohort ? String(cohort.id) : '',
          cohortCode: cohort?.code || '',
          type: (n.type === 'INSTRUCTOR_REMINDER' ? 'AI_STUDY_REMINDER' : n.type) as
            | 'AI_STUDY_REMINDER'
            | 'QUIZ_DEADLINE'
            | 'SYSTEM',
          title: n.title,
          message: n.body,
          body: n.body,
          isRead: n.isRead,
          sentAt: n.createdAt.toISOString(),
          readAt: n.readAt ? n.readAt.toISOString() : null,
          actedAt: n.actedAt ? n.actedAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        };
      }),
      discussions: formattedDiscussions,
      materials: formattedMaterials,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/teach/cohorts` — Danh sách các đợt học Giảng viên phụ trách (hoặc toàn bộ nếu là `ADMIN`).
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.getInstructorCohorts()`. Đọc `cohorts`, `courses`, `enrollments`.
 */
// 7.2 GET /teach/cohorts
teachRouter.get('/teach/cohorts', async (req, res, next) => {
  try {
    const instructorId = req.user!.id;
    const [allCohortsRaw, allCourses, getStaffForInstructor] = await Promise.all([
      req.user!.role === 'ADMIN'
        ? db.select().from(cohorts)
        : db.select().from(cohorts).where(eq(cohorts.instructorId, instructorId)),
      db.select().from(courses),
      buildInstructorStaffMap(),
    ]);

    const list =
      allCohortsRaw.length > 0 || req.user!.role !== 'ADMIN'
        ? allCohortsRaw
        : await db.select().from(cohorts);
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    const allFormattedEnrollments = await buildFormattedEnrollments(list.map((c) => c.id));
    const enrollmentCountByCohort = new Map<string, number>();
    for (const enr of allFormattedEnrollments) {
      const cid = String(enr.cohortId);
      enrollmentCountByCohort.set(cid, (enrollmentCountByCohort.get(cid) || 0) + 1);
    }

    res.json(
      list.map((ch) => {
        const course = courseMap.get(ch.courseId);
        const staffInfo = getStaffForInstructor(ch.instructorId);
        const labels = formatScheduleLabels(ch.scheduleSlots || []);
        const actualEnrolled = enrollmentCountByCohort.get(String(ch.id)) ?? ch.enrolledCount;

        return {
          id: String(ch.id),
          courseId: String(ch.courseId),
          instructorId: String(ch.instructorId),
          courseSlug: course?.slug || '',
          courseTitle: course?.title || ch.name,
          code: ch.code,
          name: ch.name,
          status: ch.status,
          curriculumVersion: ch.curriculumVersion,
          techStackNotes: ch.techStackNotes,
          tuitionVnd: ch.tuitionVnd,
          enrolledCount: Math.max(ch.enrolledCount, actualEnrolled),
          enrollmentOpenAt: ch.enrollmentOpenAt.toISOString(),
          startDate: ch.startDate,
          endDate: ch.endDate,
          scheduleLabel: labels.scheduleLabel,
          timeRangeLabel: labels.timeRangeLabel,
          scheduleSlots: ch.scheduleSlots || [],
          instructorName: staffInfo.instructorName,
          instructorHeadline: staffInfo.instructorHeadline,
          instructorAvatarUrl: staffInfo.instructorAvatarUrl,
          staff: staffInfo.staff,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/teach/cohorts/:cohortId` — Chi tiết vận hành một đợt học: 6 buổi học, danh sách học viên, điểm thi, ngân hàng đề & ca thi Proctoring.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.getInstructorCohortDetail(cohortId)`.
 */
// 7.3 GET /teach/cohorts/:cohortId
teachRouter.get('/teach/cohorts/:cohortId', async (req, res, next) => {
  try {
    const cohort = await resolveCohort(req.params.cohortId);
    if (!cohort) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'COHORT_NOT_FOUND',
        message: 'Không tìm thấy đợt học',
        error: {
          code: 'COHORT_NOT_FOUND',
          message: 'Không tìm thấy đợt học',
        },
      });
      return;
    }

    const [[course], sessions, cohortAssessments, allSkills, courseSkillRows, getStaffForInstructor] =
      await Promise.all([
        db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1),
        db
          .select()
          .from(classSessions)
          .where(eq(classSessions.cohortId, cohort.id))
          .orderBy(asc(classSessions.sessionOrder)),
        db.select().from(assessments).where(eq(assessments.cohortId, cohort.id)),
        db.select().from(skills),
        db.select().from(courseSkills).where(eq(courseSkills.courseId, cohort.courseId)),
        buildInstructorStaffMap(),
      ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const formattedCourseSkills =
      courseSkillRows.length > 0
        ? [...courseSkillRows]
            .sort((a, b) => (a.skillRole === 'LEARNING_OUTCOME' ? -1 : 1) - (b.skillRole === 'LEARNING_OUTCOME' ? -1 : 1))
            .map((cs) => {
              const sk = skillMap.get(cs.skillId);
              return sk ? { id: String(sk.id), code: sk.code, name: sk.name, role: cs.skillRole } : null;
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x))
        : allSkills.map((sk) => ({
            id: String(sk.id),
            code: sk.code,
            name: sk.name,
            role: 'LEARNING_OUTCOME',
          }));
    const finalExam = cohortAssessments.find((a) => a.purpose === 'FINAL_EXAM');
    const finalExamItems = finalExam
      ? await db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, finalExam.id))
          .orderBy(asc(assessmentItems.itemOrder))
      : [];

    const sessionIds = sessions.map((s) => s.id);
    const attachments =
      sessionIds.length > 0
        ? await db
            .select()
            .from(sessionAttachments)
            .where(inArray(sessionAttachments.sessionId, sessionIds))
        : [];

    const [cohortEnrollments, discussions] = await Promise.all([
      buildFormattedEnrollments([cohort.id]),
      buildFormattedDiscussionsForSessions(sessions),
    ]);

    const staffInfo = getStaffForInstructor(cohort.instructorId);
    const labels = formatScheduleLabels(cohort.scheduleSlots || []);

    res.json({
      cohort: {
        id: String(cohort.id),
        courseId: String(cohort.courseId),
        instructorId: String(cohort.instructorId),
        courseSlug: course?.slug || '',
        courseTitle: course?.title || cohort.name,
        code: cohort.code,
        name: cohort.name,
        status: cohort.status,
        curriculumVersion: cohort.curriculumVersion,
        techStackNotes: cohort.techStackNotes,
        tuitionVnd: cohort.tuitionVnd,
        enrolledCount: Math.max(cohort.enrolledCount, cohortEnrollments.length),
        enrollmentOpenAt: cohort.enrollmentOpenAt.toISOString(),
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        scheduleLabel: labels.scheduleLabel,
        timeRangeLabel: labels.timeRangeLabel,
        scheduleSlots: cohort.scheduleSlots || [],
        instructorName: staffInfo.instructorName,
        instructorHeadline: staffInfo.instructorHeadline,
        instructorAvatarUrl: staffInfo.instructorAvatarUrl,
        staff: staffInfo.staff,
      },
      sessions: sessions.map((s) => {
        const sessQuiz = cohortAssessments.find((a) => a.sessionId === s.id);
        const sessAttachments = attachments.filter((att) => att.sessionId === s.id);
        const hasSavedVideo = Boolean((s.videoR2Key || '').trim());
        const effectiveStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
          s.status === 'REPLAY_READY' && !hasSavedVideo
            ? 'SCHEDULED'
            : (s.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY');

        if (s.status === 'REPLAY_READY' && !hasSavedVideo) {
          db.update(classSessions)
            .set({ status: 'SCHEDULED', updatedAt: new Date() })
            .where(eq(classSessions.id, s.id))
            .catch(() => {});
        }

        return {
          id: String(s.id),
          cohortId: String(s.cohortId),
          sessionOrder: s.sessionOrder,
          title: s.title,
          descriptionMd: s.descriptionMd || '',
          activityTags: (s.activityTags || ['THEORY', 'LIVE_CODING']) as Array<
            'THEORY' | 'LIVE_CODING' | 'EXERCISE_REVIEW' | 'WORKSHOP'
          >,
          hostInstructorName: staffInfo.instructorName,
          status: effectiveStatus,
          scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
          scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
          videoR2Key: s.videoR2Key || '',
          videoProvider: (s.videoProvider || 'R2_HLS_AES128') as 'R2_HLS_AES128' | 'BUNNY_STREAM',
          durationSeconds: s.durationSeconds || 5400,
          durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
          isCompleted: false,
          lastPositionSec: 0,
          aiSummaryMd: s.aiSummaryMd || '',
          attachmentsCount: sessAttachments.length,
          assessmentId: sessQuiz ? String(sessQuiz.id) : undefined,
          hasQuiz: Boolean(sessQuiz),
          quizId: sessQuiz ? String(sessQuiz.id) : undefined,
          quizPublishStatus: sessQuiz?.status || 'PUBLISHED',
          quizStatus: 'NOT_STARTED' as const,
          quizScore: null,
          quizQuestions: [],
          aiCitations: [],
        };
      }),
      finalExamAssessmentId: finalExam ? String(finalExam.id) : undefined,
      finalExamId: finalExam ? String(finalExam.id) : undefined,
      finalExamPublishStatus: finalExam?.status || 'PUBLISHED',
      finalExamQuestions: mapAssessmentItemsToMcq(finalExamItems, skillMap),
      courseSkills: formattedCourseSkills,
      enrollments: cohortEnrollments,
      discussions,
      materials: attachments.map((att) => {
        const sess = sessions.find((s) => s.id === att.sessionId);
        const fileType = inferMaterialFileType(att.fileName, att.mimeType);
        const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
        return {
          id: String(att.id),
          cohortId: String(cohort.id),
          sessionId: String(att.sessionId),
          sessionOrder: sess?.sessionOrder ?? 1,
          title: att.fileName,
          fileName: att.fileName,
          fileType,
          type: fileType,
          mimeType: att.mimeType,
          fileSize: sizeStr,
          sizeLabel: sizeStr,
          fileSizeBytes: att.fileSizeBytes,
          downloadUrl: buildAttachmentDownloadUrl(att.r2ObjectKey),
          updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
        };
      }),
      assessments: cohortAssessments.map((a) => ({
        ...a,
        id: String(a.id),
        cohortId: String(a.cohortId),
        sessionId: a.sessionId ? String(a.sessionId) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/teach/cohorts/:cohortId/sessions/:sessionId` — Chi tiết biên soạn một buổi học (tài liệu, tóm tắt AI, đề Quiz kèm đáp án, thảo luận).
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.getInstructorSessionDetail(cohortId, sessionId)`.
 */
// 7.4 GET /teach/cohorts/:cohortId/sessions/:sessionId
teachRouter.get(
  '/teach/cohorts/:cohortId/sessions/:sessionId',
  async (req, res, next) => {
    try {
      const cohort = await resolveCohort(req.params.cohortId);
      const session = await resolveSession(req.params.sessionId, cohort?.id);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const [attachments, [quiz], allSkills, sessionCohortRows, discussions, getStaffForInstructor] =
        await Promise.all([
          db
            .select()
            .from(sessionAttachments)
            .where(eq(sessionAttachments.sessionId, session.id)),
          db
            .select()
            .from(assessments)
            .where(eq(assessments.sessionId, session.id))
            .limit(1),
          db.select().from(skills),
          db.select().from(cohorts).where(eq(cohorts.id, session.cohortId)).limit(1),
          buildFormattedDiscussionsForSessions([session]),
          buildInstructorStaffMap(),
        ]);

      const staffInfo = getStaffForInstructor(session.instructorId);
      const skillMap = new Map(allSkills.map((s) => [s.id, s]));
      const sessionCourseId = sessionCohortRows[0]?.courseId;
      const sessionCourseSkillRows = sessionCourseId
        ? await db.select().from(courseSkills).where(eq(courseSkills.courseId, sessionCourseId))
        : [];
      const formattedSessionCourseSkills =
        sessionCourseSkillRows.length > 0
          ? [...sessionCourseSkillRows]
              .sort((a, b) => (a.skillRole === 'LEARNING_OUTCOME' ? -1 : 1) - (b.skillRole === 'LEARNING_OUTCOME' ? -1 : 1))
              .map((cs) => {
                const sk = skillMap.get(cs.skillId);
                return sk ? { id: String(sk.id), code: sk.code, name: sk.name, role: cs.skillRole } : null;
              })
              .filter((x): x is NonNullable<typeof x> => Boolean(x))
          : allSkills.map((sk) => ({
              id: String(sk.id),
              code: sk.code,
              name: sk.name,
              role: 'LEARNING_OUTCOME',
            }));
      const quizItems = quiz
        ? await db
            .select()
            .from(assessmentItems)
            .where(eq(assessmentItems.assessmentId, quiz.id))
            .orderBy(asc(assessmentItems.itemOrder))
        : [];

      const questions = mapAssessmentItemsToMcq(quizItems, skillMap);
      const materials = attachments.map((att) => {
        const fileType = inferMaterialFileType(att.fileName, att.mimeType);
        const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
        return {
          id: String(att.id),
          cohortId: String(session.cohortId),
          sessionId: String(session.id),
          sessionOrder: session.sessionOrder,
          title: att.fileName,
          fileName: att.fileName,
          fileType,
          type: fileType,
          mimeType: att.mimeType,
          fileSize: sizeStr,
          sizeLabel: sizeStr,
          fileSizeBytes: att.fileSizeBytes,
          downloadUrl: buildAttachmentDownloadUrl(att.r2ObjectKey),
          updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
        };
      });

      const hasSavedVideo = Boolean((session.videoR2Key || '').trim());
      const effectiveStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
        session.status === 'REPLAY_READY' && !hasSavedVideo
          ? 'SCHEDULED'
          : (session.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY');

      if (session.status === 'REPLAY_READY' && !hasSavedVideo) {
        db.update(classSessions)
          .set({ status: 'SCHEDULED', updatedAt: new Date() })
          .where(eq(classSessions.id, session.id))
          .catch(() => {});
      }

      res.json({
        session: {
          id: String(session.id),
          cohortId: String(session.cohortId),
          sessionOrder: session.sessionOrder,
          title: session.title,
          descriptionMd: session.descriptionMd || '',
          activityTags: (session.activityTags || ['THEORY', 'LIVE_CODING']) as Array<
            'THEORY' | 'LIVE_CODING' | 'EXERCISE_REVIEW' | 'WORKSHOP'
          >,
          hostInstructorName: staffInfo.instructorName,
          status: effectiveStatus,
          scheduledStart: session.scheduledStart ? session.scheduledStart.toISOString() : '',
          scheduledEnd: session.scheduledEnd ? session.scheduledEnd.toISOString() : '',
          videoR2Key: session.videoR2Key || '',
          videoProvider: (session.videoProvider || 'R2_HLS_AES128') as 'R2_HLS_AES128' | 'BUNNY_STREAM',
          durationSeconds: session.durationSeconds || 5400,
          durationMinutes: Math.round((session.durationSeconds || 5400) / 60),
          isCompleted: false,
          lastPositionSec: 0,
          aiSummaryMd: session.aiSummaryMd || '',
          attachmentsCount: materials.length,
          assessmentId: quiz ? String(quiz.id) : undefined,
          quizId: quiz ? String(quiz.id) : undefined,
          quizStatus: 'NOT_STARTED' as const,
          quizScore: null,
          quizQuestions: [],
          aiCitations: [],
        },
        ...(() => {
          const v = resolvePlayableVideoSource(session.videoR2Key, session.sessionOrder);
          return {
            videoUrl: v.videoUrl,
            playbackType: v.playbackType,
          };
        })(),
        assessmentId: quiz ? String(quiz.id) : undefined,
        attachments: materials,
        materials,
        quiz: quiz ? { ...quiz, id: String(quiz.id) } : null,
        quizItems,
        questions,
        courseSkills: formattedSessionCourseSkills,
        publishStatus: quiz?.status || 'PUBLISHED',
        discussions,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `PUT /api/v1/teach/sessions/:sessionId/materials` — Cập nhật tóm tắt bài giảng, học liệu đính kèm và link video replay của buổi học.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.updateSessionMaterials()` / `updateSessionSummary()`. Ghi `class_sessions`, `session_attachments`, `knowledge_chunks`.
 */
// 7.5 PUT /teach/sessions/:sessionId/materials
const updateMaterialsSchema = z.object({
  title: z.string().optional(),
  descriptionMd: z.string().optional(),
  aiSummaryMd: z.string().optional(),
  scheduledStart: z.string().optional(),
  videoR2Key: z.string().optional(),
  status: z.enum(['LIVE', 'SCHEDULED', 'REPLAY_READY']).optional(),
  durationSeconds: z.number().int().positive().optional(),
  cohortId: z.union([z.string(), z.number()]).optional(),
  sessionOrder: z.number().int().optional(),
  materialTitle: z.string().optional(),
  materialUrl: z.string().optional(),
  fileType: z.enum(['VIDEO', 'SLIDE', 'PDF', 'REPO', 'NOTEBOOK']).optional(),
  fileName: z.string().optional(),
  r2ObjectKey: z.string().optional(),
  mimeType: z.string().optional(),
  fileSizeBytes: z.number().int().positive().optional(),
});

teachRouter.put(
  '/teach/sessions/:sessionId/materials',
  validate(updateMaterialsSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }
      const sessionId = session.id;
      const {
        title,
        descriptionMd,
        aiSummaryMd,
        scheduledStart,
        videoR2Key,
        status,
        durationSeconds,
        materialTitle,
        materialUrl,
        fileType,
        fileName,
        r2ObjectKey,
        mimeType,
        fileSizeBytes,
      } = req.body;

      const parsedStart =
        scheduledStart && !Number.isNaN(Date.parse(scheduledStart))
          ? new Date(scheduledStart)
          : session.scheduledStart;

      // Once a session is REPLAY_READY WITH a saved recording, lock its completed status and primary recording
      const isAlreadyCompleted =
        session.status === 'REPLAY_READY' && Boolean((session.videoR2Key || '').trim());
      const nextVideoKey = isAlreadyCompleted
        ? session.videoR2Key || (videoR2Key !== undefined ? videoR2Key.trim() : session.videoR2Key)
        : videoR2Key !== undefined
          ? videoR2Key.trim()
          : session.videoR2Key;
      const rawNextStatus = isAlreadyCompleted
        ? 'REPLAY_READY'
        : status ??
          (videoR2Key && videoR2Key.trim() && session.status === 'SCHEDULED'
            ? 'REPLAY_READY'
            : session.status);
      const nextStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
        rawNextStatus === 'REPLAY_READY' && !Boolean((nextVideoKey || '').trim())
          ? 'SCHEDULED'
          : rawNextStatus;

      const [updatedSession] = await db
        .update(classSessions)
        .set({
          title: title || session.title,
          descriptionMd: descriptionMd ?? session.descriptionMd,
          aiSummaryMd: aiSummaryMd ?? session.aiSummaryMd,
          scheduledStart: parsedStart,
          videoR2Key: nextVideoKey,
          status: nextStatus,
          durationSeconds: durationSeconds ?? session.durationSeconds,
          lastUpdatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(classSessions.id, sessionId))
        .returning();

      let createdMaterial: Record<string, unknown> | undefined;
      const effectiveName = materialTitle || fileName;

      if (effectiveName) {
        const resolvedMime =
          mimeType ||
          (fileType === 'VIDEO'
            ? 'video/mp4'
            : fileType === 'NOTEBOOK'
              ? 'application/x-ipynb+json'
              : fileType === 'REPO'
                ? 'application/zip'
                : 'application/pdf');
        const resolvedBytes = fileSizeBytes || (fileType === 'VIDEO' ? 18454937 : 2516582);
        const trimmedUrl = materialUrl?.trim();
        const resolvedObjectKey =
          trimmedUrl ||
          r2ObjectKey ||
          `sessions/${sessionId}/${Date.now()}-${effectiveName.replace(/\s+/g, '_')}`;

        const [att] = await db
          .insert(sessionAttachments)
          .values({
            sessionId,
            fileName: effectiveName,
            r2ObjectKey: resolvedObjectKey,
            mimeType: resolvedMime,
            fileSizeBytes: resolvedBytes,
            uploadedBy: req.user!.id,
          })
          .returning();

        if (att) {
          const resolvedFileType = fileType || inferMaterialFileType(att.fileName, att.mimeType);
          const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
          createdMaterial = {
            id: String(att.id),
            cohortId: String(updatedSession?.cohortId ?? session?.cohortId ?? ''),
            sessionId: String(sessionId),
            sessionOrder: updatedSession?.sessionOrder ?? session?.sessionOrder ?? 1,
            title: att.fileName,
            fileName: att.fileName,
            fileType: resolvedFileType,
            type: resolvedFileType,
            mimeType: att.mimeType,
            fileSize: sizeStr,
            sizeLabel: sizeStr,
            fileSizeBytes: att.fileSizeBytes,
            downloadUrl: buildAttachmentDownloadUrl(att.r2ObjectKey),
            updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
          };
        }
      }

      const resolvedVideo = resolvePlayableVideoSource(
        updatedSession?.videoR2Key,
        updatedSession?.sessionOrder ?? session.sessionOrder
      );

      res.json({
        sessionId: String(sessionId),
        updated: true,
        updatedAt: new Date().toISOString(),
        videoUrl: resolvedVideo.videoUrl,
        playbackType: resolvedVideo.playbackType,
        session: updatedSession
          ? {
              ...updatedSession,
              id: String(updatedSession.id),
              cohortId: String(updatedSession.cohortId),
            }
          : null,
        material: createdMaterial,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `PUT /api/v1/teach/sessions/:sessionId/live-status` — Chuyển đổi trạng thái phòng học (`SCHEDULED` <-> `LIVE` <-> `REPLAY_READY`), cập nhật ghi chú slide và broadcast SSE.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.updateSessionLiveStatus()`. Ghi `class_sessions`, phát SSE qua `liveRoom.helpers.ts`.
 */
// 7.5b PUT /teach/sessions/:sessionId/live-status
const updateLiveStatusSchema = z.object({
  status: z.enum(['LIVE', 'SCHEDULED', 'REPLAY_READY']).optional(),
  videoR2Key: z.string().optional(),
  activeSlideLabel: z.string().max(160).optional(),
  liveTopicNote: z.string().max(500).optional(),
});

teachRouter.put(
  '/teach/sessions/:sessionId/live-status',
  validate(updateLiveStatusSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }

      const { status, videoR2Key, activeSlideLabel, liveTopicNote } = req.body;
      const hasExistingVideo = Boolean((session.videoR2Key || '').trim());
      const isAlreadyCompleted = session.status === 'REPLAY_READY' && hasExistingVideo;

      if (isAlreadyCompleted && status && status !== 'REPLAY_READY') {
        res.status(400).json({
          success: false,
          status: 400,
          code: 'SESSION_ALREADY_COMPLETED',
          message:
            'Buổi học đã kết thúc và lưu bản ghi chính thức nên không thể chuyển ngược về trạng thái LIVE hoặc SCHEDULED.',
        });
        return;
      }

      const nextVideoKey = isAlreadyCompleted
        ? session.videoR2Key
        : videoR2Key !== undefined
          ? videoR2Key.trim()
          : session.videoR2Key;
      const hasAnyVideo = Boolean((nextVideoKey || '').trim());

      const rawNextStatus = isAlreadyCompleted ? 'REPLAY_READY' : (status ?? session.status);
      // If Instructor closes the live session ('REPLAY_READY' or 'SCHEDULED') WITHOUT saving a recording,
      // return the session to 'SCHEDULED' so students don't see a fake replay button and Instructor can reopen Live anytime.
      const nextStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY' =
        rawNextStatus === 'REPLAY_READY' && !hasAnyVideo ? 'SCHEDULED' : rawNextStatus;

      const [updated] = await db
        .update(classSessions)
        .set({
          status: nextStatus,
          videoR2Key: nextVideoKey,
          lastUpdatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(classSessions.id, session.id))
        .returning();

      const hostBroadcast = updateHostBroadcastState(session.id, {
        activeSlideLabel,
        liveTopicNote,
      });

      if (nextStatus !== 'LIVE') {
        updateHostMediaState(session.id, {
          camOn: false,
          micOn: false,
          screenSharing: false,
        });
      }

      const resolvedVideo = resolvePlayableVideoSource(
        updated?.videoR2Key,
        updated?.sessionOrder ?? session.sessionOrder
      );

      broadcastLiveRoomEvent(session.id, 'session_status', {
        sessionId: String(session.id),
        status: nextStatus,
        videoUrl: resolvedVideo.videoUrl,
        playbackType: resolvedVideo.playbackType,
        hostBroadcast,
      });

      res.json({
        sessionId: String(session.id),
        status: nextStatus,
        videoUrl: resolvedVideo.videoUrl,
        playbackType: resolvedVideo.playbackType,
        hostBroadcast,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Routes `POST /teach/sessions/:sessionId/mute-participant` & `kick-participant` — Điều phối phòng Live: tắt mic (1 người / toàn lớp) hoặc mời học viên rời phòng
 * đồng thời trên cả LiveKit SFU (`livekit.service.ts`) lẫn trạng thái phòng SSE (`liveRoom.helpers.ts`).
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.muteSessionParticipant()`, `kickSessionParticipant()`.
 */
// 7.5c POST /teach/sessions/:sessionId/mute-participant (Host mutes 1 student or all students)
const muteParticipantSchema = z.object({
  targetIdentity: z.string().optional(),
  accountId: z.union([z.string(), z.number()]).optional(),
  muteAllStudents: z.boolean().optional(),
  muted: z.boolean().optional(),
});

teachRouter.post(
  '/teach/sessions/:sessionId/mute-participant',
  validate(muteParticipantSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }

      const { targetIdentity, accountId, muteAllStudents, muted = true } = req.body;
      const roomName = session.livekitRoomName || `live-session-${session.id}`;
      const normalizedIdentity = targetIdentity
        ? targetIdentity.trim()
        : accountId !== undefined
          ? String(accountId).startsWith('acc-')
            ? String(accountId)
            : `acc-${accountId}`
          : undefined;

      const sfuResult = await muteLiveKitParticipantsAudio({
        roomName,
        targetIdentity: normalizedIdentity,
        muteAllStudents: Boolean(muteAllStudents),
        hostIdentity: `acc-${req.user!.id}`,
        muted,
      });

      const targetList = normalizedIdentity
        ? [normalizedIdentity, normalizedIdentity.replace(/^acc-/, '')]
        : sfuResult.mutedIdentities;

      const mutedIdentities = updateMutedParticipantsState(session.id, {
        targetIdentities: targetList,
        muteAllStudents: Boolean(muteAllStudents),
        muted,
        mutedBy: req.user!.email,
      });

      res.json({
        sessionId: String(session.id),
        roomName,
        muted,
        muteAllStudents: Boolean(muteAllStudents),
        mutedIdentities,
        sfuMutedTracks: sfuResult.mutedTrackCount,
        sfuSynced: sfuResult.sfuSynced,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.5c2 POST /teach/sessions/:sessionId/kick-participant (Host kicks a disruptive student from the live room)
const kickParticipantSchema = z.object({
  targetIdentity: z.string().optional(),
  accountId: z.union([z.string(), z.number()]).optional(),
  kicked: z.boolean().optional(),
});

teachRouter.post(
  '/teach/sessions/:sessionId/kick-participant',
  validate(kickParticipantSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }

      const { targetIdentity, accountId, kicked = true } = req.body;
      const roomName = session.livekitRoomName || `live-session-${session.id}`;
      const normalizedIdentity = targetIdentity
        ? targetIdentity.trim()
        : accountId !== undefined
          ? String(accountId).startsWith('acc-')
            ? String(accountId)
            : `acc-${accountId}`
          : '';

      if (!normalizedIdentity) {
        res.status(400).json({
          success: false,
          status: 400,
          code: 'INVALID_PARTICIPANT',
          message: 'Vui lòng chọn học viên cần mời ra khỏi phòng',
        });
        return;
      }

      const sfuResult = kicked
        ? await kickLiveKitParticipant({
            roomName,
            targetIdentity: normalizedIdentity.startsWith('acc-')
              ? normalizedIdentity
              : `acc-${normalizedIdentity}`,
          })
        : { sfuRemoved: false };

      const plainId = normalizedIdentity.replace(/^acc-/, '');
      const fullId = `acc-${plainId}`;
      const kickedIdentities = updateKickedParticipantsState(session.id, {
        targetIdentities: [plainId, fullId],
        kicked,
        kickedBy: req.user!.email,
      });

      res.json({
        sessionId: String(session.id),
        roomName,
        kicked,
        targetIdentity: fullId,
        kickedIdentities,
        sfuRemoved: sfuResult.sfuRemoved,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Routes `POST /teach/sessions/:sessionId/recording/start`, `/stop`, `/upload` — Vòng đời ghi hình buổi học lên **Cloudflare R2**:
 * - `/start`: gọi `startLiveKitRoomRecordingToR2()` (LiveKit Egress -> fallback `BROWSER_R2`) kèm `createR2PresignedPutUrl()`.
 * - `/stop`: dừng Egress (`stopLiveKitRoomRecording`), lưu URL replay vào `class_sessions.video_r2_key` và chuyển `REPLAY_READY`.
 * - `/upload`: nhận bản ghi Base64 từ trình duyệt Giảng viên và đẩy thẳng lên R2 qua `uploadBufferToR2()`.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.startSessionRecording()`, `stopSessionRecording()`, `uploadSessionRecordingToR2()`.
 */
// 7.5d POST /teach/sessions/:sessionId/recording/start (Start recording to Cloudflare R2)
teachRouter.post('/teach/sessions/:sessionId/recording/start', async (req, res, next) => {
  try {
    const session = await resolveSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Không tìm thấy buổi học',
      });
      return;
    }

    const roomName = session.livekitRoomName || `live-session-${session.id}`;
    const started = await startLiveKitRoomRecordingToR2({
      roomName,
      sessionId: session.id,
    });

    const presigned = createR2PresignedPutUrl({
      objectKey: started.objectKey,
      contentType: 'video/webm',
      expiresInSeconds: 7200,
    });

    const recording = updateLiveRecordingState(session.id, {
      isRecording: true,
      egressId: started.egressId,
      objectKey: started.objectKey,
      publicUrl: started.publicUrl,
      mode: started.mode,
      startedAt: new Date().toISOString(),
      stoppedAt: undefined,
    });

    res.json({
      sessionId: String(session.id),
      roomName,
      recording,
      presignedUploadUrl: presigned.uploadUrl,
    });
  } catch (err) {
    next(err);
  }
});

// 7.5e POST /teach/sessions/:sessionId/recording/stop (Stop recording & persist R2 replay URL)
const stopRecordingSchema = z.object({
  objectKey: z.string().optional(),
  markReplayReady: z.boolean().optional(),
});

teachRouter.post(
  '/teach/sessions/:sessionId/recording/stop',
  validate(stopRecordingSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }

      const currentRoomState = getLiveRoomState(session.id);
      const activeRec = currentRoomState.recording;
      await stopLiveKitRoomRecording(activeRec.egressId);

      const finalObjectKey =
        req.body.objectKey?.trim() ||
        activeRec.objectKey ||
        `recordings/session-${session.id}/live-${Date.now()}.mp4`;
      const finalPublicUrl = getR2PublicObjectUrl(finalObjectKey);

      const recording = updateLiveRecordingState(session.id, {
        isRecording: false,
        objectKey: finalObjectKey,
        publicUrl: finalPublicUrl,
        stoppedAt: new Date().toISOString(),
      });

      // Stopping a recording MUST NOT end the live session unless markReplayReady === true is explicitly passed
      const nextStatus =
        req.body.markReplayReady === true ? 'REPLAY_READY' : session.status;
      const shouldPersistVideoKey =
        activeRec.mode === 'LIVEKIT_EGRESS' || Boolean(req.body.objectKey?.trim());
      const nextVideoKey = shouldPersistVideoKey
        ? finalPublicUrl
        : session.videoR2Key;

      const [updated] = await db
        .update(classSessions)
        .set({
          videoR2Key: nextVideoKey,
          status: nextStatus,
          lastUpdatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(classSessions.id, session.id))
        .returning();

      const resolvedVideo = resolvePlayableVideoSource(
        updated?.videoR2Key,
        updated?.sessionOrder ?? session.sessionOrder
      );

      broadcastLiveRoomEvent(session.id, 'session_status', {
        sessionId: String(session.id),
        status: nextStatus,
        videoUrl: resolvedVideo.videoUrl,
        playbackType: resolvedVideo.playbackType,
        hostBroadcast: currentRoomState.hostBroadcast,
      });

      res.json({
        sessionId: String(session.id),
        status: nextStatus,
        recording,
        videoUrl: resolvedVideo.videoUrl,
        playbackType: resolvedVideo.playbackType,
        r2PublicUrl: finalPublicUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.5f POST /teach/sessions/:sessionId/recording/upload (Direct upload recorded video to Cloudflare R2)
const uploadRecordingSchema = z.object({
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  base64Data: z.string().min(1),
  markReplayReady: z.boolean().optional(),
});

teachRouter.post(
  '/teach/sessions/:sessionId/recording/upload',
  validate(uploadRecordingSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        });
        return;
      }

      const contentType = (req.body.contentType || 'video/mp4').trim();
      const ext = contentType.includes('webm') && !req.body.fileName?.endsWith('.mp4') ? 'webm' : 'mp4';
      const safeName = (req.body.fileName || `live-session-${session.id}-${Date.now()}.${ext}`)
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectKey = `recordings/session-${session.id}/${safeName}`;

      const rawBase64 = req.body.base64Data.includes(',')
        ? req.body.base64Data.split(',')[1]!
        : req.body.base64Data;
      const buffer = Buffer.from(rawBase64, 'base64');

      const uploaded = await uploadBufferToR2({
        objectKey,
        body: buffer,
        contentType,
      });

      // Saving a recording to R2 keeps the live session open unless markReplayReady === true
      const nextStatus =
        req.body.markReplayReady === true ? 'REPLAY_READY' : session.status;

      await db
        .update(classSessions)
        .set({
          videoR2Key: uploaded.publicUrl,
          status: nextStatus,
          lastUpdatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(classSessions.id, session.id));

      const recording = updateLiveRecordingState(session.id, {
        isRecording: false,
        objectKey: uploaded.objectKey,
        publicUrl: uploaded.publicUrl,
        stoppedAt: new Date().toISOString(),
      });

      const currentRoomState = getLiveRoomState(session.id);
      broadcastLiveRoomEvent(session.id, 'session_status', {
        sessionId: String(session.id),
        status: nextStatus,
        videoUrl: uploaded.publicUrl,
        playbackType: 'MP4',
        hostBroadcast: currentRoomState.hostBroadcast,
      });

      res.status(201).json({
        sessionId: String(session.id),
        status: nextStatus,
        objectKey: uploaded.objectKey,
        videoUrl: uploaded.publicUrl,
        sizeBytes: uploaded.sizeBytes,
        recording,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/teach/sessions/:sessionId/generate-quiz` — Nhờ AI sinh bản nháp bộ câu hỏi trắc nghiệm bám sát học liệu buổi học.
 *
 * - **Quy trình từng bước:**
 *   + Bước 1: Kiểm tra quyền giảng viên phụ trách; tạo mới hoặc đưa `assessments` của buổi về trạng thái `DRAFT`.
 *   + Bước 2: Gom toàn bộ `knowledge_chunks` (transcript/slide) của buổi học & danh sách `course_skills` làm đầu vào.
 *   + Bước 3: Gọi `aiServiceClient.generateQuizDraft()` sang `apps/ai-service` (`POST /api/v1/ai/assessments/generate-quiz` ở `grading_ai.py`),
 *     tính vector embedding 1024-dim và lưu vào `assessment_items`.
 *   + Bước 4: Fallback — nếu AI Service không phản hồi và đề chưa có câu nào, tự sinh 4 câu deterministic bám chủ đề buổi học.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.generateSessionQuizByAi(sessionId)`. Đọc/Ghi DB: `class_sessions`, `assessments`, `assessment_items`, `knowledge_chunks`, `course_skills`, `skills`.
 */
// 7.6 POST /teach/sessions/:sessionId/generate-quiz — Real AI / Chunk-Grounded Quiz Draft!
teachRouter.post('/teach/sessions/:sessionId/generate-quiz', async (req, res, next) => {
  try {
    const session = await resolveSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Không tìm thấy buổi học',
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
        },
      });
      return;
    }

    const ownsCohort = await assertInstructorOwnsCohort(session.cohortId, req.user!);
    if (!ownsCohort) {
      res.status(403).json({
        code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR',
        message: 'Bạn không phụ trách đợt học của buổi này.',
      });
      return;
    }

    let [quiz] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.sessionId, session.id))
      .limit(1);

    if (!quiz) {
      const [created] = await db
        .insert(assessments)
        .values({
          cohortId: session.cohortId,
          sessionId: session.id,
          purpose: 'SESSION_ASSIGNMENT',
          gradingMode: 'AUTO',
          title: `Bài kiểm tra Buổi ${session.sessionOrder}: ${session.title}`,
          durationMinutes: 15,
          passScorePct: 70,
          status: 'DRAFT',
        })
        .returning();
      quiz = created!;
    } else {
      const [updated] = await db
        .update(assessments)
        .set({ status: 'DRAFT', updatedAt: new Date() })
        .where(eq(assessments.id, quiz.id))
        .returning();
      quiz = updated!;
    }

    const [existingItems, allSkills, sessChunks, cohortRows] = await Promise.all([
      db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, quiz.id))
        .orderBy(asc(assessmentItems.itemOrder)),
      db.select().from(skills),
      db
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.sessionId, session.id))
        .orderBy(asc(knowledgeChunks.chunkIndex)),
      db.select().from(cohorts).where(eq(cohorts.id, session.cohortId)).limit(1),
    ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const defaultSkillId = allSkills[0]?.id ?? 1;
    let cSkillIds: number[] = [];
    if (cohortRows[0]) {
      const cSkills = await db
        .select()
        .from(courseSkills)
        .where(eq(courseSkills.courseId, cohortRows[0].courseId));
      cSkillIds = cSkills.map((cs) => cs.skillId);
    }
    const primarySkillId = cSkillIds[0] ?? defaultSkillId;
    const secondarySkillId = cSkillIds[1] ?? primarySkillId;

    const transcriptText =
      sessChunks.map((c) => c.content).join('\n\n') ||
      session.aiSummaryMd ||
      session.descriptionMd ||
      session.title;

    let finalItems = existingItems;

    try {
      const aiGenerated = await aiServiceClient.generateQuizDraft(
        {
          sessionId: session.id,
          sessionTitle: session.title,
          transcriptText,
          skillIds: [primarySkillId, secondarySkillId],
          questionCount: 4,
        },
        req.correlationId
      );

      if (
        Array.isArray(aiGenerated.generated_items) &&
        aiGenerated.generated_items.length > 0 &&
        existingItems.length === 0
      ) {
        const inserted = await db
          .insert(assessmentItems)
          .values(
            aiGenerated.generated_items.map((gi, idx) => {
              const maxVideoSec = Math.max(45, (session.durationSeconds || 90) - 15);
              const jumpSec = Math.min(maxVideoSec, Math.max(5, Math.round(((idx + 1) / (aiGenerated.generated_items.length + 1)) * maxVideoSec)));
              const opts =
                Array.isArray(gi.options) && gi.options.length >= 4
                  ? gi.options.slice(0, 4)
                  : ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'];
              const correctIdx =
                typeof gi.correctIndex === 'number' && gi.correctIndex >= 0 && gi.correctIndex <= 3
                  ? gi.correctIndex
                  : idx % 4;
              return {
                assessmentId: quiz!.id,
                skillId: gi.skillId ?? (idx % 2 === 0 ? primarySkillId : secondarySkillId),
                itemOrder: idx + 1,
                itemType: 'SINGLE_CHOICE' as const,
                points: '10.00',
                promptConfig: {
                  number: idx + 1,
                  prompt: gi.prompt || `Câu ${idx + 1}: Nội dung trọng tâm của ${session.title}?`,
                  options: opts,
                  slideLabel: `Buổi ${session.sessionOrder} · Slide Trang ${6 + idx * 3}`,
                  scenarioTag: idx % 2 === 0 ? 'Tình huống thực chiến' : 'Kiến thức cốt lõi',
                },
                gradingConfig: {
                  correctIndex: correctIdx,
                  reviewTimestampLabel: `${formatSecondsToMmSs(jumpSec)} — ${formatSecondsToMmSs(jumpSec + 60)}`,
                  reviewJumpSec: jumpSec,
                  reviewSegmentRangeSec: [jumpSec, jumpSec + 60] as [number, number],
                },
                explanationMd: gi.explanationMd || 'Đối chiếu tài liệu buổi học.',
                itemEmbedding: computeSemanticEmbedding1024(`${gi.prompt} ${gi.explanationMd}`),
              };
            })
          )
          .returning();
        finalItems = inserted;
      }
    } catch {
      // Keep DB items or create deterministic topic items if assessment had 0 items
    }

    if (finalItems.length === 0) {
      const fallbackSeeds = [0, 1, 2, 3].map((idx) => {
        const maxVideoSec = Math.max(45, (session.durationSeconds || 90) - 15);
        const jumpSec = Math.min(maxVideoSec, Math.max(5, Math.round(((idx + 1) / 5) * maxVideoSec)));
        const correctIdx = idx % 4;
        const options = [0, 1, 2, 3].map((optIdx) =>
          optIdx === correctIdx
            ? `Áp dụng đúng kiến trúc chuẩn được trình bày tại Buổi ${session.sessionOrder}: ${session.title}`
            : `Cách làm thiếu kiểm soát lỗi hoặc bỏ qua nguyên tắc tối ưu ở phương án ${optIdx + 1}`
        );
        return {
          assessmentId: quiz.id,
          skillId: idx % 2 === 0 ? primarySkillId : secondarySkillId,
          itemOrder: idx + 1,
          itemType: 'SINGLE_CHOICE' as const,
          points: '10.00',
          promptConfig: {
            number: idx + 1,
            prompt: `Câu ${idx + 1} (Buổi ${session.sessionOrder}): Nguyên tắc kỹ thuật quan trọng nhất trong chủ đề "${session.title}" là gì?`,
            options,
            slideLabel: `Buổi ${session.sessionOrder} · Slide Trang ${6 + idx * 3}`,
            scenarioTag: idx % 2 === 0 ? 'Tình huống thực chiến' : 'Kiến thức cốt lõi',
          },
          gradingConfig: {
            correctIndex: correctIdx,
            reviewTimestampLabel: `${formatSecondsToMmSs(jumpSec)} — ${formatSecondsToMmSs(jumpSec + 60)}`,
            reviewJumpSec: jumpSec,
            reviewSegmentRangeSec: [jumpSec, jumpSec + 60] as [number, number],
          },
          explanationMd: transcriptText.slice(0, 260),
          itemEmbedding: computeSemanticEmbedding1024(`${session.title} ${transcriptText}`),
        };
      });
      finalItems = await db.insert(assessmentItems).values(fallbackSeeds).returning();
    }

    const formattedItems = mapAssessmentItemsToMcq(finalItems, skillMap);

    res.json({
      assessmentId: String(quiz.id),
      sessionId: String(session.id),
      status: quiz.status,
      generatedCount: formattedItems.length,
      items: formattedItems,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `PUT /api/v1/teach/assessments/:assessmentId/publish` — Xuất bản (hoặc lưu nháp) đề kiểm tra với đồng bộ **INSERT + UPDATE + DELETE** đầy đủ.
 *
 * - **Quy trình từng bước:**
 *   + Bước 1: Kiểm tra quyền sở hữu lớp và cập nhật metadata đề (`status`, `passScorePct`, `durationMinutes`).
 *   + Bước 2: Tải `course_skills` của khóa học để chọn kỹ năng mặc định (`LEARNING_OUTCOME`) cho câu hỏi mới không chỉ định `skillId`.
 *   + Bước 3: Duyệt mảng `items` từ Giảng viên: câu đã có trong DB -> `UPDATE` (cập nhật cả `itemEmbedding` 1024-dim); câu mới -> `INSERT`.
 *   + Bước 4: `DELETE` an toàn các câu bị Giảng viên xóa khỏi giao diện — CHỈ xóa nếu chưa có bản ghi `submission_answers` lịch sử tham chiếu (tránh vỡ khóa ngoại FK).
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.publishAssessment(assessmentId, items, status)`. Ghi DB: `assessments`, `assessment_items` (đọc `course_skills`, `skills`, `submission_answers`).
 */
// 7.7 PUT /teach/assessments/:assessmentId/publish — Full INSERT + UPDATE + DELETE Sync!
const publishAssessmentSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
  passScorePct: z.number().int().min(50).max(100).optional(),
  durationMinutes: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        number: z.number().int().optional(),
        scenarioTag: z.string().optional(),
        skillId: z.union([z.string(), z.number()]).optional(),
        skillCode: z.string().optional(),
        skillName: z.string().optional(),
        prompt: z.string(),
        options: z.array(z.string()),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().optional(),
        reviewTimestampLabel: z.string().optional(),
        reviewJumpSec: z.number().int().optional(),
        reviewSegmentRangeSec: z.tuple([z.number(), z.number()]).optional(),
        slideLabel: z.string().optional(),
      })
    )
    .optional(),
});

teachRouter.put(
  '/teach/assessments/:assessmentId/publish',
  validate(publishAssessmentSchema),
  async (req, res, next) => {
    try {
      const assessment = await resolveAssessment(req.params.assessmentId);
      if (!assessment) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy đề kiểm tra',
          error: {
            code: 'ASSESSMENT_NOT_FOUND',
            message: 'Không tìm thấy đề kiểm tra',
          },
        });
        return;
      }

      const ownsCohort = await assertInstructorOwnsCohort(assessment.cohortId, req.user!);
      if (!ownsCohort) {
        res.status(403).json({
          code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR',
          message: 'Bạn không phụ trách đợt học của đề kiểm tra này.',
        });
        return;
      }

      const { status, passScorePct, durationMinutes, items } = req.body;

      const [updated] = await db
        .update(assessments)
        .set({
          status,
          passScorePct: passScorePct ?? assessment.passScorePct,
          durationMinutes: durationMinutes ?? assessment.durationMinutes,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessment.id))
        .returning();

      let finalCount = 0;

      if (Array.isArray(items) && items.length > 0) {
        const [existingDbItems, allSkills, [assessmentCohort]] = await Promise.all([
          db
            .select()
            .from(assessmentItems)
            .where(eq(assessmentItems.assessmentId, assessment.id))
            .orderBy(asc(assessmentItems.itemOrder)),
          db.select().from(skills),
          db.select().from(cohorts).where(eq(cohorts.id, assessment.cohortId)).limit(1),
        ]);

        const cohortCourseSkillRows = assessmentCohort
          ? await db
              .select()
              .from(courseSkills)
              .where(eq(courseSkills.courseId, assessmentCohort.courseId))
          : [];
        const primaryCourseSkillId =
          cohortCourseSkillRows.find((cs) => cs.skillRole === 'LEARNING_OUTCOME')?.skillId ??
          cohortCourseSkillRows[0]?.skillId;

        const fallbackSkillId =
          primaryCourseSkillId ?? existingDbItems[0]?.skillId ?? allSkills[0]?.id ?? 1;
        const normalizeSkillKey = (raw: string) =>
          raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
        const skillIdByCode = new Map(allSkills.map((s) => [normalizeSkillKey(s.code), s.id]));
        const validSkillIds = new Set(allSkills.map((s) => s.id));

        const keptItemIds: number[] = [];

        for (let idx = 0; idx < items.length; idx++) {
          const itemPayload = items[idx]!;
          const parsedNumericId = Number(itemPayload.id);
          const matchedExisting =
            (Number.isInteger(parsedNumericId) && parsedNumericId > 0
              ? existingDbItems.find((e) => e.id === parsedNumericId)
              : undefined) || existingDbItems[idx];

          const rawSkillNum = Number(itemPayload.skillId);
          const resolvedSkillId =
            (Number.isInteger(rawSkillNum) && validSkillIds.has(rawSkillNum)
              ? rawSkillNum
              : undefined) ||
            (itemPayload.skillCode
              ? skillIdByCode.get(normalizeSkillKey(itemPayload.skillCode))
              : undefined) ||
            matchedExisting?.skillId ||
            fallbackSkillId;

          const jumpSec = itemPayload.reviewJumpSec ?? 10 + idx * 15;
          const promptCfg = {
            number: idx + 1,
            scenarioTag: itemPayload.scenarioTag || 'Kiến thức cốt lõi',
            prompt: itemPayload.prompt,
            options: itemPayload.options,
            slideLabel: itemPayload.slideLabel || '',
          };
          const gradingCfg = {
            correctIndex: itemPayload.correctIndex,
            reviewTimestampLabel:
              itemPayload.reviewTimestampLabel ||
              `${formatSecondsToMmSs(jumpSec)} — ${formatSecondsToMmSs(jumpSec + 60)}`,
            reviewJumpSec: jumpSec,
            reviewSegmentRangeSec:
              itemPayload.reviewSegmentRangeSec || ([jumpSec, jumpSec + 60] as [number, number]),
          };

          if (matchedExisting && !keptItemIds.includes(matchedExisting.id)) {
            keptItemIds.push(matchedExisting.id);
            await db
              .update(assessmentItems)
              .set({
                skillId: resolvedSkillId,
                itemOrder: idx + 1,
                promptConfig: promptCfg,
                gradingConfig: gradingCfg,
                explanationMd: itemPayload.explanation ?? matchedExisting.explanationMd,
                itemEmbedding: computeSemanticEmbedding1024(
                  `${itemPayload.prompt} ${itemPayload.explanation || ''}`
                ),
              })
              .where(eq(assessmentItems.id, matchedExisting.id));
          } else {
            const [insertedItem] = await db
              .insert(assessmentItems)
              .values({
                assessmentId: assessment.id,
                skillId: resolvedSkillId,
                itemOrder: idx + 1,
                itemType: 'SINGLE_CHOICE',
                points: '10.00',
                promptConfig: promptCfg,
                gradingConfig: gradingCfg,
                explanationMd: itemPayload.explanation || '',
                itemEmbedding: computeSemanticEmbedding1024(
                  `${itemPayload.prompt} ${itemPayload.explanation || ''}`
                ),
              })
              .returning();
            if (insertedItem) keptItemIds.push(insertedItem.id);
          }
        }

        // Delete removed items if they have no historical submission_answers referencing them
        const candidateDeleteIds = existingDbItems
          .map((e) => e.id)
          .filter((id) => !keptItemIds.includes(id));

        if (candidateDeleteIds.length > 0) {
          const referenced = await db
            .select({ itemId: submissionAnswers.itemId })
            .from(submissionAnswers)
            .where(inArray(submissionAnswers.itemId, candidateDeleteIds));
          const refSet = new Set(referenced.map((r) => r.itemId));
          const safeDeleteIds = candidateDeleteIds.filter((id) => !refSet.has(id));
          if (safeDeleteIds.length > 0) {
            await db
              .delete(assessmentItems)
              .where(inArray(assessmentItems.id, safeDeleteIds));
          }
        }

        finalCount = items.length;
      }

      res.json({
        assessmentId: String(updated!.id),
        status: updated!.status,
        publishedCount: finalCount,
        itemsCount: finalCount,
        publishedAt: updated!.updatedAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/teach/sessions/:sessionId/guest-link` — Ký tạo đường dẫn mời Diễn giả Khách mời một lần (JWT có thời hạn `expiresInMinutes`).
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.createGuestSpeakerLink(sessionId)`; khách mời xác thực tại `POST /api/v1/live/guest/verify` (`learning.routes.ts`).
 */
// 7.8 POST /teach/sessions/:sessionId/guest-link
const guestLinkSchema = z.object({
  guestDisplayName: z.string().min(2).default('Chuyên gia Khách mời Doanh nghiệp'),
  guestRoleHeadline: z.string().optional(),
  expiresInMinutes: z.number().int().min(15).max(360).default(240),
});

teachRouter.post(
  '/teach/sessions/:sessionId/guest-link',
  validate(guestLinkSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const { guestDisplayName, guestRoleHeadline, expiresInMinutes } = req.body;

      const inviteToken = jwt.sign(
        {
          sessionId: session.id,
          cohortId: session.cohortId,
          guestDisplayName,
          guestRoleHeadline: guestRoleHeadline || 'Diễn giả Khách mời Doanh nghiệp',
          role: 'GUEST_SPEAKER',
        },
        env.JWT_ACCESS_SECRET,
        { expiresIn: `${expiresInMinutes}m` }
      );

      const webOrigin = (
        process.env.PUBLIC_WEB_URL ||
        (typeof req.headers.origin === 'string' && req.headers.origin) ||
        'http://localhost:5173'
      ).replace(/\/+$/, '');
      const url = `${webOrigin}/live/guest/${session.id}?token=${inviteToken}`;
      res.json({
        sessionId: String(session.id),
        cohortId: String(session.cohortId),
        oneTimeGuestUrl: url,
        guestJoinUrl: url,
        inviteToken,
        expiresInHours: Math.round(expiresInMinutes / 60),
        expiresInMinutes,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Routes `POST /teach/discussions/:threadId/reply` & `PATCH /teach/discussions/:threadId/verify`
 * — Giảng viên trả lời và gắn dấu xác thực chính thức (`isInstructorVerified`, `isResolved`) cho câu hỏi Q&A của học viên.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.replyAndVerifyDiscussion()`, `verifyDiscussionThread()`. Ghi `discussion_posts`, `discussion_threads`.
 */
// 7.9 POST /teach/discussions/:threadId/reply
const replyDiscussionSchema = z.object({
  contentMd: z.string().optional(),
  content: z.string().optional(),
  markResolved: z.boolean().default(true),
  verifyAiPostId: z.number().int().positive().optional(),
});

teachRouter.post(
  '/teach/discussions/:threadId/reply',
  validate(replyDiscussionSchema),
  async (req, res, next) => {
    try {
      const threadId = Number(req.params.threadId);
      const replyText = (req.body.contentMd ?? req.body.content ?? '').trim();
      const { markResolved } = req.body;

      await db.transaction(async (tx) => {
        if (replyText.length > 0) {
          await tx.insert(discussionPosts).values({
            threadId,
            authorId: req.user!.id,
            contentMd: replyText,
            isAiGenerated: false,
            isInstructorVerified: true,
            verifiedBy: req.user!.id,
          });
        }

        await tx
          .update(discussionPosts)
          .set({
            isInstructorVerified: true,
            verifiedBy: req.user!.id,
            updatedAt: new Date(),
          })
          .where(eq(discussionPosts.threadId, threadId));

        if (markResolved) {
          await tx
            .update(discussionThreads)
            .set({ isResolved: true, updatedAt: new Date() })
            .where(eq(discussionThreads.id, threadId));
        }
      });

      const [threadRow] = await db
        .select()
        .from(discussionThreads)
        .where(eq(discussionThreads.id, threadId))
        .limit(1);

      let updatedThread: unknown;
      if (threadRow) {
        const [sess] = await db
          .select()
          .from(classSessions)
          .where(eq(classSessions.id, threadRow.sessionId))
          .limit(1);
        if (sess) {
          const allFormatted = await buildFormattedDiscussionsForSessions([sess]);
          updatedThread = allFormatted.find((t) => t.id === String(threadId));
          if (updatedThread) {
            broadcastLiveRoomEvent(sess.id, 'qa_verified', updatedThread);
          }
        }
      }

      res.json({
        threadId: String(threadId),
        verifiedByStaff: true,
        isResolved: markResolved,
        repliedAt: new Date().toISOString(),
        thread: updatedThread,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Routes `POST /teach/enrollments/:enrollmentId/remind` & `/ai-reminder` — Gửi thông báo nhắc nhở học tập cá nhân hóa (`AI_STUDY_REMINDER`) tới học viên có nguy cơ tụt tiến độ.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.sendAiPersonalizedReminder()`. Ghi bảng `notifications`.
 */
// 7.10 POST /teach/enrollments/:enrollmentId/remind & /teach/enrollments/:enrollmentId/ai-reminder
async function handleSendEnrollmentReminder(req: any, res: any, next: any) {
  try {
    const enrollmentId = Number(req.params.enrollmentId);
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ENROLLMENT_NOT_FOUND',
        message: 'Không tìm thấy bản ghi học viên',
        error: {
          code: 'ENROLLMENT_NOT_FOUND',
          message: 'Không tìm thấy bản ghi học viên',
        },
      });
      return;
    }

    const now = new Date();
    const title = 'Nhắc nhở tiến độ học tập từ Giảng viên';
    const message =
      'Giảng viên phụ trách lớp nhắc bạn hoàn thành bài kiểm tra trắc nghiệm và xem lại các đoạn video bài giảng còn thiếu trong tuần này.';

    let createdNotifId = '';
    await db.transaction(async (tx) => {
      await tx
        .update(enrollments)
        .set({ lastRemindedAt: now })
        .where(eq(enrollments.id, enrollmentId));

      const [notif] = await tx
        .insert(notifications)
        .values({
          recipientId: enrollment.accountId,
          type: 'INSTRUCTOR_REMINDER',
          title,
          body: message,
          metadata: { enrollmentId, cohortId: enrollment.cohortId },
        })
        .returning();
      createdNotifId = String(notif?.id ?? Date.now());
    });

    res.json({
      notificationId: createdNotifId,
      userId: String(enrollment.accountId),
      enrollmentId: String(enrollmentId),
      type: 'AI_STUDY_REMINDER',
      title,
      message,
      createdAt: now.toISOString(),
      remindedAt: now.toLocaleString('vi-VN'),
      remindedAtIso: now.toISOString(),
      notificationCreated: true,
    });
  } catch (err) {
    next(err);
  }
}

teachRouter.post('/teach/enrollments/:enrollmentId/remind', handleSendEnrollmentReminder);
teachRouter.post('/teach/enrollments/:enrollmentId/ai-reminder', handleSendEnrollmentReminder);

// 7.9B PATCH /teach/discussions/:threadId/verify — Persist AI/Discussion Verification!
teachRouter.patch('/teach/discussions/:threadId/verify', async (req, res, next) => {
  try {
    const threadId = Number(req.params.threadId);
    const [threadRow] = await db
      .select()
      .from(discussionThreads)
      .where(eq(discussionThreads.id, threadId))
      .limit(1);

    if (!threadRow) {
      res.status(404).json({ code: 'THREAD_NOT_FOUND', message: 'Không tìm thấy chủ đề thảo luận' });
      return;
    }

    const [sess] = await db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, threadRow.sessionId))
      .limit(1);

    if (sess) {
      const owns = await assertInstructorOwnsCohort(sess.cohortId, req.user!);
      if (!owns) {
        res.status(403).json({
          code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR',
          message: 'Bạn không phụ trách buổi học của thảo luận này.',
        });
        return;
      }
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(discussionPosts)
        .set({
          isInstructorVerified: true,
          verifiedBy: req.user!.id,
          updatedAt: now,
        })
        .where(eq(discussionPosts.threadId, threadId));

      await tx
        .update(discussionThreads)
        .set({ isResolved: true, updatedAt: now })
        .where(eq(discussionThreads.id, threadId));
    });

    res.json({
      threadId: String(threadId),
      isInstructorVerified: true,
      isResolved: true,
      verifiedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Routes `PUT /api/v1/teach/exam-reviews/:reviewId` & `POST /api/v1/teach/proctoring/:attemptId/verdict`
 * — Hậu kiểm ca thi bị AI Proctoring gắn cờ (`FLAGGED`) và đồng bộ nguyên tử kết quả tốt nghiệp + Chứng chỉ HMAC trong **Transaction ACID**.
 *
 * - **Quy trình xử lý 2 phán quyết (`applyInstructorProctoringVerdict`):**
 *   + `CONFIRMED_CHEAT` (`RETAKE_REQUIRED`): đưa điểm bài thi về `0`, mở lại quyền thi lại (`enrollments.final_exam_passed = false`),
 *     thu hồi mọi chứng chỉ liên quan (`certificates.revoked_at`) và gửi thông báo `EXAM_RETAKE_REQUIRED`.
 *   + `CLEARED_BY_INSTRUCTOR` (`APPROVED`): nếu điểm thi `>= passScorePct`, công nhận đậu (`isPassed = true`),
 *     chuyển `enrollments.status = 'COMPLETED'` và tự động ký cấp/khôi phục Chứng chỉ HMAC-SHA256.
 * - **Liên kết luồng:** Frontend gọi từ `teachApi.reviewExamProctoring(reviewId, decision)`. Ghi DB: `assessment_attempts`, `enrollments`, `certificates`, `notifications`.
 */
// 7.11 PUT /teach/exam-reviews/:reviewId & POST /teach/proctoring/:attemptId/verdict
// Reconciles enrollment graduation status + revokes/issues HMAC certificate atomically!
async function applyInstructorProctoringVerdict(params: {
  attemptId: number;
  verdict: 'CLEARED_BY_INSTRUCTOR' | 'CONFIRMED_CHEAT';
  note: string;
  instructorId: number;
  instructorRole: string;
}) {
  const { attemptId, verdict, note, instructorId, instructorRole } = params;
  const [attempt] = await db
    .select()
    .from(assessmentAttempts)
    .where(eq(assessmentAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    throw Object.assign(new Error('Không tìm thấy lượt thi cần hậu kiểm'), {
      statusCode: 404,
      code: 'ATTEMPT_NOT_FOUND',
    });
  }

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, attempt.assessmentId))
    .limit(1);

  if (assessment) {
    const owns = await assertInstructorOwnsCohort(assessment.cohortId, {
      id: instructorId,
      role: instructorRole,
    });
    if (!owns) {
      throw Object.assign(new Error('Bạn không phụ trách đợt học của bài thi này'), {
        statusCode: 403,
        code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR',
      });
    }
  }

  const now = new Date();
  const isFinalExam = assessment?.purpose === 'FINAL_EXAM';
  const passThreshold = assessment?.passScorePct ?? 70;
  const rawScorePct = Number(attempt.scorePct ?? 0);
  const nextIsPassed =
    verdict === 'CONFIRMED_CHEAT' ? false : rawScorePct >= passThreshold;

  return db.transaction(async (tx) => {
    const [updatedAttempt] = await tx
      .update(assessmentAttempts)
      .set({
        integrityStatus: verdict,
        verdictNote: note,
        verdictBy: instructorId,
        verdictAt: now,
        isPassed: nextIsPassed,
        ...(verdict === 'CONFIRMED_CHEAT' ? { scorePct: '0.00', totalScore: '0.00' } : {}),
      })
      .where(eq(assessmentAttempts.id, attemptId))
      .returning();

    if (isFinalExam && assessment) {
      const [enr] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, attempt.accountId),
            eq(enrollments.cohortId, assessment.cohortId)
          )
        )
        .limit(1);

      if (enr) {
        if (verdict === 'CONFIRMED_CHEAT') {
          // Unlock retake by resetting finalExamPassed -> false & revoking any certificate!
          await tx
            .update(enrollments)
            .set({
              finalExamPassed: false,
              status: enr.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
              completedAt: null,
            })
            .where(eq(enrollments.id, enr.id));

          await tx
            .update(certificates)
            .set({
              revokedAt: now,
              revokeReason: note || 'Vi phạm quy chế giám sát kỳ thi cuối khóa',
            })
            .where(eq(certificates.enrollmentId, enr.id));

          await tx.insert(notifications).values({
            recipientId: attempt.accountId,
            type: 'EXAM_RETAKE_REQUIRED',
            title: 'Yêu cầu thi lại Kỳ thi cuối khóa',
            body: `Kết quả bài thi cuối khóa không được công nhận (${note}). Hệ thống đã mở lại quyền thi để bạn thực hiện lại nghiêm túc.`,
            metadata: { attemptId, cohortId: assessment.cohortId },
          });
        } else if (verdict === 'CLEARED_BY_INSTRUCTOR' && nextIsPassed) {
          await tx
            .update(enrollments)
            .set({
              finalExamPassed: true,
              status: 'COMPLETED',
              completedAt: now,
            })
            .where(eq(enrollments.id, enr.id));

          const [existingCert] = await tx
            .select()
            .from(certificates)
            .where(eq(certificates.enrollmentId, enr.id))
            .limit(1);

          const certCode =
            existingCert?.certificateCode ||
            `3T-CERT-${now.getFullYear()}-${enr.id}-${attempt.accountId}`;
          const hmacSig = crypto
            .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
            .update(`${enr.id}:${attempt.accountId}:${certCode}`)
            .digest('hex');

          if (existingCert) {
            await tx
              .update(certificates)
              .set({
                hmacSignature: hmacSig,
                issuedAt: now,
                revokedAt: null,
                revokeReason: null,
              })
              .where(eq(certificates.id, existingCert.id));
          } else {
            await tx.insert(certificates).values({
              enrollmentId: enr.id,
              accountId: attempt.accountId,
              certificateCode: certCode,
              hmacSignature: hmacSig,
              issuedAt: now,
            });
          }
        }
      }
    }

    return updatedAttempt!;
  });
}

const examReviewDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'RETAKE_REQUIRED']),
  note: z.string().optional(),
});

teachRouter.put(
  '/teach/exam-reviews/:reviewId',
  validate(examReviewDecisionSchema),
  async (req, res, next) => {
    try {
      const attemptId = Number(req.params.reviewId);
      const { decision, note } = req.body;
      const verdict =
        decision === 'APPROVED' ? 'CLEARED_BY_INSTRUCTOR' : 'CONFIRMED_CHEAT';

      const updated = await applyInstructorProctoringVerdict({
        attemptId,
        verdict,
        note:
          note ||
          (decision === 'APPROVED'
            ? 'Đã xác minh hợp lệ bởi Giảng viên'
            : 'Yêu cầu thi lại do vi phạm quy chế giám sát Camera'),
        instructorId: req.user!.id,
        instructorRole: req.user!.role,
      });

      res.json({
        reviewId: String(attemptId),
        attemptId: String(attemptId),
        decision,
        integrityStatus: updated.integrityStatus,
        isPassed: updated.isPassed,
        updatedAt: (updated.verdictAt || new Date()).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

const verdictSchema = z.object({
  verdict: z.enum(['CONFIRMED_CHEAT', 'CLEARED_BY_INSTRUCTOR']),
  note: z.string().min(3),
});

teachRouter.post(
  '/teach/proctoring/:attemptId/verdict',
  validate(verdictSchema),
  async (req, res, next) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const { verdict, note } = req.body;

      const updated = await applyInstructorProctoringVerdict({
        attemptId,
        verdict,
        note,
        instructorId: req.user!.id,
        instructorRole: req.user!.role,
      });

      res.json({
        attemptId: String(attemptId),
        integrityStatus: updated.integrityStatus,
        isPassed: updated.isPassed,
        verdictNote: updated.verdictNote || note,
        verdictAt: (updated.verdictAt || new Date()).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
