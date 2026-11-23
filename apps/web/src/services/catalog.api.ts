/**
 * ============================================================================
 * FILE: catalog.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Danh mục Khóa học, Chứng chỉ & Cố vấn AI
 * ============================================================================
 * Vai trò:
 *   - Cung cấp các API đọc dữ liệu công khai và bán công khai cho trang chủ, danh mục khóa học,
 *     chi tiết khóa học/đợt học, câu hỏi thường gặp (FAQ), tra cứu/xác thực chứng chỉ HMAC-SHA256,
 *     và hộp thoại Cố vấn nghề nghiệp AI (Career Advisor RAG).
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `HomeView.tsx`, `CoursesCatalogView.tsx`, `CourseDetailView.tsx`,
 *     `AboutAcademyView.tsx`, `CertificateVerifyView.tsx`, `AiAdvisorView.tsx`,
 *     `FloatingAdvisorChatWidget.tsx`, `AcademyContext.tsx`, `AdminPortalView.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/catalog/catalog.routes.ts`
 *     (truy vấn các bảng `courses`, `cohorts`, `categories`, `skills`, `course_skills`,
 *     `course_reviews`, `instructor_profiles`, `certificates`, `system_settings`).
 *   - Kết nối tầng AI Service: Endpoint `POST /advisor/ask` đi qua `askCareerAdvisorRag`
 *     trong `apps/api/src/integrations/ragAi.service.ts` (Hybrid Dense + Lexical RRF + Gemini)
 *     và kiến trúc RAG microservice `POST /api/v1/ai/advisor/ask` trong
 *     `apps/ai-service/src/api/routes/rag_chat.py`.
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  CourseSkill,
  CertificateRecord,
  CourseCategoryItem,
} from '../types/domain';

/** Bộ lọc tìm kiếm khóa học theo lĩnh vực, độ khó và từ khóa. */
export interface CatalogFilters {
  category?: string;
  level?: string;
  query?: string;
}

/** Dữ liệu chi tiết một khóa học kèm toàn bộ các đợt khai giảng (`cohorts`) và khung giáo trình (`syllabusTemplate`). */
export interface CourseDetailWithCohortsResponse {
  course: Course;
  cohorts: Cohort[];
  syllabusTemplate: {
    version: string;
    totalWeeks: number;
    sessionsPerWeek: number;
    modules: Course['syllabusTemplate'];
  };
}

/** Một mục câu hỏi thường gặp (FAQ) hiển thị tại trang Giới thiệu học viện. */
export interface AcademyFaqItem {
  id: string;
  question: string;
  answer: string;
}

/** Hồ sơ công khai của giảng viên hiển thị tại trang chủ và chi tiết khóa học. */
export interface CatalogInstructorItem {
  id: string;
  fullName: string;
  headline: string;
  organization: string;
  yearsOfExperience: number;
  expertiseSummaryMd?: string;
  bio?: string;
  avatarUrl: string;
  socialLinks: Record<string, string>;
}

/** Số liệu thống kê thực từ DB (khóa học, đợt mở, học viên, đánh giá trung bình) và danh sách giảng viên đang hoạt động. */
export interface CatalogSummaryResponse {
  stats?: {
    publishedCoursesCount: number;
    openingOrActiveCohortsCount: number;
    enrolledStudentsCount: number;
    instructorsCount: number;
    averageRating: number;
    reviewsCount: number;
    sessionsPerCourse?: number;
  };
  publishedCoursesCount?: number;
  activeCohortsCount?: number;
  sessionsPerCourse?: number;
  totalEnrolledStudents?: number;
  reviewCount?: number;
  ratingAvg?: number;
  instructors: CatalogInstructorItem[];
}

