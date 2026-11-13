import { Router } from 'express';
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
} from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { normalizeMasteryScore } from '../../db/helpers.js';

export const profileRouter = Router();

function normalizeCvData(
  rawCv: Record<string, unknown>,
  profile?: {
    fullName?: string;
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
      issuer: String(obj.issuer || ''),
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
    fullName: String(rawCv.fullName || profile?.fullName || ''),
    candidateName: String(rawCv.candidateName || rawCv.fullName || profile?.fullName || ''),
    headline: String(rawCv.headline || profile?.bio || ''),
    targetRole: String(rawCv.targetRole || rawCv.headline || profile?.bio || ''),
    summaryBio: String(rawCv.summaryBio || rawCv.careerObjective || profile?.careerGoal || ''),
    email: String(rawCv.email || email || ''),
    phone: String(rawCv.phone || ''),
    location: String(rawCv.location || ''),
    avatarUrl: String(rawCv.avatarUrl || profile?.avatarUrl || ''),
    githubUrl: String(rawCv.githubUrl || ''),
    linkedinUrl: String(rawCv.linkedinUrl || ''),
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

// 5.1 GET /me/profile-skills
profileRouter.get('/me/profile-skills', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;

    const [[profile], [account], skillStates, interviews, myEnrollments, allCohorts, allCourses] =
      await Promise.all([
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
      ]);

    const rawCv = (profile?.cvParsedData ?? {}) as Record<string, unknown>;
    const cvParsedData = normalizeCvData(rawCv, profile, account?.email);

    const primaryEnrollment = myEnrollments[0];
    const primaryCohort = primaryEnrollment
      ? allCohorts.find((c) => c.id === primaryEnrollment.cohortId)
      : allCohorts[0];
    const primaryCourse = primaryCohort
      ? allCourses.find((c) => c.id === primaryCohort.courseId)
      : allCourses[0];

    const userProfileDto = {
      userId: String(accountId),
      id: String(accountId),
      fullName: profile?.fullName || cvParsedData.fullName,
      avatarUrl: profile?.avatarUrl || cvParsedData.avatarUrl || undefined,
      headline: cvParsedData.headline,
      bio: profile?.bio || cvParsedData.headline,
      email: account?.email || req.user!.email,
      phone: cvParsedData.phone,
      githubUrl: cvParsedData.githubUrl,
      linkedinUrl: cvParsedData.linkedinUrl,
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
          trend: s.trend > 0 ? `+${Math.round(s.trend * 100)}%` : 'Ổn định',
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
});

// 5.1B PUT /me/profile
const updateProfileSchema = z.object({
  fullName: z.string().min(2),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  careerGoal: z.string().optional(),
});

profileRouter.put(
  '/me/profile',
  requireAuth,
  validate(updateProfileSchema),
  async (req, res, next) => {
    try {
      const accountId = req.user!.id;
      const { fullName, avatarUrl, phone, bio, careerGoal } = req.body;

      const [[existingProfile], [account]] = await Promise.all([
        db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
        db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
      ]);

      const currentCv = normalizeCvData(
        (existingProfile?.cvParsedData ?? {}) as Record<string, unknown>,
        existingProfile,
        account?.email
      );

      const updatedCv = {
        ...currentCv,
        fullName: fullName || currentCv.fullName,
        avatarUrl: avatarUrl ?? existingProfile?.avatarUrl ?? currentCv.avatarUrl,
        phone: phone ?? currentCv.phone,
        headline: bio ?? existingProfile?.bio ?? currentCv.headline,
        careerObjective: careerGoal ?? existingProfile?.careerGoal ?? currentCv.careerObjective,
      };

      const [updated] = await db
        .update(userProfiles)
        .set({
          fullName,
          avatarUrl: avatarUrl ?? existingProfile?.avatarUrl,
          bio: bio ?? existingProfile?.bio,
          careerGoal: careerGoal ?? existingProfile?.careerGoal,
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
        fullName: updated?.fullName || fullName,
        avatarUrl: updated?.avatarUrl || updatedCv.avatarUrl,
        headline: updated?.bio || updatedCv.headline,
        phone: updatedCv.phone,
        githubUrl: updatedCv.githubUrl,
        linkedinUrl: updatedCv.linkedinUrl,
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

// 5.2 POST /me/cv/upload & POST /me/cv
async function handleUploadCv(req: any, res: any, next: any) {
  try {
    const accountId = req.user!.id;
    const body = req.body || {};
    const fileName = String(body.fileName || 'CV_Ung_Vien.pdf');
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';
    const mode = body.mode as 'PARSE_PDF' | 'SAVE_RESUME' | undefined;
    const resumeData = body.resumeData as Record<string, unknown> | undefined;

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
      let aiExtractedSkills: string[] = [];
      try {
        const parsed = await aiServiceClient.parseCvPdf(rawText || fileName);
        if (Array.isArray(parsed.skills)) aiExtractedSkills = parsed.skills;
      } catch {
        // AI service unavailable; preserve current skills
      }

      const nowIso = new Date().toISOString();
      const extractedCvData = normalizeCvData(
        {
          ...currentCv,
          fileName,
          updatedAt: nowIso,
          extractedAt: nowIso,
          skills: Array.from(new Set([...currentCv.skills, ...aiExtractedSkills])),
        },
        existingProfile,
        account?.email
      );

      res.json({
        fileName,
        mode: 'PARSE_PDF',
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
        fileName,
        updatedAt: nowIso,
      },
      existingProfile,
      account?.email
    );

    await db
      .update(userProfiles)
      .set({
        fullName: mergedCv.fullName || existingProfile?.fullName || '',
        bio: mergedCv.headline || existingProfile?.bio,
        careerGoal: mergedCv.careerObjective || existingProfile?.careerGoal,
        cvParsedData: mergedCv,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.accountId, accountId));

    res.json({
      fileName,
      mode: 'SAVE_RESUME',
      updatedAt: nowIso,
      cvParsedData: mergedCv,
    });
  } catch (err) {
    next(err);
  }
}

profileRouter.post('/me/cv/upload', requireAuth, handleUploadCv);
profileRouter.post('/me/cv', requireAuth, handleUploadCv);

// 5.3 POST /interviews/screen-cv (Free Stage 1 — does NOT deduct interview_credits)
const screenCvSchema = z.object({
  targetLevel: z.enum(['INTERN', 'FRESHER', 'JUNIOR', 'SENIOR']),
  targetRole: z.string().min(2),
  jdRawText: z.string().min(10),
});

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
        ? (rawCv.skills as string[]).map((s) => String(s).toLowerCase())
        : [];
      const learnedSkillNames = userSkillStates
        .map((ss) => skillMap.get(ss.skillId)?.name || '')
        .filter(Boolean);

      const jdLower = jdRawText.toLowerCase();
      const matchedSkills = [...cvSkills, ...learnedSkillNames.map((s) => s.toLowerCase())].filter(
        (sk) => sk && jdLower.includes(sk.split(' ')[0] || sk)
      );

      let matchPercent = Math.min(
        95,
        Math.max(45, 55 + matchedSkills.length * 6 + userSkillStates.length * 4)
      );
      let missingKeywordsOrGaps: string[] = [];

      try {
        const aiResult = await aiServiceClient.screenCv({
          cvData: rawCv,
          targetLevel,
          targetRole,
          jdRawText,
        });
        if (typeof aiResult.matchScore === 'number') {
          matchPercent = aiResult.matchScore;
        }
        if (Array.isArray(aiResult.missingSkills)) {
          missingKeywordsOrGaps = aiResult.missingSkills;
        }
      } catch {
        if (missingKeywordsOrGaps.length === 0) {
          missingKeywordsOrGaps = [
            'Bổ sung số liệu đo lường cụ thể (latency, throughput, độ chính xác) cho các dự án trong CV.',
          ];
        }
      }

      const passedGate = matchPercent >= 60;
      const cvScreeningResult = {
        matchPercent,
        passedGate,
        layoutAndPresentationFeedback:
          'Bố cục CV phân tách rõ ràng giữa Mục tiêu nghề nghiệp, Kỹ năng công nghệ và Dự án thực tế.',
        jdMatchEvaluation: `Hồ sơ hiện tại đạt độ khớp ${matchPercent}% so với yêu cầu tuyển dụng vị trí ${targetRole} (${targetLevel}).`,
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

// 5.4 POST /interviews/:interviewId/start
profileRouter.post('/interviews/:interviewId/start', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const interviewId = Number(req.params.interviewId);

    const [[profile], [interview]] = await Promise.all([
      db.select().from(userProfiles).where(eq(userProfiles.accountId, accountId)).limit(1),
      db.select().from(mockInterviews).where(eq(mockInterviews.id, interviewId)).limit(1),
    ]);

    if (!profile || profile.interviewCredits <= 0) {
      const message =
        'Bạn đã hết lượt phỏng vấn thử AI. Hãy hoàn thành khóa học và nhận chứng chỉ để được cộng thêm +4 lượt miễn phí!';
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

    const roleLabel = interview?.targetRole || 'AI Engineer';
    const firstQuestion = {
      speaker: 'SENIOR_AI',
      speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
      stageTag: 'Câu 1/3 · Xác thực dự án trong CV',
      text: `Chào bạn! Dựa trên hồ sơ ứng tuyển vị trí ${roleLabel}, bạn hãy trình bày kiến trúc kỹ thuật của dự án tâm đắc nhất trong CV và cách bạn giải quyết bài toán tối ưu hiệu năng thực tế?`,
    };

    const [updated] = await db
      .update(mockInterviews)
      .set({
        status: 'IN_PROGRESS',
        transcriptLog: [firstQuestion],
      })
      .where(eq(mockInterviews.id, interviewId))
      .returning();

    res.json({
      interviewId: String(updated?.id ?? interviewId),
      status: 'IN_PROGRESS',
      creditDeducted: 0,
      startedAt: new Date().toISOString(),
      turnIndex: 0,
      totalTurns: 3,
      stageTag: firstQuestion.stageTag,
      questionText: firstQuestion.text,
      interviewerName: 'Hội đồng Phỏng vấn Kỹ thuật AI',
      interviewerTitle: 'Chuyên gia Phỏng vấn Kỹ thuật — 3T Academy',
    });
  } catch (err) {
    next(err);
  }
});

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
      const interviewId = Number(req.params.interviewId);
      const { turnIndex: reqTurnIdx, questionPrompt, durationSec } = req.body;
      const answerTranscript = String(
        req.body.answerTranscript || req.body.transcript || ''
      ).trim();

      const [interview] = await db
        .select()
        .from(mockInterviews)
        .where(eq(mockInterviews.id, interviewId))
        .limit(1);

      if (!interview) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'INTERVIEW_NOT_FOUND',
          message: 'Không tìm thấy phiên phỏng vấn',
          error: {
            code: 'INTERVIEW_NOT_FOUND',
            message: 'Không tìm thấy phiên phỏng vấn',
          },
        });
        return;
      }

      const currentLog = Array.isArray(interview.transcriptLog) ? interview.transcriptLog : [];
      const currentTurnIdx = reqTurnIdx ?? Math.floor(currentLog.length / 2);

      const followUpQuestions = [
        {
          stageTag: 'Câu 2/3 · Xử lý tình huống kỹ thuật chuyên sâu',
          text: 'Khi hệ thống cần kết hợp tìm kiếm từ khóa và tìm kiếm vector ngữ nghĩa trên dữ liệu lớn, bạn thiết kế cơ chế xếp hạng và xử lý bất đồng bộ như thế nào để đảm bảo độ trễ thấp?',
        },
        {
          stageTag: 'Câu 3/3 · Bảo mật dữ liệu & Phân quyền doanh nghiệp',
          text: 'Câu hỏi cuối cùng: Nếu tài liệu nội bộ có phân quyền theo phòng ban, bạn đặt bộ lọc kiểm soát truy cập ở tầng cơ sở dữ liệu như thế nào trước khi đưa ngữ cảnh vào mô hình ngôn ngữ lớn?',
        },
      ];

      const nextQ = followUpQuestions[currentTurnIdx] || null;
      const isCompleted = currentTurnIdx >= 2 || !nextQ;

      const updatedLog = [
        ...currentLog,
        {
          speaker: 'STUDENT',
          speakerLabel: 'Ứng viên',
          stageTag: `Trả lời câu ${currentTurnIdx + 1}/3`,
          questionPrompt,
          text: answerTranscript,
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
        turnEvaluation:
          'Câu trả lời bám sát trọng tâm kỹ thuật và nêu được hướng giải quyết thực tế.',
        evaluationNote:
          'Câu trả lời bám sát trọng tâm kỹ thuật và nêu được hướng giải quyết thực tế.',
        betterAnswerTip:
          'Hãy bổ sung thêm số liệu đo lường cụ thể trong quá trình vận hành thực tế.',
        nextStageTag: nextQ?.stageTag ?? null,
        nextQuestionText: nextQ?.text ?? null,
        isCompleted,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 5.6 POST /interviews/:interviewId/complete (Deducts 1 credit upon full completion)
profileRouter.post('/interviews/:interviewId/complete', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const interviewId = Number(req.params.interviewId);

    const [existingInterview] = await db
      .select()
      .from(mockInterviews)
      .where(eq(mockInterviews.id, interviewId))
      .limit(1);

    const turns = Array.isArray(existingInterview?.transcriptLog)
      ? existingInterview.transcriptLog
      : [];
    const studentTurns = turns.filter(
      (t: Record<string, unknown>) => t.speaker === 'STUDENT'
    );

    const avgLen =
      studentTurns.length > 0
        ? studentTurns.reduce(
            (acc: number, t: Record<string, unknown>) => acc + String(t.text || '').length,
            0
          ) / studentTurns.length
        : 0;

    const baseScore = Math.min(95, Math.max(70, Math.round(72 + Math.min(20, avgLen / 12))));
    const evaluationReport = {
      overallScore: baseScore,
      projectDepthScore: Math.min(98, baseScore + 3),
      communicationScore: Math.max(68, baseScore - 2),
      technicalAccuracy: baseScore,
      strengths: [
        'Nắm vững kiến trúc kỹ thuật của dự án trong hồ sơ năng lực.',
        'Trình bày giải pháp rõ ràng, có tư duy xử lý bất đồng bộ và bảo mật dữ liệu.',
      ],
      improvements: [
        'Cần nêu chi tiết hơn các chỉ số giám sát hiệu năng hệ thống trong môi trường thực tế.',
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

// 5.7 DELETE /interviews/:interviewId (Abort incomplete interview without deducting credits)
profileRouter.delete('/interviews/:interviewId', requireAuth, async (req, res, next) => {
  try {
    const interviewId = Number(req.params.interviewId);
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
