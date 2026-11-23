/**
 * ============================================================================
 * FILE: learning.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Không gian Học tập, Lớp Live & Trợ giảng AI
 * ============================================================================
 * Vai trò:
 *   - Cung cấp toàn bộ API cho hành trình học tập của học viên (và tương tác trong phòng học trực tiếp):
 *     1. Bảng điều khiển cá nhân (`/me/dashboard`), thông báo (`/me/notifications/*`) và danh sách lớp đã ghi danh (`/me/enrollments`).
 *     2. Không gian lớp học (`/cohorts/:cohortId/workspace`), chi tiết buổi học replay (`/cohorts/:cohortId/sessions/:sessionId`)
 *        và đồng bộ tiến độ xem video (`PUT /sessions/:sessionId/progress`).
 *     3. Nộp bài Quiz cuối buổi (`POST /sessions/:sessionId/quiz-submit`), hỏi đáp thảo luận gắn mốc giây video (`/sessions/:sessionId/discussions`).
 *     4. Trợ giảng AI gắn ngữ cảnh bài giảng (`POST /ai/tutor/ask`).
 *     5. Phòng học trực tuyến thời gian thực (`/live/sessions/*`): cấp token LiveKit SFU, kênh sự kiện SSE (`EventSource`),
 *        giơ tay, thả cảm xúc, bình chọn câu hỏi, tín hiệu WebRTC dự phòng, đồng bộ luồng media host,
 *        ký sẵn URL upload bản ghi lên Cloudflare R2 và xác thực link Diễn giả khách mời (Guest Speaker).
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `StudentDashboardView.tsx`, `CohortWorkspaceView.tsx`, `SessionVideoRoomView.tsx`,
 *     `LivestreamClassView.tsx`, `SessionPlayerQuizModal.tsx`, `AcademyContext.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/learning/learning.routes.ts` (phối hợp `liveRoom.helpers.ts`,
 *     `livekit.service.ts`, `r2.service.ts`, `assessment.routes.ts`).
 *   - Kết nối tầng AI Service: `POST /api/v1/ai/tutor/ask` qua `askCourseTutorRag` (`apps/api/src/integrations/ragAi.service.ts`)
 *     và hợp đồng RAG microservice tại `apps/ai-service/src/api/routes/rag_chat.py` (`POST /api/v1/ai/tutor/ask`).
 * ============================================================================
 */

import { API_CONFIG, getAuthAccessToken, httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  ClassSession,
  DiscussionThread,
  CohortMaterial,
  UpcomingTaskItem,
  OrderReceipt,
  Notification,
} from '../types/domain';
import { QuizEvaluationOutput } from '../utils/academyLogic';

/** Dữ liệu tổng hợp cho màn hình Bảng điều khiển học viên (`StudentDashboardView`). */
export interface StudentDashboardSummaryResponse {
  liveSession: ClassSession | null;
  resumeSession: ClassSession | null;
  upcomingTasks: UpcomingTaskItem[];
  streakDays: number;
  sessions?: ClassSession[];
  notifications?: Notification[];
  attemptTrend?: {
    label: string;
    subLabel?: string;
    value: number;
    detailText?: string;
  }[];
}

/** Mục lục phân chương (Chapter) gắn mốc thời gian trên video bài giảng. */
export interface SessionChapterItem {
  sec: number;
  timeLabel: string;
  title: string;
  slideRange: string;
}

/** Một tin nhắn trong lịch sử hội thoại với Trợ giảng AI của buổi học, kèm trích dẫn mốc giây nhảy video. */
export interface SessionAiChatMessageItem {
  id: string;
  role: 'AI' | 'USER';
  content: string;
  citations?: { label: string; jumpSec: number; slideLabel: string }[];
}

/** Tin nhắn trò chuyện trực tiếp trong phòng Live Classroom. */
export interface LiveSessionChatMessage {
  id: string;
  sessionId: string;
  senderName: string;
  sender?: string;
  senderRole: string;
  roleLabel?: string;
  timeLabel: string;
  time?: string;
  text: string;
  isStaff?: boolean;
}

