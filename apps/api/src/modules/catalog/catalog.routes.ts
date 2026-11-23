/**
 * ============================================================================
 * TỆP: apps/api/src/modules/catalog/catalog.routes.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Module Danh mục Đào tạo Công khai, Sổ cái Xác thực Chứng chỉ
 *     và Tư vấn Lộ trình AI (Public Catalog, Certificate Verification & Career Advisor).
 *   - Cung cấp dữ liệu thật từ PostgreSQL cho Trang chủ (`HomeView`), Trang danh sách & chi tiết
 *     khóa học, danh sách đợt khai giảng, câu hỏi thường gặp (FAQ), tra cứu chứng chỉ ký số
 *     HMAC-SHA256 và hộp thoại Trợ lý Tư vấn AI công khai (`visibility = 'PUBLIC'`).
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ Frontend `apps/web/src/services/catalog.api.ts`:
 *     + `catalogApi.getSummary()`          -> `GET  /api/v1/catalog/summary`
 *     + `catalogApi.getCategories()`       -> `GET  /api/v1/categories`
 *     + `catalogApi.getSkills()`           -> `GET  /api/v1/skills`
 *     + `catalogApi.getCourses()`          -> `GET  /api/v1/courses`
 *     + `catalogApi.getCourseBySlug()`     -> `GET  /api/v1/courses/:slug`
 *     + `catalogApi.getCohorts()`          -> `GET  /api/v1/cohorts`
 *     + `catalogApi.getFaqs()`             -> `GET  /api/v1/faqs`
 *     + `catalogApi.getCertificates()`     -> `GET  /api/v1/certificates`
 *     + `catalogApi.verifyCertificate()` / `verifyCertificateByCode()` -> `GET /api/v1/certificates/verify/:code`
 *     + `catalogApi.askPublicAdvisor()` / `askCareerAdvisor()` -> `POST /api/v1/advisor/ask`
 *   - Đọc/Ghi bảng DB: `categories`, `courses`, `cohorts`, `class_sessions`, `skills`, `course_skills`,
 *     `course_reviews`, `certificates`, `enrollments`, `accounts`, `user_profiles`,
 *     `instructor_profiles`, `system_settings`, `student_skill_states`, `assessment_attempts`, `assessments`.
 *   - Tích hợp AI: Gọi `askCareerAdvisorRag()` từ `apps/api/src/integrations/ragAi.service.ts`
 *     (Hybrid Search RRF trên chunk `PUBLIC` + Gemini đa model -> fallback Deterministic RAG).
 * ============================================================================
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { eq, or, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  categories,
  courses,
  cohorts,
  classSessions,
  skills,
  courseSkills,
  courseReviews,
  certificates,
  enrollments,
  accounts,
  userProfiles,
  instructorProfiles,
  systemSettings,
  studentSkillStates,
  assessmentAttempts,
  assessments,
} from '../../db/schema/index.js';
import { validate } from '../../middlewares/validate.js';
import { optionalAuth } from '../../middlewares/auth.js';
import { askCareerAdvisorRag } from '../../integrations/ragAi.service.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { env } from '../../config/env.js';
import {
  formatScheduleLabels,
  buildInstructorStaffMap,
  normalizeMasteryScore,
} from '../../db/helpers.js';

export const catalogRouter = Router();

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'ai-llm-engineering': 'Trí tuệ nhân tạo & AI',
  'ai & llm engineering': 'Trí tuệ nhân tạo & AI',
  'ai & dữ liệu': 'Trí tuệ nhân tạo & AI',
  'software-system-architecture': 'Lập trình Backend & Hệ thống',
  'backend-system-architecture': 'Lập trình Backend & Hệ thống',
  'backend & system architecture': 'Lập trình Backend & Hệ thống',
  'kỹ thuật phần mềm & cloud': 'Lập trình Backend & Hệ thống',
  'data-engineering-analytics': 'Kỹ thuật Dữ liệu',
  'data engineering & analytics': 'Kỹ thuật Dữ liệu',
  'phân tích dữ liệu': 'Kỹ thuật Dữ liệu',
  'core-programming-sql': 'Lập trình Nền tảng',
  'foundational-programming': 'Lập trình Nền tảng',
  'foundational programming': 'Lập trình Nền tảng',
};

/** Chuyển đổi slug/tên danh mục kỹ thuật trong DB sang tên hiển thị tiếng Việt chuẩn trên giao diện. */
export function humanizeCategoryName(slug?: string | null, rawName?: string | null): string {
  const slugKey = (slug || '').trim().toLowerCase();
  if (slugKey && CATEGORY_DISPLAY_NAMES[slugKey]) {
    return CATEGORY_DISPLAY_NAMES[slugKey];
  }
  const nameKey = (rawName || '').trim().toLowerCase();
  if (nameKey && CATEGORY_DISPLAY_NAMES[nameKey]) {
    return CATEGORY_DISPLAY_NAMES[nameKey];
  }
  return rawName || '';
}

