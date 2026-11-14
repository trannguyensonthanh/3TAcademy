import { Router } from 'express';
import { eq, asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
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
  proctoringEvents,
  enrollments,
  discussionThreads,
  discussionPosts,
  notifications,
  userProfiles,
  accounts,
  skills,
  chatSessions,
  chatMessages,
} from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
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
  updateKickedParticipantsState,
  updateLiveRecordingState,
  updateMutedParticipantsState,
  resolvePlayableVideoSource,
} from '../learning/liveRoom.helpers.js';
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
): 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ipynb') || lower.includes('notebook')) return 'NOTEBOOK';
  if (lower.includes('github') || lower.endsWith('.zip') || lower.includes('repo')) return 'REPO';
  if (lower.includes('slide') || lower.endsWith('.pptx')) return 'SLIDE';
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'PDF';
  return 'PDF';
}

export async function buildFormattedEnrollments(cohortFilterIds?: number[]) {
  const [allEnr, allProfiles, allAccounts, allCohorts, allSessions, allProgress, allAttempts] =
    await Promise.all([
      cohortFilterIds && cohortFilterIds.length > 0
        ? db.select().from(enrollments).where(inArray(enrollments.cohortId, cohortFilterIds))
        : db.select().from(enrollments),
      db.select().from(userProfiles),
      db.select().from(accounts),
      db.select().from(cohorts),
      db.select().from(classSessions),
      db.select().from(sessionProgress),
      db.select().from(assessmentAttempts),
    ]);

  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));

  return allEnr.map((enr) => {
    const prof = profileMap.get(enr.accountId);
    const acc = accountMap.get(enr.accountId);
    const cohort = cohortMap.get(enr.cohortId);
    const cSessions = allSessions.filter((s) => s.cohortId === enr.cohortId);
    const totalSessionsCount = cSessions.length || 1;
    const completedProg = allProgress.filter(
      (p) =>
        p.accountId === enr.accountId &&
        p.isCompleted &&
        cSessions.some((s) => s.id === p.sessionId)
    );
    const completedSessionsCount = completedProg.length;
    const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);
    const missingQuizzesCount = Math.max(0, totalSessionsCount - completedSessionsCount);

    const stuAttempts = allAttempts.filter((a) => a.accountId === enr.accountId && a.scorePct);
    const avgScorePct =
      stuAttempts.length > 0
        ? Math.round(
            stuAttempts.reduce((sum, a) => sum + Number(a.scorePct), 0) / stuAttempts.length
          )
        : 0;

    return {
      id: String(enr.id),
      userId: String(enr.accountId),
      accountId: String(enr.accountId),
      studentName: prof?.fullName || acc?.email || '',
      studentEmail: acc?.email || '',
      avatarUrl: prof?.avatarUrl,
      cohortId: String(enr.cohortId),
      cohortCode: cohort?.code || '',
      status: enr.status,
      progressPercent,
      completedSessionsCount,
      totalSessionsCount,
      missingQuizzesCount,
      avgScorePct,
      finalExamPassed: enr.finalExamPassed,
      dropoutRiskScore: enr.dropoutRiskScore,
      riskLevel: enr.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
      lastActivityAt: (enr.enrolledAt ? new Date(enr.enrolledAt) : new Date()).toLocaleDateString('vi-VN'),
      lastRemindedAt: enr.lastRemindedAt ? enr.lastRemindedAt.toLocaleString('vi-VN') : undefined,
      enrolledAt: (enr.enrolledAt ? new Date(enr.enrolledAt) : new Date()).toISOString(),
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
      allSessionsRaw.length > 0
        ? allSessionsRaw
        : await db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder));

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
        status: s.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY',
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
          s.status === 'LIVE' ? `https://3t.edu.vn/live/guest/${s.id}` : undefined,
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

    const formattedEnrollments = await buildFormattedEnrollments();
    const formattedDiscussions = await buildFormattedDiscussionsForSessions(sessions);

    const formattedMaterials = allAttachments.map((att) => {
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
        downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
        updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
      };
    });

    res.json({
      liveSession,
      upcomingSessions,
      allSessions: formattedSessions,
      examReviews,
      enrollments: formattedEnrollments,
      chatMessages: allChatMsgs.map((m) => {
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
      allCohortsRaw.length > 0 ? allCohortsRaw : await db.select().from(cohorts);
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    res.json(
      list.map((ch) => {
        const course = courseMap.get(ch.courseId);
        const staffInfo = getStaffForInstructor(ch.instructorId);
        const labels = formatScheduleLabels(ch.scheduleSlots || []);

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
          enrolledCount: ch.enrolledCount,
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

    const [[course], sessions, cohortAssessments, allSkills, getStaffForInstructor] =
      await Promise.all([
        db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1),
        db
          .select()
          .from(classSessions)
          .where(eq(classSessions.cohortId, cohort.id))
          .orderBy(asc(classSessions.sessionOrder)),
        db.select().from(assessments).where(eq(assessments.cohortId, cohort.id)),
        db.select().from(skills),
        buildInstructorStaffMap(),
      ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
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
        enrolledCount: cohort.enrolledCount,
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
          status: s.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY',
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
          downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
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

      const [attachments, [quiz], allSkills, discussions, getStaffForInstructor] =
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
          buildFormattedDiscussionsForSessions([session]),
          buildInstructorStaffMap(),
        ]);

      const staffInfo = getStaffForInstructor(session.instructorId);
      const skillMap = new Map(allSkills.map((s) => [s.id, s]));
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
          downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
          updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
        };
      });

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
          status: session.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY',
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
        publishStatus: quiz?.status || 'PUBLISHED',
        discussions,
      });
    } catch (err) {
      next(err);
    }
  }
);

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
  fileType: z.enum(['SLIDE', 'PDF', 'REPO', 'NOTEBOOK']).optional(),
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

      const nextVideoKey =
        videoR2Key !== undefined ? videoR2Key.trim() : session.videoR2Key;
      const nextStatus =
        status ??
        (videoR2Key && videoR2Key.trim() && session.status === 'SCHEDULED'
          ? 'REPLAY_READY'
          : session.status);

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
          (fileType === 'NOTEBOOK'
            ? 'application/x-ipynb+json'
            : fileType === 'REPO'
              ? 'application/zip'
              : 'application/pdf');
        const resolvedBytes = fileSizeBytes || 2516582;

        const [att] = await db
          .insert(sessionAttachments)
          .values({
            sessionId,
            fileName: effectiveName,
            r2ObjectKey:
              r2ObjectKey || `sessions/${sessionId}/${Date.now()}-${effectiveName.replace(/\s+/g, '_')}`,
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
            downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
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
      const nextStatus = status ?? session.status;
      const nextVideoKey =
        videoR2Key !== undefined ? videoR2Key.trim() : session.videoR2Key;

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

      const nextStatus =
        req.body.markReplayReady === false ? session.status : 'REPLAY_READY';
      const nextVideoKey =
        activeRec.mode === 'LIVEKIT_EGRESS' || req.body.objectKey
          ? finalPublicUrl
          : session.videoR2Key || finalPublicUrl;

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

      const contentType = (req.body.contentType || 'video/webm').trim();
      const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
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

      const nextStatus =
        req.body.markReplayReady === false ? session.status : 'REPLAY_READY';

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

// 7.6 POST /teach/sessions/:sessionId/generate-quiz
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
          title: `Bài kiểm tra trắc nghiệm Buổi ${session.sessionOrder}: ${session.title}`,
          durationMinutes: 20,
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

    const [existingItems, allSkills] = await Promise.all([
      db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, quiz.id))
        .orderBy(asc(assessmentItems.itemOrder)),
      db.select().from(skills),
    ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));

    try {
      await aiServiceClient.generateQuizDraft(session.id);
    } catch {
      // Keep items from DB
    }

    const formattedItems = mapAssessmentItemsToMcq(existingItems, skillMap);

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

