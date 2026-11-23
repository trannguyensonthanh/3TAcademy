/**
 * ============================================================================
 * FILE: assessment.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Đánh giá Năng lực, IRT & Giám sát thi AI Proctoring
 * ============================================================================
 * Vai trò:
 *   - Quản lý trọn vẹn vòng đời một bài kiểm tra (Quiz cuối buổi & Kỳ thi tốt nghiệp cuối khóa):
 *     tải đề thi an toàn đã loại bỏ đáp án, mở lượt làm bài (`attempt`), nộp bài chấm tự động,
 *     xem kết quả & giải thích ôn tập, báo cáo vi phạm Edge Proctoring và gửi khung hình Webcam
 *     phân tích giám sát thi 2 tầng (Computer Vision + VLM).
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `AssessmentRoomView.tsx`, `ProctoredExamRoomView.tsx`,
 *     `AssessmentResultView.tsx`, `CohortWorkspaceView.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/assessment/assessment.routes.ts`, kết hợp:
 *     + Mô hình cập nhật độ thành thạo kỹ năng lũy tiến theo chuẩn IRT:
 *       `computeProgressiveSkillMastery` trong `apps/api/src/modules/assessment/skillMasteryModel.ts`
 *       (lưu vào bảng `student_skill_states`).
 *     + Tự động cấp Chứng chỉ số ký `HMAC-SHA256` vào bảng `certificates` khi đậu Kỳ thi cuối khóa
 *       và không bị cờ vi phạm giám sát (`CLEAN`).
 *   - Kết nối tầng AI Service: Endpoint `POST /assessments/:assessmentId/proctoring-snapshot`
 *     được Backend chuyển tiếp sang `POST /api/v1/ai/proctoring/analyze-frame` tại
 *     `apps/ai-service/src/api/routes/proctoring_ai.py` (Tier 1: MediaPipe/YuNet + SolvePnP góc đầu
 *     + YOLOv8n ONNX nhận diện điện thoại/vật cấm; Tier 2: Gemini Vision VLM leo thang kiểm chứng).
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import {
  StudentSafePromptConfigItem,
  StoredMcqAttemptResult,
  AssessmentPublishStatus,
  McqQuestionItem,
} from '../types/domain';

export type {
  StudentSafePromptConfigItem,
  StoredMcqAttemptResult,
  AssessmentPublishStatus,
  McqQuestionItem,
};

/**
 * Gói dữ liệu đề thi trả cho học viên: hoàn toàn KHÔNG chứa đáp án đúng (`correctIndex`)
 * để chống gian lận qua DevTools/Network Inspector.
 */
export interface StudentAssessmentPayload {
  assessmentId: string;
  cohortId?: string;
  sessionId?: string;
  isFinalExam: boolean;
  status?: AssessmentPublishStatus;
  title: string;
  questionCount: number;
  timeLimitMinutes: number;
  isRetakeLocked: boolean;
  hasPassedFinalExam?: boolean;
  promptConfig: StudentSafePromptConfigItem[];
}

/** Kết quả bài thi kèm siêu dữ liệu lớp học, danh sách câu hỏi có đáp án giải thích và khuyến nghị ôn tập. */
export interface AssessmentResultWithMeta extends StoredMcqAttemptResult {
  cohortId?: string;
  sessionId?: string;
  finalExamId?: string;
  hasStoredAttempt?: boolean;
  hasPassedFinalExam?: boolean;
  questionsWithExplanations?: McqQuestionItem[];
  submission?: StoredMcqAttemptResult;
}

