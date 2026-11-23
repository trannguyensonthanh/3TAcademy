/**
 * ============================================================================
 * TỆP: apps/api/src/modules/admin/admin.routes.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Trung tâm Quản trị Hệ thống (`ADMIN` only).
 *   - Toàn bộ router được khóa chặt bởi `requireAuth` + `requireRole(['ADMIN'])`.
 *   - Đảm nhiệm:
 *     1. Tổng quan vận hành & doanh thu (`GET /admin/overview`) và sổ cái giao dịch SePay (`GET /admin/sepay-transactions`).
 *     2. Quản trị & xuất bản khóa học (`POST /admin/courses`): tự động sinh vector Semantic Embedding 1024-dim
 *        (`computeSemanticEmbedding1024`) và đồng bộ ánh xạ `skills` / `course_skills`.
 *     3. Mở mới / cập nhật đợt học (`POST /admin/cohorts`): kiểm tra xung đột lịch giảng viên cứng
 *        (`SCHEDULE_CONFLICT_DETECTED`, HTTP 409 — đồng bộ ràng buộc cứng với bộ giải tối ưu xếp lịch
 *        OR-Tools **CP-SAT** tại `apps/ai-service/src/api/routes/scheduler_routes.py`), tự động trải ngày giờ
 *        6 buổi học theo múi giờ Việt Nam (UTC+7) và sinh sẵn bộ đề `DRAFT` cho từng buổi + Kỳ thi cuối khóa.
 *     4. Quản trị tài khoản (`PUT /admin/users`, `POST /admin/accounts` băm Argon2 + tạo hồ sơ giảng viên/học viên),
 *        ghi danh thủ công (`POST /admin/enrollments/manual` cấp +4 lượt phỏng vấn AI),
 *        cấp hàng loạt & thu hồi/khôi phục Chứng chỉ ký số HMAC-SHA256 (`POST /admin/certificates/issue`,
 *        `PUT /admin/certificates/:certificateCode/revoke`).
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ Frontend `apps/web/src/services/admin.api.ts`:
 *     + `adminApi.getAdminOverview()`        -> `GET  /api/v1/admin/overview`
 *     + `adminApi.getSepayTransactions()`    -> `GET  /api/v1/admin/sepay-transactions`
 *     + `adminApi.manageCourses()`           -> `POST /api/v1/admin/courses`
 *     + `adminApi.manageCohorts()`           -> `POST /api/v1/admin/cohorts`
 *     + `adminApi.manageUsers()`             -> `PUT  /api/v1/admin/users`
 *     + `adminApi.createAccount()`           -> `POST /api/v1/admin/accounts`
 *     + `adminApi.issueCertificatesBatch()`  -> `POST /api/v1/admin/certificates/issue`
 *     + `adminApi.toggleCertificateRevoke()` -> `PUT  /api/v1/admin/certificates/:certificateCode/revoke`
 *   - Đọc/Ghi bảng DB: `accounts`, `account_identities`, `user_profiles`, `instructor_profiles`,
 *     `categories`, `skills`, `courses`, `course_skills`, `cohorts`, `class_sessions`, `session_progress`,
 *     `orders`, `payment_transactions`, `enrollments`, `course_reviews`, `certificates`, `chat_sessions`,
 *     `chat_messages`, `notifications`, `assessments`, `assessment_attempts`.
 *   - Liên kết AI Service: Đồng bộ cấu trúc slot lịch học với bộ tối ưu xếp lịch CP-SAT tại
 *     `apps/ai-service/src/api/routes/scheduler_routes.py` (`POST /api/v1/ai/scheduler/optimize-cohort-schedule`).
 * ============================================================================
 */
