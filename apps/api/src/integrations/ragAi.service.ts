/**
 * ============================================================================
 * TỆP: apps/api/src/integrations/ragAi.service.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Bộ máy RAG (Retrieval-Augmented Generation) nội bộ
 *     chạy trực tiếp trên Node.js + PostgreSQL (`knowledge_chunks`), đóng vai trò
 *     vừa là bộ xử lý chính cho Tư vấn lộ trình & Trợ giảng khóa học (kèm Guardrails
 *     chống lạc đề / chống lộ bài giảng trả phí), vừa là tuyến Fallback vững chắc
 *     khi dịch vụ Python `apps/ai-service/src/rag/` tạm ngắt hoặc vượt timeout.
 *
 * KỸ THUẬT CỐT LÕI:
 *   1. Semantic Embedding 1024 chiều (`computeSemanticEmbedding1024`) + Cosine Similarity.
 *   2. Lexical Overlap tiếng Việt (chuẩn hóa NFD bỏ dấu) kết hợp Dense Vector theo
 *      thuật toán Hybrid Search Reciprocal Rank Fusion (RRF, hằng số k = 60).
 *   3. Guardrail phân loại ý định (Intent Classifier) tách biệt rõ 2 chế độ:
 *      - Advisor công khai (`visibility = 'PUBLIC'`): chặn câu hỏi ngoài hệ thống & chặn hỏi sâu bài trả phí.
 *      - Course Tutor trong lớp (`visibility = 'ENROLLED_ONLY'`): kiểm tra quyền ghi danh + chặn hỏi chéo môn khác.
 *   4. Chuỗi Fallback đa model Gemini: `GEMINI_MODEL` (nếu có) -> `gemini-3.5-flash`
 *      -> `gemini-3.1-flash-lite` -> `gemini-3.8-flash` -> Deterministic RAG (ghép câu trả lời thuần từ chunk DB).
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ:
 *     + `apps/api/src/modules/catalog/catalog.routes.ts` (`POST /api/v1/advisor/ask` -> `askCareerAdvisorRag`)
 *     + `apps/api/src/modules/learning/learning.routes.ts` (`POST /api/v1/sessions/:sessionId/tutor/ask` -> `askCourseTutorRag`)
 *     + `apps/api/src/modules/profile/profile.routes.ts` & `teach/teach.routes.ts` (dùng `generateGeminiText`)
 *   - Đọc bảng DB: `courses`, `cohorts`, `class_sessions`, `enrollments`, `course_skills`, `skills`, `knowledge_chunks`.
 *   - Đồng bộ thiết kế RAG với `apps/ai-service/src/rag/` (retriever, hybrid RRF & prompt guardrail bên Python).
 * ============================================================================
 */
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

/**
 * Chuyển đổi số giây (ví dụ `185`) thành chuỗi định dạng phút:giây `MM:SS` (ví dụ `03:05`).
 *
 * - **Mục tiêu:** Hiển thị nhãn mốc thời gian trích dẫn video (`[03:05]`) để học viên bấm tua nhanh.
 * - **Đầu vào:** `sec` — số giây (có thể là số thực hoặc âm; sẽ được chuẩn hóa về `>= 0`).
 * - **Đầu ra:** Chuỗi `MM:SS` luôn đủ 2 chữ số cho phút và giây.
 */
