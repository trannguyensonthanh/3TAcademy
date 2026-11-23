/**
 * ============================================================================
 * FILE: admin.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Cổng Quản trị Hệ thống (Admin Portal)
 * ============================================================================
 * Vai trò:
 *   - Cung cấp toàn bộ API quản trị vận hành học viện (chỉ dành cho vai trò `ADMIN`):
 *     1. Bảng điều hành tổng quan (`/admin/overview`): doanh thu thực, lớp học, học viên, lịch học hôm nay,
 *        thống kê đánh giá, danh sách tài khoản và danh sách học viên đủ điều kiện tốt nghiệp.
 *     2. Quản trị danh mục khóa học (`/admin/courses`) và mở/điều chỉnh đợt khai giảng (`/admin/cohorts`)
 *        có kiểm tra xung đột lịch dạy giảng viên.
 *     3. Quản trị tài khoản người dùng RBAC (`/admin/users`, `/admin/accounts`).
 *     4. Đối soát sổ cái giao dịch thanh toán VietQR SePay (`/admin/sepay-transactions`).
 *     5. Cấp chứng chỉ tốt nghiệp hàng loạt ký số HMAC-SHA256 và thu hồi/khôi phục chứng chỉ.
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `AdminPortalView.tsx`, `AcademyContext.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/admin/admin.routes.ts`
 *     (được bảo vệ toàn cục bởi `requireAuth` + `requireRole(['ADMIN'])`).
 *   - Kết nối tầng AI Service: Nghiệp vụ mở lớp & sắp xếp khung giờ học (`manageCohorts` / `/admin/cohorts`)
 *     kiểm tra xung đột cứng trên lịch giảng viên tại Backend (`409 SCHEDULE_CONFLICT_DETECTED`) và
 *     liên thông kiến trúc bài toán tối ưu xếp lịch ràng buộc CP-SAT tại
 *     `POST /api/v1/ai/scheduler/optimize` trong `apps/ai-service/src/api/routes/scheduler_routes.py`.
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  ClassSession,
  CohortScheduleSlot,
  CertificateRecord,
  PaymentTransactionRecord,
  UserRole,
  Enrollment,
  ChatMessage,
  Notification,
} from '../types/domain';

/** Bản ghi hiển thị một tài khoản người dùng trong bảng Quản trị tài khoản (Admin Portal). */
export interface AdminUserAccountItem {
  id: string;
  fullName: string;
  email: string;
  roleCategory: 'Học viên' | 'Giảng viên' | 'Quản trị viên';
  roleDetail: string;
  cohortAssigned: string;
  locked: boolean;
  avatarUrl?: string;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
  instructorHeadline?: string;
  instructorOrganization?: string;
  instructorYearsOfExperience?: number;
  instructorExpertiseSummaryMd?: string;
}

/** Dữ liệu đầu vào khi Quản trị viên khởi tạo mới một tài khoản (`STUDENT`, `INSTRUCTOR` hoặc `ADMIN`). */
export interface CreateAccountPayload {
  email: string;
  password: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  fullName: string;
  avatarUrl?: string;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
  instructorHeadline?: string;
  instructorOrganization?: string;
  instructorYearsOfExperience?: number;
  instructorExpertiseSummaryMd?: string;
  instructorSocialLinks?: {
    linkedin?: string;
    github?: string;
    website?: string;
  };
}

/** Học viên đã hoàn thành chương trình và vượt qua Kỳ thi cuối khóa, đủ điều kiện xét/cấp chứng chỉ tốt nghiệp. */
export interface EligibleGraduateItem {
  id: string;
  studentName: string;
  studentEmail: string;
  cohortCode: string;
  courseTitle: string;
  completedSessionsText: string;
  finalExamScore: number;
  issuedCertCode?: string;
}

