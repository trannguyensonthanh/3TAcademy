/**
 * ============================================================================
 * FILE: teach.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Cổng Giảng dạy (Instructor Portal)
 * ============================================================================
 * Vai trò:
 *   - Cung cấp toàn bộ API đặc quyền cho vai trò Giảng viên (`INSTRUCTOR`) và Quản trị viên (`ADMIN`):
 *     1. Quản lý lịch dạy, danh sách đợt học phụ trách, chi tiết lớp & chi tiết từng buổi học.
 *     2. Biên tập tài liệu, tóm tắt bài giảng AI, cập nhật trạng thái phát trực tiếp (`LIVE` / `REPLAY_READY`).
 *     3. Điều phối phòng học LiveKit SFU (tắt mic học viên, mời ra khỏi phòng, tạo link Diễn giả khách mời)
 *        và quản lý ghi hình buổi học lên Cloudflare R2 (LiveKit Egress hoặc Browser Upload).
 *     4. Soạn & công bố đề kiểm tra — bao gồm tính năng gọi AI tự động sinh đề trắc nghiệm nháp từ transcript.
 *     5. Xác thực hỏi đáp Q&A, hậu kiểm ca thi bị AI Proctoring gắn cờ và gửi lời nhắc học cá nhân hóa bằng AI.
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `InstructorPortalView.tsx`, `LivestreamClassView.tsx`, `AcademyContext.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/teach/teach.routes.ts`
 *     (được bảo vệ bởi `requireAuth` + `requireRole(['INSTRUCTOR', 'ADMIN'])`;
 *     phối hợp `livekit.service.ts`, `r2.service.ts`, `liveRoom.helpers.ts`, `skillMasteryModel.ts`).
 *   - Kết nối tầng AI Service: Endpoint `POST /teach/sessions/:sessionId/generate-quiz` gọi qua
 *     `aiServiceClient.generateQuizDraft` tới `POST /api/v1/ai/assessments/generate-quiz`
 *     (định nghĩa tại `apps/ai-service/src/api/routes/grading_ai.py`, route `/generate-quiz`).
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import {
  Cohort,
  ClassSession,
  DiscussionThread,
  CohortMaterial,
  Enrollment,
  ChatMessage,
  Notification,
  McqQuestionItem,
  AssessmentPublishStatus,
} from '../types/domain';

export type { McqQuestionItem, AssessmentPublishStatus };

/** Tùy chọn kỹ năng thuộc khóa học để giảng viên gắn thẻ cho từng câu hỏi trắc nghiệm phục vụ mô hình IRT. */
export interface CourseSkillOption {
  id: string;
  code: string;
  name: string;
  role?: string;
}

/** Bản ghi ca thi cuối khóa bị hệ thống AI Proctoring gắn cờ bất thường, chờ Giảng viên xem xét hậu kiểm. */
export interface ExamCameraReviewItem {
  id: string;
  studentName: string;
  studentEmail?: string;
  cohortCode: string;
  examTitle?: string;
  mcqScore: string;
  submittedAt?: string;
  cameraFlagReason: string;
  cameraTimestamp: string;
  snapshotNote: string;
  decision: 'PENDING' | 'APPROVED' | 'RETAKE_REQUIRED';
}

