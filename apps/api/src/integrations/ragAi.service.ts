import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  classSessions,
  cohorts,
  courses,
  courseSkills,
  enrollments,
  knowledgeChunks,
  skills,
} from '../db/schema/index.js';
import { computeSemanticEmbedding1024 } from '../db/seedHelpers.js';
import { formatScheduleLabels } from '../db/helpers.js';
import { logger } from '../config/logger.js';

function formatSecondsToMmSs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export async function generateGeminiText(params: {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your-gemini-api-key' || apiKey.startsWith('placeholder')) {
    return null;
  }

  const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.2,
      },
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 8000),
  });

  if (!res.ok) {
    throw new Error(`Gemini REST API returned HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? '';
  return text.length > 0 ? text : null;
}

export function cosineSimilarity1024(vecA: number[], vecB: number[] | null | undefined): number {
  if (!vecB || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function lexicalOverlapScore(query: string, content: string): number {
  const norm = (str: string) =>
    str
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);

  const qTokens = norm(query);
  if (qTokens.length === 0) return 0;
  const cSet = new Set(norm(content));
  let hits = 0;
  for (const qt of qTokens) {
    if (cSet.has(qt)) hits++;
  }
  return hits / qTokens.length;
}

/**
 * Hybrid Dense + Lexical ranking using Reciprocal Rank Fusion (RRF, k = 60).
 */
function rankChunksHybridRrf<
  T extends { id: number; content: string; embedding: number[] | null; sessionId?: number | null }
>(query: string, chunks: T[], currentSessionId?: number): T[] {
  if (chunks.length === 0) return [];
  const queryVec = computeSemanticEmbedding1024(query, 1024);

  const denseSorted = [...chunks]
    .map((c) => ({ chunk: c, sim: cosineSimilarity1024(queryVec, c.embedding) }))
    .sort((a, b) => b.sim - a.sim);

  const lexSorted = [...chunks]
    .map((c) => ({ chunk: c, lex: lexicalOverlapScore(query, c.content) }))
    .sort((a, b) => b.lex - a.lex);

  const denseRankMap = new Map(denseSorted.map((item, idx) => [item.chunk.id, idx + 1]));
  const lexRankMap = new Map(lexSorted.map((item, idx) => [item.chunk.id, idx + 1]));

  const RRF_K = 60;
  return [...chunks]
    .map((chunk) => {
      const rDense = denseRankMap.get(chunk.id) ?? chunks.length;
      const rLex = lexRankMap.get(chunk.id) ?? chunks.length;
      const sessionBoost =
        currentSessionId && chunk.sessionId === currentSessionId ? 0.004 : 0;
      const rrfScore = 1 / (RRF_K + rDense) + 1 / (RRF_K + rLex) + sessionBoost;
      return { chunk, rrfScore };
    })
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((item) => item.chunk);
}

const UNRELATED_SYSTEM_PATTERNS: RegExp[] = [
  /\bkế toán\b/i,
  /\bke toan\b/i,
  /\bkiểm toán\b/i,
  /\bthuế thu nhập\b/i,
  /\bhóa đơn đỏ\b/i,
  /\bthương mại điện tử\b/i,
  /\bthuong mai dien tu\b/i,
  /\bbán hàng shopee\b/i,
  /\bshopee\b/i,
  /\blazada\b/i,
  /\btiktok shop\b/i,
  /\bnấu ăn\b/i,
  /\bnau an\b/i,
  /\bcông thức món\b/i,
  /\bthời tiết\b/i,
  /\bthoi tiet\b/i,
  /\bbóng đá\b/i,
  /\bbong da\b/i,
  /\bngoại hạng anh\b/i,
  /\bchứng khoán\b/i,
  /\bchung khoan\b/i,
  /\bcổ phiếu\b/i,
  /\bforex\b/i,
  /\bbất động sản\b/i,
  /\by tế\b/i,
  /\bkhám bệnh\b/i,
  /\buống thuốc\b/i,
  /\btử vi\b/i,
  /\bphong thủy\b/i,
  /\bchính trị\b/i,
  /\bluật hình sự\b/i,
  /\bxổ số\b/i,
  /\bdu lịch\b/i,
];

const DEEP_LECTURE_KNOWLEDGE_PATTERNS: RegExp[] = [
  /\bcông thức\b/i,
  /\bcong thuc\b/i,
  /\bviết code\b/i,
  /\bviet code\b/i,
  /\bcode mẫu\b/i,
  /\bđoạn code\b/i,
  /\bsửa lỗi code\b/i,
  /\bthuật toán chi tiết\b/i,
  /\bgiải thích chi tiết\b/i,
  /\bgiai thich chi tiet\b/i,
  /\bcách cài đặt\b/i,
  /\bcách cấu hình\b/i,
  /\bexplain analyze\b/i,
  /\bhnsw\b/i,
  /\brrf\b/i,
  /\breciprocal rank fusion\b/i,
  /\bcross-encoder\b/i,
  /\bragas\b/i,
  /\bpessimistic lock\b/i,
  /\boptimistic lock\b/i,
  /\boutbox pattern\b/i,
  /\bsaga pattern\b/i,
  /\bredlock\b/i,
  /\bwindow function\b/i,
  /\brecursive cte\b/i,
  /\bnội dung bài giảng buổi\b/i,
];

export type AdvisorIntent =
  | 'OUT_OF_SYSTEM'
  | 'PAID_LECTURE_DEEP_DIVE'
  | 'VALID_ADVISOR_QUERY';

export function classifyAdvisorIntent(question: string): AdvisorIntent {
  const trimmed = question.trim();
  if (UNRELATED_SYSTEM_PATTERNS.some((rx) => rx.test(trimmed))) {
    return 'OUT_OF_SYSTEM';
  }
  if (DEEP_LECTURE_KNOWLEDGE_PATTERNS.some((rx) => rx.test(trimmed))) {
    return 'PAID_LECTURE_DEEP_DIVE';
  }
  return 'VALID_ADVISOR_QUERY';
}

export const CANONICAL_COURSE_SLUGS = {
  AI: 'ky-su-ai-thuc-chien-rag-agents-llmops',
  SWE: 'kien-truc-backend-chuyen-sau-typescript-postgresql-distributed-systems',
  DATA: 'ky-su-du-lieu-hien-dai-streaming-kafka-pyspark-lakehouse',
  PYTHON: 'lap-trinh-python-sql-thuc-chien-cho-ky-su-du-lieu-ai',
} as const;

export function normalizeCourseSlugAlias(slug: string): string {
  const clean = (slug || '').trim().toLowerCase();
  if (clean.startsWith('ky-su-ai-thuc-chien')) return CANONICAL_COURSE_SLUGS.AI;
  if (clean.startsWith('kien-truc-backend-chuyen-sau')) return CANONICAL_COURSE_SLUGS.SWE;
  if (
    clean.startsWith('ky-su-du-lieu-hien-dai') ||
    clean.startsWith('ky-thuat-du-lieu-streaming')
  ) {
    return CANONICAL_COURSE_SLUGS.DATA;
  }
  if (clean.startsWith('lap-trinh-python-sql-thuc-chien')) return CANONICAL_COURSE_SLUGS.PYTHON;
  return clean;
}

const COURSE_EXCLUSIVE_KEYWORDS: Record<string, { label: string; patterns: RegExp[] }> = {
  [CANONICAL_COURSE_SLUGS.AI]: {
    label: 'Kỹ sư AI Thực chiến: RAG, Agents & LLMOps',
    patterns: [
      /\brag\b/i,
      /\bhybrid rag\b/i,
      /\bpgvector\b/i,
      /\bhnsw\b/i,
      /\brrf\b/i,
      /\breciprocal rank fusion\b/i,
      /\bfunction calling\b/i,
      /\bmulti-agent\b/i,
      /\blanggraph\b/i,
      /\bragas\b/i,
      /\bprompt injection\b/i,
      /\bllmops\b/i,
      /\bsemantic cache\b/i,
    ],
  },
  [CANONICAL_COURSE_SLUGS.SWE]: {
    label: 'Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems',
    patterns: [
      /\bnestjs\b/i,
      /\bdrizzle orm\b/i,
      /\boutbox pattern\b/i,
      /\bsaga pattern\b/i,
      /\bredlock\b/i,
      /\bbullmq\b/i,
      /\bdeadlock\b/i,
      /\bpessimistic lock\b/i,
      /\boptimistic lock\b/i,
      /\bmicroservices\b/i,
      /\bidempotent webhook\b/i,
    ],
  },
  [CANONICAL_COURSE_SLUGS.DATA]: {
    label: 'Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse',
    patterns: [
      /\bkafka\b/i,
      /\bapache spark\b/i,
      /\bpy-?spark\b/i,
      /\biceberg\b/i,
      /\blakehouse\b/i,
      /\bdbt\b/i,
      /\bairflow\b/i,
      /\bmedallion\b/i,
      /\bflink\b/i,
    ],
  },
  [CANONICAL_COURSE_SLUGS.PYTHON]: {
    label: 'Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI',
    patterns: [
      /\bwindow function\b/i,
      /\brecursive cte\b/i,
      /\bdense_rank\b/i,
      /\bpytest\b/i,
      /\bpandas\b/i,
      /\bpolars\b/i,
      /\basyncio\b/i,
    ],
  },
};

export type TutorIntent =
  | { type: 'OUT_OF_DOMAIN' }
  | { type: 'OTHER_COURSE_TOPIC'; otherCourseTitle: string }
  | { type: 'IN_COURSE_SCOPE' };

export function classifyCourseTutorIntent(
  question: string,
  currentCourseSlug: string
): TutorIntent {
  const trimmed = question.trim();
  if (UNRELATED_SYSTEM_PATTERNS.some((rx) => rx.test(trimmed))) {
    return { type: 'OUT_OF_DOMAIN' };
  }

  const normalizedSlug = normalizeCourseSlugAlias(currentCourseSlug);
  const currentEntry = COURSE_EXCLUSIVE_KEYWORDS[normalizedSlug];
  const matchesCurrent = currentEntry
    ? currentEntry.patterns.some((rx) => rx.test(trimmed))
    : false;

  if (!matchesCurrent) {
    for (const [slug, info] of Object.entries(COURSE_EXCLUSIVE_KEYWORDS)) {
      if (slug === normalizedSlug) continue;
      if (info.patterns.some((rx) => rx.test(trimmed))) {
        return {
          type: 'OTHER_COURSE_TOPIC',
          otherCourseTitle: info.label,
        };
      }
    }
  }

  return { type: 'IN_COURSE_SCOPE' };
}

export async function askCareerAdvisorRag(question: string) {
  const cleanQuestion = question.trim();
  const intent = classifyAdvisorIntent(cleanQuestion);

  const [allCourses, openCohorts, publicChunks] = await Promise.all([
    db.select().from(courses).where(eq(courses.status, 'PUBLISHED')).orderBy(asc(courses.id)),
    db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
    db.select().from(knowledgeChunks).where(eq(knowledgeChunks.visibility, 'PUBLIC')),
  ]);

  const activeCohorts = openCohorts.filter(
    (ch) => ch.status === 'OPENING' || ch.status === 'ONGOING'
  );
  const recommendedCohortCodes = activeCohorts.map((ch) => ch.code);

  const topChunks = rankChunksHybridRrf(cleanQuestion, publicChunks).slice(0, 3);

  // Match best recommended course via semantic + keyword similarity against courses
  const queryVec = computeSemanticEmbedding1024(cleanQuestion, 1024);
  const rankedCourses = [...allCourses]
    .map((c) => {
      const vecSim = cosineSimilarity1024(queryVec, c.embedding);
      const lexSim = lexicalOverlapScore(
        cleanQuestion,
        `${c.title} ${c.shortDescription} ${c.slug}`
      );
      return { course: c, score: vecSim * 0.65 + lexSim * 0.35 };
    })
    .sort((a, b) => b.score - a.score);

  const recommendedCourse = rankedCourses[0]?.course || allCourses[0];
  const recommendedCohort =
    activeCohorts.find((ch) => ch.courseId === recommendedCourse?.id && ch.status === 'OPENING') ||
    activeCohorts.find((ch) => ch.courseId === recommendedCourse?.id) ||
    activeCohorts[0] ||
    openCohorts[0];

  if (intent === 'OUT_OF_SYSTEM') {
    const replyText =
      'Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi hệ thống đào tạo của **3T Academy** nên mình không có thông tin để giải đáp cho bạn.\n\n' +
      'Mình phụ trách tư vấn lộ trình học tập, lịch khai giảng và thông tin 4 hướng đào tạo tại học viện (**Trí tuệ nhân tạo & AI**, **Lập trình Backend & Hệ thống**, **Kỹ thuật Dữ liệu**, và **Lập trình Nền tảng Python & SQL**). Bạn đang quan tâm hướng nào thì nhắn mình tư vấn nhé!';
    return {
      replyText,
      answerMd: replyText,
      recommendedCourseSlug: recommendedCourse?.slug || '',
      recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
      recommendedCohortCodes,
      citations: [],
    };
  }

  if (intent === 'PAID_LECTURE_DEEP_DIVE') {
    const courseSuggestion = recommendedCourse
      ? `Nếu bạn muốn học bài bản chủ đề này, bạn có thể tham khảo khóa **${recommendedCourse.title}** (Mã lớp: \`${recommendedCohort?.code || ''}\`, học phí: **${(recommendedCohort?.tuitionVnd || 10000).toLocaleString('vi-VN')} đ**).`
      : '';
    const replyText =
      'Mình chưa thể chia sẻ chi tiết nội dung bài giảng, công thức hay mã nguồn thực hành bên trong khóa học vì vai trò của mình là tư vấn chọn lộ trình phù hợp cho bạn.\n\n' +
      'Toàn bộ slide, bản ghi bài giảng và **Trợ giảng AI riêng của từng môn** sẽ mở ngay trong không gian lớp học sau khi bạn đăng ký đợt học.\n\n' +
      courseSuggestion;
    return {
      replyText,
      answerMd: replyText,
      recommendedCourseSlug: recommendedCourse?.slug || '',
      recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
      recommendedCohortCodes,
      citations: topChunks.slice(0, 2).map((c) => ({
        chunkId: c.id,
        sourceType: c.sourceType,
        snippet: c.content.slice(0, 140),
      })),
    };
  }

  const catalogSummary = allCourses
    .map((c) => {
      const ch =
        activeCohorts.find((item) => item.courseId === c.id && item.status === 'OPENING') ||
        activeCohorts.find((item) => item.courseId === c.id);
      const sched = ch ? formatScheduleLabels(ch.scheduleSlots || []).scheduleLabel : 'Linh hoạt';
      return `- **${c.title}** (Mã lớp: \`${ch?.code || 'Đang mở'}\`, Học phí: **${(ch?.tuitionVnd || 10000).toLocaleString('vi-VN')} đ**, Khai giảng: ${ch?.startDate || ''}, Lịch học: ${sched}): ${c.shortDescription}`;
    })
    .join('\n');

  const retrievedPublicContext = topChunks
    .map((c) => `[Nguồn ${c.sourceType} #${c.id}]: ${c.content}`)
    .join('\n\n');

  try {
    const geminiReply = await generateGeminiText({
      systemInstruction:
        'Bạn là Trợ lý Tư vấn Lộ trình học tập của 3T Academy.\n' +
        '1. Văn phong gần gũi, thân thiện (xưng "mình", gọi "bạn").\n' +
        '2. Chỉ trả lời dựa trên Danh mục khóa học và Tài liệu PUBLIC được cung cấp, không bịa thông tin.\n' +
        '3. Không giải thích sâu kiến thức bài giảng trả phí.',
      prompt:
        `=== DANH MỤC KHÓA HỌC ĐANG MỞ TẠI 3T ACADEMY ===\n${catalogSummary}\n\n` +
        `=== TÀI LIỆU TƯ VẤN CÔNG KHAI (PUBLIC RAG) ===\n${retrievedPublicContext}\n\n` +
        `=== CÂU HỎI CỦA HỌC VIÊN ===\n${cleanQuestion}`,
      temperature: 0.2,
    });

    if (geminiReply) {
      return {
        replyText: geminiReply,
        answerMd: geminiReply,
        recommendedCourseSlug: recommendedCourse?.slug || '',
        recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
        recommendedCohortCodes,
        citations: topChunks.map((c) => ({
          chunkId: c.id,
          sourceType: c.sourceType,
          snippet: c.content.slice(0, 140),
        })),
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Gemini Advisor call failed, falling back to deterministic RAG response');
  }

  const bestChunkContent = topChunks[0]?.content || '';
  const replyText =
    `Chào bạn nha! Mình rất vui được đồng hành tư vấn lộ trình học tập cho bạn tại **3T Academy**.\n\n` +
    (bestChunkContent ? `${bestChunkContent}\n\n` : '') +
    `Hiện tại học viện đang mở ghi danh các lộ trình đào tạo thực chiến:\n${catalogSummary}\n\n` +
    (recommendedCourse
      ? `Gợi ý phù hợp nhất cho nhu cầu của bạn lúc này là khóa **${recommendedCourse.title}** (\`${recommendedCohort?.code || ''}\`). Bạn có muốn xem chi tiết đề cương 6 buổi hoặc đăng ký ngay lớp này không?`
      : 'Bạn chia sẻ thêm mục tiêu công việc hiện tại để mình chọn lớp phù hợp nhất cho bạn nhé!');

  return {
    replyText,
    answerMd: replyText,
    recommendedCourseSlug: recommendedCourse?.slug || '',
    recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
    recommendedCohortCodes,
    citations: topChunks.map((c) => ({
      chunkId: c.id,
      sourceType: c.sourceType,
      snippet: c.content.slice(0, 140),
    })),
  };
}

export async function askCourseTutorRag(params: {
  accountId: number;
  userRole: string;
  cohortId: number;
  sessionId: number;
  question: string;
  currentVideoSec: number;
}) {
  const { accountId, userRole, cohortId, sessionId, question, currentVideoSec } = params;
  const cleanQuestion = question.trim();

  const [session] = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw Object.assign(new Error('Không tìm thấy buổi học'), {
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
    });
  }

  const resolvedCohortId = cohortId || session.cohortId;
  const [cohort] = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.id, resolvedCohortId))
    .limit(1);

  if (!cohort) {
    throw Object.assign(new Error('Không tìm thấy đợt học'), {
      statusCode: 404,
      code: 'COHORT_NOT_FOUND',
    });
  }

  if (userRole === 'INSTRUCTOR' && cohort.instructorId !== accountId) {
    throw Object.assign(new Error('Bạn không phụ trách giảng dạy đợt học này'), {
      statusCode: 403,
      code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR',
    });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, cohort.courseId))
    .limit(1);

  if (!course) {
    throw Object.assign(new Error('Không tìm thấy khóa học'), {
      statusCode: 404,
      code: 'COURSE_NOT_FOUND',
    });
  }

  if (userRole === 'STUDENT') {
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.accountId, accountId),
          eq(enrollments.cohortId, cohort.id),
          inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
        )
      )
      .limit(1);

    if (!enrollment) {
      throw Object.assign(
        new Error(
          `Bạn cần đăng ký và hoàn tất học phí khóa "${course.title}" để sử dụng Trợ giảng AI của khóa học này.`
        ),
        {
          statusCode: 403,
          code: 'FORBIDDEN_COURSE_NOT_PURCHASED',
        }
      );
    }
  }

  const currentCourseSkills = await db
    .select({
      code: skills.code,
      name: skills.name,
      role: courseSkills.skillRole,
    })
    .from(courseSkills)
    .innerJoin(skills, eq(courseSkills.skillId, skills.id))
    .where(eq(courseSkills.courseId, course.id));

  const allowedSkillNames = currentCourseSkills.map((s) => s.name);
  const allowedTopicsText =
    allowedSkillNames.length > 0 ? allowedSkillNames.join(', ') : course.title;

  const tutorIntent = classifyCourseTutorIntent(cleanQuestion, course.slug);

  if (tutorIntent.type === 'OUT_OF_DOMAIN') {
    return {
      answerMd:
        `Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi kiến thức của khóa **${course.title}**.\n\n` +
        `Trong không gian học tập này, mình chỉ hỗ trợ các chủ đề chuyên môn thuộc giáo trình của khóa học (**${allowedTopicsText}**). Bạn có chỗ nào chưa rõ trong buổi **${session.title}** thì hỏi mình nhé!`,
      detectedTopic: 'Ngoài phạm vi khóa học',
      citations: [],
    };
  }

  if (tutorIntent.type === 'OTHER_COURSE_TOPIC') {
    return {
      answerMd:
        `Chủ đề bạn hỏi thuộc phạm vi của khóa **${tutorIntent.otherCourseTitle}**, không nằm trong chương trình của khóa **${course.title}** mà bạn đang mở.\n\n` +
        `Mình là Trợ giảng AI chuyên trách riêng cho khóa **${course.title}** (**${allowedTopicsText}**). Bạn cần mình giải thích phần nào trong bài **${session.title}** thì nhắn mình nhé!`,
      detectedTopic: 'Khóa học khác (Đã chặn)',
      citations: [],
    };
  }

  const courseChunks = await db
    .select()
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.visibility, 'ENROLLED_ONLY'),
        eq(knowledgeChunks.courseId, course.id)
      )
    )
    .orderBy(asc(knowledgeChunks.chunkIndex));

  const topChunks = rankChunksHybridRrf(cleanQuestion, courseChunks, session.id).slice(0, 3);

  const citations = topChunks.map((ch, idx) => {
    const sec = ch.startSec ?? (idx + 1) * 180;
    return {
      label: `[${formatSecondsToMmSs(sec)}]`,
      jumpSec: sec,
      slideLabel: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Slide Trang ${idx * 3 + 6}`,
    };
  });

  const detectedTopic = allowedSkillNames[0] || course.title;

  const chunksContextText =
    topChunks.length > 0
      ? topChunks
          .map(
            (c) =>
              `[Mốc video ${formatSecondsToMmSs(c.startSec ?? 180)} | Slide Trang ${c.pageNumber ?? 6}]: ${c.content}`
          )
          .join('\n\n')
      : session.aiSummaryMd || session.descriptionMd || course.shortDescription;

  try {
    const geminiAnswer = await generateGeminiText({
      systemInstruction:
        `Bạn là Trợ giảng AI đồng hành riêng của khóa học "${course.title}".\n` +
        '1. Giải thích gần gũi, rõ ràng, bám sát học liệu trích xuất bên dưới.\n' +
        `2. Chỉ trả lời kiến thức thuộc khóa "${course.title}" (${allowedTopicsText}), không bịa đặt ngoài tài liệu.`,
      prompt:
        `=== KHÓA HỌC & BUỔI HỌC HIỆN TẠI ===\n` +
        `Khóa học: ${course.title} | Buổi ${session.sessionOrder}: ${session.title}\n\n` +
        `=== HỌC LIỆU TRÍCH XUẤT (HYBRID RRF) ===\n${chunksContextText}\n\n` +
        `=== CÂU HỎI HỌC VIÊN (Tại mốc ${formatSecondsToMmSs(currentVideoSec)}) ===\n${cleanQuestion}`,
      temperature: 0.2,
    });

    if (geminiAnswer) {
      return {
        answerMd: geminiAnswer,
        detectedTopic,
        citations,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Gemini Course Tutor call failed, using deterministic course-scoped RAG');
  }

  const primaryContent =
    topChunks.length > 0
      ? topChunks
          .slice(0, 2)
          .map(
            (c) =>
              `- Tại mốc **[${formatSecondsToMmSs(c.startSec ?? 180)}]** (${c.pageNumber ? `Slide Trang ${c.pageNumber}` : 'Slide bài giảng'}): ${c.content}`
          )
          .join('\n\n')
      : session.aiSummaryMd || session.descriptionMd || course.shortDescription;

  const answerMd =
    `Chào bạn! Dựa trên học liệu khóa **${course.title}** (Buổi ${session.sessionOrder}: *${session.title}*), mình giải thích chi tiết điểm bạn đang hỏi như sau:\n\n` +
    `${primaryContent}\n\n` +
    `Bạn có thể nhấn trực tiếp vào mốc thời gian đính kèm bên dưới để tua tới đúng đoạn giảng viên phân tích trên video nhé!`;

  return {
    answerMd,
    detectedTopic,
    citations,
  };
}
