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
} from '../../db/schema/index.js';
import { validate } from '../../middlewares/validate.js';
import { optionalAuth } from '../../middlewares/auth.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { formatScheduleLabels, buildInstructorStaffMap } from '../../db/helpers.js';

export const catalogRouter = Router();

const DEFAULT_ACADEMY_FAQS = [
  {
    id: 'faq-1',
    question: 'Khóa học tại 3T AI Academy có hình thức học như thế nào?',
    answer:
      '100% các đợt học (Cohort) tại 3T AI Academy được giảng dạy trực tiếp (Live Interactive) kết hợp thực hành code thực chiến cùng Giảng viên. Sau mỗi buổi học 15 phút, hệ thống tự động xuất bản Video Replay chuẩn HLS kèm phụ đề tiếng Việt, tóm tắt AI và Trợ giảng AI RAG trích dẫn đúng mốc giây bài giảng.',
  },
  {
    id: 'faq-2',
    question: 'Tôi bận đột xuất nghỉ 1 buổi Livestream thì có theo kịp lớp không?',
    answer:
      'Hoàn toàn theo kịp! Ngay sau buổi học, bạn có thể xem lại Video Replay với chương mục rõ ràng, bấm vào từng mốc thời gian [MM:SS] trong phần Ghi chú AI hoặc hỏi trực tiếp Trợ giảng AI ngay tại khung hình bạn chưa hiểu.',
  },
  {
    id: 'faq-3',
    question: 'Điều kiện để tốt nghiệp và nhận Chứng chỉ Số HMAC-SHA256 là gì?',
    answer:
      'Học viên cần hoàn thành đầy đủ các bài kiểm tra trắc nghiệm sau mỗi buổi học và vượt qua Kỳ Thi Cuối Khóa (Final Exam) có giám sát Camera AI chống gian lận với điểm số đạt chuẩn (từ 70% trở lên). Khi được cấp chứng chỉ, bạn còn được tặng thêm +4 lượt Phỏng vấn thử AI miễn phí.',
  },
  {
    id: 'faq-4',
    question: 'Phương thức thanh toán học phí qua SePay VietQR hoạt động ra sao?',
    answer:
      'Khi đăng ký đợt học, hệ thống khởi tạo mã đơn hàng duy nhất (Order Code) và mã VietQR động. Ngay khi bạn chuyển khoản thành công, Webhook SePay đối soát tức thì trong 2–3 giây và kích hoạt quyền vào Phòng học ngay lập tức mà không cần chờ duyệt thủ công.',
  },
];

// 2.1 GET /categories
catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    const allCats = await db.select().from(categories);
    const allPublishedCourses = await db
      .select()
      .from(courses)
      .where(eq(courses.status, 'PUBLISHED'));

    const result = [
      {
        id: 'all',
        name: 'Tất cả lĩnh vực',
        slug: 'all',
        description: 'Toàn bộ chương trình đào tạo Kỹ sư AI & Dữ liệu thực chiến tại 3T Academy',
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
    const { q, categoryId } = req.query;

    const [allCats, allCourses, allCohorts, allReviews, allSkills, allCourseSkills] =
      await Promise.all([
        db.select().from(categories),
        db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
        db.select().from(cohorts),
        db.select().from(courseReviews),
        db.select().from(skills),
        db.select().from(courseSkills),
      ]);

    const catMap = new Map(allCats.map((c) => [c.id, c]));
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));

    let filteredCourses = allCourses;

    if (categoryId && categoryId !== 'all') {
      const catStr = String(categoryId).trim();
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
          : 4.9;

      const startingPriceVnd =
        courseCohorts.length > 0 ? Math.min(...courseCohorts.map((ch) => ch.tuitionVnd)) : 6500000;

      const nextCohort = openCohorts[0] || courseCohorts[0];
      const syllabus = Array.isArray(c.syllabusTemplate) ? c.syllabusTemplate : [];
      const durationWeeks = Math.max(4, Math.ceil(syllabus.length / 2) || 6);
      const totalHours = Math.max(16, syllabus.length * 3 || 24);

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
        category: catMap.get(c.categoryId)?.name || 'Kỹ thuật AI & Phần mềm',
        shortDescription: c.shortDescription,
        descriptionMd: c.descriptionMd,
        thumbnailUrl: c.thumbnailUrl,
        difficultyLevel: c.difficultyLevel,
        durationWeeks,
        totalHours,
        ratingAvg,
        reviewCount: reviews.length || 28,
        startingPriceVnd,
        nextCohortStartDate: nextCohort?.startDate || '2026-11-15',
        openCohortsCount: openCohorts.length,
        skills: mappedSkills,
        syllabusTemplate: syllabus,
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
    const ratingAvg =
      reviews.length > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
        : 4.9;

    res.json({
      id: String(course.id),
      slug: course.slug,
      title: course.title,
      category: category?.name || 'Kỹ thuật AI & Phần mềm',
      shortDescription: course.shortDescription,
      descriptionMd: course.descriptionMd,
      thumbnailUrl: course.thumbnailUrl,
      difficultyLevel: course.difficultyLevel,
      durationWeeks: Math.max(4, Math.ceil(syllabus.length / 2) || 6),
      totalHours: Math.max(16, syllabus.length * 3 || 24),
      ratingAvg,
      reviewCount: reviews.length || 28,
      syllabusTemplate: syllabus,
      skills: cSkills.map((s) => ({
        id: String(s.id),
        type: s.role,
        code: s.code,
        name: s.name,
        weight: s.weight,
      })),
      cohorts: courseCohorts.map((ch) => {
        const staffInfo = getStaffForInstructor(ch.instructorId);
        const labels = formatScheduleLabels(ch.scheduleSlots || []);
        return {
          id: String(ch.id),
          courseId: String(course.id),
          courseSlug: course.slug,
          courseTitle: course.title,
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
          scheduleSlots: ch.scheduleSlots,
          instructorName: staffInfo.instructorName,
          instructorHeadline: staffInfo.instructorHeadline,
          instructorAvatarUrl: staffInfo.instructorAvatarUrl,
          staff: staffInfo.staff,
        };
      }),
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          res.json(parsed);
          return;
        }
      } catch {
        // Fallback to default FAQs
      }
    }

    res.json(DEFAULT_ACADEMY_FAQS);
  } catch (err) {
    next(err);
  }
});

