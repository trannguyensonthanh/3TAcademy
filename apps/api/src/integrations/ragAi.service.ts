import { GoogleGenAI } from '@google/genai';
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

let geminiClientInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your-gemini-api-key') {
    return null;
  }
  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return geminiClientInstance;
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

const COURSE_EXCLUSIVE_KEYWORDS: Record<string, { label: string; patterns: RegExp[] }> = {
  'ky-su-ai-thuc-chien-rag-agents-llmops': {
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
  'kien-truc-backend-chuyen-sau-typescript-postgresql': {
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
    ],
  },
  'ky-thuat-du-lieu-streaming-pipeline-lakehouse': {
    label: 'Kỹ thuật Dữ liệu: Streaming Pipeline & Lakehouse',
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
  'lap-trinh-python-sql-thuc-chien': {
    label: 'Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI',
    patterns: [
      /\bwindow function\b/i,
      /\brecursive cte\b/i,
      /\bpytest\b/i,
      /\bpandas\b/i,
      /\bpolars\b/i,
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

  // Check if the question explicitly asks about another course's exclusive topic
  // and does NOT match any pattern of the current course
  const currentEntry = COURSE_EXCLUSIVE_KEYWORDS[currentCourseSlug];
  const matchesCurrent = currentEntry
    ? currentEntry.patterns.some((rx) => rx.test(trimmed))
    : false;

  if (!matchesCurrent) {
    for (const [slug, info] of Object.entries(COURSE_EXCLUSIVE_KEYWORDS)) {
      if (slug === currentCourseSlug) continue;
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
    // STRICT SQL ISOLATION: ONLY PUBLIC CHUNKS, NEVER ENROLLED_ONLY
    db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.visibility, 'PUBLIC')),
  ]);

  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const activeCohorts = openCohorts.filter(
    (ch) => ch.status === 'OPENING' || ch.status === 'ONGOING'
  );
  const recommendedCohortCodes = activeCohorts.map((ch) => ch.code);

  // Rank PUBLIC chunks by 1024-dim Embedding Vector Cosine Similarity + Lexical Overlap
  const queryVec = computeSemanticEmbedding1024(cleanQuestion, 1024);
  const scoredChunks = publicChunks
    .map((chunk) => {
      const vecSim = cosineSimilarity1024(queryVec, chunk.embedding);
      const lexSim = lexicalOverlapScore(cleanQuestion, chunk.content);
      return {
        chunk,
        score: vecSim * 0.7 + lexSim * 0.3,
      };
    })
    .sort((a, b) => b.score - a.score);

  const topChunks = scoredChunks.slice(0, 3).map((item) => item.chunk);

  // Match best recommended course based on top chunk courseId or query keywords
  const matchedCourseId =
    topChunks.find((c) => c.courseId !== null)?.courseId ||
    allCourses[0]?.id;
  const recommendedCourse =
    (matchedCourseId ? courseMap.get(matchedCourseId) : undefined) || allCourses[0];
  const recommendedCohort =
    activeCohorts.find((ch) => ch.courseId === recommendedCourse?.id) ||
    activeCohorts[0] ||
    openCohorts[0];

  // Guardrail 1: Out-of-system / unrelated questions
  if (intent === 'OUT_OF_SYSTEM') {
    const replyText =
      'Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi hệ thống đào tạo của **3T Academy** nên mình không biết thông tin để giải đáp cho bạn.\n\n' +
      'Mình chỉ phụ trách tư vấn lộ trình học tập, lịch khai giảng và thông tin các khóa học công nghệ tại học viện (gồm **Trí tuệ nhân tạo & AI**, **Lập trình Backend & Hệ thống**, **Kỹ thuật Dữ liệu**, và **Lập trình Nền tảng Python & SQL**). Nếu bạn đang muốn tìm hiểu lộ trình học lập trình nào thì cứ nhắn mình tư vấn nhé!';
    return {
      replyText,
      answerMd: replyText,
      recommendedCourseSlug: recommendedCourse?.slug || '',
      recommendedCohortId: recommendedCohort ? String(recommendedCohort.id) : '',
      recommendedCohortCodes,
      citations: [],
    };
  }

  // Guardrail 2: Asking for deep internal lecture knowledge inside paid courses
  if (intent === 'PAID_LECTURE_DEEP_DIVE') {
    const courseSuggestion = recommendedCourse
      ? `Nếu bạn muốn tìm hiểu bài bản về chủ đề này, bạn có thể tham khảo khóa **${recommendedCourse.title}** (Mã lớp: \`${recommendedCohort?.code || 'AI-ENG-2026-K01'}\`, học phí: **${(recommendedCohort?.tuitionVnd || 10000).toLocaleString('vi-VN')} đ**).`
      : '';
    const replyText =
      'Mình không biết chi tiết nội dung bài giảng, công thức hay cách viết code chuyên sâu bên trong các khóa học đâu bạn ơi, vì mục tiêu của mình chỉ là lắng nghe nhu cầu và tư vấn lộ trình học tập phù hợp cho bạn thôi.\n\n' +
      'Toàn bộ kiến thức chuyên môn, slide bài giảng, mã nguồn thực hành và **Trợ giảng AI riêng của từng môn** chỉ được mở bên trong không gian lớp học sau khi bạn đăng ký khóa học.\n\n' +
      courseSuggestion +
      '\n\nBạn có muốn mình chia sẻ thêm về lịch học và điều kiện đầu vào của lớp này không?';
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

  // Valid Advisor Query: Use Gemini with strict anti-hallucination prompt on PUBLIC context
  const catalogSummary = allCourses
    .map((c) => {
      const ch = activeCohorts.find((item) => item.courseId === c.id);
      const sched = ch ? formatScheduleLabels(ch.scheduleSlots || []).scheduleLabel : '';
      return `- **${c.title}** (Mã lớp: \`${ch?.code || ''}\`, Học phí: **${(ch?.tuitionVnd || 10000).toLocaleString('vi-VN')} đ**, Khai giảng: ${ch?.startDate || ''}, Lịch học: ${sched}): ${c.shortDescription}`;
    })
    .join('\n');

  const retrievedPublicContext = topChunks
    .map((c) => `[Nguồn ${c.sourceType} #${c.id}]: ${c.content}`)
    .join('\n\n');

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          `=== DANH MỤC KHÓA HỌC ĐANG MỞ TẠI 3T ACADEMY ===\n${catalogSummary}\n\n` +
          `=== TÀI LIỆU TƯ VẤN CÔNG KHAI (PUBLIC RAG) ===\n${retrievedPublicContext}\n\n` +
          `=== CÂU HỎI CỦA BẠN HỌC VIÊN ===\n${cleanQuestion}\n\n` +
          `Hãy tư vấn lộ trình phù hợp nhất một cách gần gũi, nhẹ nhàng.`,
        config: {
          systemInstruction:
            'Bạn là Trợ lý Tư vấn Lộ trình học tập của 3T Academy.\n' +
            'QUY TẮC BẮT BUỘC:\n' +
            '1. Văn phong gần gũi, nhẹ nhàng, ấm áp, tự nhiên như con người (xưng "mình", gọi "bạn").\n' +
            '2. KHÔNG ĐƯỢC ẢO GIÁC, KHÔNG NÓI BỪA: Chỉ trả lời dựa trên thông tin Danh mục khóa học và Tài liệu PUBLIC được cung cấp.\n' +
            '3. KHÔNG ĐƯỢC tiết lộ hay giải thích kiến thức chuyên sâu trong bài giảng có thu phí. Nếu câu hỏi hỏi sâu vào kiến thức bài học, hãy nói mình không biết vì mục tiêu của mình chỉ là tư vấn lộ trình học tập.\n' +
            '4. Nếu câu hỏi không liên quan đến hệ thống 3T Academy, hãy lịch sự nói mình không biết.',
          temperature: 0.2,
        },
      });

      if (response.text && response.text.trim().length > 0) {
        const answerMd = response.text.trim();
        return {
          replyText: answerMd,
          answerMd,
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
      logger.warn({ err }, 'Gemini Advisor call failed, using deterministic RAG response');
    }
  }

  // Deterministic, warm human response grounded in PUBLIC vector chunks
  const bestChunkContent = topChunks[0]?.content || '';
  const replyText =
    `Chào bạn nha! Mình rất vui được đồng hành tư vấn lộ trình học tập cho bạn tại **3T Academy**.\n\n` +
    (bestChunkContent ? `${bestChunkContent}\n\n` : '') +
    `Hiện tại học viện đang mở ghi danh 4 lộ trình đào tạo thực chiến:\n${catalogSummary}\n\n` +
    (recommendedCourse
      ? `👉 Gợi ý phù hợp nhất cho bạn lúc này là khóa **${recommendedCourse.title}** (\`${recommendedCohort?.code || ''}\`). Bạn có muốn mình hỗ trợ thông tin lịch học hoặc cách đăng ký lớp này không?`
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

  // 1. Load session, cohort, and course metadata
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

  // 2. PAID ENROLLMENT GATE: Students must have purchased / enrolled in this course
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
          `Bạn cần đăng ký và hoàn tất học phí khóa "${course.title}" để sử dụng Trợ giảng AI và truy cập kiến thức bài giảng của khóa học này.`
        ),
        {
          statusCode: 403,
          code: 'FORBIDDEN_COURSE_NOT_PURCHASED',
        }
      );
    }
  }

  // 3. Load ONLY this course's skills/topics
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

  // 4. TOPIC & CROSS-COURSE BOUNDARY CHECK
  const tutorIntent = classifyCourseTutorIntent(cleanQuestion, course.slug);

  if (tutorIntent.type === 'OUT_OF_DOMAIN') {
    return {
      answerMd:
        `Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi kiến thức của khóa **${course.title}** nên mình không biết thông tin để giải đáp cho bạn.\n\n` +
        `Trong không gian học tập này, mình chỉ được phép hỗ trợ các chủ đề chuyên môn thuộc giáo trình của khóa học (bao gồm: **${allowedTopicsText}**). Bạn có chỗ nào chưa rõ trong buổi học **${session.title}** thì cứ hỏi mình nhé!`,
      detectedTopic: 'Ngoài phạm vi khóa học',
      citations: [],
    };
  }

  if (tutorIntent.type === 'OTHER_COURSE_TOPIC') {
    return {
      answerMd:
        `Mình xin phép không trả lời câu hỏi này nha bạn ơi, vì chủ đề bạn hỏi thuộc phạm vi của khóa **${tutorIntent.otherCourseTitle}**, không nằm trong chương trình của khóa **${course.title}** mà bạn đang theo học.\n\n` +
        `Mình là Trợ giảng AI chuyên trách riêng cho khóa **${course.title}**, nên mình chỉ nắm vững và được phép khai thác các kiến thức trong khóa học này thôi (gồm: **${allowedTopicsText}**). Bạn cần mình giải thích phần nào trong bài **${session.title}** thì nhắn mình nhé!`,
      detectedTopic: 'Khóa học khác (Đã chặn)',
      citations: [],
    };
  }

  // 5. STRICT COURSE-SCOPED VECTOR RETRIEVAL:
  // Query ONLY `ENROLLED_ONLY` chunks belonging to `course.id` (NEVER other courses)
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

  const queryVec = computeSemanticEmbedding1024(cleanQuestion, 1024);
  const rankedChunks = courseChunks
    .map((chunk) => {
      const vecSim = cosineSimilarity1024(queryVec, chunk.embedding);
      const lexSim = lexicalOverlapScore(cleanQuestion, chunk.content);
      const sessionBoost = chunk.sessionId === session.id ? 0.15 : 0;
      return {
        chunk,
        score: vecSim * 0.65 + lexSim * 0.35 + sessionBoost,
      };
    })
    .sort((a, b) => b.score - a.score);

  const topChunks = rankedChunks.slice(0, 3).map((r) => r.chunk);

  const citations = topChunks.map((ch, idx) => {
    const sec = ch.startSec ?? (idx + 1) * 15;
    return {
      label: `[${formatSecondsToMmSs(sec)}]`,
      jumpSec: sec,
      slideLabel: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Slide Trang ${idx * 4 + 8}`,
    };
  });

  const detectedTopic = allowedSkillNames[0] || course.title;

  const chunksContextText =
    topChunks.length > 0
      ? topChunks
          .map(
            (c) =>
              `[Mốc video ${formatSecondsToMmSs(c.startSec ?? 15)} | Slide Trang ${c.pageNumber ?? 8}]: ${c.content}`
          )
          .join('\n\n')
      : session.aiSummaryMd || session.descriptionMd || course.shortDescription;

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          `=== KHÓA HỌC HIỆN TẠI (CÔ LẬP NGHIÊM NGẶT) ===\n` +
          `Tên khóa học: ${course.title}\n` +
          `Buổi học hiện tại: Buổi ${session.sessionOrder} - ${session.title}\n` +
          `Các chủ đề/kỹ năng được phép giải đáp trong khóa học này: ${allowedTopicsText}\n\n` +
          `=== HỌC LIỆU TRÍCH XUẤT TỪ VECTOR EMBEDDING CỦA RIÊNG KHÓA HỌC NÀY ===\n` +
          `${chunksContextText}\n\n` +
          `=== CÂU HỎI CỦA HỌC VIÊN (Tại mốc video ${formatSecondsToMmSs(currentVideoSec)}) ===\n` +
          `${cleanQuestion}\n\n` +
          `Hãy giải đáp tận tình, dễ hiểu, gần gũi và trích dẫn mốc thời gian bài giảng nếu có.`,
        config: {
          systemInstruction:
            `Bạn là Trợ giảng AI đồng hành riêng của khóa học "${course.title}".\n` +
            'QUY TẮC BẮT BUỘC:\n' +
            '1. Văn phong gần gũi, nhẹ nhàng, thân thiện như một người bạn học cùng lớp (xưng "mình", gọi "bạn").\n' +
            `2. CÔ LẬP KIẾN THỨC KHÓA HỌC: Bạn CHỈ được phép trả lời các chủ đề thuộc khóa học "${course.title}" (${allowedTopicsText}). Tuyệt đối KHÔNG trả lời kiến thức của khóa học khác hoặc các lĩnh vực ngoài lề (như kế toán, thương mại điện tử, nấu ăn...).\n` +
            '3. KHÔNG ĐƯỢC ẢO GIÁC, KHÔNG NÓI BỪA: Chỉ dựa vào Học liệu của khóa học được cung cấp bên dưới. Nếu câu hỏi không có trong nội dung khóa học này, hãy nhẹ nhàng nói rằng mình không biết vì nội dung đó nằm ngoài phạm vi bài học.',
          temperature: 0.2,
        },
      });

      if (response.text && response.text.trim().length > 0) {
        return {
          answerMd: response.text.trim(),
          detectedTopic,
          citations,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Gemini Course Tutor call failed, using deterministic course-scoped RAG');
    }
  }

  // Deterministic course-scoped RAG answer
  const primaryContent =
    topChunks.length > 0
      ? topChunks
          .slice(0, 2)
          .map(
            (c) =>
              `- Tại mốc **[${formatSecondsToMmSs(c.startSec ?? 15)}]** (${c.pageNumber ? `Slide Trang ${c.pageNumber}` : 'Slide bài giảng'}): ${c.content}`
          )
          .join('\n\n')
      : session.aiSummaryMd || session.descriptionMd || course.shortDescription;

  const answerMd =
    `Chào bạn nha! Dựa trên học liệu của khóa **${course.title}** (Buổi ${session.sessionOrder}: *${session.title}*), mình giải thích chi tiết điểm bạn đang thắc mắc như sau nhé:\n\n` +
    `${primaryContent}\n\n` +
    `Bạn có thể bấm vào mốc thời gian đính kèm bên dưới để xem lại đúng đoạn giảng viên giải thích trên video nha!`;

  return {
    answerMd,
    detectedTopic,
    citations,
  };
}
