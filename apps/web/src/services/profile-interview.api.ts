/**
 * ============================================================================
 * FILE: profile-interview.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Hồ sơ Năng lực (CV) & Phỏng vấn Giọng nói AI
 * ============================================================================
 * Vai trò:
 *   - Đảm nhiệm hai phân hệ nghề nghiệp cốt lõi của học viên:
 *     1. Hồ sơ năng lực & CV Builder 6 khối: đọc hồ sơ kết hợp bảng kỹ năng chuẩn hóa từ hệ thống học tập
 *        (`student_skill_states`), cập nhật hồ sơ cá nhân, tải tệp PDF CV lên để AI bóc tách tự động
 *        hoặc lưu cấu trúc CV trực tiếp từ trình soạn thảo.
 *     2. Luyện phỏng vấn 1-1 cùng AI 2 vòng:
 *        - Vòng 1 (Miễn phí - 0 credit): Rà soát & đối chiếu CV với mô tả công việc (JD) theo cấp bậc mục tiêu.
 *        - Vòng 2 (Khấu trừ 1 credit khi hoàn tất): Phỏng vấn giọng nói đa lượt (turn-by-turn), nhận đánh giá
 *          từng câu trả lời và xuất báo cáo đánh giá tổng thể (`InterviewEvaluationReport`).
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `StudentDashboardView.tsx`, `OnboardingWizardView.tsx`,
 *     `StudentProfileCvWorkspace.tsx`, `StudentVoiceInterviewWorkspace.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/profile/profile.routes.ts`
 *     (bảng `user_profiles`, `student_skill_states`, `skills`, `mock_interviews`, `certificates`).
 *   - Kết nối tầng AI Service: Thông qua `aiServiceClient` (`apps/api/src/integrations/aiService.client.ts`) gọi tới
 *     `apps/ai-service/src/api/routes/career_ai.py`:
 *     + `POST /api/v1/ai/cv/parse` (phân tích CV PDF thành cấu trúc kỹ năng/dự án).
 *     + `POST /api/v1/ai/mock-interviews/round1-cv-defense` (Vòng 1 sàng lọc CV vs JD).
 *     + `POST /api/v1/ai/mock-interviews/evaluate-answer` / Gemini LLM (phỏng vấn giọng nói & chấm điểm câu trả lời).
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import {
  CvParsedData,
  CvScreeningResult,
  InterviewEvaluationReport,
  StudentResumeData,
  StudentSkillStateRecord,
} from '../types/domain';

/** Bản ghi điểm thành thạo của một kỹ năng đã được xác thực qua các bài đánh giá trong khóa học. */
export type EnrolledSkillStateItem = StudentSkillStateRecord;

/** Thẻ kỹ năng bổ sung ngoài chương trình học được trích xuất từ CV PDF của học viên. */
export interface ExternalCvSkillTagItem {
  name: string;
  note: string;
}

/** Gói dữ liệu tổng hợp Hồ sơ cá nhân, CV đã phân tích, điểm kỹ năng chuẩn hóa và số lượt phỏng vấn AI còn lại. */
export interface ProfileAndSkillsResponse {
  userProfile: {
    userId?: string;
    fullName: string;
    avatarUrl?: string;
    headline: string;
    bio?: string;
    email: string;
    phone: string;
    githubUrl: string;
    linkedinUrl: string;
    careerObjective: string;
    careerGoal?: string;
    latestCvFileName: string;
    latestCvUpdatedAt: string;
    interviewCredits: number;
    cvParsedData: CvParsedData;
  };
  studentSkillStates: EnrolledSkillStateItem[];
  externalCvSkills: ExternalCvSkillTagItem[];
}

/** Dữ liệu đầu vào để cập nhật thông tin cá nhân và mục tiêu nghề nghiệp của học viên. */
export interface UpdateMyProfilePayload {
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  preferences?: Record<string, unknown>;
  bio: string;
  careerGoal: string;
}