export const assessmentApi = {
  /**
   * **Mục tiêu:** Tải đề kiểm tra/đề thi cuối khóa đã được làm sạch đáp án cho học viên làm bài.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AssessmentRoomView.tsx`, `ProctoredExamRoomView.tsx`.
   *   - Gọi tới: `GET /api/v1/assessments/:assessmentId` (`apps/api/src/modules/assessment/assessment.routes.ts`).
   *   - Backend kiểm tra quyền ghi danh, chặn đề đang ở trạng thái `DRAFT` (`403 ASSESSMENT_DRAFT_LOCKED`),
   *     và bắt buộc hoàn thành 100% các buổi học trước khi cho vào Kỳ thi cuối khóa (`403 FINAL_EXAM_PREREQUISITES_INCOMPLETE`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `assessmentId`; Output: `Promise<StudentAssessmentPayload>`.
   */
  getAssessmentForStudent: (assessmentId: string) =>
    httpRequest<StudentAssessmentPayload>(
      `/assessments/${encodeURIComponent(assessmentId)}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Khởi tạo (hoặc nối tiếp) một lượt làm bài đang mở (`assessment_attempts`) để bắt đầu bấm giờ và làm neo gắn các sự kiện giám sát Proctoring.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AssessmentRoomView.tsx`, `ProctoredExamRoomView.tsx`.
   *   - Gọi tới: `POST /api/v1/assessments/:assessmentId/start` (`apps/api/src/modules/assessment/assessment.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `assessmentId`; Output: `{ attemptId, assessmentId, attemptNumber, startedAt }`.
   */
  startAssessmentAttempt: (assessmentId: string) =>
    httpRequest<{
      attemptId: string;
      assessmentId: string;
      attemptNumber: number;
      startedAt: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/start`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Nộp bài trắc nghiệm lên server để chấm điểm, cập nhật năng lực kỹ năng theo mô hình IRT và xét cấp Chứng chỉ số tự động.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AssessmentRoomView.tsx`, `ProctoredExamRoomView.tsx`.
   *   - Gọi tới: `POST /api/v1/assessments/:assessmentId/submit` (`apps/api/src/modules/assessment/assessment.routes.ts` -> `gradeAndRecordAssessmentSubmission`).
   *   - Trong 1 ACID transaction, Backend: (1) chấm từng câu và lưu `submission_answers`; (2) gọi `computeProgressiveSkillMastery`
   *     (`apps/api/src/modules/assessment/skillMasteryModel.ts`) cập nhật `student_skill_states`; (3) tạm giữ `isPassed = false`
   *     nếu kỳ thi cuối khóa bị gắn cờ gian lận `FLAGGED`/`CONFIRMED_CHEAT`; (4) nếu đạt `FINAL_EXAM`, tự động ký số `HMAC-SHA256`
   *     và cấp bản ghi vào bảng `certificates`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `assessmentId`, `answers` (bản đồ `{ số_thứ_tự_câu: chỉ_số_đáp_án }`), `telemetryLog?` (nhật ký hành vi làm bài).
   *   - Output: Kết quả chi tiết `StoredMcqAttemptResult` kèm `issuedCertificateCode` (nếu đủ điều kiện tốt nghiệp) và `updatedSkills`.
   */
  submitAssessmentAttempt: (
    assessmentId: string,
    answers: Record<number, number>,
    telemetryLog?: unknown
  ) =>
    httpRequest<
      StoredMcqAttemptResult & {
        bonusInterviewCreditsAdded?: number;
        updatedInterviewCredits?: number;
        issuedCertificateCode?: string;
      }
    >(
      `/assessments/${encodeURIComponent(assessmentId)}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers, telemetryLog }),
      }
    ),

  /**
   * **Mục tiêu:** Xem lại kết quả lượt làm bài mới nhất của học viên kèm đáp án đúng, giải thích chi tiết và mốc thời gian video cần ôn lại cho các câu làm sai.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AssessmentResultView.tsx`, `CohortWorkspaceView.tsx`.
   *   - Gọi tới: `GET /api/v1/assessments/:assessmentId/result` (`apps/api/src/modules/assessment/assessment.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `assessmentId`; Output: `Promise<AssessmentResultWithMeta>`.
   */
  getAssessmentResult: (assessmentId: string) =>
    httpRequest<AssessmentResultWithMeta>(
      `/assessments/${encodeURIComponent(assessmentId)}/result`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Ghi nhận sự kiện giám sát thi từ trình duyệt phía client (Edge Proctoring: chuyển tab `TAB_HIDDEN`, thoát toàn màn hình `FULLSCREEN_EXIT`, mất khuôn mặt...).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `ProctoredExamRoomView.tsx`.
   *   - Gọi tới: `POST /api/v1/assessments/:assessmentId/proctoring-events` (`apps/api/src/modules/assessment/assessment.routes.ts`).
   *   - Backend phân loại sự kiện qua `classifyIncomingProctoringEvent` (bỏ qua nhịp tim bình thường, cộng `riskDelta` vào `assessment_attempts.totalRiskScore`
   *     và tự chuyển `integrityStatus = 'FLAGGED'` khi tổng điểm rủi ro >= 60 để chờ Giảng viên hậu kiểm).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `assessmentId`, `eventType`, `snapshotNote?`; Output: Trạng thái ghi nhận `recorded` và mốc thời gian `timestamp`.
   */
  reportProctoringEvent: (
    assessmentId: string,
    eventType: string,
    snapshotNote?: string
  ) =>
    httpRequest<{
      assessmentId: string;
      recorded: boolean;
      eventType: string;
      timestamp: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/proctoring-events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, snapshotNote }),
    }),

  /**
   * **Mục tiêu:** Gửi ảnh chụp khung hình Webcam (Base64) định kỳ trong phòng thi cuối khóa để phân tích hành vi gian lận bằng thị giác máy tính (CV) 2 tầng.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `ProctoredExamRoomView.tsx`.
   *   - Gọi tới: `POST /api/v1/assessments/:assessmentId/proctoring-snapshot` (`apps/api/src/modules/assessment/assessment.routes.ts`)
   *     -> Backend chuyển tiếp sang AI Service `POST /api/v1/ai/proctoring/analyze-frame` (`apps/ai-service/src/api/routes/proctoring_ai.py`)
   *     với cờ `escalateVlm: true`:
   *     + Tier 1: Đếm số khuôn mặt (MediaPipe/YuNet), ước lượng tư thế đầu 3 trục `yawDeg`/`pitchDeg`/`rollDeg` (SolvePnP), phát hiện điện thoại/tài liệu cấm (YOLOv8n ONNX).
   *     + Tier 2: Leo thang sang mô hình VLM (Gemini Vision) khi Tier 1 phát hiện bất thường.
   *     + Nếu AI Service offline ở môi trường dev độc lập, Backend trả fallback `CAMERA_NORMAL` để không phạt oan học viên; nếu có vi phạm thật, lưu vào `proctoring_events` và cộng `totalRiskScore`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `assessmentId`, `imageBase64` (ảnh JPEG/PNG từ canvas webcam), `videoOffsetSec?`.
   *   - Output: Trạng thái cảnh báo `NORMAL | WARNING | ALERT`, `eventType`, `faceCount`, `headPose`, `prohibitedObjects`, `riskDelta`, `latencyMs`.
   */
  analyzeProctoringSnapshot: (
    assessmentId: string,
    imageBase64: string,
    videoOffsetSec?: number
  ) =>
    httpRequest<{
      assessmentId: string;
      recorded: boolean;
      detectorTier1?: string;
      yoloObjectDetectorActive?: boolean;
      state: 'NORMAL' | 'WARNING' | 'ALERT';
      eventType: string;
      confidence: number;
      riskDelta: number;
      message: string;
      faceCount: number;
      headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
      prohibitedObjects: Array<{ label?: string; confidence?: number }>;
      latencyMs?: number;
      timestamp: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/proctoring-snapshot`, {
      method: 'POST',
      body: JSON.stringify({ imageBase64, videoOffsetSec, escalateVlm: true }),
    }),
};