function formatSecondsToMmSs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Gọi Google Gemini Generative Language API với cơ chế Fallback đa model tự động.
 *
 * - **Mục tiêu:** Sinh văn bản tự nhiên có kiểm soát từ `systemInstruction` và `prompt`,
 *   đảm bảo độ sẵn sàng cao khi một model bị quá tải (429/503) hoặc ngừng hỗ trợ (404).
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi nội bộ bởi `askCareerAdvisorRag()`, `askCourseTutorRag()` và các route cần sinh văn bản AI.
 *   + Gọi trực tiếp REST API `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
 * - **Chuỗi Fallback đa model:**
 *   `GEMINI_MODEL` (biến môi trường, bỏ qua `gemini-2.5-flash` cũ) -> `gemini-3.5-flash`
 *   -> `gemini-3.1-flash-lite` -> `gemini-3.8-flash`. Nếu tất cả thất bại hoặc thiếu API key,
 *   trả về `null` (hoặc ném lỗi ở model cuối) để tầng gọi chuyển sang Deterministic RAG.
 * - **Đầu vào:** `params` gồm `systemInstruction`, `prompt`, `temperature` (mặc định `0.2` để giảm ảo giác), `timeoutMs` (mặc định `10000ms`).
 * - **Đầu ra:** Chuỗi văn bản AI trả lời, hoặc `null` nếu chưa cấu hình `GEMINI_API_KEY` hợp lệ.
 */
export async function generateGeminiText(params: {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  // Bước 1: Kiểm tra tính hợp lệ của GEMINI_API_KEY; nếu là khóa giả/rỗng thì thoát sớm để chạy Deterministic RAG
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your-gemini-api-key' || apiKey.startsWith('placeholder')) {
    return null;
  }

  // Bước 2: Xây dựng danh sách model ứng viên theo thứ tự ưu tiên giảm dần (loại trùng và loại bỏ bản 2.5 cũ)
  const userModel = (process.env.GEMINI_MODEL || '').trim();
  const candidateModels: string[] = [];
  if (userModel && userModel !== 'gemini-2.5-flash') {
    candidateModels.push(userModel);
  }
  for (const m of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']) {
    if (!candidateModels.includes(m)) {
      candidateModels.push(m);
    }
  }

  // Bước 3: Thử tuần tự từng model Gemini; gặp 404/429/503 thì tự động trượt sang model kế tiếp
  let lastError: Error | null = null;
  for (const model of candidateModels) {
    try {
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
        signal: AbortSignal.timeout(params.timeoutMs ?? 10000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = new Error(`Gemini model ${model} returned HTTP ${res.status}: ${errBody}`);
        if (res.status === 404 || res.status === 503 || res.status === 429) {
          // Model deprecated (404) or busy (503/429) -> attempt next fallback model
          continue;
        }
        throw lastError;
      }

      // Bước 4: Gom tất cả các phần văn bản (`parts[].text`) của ứng viên đầu tiên; nếu có nội dung thì trả về ngay
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
      if (text.length > 0) {
        return text;
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (model === candidateModels[candidateModels.length - 1]) {
        throw lastError;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

/**
 * Tính độ tương đồng Cosine (Cosine Similarity) giữa hai vector ngữ nghĩa 1024 chiều.
 *
 * - **Mục tiêu:** Đo góc giữa vector câu hỏi (`vecA`) và vector tài liệu (`vecB`) theo công thức:
 *   `cos(A, B) = (A · B) / (||A|| * ||B||)`, trả giá trị trong `[-1, 1]` (càng gần `1` càng đồng nghĩa).
 * - **Liên kết luồng (Cross-layer):** Được dùng trong `rankChunksHybridRrf()` và bộ gợi ý khóa học của `askCareerAdvisorRag()`.
 * - **Đầu vào:** `vecA` (vector truy vấn 1024 chiều), `vecB` (vector lưu trong cột `embedding` của PostgreSQL, có thể `null`).
 * - **Đầu ra:** Số thực đại diện cho độ tương đồng ngữ nghĩa (`0` nếu một trong hai vector rỗng hoặc chuẩn bằng 0).
 */
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

/**
 * Tính điểm trùng khớp từ khóa (Lexical Overlap Score) hỗ trợ tiếng Việt có dấu / không dấu.
 *
 * - **Mục tiêu:** Bổ sung khả năng tìm chính xác thuật ngữ kỹ thuật/từ khóa (như `pgvector`, `RRF`, `SePay`)
 *   mà tìm kiếm ngữ nghĩa thuần (Dense Vector) đôi khi làm mờ.
 * - **Đầu vào:** `query` (câu hỏi), `content` (đoạn văn bản chunk hoặc mô tả khóa học).
 * - **Đầu ra:** Tỷ lệ phần trăm token của `query` xuất hiện trong `content` trong đoạn `[0, 1]`.
 */
function lexicalOverlapScore(query: string, content: string): number {
  // Bước 1: Hàm chuẩn hóa chữ thường, chuyển `đ -> d`, tách dấu Unicode NFD rồi xóa dấu thanh/mũ, tách token >= 2 ký tự
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

  // Bước 2: Dùng Set tra cứu O(1) số token trùng khớp và chia cho tổng số token câu hỏi
  const cSet = new Set(norm(content));
  let hits = 0;
  for (const qt of qTokens) {
    if (cSet.has(qt)) hits++;
  }
  return hits / qTokens.length;
}

/**
 * Xếp hạng tài liệu lai (Hybrid Dense + Lexical Search) bằng thuật toán Reciprocal Rank Fusion (RRF, k = 60).
 *
 * - **Mục tiêu:** Hợp nhất hai bảng xếp hạng độc lập (Ngữ nghĩa Dense Vector 1024-dim và Từ khóa Lexical)
 *   mà không cần chuẩn hóa thang điểm khác nhau, đồng thời ưu tiên nhẹ (`+0.004`) cho tài liệu thuộc đúng buổi học đang xem.
 * - **Công thức toán học:** `RRF(d) = 1 / (60 + rank_dense(d)) + 1 / (60 + rank_lex(d)) + sessionBoost`.
 * - **Đầu vào:** `query` (câu hỏi), `chunks` (danh sách `knowledge_chunks` từ DB), `currentSessionId` (ID buổi học hiện tại, tùy chọn).
 * - **Đầu ra:** Mảng `chunks` đã được sắp xếp theo điểm RRF giảm dần.
 */
function rankChunksHybridRrf<
  T extends { id: number; content: string; embedding: number[] | null; sessionId?: number | null }
>(query: string, chunks: T[], currentSessionId?: number): T[] {
  if (chunks.length === 0) return [];
  // Bước 1: Chuyển câu hỏi sang vector ngữ nghĩa 1024 chiều (cùng không gian embedding khi seed DB)
  const queryVec = computeSemanticEmbedding1024(query, 1024);

  // Bước 2: Xếp hạng toàn bộ chunk theo độ tương đồng Cosine (Dense Retrieval)
  const denseSorted = [...chunks]
    .map((c) => ({ chunk: c, sim: cosineSimilarity1024(queryVec, c.embedding) }))
    .sort((a, b) => b.sim - a.sim);

  // Bước 3: Xếp hạng toàn bộ chunk theo độ trùng khớp từ khóa (Lexical Retrieval)
  const lexSorted = [...chunks]
    .map((c) => ({ chunk: c, lex: lexicalOverlapScore(query, c.content) }))
    .sort((a, b) => b.lex - a.lex);

  // Bước 4: Ánh xạ chunkId -> thứ hạng (1-based) ở mỗi bảng xếp hạng để tra cứu O(1)
  const denseRankMap = new Map(denseSorted.map((item, idx) => [item.chunk.id, idx + 1]));
  const lexRankMap = new Map(lexSorted.map((item, idx) => [item.chunk.id, idx + 1]));

  // Bước 5: Tính tổng điểm RRF (k = 60) kèm điểm thưởng ngữ cảnh buổi học hiện tại rồi sắp xếp giảm dần
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

/** Danh sách mẫu regex nhận diện chủ đề hoàn toàn ngoài lĩnh vực đào tạo CNTT/AI của 3T Academy (Guardrail tầng 1). */
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

/** Danh sách mẫu regex nhận diện câu hỏi đòi giải sâu công thức/mã nguồn bài giảng trả phí khi đang ở chế độ Advisor công khai. */
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

/**
 * Phân loại ý định câu hỏi gửi vào Trợ lý Tư vấn công khai (Public Career Advisor Guardrail).
 *
 * - **Mục tiêu:** Chặn sớm trước khi tốn chi phí gọi LLM đối với câu hỏi lạc đề (`OUT_OF_SYSTEM`)
 *   hoặc câu hỏi khai thác lậu kiến thức bài giảng trả phí (`PAID_LECTURE_DEEP_DIVE`).
 * - **Đầu vào:** `question` — câu hỏi của khách truy cập.
 * - **Đầu ra:** Một trong 3 nhãn `AdvisorIntent`.
 */
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

/** Bộ slug chuẩn hóa cho 4 khóa học trụ cột của 3T Academy dùng trong cơ chế cô lập phạm vi Trợ giảng AI. */
export const CANONICAL_COURSE_SLUGS = {
  AI: 'ky-su-ai-thuc-chien-rag-agents-llmops',
  SWE: 'kien-truc-backend-chuyen-sau-typescript-postgresql-distributed-systems',
  DATA: 'ky-su-du-lieu-hien-dai-streaming-kafka-pyspark-lakehouse',
  PYTHON: 'lap-trinh-python-sql-thuc-chien-cho-ky-su-du-lieu-ai',
} as const;

/**
 * Quy đổi các biến thể slug khóa học cũ/ngắn về slug chuẩn (`CANONICAL_COURSE_SLUGS`).
 *
 * - **Mục tiêu:** Đảm bảo bộ kiểm tra từ khóa độc quyền của từng khóa học hoạt động nhất quán
 *   ngay cả khi DB có bản ghi slug biến thể.
 * - **Đầu vào:** `slug` — chuỗi slug khóa học từ bảng `courses`.
 * - **Đầu ra:** Chuỗi slug chuẩn tương ứng.
 */
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

/** Bản đồ từ khóa đặc trưng riêng của từng khóa học, dùng để phát hiện học viên hỏi chéo môn (Cross-course leakage prevention). */
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

/**
 * Phân loại ý định câu hỏi gửi vào Trợ giảng AI trong lớp học (Course-scoped Guardrail).
 *
 * - **Mục tiêu:** Đảm bảo Trợ giảng AI của môn A không bị lợi dụng để giải đáp kiến thức môn B
 *   mà học viên chưa mua, đồng thời từ chối câu hỏi ngoài lĩnh vực đào tạo.
 * - **Đầu vào:** `question` (câu hỏi học viên), `currentCourseSlug` (slug khóa học đang mở).
 * - **Đầu ra:** `TutorIntent` cho biết câu hỏi hợp lệ (`IN_COURSE_SCOPE`), ngoài hệ thống (`OUT_OF_DOMAIN`)
 *   hay thuộc khóa học khác (`OTHER_COURSE_TOPIC` kèm tên khóa đó).
 */
export function classifyCourseTutorIntent(
  question: string,
  currentCourseSlug: string
): TutorIntent {
  // Bước 1: Chặn các chủ đề hoàn toàn ngoài phạm vi công nghệ/đào tạo
  const trimmed = question.trim();
  if (UNRELATED_SYSTEM_PATTERNS.some((rx) => rx.test(trimmed))) {
    return { type: 'OUT_OF_DOMAIN' };
  }

  // Bước 2: Kiểm tra xem câu hỏi có chứa từ khóa thuộc chính khóa học hiện tại không
  const normalizedSlug = normalizeCourseSlugAlias(currentCourseSlug);
  const currentEntry = COURSE_EXCLUSIVE_KEYWORDS[normalizedSlug];
  const matchesCurrent = currentEntry
    ? currentEntry.patterns.some((rx) => rx.test(trimmed))
    : false;

  // Bước 3: Nếu không khớp khóa hiện tại nhưng lại khớp từ khóa độc quyền của khóa khác -> chặn hỏi chéo môn
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

/**
 * Thực thi luồng RAG Tư vấn Lộ trình công khai (Public Career Advisor).
 *
 * - **Mục tiêu:** Trả lời câu hỏi tư vấn khóa học, học phí, lịch khai giảng dựa trên dữ liệu thực tế
 *   trong PostgreSQL (`PUBLIC` knowledge chunks + danh sách khóa/đợt học đang mở), đồng thời gợi ý khóa phù hợp nhất.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/catalog/catalog.routes.ts` (`POST /api/v1/advisor/ask`).
 *   + Đọc bảng DB: `courses` (`PUBLISHED`), `cohorts`, `knowledge_chunks` (`visibility = 'PUBLIC'`).
 *   + Gọi LLM: `generateGeminiText()` (chuỗi fallback Gemini 3.5 Flash -> 3.1 Flash Lite -> 3.8 Flash -> Deterministic RAG).
 * - **Đầu vào:** `question` — câu hỏi hoặc mục tiêu nghề nghiệp của khách truy cập.
 * - **Đầu ra:** `replyText`, `answerMd`, `recommendedCourseSlug`, `recommendedCohortId`, `recommendedCohortCodes`, `citations`.
 */