/** Phản hồi Vòng 1 sàng lọc CV theo JD (không khấu trừ credit: `creditDeducted: 0`). */
export interface Round1CvScreeningResponse {
  interviewId: string;
  status: 'CV_SCREENING';
  creditDeducted: 0;
  availableCredits: number;
  cvScreeningResult: CvScreeningResult;
}

export const profileInterviewApi = {
  /**
   * **Mục tiêu:** Lấy đầy đủ hồ sơ cá nhân, dữ liệu CV 6 khối, danh sách kỹ năng đã đạt qua bài học và các kỹ năng ngoài CV.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentDashboardView.tsx`, `StudentProfileCvWorkspace.tsx`.
   *   - Gọi tới: `GET /api/v1/me/profile-skills` (`apps/api/src/modules/profile/profile.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<ProfileAndSkillsResponse>`.
   */
  getMyProfileAndSkills: () =>
    httpRequest<ProfileAndSkillsResponse>('/me/profile-skills', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Cập nhật thông tin hồ sơ học viên (họ tên, ảnh đại diện, số điện thoại, GitHub/LinkedIn, giới thiệu và mục tiêu nghề nghiệp).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `OnboardingWizardView.tsx`, `StudentProfileCvWorkspace.tsx`.
   *   - Gọi tới: `PUT /api/v1/me/profile` (`apps/api/src/modules/profile/profile.routes.ts` — cập nhật bảng `user_profiles`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `payload: UpdateMyProfilePayload`; Output: `{ success, userProfile }`.
   */
  updateMyProfile: (payload: UpdateMyProfilePayload) =>
    httpRequest<{
      success: boolean;
      userProfile: ProfileAndSkillsResponse['userProfile'];
    }>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Hỗ trợ đa hình 2 chế độ làm việc với CV:
   *   (A) Tải tệp PDF CV lên bằng `multipart/form-data` để Backend + AI Service trích xuất tự động (`mode: 'PARSE_PDF'`);
   *   (B) Lưu trực tiếp dữ liệu CV JSON từ trình soạn thảo 6 khối Resume Builder (`mode: 'SAVE_RESUME'`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentProfileCvWorkspace.tsx` (hỗ trợ cả `previewOnly` cho tính năng Smart Sync chọn trường đồng bộ).
   *   - Gọi tới: `POST /api/v1/me/cv/upload` (`apps/api/src/modules/profile/profile.routes.ts`)
   *     -> Khi ở chế độ `PARSE_PDF`, Backend trích xuất văn bản từ buffer PDF và gọi `aiServiceClient.parseCvPdf`
   *     -> `POST /api/v1/ai/cv/parse` tại `apps/ai-service/src/api/routes/career_ai.py`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `fileOrNameOrPayload` (tệp `File`, tên file chuỗi, hoặc object `StudentResumeData`), `resumeData?`, `options?` (`overwriteProfile`, `previewOnly`).
   *   - Output: Tên file, thời điểm cập nhật, `cvParsedData` chuẩn hóa và cờ `profileUpdated`.
   */
  uploadAndParseCv: (
    fileOrNameOrPayload: File | string | Partial<StudentResumeData>,
    resumeData?: Partial<StudentResumeData>,
    options?: { overwriteProfile?: boolean; previewOnly?: boolean }
  ) => {
    // Bước 1: Nhận diện kiểu tham số đầu vào (tệp nhị phân `File` vs object dữ liệu Resume Builder vs tên tệp chuỗi)
    const isFile =
      typeof File !== 'undefined' && fileOrNameOrPayload instanceof File
        ? true
        : typeof fileOrNameOrPayload === 'object' &&
          fileOrNameOrPayload !== null &&
          'name' in fileOrNameOrPayload &&
          typeof (fileOrNameOrPayload as File).name === 'string' &&
          'size' in fileOrNameOrPayload;

    const isResumePayloadObject =
      typeof fileOrNameOrPayload === 'object' &&
      fileOrNameOrPayload !== null &&
      !isFile;

    // Bước 2: Chuẩn hóa metadata tên tệp, kích thước và payload `effectiveResumeData`
    const fileName =
      typeof fileOrNameOrPayload === 'string'
        ? fileOrNameOrPayload
        : isFile
        ? (fileOrNameOrPayload as File).name
        : 'CV_Ho_So_Nang_Luc_2026.pdf';

    const size = isFile ? (fileOrNameOrPayload as File).size : 245000;
    const effectiveResumeData = isResumePayloadObject
      ? (fileOrNameOrPayload as Partial<StudentResumeData>)
      : resumeData;

    // Bước 3A: Nếu truyền tệp PDF thực và không kèm JSON resume -> đóng gói `FormData` (multipart/form-data) để Backend đọc byte PDF và gọi AI Service bóc tách
    if (isFile && !effectiveResumeData && typeof FormData !== 'undefined') {
      const formData = new FormData();
      formData.append('file', fileOrNameOrPayload as File);
      formData.append('fileName', fileName);
      formData.append('size', String(size));
      formData.append('mode', 'PARSE_PDF');
      if (options?.overwriteProfile !== undefined) {
        formData.append('overwriteProfile', String(options.overwriteProfile));
      }
      if (options?.previewOnly !== undefined) {
        formData.append('previewOnly', String(options.previewOnly));
      }
      return httpRequest<{
        fileName: string;
        updatedAt: string;
        cvParsedData: CvParsedData;
        profileUpdated?: boolean;
      }>('/me/cv/upload', {
        method: 'POST',
        body: formData,
      });
    }

    // Bước 3B: Trường hợp còn lại (lưu trực tiếp từ Resume Builder 6 khối hoặc kiểm thử) -> gửi JSON thuần kèm cờ `overwriteProfile` / `previewOnly`
    return httpRequest<{
      fileName: string;
      updatedAt: string;
      cvParsedData: CvParsedData;
      profileUpdated?: boolean;
    }>('/me/cv/upload', {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        size,
        mode: effectiveResumeData ? 'SAVE_RESUME' : 'PARSE_PDF',
        resumeData: effectiveResumeData,
        overwriteProfile: options?.overwriteProfile ?? Boolean(effectiveResumeData),
        previewOnly: options?.previewOnly ?? false,
      }),
    });
  },

  /**
   * **Mục tiêu:** Khởi tạo phiên luyện phỏng vấn Vòng 1 — Rà soát CV đối chiếu với Mô tả công việc (JD) theo vị trí và cấp bậc mục tiêu (miễn phí `0` credit).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentVoiceInterviewWorkspace.tsx`.
   *   - Gọi tới: `POST /api/v1/interviews/screen-cv` (`apps/api/src/modules/profile/profile.routes.ts`)
   *     -> gọi `aiServiceClient.screenCv` -> `POST /api/v1/ai/mock-interviews/round1-cv-defense` tại
   *     `apps/ai-service/src/api/routes/career_ai.py`, tạo bản ghi nháp trong bảng `mock_interviews`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `targetLevel` (chuẩn hóa `'MIDDLE_SENIOR'` về `'SENIOR'` cho khớp enum Backend), `targetRole`, `jdRawText`.
   *   - Output: `Promise<Round1CvScreeningResponse>` gồm điểm khớp CV-JD, kỹ năng còn thiếu và câu hỏi bảo vệ CV dự kiến.
   */
  screenCvAgainstJd: (
    targetLevel: 'INTERN' | 'FRESHER' | 'JUNIOR' | 'SENIOR' | string,
    targetRole: string,
    jdRawText: string
  ) => {
    // Bước 1: Chuẩn hóa nhãn cấp bậc cũ `'MIDDLE_SENIOR'` sang `'SENIOR'` để đồng bộ enum của Backend & AI Service
    const normalizedLevel =
      targetLevel === 'MIDDLE_SENIOR' ? 'SENIOR' : targetLevel;
    // Bước 2: Gửi yêu cầu sàng lọc CV Vòng 1 (không trừ credit)
    return httpRequest<Round1CvScreeningResponse>('/interviews/screen-cv', {
      method: 'POST',
      body: JSON.stringify({
        targetLevel: normalizedLevel,
        targetRole,
        jdRawText,
      }),
    });
  },

  /**
   * **Mục tiêu:** Chuyển phiên phỏng vấn sang Vòng 2 (Phỏng vấn giọng nói 1-1 với AI), mở trạng thái `IN_PROGRESS` và nhận câu hỏi mở đầu cùng danh tính người phỏng vấn AI.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentVoiceInterviewWorkspace.tsx`.
   *   - Gọi tới: `POST /api/v1/interviews/:interviewId/start` (`apps/api/src/modules/profile/profile.routes.ts` — kiểm tra học viên có đủ >= 1 `interviewCredits`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `interviewId`; Output: Thời điểm bắt đầu, giai đoạn `stageTag` và câu hỏi mở màn `questionText`.
   */
  startVoiceInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      status: 'IN_PROGRESS';
      startedAt: string;
      stageTag?: string;
      questionText?: string;
      interviewerName?: string;
      interviewerTitle?: string;
    }>(`/interviews/${encodeURIComponent(interviewId)}/start`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Gửi nội dung trả lời (bản chuyển giọng nói thành văn bản - STT transcript) của một lượt phỏng vấn để AI nhận xét tức thì và sinh câu hỏi đào sâu kế tiếp.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentVoiceInterviewWorkspace.tsx`.
   *   - Gọi tới: `POST /api/v1/interviews/:interviewId/turn` (`apps/api/src/modules/profile/profile.routes.ts`, phối hợp Gemini LLM / `apps/ai-service/src/api/routes/career_ai.py`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `interviewId`, `userTranscriptText` (lời trả lời của ứng viên), `turnIndex?`.
   *   - Output: Nhận xét lượt trả lời `turnEvaluation`, mẹo trả lời tốt hơn `betterAnswerTip`, câu hỏi tiếp theo `nextQuestionText` và cờ `isCompleted`.
   */
  sendVoiceTurn: (interviewId: string, userTranscriptText: string, turnIndex?: number) =>
    httpRequest<{
      interviewId: string;
      recordedTranscript: string;
      acknowledged: boolean;
      turnEvaluation?: string;
      betterAnswerTip?: string;
      nextStageTag?: string;
      nextQuestionText?: string;
      isCompleted?: boolean;
    }>(`/interviews/${encodeURIComponent(interviewId)}/turn`, {
      method: 'POST',
      body: JSON.stringify({ transcript: userTranscriptText, turnIndex }),
    }),

  /**
   * **Mục tiêu:** Kết thúc buổi phỏng vấn giọng nói, thực hiện khấu trừ nguyên tử đúng `1` lượt `interviewCredits` và sinh Báo cáo Đánh giá Năng lực Phỏng vấn tổng thể.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentVoiceInterviewWorkspace.tsx`.
   *   - Gọi tới: `POST /api/v1/interviews/:interviewId/complete` (`apps/api/src/modules/profile/profile.routes.ts` — cập nhật `mock_interviews` và trừ `user_profiles.interview_credits`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `interviewId`; Output: Số credit còn lại `remainingCredits` và báo cáo `evaluationReport`.
   */
  completeInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      status: 'COMPLETED';
      creditDeducted: 1;
      remainingCredits: number;
      evaluationReport: InterviewEvaluationReport;
    }>(`/interviews/${encodeURIComponent(interviewId)}/complete`, {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Hủy bỏ phiên nháp Vòng 1 (khi học viên chưa muốn bước vào phỏng vấn Vòng 2), đảm bảo không bị trừ lượt phỏng vấn (`creditDeducted: 0`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentVoiceInterviewWorkspace.tsx`.
   *   - Gọi tới: `DELETE /api/v1/interviews/:interviewId` (`apps/api/src/modules/profile/profile.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `interviewId`; Output: `{ interviewId, deleted: true, creditDeducted: 0 }`.
   */
  cancelDraftInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      deleted: true;
      creditDeducted: 0;
    }>(`/interviews/${encodeURIComponent(interviewId)}`, {
      method: 'DELETE',
    }),
};

/** Alias tương thích ngược cho `profileInterviewApi`. */
export const profileAndInterviewApi = profileInterviewApi;