export const catalogApi = {
  /**
   * **Mục tiêu:** Lấy số liệu thống kê tổng quan thực tế từ CSDL và danh sách đội ngũ giảng viên cho trang chủ.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `HomeView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/catalog/summary` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<CatalogSummaryResponse>`.
   */
  getSummary: () =>
    httpRequest<CatalogSummaryResponse>('/catalog/summary', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy danh sách các lĩnh vực đào tạo (kèm số lượng khóa học đã xuất bản trong từng lĩnh vực).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `HomeView.tsx`, `CoursesCatalogView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/categories` (`apps/api/src/modules/catalog/catalog.routes.ts` — bảng `categories`, `courses`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<CourseCategoryItem[]>`.
   */
  getCategories: () =>
    httpRequest<CourseCategoryItem[]>('/categories', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy danh mục toàn bộ kỹ năng chuẩn hóa (`PREREQUISITE` / `LEARNING_OUTCOME`) của học viện.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `CoursesCatalogView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/skills` (`apps/api/src/modules/catalog/catalog.routes.ts` — bảng `skills`, `course_skills`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<CourseSkill[]>`.
   */
  getSkills: () =>
    httpRequest<CourseSkill[]>('/skills', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Tra cứu danh sách khóa học đã xuất bản (`PUBLISHED`) có hỗ trợ lọc phía server theo lĩnh vực, độ khó và từ khóa.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `HomeView.tsx`, `CoursesCatalogView.tsx`, `AcademyContext.tsx`, `AdminPortalView.tsx`.
   *   - Gọi tới: `GET /api/v1/courses?category=...&level=...&q=...` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `filters?: CatalogFilters` (mã hóa an toàn bằng `encodeURIComponent` thành query string).
   *   - Output: `Promise<Course[]>` kèm các đợt học (`cohorts`), đánh giá và kỹ năng liên kết.
   */
  getCourses: (filters?: CatalogFilters) =>
    httpRequest<Course[]>(
      `/courses?category=${encodeURIComponent(filters?.category || '')}&level=${encodeURIComponent(
        filters?.level || ''
      )}&q=${encodeURIComponent(filters?.query || '')}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Lấy danh sách tất cả đợt học (cohorts) đã sắp xếp theo độ ưu tiên trạng thái (`OPENING` -> `ONGOING` -> ...).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/cohorts` (`apps/api/src/modules/catalog/catalog.routes.ts` — bảng `cohorts`, `courses`, `instructor_profiles`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<Cohort[]>`.
   */
  getCohorts: () =>
    httpRequest<Cohort[]>('/cohorts', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy danh sách câu hỏi thường gặp (FAQ) từ cấu hình `system_settings` (`ACADEMY_FAQS`) hoặc bộ mặc định.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AboutAcademyView.tsx`.
   *   - Gọi tới: `GET /api/v1/faqs` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<AcademyFaqItem[]>`.
   */
  getFaqs: () =>
    httpRequest<AcademyFaqItem[]>('/faqs', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy bản đồ chứng chỉ theo phân quyền RBAC nghiêm ngặt (Khách nhận `{}`; Học viên chỉ nhận chứng chỉ của mình;
   *   Giảng viên nhận chứng chỉ lớp phụ trách; Quản trị viên nhận toàn bộ).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/certificates` (`apps/api/src/modules/catalog/catalog.routes.ts`, dùng `optionalAuth` & `buildCertificateRecords`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<Record<string, CertificateRecord>>` ánh xạ theo `certificateCode`.
   */
  getCertificates: () =>
    httpRequest<Record<string, CertificateRecord>>('/certificates', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Lấy hồ sơ chi tiết của một khóa học theo `slug` (hoặc `id`), bao gồm giáo trình, kỹ năng, đánh giá công khai và các đợt mở lớp.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `CourseDetailView.tsx`.
   *   - Gọi tới: `GET /api/v1/courses/:slug` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `slug` (định danh URL của khóa học).
   *   - Output: `Promise<CourseDetailWithCohortsResponse>` (hoặc 404 `COURSE_NOT_FOUND`).
   */
  getCourseBySlug: (slug: string) =>
    httpRequest<CourseDetailWithCohortsResponse>(`/courses/${encodeURIComponent(slug)}`, {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Gửi câu hỏi tư vấn lộ trình học tập cho Cố vấn AI công khai (RAG Career Advisor).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: Các luồng tư vấn khóa học công khai (cùng endpoint với `askCareerAdvisor`).
   *   - Gọi tới: `POST /api/v1/advisor/ask` (`apps/api/src/modules/catalog/catalog.routes.ts`)
   *     -> gọi `askCareerAdvisorRag` trong `apps/api/src/integrations/ragAi.service.ts` (truy xuất Hybrid Dense + Lexical RRF trên `knowledge_chunks` & `courses`/`cohorts` kết hợp Gemini, đồng bộ hợp đồng với `POST /api/v1/ai/advisor/ask` tại `apps/ai-service/src/api/routes/rag_chat.py`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `goal` (mục tiêu nghề nghiệp / câu hỏi), `background?` (nền tảng hiện tại).
   *   - Output: Câu trả lời Markdown kèm gợi ý `recommendedCourseSlug`, `recommendedCohortId`, `recommendedCohortCodes`.
   */
  askPublicAdvisor: (goal: string, background?: string) =>
    httpRequest<{
      replyText: string;
      recommendedCourseSlug: string;
      recommendedCohortId: string;
      recommendedCohortCodes?: string[];
    }>('/advisor/ask', {
      method: 'POST',
      body: JSON.stringify({ goal, background }),
    }),

  /**
   * **Mục tiêu:** Hỏi Cố vấn nghề nghiệp AI (RAG) để đề xuất khóa học và đợt khai giảng phù hợp nhất với mục tiêu học viên.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AiAdvisorView.tsx`, `FloatingAdvisorChatWidget.tsx`.
   *   - Gọi tới: `POST /api/v1/advisor/ask` (`apps/api/src/modules/catalog/catalog.routes.ts`)
   *     -> `askCareerAdvisorRag` (`apps/api/src/integrations/ragAi.service.ts`) / `apps/ai-service/src/api/routes/rag_chat.py`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `goal`, `background?`.
   *   - Output: Nội dung tư vấn `replyText` và thông tin khóa/đợt học được khuyến nghị.
   */
  askCareerAdvisor: (goal: string, background?: string) =>
    httpRequest<{
      replyText: string;
      recommendedCourseSlug: string;
      recommendedCohortId: string;
      recommendedCohortCodes?: string[];
    }>('/advisor/ask', {
      method: 'POST',
      body: JSON.stringify({ goal, background }),
    }),

  /**
   * **Mục tiêu:** Xác thực tính toàn vẹn và hiệu lực của một chứng chỉ tốt nghiệp trên sổ cái công khai bằng mã chứng chỉ hoặc chữ ký HMAC-SHA256.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `CertificateVerifyView.tsx` (nhà tuyển dụng, khách vãng lai hoặc chính học viên quét mã QR).
   *   - Gọi tới: `GET /api/v1/certificates/verify/:code` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   *   - Backend tính lại `HMAC-SHA256(enrollmentId:accountId:certificateCode)` bằng `HMAC_CERTIFICATE_SECRET`, kiểm tra trạng thái thu hồi (`revokedAt`) và che email học viên nếu người tra cứu không phải chủ sở hữu/nhân sự.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `code` (mã chứng chỉ `3T-CERT-...` hoặc chữ ký HMAC).
   *   - Output: Trạng thái tìm thấy `found`, quyền sở hữu `isOwner`, thông báo và đối tượng `certificate` (đã ẩn thông tin nhạy cảm nếu cần).
   */
  verifyCertificateByCode: (code: string) =>
    httpRequest<{
      found: boolean;
      accessDenied?: boolean;
      isOwner?: boolean;
      errorCode?: 'FORBIDDEN_OTHER_STUDENT' | 'NOT_FOUND';
      message?: string;
      certificate: CertificateRecord | null;
    }>(
      `/certificates/verify/${encodeURIComponent(code)}`,
      { method: 'GET' }
    ),

  /**
   * **Mục tiêu:** Alias ngắn gọn của `verifyCertificateByCode` để tra cứu xác thực chứng chỉ công khai theo mã.
   * **Liên kết luồng (Cross-layer):** Gọi tới `GET /api/v1/certificates/verify/:code` (`apps/api/src/modules/catalog/catalog.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `code`; Output: Kết quả xác thực sổ cái chứng chỉ.
   */
  verifyCertificate: (code: string) =>
    httpRequest<{
      found: boolean;
      accessDenied?: boolean;
      isOwner?: boolean;
      errorCode?: 'FORBIDDEN_OTHER_STUDENT' | 'NOT_FOUND';
      message?: string;
      certificate: CertificateRecord | null;
    }>(
      `/certificates/verify/${encodeURIComponent(code)}`,
      { method: 'GET' }
    ),
};