export async function askCareerAdvisorRag(question: string) {
  // Bước 1: Làm sạch câu hỏi và phân loại ý định (Guardrail công khai)
  const cleanQuestion = question.trim();
  const intent = classifyAdvisorIntent(cleanQuestion);

  // Bước 2: Truy vấn song song danh sách khóa học đã xuất bản, đợt học và tài liệu RAG công khai (`PUBLIC`)
  const [allCourses, openCohorts, publicChunks] = await Promise.all([
    db.select().from(courses).where(eq(courses.status, 'PUBLISHED')).orderBy(asc(courses.id)),
    db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
    db.select().from(knowledgeChunks).where(eq(knowledgeChunks.visibility, 'PUBLIC')),
  ]);

  const activeCohorts = openCohorts.filter(
    (ch) => ch.status === 'OPENING' || ch.status === 'ONGOING'
  );
  const recommendedCohortCodes = activeCohorts.map((ch) => ch.code);

  // Bước 3: Xếp hạng Top 3 đoạn tri thức công khai bằng Hybrid Search (Dense 1024-dim + Lexical RRF)
  const topChunks = rankChunksHybridRrf(cleanQuestion, publicChunks).slice(0, 3);

  // Bước 4: Tìm khóa học phù hợp nhất bằng điểm lai (65% Cosine Similarity + 35% Lexical Overlap)
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

  // Bước 5: Áp dụng Guardrail — từ chối lịch sự nếu câu hỏi ngoài hệ thống đào tạo hoặc đòi giải sâu bài giảng trả phí
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

  // Bước 6: Lắp ráp ngữ cảnh thực (Danh mục khóa học + Top 3 chunk PUBLIC) để nạp vào Prompt cho Gemini
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

  // Bước 7: Gọi Gemini (đa model fallback); nếu thành công trả lời ngay kèm danh sách trích dẫn
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

  // Bước 8: Fallback Deterministic RAG — tự tổng hợp câu trả lời chuẩn xác từ chunk đứng đầu và danh mục lớp khi không gọi được Gemini
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

/**
 * Thực thi luồng RAG Trợ giảng AI riêng cho từng khóa học/buổi học (Course-scoped Tutor).
 *
 * - **Mục tiêu:** Bảo vệ chặt quyền truy cập học liệu trả phí (kiểm tra đã mua khóa hoặc là giảng viên phụ trách),
 *   chặn hỏi chéo môn khác, truy xuất học liệu `ENROLLED_ONLY` bằng Hybrid RRF và trả lời kèm trích dẫn mốc video + trang Slide.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/learning/learning.routes.ts` (`POST /api/v1/sessions/:sessionId/tutor/ask`)
 *     như tuyến Fallback (hoặc bổ sung Guardrail) cho `aiServiceClient.askSessionTutor()`.
 *   + Đọc bảng DB: `class_sessions`, `cohorts`, `courses`, `enrollments`, `course_skills`, `skills`, `knowledge_chunks` (`ENROLLED_ONLY`).
 *   + Gọi LLM: `generateGeminiText()` với fallback cuối là Deterministic Course RAG.
 * - **Đầu vào:** `params` gồm `accountId`, `userRole`, `cohortId`, `sessionId`, `question`, `currentVideoSec`.
 * - **Đầu ra:** `answerMd` (Markdown câu trả lời), `detectedTopic` (chủ đề), `citations` (mảng `{ label, jumpSec, slideLabel }`).
 */
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

  // Bước 1: Xác thực sự tồn tại của buổi học (`class_sessions`), đợt học (`cohorts`) và khóa học (`courses`)
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

  // Bước 2: Kiểm tra phân quyền dữ liệu (RBAC + Ownership)
  // - Giảng viên chỉ được dùng Tutor trong đợt học do mình phụ trách
  // - Học viên bắt buộc phải có bản ghi ghi danh ACTIVE hoặc COMPLETED trong đợt học này
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

  // Bước 3: Tải danh sách kỹ năng thuộc khóa học hiện tại để xác định phạm vi chuyên môn được phép trả lời
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

  // Bước 4: Chạy Guardrail phạm vi môn học — chặn câu hỏi ngoài ngành hoặc hỏi chéo kiến thức khóa học khác
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

  // Bước 5: Truy xuất học liệu độc quyền (`ENROLLED_ONLY`) của đúng khóa học rồi xếp hạng bằng Hybrid RRF (ưu tiên buổi hiện tại)
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

  // Bước 6: Tạo danh sách trích dẫn có mốc giây (`jumpSec`) và nhãn trang slide để Frontend hiển thị nút tua video
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

  // Bước 7: Gọi Gemini (đa model fallback) tổng hợp lời giải thích dựa chặt trên Top 3 học liệu trích xuất
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

  // Bước 8: Fallback cuối cùng (Deterministic Course RAG) — trích xuất trực tiếp đoạn transcript/slide liên quan nhất
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