import { Router } from 'express';
import { eq, and, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { db } from '../../db/index.js';
import {
  accounts,
  accountIdentities,
  userProfiles,
  instructorProfiles,
  categories,
  skills,
  courses,
  courseSkills,
  cohorts,
  classSessions,
  sessionProgress,
  orders,
  paymentTransactions,
  enrollments,
  courseReviews,
  certificates,
  chatSessions,
  chatMessages,
  notifications,
  assessments,
  assessmentAttempts,
} from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { computeSemanticEmbedding1024 } from '../../db/seedHelpers.js';
import { env } from '../../config/env.js';
import {
  resolveCohort,
  formatScheduleLabels,
  buildInstructorStaffMap,
} from '../../db/helpers.js';
import { buildCertificateRecords } from '../catalog/catalog.routes.js';
import { computeWeightedCohortScorePct } from '../assessment/skillMasteryModel.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['ADMIN']));

/** Chuẩn hóa đầu vào ngày tháng từ form Quản trị (hỗ trợ `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`) sang ISO `YYYY-MM-DD` an toàn. */
function normalizeAdminDateInput(rawDate?: string | null): string | null {
  const trimmed = (rawDate || '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Handle DD/MM/YYYY or DD-MM-YYYY safely (prevents RangeError: Invalid time value!)
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1]!.padStart(2, '0');
    const mm = dmyMatch[2]!.padStart(2, '0');
    const yyyy = dmyMatch[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs)) {
    return new Date(parsedMs).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Route `GET /api/v1/admin/overview` — Bảng điều khiển Tổng quan Hệ thống cho Quản trị viên (`AdminDashboardView`).
 * - **Mục tiêu:** Tổng hợp doanh thu thật (đơn `PAID`), số đợt học đang chạy, tổng học viên, chứng chỉ đã cấp,
 *   lịch dạy hôm nay, thống kê đánh giá sao, danh sách tài khoản, học viên đủ điều kiện tốt nghiệp và lịch sử AI chat.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.getAdminOverview()`. Đọc toàn bộ các bảng nghiệp vụ cốt lõi.
 */
// 8.1 GET /admin/overview
adminRouter.get('/admin/overview', async (_req, res, next) => {
  try {
    const [
      paidOrders,
      allCohorts,
      allCourses,
      allAccounts,
      allProfiles,
      allInstProfiles,
      allCerts,
      allEnrollments,
      allSessions,
      allProgress,
      allAssessments,
      allAttempts,
      allReviews,
      allChatSessions,
      allChatMsgs,
      allNotifs,
      getStaffForInstructor,
      certRecordsList,
    ] = await Promise.all([
      db.select().from(orders).where(eq(orders.status, 'PAID')),
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(courses),
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(userProfiles),
      db.select().from(instructorProfiles),
      db.select().from(certificates),
      db.select().from(enrollments),
      db.select().from(classSessions),
      db.select().from(sessionProgress),
      db.select().from(assessments),
      db.select().from(assessmentAttempts),
      db.select().from(courseReviews).orderBy(desc(courseReviews.createdAt)),
      db.select().from(chatSessions),
      db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)),
      buildInstructorStaffMap(),
      buildCertificateRecords(),
    ]);

    const totalRevenueVnd = paidOrders.reduce((acc, o) => acc + o.amountVnd, 0);
    const activeCohorts = allCohorts.filter(
      (c) => c.status === 'OPENING' || c.status === 'ONGOING'
    );
    const studentAccounts = allAccounts.filter((a) => a.role === 'STUDENT');

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
    const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
    const instMap = new Map(allInstProfiles.map((ip) => [ip.accountId, ip]));
    const chatSessionMap = new Map(allChatSessions.map((cs) => [cs.id, cs]));

    const formattedCohorts = allCohorts.map((ch) => {
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
    });

    const formattedEnrollments = allEnrollments.map((enr) => {
      const prof = profileMap.get(enr.accountId);
      const acc = accountMap.get(enr.accountId);
      const cohort = cohortMap.get(enr.cohortId);
      const cSessions = allSessions.filter((s) => s.cohortId === enr.cohortId);
      const cAssessments = allAssessments.filter((a) => a.cohortId === enr.cohortId);
      const cAssIds = new Set(cAssessments.map((a) => a.id));
      const totalSessionsCount = cSessions.length || 1;
      const completedSessionsCount = allProgress.filter(
        (p) =>
          p.accountId === enr.accountId &&
          p.isCompleted &&
          cSessions.some((s) => s.id === p.sessionId)
      ).length;
      const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);
      const stuCohortAttempts = allAttempts.filter(
        (a) => a.accountId === enr.accountId && cAssIds.has(a.assessmentId) && a.scorePct !== null
      );
      const avgScorePct = computeWeightedCohortScorePct(
        stuCohortAttempts.map((a) => {
          const ass = cAssessments.find((item) => item.id === a.assessmentId);
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

      const finalExam = cAssessments.find((a) => a.purpose === 'FINAL_EXAM');
      const finalExamAttempt = finalExam
        ? stuCohortAttempts
            .filter((a) => a.assessmentId === finalExam.id)
            .sort((a, b) => Number(b.scorePct || 0) - Number(a.scorePct || 0))[0]
        : undefined;

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
        missingQuizzesCount: Math.max(0, totalSessionsCount - completedSessionsCount),
        avgScorePct,
        finalExamScorePct: finalExamAttempt ? Math.round(Number(finalExamAttempt.scorePct)) : avgScorePct,
        finalExamIntegrity: finalExamAttempt?.integrityStatus || 'CLEAN',
        finalExamPassed: enr.finalExamPassed,
        dropoutRiskScore: enr.dropoutRiskScore,
        riskLevel: enr.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        lastActivityAt: enr.enrolledAt.toLocaleDateString('vi-VN'),
        lastRemindedAt: enr.lastRemindedAt ? enr.lastRemindedAt.toLocaleString('vi-VN') : undefined,
        enrolledAt: enr.enrolledAt.toISOString(),
      };
    });

    const certificatesRecord: Record<string, (typeof certRecordsList)[number]> = {};
    for (const cRec of certRecordsList) {
      certificatesRecord[cRec.certificateCode] = cRec;
    }

    const formattedAccounts = allAccounts.map((acc) => {
      const prof = profileMap.get(acc.id);
      const inst = instMap.get(acc.id);
      const cvData = (prof?.cvParsedData ?? {}) as Record<string, unknown>;
      const phone =
        (prof?.phone && prof.phone.trim()) ||
        (typeof cvData.phone === 'string' ? cvData.phone : '');

      const assignedCohorts =
        acc.role === 'INSTRUCTOR'
          ? allCohorts.filter((c) => c.instructorId === acc.id).map((c) => c.code)
          : allEnrollments
              .filter((e) => e.accountId === acc.id)
              .map((e) => cohortMap.get(e.cohortId)?.code || '')
              .filter(Boolean);

      const roleCategory: 'Học viên' | 'Giảng viên' | 'Quản trị viên' =
        acc.role === 'INSTRUCTOR'
          ? 'Giảng viên'
          : acc.role === 'ADMIN'
            ? 'Quản trị viên'
            : 'Học viên';

      return {
        id: String(acc.id),
        fullName: prof?.fullName || acc.email.split('@')[0] || '',
        email: acc.email,
        phone,
        role: acc.role,
        roleCategory,
        roleDetail:
          inst?.headline ||
          prof?.bio ||
          (acc.role === 'ADMIN' ? 'Quản trị viên Hệ thống' : 'Học viên'),
        cohortAssigned: assignedCohorts.join(', ') || 'Chưa phân lớp',
        locked: acc.status === 'LOCKED',
        status: acc.status,
        isActive: acc.status === 'ACTIVE',
        avatarUrl: prof?.avatarUrl || undefined,
        bio: prof?.bio || undefined,
        careerGoal: prof?.careerGoal || undefined,
        createdAt: acc.createdAt.toLocaleDateString('vi-VN'),
        lastLoginAt: acc.lastLoginAt ? acc.lastLoginAt.toLocaleString('vi-VN') : 'Chưa đăng nhập',
        interviewCredits: prof?.interviewCredits ?? 0,
        instructorHeadline: inst?.headline,
        instructorOrganization: inst?.organization || undefined,
        instructorYearsOfExperience: inst?.yearsOfExperience ?? undefined,
        yearsOfExperience: inst?.yearsOfExperience ?? undefined,
        instructorExpertiseSummaryMd: inst?.expertiseSummaryMd || undefined,
        assignedCohorts,
      };
    });

    const certByEnrollmentId = new Map(allCerts.map((c) => [c.enrollmentId, c]));
    // Strict Graduation Eligibility: ONLY students who actually passed Final Exam (not 80% progress!)
    const eligibleGraduates = formattedEnrollments
      .filter(
        (enr) =>
          enr.status !== 'REVOKED' &&
          enr.finalExamPassed &&
          enr.completedSessionsCount >= enr.totalSessionsCount
      )
      .map((enr) => {
        const existingCert = certByEnrollmentId.get(Number(enr.id));
        const cohort = cohortMap.get(Number(enr.cohortId));
        const course = cohort ? courseMap.get(cohort.courseId) : undefined;
        const scoreOutOf10 = Number((enr.finalExamScorePct / 10).toFixed(1));
        const proctoringStatus =
          enr.finalExamIntegrity === 'FLAGGED' || enr.finalExamIntegrity === 'CONFIRMED_CHEAT'
            ? ('FLAGGED' as const)
            : ('CLEAN' as const);
        return {
          id: enr.id,
          enrollmentId: enr.id,
          studentName: enr.studentName,
          studentEmail: enr.studentEmail,
          cohortCode: enr.cohortCode,
          courseTitle: course?.title || '',
          completedSessionsText: `${enr.completedSessionsCount}/${enr.totalSessionsCount} buổi`,
          completedSessions: `${enr.completedSessionsCount}/${enr.totalSessionsCount} buổi`,
          finalExamScore: scoreOutOf10,
          proctoringStatus,
          isIssued: Boolean(existingCert && !existingCert.revokedAt),
          issuedCertCode: existingCert?.certificateCode,
          certificateCode: existingCert?.certificateCode,
        };
      });

    // Real Review Aggregation from DB (replaces hardcoded 398 fake reviews in AdminPortalView!)
    const publicReviews = allReviews.filter((r) => r.isPublic);
    const totalReviews = publicReviews.length;
    const avgCourseRating =
      totalReviews > 0
        ? Number(
            (publicReviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1)
          )
        : 0;
    const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => {
      const count = publicReviews.filter((r) => r.rating === stars).length;
      return {
        stars,
        count,
        percent: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
      };
    });

    // Real Tonight Sessions (in Vietnam UTC+7 date)
    const todayIctStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const todayRawSessions = allSessions.filter((s) => {
      if (s.status === 'LIVE') return true;
      if (!s.scheduledStart) return false;
      const sessIctStr = new Date(s.scheduledStart.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      return sessIctStr === todayIctStr;
    });
    const todaySessions = todayRawSessions.map((s) => {
      const staffInfo = getStaffForInstructor(s.instructorId);
      return {
        id: String(s.id),
        cohortId: String(s.cohortId),
        sessionOrder: s.sessionOrder,
        title: s.title,
        activityTags: (s.activityTags || []) as string[],
        hostInstructorName: staffInfo.instructorName,
        scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
        scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
        status: s.status === 'CANCELED' ? 'SCHEDULED' : s.status,
        videoR2Key: s.videoR2Key || '',
        videoProvider: s.videoProvider || 'R2_HLS_AES128',
        durationSeconds: s.durationSeconds || 7200,
        isCompleted: false,
        lastPositionSec: 0,
        aiSummaryMd: s.aiSummaryMd || '',
        attachmentsCount: 0,
        quizStatus: 'NOT_STARTED',
        quizScore: null,
        quizQuestions: [],
        aiCitations: [],
      };
    });
    const fiveStarCount = publicReviews.filter((r) => r.rating === 5).length;

    res.json({
      totalRevenueVnd,
      activeCohortsCount: activeCohorts.length,
      totalStudentsCount: studentAccounts.length,
      issuedCertificatesCount: allCerts.filter((c) => !c.revokedAt).length,
      todaySessionsCount: todaySessions.length,
      todaySessions,
      reviewSummary: {
        totalReviews,
        avgRating: avgCourseRating,
        averageRating: avgCourseRating,
        fiveStarCount,
        ratingDistribution,
        recentReviews: publicReviews.slice(0, 10).map((r) => ({
          id: String(r.id),
          courseTitle: courseMap.get(r.courseId)?.title || '',
          cohortCode: cohortMap.get(r.cohortId)?.code || '',
          studentName: profileMap.get(r.accountId)?.fullName || 'Học viên',
          rating: r.rating,
          comment: r.comment || '',
          createdAt: r.createdAt.toLocaleDateString('vi-VN'),
        })),
      },
      cohorts: formattedCohorts,
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
          tokensUsed:
            m.promptTokens && m.completionTokens ? m.promptTokens + m.completionTokens : null,
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
      certificates: certificatesRecord,
      accounts: formattedAccounts,
      eligibleGraduates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/admin/sepay-transactions` — Sổ cái đối soát giao dịch chuyển khoản VietQR SePay (`MATCHED` / `AMOUNT_MISMATCH` / `UNMATCHED_ORDER`).
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.getSepayTransactions()`. Đọc `payment_transactions`, `orders`, `cohorts`, `user_profiles`, `accounts`.
 */
// 8.1B GET /admin/sepay-transactions
adminRouter.get('/admin/sepay-transactions', async (_req, res, next) => {
  try {
    const [txs, allOrders, allCohorts, allCourses, allProfiles] = await Promise.all([
      db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)),
      db.select().from(orders),
      db.select().from(cohorts),
      db.select().from(courses),
      db.select().from(userProfiles),
    ]);

    const orderMap = new Map(allOrders.map((o) => [o.id, o]));
    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));

    res.json(
      txs.map((tx) => {
        const ord = tx.orderId ? orderMap.get(tx.orderId) : undefined;
        const cohort = ord ? cohortMap.get(ord.cohortId) : undefined;
        const course = cohort ? courseMap.get(cohort.courseId) : undefined;
        const prof = ord ? profileMap.get(ord.accountId) : undefined;
        const payload = (tx.rawPayload ?? {}) as Record<string, unknown>;
        const bankName =
          typeof payload.gateway === 'string' && payload.gateway.trim()
            ? payload.gateway.trim()
            : env.SEPAY_BANK_NAME;
        return {
          id: String(tx.id),
          orderId: tx.orderId ? String(tx.orderId) : null,
          orderCode: ord?.orderCode || null,
          cohortCode: cohort?.code || null,
          courseTitle: course?.title || cohort?.name || null,
          studentName: prof?.fullName || null,
          bankName,
          gateway: 'SEPAY_VIETQR' as const,
          amountVnd: tx.amountVnd,
          expectedAmountVnd: ord?.amountVnd ?? null,
          transferContent: String(payload.content || payload.transferContent || ord?.orderCode || ''),
          referenceNumber: String(payload.referenceCode || payload.referenceNumber || tx.gatewayTxnId),
          matchStatus: tx.matchStatus as 'MATCHED' | 'UNMATCHED_ORDER' | 'AMOUNT_MISMATCH',
          processedAt: tx.createdAt.toLocaleString('vi-VN'),
          processedAtIso: tx.createdAt.toISOString(),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/admin/courses` — Tạo mới hoặc cập nhật đề cương khóa học (`PUBLISHED`).
 * - **Quy trình:**
 *   + Bước 1: Nếu chỉ gửi `id` + `syllabusTemplate` -> cập nhật nhanh khung đề cương khóa hiện có.
 *   + Bước 2: Nếu tạo mới -> tự giải ánh xạ danh mục, sinh slug, tính vector Semantic Embedding 1024-dim (`computeSemanticEmbedding1024`)
 *     để AI Advisor gợi ý khóa học ngay lập tức, và upsert danh sách `skills` + `course_skills`.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.manageCourses()`. Ghi DB: `courses`, `skills`, `course_skills`.
 */
// 8.2 POST /admin/courses
const createOrUpdateCourseSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  versionId: z.string().optional(),
  categoryId: z.number().int().positive().optional(),
  category: z.string().optional(),
  title: z.string().optional(),
  slug: z.string().optional(),
  shortDescription: z.string().optional(),
  descriptionMd: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  difficultyLevel: z.number().int().min(1).max(5).default(3),
  durationWeeks: z.number().int().optional(),
  totalHours: z.number().int().optional(),
  skills: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.enum(['PREREQUISITE', 'LEARNING_OUTCOME']).default('LEARNING_OUTCOME'),
        code: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  syllabusTemplate: z.array(z.record(z.unknown())).default([]),
});

adminRouter.post(
  '/admin/courses',
  validate(createOrUpdateCourseSchema),
  async (req, res, next) => {
    try {
      const {
        id: rawCourseId,
        versionId,
        categoryId,
        category,
        title,
        slug,
        shortDescription,
        descriptionMd,
        thumbnailUrl,
        difficultyLevel,
        skills: reqSkills,
        syllabusTemplate,
      } = req.body;

      if (rawCourseId && !title) {
        const numId = Number(rawCourseId);
        const [existingCourse] = await db
          .select()
          .from(courses)
          .where(!Number.isNaN(numId) ? eq(courses.id, numId) : eq(courses.slug, String(rawCourseId)))
          .limit(1);

        if (existingCourse) {
          const [updated] = await db
            .update(courses)
            .set({
              syllabusTemplate,
              updatedAt: new Date(),
            })
            .where(eq(courses.id, existingCourse.id))
            .returning();

          res.json({
            courseId: String(updated!.id),
            slug: updated!.slug,
            status: 'SAVED',
            versionId: versionId || 'v2026.1',
            course: {
              ...updated,
              id: String(updated!.id),
            },
          });
          return;
        }
      }

      let resolvedCategoryId = categoryId ?? 1;
      if (!categoryId && category) {
        const allCats = await db.select().from(categories);
        const catLower = category.trim().toLowerCase();
        const matchedCat = allCats.find(
          (c) =>
            c.name.toLowerCase() === catLower ||
            c.slug.toLowerCase() === catLower ||
            (catLower.includes('ai') && c.slug === 'ai-llm-engineering') ||
            ((catLower.includes('backend') || catLower.includes('cloud') || catLower.includes('hệ thống')) &&
              (c.slug === 'software-system-architecture' || c.slug === 'backend-system-architecture')) ||
            ((catLower.includes('dữ liệu') || catLower.includes('data')) &&
              c.slug === 'data-engineering-analytics') ||
            ((catLower.includes('nền tảng') || catLower.includes('python')) &&
              (c.slug === 'core-programming-sql' || c.slug === 'foundational-programming'))
        );
        if (matchedCat) {
          resolvedCategoryId = matchedCat.id;
        } else if (allCats[0]) {
          resolvedCategoryId = allCats[0].id;
        }
      }

      const courseTitle = title || 'Khóa học Mới';
      const courseSlug =
        slug ||
        courseTitle
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') +
          '-' +
          Date.now().toString().slice(-4);

      const [created] = await db
        .insert(courses)
        .values({
          categoryId: resolvedCategoryId,
          title: courseTitle,
          slug: courseSlug,
          shortDescription: shortDescription || courseTitle,
          descriptionMd: descriptionMd || shortDescription || courseTitle,
          thumbnailUrl: thumbnailUrl || '',
          difficultyLevel,
          syllabusTemplate,
          status: 'PUBLISHED',
          embedding: computeSemanticEmbedding1024(
            `${courseTitle} ${shortDescription || ''} ${descriptionMd || ''}`
          ),
        })
        .returning();

      if (Array.isArray(reqSkills) && reqSkills.length > 0 && created) {
        for (const skItem of reqSkills) {
          let [dbSkill] = await db
            .select()
            .from(skills)
            .where(eq(skills.code, skItem.code))
            .limit(1);

          if (!dbSkill) {
            const [insertedSkill] = await db
              .insert(skills)
              .values({
                categoryId: resolvedCategoryId,
                code: skItem.code,
                name: skItem.name,
              })
              .returning();
            dbSkill = insertedSkill;
          }

          if (dbSkill) {
            await db
              .insert(courseSkills)
              .values({
                courseId: created.id,
                skillId: dbSkill.id,
                skillRole: skItem.type,
                targetWeight: 1.0,
              })
              .onConflictDoNothing();
          }
        }
      }

      res.status(201).json({
        courseId: String(created!.id),
        slug: created!.slug,
        status: 'SAVED',
        course: {
          ...created,
          id: String(created!.id),
          category: category || '',
          skills: reqSkills || [],
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/admin/cohorts` — Mở mới hoặc cập nhật Đợt học (Cohort), kiểm tra trùng lịch giảng viên & tự sinh lịch 6 buổi.
 *
 * - **Quy trình từng bước:**
 *   + Bước 1: Chuẩn hóa `startDate`/`endDate` và kiểm tra tính hợp lệ khoảng ngày.
 *   + Bước 2: Kiểm tra ràng buộc cứng chống trùng lịch giảng viên (`SCHEDULE_CONFLICT_DETECTED`, HTTP 409) trên các lớp đang mở/đang học
 *     (đồng bộ ràng buộc cứng với thuật toán xếp lịch tối ưu OR-Tools **CP-SAT** tại `apps/ai-service/src/api/routes/scheduler_routes.py`).
 *   + Bước 3: Nếu truyền `cohortId` -> cập nhật đợt học hiện có; nếu mở mới -> chèn `cohorts (OPENING)`,
 *     tự động trải mốc thời gian thực (`UTC+7`) cho từng `class_sessions` theo `scheduleSlots` và tạo sẵn
 *     các bài kiểm tra `DRAFT` (`SESSION_ASSIGNMENT` + `FINAL_EXAM`).
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.manageCohorts()`. Đọc/Ghi DB: `courses`, `cohorts`, `class_sessions`, `assessments`.
 */
// 8.3 POST /admin/cohorts
const createCohortSchema = z.object({
  cohortId: z.union([z.number(), z.string()]).optional(),
  courseId: z.union([z.number(), z.string()]),
  code: z.string().min(3),
  name: z.string().min(3),
  instructorId: z.union([z.number(), z.string()]),
  instructorName: z.string().optional(),
  curriculumVersion: z.string().default('v1.0'),
  techStackNotes: z.string().optional(),
  tuitionVnd: z.number().int().min(0),
  maxSeats: z.number().int().min(1).default(35),
  enrollmentOpenAt: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  scheduleSlots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
      })
    )
    .default([]),
});

adminRouter.post('/admin/cohorts', validate(createCohortSchema), async (req, res, next) => {
  try {
    const body = req.body;
    const instructorIdNum = Number(body.instructorId) || req.user!.id;

    const normalizedStartDate = normalizeAdminDateInput(body.startDate);
    if (!normalizedStartDate) {
      res.status(400).json({
        success: false,
        status: 400,
        code: 'INVALID_START_DATE',
        message: 'Ngày khai giảng không hợp lệ (hỗ trợ YYYY-MM-DD hoặc DD/MM/YYYY).',
      });
      return;
    }

    const normalizedEndDate =
      normalizeAdminDateInput(body.endDate) ||
      new Date(Date.parse(`${normalizedStartDate}T00:00:00Z`) + 28 * 86400000)
        .toISOString()
        .slice(0, 10);

    if (normalizedEndDate < normalizedStartDate) {
      res.status(400).json({
        success: false,
        status: 400,
        code: 'INVALID_DATE_RANGE',
        message: 'Ngày kết thúc phải sau hoặc bằng ngày khai giảng.',
      });
      return;
    }

    const editingCohort = body.cohortId ? await resolveCohort(body.cohortId) : undefined;

    let courseIdNum = Number(body.courseId);
    let [course] = !Number.isNaN(courseIdNum) && courseIdNum > 0
      ? await db.select().from(courses).where(eq(courses.id, courseIdNum)).limit(1)
      : await db.select().from(courses).where(eq(courses.slug, String(body.courseId))).limit(1);

    if (!course && editingCohort) {
      [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, editingCohort.courseId))
        .limit(1);
    }
    if (!course) {
      res.status(404).json({
        code: 'COURSE_NOT_FOUND',
        message: 'Không tìm thấy khóa học để mở lớp.',
      });
      return;
    }
    courseIdNum = course.id;

    const instructorCohorts = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.instructorId, instructorIdNum));

    for (const existing of instructorCohorts) {
      if (editingCohort && existing.id === editingCohort.id) continue;
      if (existing.status === 'COMPLETED' || existing.status === 'ARCHIVED') continue;
      for (const newSlot of body.scheduleSlots) {
        const conflict = (existing.scheduleSlots || []).some(
          (s) => s.dayOfWeek === newSlot.dayOfWeek && s.startTime === newSlot.startTime
        );
        if (
          conflict &&
          existing.endDate >= normalizedStartDate &&
          existing.startDate <= normalizedEndDate
        ) {
          const message = `Giảng viên đã có lịch dạy trùng vào khung giờ ${newSlot.startTime} - ${newSlot.endTime} tại lớp ${existing.code}`;
          res.status(409).json({
            success: false,
            status: 409,
            code: 'SCHEDULE_CONFLICT_DETECTED',
            message,
            error: {
              code: 'SCHEDULE_CONFLICT_DETECTED',
              message,
            },
          });
          return;
        }
      }
    }

    const typedSlots = body.scheduleSlots as Array<{
      dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
      startTime: string;
      endTime: string;
    }>;

    // If editing an existing cohort, update it cleanly without colliding on unique code!
    if (editingCohort) {
      const [updatedCohort] = await db
        .update(cohorts)
        .set({
          courseId: courseIdNum,
          name: body.name,
          instructorId: instructorIdNum,
          curriculumVersion: body.curriculumVersion,
          techStackNotes: body.techStackNotes,
          tuitionVnd: body.tuitionVnd,
          maxSeats: body.maxSeats ?? editingCohort.maxSeats,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          scheduleSlots: typedSlots,
          updatedAt: new Date(),
        })
        .where(eq(cohorts.id, editingCohort.id))
        .returning();

      const getStaffForInstructor = await buildInstructorStaffMap();
      const staffInfo = getStaffForInstructor(instructorIdNum);
      const labels = formatScheduleLabels(updatedCohort!.scheduleSlots || []);

      res.status(200).json({
        cohortId: String(updatedCohort!.id),
        code: updatedCohort!.code,
        status: 'UPDATED',
        instructorId: String(updatedCohort!.instructorId),
        curriculumVersion: updatedCohort!.curriculumVersion,
        scheduleSlots: updatedCohort!.scheduleSlots,
        cohort: {
          id: String(updatedCohort!.id),
          courseId: String(updatedCohort!.courseId),
          instructorId: String(updatedCohort!.instructorId),
          courseSlug: course.slug,
          courseTitle: course.title,
          code: updatedCohort!.code,
          name: updatedCohort!.name,
          status: updatedCohort!.status,
          curriculumVersion: updatedCohort!.curriculumVersion,
          techStackNotes: updatedCohort!.techStackNotes,
          tuitionVnd: updatedCohort!.tuitionVnd,
          maxSeats: updatedCohort!.maxSeats,
          enrolledCount: updatedCohort!.enrolledCount,
          enrollmentOpenAt: updatedCohort!.enrollmentOpenAt.toISOString(),
          startDate: updatedCohort!.startDate,
          endDate: updatedCohort!.endDate,
          scheduleLabel: labels.scheduleLabel,
          timeRangeLabel: labels.timeRangeLabel,
          scheduleSlots: updatedCohort!.scheduleSlots || [],
          instructorName: staffInfo.instructorName,
          instructorHeadline: staffInfo.instructorHeadline,
          instructorAvatarUrl: staffInfo.instructorAvatarUrl,
          staff: staffInfo.staff,
        },
      });
      return;
    }

    // Check duplicate cohort code
    const [existingByCode] = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.code, body.code.trim()))
      .limit(1);
    if (existingByCode) {
      res.status(409).json({
        code: 'COHORT_CODE_EXISTS',
        message: `Mã đợt học ${body.code} đã tồn tại trên hệ thống.`,
      });
      return;
    }

    const [created] = await db
      .insert(cohorts)
      .values({
        courseId: courseIdNum,
        code: body.code.trim(),
        name: body.name,
        instructorId: instructorIdNum,
        curriculumVersion: body.curriculumVersion,
        techStackNotes: body.techStackNotes,
        tuitionVnd: body.tuitionVnd,
        maxSeats: body.maxSeats ?? 35,
        enrollmentOpenAt: body.enrollmentOpenAt ? new Date(body.enrollmentOpenAt) : new Date(),
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        scheduleSlots: typedSlots,
        status: 'OPENING',
      })
      .returning();

    const syllabus = Array.isArray(course.syllabusTemplate) ? course.syllabusTemplate : [];
    const sessionCount = syllabus.length > 0 ? syllabus.length : 6;
    const baseStartMs = Date.parse(`${normalizedStartDate}T00:00:00Z`);

    // Generate concrete scheduledStart/scheduledEnd timestamps aligned with scheduleSlots (ICT UTC+7)
    const generatedDates: Array<{ start: Date; end: Date }> = [];
    let cursorDayOffset = 0;
    while (generatedDates.length < sessionCount && cursorDayOffset < 180) {
      const dayMs = baseStartMs + cursorDayOffset * 86400000;
      const d = new Date(dayMs);
      const dayOfWeek = d.getUTCDay();
      const slot =
        typedSlots.find((s) => s.dayOfWeek === dayOfWeek) ||
        (typedSlots.length === 0 && (dayOfWeek === 2 || dayOfWeek === 5)
          ? { dayOfWeek, startTime: '19:30', endTime: '21:30' }
          : undefined);
      if (slot) {
        const dateStr = d.toISOString().slice(0, 10);
        const startDt = new Date(`${dateStr}T${slot.startTime}:00+07:00`);
        const endDt = new Date(`${dateStr}T${slot.endTime}:00+07:00`);
        generatedDates.push({ start: startDt, end: endDt });
      }
      cursorDayOffset += 1;
    }

    const insertedSessions = [];
    for (let idx = 0; idx < sessionCount; idx++) {
      const mod = (syllabus[idx] || {}) as {
        order?: number;
        title?: string;
        description?: string;
        summary?: string;
        topics?: string[];
      };
      const ordNum = mod.order ?? idx + 1;
      const ordPad = String(ordNum).padStart(2, '0');
      const dtPair = generatedDates[idx];
      const [sess] = await db
        .insert(classSessions)
        .values({
          cohortId: created!.id,
          instructorId: instructorIdNum,
          sessionOrder: ordNum,
          title: mod.title || `Buổi ${ordNum}: Chuyên đề thực hành`,
          descriptionMd:
            mod.summary ||
            mod.description ||
            (Array.isArray(mod.topics) ? mod.topics.join(', ') : ''),
          scheduledStart: dtPair?.start ?? null,
          scheduledEnd: dtPair?.end ?? null,
          livekitRoomName: `${created!.code.toLowerCase()}-s${ordPad}`,
          activityTags: ['THEORY', 'LIVE_CODING'],
          status: 'SCHEDULED',
          durationSeconds: null,
        })
        .returning();
      if (sess) insertedSessions.push(sess);
    }

    // Create DRAFT session quizzes + DRAFT Final Exam so the new cohort is 100% assessment-ready!
    if (insertedSessions.length > 0) {
      await db.insert(assessments).values([
        ...insertedSessions.map((sess) => ({
          cohortId: created!.id,
          sessionId: sess.id,
          purpose: 'SESSION_ASSIGNMENT' as const,
          gradingMode: 'AUTO' as const,
          title: `Bài kiểm tra Buổi ${sess.sessionOrder}: ${sess.title}`,
          durationMinutes: 15,
          passScorePct: 70,
          maxAttempts: 5,
          status: 'DRAFT' as const,
        })),
        {
          cohortId: created!.id,
          sessionId: null,
          purpose: 'FINAL_EXAM' as const,
          gradingMode: 'AUTO' as const,
          title: `Kỳ thi Sát hạch Tốt nghiệp: ${course.title} (${created!.code})`,
          durationMinutes: 45,
          passScorePct: 70,
          maxAttempts: 3,
          status: 'DRAFT' as const,
        },
      ]);
    }

    const getStaffForInstructor = await buildInstructorStaffMap();
    const staffInfo = getStaffForInstructor(instructorIdNum);
    const labels = formatScheduleLabels(created!.scheduleSlots || []);

    const cohortDto = {
      id: String(created!.id),
      courseId: String(created!.courseId),
      instructorId: String(created!.instructorId),
      courseSlug: course?.slug || '',
      courseTitle: course?.title || created!.name,
      code: created!.code,
      name: created!.name,
      status: created!.status,
      curriculumVersion: created!.curriculumVersion,
      techStackNotes: created!.techStackNotes,
      tuitionVnd: created!.tuitionVnd,
      enrolledCount: created!.enrolledCount,
      enrollmentOpenAt: created!.enrollmentOpenAt.toISOString(),
      startDate: created!.startDate,
      endDate: created!.endDate,
      scheduleLabel: labels.scheduleLabel,
      timeRangeLabel: labels.timeRangeLabel,
      scheduleSlots: created!.scheduleSlots || [],
      instructorName: staffInfo.instructorName,
      instructorHeadline: staffInfo.instructorHeadline,
      instructorAvatarUrl: staffInfo.instructorAvatarUrl,
      staff: staffInfo.staff,
    };

    res.status(201).json({
      cohortId: String(created!.id),
      code: created!.code,
      status: 'CREATED',
      instructorId: String(created!.instructorId),
      curriculumVersion: created!.curriculumVersion,
      scheduleSlots: created!.scheduleSlots,
      cohort: cohortDto,
      payload: body,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `PUT /api/v1/admin/users` — Phân quyền vai trò (`STUDENT` / `INSTRUCTOR` / `ADMIN`), khóa/mở khóa tài khoản (`LOCKED` / `ACTIVE`) và cập nhật họ tên.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.manageUsers()`. Ghi DB: `accounts`, `user_profiles`.
 */
// 8.4 PUT /admin/users
const updateUserSchema = z.object({
  userId: z.union([z.number(), z.string()]),
  role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'LOCKED']).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  roleDetail: z.string().optional(),
  cohortAssigned: z.string().optional(),
});