/** Thông tin người tham gia hiện diện trong phòng học trực tuyến. */
export interface LiveParticipantItem {
  accountId: string;
  fullName: string;
  role: string;
  roleLabel: string;
  avatarUrl?: string;
  isHost: boolean;
}

/** Trạng thái một học viên đang giơ tay phát biểu trong phòng Live. */
export interface LiveHandRaiseItem {
  accountId: string;
  fullName: string;
  role: string;
  raisedAt: string;
}

/** Biểu cảm tương tác nhanh (Reaction) được phát broadcast qua SSE trong phòng Live. */
export interface LiveReactionPayload {
  id: string;
  senderName: string;
  label: string;
  createdAt: string;
}

/** Trạng thái ghi hình buổi học (qua LiveKit Egress hoặc ghi trực tiếp từ trình duyệt đẩy lên R2). */
export interface LiveRecordingState {
  isRecording: boolean;
  egressId?: string;
  objectKey?: string;
  publicUrl?: string;
  mode?: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
  startedAt?: string;
  stoppedAt?: string;
}

/** Trạng thái camera/micro/chia sẻ màn hình của giảng viên (Host) dùng để đồng bộ UI và fallback media. */
export interface LiveHostMediaState {
  camOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  mirrorCam?: boolean;
  cameraFrameDataUrl?: string;
  screenFrameDataUrl?: string;
  hostAccountId?: string;
  hostName?: string;
  updatedAt: string;
}

/** Toàn bộ trạng thái thời gian thực (in-memory runtime state) của một phòng học trực tuyến. */
export interface LiveRoomRuntimeState {
  raisedHands: LiveHandRaiseItem[];
  recentReactions: LiveReactionPayload[];
  questionVotes: Record<string, number>;
  mutedIdentities?: string[];
  kickedIdentities?: string[];
  activeParticipants?: LiveParticipantItem[];
  recording?: LiveRecordingState;
  hostBroadcast: {
    activeSlideLabel: string;
    liveTopicNote: string;
    updatedAt: string;
  };
  hostMedia?: LiveHostMediaState;
}

/** Gói dữ liệu khởi tạo hoàn chỉnh khi bước vào phòng học trực tuyến (`LivestreamClassView`), bao gồm LiveKit JWT & URL. */
export interface LiveSessionRoomPayload {
  session: ClassSession;
  cohort: Cohort | null;
  participants: LiveParticipantItem[];
  participantCount: number;
  isHost: boolean;
  video: {
    videoUrl: string;
    playbackType: 'MP4' | 'HLS' | 'NONE';
    storageKey: string;
  };
  livekit: {
    roomName: string;
    token: string;
    serverUrl: string;
    enabled: boolean;
  };
  roomState: LiveRoomRuntimeState;
  chatMessages: LiveSessionChatMessage[];
  discussions: (DiscussionThread & { votes?: number })[];
  transcript: {
    id?: string;
    sec: number;
    timeLabel: string;
    speaker: string;
    text: string;
    slidePage: number;
  }[];
  attachments: CohortMaterial[];
}

/** Gói dữ liệu chi tiết một buổi học xem lại (Replay Room): video, phụ đề transcript, lịch sử AI Tutor, tài liệu, tóm tắt Quiz & thảo luận. */
export interface SessionDetailPayload {
  session: ClassSession;
  videoUrl: string;
  playbackType?: 'MP4' | 'HLS' | 'NONE';
  storageKey?: string;
  chapters?: SessionChapterItem[];
  aiChatHistory?: SessionAiChatMessageItem[];
  accessDenied?: boolean;
  isPlaceholder?: boolean;
  transcript: {
    sec: number;
    timeLabel: string;
    speaker: string;
    text: string;
    slidePage: number;
  }[];
  attachments: CohortMaterial[];
  quizSummary: {
    assessmentId: string;
    questionCount: number;
    passingScoreOutOf10: number;
    isCompleted: boolean;
    bestScorePercent?: number | null;
  };
  discussions: DiscussionThread[];
}