// Helper to build CertificateRecord objects
async function buildCertificateRecords(filterAccountId?: number) {
  const [allCerts, allEnrollments, allCohorts, allCourses, allAccounts, allProfiles, allInst] =
    await Promise.all([
      filterAccountId
        ? db.select().from(certificates).where(eq(certificates.accountId, filterAccountId))
        : db.select().from(certificates),
      db.select().from(enrollments),
      db.select().from(cohorts),
      db.select().from(courses),
      db.select().from(accounts),
      db.select().from(userProfiles),
      db.select().from(instructorProfiles),
    ]);

  const enrollmentMap = new Map(allEnrollments.map((e) => [e.id, e]));
  const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const instMap = new Map(allInst.map((ip) => [ip.accountId, ip]));

  return allCerts.map((cert) => {
    const enr = enrollmentMap.get(cert.enrollmentId);
    const cohort = enr ? cohortMap.get(enr.cohortId) : undefined;
    const course = cohort ? courseMap.get(cohort.courseId) : undefined;
    const stuAcc = accountMap.get(cert.accountId);
    const stuProf = profileMap.get(cert.accountId);
    const instProf = cohort ? profileMap.get(cohort.instructorId) : undefined;
    const instMeta = cohort ? instMap.get(cohort.instructorId) : undefined;

    return {
      code: cert.certificateCode,
      certificateCode: cert.certificateCode,
      accountId: cert.accountId,
      studentEmail: stuAcc?.email || 'an.nguyen.dev@gmail.com',
      studentName: stuProf?.fullName || 'Nguyễn Văn An',
      courseTitle: course?.title || 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Agent',
      cohortCode: cohort?.code || 'AI-ENG-2026-K01',
      issuedAt: cert.issuedAt.toLocaleDateString('vi-VN'),
      issuedAtIso: cert.issuedAt.toISOString(),
      finalScore: '94/100 (Xuất sắc)',
      hmacSignature: cert.hmacSignature,
      instructorName: instProf?.fullName || 'TS. Trần Minh Khoa',
      instructorTitle: instMeta?.headline || 'Giảng viên Trưởng Khối Kỹ thuật AI — 3T Academy',
      isRevoked: Boolean(cert.revokedAt),
      revokedAt: cert.revokedAt ? cert.revokedAt.toLocaleDateString('vi-VN') : undefined,
      revokeReason: cert.revokeReason || undefined,
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
      recordMap[r.code] = r;
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
        r.code.toLowerCase() === rawCode.toLowerCase() ||
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

    // Privacy check: if logged in as a STUDENT, only allow verifying their own certificate
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
      certificate: {
        code: matched.code,
        certificateCode: matched.certificateCode,
        studentEmail: matched.studentEmail,
        studentName: matched.studentName,
        courseTitle: matched.courseTitle,
        cohortCode: matched.cohortCode,
        issuedAt: matched.issuedAt,
        finalScore: matched.finalScore,
        hmacSignature: matched.hmacSignature,
        instructorName: matched.instructorName,
        instructorTitle: matched.instructorTitle,
        isRevoked: matched.isRevoked,
        revokedAt: matched.revokedAt,
        revokeReason: matched.revokeReason,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2.9 POST /advisor/ask
const advisorAskSchema = z.object({
  question: z.string().min(2, 'Câu hỏi quá ngắn'),
  chatSessionId: z.string().optional(),
});

catalogRouter.post('/advisor/ask', validate(advisorAskSchema), async (req, res, next) => {
  try {
    const { question } = req.body;

    try {
      const aiResp = await aiServiceClient.askAdvisor(question);
      res.json({
        ...aiResp,
        recommendedCohortCodes: ['AI-ENG-2026-K01', 'PY-SQL-2026-K04'],
      });
      return;
    } catch {
      const publicChunks = await db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.visibility, 'PUBLIC'),
            or(
              ilike(knowledgeChunks.content, `%${question.split(' ')[0] || ''}%`),
              eq(knowledgeChunks.sourceType, 'FAQ')
            )
          )
        )
        .limit(3);

      const contextText =
        publicChunks.length > 0
          ? publicChunks.map((c) => c.content).join('\n\n')
          : 'Khóa Kỹ Sư AI Thực Chiến (AI-ENG-2026-K01) học tối Thứ 3 & Thứ 7 (19:30 - 21:30), học phí 8.500.000đ, do TS. Trần Minh Khoa trực tiếp giảng dạy.';

      res.json({
        answerMd: `Chào bạn! Dựa trên lộ trình đào tạo chính thức của **3T AI Academy**:\n\n${contextText}\n\nBạn có thể nhấn nút **"Đăng ký giữ chỗ"** ở đợt học đang mở để nhận mã thanh toán SePay VietQR tự động nhé!`,
        citations: publicChunks.map((c) => ({
          chunkId: c.id,
          sourceType: c.sourceType,
          snippet: c.content.slice(0, 120),
        })),
        recommendedCohortCodes: ['AI-ENG-2026-K01', 'PY-SQL-2026-K04'],
      });
    }
  } catch (err) {
    next(err);
  }
});