const COHORT_STATUS_PRIORITY: Record<string, number> = {
  OPENING: 1,
  ONGOING: 2,
  DRAFT: 3,
  COMPLETED: 4,
  ARCHIVED: 5,
};

/** Sắp xếp danh sách đợt học ưu tiên hiển thị lớp đang mở ghi danh (`OPENING` -> `ONGOING` -> ...), cùng trạng thái ưu tiên ngày khai giảng mới nhất. */
function sortCohortsByPriority<T extends { status: string; startDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const prioA = COHORT_STATUS_PRIORITY[a.status] ?? 99;
    const prioB = COHORT_STATUS_PRIORITY[b.status] ?? 99;
    if (prioA !== prioB) return prioA - prioB;
    return b.startDate.localeCompare(a.startDate);
  });
}

let catalogConsistencySynced = false;

/** Đồng bộ một lần (lazy idempotent) tên hiển thị tiếng Việt của bảng `categories` ngay khi có request đầu tiên. */
async function ensureCatalogConsistency(): Promise<void> {
  if (catalogConsistencySynced) return;
  try {
    const allCats = await db.select().from(categories);
    for (const cat of allCats) {
      const expectedName = humanizeCategoryName(cat.slug, cat.name);
      if (expectedName && cat.name !== expectedName) {
        await db
          .update(categories)
          .set({ name: expectedName })
          .where(eq(categories.id, cat.id));
      }
    }
    catalogConsistencySynced = true;
  } catch {
    // Non-fatal fallback
  }
}

const ALL_CATEGORY_TOKENS = new Set([
  'all',
  'tất cả',
  'tất cả lĩnh vực',
  'tất cả chuyên ngành',
  'tất cả khóa học',
]);

/**
 * Route `GET /api/v1/catalog/summary` — Thống kê tổng quan công khai & danh sách Giảng viên cho Trang chủ.
 *
 * - **Mục tiêu:** Trả về số liệu thật trực tiếp từ PostgreSQL (số khóa đã xuất bản, đợt học đang mở,
 *   số học viên duy nhất, điểm đánh giá trung bình, đội ngũ giảng viên đang hoạt động).
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getSummary()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `courses`, `cohorts`, `class_sessions`, `enrollments`, `course_reviews`,
 *     `instructor_profiles`, `user_profiles`, `accounts`.
 *   + AI Service: Không gọi.
 */
