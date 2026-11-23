/**
 * ============================================================================
 * TỆP: apps/api/src/integrations/aiService.client.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Cầu nối HTTP trung tâm (Internal Service Client)
 *     giao tiếp trực tiếp với tầng AI Service (`apps/ai-service`, chạy FastAPI/Python).
 *   - Chuẩn hóa cơ chế bảo mật nội bộ (`X-Internal-Key`), truy vết log xuyên dịch vụ
 *     (`X-Request-ID`), và kiểm soát thời gian chờ (`AbortSignal.timeout`) để tránh
 *     nghẽn cổ chai Backend khi AI Service phản hồi chậm hoặc tạm ngắt.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ các route modules của `apps/api/src/modules/`:
 *     + `catalog/catalog.routes.ts`    -> gọi `askAdvisor()`
 *     + `learning/learning.routes.ts`  -> gọi `askSessionTutor()`
 *     + `profile/profile.routes.ts`    -> gọi `parseCvPdf()`, `screenCv()`
 *     + `teach/teach.routes.ts`        -> gọi `generateQuizDraft()`
 *   - Gọi tiếp sang các endpoint FastAPI trong `apps/ai-service/src/api/routes/`:
 *     + `rag_chat.py`     -> `POST /api/v1/ai/advisor/ask`, `POST /api/v1/ai/tutor/ask`
 *     + `career_ai.py`    -> `POST /api/v1/ai/cv/parse`, `POST /api/v1/ai/mock-interviews/round1-cv-defense`
 *     + `grading_ai.py`   -> `POST /api/v1/ai/assessments/generate-quiz`
 *   - Khi các lời gọi ở đây ném lỗi hoặc hết timeout, từng route module sẽ chủ động
 *     chuyển sang nhánh Fallback (ví dụ: `ragAi.service.ts` hoặc bộ phân tích dự phòng)
 *     để hệ thống vẫn phục vụ người dùng liên tục (Graceful Degradation).
 * ============================================================================
 */
import { env } from '../config/env.js';

/**
 * Lớp Client HTTP trung tâm giao tiếp giữa Node.js Backend (`apps/api`) và Python AI Service (`apps/ai-service`).
 *
 * - **Mục tiêu:** Đóng gói cấu hình base URL, header xác thực nội bộ và các phương thức
 *   định kiểu mạnh (strongly-typed) cho từng nghiệp vụ AI.
 * - **Cơ chế bảo mật:** Mọi request đều đính kèm `X-Internal-Key` khớp với `INTERNAL_API_KEY`
 *   giữa hai service, ngăn người dùng bên ngoài gọi trực tiếp vào AI Service.
 */
