/**
 * ============================================================================
 * TỆP: apps/api/src/modules/profile/profile.routes.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Module Hồ sơ Năng lực (CV Builder & Parser)
 *     và Luyện Phỏng vấn Kỹ thuật 1-1 hai vòng cùng AI (AI Mock Interview).
 *   - Đảm nhiệm:
 *     1. Tổng hợp Hồ sơ năng lực tự động (`GET /me/profile-skills`): hợp nhất kỹ năng học được
 *        (`student_skill_states`), chứng chỉ HMAC (`certificates`), khóa đã tham gia (`enrollments`)
 *        và dữ liệu CV cá nhân (`user_profiles.cv_parsed_data`).
 *     2. Tải lên & bóc tách CV từ file PDF (`multipart/form-data`) hoặc JSON (`POST /me/cv/upload`, `/me/cv`):
 *        gọi `aiServiceClient.parseCvPdf()` (`apps/ai-service/src/api/routes/career_ai.py`) kèm bộ trích xuất
 *        tín hiệu cục bộ dự phòng (từ khóa kỹ thuật, SĐT, GitHub, LinkedIn).
 *     3. Luồng **Phỏng vấn AI 2 vòng kèm quản lý lượt (`interview_credits`)**:
 *        - **Vòng 1 (`POST /interviews/screen-cv`) — MIỄN PHÍ (0 credit):** Đối chiếu CV + kỹ năng học viện
 *          với JD mục tiêu bằng `aiServiceClient.screenCv()` (fallback đối soát từ khóa cục bộ).
 *        - **Vòng 2 (`POST /interviews/:id/start` -> `/turn` -> `/complete`):**
 *          + `/start`: Kiểm tra quyền sở hữu & bắt buộc `interviewCredits > 0` (HTTP 402 nếu hết lượt),
 *            sinh bộ 3 câu hỏi thích ứng theo vai trò (AI/RAG, Backend, Data, Python/SQL) — CHƯA trừ lượt.
 *          + `/turn`: Chấm từng lượt trả lời ứng viên theo cấu trúc, từ khóa JD & số liệu định lượng.
 *          + `/complete`: Tổng hợp báo cáo + nhận xét Gemini (`generateGeminiText`) và **chỉ trừ đúng 1 credit
 *            trong Transaction ACID tại thời điểm hoàn tất** (Idempotent: gọi lại không trừ thêm).
 *          + `DELETE /interviews/:id`: Cho phép hủy phiên dở dang mà không mất lượt.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ Frontend `apps/web/src/services/profile-interview.api.ts`:
 *     + `getMyProfileAndSkills()` -> `GET /api/v1/me/profile-skills` (alias `/me/profile`)
 *     + `updateMyProfile()`       -> `PUT /api/v1/me/profile`
 *     + `uploadAndParseCv()`      -> `POST /api/v1/me/cv/upload` (alias `/me/cv`)
 *     + `screenCvAgainstJd()`     -> `POST /api/v1/interviews/screen-cv`
 *     + `startVoiceInterview()`   -> `POST /api/v1/interviews/:interviewId/start`
 *     + `sendVoiceTurn()`         -> `POST /api/v1/interviews/:interviewId/turn`
 *     + `completeInterview()`     -> `POST /api/v1/interviews/:interviewId/complete`
 *     + `cancelDraftInterview()`  -> `DELETE /api/v1/interviews/:interviewId`
 *   - Đọc/Ghi bảng DB: `accounts`, `user_profiles`, `student_skill_states`, `skills`,
 *     `mock_interviews`, `enrollments`, `cohorts`, `courses`, `certificates`.
 *   - Gọi AI Service (`aiServiceClient`):
 *     + `parseCvPdf` -> `POST /api/v1/ai/cv/parse` (`apps/ai-service/src/api/routes/career_ai.py`)
 *     + `screenCv`   -> `POST /api/v1/ai/mock-interviews/round1-cv-defense` (`apps/ai-service/src/api/routes/career_ai.py`)
 *     + `generateGeminiText` (`apps/api/src/integrations/ragAi.service.ts`) sinh nhận xét tổng kết phỏng vấn.
 * ============================================================================
 */
import { Router, type Request } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  accounts,
  userProfiles,
  studentSkillStates,
  skills,
  mockInterviews,
  enrollments,
  cohorts,
  courses,
  certificates,
} from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { generateGeminiText } from '../../integrations/ragAi.service.js';
import { normalizeMasteryScore } from '../../db/helpers.js';

export const profileRouter = Router();

const KNOWN_TECH_KEYWORDS = [
  'Python',
  'AsyncIO',
  'FastAPI',
  'Pydantic',
  'Pytest',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Express',
  'Drizzle ORM',
  'React',
  'PostgreSQL',
  'pgvector',
  'SQL',
  'Redis',
  'BullMQ',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'GitHub Actions',
  'Git',
  'Linux',
  'Hybrid RAG',
  'LangGraph',
  'Function Calling',
  'LLMOps',
  'Ragas',
  'Apache Spark',
  'PySpark',
  'Apache Kafka',
  'dbt',
  'Lakehouse',
];