// 2.0 GET /catalog/summary — Real public stats & instructors for HomeView (eliminates hardcodes!)
catalogRouter.get('/catalog/summary', async (_req, res, next) => {
  try {
    const [
      allPublishedCourses,
      allCohorts,
      allSessions,
      allEnrollments,
      allReviews,
      allInstructors,
      allProfiles,
      allAccounts,
    ] = await Promise.all([
      db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
      db.select().from(cohorts),
      db.select().from(classSessions),
      db.select().from(enrollments),
      db.select().from(courseReviews).where(eq(courseReviews.isPublic, true)),
      db.select().from(instructorProfiles),
      db.select().from(userProfiles),
      db.select().from(accounts),
    ]);

    const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    const activeEnrollments = allEnrollments.filter((e) => e.status !== 'REVOKED');
    const uniqueStudents = new Set(activeEnrollments.map((e) => e.accountId)).size;
    const avgRating =
      allReviews.length > 0
        ? Number(
            (allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length).toFixed(1)
          )
        : 0;

    const avgSessionsPerCohort =
      allCohorts.length > 0
        ? Math.round(allSessions.length / allCohorts.length)
        : 6;

    const instructors = allInstructors
      .filter((inst) => accountMap.get(inst.accountId)?.status === 'ACTIVE')
      .map((inst) => {
        const prof = profileMap.get(inst.accountId);
        const cv = (prof?.cvParsedData ?? {}) as Record<string, unknown>;
        const summaryBio = inst.expertiseSummaryMd || prof?.bio || '';
        return {
          id: String(inst.accountId),
          fullName: prof?.fullName || '',
          headline: inst.headline,
          organization: inst.organization || 'Học viện Công nghệ 3T Academy',
          yearsOfExperience: inst.yearsOfExperience || 0,
          expertiseSummaryMd: summaryBio,
          bio: summaryBio,
          avatarUrl: prof?.avatarUrl || '',
          skills: Array.isArray(cv.skills) ? (cv.skills as string[]) : [],
          socialLinks: inst.socialLinks || {},
        };
      });

    const openingOrActiveCohortsCount = allCohorts.filter(
      (c) => c.status === 'OPENING' || c.status === 'ONGOING'
    ).length;

    res.json({
      stats: {
        publishedCoursesCount: allPublishedCourses.length,
        openingOrActiveCohortsCount,
        enrolledStudentsCount: uniqueStudents,
        instructorsCount: instructors.length,
        averageRating: avgRating,
        reviewsCount: allReviews.length,
        sessionsPerCourse: avgSessionsPerCohort,
      },
      publishedCoursesCount: allPublishedCourses.length,
      activeCohortsCount: openingOrActiveCohortsCount,
      sessionsPerCourse: avgSessionsPerCohort,
      totalEnrolledStudents: uniqueStudents,
      totalEnrollments: activeEnrollments.length,
      reviewCount: allReviews.length,
      ratingAvg: avgRating,
      instructors,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/categories` — Danh mục chuyên ngành kèm số lượng khóa học đã xuất bản (`PUBLISHED`).
 *
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getCategories()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `categories`, `courses`. (Tự chèn mục ảo `'all'` ở đầu danh sách cho bộ lọc UI).
 */
// 2.1 GET /categories
catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    await ensureCatalogConsistency();
    const [allCats, allPublishedCourses] = await Promise.all([
      db.select().from(categories),
      db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
    ]);

    const result = [
      {
        id: 'all',
        name: 'Tất cả khóa học',
        slug: 'all',
        description: 'Toàn bộ khóa học tại 3T Academy',
        parentId: null,
        courseCount: allPublishedCourses.length,
        count: allPublishedCourses.length,
        iconName: null,
      },
      ...allCats.map((cat) => {
        const count = allPublishedCourses.filter((c) => c.categoryId === cat.id).length;
        return {
          id: String(cat.id),
          name: humanizeCategoryName(cat.slug, cat.name),
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

/**
 * Route `GET /api/v1/skills` — Toàn bộ từ điển kỹ năng năng lực (Skill Ontology) của học viện.
 *
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getSkills()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `skills`, `course_skills` (gắn vai trò `LEARNING_OUTCOME` hoặc `PREREQUISITE`).
 */
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

/**
 * Route `GET /api/v1/courses` — Tìm kiếm & lọc danh sách khóa học đã xuất bản kèm đợt học và giảng viên.
 *
 * - **Mục tiêu:** Hỗ trợ lọc đa tiêu chí (`q` theo từ khóa/kỹ năng/mã lớp, `categoryId`/`category`, `level`)
 *   và tính toán sẵn học phí khởi điểm (`startingPriceVnd`), số chỗ trống (`seatsRemaining`), đánh giá trung bình.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getCourses(filters)` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `categories`, `courses`, `cohorts`, `course_reviews`, `skills`, `course_skills`, `instructor_profiles`.
 */
// 2.3 GET /courses
catalogRouter.get('/courses', async (req, res, next) => {
  try {
    await ensureCatalogConsistency();
    const { q, categoryId, category, level } = req.query;
    const categoryFilter = categoryId || category;

    const [
      allCats,
      allCourses,
      allCohorts,
      allReviews,
      allSkills,
      allCourseSkills,
      getStaffForInstructor,
    ] = await Promise.all([
      db.select().from(categories),
      db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
      db.select().from(cohorts),
      db.select().from(courseReviews).where(eq(courseReviews.isPublic, true)),
      db.select().from(skills),
      db.select().from(courseSkills),
      buildInstructorStaffMap(),
    ]);

    const catMap = new Map(allCats.map((c) => [c.id, c]));
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));

    let filteredCourses = allCourses;

    if (categoryFilter) {
      const catStr = String(categoryFilter).trim();
      const catLower = catStr.toLowerCase();
      if (catStr !== '' && !ALL_CATEGORY_TOKENS.has(catLower)) {
        const catNum = Number(catStr);
        filteredCourses = filteredCourses.filter((c) => {
          const cat = catMap.get(c.categoryId);
          if (!Number.isNaN(catNum) && c.categoryId === catNum) return true;
          if (!cat) return false;
          const displayName = humanizeCategoryName(cat.slug, cat.name).toLowerCase();
          return (
            cat.slug.toLowerCase() === catLower ||
            cat.name.toLowerCase() === catLower ||
            displayName === catLower
          );
        });
      }
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
        const cCodes = allCohorts
          .filter((ch) => ch.courseId === c.id)
          .map((ch) => ch.code.toLowerCase());
        const catName = humanizeCategoryName(
          catMap.get(c.categoryId)?.slug,
          catMap.get(c.categoryId)?.name || ''
        ).toLowerCase();
        return (
          c.title.toLowerCase().includes(kw) ||
          c.shortDescription.toLowerCase().includes(kw) ||
          catName.includes(kw) ||
          cSkills.some((sn) => sn.includes(kw)) ||
          cCodes.some((cd) => cd.includes(kw))
        );
      });
    }

    const enriched = filteredCourses.map((c) => {
      const courseCohorts = sortCohortsByPriority(
        allCohorts.filter((ch) => ch.courseId === c.id)
      );
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

      const nextCohort =
        openCohorts.find((ch) => ch.status === 'OPENING') ||
        openCohorts[0] ||
        courseCohorts[0];
      const syllabus = Array.isArray(c.syllabusTemplate) ? c.syllabusTemplate : [];
      const durationWeeks = syllabus.length > 0 ? Math.ceil(syllabus.length / 2) : 0;
      const totalHours = syllabus.length * 2;
      const categoryObj = catMap.get(c.categoryId);

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
        categorySlug: categoryObj?.slug || '',
        category: humanizeCategoryName(categoryObj?.slug, categoryObj?.name || ''),
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
          const maxSeats = ch.maxSeats ?? 35;
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
            maxSeats,
            seatsRemaining: Math.max(0, maxSeats - ch.enrolledCount),
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

/**
 * Route `GET /api/v1/courses/:slug` — Lấy chi tiết đầy đủ một khóa học (theo `slug` hoặc `id`).
 *
 * - **Mục tiêu:** Trả về đề cương khung (`syllabusTemplate`), danh sách kỹ năng kèm trọng số (`targetWeight`),
 *   tất cả các đợt khai giảng (`cohorts`) đã sắp ưu tiên và đánh giá công khai của học viên.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getCourseBySlug(slug)` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `courses`, `categories`, `course_skills`, `skills`, `cohorts`, `course_reviews`, `user_profiles`.
 */
// 2.4 GET /courses/:slug
catalogRouter.get('/courses/:slug', async (req, res, next) => {
  try {
    await ensureCatalogConsistency();
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
    const rawCourseCohorts = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.courseId, course.id));
    const courseCohorts = sortCohortsByPriority(rawCourseCohorts);

    const reviews = await db
      .select({
        id: courseReviews.id,
        rating: courseReviews.rating,
        comment: courseReviews.comment,
        isPublic: courseReviews.isPublic,
        createdAt: courseReviews.createdAt,
        studentName: userProfiles.fullName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(courseReviews)
      .innerJoin(userProfiles, eq(courseReviews.accountId, userProfiles.accountId))
      .where(eq(courseReviews.courseId, course.id));

    const publicReviews = reviews.filter((r) => r.isPublic);
    const syllabus = Array.isArray(course.syllabusTemplate) ? course.syllabusTemplate : [];
    const totalWeeks = syllabus.length > 0 ? Math.ceil(syllabus.length / 2) : 0;
    const totalHours = syllabus.length * 2;
    const ratingAvg =
      publicReviews.length > 0
        ? Number(
            (
              publicReviews.reduce((acc, r) => acc + r.rating, 0) / publicReviews.length
            ).toFixed(1)
          )
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
      const maxSeats = ch.maxSeats ?? 35;
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
        maxSeats,
        seatsRemaining: Math.max(0, maxSeats - ch.enrolledCount),
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
      categorySlug: category?.slug || '',
      category: humanizeCategoryName(category?.slug, category?.name || ''),
      shortDescription: course.shortDescription,
      descriptionMd: course.descriptionMd,
      thumbnailUrl: course.thumbnailUrl,
      difficultyLevel: course.difficultyLevel,
      durationWeeks: totalWeeks,
      totalHours,
      ratingAvg,
      rating: ratingAvg,
      reviewCount: publicReviews.length,
      reviewsCount: publicReviews.length,
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
      reviews: publicReviews.map((r) => ({
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

/**
 * Route `GET /api/v1/cohorts` — Danh sách toàn bộ đợt học (lớp theo kỳ) kèm lịch học và sĩ số còn lại.
 *
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getCohorts()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `cohorts`, `courses`, `instructor_profiles`, `user_profiles`.
 */
// 2.5 GET /cohorts
catalogRouter.get('/cohorts', async (_req, res, next) => {
  try {
    await ensureCatalogConsistency();
    const [rawCohorts, allCourses, getStaffForInstructor] = await Promise.all([
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(courses),
      buildInstructorStaffMap(),
    ]);
    const allCohorts = sortCohortsByPriority(rawCohorts);
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    const formatted = allCohorts.map((ch) => {
      const course = courseMap.get(ch.courseId);
      const staffInfo = getStaffForInstructor(ch.instructorId);
      const labels = formatScheduleLabels(ch.scheduleSlots || []);
      const maxSeats = ch.maxSeats ?? 35;

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
        maxSeats,
        seatsRemaining: Math.max(0, maxSeats - ch.enrolledCount),
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

const DEFAULT_ACADEMY_FAQS = [
  {
    id: 'faq-1',
    question: 'Hình thức học tại 3T Academy là học trực tiếp cùng giảng viên hay xem video thu sẵn?',
    answer:
      'Tại 3T Academy, bạn học trực tuyến tương tác trực tiếp (Live) cùng giảng viên vào các buổi cố định trong tuần (2 buổi/tuần). Sau mỗi buổi học, bản ghi MP4 chất lượng cao kèm phụ đề và tài liệu được cập nhật để bạn chủ động ôn tập lại bất cứ lúc nào.',
  },
  {
    id: 'faq-2',
    question: 'Nếu hôm đó mình bận việc đột xuất không vào lớp kịp thì có bị mất bài không?',
    answer:
      'Hoàn toàn không. Ngay sau khi ca học kết thúc, bạn có thể xem lại toàn bộ video bài giảng, tải slide và hỏi trực tiếp Trợ giảng AI ngay cạnh khung video để được giải thích theo đúng mốc thời gian giảng viên đã giảng.',
  },
  {
    id: 'faq-3',
    question: 'Mình mới bắt đầu hoặc trái ngành thì nên chọn khóa học nào trước?',
    answer:
      'Nếu bạn mới làm quen với lập trình hoặc muốn củng cố nền tảng, bạn nên bắt đầu từ khóa Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI, sau đó tiến lên các khóa chuyên sâu Kỹ sư AI Thực chiến, Kiến trúc Backend Chuyên sâu hoặc Kỹ sư Dữ liệu Hiện đại.',
  },
  {
    id: 'faq-4',
    question: 'Điều kiện để hoàn thành mỗi buổi học và nhận chứng chỉ tốt nghiệp là gì?',
    answer:
      'Mỗi buổi học được đánh dấu hoàn thành khi bạn làm đạt tối thiểu 70% bài Quiz kiểm tra năng lực cuối buổi. Khi hoàn thành trọn vẹn 6/6 buổi học của đợt học và vượt qua Kỳ thi sát hạch cuối khóa (từ 70% trở lên, tuân thủ quy chế giám sát AI Proctoring), hệ thống tự động cấp Chứng chỉ tốt nghiệp xác thực chữ ký số HMAC và QR trực tuyến.',
  },
  {
    id: 'faq-5',
    question: 'Tính năng Hồ sơ năng lực (CV) và Luyện phỏng vấn 1-1 cùng AI hoạt động như thế nào?',
    answer:
      'Tài khoản mới đăng ký có mặc định 0 lượt phỏng vấn AI. Ngay khi bạn đăng ký thành công một đợt học chính thức, hệ thống cấp ngay 4 lượt Luyện phỏng vấn giọng nói 1-1 hai vòng (Vòng 1 rà soát CV theo JD, Vòng 2 phỏng vấn chuyên môn cùng AI) và đồng bộ kỹ năng/chứng chỉ đạt được vào Hồ sơ năng lực.',
  },
  {
    id: 'faq-6',
    question: 'Mình đăng ký lớp học và thanh toán học phí như thế nào?',
    answer:
      'Bạn chọn đợt học phù hợp và quét mã VietQR trên ứng dụng ngân hàng để hoàn tất học phí. Ngay sau khi SePay xác nhận giao dịch khớp mã đơn, phòng học và 4 lượt phỏng vấn AI được mở khóa tự động.',
  },
];

/**
 * Route `GET /api/v1/faqs` — Lấy danh sách câu hỏi thường gặp từ `system_settings` (fallback sang `DEFAULT_ACADEMY_FAQS`).
 *
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getFaqs()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: `system_settings` (key `ACADEMY_FAQS`).
 */
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
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (item) =>
              item &&
              typeof item.question === 'string' &&
              item.question.trim().endsWith('?') &&
              typeof item.answer === 'string'
          )
        ) {
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

/**
 * Tổng hợp đầy đủ bản ghi Chứng chỉ từ DB kèm tái kiểm toán chữ ký số **HMAC-SHA256**.
 *
 * - **Mục tiêu:** Ghép chứng chỉ với điểm thi cuối khóa, trạng thái liêm chính Proctoring,
 *   năng lực kỹ năng (`student_skill_states`) và tự tính lại `expectedHmac` từ chuỗi
 *   `${enrollmentId}:${accountId}:${certificateCode}` bằng `HMAC_CERTIFICATE_SECRET` để phát hiện giả mạo DB.
 * - **Liên kết luồng (Cross-layer):** Được dùng chung bởi `GET /certificates`, `GET /certificates/verify/:code`,
 *   `admin.routes.ts`, và `learning.routes.ts`.
 */
// Helper to build CertificateRecord objects from DB
export async function buildCertificateRecords(
  options?: number | { filterAccountId?: number; filterInstructorId?: number }
) {
  const filterAccountId =
    typeof options === 'number' ? options : options?.filterAccountId;
  const filterInstructorId =
    typeof options === 'number' ? undefined : options?.filterInstructorId;

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

  const filteredCerts = filterInstructorId
    ? allCerts.filter((cert) => {
        const enr = enrollmentMap.get(cert.enrollmentId);
        const ch = enr ? cohortMap.get(enr.cohortId) : undefined;
        return ch?.instructorId === filterInstructorId;
      })
    : allCerts;

  return filteredCerts.map((cert) => {
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
      : undefined;

    const rawScorePct = finalAttempt?.scorePct ? Number(finalAttempt.scorePct) : 0;
    const finalScoreNum = Number(rawScorePct.toFixed(1));

    const expectedHmac = crypto
      .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
      .update(`${cert.enrollmentId}:${cert.accountId}:${cert.certificateCode}`)
      .digest('hex');
    const isHmacAuthentic = cert.hmacSignature === expectedHmac;

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
      enrollmentId: cert.enrollmentId,
      cohortId: cohort ? String(cohort.id) : '',
      accountId: cert.accountId,
      studentEmail: stuAcc?.email || '',
      studentName: stuProf?.fullName || '',
      courseTitle: course?.title || '',
      cohortCode: cohort?.code || '',
      issuedAt: cert.issuedAt.toLocaleDateString('vi-VN'),
      issuedAtIso: cert.issuedAt.toISOString(),
      finalScore: finalScoreNum,
      proctoringIntegrity:
        finalAttempt?.integrityStatus === 'FLAGGED' ||
        finalAttempt?.integrityStatus === 'CONFIRMED_CHEAT'
          ? 'FLAGGED'
          : 'VERIFIED_CLEAN_PROCTORING',
      verificationSignature: cert.hmacSignature,
      hmacSignature: cert.hmacSignature,
      isHmacAuthentic,
      instructorName: instProf?.fullName || 'Hội đồng Học thuật 3T Academy',
      instructorTitle: instMeta?.headline || 'Giảng viên Trưởng Khối Đào tạo',
      isRevoked: Boolean(cert.revokedAt),
      revokedAt: cert.revokedAt ? cert.revokedAt.toLocaleDateString('vi-VN') : undefined,
      revokedReason: cert.revokeReason || undefined,
      revokeReason: cert.revokeReason || undefined,
      skillsMastered: userSkills,
      skillsVerified: userSkills,
    };
  });
}

/**
 * Route `GET /api/v1/certificates` — Lấy danh sách chứng chỉ theo đúng phạm vi phân quyền RBAC.
 *
 * - **Bảo mật:** Khách chưa đăng nhập nhận `{}` (không lộ danh sách học viên/email);
 *   Học viên chỉ thấy chứng chỉ của chính mình; Giảng viên thấy chứng chỉ của các lớp mình dạy;
 *   Quản trị viên (`ADMIN`) thấy toàn hệ thống.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.getCertificates()` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: Thông qua `buildCertificateRecords()`.
 */
// 2.7 GET /certificates — Strict RBAC & Privacy Protection!
// Guests receive {} (never dump all students' certificates/emails publicly).
catalogRouter.get('/certificates', optionalAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      res.json({});
      return;
    }

    const records =
      req.user.role === 'ADMIN'
        ? await buildCertificateRecords()
        : req.user.role === 'INSTRUCTOR'
          ? await buildCertificateRecords({ filterInstructorId: req.user.id })
          : await buildCertificateRecords({ filterAccountId: req.user.id });

    const recordMap: Record<string, (typeof records)[number]> = {};
    for (const r of records) {
      recordMap[r.certificateCode] = r;
    }

    res.json(recordMap);
  } catch (err) {
    next(err);
  }
});

/**
 * Route `GET /api/v1/certificates/verify/:code` — Cổng tra cứu & xác thực chứng chỉ công khai (Public Verification Ledger).
 *
 * - **Mục tiêu:** Cho phép nhà tuyển dụng quét QR hoặc nhập mã chứng chỉ / mã chữ ký HMAC để kiểm tra
 *   tính xác thực (`!isRevoked && isHmacAuthentic`), đồng thời ẩn `studentEmail` nếu người tra cứu
 *   không phải chủ chứng chỉ hoặc nhân sự học viện (bảo vệ PII).
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.verifyCertificate(code)` / `verifyCertificateByCode(code)` (`apps/web/src/services/catalog.api.ts`).
 *   + Đọc DB: Thông qua `buildCertificateRecords()`.
 */
// 2.8 GET /certificates/verify/:code — Public Verification Ledger (employers, students, guests, staff)
catalogRouter.get('/certificates/verify/:code', optionalAuth, async (req, res, next) => {
  try {
    const rawCode = String(req.params.code || '').trim();
    if (!rawCode) {
      res.status(200).json({
        found: false,
        valid: false,
        accessDenied: false,
        isOwner: false,
        errorCode: 'NOT_FOUND',
        message: 'Vui lòng nhập mã chứng chỉ cần tra cứu.',
        certificate: null,
      });
      return;
    }

    const allRecords = await buildCertificateRecords();
    const matched = allRecords.find(
      (r) =>
        r.certificateCode.toLowerCase() === rawCode.toLowerCase() ||
        r.hmacSignature.toLowerCase() === rawCode.toLowerCase()
    );

    if (!matched) {
      res.status(200).json({
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

    const isOwner = Boolean(req.user && Number(req.user.id) === Number(matched.accountId));
    const isAdminOrInst =
      req.user?.role === 'ADMIN' || req.user?.role === 'INSTRUCTOR';

    const sanitizedCert = {
      ...matched,
      studentEmail: isOwner || isAdminOrInst ? matched.studentEmail : '',
    };

    const isValid = !matched.isRevoked && matched.isHmacAuthentic;

    res.json({
      found: true,
      valid: isValid,
      accessDenied: false,
      isOwner,
      message: matched.isRevoked
        ? `Chứng chỉ đã bị thu hồi: ${matched.revokeReason || 'Vi phạm quy chế'}`
        : !matched.isHmacAuthentic
          ? 'Chữ ký số HMAC của chứng chỉ không khớp với sổ cái gốc.'
          : 'Chứng chỉ hợp lệ được ký số HMAC-SHA256 bởi 3T AI Academy.',
      certificate: sanitizedCert,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/advisor/ask` — Hỏi Trợ lý Tư vấn Lộ trình AI công khai (Public Career Advisor RAG).
 *
 * - **Mục tiêu:** Nhận câu hỏi/mục tiêu nghề nghiệp + nền tảng hiện tại, chuyển sang `askCareerAdvisorRag()`
 *   để lọc Guardrail (chặn hỏi ngoài hệ thống & hỏi sâu bài giảng trả phí), truy xuất tài liệu `PUBLIC`
 *   bằng Hybrid Search RRF và sinh tư vấn bằng Gemini đa model (fallback Deterministic RAG).
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `catalogApi.askPublicAdvisor()` / `catalogApi.askCareerAdvisor()` (`apps/web/src/services/catalog.api.ts`).
 *   + Gọi nội bộ: `askCareerAdvisorRag()` (`apps/api/src/integrations/ragAi.service.ts`).
 *   + Đọc DB: `courses`, `cohorts`, `knowledge_chunks` (`visibility = 'PUBLIC'`).
 */
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

    // Bước 1: Ưu tiên gọi Python AI Microservice (`POST /api/v1/ai/advisor/ask` — 5-node LangGraph CRAG + Cross-Encoder Reranker)
    try {
      const aiRes = await aiServiceClient.askAdvisor(fullQuestion, req.correlationId);
      if (aiRes && typeof aiRes.answerMd === 'string' && aiRes.answerMd.trim().length > 0) {
        // Giữ đồng bộ metadata gợi ý khóa học/đợt học thực tế từ PostgreSQL cho UI thẻ tư vấn
        const [publishedCourses, activeCohorts] = await Promise.all([
          db.select().from(courses).where(eq(courses.status, 'PUBLISHED')),
          db.select().from(cohorts),
        ]);
        const qNorm = fullQuestion.toLowerCase();
        const recommendedCourse =
          publishedCourses.find((c) => qNorm.includes('python') && c.slug.includes('python')) ||
          publishedCourses.find((c) => (qNorm.includes('data') || qNorm.includes('spark') || qNorm.includes('kafka')) && c.slug.includes('data')) ||
          publishedCourses.find((c) => (qNorm.includes('backend') || qNorm.includes('node') || qNorm.includes('typescript')) && c.slug.includes('backend')) ||
          publishedCourses.find((c) => c.slug.includes('ai')) ||
          publishedCourses[0];
        const recommendedCohort = recommendedCourse
          ? activeCohorts.find((ch) => ch.courseId === recommendedCourse.id && ch.status === 'OPENING') ||
            activeCohorts.find((ch) => ch.courseId === recommendedCourse.id)
          : activeCohorts[0];

        res.json({
          replyText: aiRes.answerMd,
          answerMd: aiRes.answerMd,
          recommendedCourseSlug: recommendedCourse?.slug || '',
          recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
          recommendedCohortCodes: recommendedCohort ? [recommendedCohort.code] : [],
          citations: aiRes.citations ?? [],
          rerankBackend: aiRes.rerankBackend,
          maxRelevanceScore: aiRes.maxRelevanceScore,
          agentTrace: aiRes.agentTrace,
          provider: 'AI_SERVICE_CRAG',
        });
        return;
      }
    } catch {
      // AI Service tạm ngắt hoặc timeout -> tự động hạ cấp mượt sang RAG nội bộ Node.js
    }

    // Bước 2 (Fallback): Chạy Hybrid RAG + Gemini Cascade / Deterministic nội bộ tại `ragAi.service.ts`
    const result = await askCareerAdvisorRag(fullQuestion);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