export class AiServiceClient {
  private baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, '');
  private apiKey = env.INTERNAL_API_KEY;

  /**
   * Hàm nền tảng thực thi lời gọi HTTP sang `apps/ai-service` kèm xác thực, correlation ID và timeout.
   *
   * - **Mục tiêu:** Tập trung logic dựng header, gọi `fetch`, áp đặt giới hạn thời gian chờ
   *   và kiểm tra trạng thái HTTP phản hồi tại một nơi duy nhất.
   * - **Liên kết luồng (Cross-layer):** Được gọi nội bộ bởi tất cả các phương thức chuyên biệt
   *   trong `AiServiceClient` (`askAdvisor`, `askSessionTutor`, `parseCvPdf`, `screenCv`, `generateQuizDraft`).
   * - **Đầu vào:**
   *   + `endpoint`: Đường dẫn tương đối trên AI Service (ví dụ: `/api/v1/ai/tutor/ask`).
   *   + `options`: Tùy chọn `RequestInit` (method, body, headers tùy biến, AbortSignal).
   *   + `correlationId`: Mã truy vết request (`X-Request-ID`, mặc định `'internal'`) để đối soát log giữa 2 tầng.
   *   + `timeoutMs`: Ngưỡng timeout tính bằng mili-giây (mặc định `2500ms`) nhằm fail-fast để kích hoạt fallback sớm.
   * - **Đầu ra:** Promise giải mã JSON phản hồi theo kiểu generic `T`; ném `Error` nếu HTTP status không nằm trong `2xx` hoặc vượt quá timeout.
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    correlationId = 'internal',
    timeoutMs = 2500
  ): Promise<T> {
    // Bước 1: Khởi tạo tập header chuẩn cho giao tiếp nội bộ giữa Backend và AI Service
    // (X-Internal-Key để xác thực service-to-service, X-Request-ID để truy vết log phân tán)
    const headers = new Headers(options.headers || {});
    headers.set('X-Internal-Key', this.apiKey);
    headers.set('X-Request-ID', correlationId);
    headers.set('Content-Type', 'application/json');

    // Bước 2: Gửi HTTP request kèm AbortSignal.timeout để cắt kết nối nếu AI Service xử lý quá lâu
    // giúp Backend không bị treo event-loop và kịp chuyển sang cơ chế fallback cục bộ
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    });

    // Bước 3: Kiểm tra mã HTTP trả về; nếu lỗi (4xx/5xx) lập tức ném Exception cho caller xử lý fallback
    if (!res.ok) {
      throw new Error(`AI Service request failed with status ${res.status}: ${res.statusText}`);
    }

    // Bước 4: Parse phần thân JSON trả về theo đúng kiểu dữ liệu kỳ vọng `T`
    return res.json() as Promise<T>;
  }

  /**
   * Gửi câu hỏi tư vấn lộ trình học tập công khai sang AI Advisor.
   *
   * - **Mục tiêu:** Nhờ AI Service thực hiện RAG trên kho tri thức công khai (`PUBLIC`) để tư vấn khóa học, lịch khai giảng.
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/catalog/catalog.routes.ts` (`POST /api/v1/advisor/ask`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/advisor/ask` (`apps/ai-service/src/api/routes/rag_chat.py` -> hàm `ask_advisor`).
   * - **Đầu vào:** `question` (câu hỏi người dùng), `correlationId` (mã truy vết request).
   * - **Đầu ra:** Đối tượng chứa câu trả lời Markdown (`answerMd`) và danh sách trích dẫn (`citations`).
   */
  async askAdvisor(question: string, correlationId?: string) {
    return this.request<{
      answerMd: string;
      citations: Array<{ chunkId: number; sourceType: string; snippet: string }>;
      rerankBackend?: string;
      maxRelevanceScore?: number;
      agentTrace?: Array<Record<string, unknown>>;
    }>(
      '/api/v1/ai/advisor/ask',
      {
        method: 'POST',
        body: JSON.stringify({ question }),
      },
      correlationId,
      15000
    );
  }

  /**
   * Gửi câu hỏi của học viên trong phòng học sang Trợ giảng AI (Session Tutor RAG).
   *
   * - **Mục tiêu:** Giải đáp kiến thức chuyên sâu bám sát giáo trình buổi học và mốc thời gian video đang xem.
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/learning/learning.routes.ts` (`POST /api/v1/sessions/:sessionId/tutor/ask`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/tutor/ask` (`apps/ai-service/src/api/routes/rag_chat.py` -> hàm `ask_tutor`).
   *   + Fallback khi lỗi/timeout: `learning.routes.ts` chuyển sang `askCourseTutorRag()` trong `ragAi.service.ts`.
   * - **Đầu vào:** `payload` gồm `cohortId`, `sessionId`, `question`, `currentVideoSec` (giây hiện tại trên trình phát video).
   * - **Đầu ra:** `answerMd` (nội dung giải thích), `detectedTopic` (chủ đề nhận diện) và `citations` (mốc giây/trang slide).
   */
  async askSessionTutor(
    payload: {
      cohortId: number;
      sessionId: number;
      question: string;
      currentVideoSec: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      answerMd: string;
      detectedTopic?: string;
      citations: Array<{
        chunkId?: number;
        startSec?: number;
        endSec?: number;
        pageNumber?: number;
        snippet?: string;
        label?: string;
        jumpSec?: number;
        slideLabel?: string;
      }>;
      rerankBackend?: string;
      maxRelevanceScore?: number;
      agentTrace?: Array<Record<string, unknown>>;
    }>(
      '/api/v1/ai/tutor/ask',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      correlationId,
      15000
    );
  }

  /**
   * Yêu cầu AI Service bóc tách văn bản thô từ CV (PDF/text) thành dữ liệu cấu trúc JSON.
   *
   * - **Mục tiêu:** Trích xuất tự động danh sách kỹ năng, dự án, thông tin liên hệ (SĐT, GitHub, LinkedIn),
   *   tiêu đề nghề nghiệp và mục tiêu từ nội dung CV của học viên.
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/profile/profile.routes.ts` (`POST /api/v1/me/cv-parse`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/cv/parse` (`apps/ai-service/src/api/routes/career_ai.py` -> hàm `parse_cv_endpoint`).
   * - **Đầu vào:** `rawText` (chuỗi văn bản đã đọc từ CV; gửi song song 2 key `raw_text` và `rawText` để tương thích cả snake_case/camelCase).
   * - **Đầu ra:** Cấu trúc hồ sơ bóc tách gồm `skills`, `externalSkills`, `projects`, `phone`, `githubUrl`, `linkedinUrl`, `headline`, `careerObjective`.
   */
  async parseCvPdf(rawText: string, correlationId?: string) {
    return this.request<{
      skills?: string[];
      externalSkills?: Array<{ name: string; note?: string }>;
      projects?: Array<Record<string, unknown>>;
      phone?: string;
      githubUrl?: string;
      linkedinUrl?: string;
      headline?: string;
      careerObjective?: string;
    }>(
      '/api/v1/ai/cv/parse',
      {
        method: 'POST',
        body: JSON.stringify({ raw_text: rawText, rawText }),
      },
      correlationId
    );
  }

  /**
   * Chấm điểm mức độ phù hợp giữa CV ứng viên và Mô tả công việc (JD) cho Vòng 1 Phỏng vấn AI.
   *
   * - **Mục tiêu:** Đối chiếu dữ liệu CV đã bóc tách với JD mục tiêu, tính điểm match (`matchScore`),
   *   chỉ ra kỹ năng còn thiếu (`missingSkills`) và nhận xét phản biện CV (`feedback`).
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/profile/profile.routes.ts` (`POST /api/v1/interviews/screen-cv`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/mock-interviews/round1-cv-defense` (`apps/ai-service/src/api/routes/career_ai.py` -> hàm `round1_cv_defense`).
   * - **Đầu vào:** `payload` gồm `cvData` (hồ sơ đã bóc tách), `targetLevel` (cấp bậc), `targetRole` (vị trí ứng tuyển), `jdRawText` (nội dung JD).
   * - **Đầu ra:** Điểm phù hợp (`matchScore`/`match_score`), mảng kỹ năng thiếu (`missingSkills`/`missing_skills`), và nhận xét chi tiết (`feedback`).
   */
  async screenCv(
    payload: {
      cvData: Record<string, unknown>;
      targetLevel: string;
      targetRole: string;
      jdRawText: string;
    },
    correlationId?: string
  ) {
    return this.request<{
      matchScore?: number;
      match_score?: number;
      missingSkills?: string[];
      missing_skills?: string[];
      feedback?: string;
    }>(
      '/api/v1/ai/mock-interviews/round1-cv-defense',
      {
        method: 'POST',
        body: JSON.stringify({
          cv_parsed_data: payload.cvData,
          target_level: payload.targetLevel,
          target_role: payload.targetRole,
          jd_raw_text: payload.jdRawText,
        }),
      },
      correlationId
    );
  }

  /**
   * Yêu cầu AI Service sinh bản nháp bộ câu hỏi trắc nghiệm (MCQ) dựa trên nội dung/transcript buổi học.
   *
   * - **Mục tiêu:** Hỗ trợ Giảng viên tạo nhanh ngân hàng câu hỏi kiểm tra sau buổi học có gắn thẻ kỹ năng (`skillId`)
   *   và giải thích đáp án (`explanationMd`).
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/generate-quiz`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/assessments/generate-quiz` (`apps/ai-service/src/api/routes/grading_ai.py` -> hàm `generate_session_quiz`).
   * - **Đầu vào:** `params` gồm `sessionId`, `sessionTitle`, `transcriptText`, `skillIds` (danh sách ID kỹ năng khóa học), `questionCount` (mặc định 4 câu).
   *   Sử dụng `timeoutMs = 4000` (cao hơn mặc định 2500ms) vì tác vụ sinh nhiều câu hỏi JSON cần thời gian suy luận dài hơn.
   * - **Đầu ra:** Đối tượng chứa `session_id` và mảng `generated_items` (mỗi câu gồm `prompt`, `options`, `correctIndex`, `explanationMd`, `skillId`).
   */
  async generateQuizDraft(
    params: {
      sessionId: number;
      sessionTitle: string;
      transcriptText: string;
      skillIds?: number[];
      questionCount?: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      session_id: number;
      generated_items: Array<{
        prompt: string;
        options: string[];
        correctIndex: number;
        explanationMd: string;
        skillId?: number;
      }>;
    }>(
      '/api/v1/ai/assessments/generate-quiz',
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: params.sessionId,
          session_title: params.sessionTitle,
          transcript_text: params.transcriptText,
          skill_ids: params.skillIds ?? [],
          question_count: params.questionCount ?? 4,
        }),
      },
      correlationId,
      4000
    );
  }

  /**
   * Chấm điểm một lượt trả lời phỏng vấn Vòng 2 theo Rubric 3 tiêu chí (Technical 50% + STAR 30% + Fluency 20%).
   *
   * - **Mục tiêu:** Đánh giá định lượng tốc độ nói (WPM), mật độ từ đệm, cấu trúc STAR và độ bao phủ kiến thức.
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/profile/profile.routes.ts` (`POST /api/v1/interviews/:interviewId/turn`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/mock-interviews/evaluate-answer` (`apps/ai-service/src/api/routes/career_ai.py`).
   */
  async evaluateInterviewTurn(
    payload: {
      question: string;
      transcriptAnswer: string;
      durationSeconds?: number;
      expectedKeywords?: string[];
    },
    correlationId?: string
  ) {
    return this.request<{
      overallScore: number;
      technicalScore: number;
      starStructureScore: number;
      fluencyScore: number;
      speechMetrics: {
        wordCount: number;
        wordsPerMinute: number;
        fillerCount: number;
      };
    }>(
      '/api/v1/ai/mock-interviews/evaluate-answer',
      {
        method: 'POST',
        body: JSON.stringify({
          question: payload.question,
          transcriptAnswer: payload.transcriptAnswer,
          durationSeconds: payload.durationSeconds ?? 30,
          expectedKeywords: payload.expectedKeywords ?? [],
        }),
      },
      correlationId,
      4000
    );
  }

  /**
   * Gửi khung hình Webcam dạng Base64 sang pipeline Computer Vision giám sát thi 2 tầng (Proctoring CV).
   *
   * - **Mục tiêu:** Phát hiện khuôn mặt (MediaPipe/YuNet ONNX), ước lượng góc quay đầu 3D (SolvePnP),
   *   phát hiện vật thể cấm (YOLOv8n ONNX) và leo thang xác minh Gemini Vision khi có nghi vấn.
   * - **Liên kết luồng (Cross-layer):**
   *   + Được gọi từ: `apps/api/src/modules/assessment/assessment.routes.ts` (`POST /api/v1/assessments/:assessmentId/proctoring-snapshot`).
   *   + Gọi sang AI Service: `POST /api/v1/ai/proctoring/analyze-frame` (`apps/ai-service/src/api/routes/proctoring_ai.py`).
   */
  async analyzeProctoringFrame<T = Record<string, unknown>>(
    payload: {
      imageBase64: string;
      escalateVlm?: boolean;
    },
    correlationId?: string
  ) {
    return this.request<T>(
      '/api/v1/ai/proctoring/analyze-frame',
      {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: payload.imageBase64,
          escalateVlm: payload.escalateVlm ?? true,
        }),
      },
      correlationId,
      6500
    );
  }
}

/** Singleton instance dùng chung trên toàn bộ Backend `apps/api`. */
export const aiServiceClient = new AiServiceClient();