adminRouter.put('/admin/users', validate(updateUserSchema), async (req, res, next) => {
  try {
    const { userId: rawUserId, role, status, isActive, fullName, email } = req.body;
    const userId = Number(rawUserId);

    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, userId))
      .limit(1);

    if (!existing) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản',
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy tài khoản',
        },
      });
      return;
    }

    const nextStatus =
      status ?? (isActive !== undefined ? (isActive ? 'ACTIVE' : 'LOCKED') : existing.status);

    const [updated] = await db
      .update(accounts)
      .set({
        role: role ?? existing.role,
        status: nextStatus,
        email: email ? email.trim().toLowerCase() : existing.email,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, userId))
      .returning();

    if (fullName) {
      await db
        .update(userProfiles)
        .set({ fullName, updatedAt: new Date() })
        .where(eq(userProfiles.accountId, userId));
    }

    res.json({
      userId: String(updated!.id),
      email: updated!.email,
      role: updated!.role,
      status: updated!.status,
      isActive: updated!.status === 'ACTIVE',
      updated: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/admin/accounts` — Tạo trực tiếp tài khoản mới (Học viên, Giảng viên kèm `instructor_profiles`, hoặc Quản trị viên) trong Transaction ACID.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.createAccount()`. Ghi DB: `accounts`, `account_identities`, `user_profiles`, `instructor_profiles`.
 */
// 8.5 POST /admin/accounts
const createAccountSchema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').default('3tAcademy@2026'),
  role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().optional(),
  careerGoal: z.string().optional(),
  interviewCredits: z.number().int().min(0).optional(),
  instructorHeadline: z.string().optional(),
  instructorOrganization: z.string().optional(),
  instructorYearsOfExperience: z.number().int().min(0).optional(),
  yearsOfExperience: z.number().int().min(0).optional(),
  instructorExpertiseSummaryMd: z.string().optional(),
  expertiseSummaryMd: z.string().optional(),
  instructorSocialLinks: z.record(z.string()).optional(),
});