export const learningApi = {
  /**
   * **Mục tiêu:** Lấy dữ liệu tổng quan bảng điều khiển học viên (buổi đang Live, buổi học tiếp, lịch sắp tới, chuỗi ngày học streak, thông báo và biểu đồ điểm).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/me/dashboard` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<StudentDashboardSummaryResponse>`.
   */
  getStudentDashboard: () =>
    httpRequest<StudentDashboardSummaryResponse>('/me/dashboard', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Alias của `getStudentDashboard` dành cho trang bảng điều khiển học viên.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentDashboardView.tsx`.
   *   - Gọi tới: `GET /api/v1/me/dashboard` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<StudentDashboardSummaryResponse>`.
   */
  getDashboardSummary: () =>
    httpRequest<StudentDashboardSummaryResponse>('/me/dashboard', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Đánh dấu một thông báo cá nhân là đã đọc.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `PATCH /api/v1/me/notifications/:notificationId/read` (`apps/api/src/modules/learning/learning.routes.ts` — bảng `notifications`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `notificationId`; Output: Trạng thái `isRead` và thời điểm đọc `readAt`.
   */
  markNotificationRead: (notificationId: string) =>
    httpRequest<{ id: string; isRead: boolean; readAt: string }>(
      `/me/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    ),

  /**
   * **Mục tiêu:** Đánh dấu toàn bộ thông báo chưa đọc của người dùng hiện tại là đã đọc.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/me/notifications/read-all` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<{ success: boolean; readAt: string }>`.
   */
  markAllNotificationsRead: () =>
    httpRequest<{ success: boolean; readAt: string }>('/me/notifications/read-all', {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Gửi đánh giá sao (1-5) và nhận xét của học viên cho một đợt học đã ghi danh.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `CohortWorkspaceView.tsx`.
   *   - Gọi tới: `POST /api/v1/cohorts/:cohortId/reviews` (`apps/api/src/modules/learning/learning.routes.ts` — bảng `course_reviews`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `cohortId`, `rating`, `comment`; Output: Bản ghi đánh giá vừa lưu.
   */
  submitCohortReview: (cohortId: string, rating: number, comment: string) =>
    httpRequest<{ id: string; rating: number; comment: string; createdAt: string }>(
      `/cohorts/${encodeURIComponent(cohortId)}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      }
    ),

  /**
   * **Mục tiêu:** Xin chữ ký URL tạm thời (Presigned PUT URL) để tải trực tiếp tệp video ghi hình từ trình duyệt lên Cloudflare R2.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx` (luồng Browser MediaRecorder fallback khi dừng ghi hình).
   *   - Gọi tới: `POST /api/v1/live/sessions/:sessionId/recording/presign` (`apps/api/src/modules/learning/learning.routes.ts` -> `r2.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `contentType?` (vd `video/webm`); Output: `objectKey`, `presignedUploadUrl` và `publicUrl`.
   */
  presignLiveRecordingUpload: (sessionId: string, contentType?: string) =>
    httpRequest<{
      sessionId?: string;
      objectKey: string;
      presignedUploadUrl?: string | null;
      uploadUrl?: string | null;
      publicUrl: string;
    }>(`/live/sessions/${encodeURIComponent(sessionId)}/recording/presign`, {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    }),

  /**
   * **Mục tiêu:** Lấy danh sách các đợt học đã ghi danh hợp lệ (`ACTIVE`/`COMPLETED`) cùng biên lai học phí tương ứng của học viên.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentDashboardView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/me/enrollments` (`apps/api/src/modules/learning/learning.routes.ts` — tự đồng bộ lại từ `orders` `PAID` nếu cần).
   * **Đầu vào / Đầu ra (Input / Output):** Output: Danh sách `enrolledCohortIds`, chi tiết `cohorts` và `receipts`.
   */
  getMyEnrollments: () =>
    httpRequest<{ enrolledCohortIds: string[]; cohorts: Cohort[]; receipts: OrderReceipt[] }>(
      '/me/enrollments',
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Tải toàn bộ không gian học tập của một đợt học: danh sách buổi học, tài liệu, trạng thái mở khóa Kỳ thi cuối khóa.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `CohortWorkspaceView.tsx`.
   *   - Gọi tới: `GET /api/v1/cohorts/:cohortId/workspace` (`apps/api/src/modules/learning/learning.routes.ts`).
   *   - Backend kiểm tra chặt quyền truy cập (`STUDENT` đã ghi danh / `INSTRUCTOR` phụ trách / `ADMIN`; ném 403 `NOT_ENROLLED_IN_COHORT` nếu chưa ghi danh).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `cohortId`; Output: Thông tin `cohort`, `course`, `sessions`, `materials`, `finalExamId`, `eligibleForFinalExam`.
   */
  getCohortWorkspace: (cohortId: string) =>
    httpRequest<{
      cohort: Cohort;
      course: Course;
      sessions: ClassSession[];
      materials: CohortMaterial[];
      finalExamId?: string;
      finalExamPassed?: boolean;
      eligibleForFinalExam?: boolean;
      accessDenied?: boolean;
      isPlaceholder?: boolean;
    }>(`/cohorts/${encodeURIComponent(cohortId)}/workspace`, {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Tải toàn bộ dữ liệu phòng học Xem lại (Replay) của một buổi học cụ thể: link video, phân chương, phụ đề, tài liệu, Quiz và lịch sử hỏi Trợ giảng AI.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionVideoRoomView.tsx`.
   *   - Gọi tới: `GET /api/v1/cohorts/:cohortId/sessions/:sessionId` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `cohortId`, `sessionId`; Output: `Promise<SessionDetailPayload>`.
   */
  getSessionDetail: (cohortId: string, sessionId: string) =>
    httpRequest<SessionDetailPayload>(
      `/cohorts/${encodeURIComponent(cohortId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Đồng bộ vị trí xem video (`lastPositionSec`), mốc xem xa nhất (`maxWatchedSec`) và thời lượng video của học viên về CSDL để hỗ trợ Resume đa thiết bị.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionVideoRoomView.tsx`, `AcademyContext.tsx` (gửi định kỳ khi người dùng xem hoặc tạm dừng video).
   *   - Gọi tới: `PUT /api/v1/sessions/:sessionId/progress` (`apps/api/src/modules/learning/learning.routes.ts` — cập nhật bảng `session_progress`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `sessionId`, `lastPositionSec` (giây hiện tại), `completed?`, `durationSeconds?` (làm tròn nguyên giây nếu > 0).
   *   - Output: Bản ghi tiến độ đã lưu (`lastPositionSec`, `maxWatchedSec`, `isCompleted`, `savedAt`).
   */
  updateVideoProgress: (
    sessionId: string,
    lastPositionSec: number,
    completed?: boolean,
    durationSeconds?: number
  ) =>
    httpRequest<{
      sessionId: string;
      lastPositionSec: number;
      maxWatchedSec?: number;
      durationSeconds?: number;
      isCompleted?: boolean;
      savedAt: string;
      updatedSession?: ClassSession;
    }>(`/sessions/${encodeURIComponent(sessionId)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        lastPositionSec,
        ...(completed !== undefined ? { completed } : {}),
        ...(typeof durationSeconds === 'number' && durationSeconds > 0
          ? { durationSeconds: Math.round(durationSeconds) }
          : {}),
      }),
    }),

  /**
   * **Mục tiêu:** Nộp bài Quiz trắc nghiệm cuối buổi học để chấm điểm tự động, cập nhật điểm năng lực kỹ năng (IRT) và đánh dấu hoàn thành buổi học nếu đạt ngưỡng.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionPlayerQuizModal.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/sessions/:sessionId/quiz-submit` (`apps/api/src/modules/learning/learning.routes.ts` -> dùng chung engine `gradeAndRecordAssessmentSubmission` ở `assessment.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `answers` (mảng chỉ số đáp án đã chọn); Output: `Promise<QuizEvaluationOutput>`.
   */
  submitSessionQuiz: (sessionId: string, answers: number[]) =>
    httpRequest<QuizEvaluationOutput>(
      `/sessions/${encodeURIComponent(sessionId)}/quiz-submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      }
    ),

  /**
   * **Mục tiêu:** Đặt câu hỏi cho Trợ giảng AI (RAG Course Tutor) ngay trong lúc xem video hoặc học trực tiếp, nhận giải đáp kèm trích dẫn chính xác mốc giây video & trang slide.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionVideoRoomView.tsx`, `LivestreamClassView.tsx`, `SessionPlayerQuizModal.tsx`.
   *   - Gọi tới: `POST /api/v1/ai/tutor/ask` (`apps/api/src/modules/learning/learning.routes.ts`)
   *     -> gọi `askCourseTutorRag` (`apps/api/src/integrations/ragAi.service.ts`) truy xuất Hybrid Dense + Lexical RRF trên `knowledge_chunks` của buổi học kết hợp Gemini LLM (cùng chuẩn hợp đồng với `POST /api/v1/ai/tutor/ask` trong `apps/ai-service/src/api/routes/rag_chat.py`), đồng thời lưu lịch sử vào `chat_sessions` & `chat_messages`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `sessionId`, `question`, `currentTimestampSec?` (mốc giây video đang dừng để AI ưu tiên ngữ cảnh xung quanh).
   *   - Output: Câu trả lời Markdown `answerMd`, chủ đề nhận diện `detectedTopic` và mảng trích dẫn `citations` (`jumpSec`, `slideLabel`).
   */
  askSessionAiTutor: (sessionId: string, question: string, currentTimestampSec?: number) =>
    httpRequest<{
      answerMd: string;
      detectedTopic?: string;
      citations: { label: string; jumpSec: number; slideLabel: string }[];
    }>('/ai/tutor/ask', {
      method: 'POST',
      body: JSON.stringify({ sessionId, question, currentTimestampSec }),
    }),

  /**
   * **Mục tiêu:** Lấy danh sách các chủ đề hỏi đáp (Q&A Discussions) gắn mốc thời gian của một buổi học.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionVideoRoomView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/sessions/:sessionId/discussions` (`apps/api/src/modules/learning/learning.routes.ts` — bảng `discussion_threads`, `discussion_posts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: `Promise<DiscussionThread[]>`.
   */
  getSessionDiscussions: (sessionId: string) =>
    httpRequest<DiscussionThread[]>(
      `/sessions/${encodeURIComponent(sessionId)}/discussions`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Tạo một câu hỏi thảo luận mới gắn vào mốc thời gian video cụ thể của buổi học (Backend có thể sinh kèm gợi ý trả lời từ AI).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `SessionVideoRoomView.tsx`, `LivestreamClassView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/sessions/:sessionId/discussions` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `contentMd`, `videoTimestampSec`, `title?`; Output: `threadId`, `status` và object `thread`.
   */
  createSessionQuestion: (
    sessionId: string,
    contentMd: string,
    videoTimestampSec: number,
    title?: string
  ) =>
    httpRequest<{
      threadId: string;
      status: string;
      videoTimestampSec: number;
      thread?: DiscussionThread;
    }>(`/sessions/${encodeURIComponent(sessionId)}/discussions`, {
      method: 'POST',
      body: JSON.stringify({ title, contentMd, videoTimestampSec }),
    }),

  /**
   * **Mục tiêu:** Lấy lịch sử tin nhắn trò chuyện trực tiếp của phòng học Live.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi tới: `GET /api/v1/sessions/:sessionId/chat-messages` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: `Promise<LiveSessionChatMessage[]>`.
   */
  getLiveSessionChat: (sessionId: string) =>
    httpRequest<LiveSessionChatMessage[]>(
      `/sessions/${encodeURIComponent(sessionId)}/chat-messages`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Gửi một tin nhắn mới vào kênh chat trực tiếp của phòng học Live (Backend lưu DB và broadcast qua SSE tới mọi học viên trong phòng).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/sessions/:sessionId/chat-messages` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `text`; Output: Bản ghi `LiveSessionChatMessage` vừa tạo.
   */
  sendLiveSessionChat: (sessionId: string, text: string) =>
    httpRequest<LiveSessionChatMessage>(
      `/sessions/${encodeURIComponent(sessionId)}/chat-messages`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    ),

  /**
   * **Mục tiêu:** Xác thực quyền vào lớp trực tuyến và tải toàn bộ cấu hình phòng học Live (bao gồm LiveKit SFU JWT token, serverUrl, danh sách thành viên, trạng thái giơ tay/ghi hình/slide và chat).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `GET /api/v1/live/sessions/:sessionId` (`apps/api/src/modules/learning/learning.routes.ts` -> gọi `createLiveKitToken` tại `apps/api/src/integrations/livekit.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: `Promise<LiveSessionRoomPayload>`.
   */
  getLiveSessionRoom: (sessionId: string) =>
    httpRequest<LiveSessionRoomPayload>(
      `/live/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Xây dựng đường dẫn kết nối Server-Sent Events (SSE) để nhận sự kiện thời gian thực trong phòng Live (chat, giơ tay, cảm xúc, mute/kick, đổi slide, tín hiệu WebRTC).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx` (truyền thẳng vào `new EventSource(url)`).
   *   - Gọi tới: `GET /api/v1/live/sessions/:sessionId/events?token=<jwt>` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `sessionId`.
   *   - Output: Chuỗi URL hoàn chỉnh đã đính kèm query param `token` (vì API `EventSource` chuẩn của trình duyệt không cho phép gắn custom header `Authorization`).
   */
  getLiveEventsUrl: (sessionId: string): string => {
    // Bước 1: Lấy Access Token hiện hành từ `apiClient` để xác thực kết nối SSE
    const token = getAuthAccessToken();
    // Bước 2: Ghép đường dẫn SSE chuẩn hóa theo `API_CONFIG.BASE_URL`
    const base = `${API_CONFIG.BASE_URL}/live/sessions/${encodeURIComponent(sessionId)}/events`;
    // Bước 3: Gắn `token` lên query string nếu có (tránh lỗi 401 khi trình duyệt mở `EventSource` khác origin)
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  },

  /**
   * **Mục tiêu:** Bật hoặc tắt trạng thái giơ tay phát biểu của người dùng trong phòng học trực tuyến.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/live/sessions/:sessionId/hand-raise` (`apps/api/src/modules/learning/learning.routes.ts` -> broadcast SSE).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `raised: boolean`; Output: Danh sách `raisedHands` mới nhất.
   */
  setLiveHandRaise: (sessionId: string, raised: boolean) =>
    httpRequest<{ raised: boolean; raisedHands: LiveHandRaiseItem[] }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/hand-raise`,
      {
        method: 'POST',
        body: JSON.stringify({ raised }),
      }
    ),

  /**
   * **Mục tiêu:** Thả biểu tượng cảm xúc tương tác nhanh (Reaction) hiển thị nổi trên màn hình toàn bộ lớp học Live.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/live/sessions/:sessionId/reactions` (`apps/api/src/modules/learning/learning.routes.ts` -> broadcast SSE).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `label` (vd `'👏 Vỗ tay'`); Output: `{ reaction }`.
   */
  sendLiveReaction: (sessionId: string, label: string) =>
    httpRequest<{ reaction: LiveReactionPayload }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ label }),
      }
    ),

  /**
   * **Mục tiêu:** Bình chọn tăng độ ưu tiên (Upvote) cho một câu hỏi Q&A trong phòng học trực tuyến để giảng viên giải đáp trước.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/live/discussions/:threadId/upvote` (`apps/api/src/modules/learning/learning.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `threadId`; Output: `{ threadId, votes }`.
   */
  upvoteLiveDiscussion: (threadId: string) =>
    httpRequest<{ threadId: string; votes: number }>(
      `/live/discussions/${encodeURIComponent(threadId)}/upvote`,
      {
        method: 'POST',
      }
    ),

  /**
   * **Mục tiêu:** Chuyển tiếp tín hiệu báo hiệu WebRTC P2P (`offer`, `answer`, `ice-candidate`, `request-offer`, `media-stopped`) qua server làm kênh dự phòng khi LiveKit SFU chưa được cấu hình.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/live/sessions/:sessionId/rtc-signal` (`apps/api/src/modules/learning/learning.routes.ts` -> `relayWebRtcSignal`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload` (gồm `signalType`, `targetAccountId?`, `sdp?`, `candidate?`); Output: `{ relayed: boolean }`.
   */
  sendLiveRtcSignal: (
    sessionId: string,
    payload: {
      targetAccountId?: string;
      signalType: 'offer' | 'answer' | 'ice-candidate' | 'request-offer' | 'media-stopped';
      sdp?: unknown;
      candidate?: unknown;
    }
  ) =>
    httpRequest<{ relayed: boolean }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/rtc-signal`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  /**
   * **Mục tiêu:** Đồng bộ trạng thái thiết bị của Giảng viên (cam/mic/chia sẻ màn hình) và phát khung hình/đoạn âm thanh dự phòng tới học viên trong phòng Live.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx` (chỉ phía Host).
   *   - Gọi tới: `POST /api/v1/live/sessions/:sessionId/media-sync` (`apps/api/src/modules/learning/learning.routes.ts` -> `updateHostMediaState` / `relayLiveAudioChunk`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload` trạng thái thiết bị và dữ liệu media; Output: `{ synced, hostMedia }`.
   */
  syncLiveHostMedia: (
    sessionId: string,
    payload: {
      camOn?: boolean;
      micOn?: boolean;
      screenSharing?: boolean;
      mirrorCam?: boolean;
      cameraFrameDataUrl?: string;
      screenFrameDataUrl?: string;
      audioChunkBase64?: string;
      audioMimeType?: string;
      audioSeq?: number;
    }
  ) =>
    httpRequest<{ synced: boolean; hostMedia?: LiveHostMediaState }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/media-sync`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  /**
   * **Mục tiêu:** Xác thực mã mời dùng một lần (One-time Guest Speaker Token) cho diễn giả khách mời bên ngoài vào phòng học Live mà không cần tài khoản cố định, đồng thời cấp LiveKit token tương ứng.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx` (khi truy cập qua URL mời diễn giả do `teachApi.createGuestSpeakerLink` tạo).
   *   - Gọi tới: `POST /api/v1/live/guest/verify` (`apps/api/src/modules/learning/learning.routes.ts` -> `createGuestSpeakerToken` ở `livekit.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `token`, `sessionId?`, `guestDisplayName?`, `guestRoleHeadline?`; Output: Thông tin phòng học và cấu hình kết nối `livekit`.
   */
  verifyGuestSpeakerToken: (
    token: string,
    sessionId?: string,
    guestDisplayName?: string,
    guestRoleHeadline?: string
  ) =>
    httpRequest<{
      valid: boolean;
      sessionId: string;
      cohortId?: string;
      cohortName?: string;
      cohortCode?: string;
      sessionTitle: string;
      hostInstructorName: string;
      guestRoleLabel: string;
      livekit?: {
        roomName: string;
        token: string;
        serverUrl: string;
        enabled: boolean;
      };
    }>('/live/guest/verify', {
      method: 'POST',
      body: JSON.stringify({ token, sessionId, guestDisplayName, guestRoleHeadline }),
    }),
};

/** Alias tương thích ngược cho `learningApi`. */
export const studentLearningApi = learningApi;
