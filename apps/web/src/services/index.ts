/**
 * ============================================================================
 * FILE: index.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Barrel Export cho tầng Service API
 * ============================================================================
 * Vai trò:
 *   - Tập trung xuất khẩu (re-export) toàn bộ HTTP Core Client (`apiClient.ts`) và
 *     8 module API theo miền nghiệp vụ (`auth`, `catalog`, `order`, `learning`,
 *     `assessment`, `profile-interview`, `teach`, `admin`) từ một điểm nhập duy nhất (`../services`).
 *   - Giúp các View, Component và Context giữ đường dẫn import ngắn gọn, nhất quán,
 *     dễ tái cấu trúc khi tách hoặc mở rộng service.
 *
 * Liên kết chéo (Cross-layer):
 *   - Được import bởi: `apps/web/src/context/AcademyContext.tsx`, hầu hết các trang
 *     trong `apps/web/src/views/*.tsx`, `apps/web/src/components/*.tsx`, và bộ test `services.test.ts`.
 *   - Chuyển tiếp tới: Toàn bộ 9 file cùng thư mục `apps/web/src/services/`, từ đó kết nối
 *     tới Backend REST API (`apps/api/src/modules/*`) và gián tiếp tới AI Service (`apps/ai-service`).
 * ============================================================================
 */

// Tầng lõi HTTP Client (JWT Bearer, Auto-Refresh 401, ApiHttpError)
export * from './apiClient';
// Miền Xác thực & Phiên đăng nhập (`/api/v1/auth/*`)
export * from './auth.api';
// Miền Danh mục khóa học, Chứng chỉ công khai & Cố vấn nghề nghiệp AI (`/api/v1/courses`, `/advisor/ask`, `/certificates/*`)
export * from './catalog.api';
// Miền Thanh toán VietQR SePay & Lịch sử đơn hàng (`/api/v1/orders/*`)
export * from './order.api';
// Miền Học tập, Lớp trực tuyến LiveKit/SSE, Tiến độ video & Trợ giảng AI (`/api/v1/me/*`, `/cohorts/*`, `/live/*`, `/ai/tutor/ask`)
export * from './learning.api';
// Miền Đánh giá năng lực, Chấm điểm IRT & Giám sát thi Proctoring CV (`/api/v1/assessments/*`)
export * from './assessment.api';
// Miền Hồ sơ năng lực, Phân tích CV & Phỏng vấn giọng nói AI 2 vòng (`/api/v1/me/profile*`, `/me/cv/upload`, `/interviews/*`)
export * from './profile-interview.api';
// Miền Giảng dạy (Instructor Portal), Ghi hình R2 & AI sinh đề Quiz (`/api/v1/teach/*`)
export * from './teach.api';
// Miền Quản trị hệ thống (Admin Portal), Xếp lịch mở lớp & Cấp/Thu hồi chứng chỉ (`/api/v1/admin/*`)
export * from './admin.api';