/** Trích xuất văn bản đọc được từ nhị phân PDF (fallback nhẹ không phụ thuộc thư viện native khi đọc CV PDF tải lên). */
function extractReadableTextFromPdfBuffer(buf: Buffer): string {
  const latin = buf.toString('latin1');
  const textChunks: string[] = [];

  // Extract parenthesized PDF text literals (...) and UTF-8 runs
  const parenRegex = /\(([^()]{2,200})\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(latin)) !== null) {
    const cleaned = (m[1] || '').replace(/\\[nrtbf()\\]/g, ' ').trim();
    if (/[A-Za-z0-9@]/.test(cleaned)) {
      textChunks.push(cleaned);
    }
  }

  const utf8Fallback = buf
    .toString('utf8')
    .replace(/[^\p{L}\p{N}\s@._:/+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${textChunks.join(' ')} ${utf8Fallback}`.slice(0, 30000);
}

/** Quét nhanh các tín hiệu cấu trúc cục bộ từ văn bản CV (kỹ năng công nghệ chuẩn, số điện thoại VN, link GitHub/LinkedIn) dùng làm nền và fallback cho AI Service. */
function extractStructuredSignalsFromCvText(rawText: string) {
  const text = rawText || '';
  const lower = text.toLowerCase();

  const detectedSkills = KNOWN_TECH_KEYWORDS.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );

  const phoneMatch = text.match(/(?:\+84|0)(?:[\s.-]*\d){8,9}/);
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+/i);
  const linkedinMatch = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_.-]+/i
  );

  return {
    skills: detectedSkills,
    phone: phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : undefined,
    githubUrl: githubMatch ? githubMatch[0] : undefined,
    linkedinUrl: linkedinMatch ? linkedinMatch[0] : undefined,
  };
}

/** Bộ phân giải request linh hoạt hỗ trợ cả `multipart/form-data` (file PDF thật) lẫn `application/json` (trình tạo CV trực tuyến). */
async function parseMultipartOrJsonCvRequest(req: Request): Promise<{
  fileName: string;
  rawText: string;
  mode?: 'PARSE_PDF' | 'SAVE_RESUME';
  overwriteProfile: boolean;
  previewOnly: boolean;
  resumeData?: Record<string, unknown>;
}> {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);
    const webReq = new Response(rawBody, {
      headers: { 'content-type': contentType },
    });
    const formData = await webReq.formData();

    let fileName = String(formData.get('fileName') || '');
    let rawText = String(formData.get('rawText') || '');
    const modeRaw = String(formData.get('mode') || 'PARSE_PDF');
    const overwriteProfile =
      String(formData.get('overwriteProfile') || 'false').toLowerCase() === 'true';
    const previewOnly =
      String(formData.get('previewOnly') || 'false').toLowerCase() === 'true';

    const fileEntry =
      formData.get('file') || formData.get('cv') || formData.get('pdf');
    if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
      const f = fileEntry as File;
      if (f.name && !fileName) fileName = f.name;
      const arrBuf = await f.arrayBuffer();
      const extracted = extractReadableTextFromPdfBuffer(Buffer.from(arrBuf));
      rawText = `${rawText} ${extracted}`.trim();
    }

    let resumeData: Record<string, unknown> | undefined;
    const resumeStr = formData.get('resumeData');
    if (typeof resumeStr === 'string' && resumeStr.trim()) {
      try {
        resumeData = JSON.parse(resumeStr) as Record<string, unknown>;
      } catch {
        // ignore invalid json
      }
    }

    return {
      fileName: fileName || 'CV_Ung_Vien.pdf',
      rawText,
      mode: modeRaw === 'SAVE_RESUME' ? 'SAVE_RESUME' : 'PARSE_PDF',
      overwriteProfile,
      previewOnly,
      resumeData,
    };
  }

  const body = (req.body || {}) as Record<string, unknown>;
  return {
    fileName: String(body.fileName || 'CV_Ung_Vien.pdf'),
    rawText: typeof body.rawText === 'string' ? body.rawText : '',
    mode: body.mode as 'PARSE_PDF' | 'SAVE_RESUME' | undefined,
    overwriteProfile: Boolean(body.overwriteProfile),
    previewOnly: Boolean(body.previewOnly),
    resumeData: body.resumeData as Record<string, unknown> | undefined,
  };
}

/** Chuẩn hóa cấu trúc JSON hồ sơ CV (`cvParsedData`), lấp đầy các trường rỗng từ bảng `user_profiles` và `accounts.email`. */
function normalizeCvData(
  rawCv: Record<string, unknown>,
  profile?: {
    fullName?: string;
    phone?: string | null;
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
    careerGoal?: string | null;
    updatedAt?: Date;
  },
  email?: string
) {
  const projectsRaw = Array.isArray(rawCv.projects) ? rawCv.projects : [];
  const normalizedProjects = projectsRaw.map((p: Record<string, unknown>, idx: number) => {
    const list = Array.isArray(p.highlights)
      ? (p.highlights as string[])
      : typeof p.highlights === 'string' && p.highlights.trim()
        ? [p.highlights.trim()]
        : Array.isArray(p.bullets)
          ? (p.bullets as string[])
          : [];
    const techStackStr = Array.isArray(p.techStack)
      ? p.techStack.join(', ')
      : String(p.techStack || '');
    const titleStr = String(p.name || p.title || '');
    return {
      id: String(p.id || `proj-${idx + 1}`),
      name: titleStr,
      title: titleStr,
      role: String(p.role || ''),
      period: String(p.period || ''),
      techStack: techStackStr,
      highlights: list,
      bullets: list,
    };
  });

  const workRaw = Array.isArray(rawCv.workExperience)
    ? rawCv.workExperience
    : Array.isArray(rawCv.workExperiences)
      ? rawCv.workExperiences
      : [];

  const normalizedWork = workRaw.map((w: Record<string, unknown>, idx: number) => {
    const summaryStr =
      typeof w.summary === 'string'
        ? w.summary
        : Array.isArray(w.highlights)
          ? w.highlights.join(' ')
          : '';
    return {
      id: String(w.id || `work-${idx + 1}`),
      company: String(w.company || ''),
      position: String(w.position || w.role || ''),
      role: String(w.role || w.position || ''),
      period: String(w.period || ''),
      summary: summaryStr,
      highlights: Array.isArray(w.highlights) ? w.highlights : summaryStr ? [summaryStr] : [],
    };
  });

  const educationRaw = Array.isArray(rawCv.education) ? rawCv.education : [];
  const normalizedEducation = educationRaw.map((ed: Record<string, unknown>, idx: number) => ({
    id: String(ed.id || `edu-${idx + 1}`),
    school: String(ed.school || ed.institution || ''),
    institution: String(ed.institution || ed.school || ''),
    degree: String(ed.degree || ''),
    period: String(ed.period || ed.graduationYear || ''),
    graduationYear: String(ed.graduationYear || ed.period || ''),
    gpaOrHonors: String(ed.gpaOrHonors || ''),
  }));

  const awardsRaw = Array.isArray(rawCv.awardsAndCerts)
    ? rawCv.awardsAndCerts
    : Array.isArray(rawCv.certificationsAndAwards)
      ? rawCv.certificationsAndAwards
      : [];

  const normalizedAwards = awardsRaw.map((aw: unknown, idx: number) => {
    if (typeof aw === 'string') {
      return {
        id: `cert-${idx + 1}`,
        title: aw,
        issuer: '3T AI Academy',
        dateOrCode: '',
      };
    }
    const obj = (aw || {}) as Record<string, unknown>;
    return {
      id: String(obj.id || `cert-${idx + 1}`),
      title: String(obj.title || ''),
      issuer: String(obj.issuer || '3T AI Academy'),
      dateOrCode: String(obj.dateOrCode || ''),
      detail: obj.detail ? String(obj.detail) : undefined,
    };
  });

  const skillsList = Array.isArray(rawCv.skills)
    ? (rawCv.skills as string[]).map((s) => String(s))
    : [];

  const externalSkillsRaw = Array.isArray(rawCv.externalSkills) ? rawCv.externalSkills : [];
  const externalSkills =
    externalSkillsRaw.length > 0
      ? externalSkillsRaw.map((item: unknown) => {
          if (typeof item === 'string') {
            return { name: item, note: 'Trích xuất từ CV cá nhân' };
          }
          const obj = (item || {}) as Record<string, unknown>;
          return {
            name: String(obj.name || ''),
            note: String(obj.note || 'Trích xuất từ CV cá nhân'),
          };
        })
      : skillsList.map((name) => ({ name, note: 'Trích xuất từ CV cá nhân' }));

  const fileName = String(rawCv.fileName || '');
  const updatedAt = String(
    rawCv.updatedAt ||
      rawCv.extractedAt ||
      (profile?.updatedAt ? profile.updatedAt.toISOString() : '')
  );

  return {
    fileName,
    updatedAt,
    extractedAt: String(rawCv.extractedAt || updatedAt),
    fullName: String(rawCv.fullName || profile?.fullName || ''),
    candidateName: String(rawCv.candidateName || rawCv.fullName || profile?.fullName || ''),
    headline: String(rawCv.headline || profile?.bio || ''),
    targetRole: String(rawCv.targetRole || rawCv.headline || profile?.bio || ''),
    summaryBio: String(rawCv.summaryBio || rawCv.careerObjective || profile?.careerGoal || ''),
    email: String(rawCv.email || email || ''),
    phone: String(profile?.phone || rawCv.phone || ''),
    location: String(rawCv.location || ''),
    avatarUrl: String(profile?.avatarUrl || rawCv.avatarUrl || ''),
    githubUrl: String(profile?.githubUrl || rawCv.githubUrl || ''),
    linkedinUrl: String(profile?.linkedinUrl || rawCv.linkedinUrl || ''),
    careerObjective: String(rawCv.careerObjective || profile?.careerGoal || ''),
    skills: skillsList,
    externalSkills,
    projects: normalizedProjects,
    workExperience: normalizedWork,
    workExperiences: normalizedWork,
    education: normalizedEducation,
    awardsAndCerts: normalizedAwards,
    certificationsAndAwards: normalizedAwards,
  };
}

/**
 * Routes `GET /api/v1/me/profile-skills` & `GET /api/v1/me/profile` — Tải Hồ sơ năng lực toàn diện,
 * ma trận điểm kỹ năng Elo-IRT, chứng chỉ HMAC, lịch sử phỏng vấn AI và số lượt phỏng vấn còn lại.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.getMyProfileAndSkills()`.
 *   Đọc DB: `accounts`, `user_profiles`, `student_skill_states`, `skills`, `mock_interviews`, `enrollments`, `cohorts`, `courses`, `certificates`.
 */
// 5.1 GET /me/profile-skills & /me/profile
async function handleGetProfileSkills(req: Request, res: any, next: any) {
  try {
    const accountId = req.user!.id;

    const [
      [profile],
      [account],
      skillStates,
      interviews,
      myEnrollments,
      allCohorts,
      allCourses,
      myCerts,
    ] = await Promise.all([
      db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
      db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
      db
        .select({
          skillId: studentSkillStates.skillId,
          code: skills.code,
          name: skills.name,
          masteryScore: studentSkillStates.masteryScore,
          evidenceCount: studentSkillStates.evidenceCount,
          trend: studentSkillStates.trend,
          updatedAt: studentSkillStates.updatedAt,
        })
        .from(studentSkillStates)
        .innerJoin(skills, eq(studentSkillStates.skillId, skills.id))
        .where(eq(studentSkillStates.accountId, accountId)),
      db
        .select()
        .from(mockInterviews)
        .where(eq(mockInterviews.accountId, accountId))
        .orderBy(desc(mockInterviews.createdAt)),
      db.select().from(enrollments).where(eq(enrollments.accountId, accountId)),
      db.select().from(cohorts),
      db.select().from(courses),
      db.select().from(certificates).where(eq(certificates.accountId, accountId)),
    ]);

    const rawCv = (profile?.cvParsedData ?? {}) as Record<string, unknown>;
    const cvParsedData = normalizeCvData(rawCv, profile, account?.email);

    // Sync earned non-revoked 3T certificates into awardsAndCerts view if not yet listed
    for (const cert of myCerts.filter((c) => !c.revokedAt)) {
      const alreadyListed = cvParsedData.awardsAndCerts.some((a) =>
        a.dateOrCode.includes(cert.certificateCode)
      );
      if (!alreadyListed) {
        const enr = myEnrollments.find((e) => e.id === cert.enrollmentId);
        const ch = enr ? allCohorts.find((c) => c.id === enr.cohortId) : undefined;
        const cr = ch ? allCourses.find((c) => c.id === ch.courseId) : undefined;
        const certEntry = {
          id: `3t-cert-${cert.id}`,
          title: `Chứng chỉ Tốt nghiệp: ${cr?.title || ch?.name || '3T Academy'}`,
          issuer: '3T AI Academy',
          dateOrCode: `${cert.issuedAt.toLocaleDateString('vi-VN')} · ${cert.certificateCode}`,
        };
        cvParsedData.awardsAndCerts.push(certEntry);
        cvParsedData.certificationsAndAwards.push(certEntry);
      }
    }

    const primaryEnrollment = myEnrollments[0];
    const primaryCohort = primaryEnrollment
      ? allCohorts.find((c) => c.id === primaryEnrollment.cohortId)
      : undefined;
    const primaryCourse = primaryCohort
      ? allCourses.find((c) => c.id === primaryCohort.courseId)
      : undefined;

    const userProfileDto = {
      userId: String(accountId),
      id: String(accountId),
      fullName: profile?.fullName || cvParsedData.fullName,
      avatarUrl: profile?.avatarUrl || cvParsedData.avatarUrl || undefined,
      headline: cvParsedData.headline,
      bio: profile?.bio || cvParsedData.headline,
      email: account?.email || req.user!.email,
      phone: profile?.phone || cvParsedData.phone,
      githubUrl: profile?.githubUrl || cvParsedData.githubUrl,
      linkedinUrl: profile?.linkedinUrl || cvParsedData.linkedinUrl,
      preferences: profile?.preferences || {},
      careerObjective: cvParsedData.careerObjective,
      careerGoal: profile?.careerGoal || cvParsedData.careerObjective,
      latestCvFileName: cvParsedData.fileName,
      latestCvUpdatedAt: cvParsedData.updatedAt,
      interviewCredits: profile?.interviewCredits ?? 0,
      cvParsedData,
    };

    res.json({
      userProfile: userProfileDto,
      profile: userProfileDto,
      cvParsedData,
      studentSkillStates: skillStates.map((s) => {
        const score = normalizeMasteryScore(s.masteryScore);
        const rawTrend = Number(s.trend || 0);
        const pctDelta = Math.abs(rawTrend) <= 1 && rawTrend !== 0
          ? Math.round(rawTrend * 100)
          : Math.round(rawTrend);
        return {
          userId: String(accountId),
          skillId: String(s.skillId),
          code: s.code,
          name: s.name,
          skillName: s.name,
          score,
          masteryScore: score,
          evidenceCount: s.evidenceCount,
          cohortId: primaryCohort ? String(primaryCohort.id) : '',
          cohortCode: primaryCohort?.code || '',
          courseTitle: primaryCourse?.title || '',
          sourceLabel: `${s.evidenceCount} bài kiểm tra thực chiến`,
          trend: pctDelta > 0 ? `+${pctDelta}%` : pctDelta < 0 ? `${pctDelta}%` : 'Ổn định',
          updatedAt: s.updatedAt.toLocaleDateString('vi-VN'),
          lastUpdated: s.updatedAt.toLocaleDateString('vi-VN'),
        };
      }),
      externalCvSkills: cvParsedData.externalSkills,
      mockInterviews: interviews.map((iv) => ({
        ...iv,
        id: String(iv.id),
        accountId: String(iv.accountId),
      })),
    });
  } catch (err) {
    next(err);
  }
}

profileRouter.get('/me/profile-skills', requireAuth, handleGetProfileSkills);
profileRouter.get('/me/profile', requireAuth, handleGetProfileSkills);

/**
 * Route `PUT /api/v1/me/profile` — Cập nhật thông tin cá nhân và đồng bộ ngược vào `user_profiles.cv_parsed_data`.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.updateMyProfile()`. Đọc/Ghi DB: `user_profiles`, `accounts`.
 */
// 5.1B PUT /me/profile
const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  githubUrl: z.string().optional(),
  linkedinUrl: z.string().optional(),
  bio: z.string().optional(),
  careerGoal: z.string().optional(),
  preferences: z
    .object({
      emailReminders: z.boolean().optional(),
      liveSessionAlerts: z.boolean().optional(),
      aiStudyNudges: z.boolean().optional(),
      marketingUpdates: z.boolean().optional(),
    })
    .optional(),
});