/** Gói dữ liệu tổng quan toàn hệ thống cho trang Quản trị (`AdminPortalView`). */
export interface AdminOverviewResponse {
  totalRevenueVnd: number;
  activeCohortsCount: number;
  totalStudentsCount: number;
  issuedCertificatesCount: number;
  todaySessionsCount?: number;
  todaySessions?: ClassSession[];
  reviewSummary?: {
    totalReviews: number;
    avgRating?: number;
    averageRating?: number;
    fiveStarCount?: number;
    ratingDistribution?: Array<{ stars: number; count: number; percent: number }>;
    recentReviews: Array<{
      id: string;
      rating: number;
      comment: string;
      studentName: string;
      courseTitle: string;
      cohortCode: string;
      createdAt: string;
    }>;
  };
  cohorts: Cohort[];
  certificates: Record<string, CertificateRecord>;
  enrollments: Enrollment[];
  chatMessages: ChatMessage[];
  notifications: Notification[];
  accounts: AdminUserAccountItem[];
  eligibleGraduates: EligibleGraduateItem[];
}

export const adminApi = {
  /**
   * **Mục tiêu:** Lấy toàn bộ chỉ số KPI điều hành và danh mục quản trị tổng hợp (doanh thu từ đơn `PAID`, đợt học, lịch dạy hôm nay, đánh giá, chứng chỉ, tài khoản, học viên đủ điều kiện tốt nghiệp).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/admin/overview` (`apps/api/src/modules/admin/admin.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<AdminOverviewResponse>`.
   */
  getAdminOverview: () =>
    httpRequest<AdminOverviewResponse>('/admin/overview', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Tạo mới hoặc cập nhật thông tin một khóa học (tiêu đề, lĩnh vực, độ khó, mô tả, khung giáo trình `syllabusTemplate`, danh sách kỹ năng) và đồng bộ lại chỉ mục vector cho RAG.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`.
   *   - Gọi tới: `POST /api/v1/admin/courses` (`apps/api/src/modules/admin/admin.routes.ts` — cập nhật bảng `courses`, `course_skills`, `knowledge_chunks`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `payload` thuộc tính khóa học; Output: `{ courseId, status: 'SAVED', course }`.
   */
  manageCourses: (payload: Partial<Course> & { versionId?: string }) =>
    httpRequest<{ courseId: string; status: 'SAVED'; course: Partial<Course> }>(
      '/admin/courses',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  /**
   * **Mục tiêu:** Mở đợt khai giảng mới (hoặc chỉnh sửa đợt học hiện có theo `cohortId`), tự động phát hiện xung đột khung giờ giảng viên và khởi tạo lịch các buổi học (`class_sessions`) cùng bài đánh giá đi kèm.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/admin/cohorts` (`apps/api/src/modules/admin/admin.routes.ts`).
   *   - Backend kiểm tra ràng buộc trùng lịch giảng viên (`409 SCHEDULE_CONFLICT_DETECTED`) theo `scheduleSlots` và `startDate`/`endDate`,
   *     tương thích cấu trúc lịch tối ưu từ bộ giải CP-SAT (`POST /api/v1/ai/scheduler/optimize` tại `apps/ai-service/src/api/routes/scheduler_routes.py`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: Thông tin khóa học, giảng viên, học phí, sĩ số tối đa, ngày khai giảng và danh sách `scheduleSlots`; Output: `cohortId`, trạng thái `'CREATED' | 'UPDATED'` và đối tượng `cohort`.
   */
  manageCohorts: (payload: {
    cohortId?: string;
    courseId: string;
    instructorId: string;
    curriculumVersion: string;
    code: string;
    name: string;
    tuitionVnd: number;
    maxSeats?: number;
    startDate: string;
    scheduleSlots: CohortScheduleSlot[];
    instructorName?: string;
  }) =>
    httpRequest<{
      cohortId: string;
      status: 'CREATED' | 'UPDATED';
      instructorId: string;
      curriculumVersion: string;
      scheduleSlots: CohortScheduleSlot[];
      cohort?: Cohort;
      payload: typeof payload;
    }>('/admin/cohorts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Cập nhật phân quyền vai trò RBAC (`STUDENT | INSTRUCTOR | ADMIN`), trạng thái khóa/mở khóa tài khoản (`isActive`) và thông tin cơ bản của một tài khoản người dùng.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`.
   *   - Gọi tới: `PUT /api/v1/admin/users` (`apps/api/src/modules/admin/admin.routes.ts` — bảng `accounts`, `user_profiles`, `instructor_profiles`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `userId`, `role`, `isActive?`, thông tin hồ sơ; Output: `{ userId, role, isActive, updated, account }`.
   */
  manageUsers: (payload: {
    userId: string;
    role: UserRole;
    isActive?: boolean;
    fullName?: string;
    email?: string;
    roleDetail?: string;
    cohortAssigned?: string;
  }) =>
    httpRequest<{
      userId: string;
      role: UserRole;
      isActive?: boolean;
      updated: boolean;
      account?: AdminUserAccountItem;
    }>('/admin/users', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Khởi tạo trực tiếp một tài khoản mới từ trang Quản trị (hỗ trợ tạo Giảng viên kèm đầy đủ hồ sơ chuyên môn `instructor_profiles`, Học viên hoặc Quản trị viên).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`.
   *   - Gọi tới: `POST /api/v1/admin/accounts` (`apps/api/src/modules/admin/admin.routes.ts` — băm mật khẩu Argon2 trong transaction tạo `accounts`, `account_identities`, `user_profiles`, `instructor_profiles`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `payload: CreateAccountPayload`; Output: `{ success, account }`.
   */
  createAccount: (payload: CreateAccountPayload) =>
    httpRequest<{
      success: boolean;
      account: AdminUserAccountItem;
    }>('/admin/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * **Mục tiêu:** Lấy danh sách nhật ký giao dịch chuyển khoản ngân hàng nhận từ Webhook SePay VietQR để đối soát tài chính (`MATCHED`, `AMOUNT_MISMATCH`, `UNMATCHED_ORDER`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`.
   *   - Gọi tới: `GET /api/v1/admin/sepay-transactions` (`apps/api/src/modules/admin/admin.routes.ts` — bảng `payment_transactions` nối `orders`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<PaymentTransactionRecord[]>`.
   */
  getSepayTransactions: () =>
    httpRequest<PaymentTransactionRecord[]>('/admin/sepay-transactions', {
      method: 'GET',
    }),

  /**
   * **Mục tiêu:** Phát hành hàng loạt Chứng chỉ tốt nghiệp được ký số `HMAC-SHA256` cho danh sách mã ghi danh (`enrollmentIds`) đã đạt đủ điều kiện tốt nghiệp.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AdminPortalView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `POST /api/v1/admin/certificates/issue` (`apps/api/src/modules/admin/admin.routes.ts` — chèn `certificates` kèm chữ ký HMAC và gửi thông báo `CERTIFICATE_ISSUED`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `enrollmentIds: string[]`; Output: Số lượng đã cấp `issuedCount`, mảng `certificateCodes`, bản đồ `issuedCertificates`.
   */
  issueCertificatesBatch: (enrollmentIds: string[]) =>
    httpRequest<{
      issuedCount: number;
      certificateCodes: string[];
      issuedCertificates?: Record<string, CertificateRecord>;
      bonusInterviewCreditsAdded: number;
    }>('/admin/certificates/issue', {
      method: 'POST',
      body: JSON.stringify({ enrollmentIds }),
    }),

  /**
   * **Mục tiêu:** Thu hồi hoặc khôi phục hiệu lực của một chứng chỉ trên sổ cái xác thực công khai (cập nhật cột `revokedAt` / `revokeReason` trong bảng `certificates`).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`, `AdminPortalView.tsx`.
   *   - Gọi tới: `PUT /api/v1/admin/certificates/:certificateCode/revoke` (`apps/api/src/modules/admin/admin.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):** Input: `certificateCode`; Output: Trạng thái thu hồi mới `isRevoked` và bản ghi `certificate`.
   */
  toggleCertificateRevoke: (certificateCode: string) =>
    httpRequest<{
      certificateCode: string;
      isRevoked: boolean;
      certificate: CertificateRecord;
    }>(`/admin/certificates/${encodeURIComponent(certificateCode)}/revoke`, {
      method: 'PUT',
    }),
};
