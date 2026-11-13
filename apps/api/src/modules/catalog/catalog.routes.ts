import { Router } from 'express';
import { eq, ilike, or, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  categories,
  courses,
  cohorts,
  skills,
  courseSkills,
  courseReviews,
  certificates,
  enrollments,
  accounts,
  userProfiles,
  instructorProfiles,
  knowledgeChunks,
  systemSettings,
  studentSkillStates,
  assessmentAttempts,
  assessments,
} from '../../db/schema/index.js';
import { validate } from '../../middlewares/validate.js';
import { optionalAuth } from '../../middlewares/auth.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import {
  formatScheduleLabels,
  buildInstructorStaffMap,
  normalizeMasteryScore,
} from '../../db/helpers.js';

export const catalogRouter = Router();

// 2.1 GET /categories
catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    const [allCats, allPublishedCourses] = await Promise.all([
      db.select().from(categories),
      db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
    ]);

    const result = [
      {
        id: 'all',
        name: 'Tất cả lĩnh vực',
        slug: 'all',
        description: 'Toàn bộ chương trình đào tạo tại 3T Academy',
        parentId: null,
        courseCount: allPublishedCourses.length,
        count: allPublishedCourses.length,
        iconName: null,
      },
      ...allCats.map((cat) => {
        const count = allPublishedCourses.filter((c) => c.categoryId === cat.id).length;
        return {
          id: String(cat.id),
          name: cat.name,
          slug: cat.slug,
          description: cat.description || '',
          parentId: cat.parentId ? String(cat.parentId) : null,
          courseCount: count,
          count,
          iconName: null,
        };
      }),
    ];

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 2.2 GET /skills
catalogRouter.get('/skills', async (_req, res, next) => {
  try {
    const [allSkills, allCourseSkills] = await Promise.all([
      db.select().from(skills),
      db.select().from(courseSkills),
    ]);

    const roleBySkillId = new Map<number, 'PREREQUISITE' | 'LEARNING_OUTCOME'>();
    for (const cs of allCourseSkills) {
      if (!roleBySkillId.has(cs.skillId) || cs.skillRole === 'LEARNING_OUTCOME') {
        roleBySkillId.set(cs.skillId, cs.skillRole);
      }
    }

    res.json(
      allSkills.map((s) => ({
        id: String(s.id),
        type: roleBySkillId.get(s.id) || 'LEARNING_OUTCOME',
        code: s.code,
        name: s.name,
        description: s.description,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// 2.3 GET /courses
catalogRouter.get('/courses', async (req, res, next) => {
  try {
    const { q, categoryId, category, level } = req.query;
    const categoryFilter = categoryId || category;

    const [allCats, allCourses, allCohorts, allReviews, allSkills, allCourseSkills, getStaffForInstructor] =
      await Promise.all([
        db.select().from(categories),
        db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
        db.select().from(cohorts),
        db.select().from(courseReviews),
        db.select().from(skills),
        db.select().from(courseSkills),
        buildInstructorStaffMap(),
      ]);

    const catMap = new Map(allCats.map((c) => [c.id, c]));
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));

    let filteredCourses = allCourses;

    if (categoryFilter && String(categoryFilter).trim() !== '' && categoryFilter !== 'all') {
      const catStr = String(categoryFilter).trim();
      const catNum = Number(catStr);
      filteredCourses = filteredCourses.filter((c) => {
        const cat = catMap.get(c.categoryId);
        if (!Number.isNaN(catNum) && c.categoryId === catNum) return true;
        if (cat && (cat.slug === catStr || cat.name.toLowerCase() === catStr.toLowerCase())) {
          return true;
        }
        return false;
      });
    }

    if (level && String(level).trim() !== '' && level !== 'ALL') {
      const levelStr = String(level).trim();
      const levelNum = Number(levelStr);
      if (!Number.isNaN(levelNum) && levelNum > 0) {
        filteredCourses = filteredCourses.filter((c) => c.difficultyLevel === levelNum);
      }
    }

    if (q && typeof q === 'string' && q.trim().length > 0) {
      const kw = q.trim().toLowerCase();
      filteredCourses = filteredCourses.filter((c) => {
        const cSkills = allCourseSkills
          .filter((cs) => cs.courseId === c.id)
          .map((cs) => skillMap.get(cs.skillId)?.name.toLowerCase() || '');
        return (
          c.title.toLowerCase().includes(kw) ||
          c.shortDescription.toLowerCase().includes(kw) ||
          cSkills.some((sn) => sn.includes(kw))
        );
      });
    }

    const enriched = filteredCourses.map((c) => {
      const courseCohorts = allCohorts.filter((ch) => ch.courseId === c.id);
      const openCohorts = courseCohorts.filter(
        (ch) => ch.status === 'OPENING' || ch.status === 'ONGOING'
      );
      const reviews = allReviews.filter((r) => r.courseId === c.id);
      const ratingAvg =
        reviews.length > 0
          ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
          : 0;

      const startingPriceVnd =
        courseCohorts.length > 0 ? Math.min(...courseCohorts.map((ch) => ch.tuitionVnd)) : 0;

      const nextCohort = openCohorts[0] || courseCohorts[0];
      const syllabus = Array.isArray(c.syllabusTemplate) ? c.syllabusTemplate : [];
      const durationWeeks = syllabus.length > 0 ? Math.ceil(syllabus.length / 2) : 0;
      const totalHours = syllabus.length * 3;

      const mappedSkills = allCourseSkills
        .filter((cs) => cs.courseId === c.id)
        .map((cs) => {
          const sk = skillMap.get(cs.skillId);
          return sk
            ? {
                id: String(sk.id),
                type: cs.skillRole,
                code: sk.code,
                name: sk.name,
              }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return {
        id: String(c.id),
        slug: c.slug,
        title: c.title,
        categoryId: c.categoryId,
        category: catMap.get(c.categoryId)?.name || '',
        shortDescription: c.shortDescription,
        descriptionMd: c.descriptionMd,
        thumbnailUrl: c.thumbnailUrl,
        difficultyLevel: c.difficultyLevel,
        durationWeeks,
        totalHours,
        ratingAvg,
        rating: ratingAvg,
        reviewCount: reviews.length,
        reviewsCount: reviews.length,
        startingPriceVnd,
        nextCohortStartDate: nextCohort?.startDate || '',
        openCohortsCount: openCohorts.length,
        skills: mappedSkills,
        syllabusTemplate: syllabus,
        cohorts: courseCohorts.map((ch) => {
          const staffInfo = getStaffForInstructor(ch.instructorId);
          const labels = formatScheduleLabels(ch.scheduleSlots || []);
          return {
            id: String(ch.id),
            courseId: String(c.id),
            instructorId: String(ch.instructorId),
            courseSlug: c.slug,
            courseTitle: c.title,
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
        }),
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// 2.4 GET /courses/:slug
catalogRouter.get('/courses/:slug', async (req, res, next) => {
  try {
    const slugOrId = String(req.params.slug || '').trim();
    const numId = Number(slugOrId);

    const [course] = await db
      .select()
      .from(courses)
      .where(
        !Number.isNaN(numId) && numId > 0
          ? or(eq(courses.id, numId), eq(courses.slug, slugOrId))
          : eq(courses.slug, slugOrId)
      )
      .limit(1);

    if (!course) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'COURSE_NOT_FOUND',
        message: 'Không tìm thấy khóa học',
        error: {
          code: 'COURSE_NOT_FOUND',
          message: 'Không tìm thấy khóa học',
        },
      });
      return;
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, course.categoryId))
      .limit(1);

    const cSkills = await db
      .select({
        id: skills.id,
        code: skills.code,
        name: skills.name,
        role: courseSkills.skillRole,
        weight: courseSkills.targetWeight,
      })
      .from(courseSkills)
      .innerJoin(skills, eq(courseSkills.skillId, skills.id))
      .where(eq(courseSkills.courseId, course.id));

    const getStaffForInstructor = await buildInstructorStaffMap();
    const courseCohorts = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.courseId, course.id));

    const reviews = await db
      .select({
        id: courseReviews.id,
        rating: courseReviews.rating,
        comment: courseReviews.comment,
        createdAt: courseReviews.createdAt,
        studentName: userProfiles.fullName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(courseReviews)
      .innerJoin(userProfiles, eq(courseReviews.accountId, userProfiles.accountId))
      .where(eq(courseReviews.courseId, course.id));

    const syllabus = Array.isArray(course.syllabusTemplate) ? course.syllabusTemplate : [];
    const totalWeeks = syllabus.length > 0 ? Math.ceil(syllabus.length / 2) : 0;
    const totalHours = syllabus.length * 3;
    const ratingAvg =
      reviews.length > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
        : 0;

    const mappedSkills = cSkills.map((s) => ({
      id: String(s.id),
      type: s.role,
      code: s.code,
      name: s.name,
      weight: s.weight,
    }));

    const mappedCohorts = courseCohorts.map((ch) => {
      const staffInfo = getStaffForInstructor(ch.instructorId);
      const labels = formatScheduleLabels(ch.scheduleSlots || []);
      return {
        id: String(ch.id),
        courseId: String(course.id),
        instructorId: String(ch.instructorId),
        courseSlug: course.slug,
        courseTitle: course.title,
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

    const courseDto = {
      id: String(course.id),
      slug: course.slug,
      title: course.title,
      category: category?.name || '',
      shortDescription: course.shortDescription,
      descriptionMd: course.descriptionMd,
      thumbnailUrl: course.thumbnailUrl,
      difficultyLevel: course.difficultyLevel,
      durationWeeks: totalWeeks,
      totalHours,
      ratingAvg,
      rating: ratingAvg,
      reviewCount: reviews.length,
      reviewsCount: reviews.length,
      syllabusTemplate: syllabus,
      skills: mappedSkills,
    };

    res.json({
      ...courseDto,
      course: courseDto,
      cohorts: mappedCohorts,
      syllabusTemplate: {
        version: mappedCohorts[0]?.curriculumVersion || 'v2026.1',
        totalWeeks,
        sessionsPerWeek: 2,
        modules: syllabus,
      },
      reviews: reviews.map((r) => ({
        id: String(r.id),
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        studentName: r.studentName,
        avatarUrl: r.avatarUrl,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 2.5 GET /cohorts
catalogRouter.get('/cohorts', async (_req, res, next) => {
  try {
    const [allCohorts, allCourses, getStaffForInstructor] = await Promise.all([
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(courses),
      buildInstructorStaffMap(),
    ]);

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    const formatted = allCohorts.map((ch) => {
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

    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// 2.6 GET /faqs
catalogRouter.get('/faqs', async (_req, res, next) => {
  try {
    const [faqSetting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'ACADEMY_FAQS'))
      .limit(1);

    if (faqSetting?.value) {
      try {
        const parsed = JSON.parse(faqSetting.value);
        if (Array.isArray(parsed)) {
          res.json(parsed);
          return;
        }
      } catch {
        // Ignore parse error and query knowledgeChunks
      }
    }

    const faqChunks = await db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.sourceType, 'FAQ'));

    const faqs = faqChunks.map((chunk) => {
      const lines = chunk.content.split('\n').filter((l) => l.trim().length > 0);
      const question = lines[0]?.replace(/^(Hỏi|Q|Câu hỏi):\s*/i, '') || chunk.content.slice(0, 80);
      const answer = lines.slice(1).join('\n').replace(/^(Đáp|A|Trả lời):\s*/i, '') || chunk.content;
      return {
        id: String(chunk.id),
        question,
        answer,
      };
    });

    res.json(faqs);
  } catch (err) {
    next(err);
  }
});

// Helper to build CertificateRecord objects from DB
export async function buildCertificateRecords(filterAccountId?: number) {
  const [
    allCerts,
    allEnrollments,
    allCohorts,
    allCourses,
    allAccounts,
    allProfiles,
    allInst,
    allSkillStates,
    allSkills,
    allAttempts,
    allAssessments,
  ] = await Promise.all([
    filterAccountId
      ? db.select().from(certificates).where(eq(certificates.accountId, filterAccountId))
      : db.select().from(certificates),
    db.select().from(enrollments),
    db.select().from(cohorts),
    db.select().from(courses),
    db.select().from(accounts),
    db.select().from(userProfiles),
    db.select().from(instructorProfiles),
    db.select().from(studentSkillStates),
    db.select().from(skills),
    db.select().from(assessmentAttempts).orderBy(desc(assessmentAttempts.scorePct)),
    db.select().from(assessments),
  ]);

  const enrollmentMap = new Map(allEnrollments.map((e) => [e.id, e]));
  const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const instMap = new Map(allInst.map((ip) => [ip.accountId, ip]));
  const skillMap = new Map(allSkills.map((s) => [s.id, s]));

  return allCerts.map((cert) => {
    const enr = enrollmentMap.get(cert.enrollmentId);
    const cohort = enr ? cohortMap.get(enr.cohortId) : undefined;
    const course = cohort ? courseMap.get(cohort.courseId) : undefined;
    const stuAcc = accountMap.get(cert.accountId);
    const stuProf = profileMap.get(cert.accountId);
    const instProf = cohort ? profileMap.get(cohort.instructorId) : undefined;
    const instMeta = cohort ? instMap.get(cohort.instructorId) : undefined;

    const finalExam = cohort
      ? allAssessments.find((a) => a.cohortId === cohort.id && a.purpose === 'FINAL_EXAM')
      : undefined;
    const finalAttempt = finalExam
      ? allAttempts.find(
          (att) => att.assessmentId === finalExam.id && att.accountId === cert.accountId
        )
      : allAttempts.find((att) => att.accountId === cert.accountId);

    const finalScoreNum = finalAttempt?.scorePct
      ? Number((Number(finalAttempt.scorePct) / 10).toFixed(1))
      : 0;

    const userSkills = allSkillStates
      .filter((ss) => ss.accountId === cert.accountId)
      .map((ss) => {
        const sk = skillMap.get(ss.skillId);
        return {
          code: sk?.code || String(ss.skillId),
          name: sk?.name || '',
          score: normalizeMasteryScore(ss.masteryScore),
        };
      });

    return {
      code: cert.certificateCode,
      certificateCode: cert.certificateCode,
      accountId: cert.accountId,
      studentEmail: stuAcc?.email || '',
      studentName: stuProf?.fullName || '',
      courseTitle: course?.title || '',
      cohortCode: cohort?.code || '',
      issuedAt: cert.issuedAt.toLocaleDateString('vi-VN'),
      issuedAtIso: cert.issuedAt.toISOString(),
      finalScore: finalScoreNum,
      proctoringIntegrity:
        finalAttempt?.integrityStatus === 'FLAGGED'
          ? 'FLAGGED'
          : 'VERIFIED_CLEAN_PROCTORING',
      verificationSignature: cert.hmacSignature,
      hmacSignature: cert.hmacSignature,
      instructorName: instProf?.fullName || '',
      instructorTitle: instMeta?.headline || '',
      isRevoked: Boolean(cert.revokedAt),
      revokedAt: cert.revokedAt ? cert.revokedAt.toLocaleDateString('vi-VN') : undefined,
      revokedReason: cert.revokeReason || undefined,
      revokeReason: cert.revokeReason || undefined,
      skillsMastered: userSkills,
      skillsVerified: userSkills,
    };
  });
}

// 2.7 GET /certificates
catalogRouter.get('/certificates', optionalAuth, async (req, res, next) => {
  try {
    const filterAccountId =
      req.user && req.user.role === 'STUDENT' ? req.user.id : undefined;

    const records = await buildCertificateRecords(filterAccountId);
    const recordMap: Record<string, (typeof records)[number]> = {};

    for (const r of records) {
      recordMap[r.certificateCode] = r;
    }

    res.json(recordMap);
  } catch (err) {
    next(err);
  }
});

// 2.8 GET /certificates/verify/:code
catalogRouter.get('/certificates/verify/:code', optionalAuth, async (req, res, next) => {
  try {
    const rawCode = String(req.params.code || '').trim();
    const allRecords = await buildCertificateRecords();

    const matched = allRecords.find(
      (r) =>
        r.certificateCode.toLowerCase() === rawCode.toLowerCase() ||
        r.hmacSignature.toLowerCase() === rawCode.toLowerCase()
    );

    if (!matched) {
      res.status(404).json({
        found: false,
        valid: false,
        accessDenied: false,
        isOwner: false,
        errorCode: 'NOT_FOUND',
        message: 'Mã chứng chỉ không tồn tại trên sổ cái xác thực 3T Academy.',
        certificate: null,
      });
      return;
    }

    if (req.user && req.user.role === 'STUDENT' && Number(req.user.id) !== Number(matched.accountId)) {
      res.json({
        found: true,
        valid: false,
        accessDenied: true,
        isOwner: false,
        errorCode: 'FORBIDDEN_OTHER_STUDENT',
        message: 'Bạn chỉ được phép tra cứu chứng chỉ của chính mình.',
        certificate: null,
      });
      return;
    }

    const isOwner = req.user ? Number(req.user.id) === Number(matched.accountId) : true;

    res.json({
      found: true,
      valid: !matched.isRevoked,
      accessDenied: false,
      isOwner,
      message: matched.isRevoked
        ? `Chứng chỉ đã bị thu hồi: ${matched.revokeReason || 'Vi phạm quy chế'}`
        : 'Chứng chỉ hợp lệ được ký số HMAC-SHA256 bởi 3T AI Academy.',
      certificate: matched,
    });
  } catch (err) {
    next(err);
  }
});

// 2.9 POST /advisor/ask
const advisorAskSchema = z
  .object({
    question: z.string().optional(),
    goal: z.string().optional(),
    background: z.string().optional(),
    chatSessionId: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.question && data.question.trim().length >= 2) ||
          (data.goal && data.goal.trim().length >= 2)
      ),
    { message: 'Câu hỏi hoặc mục tiêu nghề nghiệp quá ngắn' }
  );

catalogRouter.post('/advisor/ask', validate(advisorAskSchema), async (req, res, next) => {
  try {
    const rawQuestion = req.body.question || req.body.goal || '';
    const background = req.body.background ? ` (Nền tảng: ${req.body.background})` : '';
    const fullQuestion = `${rawQuestion}${background}`.trim();

    const [openCohorts, allCourses] = await Promise.all([
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
    ]);

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const recommendedCohort =
      openCohorts.find((ch) => ch.status === 'OPENING' || ch.status === 'ONGOING') ||
      openCohorts[0];
    const recommendedCourse = recommendedCohort
      ? courseMap.get(recommendedCohort.courseId) || allCourses[0]
      : allCourses[0];

    const recommendedCohortCodes = openCohorts
      .filter((ch) => ch.status === 'OPENING' || ch.status === 'ONGOING')
      .map((ch) => ch.code);

    try {
      const aiResp = await aiServiceClient.askAdvisor(fullQuestion);
      res.json({
        replyText: aiResp.answerMd,
        answerMd: aiResp.answerMd,
        recommendedCourseSlug: recommendedCourse?.slug || '',
        recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
        recommendedCohortCodes,
        citations: aiResp.citations || [],
      });
      return;
    } catch {
      const keyword = rawQuestion.split(' ')[0] || '';
      const publicChunks = await db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.visibility, 'PUBLIC'),
            keyword
              ? or(
                  ilike(knowledgeChunks.content, `%${keyword}%`),
                  eq(knowledgeChunks.sourceType, 'FAQ')
                )
              : eq(knowledgeChunks.sourceType, 'FAQ')
          )
        )
        .limit(3);

      const contextText =
        publicChunks.length > 0
          ? publicChunks.map((c) => c.content).join('\n\n')
          : recommendedCourse
            ? `Khóa **${recommendedCourse.title}** (${recommendedCohort?.code || ''}) hiện đang tuyển sinh với học phí ${(recommendedCohort?.tuitionVnd || 0).toLocaleString('vi-VN')}đ.`
            : '';

      const replyText = contextText
        ? `Dựa trên lộ trình đào tạo chính thức của **3T AI Academy**:\n\n${contextText}`
        : 'Hiện tại hệ thống chưa tìm thấy lộ trình phù hợp với từ khóa của bạn.';

      res.json({
        replyText,
        answerMd: replyText,
        recommendedCourseSlug: recommendedCourse?.slug || '',
        recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
        recommendedCohortCodes,
        citations: publicChunks.map((c) => ({
          chunkId: c.id,
          sourceType: c.sourceType,
          snippet: c.content.slice(0, 120),
        })),
      });
    }
  } catch (err) {
    next(err);
  }
});