profileRouter.put(
  '/me/profile',
  requireAuth,
  validate(updateProfileSchema),
  async (req, res, next) => {
    try {
      const accountId = req.user!.id;
      const {
        fullName,
        avatarUrl,
        phone,
        githubUrl,
        linkedinUrl,
        bio,
        careerGoal,
        preferences,
      } = req.body;

      const [[existingProfile], [account]] = await Promise.all([
        db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
        db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
      ]);

      const resolvedFullName = fullName?.trim() || existingProfile?.fullName || '';
      const resolvedPhone = phone !== undefined ? phone.trim() : existingProfile?.phone ?? '';
      const resolvedGithub =
        githubUrl !== undefined ? githubUrl.trim() : existingProfile?.githubUrl ?? '';
      const resolvedLinkedin =
        linkedinUrl !== undefined ? linkedinUrl.trim() : existingProfile?.linkedinUrl ?? '';
      const resolvedPrefs = preferences
        ? { ...(existingProfile?.preferences || {}), ...preferences }
        : existingProfile?.preferences || {};

      const currentCv = normalizeCvData(
        (existingProfile?.cvParsedData ?? {}) as Record<string, unknown>,
        existingProfile,
        account?.email
      );

      const updatedCv = {
        ...currentCv,
        fullName: resolvedFullName || currentCv.fullName,
        avatarUrl: avatarUrl ?? existingProfile?.avatarUrl ?? currentCv.avatarUrl,
        phone: resolvedPhone || currentCv.phone,
        githubUrl: resolvedGithub || currentCv.githubUrl,
        linkedinUrl: resolvedLinkedin || currentCv.linkedinUrl,
        headline: bio ?? existingProfile?.bio ?? currentCv.headline,
        careerObjective: careerGoal ?? existingProfile?.careerGoal ?? currentCv.careerObjective,
      };

      const [updated] = await db
        .update(userProfiles)
        .set({
          fullName: resolvedFullName,
          phone: resolvedPhone || null,
          githubUrl: resolvedGithub || null,
          linkedinUrl: resolvedLinkedin || null,
          avatarUrl: avatarUrl ?? existingProfile?.avatarUrl,
          bio: bio ?? existingProfile?.bio,
          careerGoal: careerGoal ?? existingProfile?.careerGoal,
          preferences: resolvedPrefs,
          cvParsedData: updatedCv,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.accountId, accountId))
        .returning();

      const userProfileDto = {
        userId: String(accountId),
        id: String(accountId),
        email: account?.email || req.user!.email,
        role: account?.role || req.user!.role,
        fullName: updated?.fullName || resolvedFullName,
        avatarUrl: updated?.avatarUrl || updatedCv.avatarUrl,
        headline: updated?.bio || updatedCv.headline,
        phone: updated?.phone || updatedCv.phone,
        githubUrl: updated?.githubUrl || updatedCv.githubUrl,
        linkedinUrl: updated?.linkedinUrl || updatedCv.linkedinUrl,
        preferences: updated?.preferences || resolvedPrefs,
        careerObjective: updated?.careerGoal || updatedCv.careerObjective,
        bio: updated?.bio || updatedCv.headline,
        careerGoal: updated?.careerGoal || updatedCv.careerObjective,
        latestCvFileName: updatedCv.fileName,
        latestCvUpdatedAt: updatedCv.updatedAt,
        interviewCredits: updated?.interviewCredits ?? 0,
        cvParsedData: updatedCv,
      };

      res.json({
        success: true,
        profile: updated,
        userProfile: userProfileDto,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Routes `POST /api/v1/me/cv/upload` & `POST /api/v1/me/cv` — Tải lên CV PDF để AI bóc tách (`PARSE_PDF`) hoặc lưu CV soạn tay (`SAVE_RESUME`).
 *
 * - **Quy trình chế độ `PARSE_PDF`:**
 *   + Bước 1: Đọc văn bản PDF / JSON và chạy trích xuất cục bộ (`extractStructuredSignalsFromCvText`).
 *   + Bước 2: Gọi `aiServiceClient.parseCvPdf()` sang `apps/ai-service` (`POST /api/v1/ai/cv/parse`) để làm giàu kỹ năng, dự án, liên hệ (có fallback cục bộ nếu lỗi).
 *   + Bước 3: Hợp nhất dữ liệu theo cờ `overwriteProfile` và lưu vào `user_profiles` (bỏ qua ghi DB nếu `previewOnly = true`).
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.uploadAndParseCv()`. Đọc/Ghi DB: `user_profiles`, `accounts`.
 */
// 5.2 POST /me/cv/upload & POST /me/cv (Supports BOTH multipart/form-data PDF & JSON!)
async function handleUploadCv(req: Request, res: any, next: any) {
  try {
    const accountId = req.user!.id;
    const parsedReq = await parseMultipartOrJsonCvRequest(req);
    const { fileName, rawText, mode, overwriteProfile, previewOnly, resumeData } = parsedReq;

    const [[existingProfile], [account]] = await Promise.all([
      db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
      db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
    ]);

    const currentCv = normalizeCvData(
      (existingProfile?.cvParsedData ?? {}) as Record<string, unknown>,
      existingProfile,
      account?.email
    );

    if (mode === 'PARSE_PDF' || (!resumeData && mode !== 'SAVE_RESUME')) {
      const localSignals = extractStructuredSignalsFromCvText(`${rawText} ${fileName}`);
      let aiSkills = [...localSignals.skills];
      let aiProjects = currentCv.projects;
      let extractedPhone = localSignals.phone;
      let extractedGithub = localSignals.githubUrl;
      let extractedLinkedin = localSignals.linkedinUrl;

      try {
        const parsed = await aiServiceClient.parseCvPdf(rawText || fileName, req.correlationId);
        if (Array.isArray(parsed.skills)) {
          aiSkills = Array.from(new Set([...aiSkills, ...parsed.skills]));
        }
        if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
          aiProjects = parsed.projects as typeof currentCv.projects;
        }
        if (parsed.phone) extractedPhone = parsed.phone;
        if (parsed.githubUrl) extractedGithub = parsed.githubUrl;
        if (parsed.linkedinUrl) extractedLinkedin = parsed.linkedinUrl;
      } catch {
        // Local extraction already captured tech keywords & contact links
      }

      const nowIso = new Date().toISOString();
      const mergedSkills = Array.from(new Set([...currentCv.skills, ...aiSkills]));
      const extractedCvData = normalizeCvData(
        {
          ...currentCv,
          fileName,
          updatedAt: nowIso,
          extractedAt: nowIso,
          phone: overwriteProfile
            ? extractedPhone || currentCv.phone
            : currentCv.phone || extractedPhone || '',
          githubUrl: overwriteProfile
            ? extractedGithub || currentCv.githubUrl
            : currentCv.githubUrl || extractedGithub || '',
          linkedinUrl: overwriteProfile
            ? extractedLinkedin || currentCv.linkedinUrl
            : currentCv.linkedinUrl || extractedLinkedin || '',
          skills: mergedSkills,
          externalSkills: mergedSkills.map((name) => ({
            name,
            note: `Trích xuất từ ${fileName}`,
          })),
          projects: aiProjects,
        },
        existingProfile,
        account?.email
      );

      if (!previewOnly) {
        await db
          .update(userProfiles)
          .set({
            phone: overwriteProfile
              ? extractedCvData.phone || existingProfile?.phone || null
              : existingProfile?.phone || extractedCvData.phone || null,
            githubUrl: overwriteProfile
              ? extractedCvData.githubUrl || existingProfile?.githubUrl || null
              : existingProfile?.githubUrl || extractedCvData.githubUrl || null,
            linkedinUrl: overwriteProfile
              ? extractedCvData.linkedinUrl || existingProfile?.linkedinUrl || null
              : existingProfile?.linkedinUrl || extractedCvData.linkedinUrl || null,
            cvParsedData: extractedCvData,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.accountId, accountId));
      }

      res.json({
        fileName,
        mode: 'PARSE_PDF',
        persisted: !previewOnly,
        overwriteProfile,
        updatedAt: nowIso,
        cvParsedData: extractedCvData,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const mergedCv = normalizeCvData(
      {
        ...currentCv,
        ...(resumeData || {}),
        fileName: (resumeData?.fileName as string) || fileName || currentCv.fileName,
        updatedAt: nowIso,
      },
      overwriteProfile ? undefined : existingProfile,
      account?.email
    );

    await db
      .update(userProfiles)
      .set({
        fullName:
          overwriteProfile || !existingProfile?.fullName
            ? mergedCv.fullName || existingProfile?.fullName || ''
            : existingProfile.fullName,
        phone:
          overwriteProfile || !existingProfile?.phone
            ? mergedCv.phone || existingProfile?.phone || null
            : existingProfile.phone,
        githubUrl:
          overwriteProfile || !existingProfile?.githubUrl
            ? mergedCv.githubUrl || existingProfile?.githubUrl || null
            : existingProfile.githubUrl,
        linkedinUrl:
          overwriteProfile || !existingProfile?.linkedinUrl
            ? mergedCv.linkedinUrl || existingProfile?.linkedinUrl || null
            : existingProfile.linkedinUrl,
        bio: mergedCv.headline || existingProfile?.bio,
        careerGoal: mergedCv.careerObjective || existingProfile?.careerGoal,
        cvParsedData: mergedCv,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.accountId, accountId));

    res.json({
      fileName: mergedCv.fileName,
      mode: 'SAVE_RESUME',
      overwriteProfile,
      updatedAt: nowIso,
      cvParsedData: mergedCv,
    });
  } catch (err) {
    next(err);
  }
}

profileRouter.post('/me/cv/upload', requireAuth, handleUploadCv);
profileRouter.post('/me/cv', requireAuth, handleUploadCv);

/**
 * Route `POST /api/v1/interviews/screen-cv` — Vòng 1 Phỏng vấn AI: Rà soát mức độ khớp giữa CV và JD (MIỄN PHÍ — 0 credit).
 *
 * - **Mục tiêu:** Hợp nhất kỹ năng tự khai trên CV với kỹ năng đã được học viện xác thực (`student_skill_states`),
 *   gọi `aiServiceClient.screenCv()` (`apps/ai-service/src/api/routes/career_ai.py` -> `POST /api/v1/ai/mock-interviews/round1-cv-defense`)
 *   để chấm điểm khớp `matchPercent`, chỉ ra lỗ hổng kỹ năng (`missingKeywordsOrGaps`) và tạo bản ghi `mock_interviews (status = 'CV_SCREENING')`.
 * - **Fallback:** Đã tính sẵn điểm so khớp từ khóa JD vs CV cục bộ nên vẫn chạy trơn tru nếu AI Service tạm ngắt.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.screenCvAgainstJd()`. Đọc `user_profiles`, `student_skill_states`, `skills`; ghi `mock_interviews`.
 */
// 5.3 POST /interviews/screen-cv (Free Stage 1 — does NOT deduct interview_credits)
const screenCvSchema = z.object({
  targetLevel: z.enum(['INTERN', 'FRESHER', 'JUNIOR', 'SENIOR']),
  targetRole: z.string().min(2),
  jdRawText: z.string().min(10),
});

/** Sinh bộ 3 câu hỏi phỏng vấn kỹ thuật thích ứng theo chuyên ngành JD (Data/Kafka-Spark, Backend/Distributed, Python/SQL hoặc AI/RAG) và tên dự án thực tế trong CV. */
function buildRoleAdaptiveInterviewQuestions(params: {
  candidateName: string;
  targetRole: string;
  targetLevel: string;
  jdRawText: string;
  projectTitle?: string;
}) {
  const combined = `${params.targetRole} ${params.jdRawText}`.toLowerCase();
  const projectRef = params.projectTitle
    ? `dự án "${params.projectTitle}" trong hồ sơ của bạn`
    : 'dự án kỹ thuật tiêu biểu nhất trong CV của bạn';

  const q1 = {
    stageTag: 'Câu 1/3 · Bảo vệ kiến trúc dự án thực tế trong CV',
    text: `Chào ${params.candidateName}! Ứng tuyển vị trí ${params.targetRole} (${params.targetLevel}), bạn hãy trình bày kiến trúc cốt lõi của ${projectRef}, điểm nghẽn kỹ thuật khó nhất bạn từng xử lý và kết quả đo lường thực tế?`,
  };

  if (combined.includes('kafka') || combined.includes('spark') || combined.includes('data')) {
    return [
      q1,
      {
        stageTag: 'Câu 2/3 · Xử lý dữ liệu lớn & Kiến trúc Streaming/Lakehouse',
        text: 'Khi đường ống PySpark hoặc Kafka Consumer gặp hiện tượng Data Skew (một phân vùng chậm gấp nhiều lần các phân vùng còn lại) và sự kiện đến trễ, bạn xử lý Partitioning, Broadcast Join và Idempotent Upsert xuống tầng Silver/Gold như thế nào?',
      },
      {
        stageTag: 'Câu 3/3 · Kiểm định chất lượng dữ liệu & Vận hành SLA',
        text: 'Làm thế nào để bạn thiết kế kiểm thử chất lượng dữ liệu tự động với dbt và đảm bảo khi chạy lại (Backfill) 3 tháng lịch sử không xảy ra nhân bản dữ liệu trên báo cáo?',
      },
    ];
  }

  if (
    combined.includes('backend') ||
    combined.includes('typescript') ||
    combined.includes('node') ||
    combined.includes('distributed')
  ) {
    return [
      q1,
      {
        stageTag: 'Câu 2/3 · Giao dịch ACID, Concurrency & Idempotent Webhook',
        text: 'Giả sử cổng thanh toán gửi đồng thời 3 gói tin webhook trùng lặp cho cùng một đơn hàng học phí, bạn thiết kế giao dịch PostgreSQL (SELECT FOR UPDATE / Unique Constraint) như thế nào để không cộng trùng sĩ số lớp?',
      },
      {
        stageTag: 'Câu 3/3 · Bảo mật phân quyền đối tượng & Tối ưu hiệu năng p95',
        text: 'Bạn phân biệt kiểm tra vai trò RBAC với kiểm tra quyền sở hữu tài nguyên chống lỗi IDOR như thế nào, và dùng EXPLAIN ANALYZE / Redis Cache-Aside ra sao khi truy vấn bị chậm ở phân vị p95?',
      },
    ];
  }

  if (combined.includes('python') && combined.includes('sql') && !combined.includes('rag')) {
    return [
      q1,
      {
        stageTag: 'Câu 2/3 · Lập trình Bất đồng bộ Python AsyncIO & Connection Pool',
        text: 'Khi dịch vụ Python cần gọi hàng trăm yêu cầu HTTP đồng thời và ghi kết quả vào PostgreSQL, bạn kết hợp httpx.AsyncClient, asyncio.Semaphore và Connection Pool như thế nào để không làm nghẽn Event Loop?',
      },
      {
        stageTag: 'Câu 3/3 · Truy vấn SQL Phân tích & Chống SQL Injection',
        text: 'Bạn hãy so sánh cách hoạt động của Window Functions (DENSE_RANK, LAG) với GROUP BY trên PostgreSQL, và nêu nguyên tắc bắt buộc để ngăn chặn triệt để SQL Injection?',
      },
    ];
  }

  // Default AI / LLM / RAG track
  return [
    q1,
    {
      stageTag: 'Câu 2/3 · Kiến trúc Hybrid RAG, pgvector HNSW & RRF',
      text: 'Khi xây dựng hệ thống RAG trên PostgreSQL pgvector, vì sao cần kết hợp tìm kiếm ngữ nghĩa với tsvector qua công thức Reciprocal Rank Fusion (RRF), và viết câu lệnh ORDER BY thế nào để không làm mất tác dụng của chỉ mục HNSW?',
    },
    {
      stageTag: 'Câu 3/3 · Function Calling, Guardrails & Đánh giá Ragas',
      text: 'Trong hệ thống AI Production có phân quyền nhiều khóa học/phòng ban, bạn đặt bộ lọc cách ly dữ liệu ở tầng nào và sử dụng chỉ số Faithfulness / Context Recall của Ragas ra sao để kiểm soát ảo giác?',
    },
  ];
}

/** Chấm điểm định lượng chất lượng câu trả lời ứng viên theo 3 tiêu chí: độ dài/cấu trúc (`structureScore`), độ khớp từ khóa JD (`relevanceScore`) và có dẫn chứng số liệu (`hasMetrics`: ms, %, p95...). */
function evaluateCandidateAnswerQuality(answer: string, jdRawText: string, questionText: string) {
  const clean = answer.trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  const refTokens = new Set(
    `${jdRawText} ${questionText}`
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4)
  );
  const ansTokens = clean
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);

  let keywordHits = 0;
  const matchedSet = new Set<string>();
  for (const tk of ansTokens) {
    if (refTokens.has(tk) && !matchedSet.has(tk)) {
      matchedSet.add(tk);
      keywordHits += 1;
    }
  }

  const hasMetrics = /\b(\d+%|\d+\s*(ms|s|giây|mb|gb|rps|user|dòng|lần)|o\(1\)|o\(n|p95|p99)\b/i.test(
    clean
  );
  const structureScore = Math.min(35, Math.round(wordCount * 0.7));
  const relevanceScore = Math.min(45, keywordHits * 7);
  const metricBonus = hasMetrics ? 12 : 0;

  const rawScore = 15 + structureScore + relevanceScore + metricBonus;
  const score = Math.min(96, Math.max(35, rawScore));

  const feedback =
    score >= 82
      ? 'Câu trả lời có chiều sâu kỹ thuật tốt, bám sát từ khóa cốt lõi của vị trí ứng tuyển và trình bày rõ cơ chế xử lý.'
      : score >= 65
        ? 'Nêu được hướng giải quyết đúng trọng tâm nhưng nên bổ sung thêm cơ chế xử lý lỗi biên và số liệu đo kiểm thực tế.'
        : 'Câu trả lời còn khá ngắn hoặc thiếu chi tiết kiến trúc cụ thể; hãy phân tích rõ công cụ, luồng dữ liệu và lý do lựa chọn kỹ thuật.';

  return { score, wordCount, hasMetrics, keywordHits, feedback };
}

profileRouter.post(
  '/interviews/screen-cv',
  requireAuth,
  validate(screenCvSchema),
  async (req, res, next) => {
    try {
      const accountId = req.user!.id;
      const { targetLevel, targetRole, jdRawText } = req.body;

      const [[profile], userSkillStates, allSkills] = await Promise.all([
        db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.accountId, accountId))
          .limit(1),
        db
          .select()
          .from(studentSkillStates)
          .where(eq(studentSkillStates.accountId, accountId)),
        db.select().from(skills),
      ]);

      const skillMap = new Map(allSkills.map((s) => [s.id, s]));
      const rawCv = (profile?.cvParsedData ?? {}) as Record<string, unknown>;
      const cvSkills = Array.isArray(rawCv.skills)
        ? (rawCv.skills as string[]).map((s) => String(s))
        : [];
      const learnedSkillNames = userSkillStates
        .map((ss) => skillMap.get(ss.skillId)?.name || '')
        .filter(Boolean);

      const allCandidateSkills = Array.from(new Set([...cvSkills, ...learnedSkillNames]));
      const jdLower = jdRawText.toLowerCase();
      const matchedSkills = allCandidateSkills.filter((sk) => {
        const firstToken = sk.toLowerCase().split(/[\s/&]+/)[0] || '';
        return firstToken.length >= 2 && jdLower.includes(firstToken);
      });

      const jdExpectedTechs = KNOWN_TECH_KEYWORDS.filter((kw) =>
        jdLower.includes(kw.toLowerCase())
      );
      const candidateLowerJoin = allCandidateSkills.join(' ').toLowerCase();
      let missingKeywordsOrGaps = jdExpectedTechs
        .filter((kw) => !candidateLowerJoin.includes(kw.toLowerCase()))
        .map((kw) => `Bổ sung minh chứng thực hành cho kỹ năng yêu cầu trong JD: ${kw}`);

      let matchPercent =
        jdExpectedTechs.length > 0
          ? Math.min(
              95,
              Math.max(
                40,
                Math.round(
                  45 +
                    ((jdExpectedTechs.length - missingKeywordsOrGaps.length) /
                      jdExpectedTechs.length) *
                      45
                )
              )
            )
          : Math.min(92, Math.max(50, 55 + matchedSkills.length * 7));

      try {
        const aiResult = await aiServiceClient.screenCv(
          {
            cvData: rawCv,
            targetLevel,
            targetRole,
            jdRawText,
          },
          req.correlationId
        );
        const aiScore = aiResult.matchScore ?? aiResult.match_score;
        if (typeof aiScore === 'number') {
          matchPercent = aiScore;
        }
        const aiMissing = aiResult.missingSkills ?? aiResult.missing_skills;
        if (Array.isArray(aiMissing) && aiMissing.length > 0) {
          missingKeywordsOrGaps = aiMissing;
        }
      } catch {
        // Deterministic JD vs CV + 3T Skill Mastery comparison already computed
      }

      if (missingKeywordsOrGaps.length === 0) {
        missingKeywordsOrGaps = [
          'Nêu thêm chỉ số định lượng (độ trễ p95, thông lượng tải hoặc độ chính xác) cho dự án trọng tâm trong CV.',
        ];
      }

      const passedGate = matchPercent >= 55;
      const cvScreeningResult = {
        matchPercent,
        matchScore: matchPercent,
        passedGate,
        matchedSkills,
        layoutAndPresentationFeedback:
          allCandidateSkills.length > 0
            ? `Hồ sơ đã đồng bộ ${allCandidateSkills.length} nhóm kỹ năng chuyên môn (${matchedSkills.length} kỹ năng khớp trực tiếp JD).`
            : 'Hồ sơ hiện chưa cập nhật danh sách kỹ năng/dự án; bạn nên bổ sung thông tin ở mục Hồ sơ năng lực để tăng điểm khớp JD.',
        jdMatchEvaluation: `Hồ sơ đạt độ khớp ${matchPercent}% so với yêu cầu vị trí ${targetRole} (${targetLevel}).`,
        missingKeywordsOrGaps,
      };

      const [interview] = await db
        .insert(mockInterviews)
        .values({
          accountId,
          targetLevel,
          targetRole,
          jdRawText,
          cvScreeningResult,
          transcriptLog: [],
          status: 'CV_SCREENING',
        })
        .returning();

      res.status(201).json({
        interviewId: String(interview!.id),
        status: 'CV_SCREENING',
        matchPercent: cvScreeningResult.matchPercent,
        passedGate: cvScreeningResult.passedGate,
        creditDeducted: 0,
        availableCredits: profile?.interviewCredits ?? 0,
        matchedSkills,
        layoutAndPresentationFeedback: cvScreeningResult.layoutAndPresentationFeedback,
        jdMatchEvaluation: cvScreeningResult.jdMatchEvaluation,
        missingKeywordsOrGaps: cvScreeningResult.missingKeywordsOrGaps,
        cvScreeningResult,
        screeningResult: cvScreeningResult,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/interviews/:interviewId/start` — Bắt đầu Vòng 2 Phỏng vấn Giọng nói 1-1 cùng AI.
 *
 * - **Bảo mật & Kiểm soát lượt (Credit Gate):**
 *   + Bước 1: Kiểm tra quyền sở hữu phiên phỏng vấn (chống IDOR -> HTTP 403).
 *   + Bước 2: Kiểm tra `user_profiles.interview_credits > 0` (nếu bằng 0 trả HTTP 402 `NO_INTERVIEW_CREDITS` nhắc mua khóa học nhận +4 lượt).
 *   + Bước 3: Sinh bộ 3 câu hỏi thích ứng, chuyển trạng thái `IN_PROGRESS` và trả câu hỏi đầu tiên (CHƯA trừ credit ở bước này).
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.startVoiceInterview()`. Đọc `user_profiles`; đọc/ghi `mock_interviews`.
 */
// 5.4 POST /interviews/:interviewId/start (Strict Ownership + Credit Gate!)
profileRouter.post('/interviews/:interviewId/start', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const interviewId = Number(req.params.interviewId);

    const [[profile], [interview]] = await Promise.all([
      db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
      db.select().from(mockInterviews).where(eq(mockInterviews.id, interviewId)).limit(1),
    ]);

    if (!interview) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Không tìm thấy phiên phỏng vấn',
      });
      return;
    }

    if (Number(interview.accountId) !== Number(accountId)) {
      res.status(403).json({
        success: false,
        status: 403,
        code: 'FORBIDDEN_INTERVIEW_OWNER',
        message: 'Bạn không có quyền truy cập phiên phỏng vấn của người khác',
      });
      return;
    }

    if (!profile || profile.interviewCredits <= 0) {
      const message =
        'Bạn hiện có 0 lượt phỏng vấn AI. Hãy đăng ký một đợt học chính thức tại 3T Academy để nhận ngay +4 lượt Luyện phỏng vấn 1-1!';
      res.status(402).json({
        success: false,
        status: 402,
        code: 'NO_INTERVIEW_CREDITS',
        message,
        error: {
          code: 'NO_INTERVIEW_CREDITS',
          message,
        },
      });
      return;
    }

    const rawCv = (profile.cvParsedData ?? {}) as Record<string, unknown>;
    const projects = Array.isArray(rawCv.projects)
      ? (rawCv.projects as Array<Record<string, unknown>>)
      : [];
    const firstProjTitle = projects[0]
      ? String(projects[0].name || projects[0].title || '')
      : undefined;

    const questionBank = buildRoleAdaptiveInterviewQuestions({
      candidateName: profile.fullName || 'bạn',
      targetRole: interview.targetRole,
      targetLevel: interview.targetLevel,
      jdRawText: interview.jdRawText,
      projectTitle: firstProjTitle,
    });

    const firstQ = questionBank[0]!;
    const firstQuestionEntry = {
      speaker: 'SENIOR_AI',
      speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
      stageTag: firstQ.stageTag,
      text: firstQ.text,
      plannedQuestions: questionBank,
      createdAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(mockInterviews)
      .set({
        status: 'IN_PROGRESS',
        transcriptLog: [firstQuestionEntry],
      })
      .where(eq(mockInterviews.id, interviewId))
      .returning();

    res.json({
      interviewId: String(updated?.id ?? interviewId),
      status: 'IN_PROGRESS',
      creditDeducted: 0,
      startedAt: new Date().toISOString(),
      turnIndex: 0,
      totalTurns: questionBank.length,
      stageTag: firstQ.stageTag,
      questionText: firstQ.text,
      plannedQuestions: questionBank,
      interviewerName: 'Hội đồng Phỏng vấn Kỹ thuật AI',
      interviewerTitle: `Chuyên gia Phỏng vấn ${interview.targetRole} — 3T Academy`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/interviews/:interviewId/turn` — Ghi nhận câu trả lời của một lượt phỏng vấn, chấm điểm tức thì và trả câu hỏi tiếp theo.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.sendVoiceTurn()`. Đọc `user_profiles`; cập nhật `mock_interviews.transcript_log`.
 */
// 5.5 POST /interviews/:interviewId/turn
const turnSchema = z
  .object({
    turnIndex: z.number().int().min(0).optional(),
    questionPrompt: z.string().optional(),
    answerTranscript: z.string().optional(),
    transcript: z.string().optional(),
    durationSec: z.number().optional(),
  })
  .refine(
    (d) =>
      Boolean(
        (d.answerTranscript && d.answerTranscript.trim().length > 0) ||
          (d.transcript && d.transcript.trim().length > 0)
      ),
    { message: 'Nội dung câu trả lời không được để trống' }
  );

profileRouter.post(
  '/interviews/:interviewId/turn',
  requireAuth,
  validate(turnSchema),
  async (req, res, next) => {
    try {
      const accountId = req.user!.id;
      const interviewId = Number(req.params.interviewId);
      const { turnIndex: reqTurnIdx, questionPrompt, durationSec } = req.body;
      const answerTranscript = String(
        req.body.answerTranscript || req.body.transcript || ''
      ).trim();

      const [[interview], [profile]] = await Promise.all([
        db.select().from(mockInterviews).where(eq(mockInterviews.id, interviewId)).limit(1),
        db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
      ]);

      if (!interview) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'INTERVIEW_NOT_FOUND',
          message: 'Không tìm thấy phiên phỏng vấn',
        });
        return;
      }

      if (Number(interview.accountId) !== Number(accountId)) {
        res.status(403).json({
          success: false,
          status: 403,
          code: 'FORBIDDEN_INTERVIEW_OWNER',
          message: 'Bạn không có quyền thao tác trên phiên phỏng vấn của người khác',
        });
        return;
      }

      const currentLog = Array.isArray(interview.transcriptLog)
        ? (interview.transcriptLog as Array<Record<string, unknown>>)
        : [];
      const studentTurnsCount = currentLog.filter((entry) => entry.speaker === 'STUDENT').length;
      const currentTurnIdx = reqTurnIdx ?? studentTurnsCount;

      const questionBank = buildRoleAdaptiveInterviewQuestions({
        candidateName: profile?.fullName || 'bạn',
        targetRole: interview.targetRole,
        targetLevel: interview.targetLevel,
        jdRawText: interview.jdRawText,
      });

      const currentQuestionText =
        questionPrompt ||
        questionBank[currentTurnIdx]?.text ||
        String(currentLog[currentLog.length - 1]?.text || '');

      // Bước 1: Tính điểm & nhận xét dự phòng cục bộ trước để luôn có kết quả tức thì
      const localEval = evaluateCandidateAnswerQuality(
        answerTranscript,
        interview.jdRawText,
        currentQuestionText
      );

      // Bước 2: Ưu tiên gọi Python AI Service (`POST /api/v1/ai/mock-interviews/evaluate-answer`)
      // để chấm Rubric định lượng 3 tiêu chí (Technical 50% + STAR 30% + WPM Fluency 20%)
      let turnEval = localEval;
      let rubricDetail:
        | {
            technicalScore: number;
            starStructureScore: number;
            fluencyScore: number;
            speechMetrics: { wordCount: number; wordsPerMinute: number; fillerCount: number };
          }
        | undefined;

      try {
        const aiTurn = await aiServiceClient.evaluateInterviewTurn(
          {
            question: currentQuestionText,
            transcriptAnswer: answerTranscript,
            durationSeconds: durationSec ?? 45,
          },
          req.correlationId
        );
        if (aiTurn && typeof aiTurn.overallScore === 'number') {
          rubricDetail = {
            technicalScore: aiTurn.technicalScore,
            starStructureScore: aiTurn.starStructureScore,
            fluencyScore: aiTurn.fluencyScore,
            speechMetrics: aiTurn.speechMetrics,
          };
          turnEval = {
            ...localEval,
            score: Math.round(aiTurn.overallScore),
            feedback: `${localEval.feedback} [Rubric AI: Chuyên môn ${aiTurn.technicalScore}/100 · STAR ${aiTurn.starStructureScore}/100 · Lưu loát ${aiTurn.fluencyScore}/100 (${aiTurn.speechMetrics.wordsPerMinute} từ/phút)]`,
          };
        }
      } catch {
        // AI Service tạm ngắt -> giữ nguyên kết quả chấm cục bộ `localEval`
      }

      const nextQ = questionBank[currentTurnIdx + 1] || null;
      const isCompleted = currentTurnIdx + 1 >= questionBank.length || !nextQ;

      const updatedLog = [
        ...currentLog,
        {
          speaker: 'STUDENT',
          speakerLabel: profile?.fullName || 'Ứng viên',
          stageTag: `Trả lời câu ${currentTurnIdx + 1}/${questionBank.length}`,
          questionPrompt: currentQuestionText,
          text: answerTranscript,
          score: turnEval.score,
          feedback: turnEval.feedback,
          durationSec: durationSec ?? 45,
          createdAt: new Date().toISOString(),
        },
        ...(nextQ
          ? [
              {
                speaker: 'SENIOR_AI',
                speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
                stageTag: nextQ.stageTag,
                text: nextQ.text,
                createdAt: new Date().toISOString(),
              },
            ]
          : []),
      ];

      await db
        .update(mockInterviews)
        .set({ transcriptLog: updatedLog })
        .where(eq(mockInterviews.id, interviewId));

      res.json({
        interviewId: String(interviewId),
        recordedTranscript: answerTranscript,
        acknowledged: true,
        turnCount: currentTurnIdx + 1,
        turnIndex: currentTurnIdx + 1,
        turnScore: turnEval.score,
        turnEvaluation: turnEval.feedback,
        evaluationNote: turnEval.feedback,
        betterAnswerTip: turnEval.hasMetrics
          ? 'Bạn đã dẫn chứng số liệu rất tốt; hãy tiếp tục liên hệ trực tiếp với kinh nghiệm vận hành của mình ở câu tiếp theo.'
          : 'Hãy nêu thêm thông số cụ thể (ví dụ độ trễ ms, số lượng bản ghi hoặc cấu hình thực tế) để tăng sức thuyết phục.',
        nextStageTag: nextQ?.stageTag ?? null,
        nextQuestionText: nextQ?.text ?? null,
        isCompleted,
        ...(rubricDetail ? { aiRubric: rubricDetail } : {}),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Route `POST /api/v1/interviews/:interviewId/complete` — Chốt báo cáo đánh giá tổng thể và **trừ đúng 1 lượt phỏng vấn AI** trong Transaction ACID.
 *
 * - **Quy trình từng bước:**
 *   + Bước 1: Kiểm tra chủ sở hữu & tính **Idempotency** (nếu phiên đã `COMPLETED`, trả lại báo cáo cũ với `creditDeducted: 0`).
 *   + Bước 2: Chấm lại toàn bộ lượt trả lời của ứng viên (`overallScore`, `projectDepthScore`, `technicalAccuracy`, `communicationScore`).
 *   + Bước 3: Gọi `generateGeminiText()` (`ragAi.service.ts`) sinh 2 câu nhận xét khách quan (fallback sang mảng `strengths`/`improvements` cục bộ).
 *   + Bước 4: Mở **Transaction ACID**: giảm `interview_credits = GREATEST(0, interview_credits - 1)` và cập nhật `mock_interviews.status = 'COMPLETED'`.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.completeInterview()`. Ghi DB: `user_profiles`, `mock_interviews`.
 */
// 5.6 POST /interviews/:interviewId/complete (Deducts 1 credit ONLY once upon completion!)
profileRouter.post('/interviews/:interviewId/complete', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const interviewId = Number(req.params.interviewId);

    const [existingInterview] = await db
      .select()
      .from(mockInterviews)
      .where(eq(mockInterviews.id, interviewId))
      .limit(1);

    if (!existingInterview) {
      res.status(404).json({
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Không tìm thấy phiên phỏng vấn',
      });
      return;
    }

    if (Number(existingInterview.accountId) !== Number(accountId)) {
      res.status(403).json({
        code: 'FORBIDDEN_INTERVIEW_OWNER',
        message: 'Bạn không có quyền hoàn tất phiên phỏng vấn của người khác',
      });
      return;
    }

    // Idempotency: if already COMPLETED, return existing report without deducting another credit!
    if (existingInterview.status === 'COMPLETED' && existingInterview.evaluationReport) {
      const [prof] = await db
        .select({ interviewCredits: userProfiles.interviewCredits })
        .from(userProfiles)
        .where(eq(userProfiles.accountId, accountId))
        .limit(1);
      res.json({
        interviewId: String(interviewId),
        status: 'COMPLETED',
        creditDeducted: 0,
        remainingCredits: prof?.interviewCredits ?? 0,
        completedAt: existingInterview.completedAt?.toISOString() || new Date().toISOString(),
        evaluationReport: existingInterview.evaluationReport,
      });
      return;
    }

    const turns = Array.isArray(existingInterview.transcriptLog)
      ? (existingInterview.transcriptLog as Array<Record<string, unknown>>)
      : [];
    const studentTurns = turns.filter((t) => t.speaker === 'STUDENT');

    const turnReviews = studentTurns.map((t, idx) => {
      const qPrompt = String(t.questionPrompt || `Câu hỏi chuyên môn ${idx + 1}`);
      const ansText = String(t.text || '');
      const evalRes = evaluateCandidateAnswerQuality(
        ansText,
        existingInterview.jdRawText,
        qPrompt
      );
      const score = typeof t.score === 'number' ? t.score : evalRes.score;
      const feedback = typeof t.feedback === 'string' ? t.feedback : evalRes.feedback;
      return {
        turnNumber: idx + 1,
        question: qPrompt,
        candidateAnswer: ansText,
        score,
        feedback,
      };
    });

    const avgTurnScore =
      turnReviews.length > 0
        ? Math.round(
            turnReviews.reduce((acc, r) => acc + r.score, 0) / turnReviews.length
          )
        : 45;

    const completionFactor = Math.min(1, turnReviews.length / 3);
    const overallScore = Math.max(
      35,
      Math.min(96, Math.round(avgTurnScore * (0.75 + 0.25 * completionFactor)))
    );
    const technicalAccuracy = avgTurnScore;
    const projectDepthScore = turnReviews[0]?.score ?? overallScore;
    const communicationScore = Math.min(
      96,
      Math.max(40, overallScore + (turnReviews.length >= 3 ? 2 : -5))
    );

    let aiSummaryFeedback = '';
    try {
      const geminiSummary = await generateGeminiText({
        systemInstruction:
          'Bạn là Chuyên gia Tuyển dụng Kỹ thuật. Viết 2 câu nhận xét ngắn gọn, khách quan bằng tiếng Việt dựa trên câu trả lời thực tế của ứng viên.',
        prompt:
          `Vị trí: ${existingInterview.targetRole} (${existingInterview.targetLevel})\n` +
          turnReviews
            .map((r) => `Câu ${r.turnNumber}: ${r.question}\nTrả lời: ${r.candidateAnswer}`)
            .join('\n\n'),
        temperature: 0.2,
        timeoutMs: 4000,
      });
      if (geminiSummary) aiSummaryFeedback = geminiSummary;
    } catch {
      // Fallback to deterministic strengths & improvements
    }

    const evaluationReport = {
      overallScore,
      projectDepthScore,
      communicationScore,
      technicalAccuracy,
      verdict:
        overallScore >= 80
          ? 'STRONG_FIT'
          : overallScore >= 65
            ? 'POTENTIAL_FIT'
            : 'NEEDS_PRACTICE',
      summaryFeedback: aiSummaryFeedback || undefined,
      turnReviews,
      strengths:
        overallScore >= 75
          ? [
              `Hoàn thành ${turnReviews.length} lượt phỏng vấn chuyên môn sát với vị trí ${existingInterview.targetRole}.`,
              'Nắm được luồng thiết kế hệ thống và các từ khóa kỹ thuật trọng tâm của JD.',
            ]
          : [
              `Đã tham gia trả lời ${turnReviews.length} câu hỏi phỏng vấn cho vị trí ${existingInterview.targetRole}.`,
            ],
      improvements:
        overallScore >= 85
          ? ['Tiếp tục bổ sung thêm các tình huống xử lý sự cố quy mô lớn và tối ưu chi phí vận hành.']
          : [
              'Trình bày câu trả lời theo cấu trúc STAR (Bối cảnh -> Giải pháp kỹ thuật -> Chỉ số đo lường cụ thể).',
              'Ôn tập kỹ hơn các học phần chuyên sâu liên quan trực tiếp tới từ khóa còn thiếu trong JD.',
            ],
    };

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [updatedProfile] = await tx
        .update(userProfiles)
        .set({
          interviewCredits: sql`GREATEST(0, ${userProfiles.interviewCredits} - 1)`,
          updatedAt: now,
        })
        .where(eq(userProfiles.accountId, accountId))
        .returning();

      const [updatedInterview] = await tx
        .update(mockInterviews)
        .set({
          status: 'COMPLETED',
          evaluationReport,
          completedAt: now,
        })
        .where(eq(mockInterviews.id, interviewId))
        .returning();

      return {
        remainingCredits: updatedProfile?.interviewCredits ?? 0,
        interview: updatedInterview,
      };
    });

    res.json({
      interviewId: String(interviewId),
      status: 'COMPLETED',
      creditDeducted: 1,
      remainingCredits: result.remainingCredits,
      completedAt: now.toISOString(),
      evaluationReport,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `DELETE /api/v1/interviews/:interviewId` — Hủy bỏ phiên phỏng vấn nháp/chưa hoàn tất mà KHÔNG trừ `interview_credits`.
 * - **Liên kết luồng:** Frontend gọi từ `profileInterviewApi.cancelDraftInterview()`. Xóa bản ghi trong `mock_interviews` (sau khi kiểm tra chủ sở hữu).
 */
// 5.7 DELETE /interviews/:interviewId (Abort incomplete interview without deducting credits)
profileRouter.delete('/interviews/:interviewId', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const interviewId = Number(req.params.interviewId);

    const [interview] = await db
      .select()
      .from(mockInterviews)
      .where(eq(mockInterviews.id, interviewId))
      .limit(1);

    if (!interview) {
      res.status(404).json({ code: 'INTERVIEW_NOT_FOUND', message: 'Không tìm thấy phiên phỏng vấn' });
      return;
    }

    if (Number(interview.accountId) !== Number(accountId)) {
      res.status(403).json({
        code: 'FORBIDDEN_INTERVIEW_OWNER',
        message: 'Bạn không có quyền xóa phiên phỏng vấn của người khác',
      });
      return;
    }

    await db.delete(mockInterviews).where(eq(mockInterviews.id, interviewId));

    res.json({
      interviewId: String(interviewId),
      deleted: true,
      creditDeducted: 0,
      message: 'Đã hủy phiên phỏng vấn chưa hoàn tất (không trừ lượt phỏng vấn)',
    });
  } catch (err) {
    next(err);
  }
});