adminRouter.post('/admin/accounts', validate(createAccountSchema), async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role,
      phone,
      avatarUrl: reqAvatarUrl,
      bio,
      careerGoal,
      interviewCredits,
      instructorHeadline,
      instructorOrganization,
      instructorYearsOfExperience,
      yearsOfExperience,
      instructorExpertiseSummaryMd,
      expertiseSummaryMd,
      instructorSocialLinks,
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    if (role === 'INSTRUCTOR' && (!instructorHeadline || instructorHeadline.trim().length < 2)) {
      const message = 'Vui lòng nhập Chức danh chuyên môn (Headline) cho tài khoản Giảng viên';
      res.status(400).json({
        success: false,
        status: 400,
        code: 'INSTRUCTOR_HEADLINE_REQUIRED',
        message,
        error: {
          code: 'INSTRUCTOR_HEADLINE_REQUIRED',
          message,
        },
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, normalizedEmail))
      .limit(1);

    if (existing) {
      const message = 'Email này đã tồn tại trong hệ thống';
      res.status(409).json({
        success: false,
        status: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message,
        },
      });
      return;
    }

    const passwordHash = await argon2.hash(password);
    const defaultCredits = interviewCredits ?? 0;
    const expYears = instructorYearsOfExperience ?? yearsOfExperience ?? 5;
    const expSummary = instructorExpertiseSummaryMd || expertiseSummaryMd || '';

    const createdAccount = await db.transaction(async (tx) => {
      const [acc] = await tx
        .insert(accounts)
        .values({
          email: normalizedEmail,
          passwordHash,
          role,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        })
        .returning();

      await tx.insert(accountIdentities).values({
        accountId: acc!.id,
        provider: 'LOCAL',
        providerUid: `local-${normalizedEmail}`,
        providerEmail: normalizedEmail,
      });

      await tx.insert(userProfiles).values({
        accountId: acc!.id,
        fullName,
        phone: phone || null,
        avatarUrl: reqAvatarUrl || null,
        bio:
          bio ||
          (role === 'INSTRUCTOR'
            ? instructorHeadline
            : role === 'ADMIN'
              ? 'Quản trị viên Hệ thống 3T Academy'
              : 'Học viên tại 3T AI Academy'),
        careerGoal: careerGoal || undefined,
        interviewCredits: defaultCredits,
        cvParsedData: {
          fullName,
          email: normalizedEmail,
          phone: phone || '',
          avatarUrl: reqAvatarUrl || '',
          headline: instructorHeadline || bio || '',
          skills: [],
          projects: [],
          workExperience: [],
          education: [],
          awardsAndCerts: [],
        },
      });

      if (role === 'INSTRUCTOR') {
        await tx.insert(instructorProfiles).values({
          accountId: acc!.id,
          headline: instructorHeadline!.trim(),
          organization: instructorOrganization || '3T AI Academy',
          yearsOfExperience: expYears,
          expertiseSummaryMd: expSummary,
          socialLinks: instructorSocialLinks || {},
        });
      }

      return acc!;
    });

    const roleCategory: 'Học viên' | 'Giảng viên' | 'Quản trị viên' =
      role === 'INSTRUCTOR'
        ? 'Giảng viên'
        : role === 'ADMIN'
          ? 'Quản trị viên'
          : 'Học viên';

    res.status(201).json({
      success: true,
      account: {
        id: String(createdAccount.id),
        fullName,
        email: createdAccount.email,
        phone: phone || '',
        role: createdAccount.role,
        roleCategory,
        roleDetail:
          instructorHeadline ||
          bio ||
          (role === 'ADMIN' ? 'Quản trị viên Hệ thống' : 'Học viên'),
        cohortAssigned: 'Chưa phân lớp',
        locked: false,
        status: createdAccount.status,
        isActive: true,
        avatarUrl: reqAvatarUrl,
        createdAt: createdAccount.createdAt.toLocaleDateString('vi-VN'),
        lastLoginAt: 'Mới khởi tạo',
        interviewCredits: defaultCredits,
        instructorHeadline: role === 'INSTRUCTOR' ? instructorHeadline : undefined,
        instructorOrganization:
          role === 'INSTRUCTOR' ? instructorOrganization || '3T AI Academy' : undefined,
        instructorYearsOfExperience: role === 'INSTRUCTOR' ? expYears : undefined,
        yearsOfExperience: role === 'INSTRUCTOR' ? expYears : undefined,
        instructorExpertiseSummaryMd: role === 'INSTRUCTOR' ? expSummary : undefined,
        assignedCohorts: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/admin/enrollments/manual` — Quản trị viên kích hoạt ghi danh thủ công cho học viên (chuyển khoản ngoài luồng/học bổng)
 * kèm cập nhật sĩ số `cohorts.enrolled_count`, tạo đơn `PAID` đối soát và cộng thưởng `+4` lượt Phỏng vấn AI trong Transaction ACID.
 * - **Liên kết luồng:** Ghi DB: `orders`, `enrollments`, `cohorts`, `user_profiles`, `notifications`.
 */
// 8.6 POST /admin/enrollments/manual
const manualEnrollSchema = z.object({
  email: z.string().email(),
  fullName: z.string().optional(),
  cohortId: z.union([z.number(), z.string()]),
  note: z.string().optional(),
});

adminRouter.post(
  '/admin/enrollments/manual',
  validate(manualEnrollSchema),
  async (req, res, next) => {
    try {
      const { email, fullName, cohortId: rawCohortId } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const cohort = await resolveCohort(rawCohortId);
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

      let [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.email, normalizedEmail))
        .limit(1);

      if (!account) {
        const passwordHash = await argon2.hash('Student@123');
        const studentName = fullName || normalizedEmail.split('@')[0] || 'Học viên Mới';
        account = await db.transaction(async (tx) => {
          const [createdAcc] = await tx
            .insert(accounts)
            .values({
              email: normalizedEmail,
              passwordHash,
              role: 'STUDENT',
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            })
            .returning();

          await tx.insert(accountIdentities).values({
            accountId: createdAcc!.id,
            provider: 'LOCAL',
            providerUid: `local-${normalizedEmail}`,
            providerEmail: normalizedEmail,
          });

          await tx.insert(userProfiles).values({
            accountId: createdAcc!.id,
            fullName: studentName,
            bio: 'Học viên tại 3T AI Academy',
            interviewCredits: 0,
            cvParsedData: {
              fullName: studentName,
              email: normalizedEmail,
              phone: '',
              skills: [],
              projects: [],
              workExperience: [],
              education: [],
              awardsAndCerts: [],
            },
          });

          return createdAcc!;
        });
      }

      const [enrollment] = await db.transaction(async (tx) => {
        const [existingEnr] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.accountId, account!.id),
              eq(enrollments.cohortId, cohort.id)
            )
          )
          .limit(1);

        const isNewlyEnrolled = !existingEnr || existingEnr.status === 'REVOKED';

        const [enr] = await tx
          .insert(enrollments)
          .values({
            accountId: account!.id,
            cohortId: cohort.id,
            enrolledByAdmin: req.user!.id,
            status: existingEnr?.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
          })
          .onConflictDoUpdate({
            target: [enrollments.accountId, enrollments.cohortId],
            set: {
              status: existingEnr?.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
              enrolledByAdmin: req.user!.id,
            },
          })
          .returning();

        await tx
          .update(cohorts)
          .set({
            enrolledCount: sql`(SELECT COUNT(*)::int FROM enrollments WHERE cohort_id = ${cohort.id} AND status <> 'REVOKED')`,
            updatedAt: new Date(),
          })
          .where(eq(cohorts.id, cohort.id));

        if (isNewlyEnrolled) {
          await tx
            .update(userProfiles)
            .set({
              interviewCredits: sql`${userProfiles.interviewCredits} + 4`,
              updatedAt: new Date(),
            })
            .where(eq(userProfiles.accountId, account!.id));
        }

        return [enr!];
      });

      const [prof] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.accountId, account.id))
        .limit(1);

      res.status(201).json({
        enrollmentId: String(enrollment!.id),
        accountId: String(account.id),
        cohortId: String(cohort.id),
        cohortCode: cohort.code,
        status: enrollment!.status,
        enrollment: {
          id: String(enrollment!.id),
          userId: String(account.id),
          accountId: String(account.id),
          studentName: prof?.fullName || fullName || account.email,
          studentEmail: account.email,
          cohortId: String(cohort.id),
          cohortCode: cohort.code,
          status: 'ACTIVE',
          progressPercent: 0,
          completedSessionsCount: 0,
          totalSessionsCount: 6,
          missingQuizzesCount: 6,
          avgScorePct: 0,
          finalExamPassed: false,
          dropoutRiskScore: 0,
          riskLevel: 'LOW',
          lastActivityAt: 'Vừa ghi danh',
          enrolledAt: enrollment!.enrolledAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/admin/certificates/issue` — Cấp phát hàng loạt (hoặc khôi phục) Chứng chỉ tốt nghiệp ký số **HMAC-SHA256** trong Transaction ACID.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.issueCertificatesBatch(enrollmentIds)`. Ghi DB: `certificates`, `enrollments`.
 */
// 8.7 POST /admin/certificates/issue
const issueCertificatesSchema = z.object({
  enrollmentIds: z.array(z.union([z.number(), z.string()])).min(1),
  cohortCode: z.string().optional(),
});

adminRouter.post(
  '/admin/certificates/issue',
  validate(issueCertificatesSchema),
  async (req, res, next) => {
    try {
      const { enrollmentIds, cohortCode } = req.body;
      const issuedCodes: string[] = [];
      const targetCohort = cohortCode ? await resolveCohort(cohortCode) : undefined;

      await db.transaction(async (tx) => {
        for (const rawEnrId of enrollmentIds) {
          const numId = Number(rawEnrId);
          let enr: typeof enrollments.$inferSelect | undefined;

          if (Number.isInteger(numId) && numId > 0) {
            [enr] = await tx
              .select()
              .from(enrollments)
              .where(eq(enrollments.id, numId))
              .limit(1);
          } else if (typeof rawEnrId === 'string' && rawEnrId.includes('@')) {
            // Support email fallback if UI passes studentEmail
            const [acc] = await tx
              .select()
              .from(accounts)
              .where(eq(accounts.email, rawEnrId.trim().toLowerCase()))
              .limit(1);
            if (acc) {
              const userEnrs = await tx
                .select()
                .from(enrollments)
                .where(eq(enrollments.accountId, acc.id));
              enr = targetCohort
                ? userEnrs.find((e) => e.cohortId === targetCohort.id)
                : userEnrs[0];
            }
          }

          if (!enr) continue;

          const [existingCert] = await tx
            .select()
            .from(certificates)
            .where(eq(certificates.enrollmentId, enr.id))
            .limit(1);

          const now = new Date();
          let certRecord = existingCert;
          if (!certRecord) {
            const certCode = `3T-CERT-${now.getFullYear()}-${enr.id}-${enr.accountId}`;
            const hmacSig = crypto
              .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
              .update(`${enr.id}:${enr.accountId}:${certCode}`)
              .digest('hex');

            const [createdCert] = await tx
              .insert(certificates)
              .values({
                enrollmentId: enr.id,
                accountId: enr.accountId,
                certificateCode: certCode,
                hmacSignature: hmacSig,
                issuedAt: now,
              })
              .returning();
            certRecord = createdCert!;

            await tx
              .update(enrollments)
              .set({
                status: 'COMPLETED',
                finalExamPassed: true,
                completedAt: now,
              })
              .where(eq(enrollments.id, enr.id));
          } else if (certRecord.revokedAt) {
            const [restoredCert] = await tx
              .update(certificates)
              .set({ revokedAt: null, revokeReason: null })
              .where(eq(certificates.id, certRecord.id))
              .returning();
            certRecord = restoredCert!;
          }

          issuedCodes.push(certRecord.certificateCode);
        }
      });

      const allCertRecords = await buildCertificateRecords();
      const issuedCertificates: Record<string, (typeof allCertRecords)[number]> = {};
      for (const cRec of allCertRecords) {
        if (issuedCodes.includes(cRec.certificateCode)) {
          issuedCertificates[cRec.certificateCode] = cRec;
        }
      }

      res.status(201).json({
        issuedCount: issuedCodes.length,
        certificateCodes: issuedCodes,
        issuedCertificates,
        bonusInterviewCreditsAdded: 0,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `PUT /api/v1/admin/certificates/:certificateCode/revoke` — Thu hồi hoặc khôi phục hiệu lực một Chứng chỉ trên sổ cái xác thực.
 * - **Liên kết luồng:** Frontend gọi từ `adminApi.toggleCertificateRevoke(certificateCode)`. Ghi DB: `certificates`.
 */
// 8.8 PUT /admin/certificates/:certificateCode/revoke
const revokeCertSchema = z.object({
  isRevoked: z.boolean().optional(),
  reason: z.string().optional(),
});

adminRouter.put(
  '/admin/certificates/:certificateCode/revoke',
  validate(revokeCertSchema),
  async (req, res, next) => {
    try {
      const certificateCode = String(req.params.certificateCode || '').trim();
      const { isRevoked: reqIsRevoked, reason } = req.body || {};

      const [existing] = await db
        .select()
        .from(certificates)
        .where(eq(certificates.certificateCode, certificateCode))
        .limit(1);

      if (!existing) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Không tìm thấy chứng chỉ cần cập nhật',
          error: {
            code: 'CERTIFICATE_NOT_FOUND',
            message: 'Không tìm thấy chứng chỉ cần cập nhật',
          },
        });
        return;
      }

      const nextRevokedState =
        reqIsRevoked !== undefined ? reqIsRevoked : !Boolean(existing.revokedAt);
      const now = new Date();

      const [updated] = await db
        .update(certificates)
        .set({
          revokedAt: nextRevokedState ? now : null,
          revokeReason: nextRevokedState
            ? reason || 'Thu hồi theo quyết định của Hội đồng Đào tạo 3T Academy'
            : null,
        })
        .where(eq(certificates.id, existing.id))
        .returning();

      const allCertRecords = await buildCertificateRecords(existing.accountId);
      const matchedRecord = allCertRecords.find(
        (c) => c.certificateCode === updated!.certificateCode
      );

      res.json({
        certificateCode: updated!.certificateCode,
        isRevoked: Boolean(updated!.revokedAt),
        revokedAt: updated!.revokedAt ? updated!.revokedAt.toLocaleDateString('vi-VN') : undefined,
        revokedReason: updated!.revokeReason || undefined,
        revokeReason: updated!.revokeReason || undefined,
        certificate: matchedRecord || null,
      });
    } catch (err) {
      next(err);
    }
  }
);