// 7.7 PUT /teach/assessments/:assessmentId/publish
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

      if (Array.isArray(items) && items.length > 0) {
        const existingDbItems = await db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, assessment.id))
          .orderBy(asc(assessmentItems.itemOrder));

        for (let idx = 0; idx < items.length; idx++) {
          const itemPayload = items[idx]!;
          const targetDbItem = existingDbItems[idx];
          if (targetDbItem) {
            await db
              .update(assessmentItems)
              .set({
                promptConfig: {
                  number: itemPayload.number ?? idx + 1,
                  scenarioTag: itemPayload.scenarioTag,
                  prompt: itemPayload.prompt,
                  options: itemPayload.options,
                  slideLabel: itemPayload.slideLabel || '',
                },
                gradingConfig: {
                  correctIndex: itemPayload.correctIndex,
                  reviewTimestampLabel: itemPayload.reviewTimestampLabel || '00:10 — 00:25',
                  reviewJumpSec: itemPayload.reviewJumpSec ?? 10,
                  reviewSegmentRangeSec: itemPayload.reviewSegmentRangeSec || [10, 25],
                },
                explanationMd: itemPayload.explanation || targetDbItem.explanationMd,
              })
              .where(eq(assessmentItems.id, targetDbItem.id));
          }
        }
      }

      res.json({
        assessmentId: String(updated!.id),
        status: updated!.status,
        publishedCount: items?.length ?? 0,
        itemsCount: items?.length ?? 0,
        publishedAt: updated!.updatedAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

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

      const url = `https://3t.edu.vn/live/guest/${session.id}?token=${inviteToken}`;
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

// 7.11 PUT /teach/exam-reviews/:reviewId & POST /teach/proctoring/:attemptId/verdict
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

      const [updated] = await db
        .update(assessmentAttempts)
        .set({
          integrityStatus: verdict,
          verdictNote:
            note ||
            (decision === 'APPROVED'
              ? 'Đã xác minh hợp lệ bởi Giảng viên'
              : 'Yêu cầu thi lại do vi phạm quy chế giám sát Camera'),
          verdictBy: req.user!.id,
          verdictAt: new Date(),
          ...(verdict === 'CONFIRMED_CHEAT' ? { scorePct: '0.00', isPassed: false } : {}),
        })
        .where(eq(assessmentAttempts.id, attemptId))
        .returning();

      res.json({
        reviewId: String(attemptId),
        attemptId: String(attemptId),
        decision,
        integrityStatus: updated?.integrityStatus || verdict,
        updatedAt: (updated?.verdictAt || new Date()).toISOString(),
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

      const [updated] = await db
        .update(assessmentAttempts)
        .set({
          integrityStatus: verdict,
          verdictNote: note,
          verdictBy: req.user!.id,
          verdictAt: new Date(),
          ...(verdict === 'CONFIRMED_CHEAT' ? { scorePct: '0.00', isPassed: false } : {}),
        })
        .where(eq(assessmentAttempts.id, attemptId))
        .returning();

      res.json({
        attemptId: String(attemptId),
        integrityStatus: updated?.integrityStatus || verdict,
        verdictNote: updated?.verdictNote || note,
        verdictAt: (updated?.verdictAt || new Date()).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