export const teachApi = {
  /**
   * **Mục tiêu:** Tải toàn bộ bảng điều phối giảng dạy của giảng viên: buổi đang Live, lịch dạy sắp tới, hàng chờ hậu kiểm Proctoring, danh sách ghi danh học viên (kèm điểm rủi ro bỏ học), thảo luận và tài liệu.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/teach/schedule` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: Gói dữ liệu tổng hợp lịch dạy và danh sách cần xử lý của giảng viên.
   */
  getInstructorSchedule: () =>
    httpRequest<{
      liveSession: ClassSession | null;
      upcomingSessions: ClassSession[];
      allSessions: ClassSession[];
      examReviews: ExamCameraReviewItem[];
      enrollments: Enrollment[];
      chatMessages: ChatMessage[];
      notifications: Notification[];
      discussions: DiscussionThread[];
      materials: CohortMaterial[];
    }>('/teach/schedule', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy danh sách các đợt học (cohorts) thuộc quyền phụ trách của giảng viên hiện tại (hoặc toàn bộ nếu là ADMIN).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `GET /api/v1/teach/cohorts` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<Cohort[]>`.
   */
  getInstructorCohorts: () =>
    httpRequest<Cohort[]>('/teach/cohorts', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Xem chi tiết một đợt học dưới góc nhìn giảng viên: toàn bộ buổi học, đề Kỳ thi cuối khóa (bao gồm đáp án đúng), danh mục kỹ năng khóa học, danh sách học viên, thảo luận và tài liệu.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `GET /api/v1/teach/cohorts/:cohortId` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `cohortId`; Output: Chi tiết đợt học, bộ câu hỏi Final Exam và tài nguyên liên quan.
   */
  getInstructorCohortDetail: (cohortId: string) =>
    httpRequest<{
      cohort: Cohort;
      sessions: ClassSession[];
      finalExamAssessmentId?: string;
      finalExamQuestions: McqQuestionItem[];
      finalExamPublishStatus?: AssessmentPublishStatus;
      courseSkills?: CourseSkillOption[];
      enrollments?: Enrollment[];
      discussions?: DiscussionThread[];
      materials?: CohortMaterial[];
    }>(`/teach/cohorts/${encodeURIComponent(cohortId)}`, {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy chi tiết một buổi học cho giảng viên biên soạn: video phát lại, bộ câu hỏi Quiz cuối buổi kèm đáp án/giải thích, trạng thái xuất bản, tài liệu và thảo luận.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `GET /api/v1/teach/cohorts/:cohortId/sessions/:sessionId` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `cohortId`, `sessionId`; Output: Thông tin buổi học và ngân hàng câu hỏi của buổi.
   */
  getInstructorSessionDetail: (cohortId: string, sessionId: string) =>
    httpRequest<{
      session: ClassSession;
      videoUrl?: string;
      playbackType?: 'MP4' | 'HLS' | 'NONE';
      assessmentId?: string;
      questions: McqQuestionItem[];
      publishStatus: AssessmentPublishStatus;
      courseSkills?: CourseSkillOption[];
      materials?: CohortMaterial[];
      discussions?: DiscussionThread[];
    }>(
      `/teach/cohorts/${encodeURIComponent(cohortId)}/sessions/${encodeURIComponent(
        sessionId
      )}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Cập nhật nhanh nội dung tóm tắt Markdown (`aiSummaryMd`) của một buổi học (đồng thời Backend re-index embedding vào `knowledge_chunks` cho Trợ giảng AI RAG).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `PUT /api/v1/teach/sessions/:sessionId/materials` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `aiSummaryMd`; Output: Trạng thái cập nhật và bản ghi buổi học mới nhất.
   */
  updateSessionSummary: (sessionId: string, aiSummaryMd: string) =>
    httpRequest<{
      sessionId: string;
      updated: boolean;
      updatedAt: string;
      videoUrl?: string;
      session?: ClassSession;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/materials`, {
      method: 'PUT',
      body: JSON.stringify({ aiSummaryMd }),
    }),

  /**
   * **Mục tiêu:** Cập nhật toàn diện siêu dữ liệu buổi học (tiêu đề, tóm tắt, giờ học, nguồn video R2, trạng thái) và/hoặc đính kèm thêm tài liệu mới (Slide, PDF, GitHub Repo, Notebook).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `PUT /api/v1/teach/sessions/:sessionId/materials` (`apps/api/src/modules/teach/teach.routes.ts` — cập nhật `class_sessions`, `session_attachments` và `knowledge_chunks`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload` các trường cần sửa/thêm; Output: Bản ghi buổi học và tài liệu vừa tạo.
   */
  updateSessionMaterials: (
    sessionId: string,
    payload: {
      title?: string;
      aiSummaryMd?: string;
      scheduledStart?: string;
      videoR2Key?: string;
      status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      durationSeconds?: number;
      cohortId?: string;
      sessionOrder?: number;
      materialTitle?: string;
      materialUrl?: string;
      fileType?: 'VIDEO' | 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK';
    }
  ) =>
    httpRequest<{
      sessionId: string;
      updated: boolean;
      updatedAt: string;
      videoUrl?: string;
      playbackType?: 'MP4' | 'HLS' | 'NONE';
      session?: ClassSession;
      material?: CohortMaterial;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/materials`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Chuyển trạng thái phát sóng buổi học (`SCHEDULED` -> `LIVE` -> `REPLAY_READY`), gắn link video replay R2 hoặc cập nhật slide/ghi chú đang giảng để đồng bộ ngay qua SSE tới toàn bộ học viên.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`, `LivestreamClassView.tsx`.
   *   - Gọi tới: `PUT /api/v1/teach/sessions/:sessionId/live-status` (`apps/api/src/modules/teach/teach.routes.ts` -> `updateHostBroadcastState` & `broadcastLiveRoomEvent`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload`; Output: Trạng thái mới, URL phát video và `hostBroadcast`.
   */
  updateSessionLiveStatus: (
    sessionId: string,
    payload: {
      status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      videoR2Key?: string;
      activeSlideLabel?: string;
      liveTopicNote?: string;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      videoUrl: string;
      playbackType: 'MP4' | 'HLS' | 'NONE';
      hostBroadcast: {
        activeSlideLabel: string;
        liveTopicNote: string;
        updatedAt: string;
      };
      updatedAt: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/live-status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Điều khiển tắt/mở micro của một học viên cụ thể hoặc tắt mic toàn bộ học viên (`muteAllStudents`) ngay trên máy chủ LiveKit SFU và đồng bộ trạng thái qua SSE.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/mute-participant` (`apps/api/src/modules/teach/teach.routes.ts` -> `muteLiveKitParticipantsAudio` ở `livekit.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload`; Output: Danh sách `mutedIdentities` và số track đã tắt trên SFU (`sfuMutedTracks`).
   */
  muteSessionParticipant: (
    sessionId: string,
    payload: {
      targetIdentity?: string;
      accountId?: string;
      muteAllStudents?: boolean;
      muted?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      muted: boolean;
      muteAllStudents: boolean;
      mutedIdentities: string[];
      sfuMutedTracks: number;
      sfuSynced: boolean;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/mute-participant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Mời (hoặc gỡ chặn) một người tham gia ra khỏi phòng học trực tuyến trên cả LiveKit SFU lẫn luồng sự kiện SSE.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/kick-participant` (`apps/api/src/modules/teach/teach.routes.ts` -> `kickLiveKitParticipant` ở `livekit.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload`; Output: Danh sách `kickedIdentities` và cờ `sfuRemoved`.
   */
  kickSessionParticipant: (
    sessionId: string,
    payload: {
      targetIdentity?: string;
      accountId?: string;
      kicked?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      kicked: boolean;
      targetIdentity: string;
      kickedIdentities: string[];
      sfuRemoved: boolean;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/kick-participant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Khởi động ghi hình buổi học trực tuyến: ưu tiên LiveKit Egress xuất thẳng MP4 sang Cloudflare R2, hoặc trả về `presignedUploadUrl` cho chế độ ghi hình phía trình duyệt (`BROWSER_R2`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/recording/start` (`apps/api/src/modules/teach/teach.routes.ts` -> `startLiveKitRoomRecordingToR2` & `createR2PresignedPutUrl`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: Trạng thái `recording` (`mode`, `egressId`, `objectKey`) và `presignedUploadUrl?`.
   */
  startSessionRecording: (sessionId: string) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      recording: {
        isRecording: boolean;
        egressId?: string;
        objectKey?: string;
        publicUrl?: string;
        mode?: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
        startedAt?: string;
      };
      presignedUploadUrl?: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/start`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Dừng tiến trình ghi hình buổi học, gắn tệp video R2 vào buổi học và (nếu `markReplayReady: true`) mở ngay trạng thái Xem lại (`REPLAY_READY`) cho học viên.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/recording/stop` (`apps/api/src/modules/teach/teach.routes.ts` -> `stopLiveKitRoomRecording`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload?` (`objectKey`, `markReplayReady`); Output: Trạng thái buổi học và `videoUrl` / `r2PublicUrl`.
   */
  stopSessionRecording: (
    sessionId: string,
    payload?: { objectKey?: string; markReplayReady?: boolean }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      recording: {
        isRecording: boolean;
        egressId?: string;
        objectKey?: string;
        publicUrl?: string;
        stoppedAt?: string;
      };
      videoUrl: string;
      playbackType: 'MP4' | 'HLS' | 'NONE';
      r2PublicUrl: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/stop`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  /**
   * **Mục tiêu:** Tải dữ liệu bản ghi video (mã hóa Base64 từ trình duyệt) qua Backend để đẩy lên kho lưu trữ đối tượng Cloudflare R2 trong trường hợp không upload trực tiếp bằng Presigned URL.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `LivestreamClassView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/recording/upload` (`apps/api/src/modules/teach/teach.routes.ts` -> `uploadBufferToR2` ở `r2.service.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`, `payload` (`base64Data`, `fileName?`, `contentType?`, `markReplayReady?`); Output: `objectKey`, `videoUrl`, `sizeBytes`.
   */
  uploadSessionRecordingToR2: (
    sessionId: string,
    payload: {
      fileName?: string;
      contentType?: string;
      base64Data: string;
      markReplayReady?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      objectKey: string;
      videoUrl: string;
      sizeBytes: number;
      recording: {
        isRecording: boolean;
        objectKey?: string;
        publicUrl?: string;
        stoppedAt?: string;
      };
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/upload`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Kích hoạt AI tự động biên soạn bộ câu hỏi trắc nghiệm nháp (`DRAFT`) dựa trên transcript, tóm tắt và danh sách kỹ năng của buổi học.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/generate-quiz` (`apps/api/src/modules/teach/teach.routes.ts`)
   *     -> Backend gọi `aiServiceClient.generateQuizDraft` -> `POST /api/v1/ai/assessments/generate-quiz` tại
   *     `apps/ai-service/src/api/routes/grading_ai.py` (tạo câu hỏi có 4 phương án, đáp án đúng, giải thích Markdown và gắn `skillId`), sau đó lưu vào bảng `assessments` & `assessment_items`.
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: `{ assessmentId, sessionId, status, items }`.
   */
  generateSessionQuizByAi: (sessionId: string) =>
    httpRequest<{
      assessmentId: string;
      sessionId: string;
      status: AssessmentPublishStatus;
      items: McqQuestionItem[];
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/generate-quiz`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Lưu chỉnh sửa ngân hàng câu hỏi và chuyển trạng thái bài kiểm tra/đề thi cuối khóa (mặc định sang `PUBLISHED`) để mở cho học viên làm bài.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `PUT /api/v1/teach/assessments/:assessmentId/publish` (`apps/api/src/modules/teach/teach.routes.ts` — cập nhật `assessments` và `assessment_items`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `assessmentId`, `items: McqQuestionItem[]`, `status` (mặc định `'PUBLISHED'`); Output: Số câu đã công bố `publishedCount` và `publishedAt`.
   */
  publishAssessment: (
    assessmentId: string,
    items: McqQuestionItem[],
    status: AssessmentPublishStatus = 'PUBLISHED'
  ) =>
    httpRequest<{
      assessmentId: string;
      status: AssessmentPublishStatus;
      publishedCount: number;
      publishedAt: string;
    }>(`/teach/assessments/${encodeURIComponent(assessmentId)}/publish`, {
      method: 'PUT',
      body: JSON.stringify({ status, items }),
    }),

  /**
   * **Mục tiêu:** Tạo đường dẫn mời Diễn giả khách mời (One-time Guest Speaker Link) có chữ ký JWT giới hạn thời gian để chuyên gia bên ngoài vào giảng cùng trong phòng Live.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/sessions/:sessionId/guest-link` (`apps/api/src/modules/teach/teach.routes.ts` — liên kết chéo với `learningApi.verifyGuestSpeakerToken`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `sessionId`; Output: `{ sessionId, oneTimeGuestUrl, expiresInHours }`.
   */
  createGuestSpeakerLink: (sessionId: string) =>
    httpRequest<{
      sessionId: string;
      oneTimeGuestUrl: string;
      expiresInHours: number;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/guest-link`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Đăng phản hồi chuyên môn chính thức của giảng viên vào một chủ đề hỏi đáp và tự động gắn dấu xác thực (`verifiedByStaff: true`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/discussions/:threadId/reply` (`apps/api/src/modules/teach/teach.routes.ts` — bảng `discussion_posts`, `discussion_threads`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `threadId`, `content`; Output: Trạng thái xác thực và chủ đề cập nhật.
   */
  replyAndVerifyDiscussion: (threadId: string, content: string) =>
    httpRequest<{
      threadId: string;
      verifiedByStaff: boolean;
      repliedAt: string;
      thread?: DiscussionThread;
    }>(`/teach/discussions/${encodeURIComponent(threadId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  /**
   * **Mục tiêu:** Bật hoặc tắt trạng thái xác thực chuyên môn (Verify/Resolve) cho một luồng hỏi đáp (thường dùng khi giảng viên duyệt câu trả lời gợi ý từ AI Tutor là chính xác).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `PATCH /api/v1/teach/discussions/:threadId/verify` (`apps/api/src/modules/teach/teach.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `threadId`, `verified` (mặc định `true`); Output: `{ threadId, verifiedByStaff, isResolved, updatedAt }`.
   */
  verifyDiscussionThread: (threadId: string, verified = true) =>
    httpRequest<{
      threadId: string;
      verifiedByStaff: boolean;
      isResolved: boolean;
      updatedAt: string;
    }>(`/teach/discussions/${encodeURIComponent(threadId)}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ verified }),
    }),

  /**
   * **Mục tiêu:** Ra quyết định hậu kiểm đối với ca thi cuối khóa bị hệ thống AI Proctoring gắn cờ (`APPROVED`: phê duyệt kết quả thi & mở quyền cấp chứng chỉ; `RETAKE_REQUIRED`: hủy kết quả và yêu cầu học viên thi lại).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `PUT /api/v1/teach/exam-reviews/:reviewId` (`apps/api/src/modules/teach/teach.routes.ts` — cập nhật `assessment_attempts.integrityStatus`, `enrollments`, `certificates` và gửi `notifications`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `reviewId`, `decision: 'APPROVED' | 'RETAKE_REQUIRED'`; Output: `{ reviewId, decision, updatedAt }`.
   */
  reviewExamProctoring: (
    reviewId: string,
    decision: 'APPROVED' | 'RETAKE_REQUIRED'
  ) =>
    httpRequest<{
      reviewId: string;
      decision: 'APPROVED' | 'RETAKE_REQUIRED';
      updatedAt: string;
    }>(`/teach/exam-reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PUT',
      body: JSON.stringify({ decision }),
    }),

  /**
   * **Mục tiêu:** Gửi thông báo nhắc học cá nhân hóa (`AI_STUDY_REMINDER`) tới học viên đang chậm tiến độ hoặc có mức rủi ro bỏ học cao (`dropoutRiskScore`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `InstructorPortalView.tsx`.
   *   - Gọi tới: `POST /api/v1/teach/enrollments/:enrollmentId/ai-reminder` (`apps/api/src/modules/teach/teach.routes.ts` — ghi vào `notifications` và cập nhật `enrollments.lastRemindedAt`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `enrollmentId`; Output: Thông tin thông báo vừa tạo (`notificationId`, `type`, `title`, `createdAt`).
   */
  sendAiPersonalizedReminder: (enrollmentId: string) =>
    httpRequest<{
      notificationId: string;
      enrollmentId: string;
      type: 'AI_STUDY_REMINDER';
      title: string;
      createdAt: string;
    }>(`/teach/enrollments/${encodeURIComponent(enrollmentId)}/ai-reminder`, {
      method: 'POST',
    }),
};
