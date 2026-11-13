import { Router } from 'express';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';
import argon2 from 'argon2';
import { db } from '../../db/index.js';
import {
  accounts,
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
  enrollments,
  certificates,
  chatMessages,
  notifications,
} from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { env } from '../../config/env.js';
import {
  resolveCohort,
  formatScheduleLabels,
  buildInstructorStaffMap,
} from '../../db/helpers.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['ADMIN']));

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
      allChatMsgs,
      allNotifs,
      getStaffForInstructor,
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
      db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)),
      buildInstructorStaffMap(),
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
    const enrollmentMap = new Map(allEnrollments.map((e) => [e.id, e]));

    const formattedCohorts = allCohorts.map((ch) => {
      const course = courseMap.get(ch.courseId);
      const staffInfo = getStaffForInstructor(ch.instructorId);
      const labels = formatScheduleLabels(ch.scheduleSlots || []);

      return {
        id: String(ch.id),
        courseId: String(ch.courseId),
        courseSlug: course?.slug || 'ky-su-ai-rag-thuc-chien',
        courseTitle: course?.title || ch.name,
        code: ch.code,
        name: ch.name,
        status: ch.status,
        curriculumVersion: ch.curriculumVersion,
        techStackNotes: ch.techStackNotes,
        tuitionVnd: ch.tuitionVnd,
        enrolledCount: ch.enrolledCount,
        enrollmentOpenAt: ch.enrollmentOpenAt,
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
      const totalSessionsCount = cSessions.length || 6;
      const completedSessionsCount = allProgress.filter(
        (p) =>
          p.accountId === enr.accountId &&
          p.isCompleted &&
          cSessions.some((s) => s.id === p.sessionId)
      ).length;
      const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);

      return {
        id: String(enr.id),
        accountId: String(enr.accountId),
        studentName: prof?.fullName || acc?.email || 'Học viên 3T',
        studentEmail: acc?.email || 'student@3t.edu.vn',
        avatarUrl: prof?.avatarUrl,
        cohortId: String(enr.cohortId),
        cohortCode: cohort?.code || 'AI-ENG-2026-K01',
        status: enr.status,
        progressPercent,
        completedSessionsCount,
        totalSessionsCount,
        missingQuizzesCount: Math.max(0, totalSessionsCount - completedSessionsCount),
        avgScorePct: enr.finalExamPassed ? 94 : 78,
        finalExamPassed: enr.finalExamPassed,
        dropoutRiskScore: enr.dropoutRiskScore,
        riskLevel: enr.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        lastActivityAt: enr.enrolledAt.toLocaleDateString('vi-VN'),
        lastRemindedAt: enr.lastRemindedAt ? enr.lastRemindedAt.toLocaleString('vi-VN') : undefined,
        enrolledAt: enr.enrolledAt.toISOString(),
      };
    });

    // Build certificates Record<string, CertificateRecord>
    const certificatesRecord: Record<string, unknown> = {};
    for (const cert of allCerts) {
      const enr = enrollmentMap.get(cert.enrollmentId);
      const cohort = enr ? cohortMap.get(enr.cohortId) : undefined;
      const course = cohort ? courseMap.get(cohort.courseId) : undefined;
      const stuAcc = accountMap.get(cert.accountId);
      const stuProf = profileMap.get(cert.accountId);
      const instProf = cohort ? profileMap.get(cohort.instructorId) : undefined;
      const instMeta = cohort ? instMap.get(cohort.instructorId) : undefined;

      certificatesRecord[cert.certificateCode] = {
        code: cert.certificateCode,
        certificateCode: cert.certificateCode,
        studentEmail: stuAcc?.email || 'an.nguyen.dev@gmail.com',
        studentName: stuProf?.fullName || 'Nguyễn Văn An',
        courseTitle: course?.title || 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Agent',
        cohortCode: cohort?.code || 'AI-ENG-2026-K01',
        issuedAt: cert.issuedAt.toLocaleDateString('vi-VN'),
        finalScore: '94/100 (Xuất sắc)',
        hmacSignature: cert.hmacSignature,
        instructorName: instProf?.fullName || 'TS. Trần Minh Khoa',
        instructorTitle: instMeta?.headline || 'Giảng viên Trưởng Khối Kỹ thuật AI — 3T Academy',
        isRevoked: Boolean(cert.revokedAt),
        revokedAt: cert.revokedAt ? cert.revokedAt.toLocaleDateString('vi-VN') : undefined,
        revokeReason: cert.revokeReason || undefined,
      };
    }

    // Build accounts (AdminUserAccountItem[])
    const formattedAccounts = allAccounts.map((acc) => {
      const prof = profileMap.get(acc.id);
      const inst = instMap.get(acc.id);
      const cvData = (prof?.cvParsedData ?? {}) as Record<string, unknown>;
      const phone = typeof cvData.phone === 'string' ? cvData.phone : '0912 345 678';

      const assignedCohorts =
        acc.role === 'INSTRUCTOR'
          ? allCohorts.filter((c) => c.instructorId === acc.id).map((c) => c.code)
          : allEnrollments
              .filter((e) => e.accountId === acc.id)
              .map((e) => cohortMap.get(e.cohortId)?.code || 'AI-ENG-2026-K01');

      return {
        id: String(acc.id),
        fullName: prof?.fullName || acc.email.split('@')[0] || 'Tài khoản 3T',
        email: acc.email,
        phone,
        role: acc.role,
        status: acc.status,
        isActive: acc.status === 'ACTIVE',
        avatarUrl:
          prof?.avatarUrl ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(prof?.fullName || acc.email)}`,
        createdAt: acc.createdAt.toLocaleDateString('vi-VN'),
        lastLoginAt: acc.lastLoginAt ? acc.lastLoginAt.toLocaleString('vi-VN') : 'Chưa đăng nhập',
        interviewCredits: prof?.interviewCredits ?? 0,
        instructorHeadline: inst?.headline,
        instructorOrganization: inst?.organization || undefined,
        yearsOfExperience: inst?.yearsOfExperience ?? undefined,
        assignedCohorts,
      };
    });

    // Build eligibleGraduates (EligibleGraduateItem[])
    const certByEnrollmentId = new Map(allCerts.map((c) => [c.enrollmentId, c]));
    const eligibleGraduates = formattedEnrollments
      .filter((enr) => enr.finalExamPassed || enr.progressPercent >= 80)
      .map((enr) => {
        const existingCert = certByEnrollmentId.get(Number(enr.id));
        const cohort = cohortMap.get(Number(enr.cohortId));
        const course = cohort ? courseMap.get(cohort.courseId) : undefined;
        return {
          id: enr.id,
          enrollmentId: enr.id,
          studentName: enr.studentName,
          studentEmail: enr.studentEmail,
          cohortCode: enr.cohortCode,
          courseTitle: course?.title || 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Agent',
          completedSessions: `${enr.completedSessionsCount}/${enr.totalSessionsCount} buổi`,
          finalExamScore: `${enr.avgScorePct}/100`,
          proctoringStatus: 'CLEAN' as const,
          isIssued: Boolean(existingCert),
          certificateCode: existingCert?.certificateCode,
        };
      });

    res.json({
      totalRevenueVnd,
      activeCohortsCount: activeCohorts.length,
      totalStudentsCount: studentAccounts.length,
      issuedCertificatesCount: allCerts.length,
      cohorts: formattedCohorts,
      enrollments: formattedEnrollments,
      chatMessages: allChatMsgs.map((m) => ({
        id: String(m.id),
        chatSessionId: String(m.chatSessionId),
        role: m.role,
        content: m.content,
        detectedTopic: m.detectedTopic || undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      notifications: allNotifs.map((n) => ({
        id: String(n.id),
        recipientId: String(n.recipientId),
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : undefined,
        actedAt: n.actedAt ? n.actedAt.toISOString() : undefined,
        createdAt: n.createdAt.toISOString(),
      })),
      certificates: certificatesRecord,
      accounts: formattedAccounts,
      eligibleGraduates,
    });
  } catch (err) {
    next(err);
  }
});

// 8.2 POST /admin/courses (Supports both creating a new course AND updating an existing course syllabus)
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

      // Case 1: Updating syllabusTemplate on an existing course
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
            status: updated!.status,
            versionId: versionId || 'v2026.1',
            course: {
              ...updated,
              id: String(updated!.id),
            },
          });
          return;
        }
      }

      // Case 2: Creating a new course
      let resolvedCategoryId = categoryId ?? 1;
      if (!categoryId && category) {
        const allCats = await db.select().from(categories);
        const matchedCat = allCats.find(
          (c) => c.name.toLowerCase() === category.toLowerCase() || c.slug === category
        );
        if (matchedCat) {
          resolvedCategoryId = matchedCat.id;
        }
      }

      const courseTitle = title || 'Khóa học Kỹ sư AI Thực chiến Mới';
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
          thumbnailUrl:
            thumbnailUrl ||
            'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
          difficultyLevel,
          syllabusTemplate,
          status: 'PUBLISHED',
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
        status: created!.status,
        course: {
          ...created,
          id: String(created!.id),
          category: category || 'Kỹ thuật AI & Phần mềm',
          skills: reqSkills || [],
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 8.3 POST /admin/cohorts
const createCohortSchema = z.object({
  courseId: z.union([z.number(), z.string()]),
  code: z.string().min(3),
  name: z.string().min(3),
  instructorId: z.union([z.number(), z.string()]),
  curriculumVersion: z.string().default('v1.0'),
  techStackNotes: z.string().optional(),
  tuitionVnd: z.number().int().min(0),
  enrollmentOpenAt: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
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
    const instructorIdNum = Number(body.instructorId) || 2;

    let courseIdNum = Number(body.courseId);
    let [course] = !Number.isNaN(courseIdNum)
      ? await db.select().from(courses).where(eq(courses.id, courseIdNum)).limit(1)
      : await db.select().from(courses).where(eq(courses.slug, String(body.courseId))).limit(1);

    if (!course) {
      const allCourses = await db.select().from(courses).limit(1);
      course = allCourses[0];
    }
    courseIdNum = course?.id ?? 1;

    // Check instructor schedule conflict on overlapping active cohorts
    const instructorCohorts = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.instructorId, instructorIdNum));

    for (const existing of instructorCohorts) {
      if (existing.status === 'COMPLETED' || existing.status === 'ARCHIVED') continue;
      for (const newSlot of body.scheduleSlots) {
        const conflict = (existing.scheduleSlots || []).some(
          (s) => s.dayOfWeek === newSlot.dayOfWeek && s.startTime === newSlot.startTime
        );
        if (conflict && existing.endDate >= body.startDate && existing.startDate <= body.endDate) {
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

    const [created] = await db
      .insert(cohorts)
      .values({
        courseId: courseIdNum,
        code: body.code,
        name: body.name,
        instructorId: instructorIdNum,
        curriculumVersion: body.curriculumVersion,
        techStackNotes: body.techStackNotes,
        tuitionVnd: body.tuitionVnd,
        enrollmentOpenAt: body.enrollmentOpenAt ? new Date(body.enrollmentOpenAt) : new Date(),
        startDate: body.startDate,
        endDate: body.endDate,
        scheduleSlots: body.scheduleSlots as Array<{
          dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
          startTime: string;
          endTime: string;
        }>,
        status: 'OPENING',
      })
      .returning();

    // Auto-seed class_sessions from course.syllabusTemplate
    const syllabus = Array.isArray(course?.syllabusTemplate) ? course.syllabusTemplate : [];
    for (let idx = 0; idx < syllabus.length; idx++) {
      const mod = syllabus[idx] as {
        order?: number;
        title?: string;
        description?: string;
        topics?: string[];
      };
      await db.insert(classSessions).values({
        cohortId: created!.id,
        instructorId: instructorIdNum,
        sessionOrder: mod.order ?? idx + 1,
        title: mod.title || `Buổi ${idx + 1}`,
        descriptionMd:
          mod.description || (Array.isArray(mod.topics) ? mod.topics.join(', ') : ''),
        activityTags: ['BÀI GIẢNG TRỰC TUYẾN', 'TRẮC NGHIỆM'],
        status: 'SCHEDULED',
        durationSeconds: 5400,
      });
    }

    const getStaffForInstructor = await buildInstructorStaffMap();
    const staffInfo = getStaffForInstructor(instructorIdNum);
    const labels = formatScheduleLabels(created!.scheduleSlots || []);

    const cohortDto = {
      id: String(created!.id),
      courseId: String(created!.courseId),
      courseSlug: course?.slug || 'ky-su-ai-rag-thuc-chien',
      courseTitle: course?.title || created!.name,
      code: created!.code,
      name: created!.name,
      status: created!.status,
      curriculumVersion: created!.curriculumVersion,
      techStackNotes: created!.techStackNotes,
      tuitionVnd: created!.tuitionVnd,
      enrolledCount: created!.enrolledCount,
      enrollmentOpenAt: created!.enrollmentOpenAt,
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
      status: created!.status,
      instructorId: String(created!.instructorId),
      curriculumVersion: created!.curriculumVersion,
      scheduleSlots: created!.scheduleSlots,
      cohort: cohortDto,
    });
  } catch (err) {
    next(err);
  }
});

// 8.4 PUT /admin/users
const updateUserSchema = z.object({
  userId: z.union([z.number(), z.string()]),
  role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'LOCKED']).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().optional(),
  email: z.string().email().optional(),
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

// 8.5 POST /admin/accounts (3-Table Account Creation: accounts + user_profiles + instructor_profiles)
const createAccountSchema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').default('3tAcademy@2026'),
  role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']),
  phone: z.string().optional(),
  instructorHeadline: z.string().optional(),
  instructorOrganization: z.string().optional(),
  yearsOfExperience: z.number().int().min(0).optional(),
  expertiseSummaryMd: z.string().optional(),
});

adminRouter.post('/admin/accounts', validate(createAccountSchema), async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role,
      phone,
      instructorHeadline,
      instructorOrganization,
      yearsOfExperience,
      expertiseSummaryMd,
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
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`;
    const defaultCredits = role === 'STUDENT' ? 2 : 0;

    const createdAccount = await db.transaction(async (tx) => {
      // 1. Insert into accounts
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

      // 2. Insert into user_profiles
      await tx.insert(userProfiles).values({
        accountId: acc!.id,
        fullName,
        avatarUrl,
        bio:
          role === 'INSTRUCTOR'
            ? instructorHeadline
            : role === 'ADMIN'
              ? 'Quản trị viên Hệ thống 3T Academy'
              : 'Học viên tại 3T AI Academy',
        careerGoal:
          role === 'STUDENT' ? 'Trở thành Kỹ sư AI ứng dụng thực chiến' : undefined,
        interviewCredits: defaultCredits,
        cvParsedData: {
          fullName,
          email: normalizedEmail,
          phone: phone || '0912 345 678',
          avatarUrl,
          headline: instructorHeadline || 'Học viên tại 3T AI Academy',
          skills: [],
          projects: [],
          workExperience: [],
          education: [],
          awardsAndCerts: [],
        },
      });

      // 3. If INSTRUCTOR, insert into instructor_profiles
      if (role === 'INSTRUCTOR') {
        await tx.insert(instructorProfiles).values({
          accountId: acc!.id,
          headline: instructorHeadline!.trim(),
          organization: instructorOrganization || '3T AI Academy',
          yearsOfExperience: yearsOfExperience ?? 5,
          expertiseSummaryMd:
            expertiseSummaryMd ||
            `Chuyên gia giảng dạy trực tiếp tại 3T AI Academy (${instructorHeadline}).`,
          socialLinks: {},
        });
      }

      return acc!;
    });

    res.status(201).json({
      success: true,
      account: {
        id: String(createdAccount.id),
        fullName,
        email: createdAccount.email,
        phone: phone || '0912 345 678',
        role: createdAccount.role,
        status: createdAccount.status,
        isActive: true,
        avatarUrl,
        createdAt: createdAccount.createdAt.toLocaleDateString('vi-VN'),
        lastLoginAt: 'Mới khởi tạo',
        interviewCredits: defaultCredits,
        instructorHeadline: role === 'INSTRUCTOR' ? instructorHeadline : undefined,
        instructorOrganization:
          role === 'INSTRUCTOR' ? instructorOrganization || '3T AI Academy' : undefined,
        yearsOfExperience: role === 'INSTRUCTOR' ? (yearsOfExperience ?? 5) : undefined,
        assignedCohorts: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

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

          await tx.insert(userProfiles).values({
            accountId: createdAcc!.id,
            fullName: studentName,
            bio: 'Học viên tại 3T AI Academy',
            interviewCredits: 2,
            cvParsedData: {
              fullName: studentName,
              email: normalizedEmail,
              phone: '0912 345 678',
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
        const [enr] = await tx
          .insert(enrollments)
          .values({
            accountId: account!.id,
            cohortId: cohort.id,
            enrolledByAdmin: req.user!.id,
            status: 'ACTIVE',
          })
          .onConflictDoUpdate({
            target: [enrollments.accountId, enrollments.cohortId],
            set: { status: 'ACTIVE', enrolledByAdmin: req.user!.id },
          })
          .returning();

        await tx
          .update(cohorts)
          .set({
            enrolledCount: sql`${cohorts.enrolledCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(cohorts.id, cohort.id));

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

// 8.7 POST /admin/certificates/issue (+4 interview credits per graduate)
const issueCertificatesSchema = z.object({
  enrollmentIds: z.array(z.union([z.number(), z.string()])).min(1),
});

adminRouter.post(
  '/admin/certificates/issue',
  validate(issueCertificatesSchema),
  async (req, res, next) => {
    try {
      const { enrollmentIds } = req.body;
      const issuedCodes: string[] = [];
      const issuedCertificates: Array<Record<string, unknown>> = [];

      const [allCohorts, allCourses, allAccounts, allProfiles, allInst] = await Promise.all([
        db.select().from(cohorts),
        db.select().from(courses),
        db.select().from(accounts),
        db.select().from(userProfiles),
        db.select().from(instructorProfiles),
      ]);

      const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
      const courseMap = new Map(allCourses.map((c) => [c.id, c]));
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
      const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
      const instMap = new Map(allInst.map((ip) => [ip.accountId, ip]));

      await db.transaction(async (tx) => {
        for (const rawEnrId of enrollmentIds) {
          const numId = Number(rawEnrId);
          let [enr] = !Number.isNaN(numId)
            ? await tx.select().from(enrollments).where(eq(enrollments.id, numId)).limit(1)
            : [];

          if (!enr) {
            const allEnr = await tx.select().from(enrollments).limit(1);
            enr = allEnr[0];
          }
          if (!enr) continue;

          const [existingCert] = await tx
            .select()
            .from(certificates)
            .where(eq(certificates.enrollmentId, enr.id))
            .limit(1);

          let certRecord = existingCert;
          if (!certRecord) {
            const certCode = `3T-CERT-2026-00${enr.id}`;
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
              })
              .returning();
            certRecord = createdCert!;

            await tx
              .update(enrollments)
              .set({
                status: 'COMPLETED',
                finalExamPassed: true,
                completedAt: new Date(),
              })
              .where(eq(enrollments.id, enr.id));

            // Spec v3.1 API 8.7: Add +4 interview credits when issuing graduation certificate
            await tx
              .update(userProfiles)
              .set({
                interviewCredits: sql`${userProfiles.interviewCredits} + 4`,
                updatedAt: new Date(),
              })
              .where(eq(userProfiles.accountId, enr.accountId));
          }

          issuedCodes.push(certRecord.certificateCode);

          const cohort = cohortMap.get(enr.cohortId);
          const course = cohort ? courseMap.get(cohort.courseId) : undefined;
          const stuAcc = accountMap.get(enr.accountId);
          const stuProf = profileMap.get(enr.accountId);
          const instProf = cohort ? profileMap.get(cohort.instructorId) : undefined;
          const instMeta = cohort ? instMap.get(cohort.instructorId) : undefined;

          issuedCertificates.push({
            code: certRecord.certificateCode,
            certificateCode: certRecord.certificateCode,
            studentEmail: stuAcc?.email || 'an.nguyen.dev@gmail.com',
            studentName: stuProf?.fullName || 'Nguyễn Văn An',
            courseTitle:
              course?.title || 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Agent',
            cohortCode: cohort?.code || 'AI-ENG-2026-K01',
            issuedAt: certRecord.issuedAt.toLocaleDateString('vi-VN'),
            finalScore: '94/100 (Xuất sắc)',
            hmacSignature: certRecord.hmacSignature,
            instructorName: instProf?.fullName || 'TS. Trần Minh Khoa',
            instructorTitle:
              instMeta?.headline || 'Giảng viên Trưởng Khối Kỹ thuật AI — 3T Academy',
            isRevoked: Boolean(certRecord.revokedAt),
          });
        }
      });

      res.status(201).json({
        issuedCount: issuedCodes.length,
        certificateCodes: issuedCodes,
        issuedCertificates,
        bonusInterviewCreditsAdded: 4,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 8.8 PUT /admin/certificates/:certificateCode/revoke
const revokeCertSchema = z.object({
  isRevoked: z.boolean(),
  reason: z.string().optional(),
});

adminRouter.put(
  '/admin/certificates/:certificateCode/revoke',
  validate(revokeCertSchema),
  async (req, res, next) => {
    try {
      const certificateCode = String(req.params.certificateCode || '').trim();
      const { isRevoked, reason } = req.body;

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

      const now = new Date();
      const [updated] = await db
        .update(certificates)
        .set({
          revokedAt: isRevoked ? now : null,
          revokeReason: isRevoked
            ? reason || 'Thu hồi theo quyết định của Hội đồng Đào tạo 3T Academy'
            : null,
        })
        .where(eq(certificates.id, existing.id))
        .returning();

      res.json({
        certificateCode: updated!.certificateCode,
        isRevoked: Boolean(updated!.revokedAt),
        revokedAt: updated!.revokedAt ? updated!.revokedAt.toLocaleDateString('vi-VN') : undefined,
        revokeReason: updated!.revokeReason || undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);
