/**
 * ============================================================================
 * FILE: auth.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Xác thực & Quản lý Phiên (Auth)
 * ============================================================================
 * Vai trò:
 *   - Đóng gói toàn bộ các lời gọi HTTP liên quan đến định danh người dùng:
 *     Đăng nhập mật khẩu (Argon2), Đăng ký tài khoản mới, Đăng nhập Google OAuth2,
 *     Lấy thông tin người dùng hiện tại (`/auth/me`), Đăng xuất và Đổi mật khẩu.
 *   - Mọi hàm đều là pure HTTP wrapper đi qua `httpRequest` (`apiClient.ts`),
 *     đảm bảo không chứa dữ liệu giả lập hay logic xử lý phía client trái phép.
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `AuthView.tsx`, `AcademyContext.tsx`, `StudentDashboardView.tsx`,
 *     `InstructorPortalView.tsx`, `AdminPortalView.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/auth/auth.routes.ts` (prefix `/api/v1/auth/*`),
 *     tương tác với các bảng PostgreSQL `accounts`, `account_identities`, `user_profiles`.
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import { AppRole } from '../types/domain';

/**
 * Hồ sơ rút gọn của người dùng đã xác thực, được Backend định dạng qua `formatUserResponse`.
 */
export interface AuthUserProfile {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  avatarUrl?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  preferences?: Record<string, unknown>;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
}

/**
 * Phản hồi phiên đăng nhập/đăng ký thành công: chứa cặp JWT (`accessToken`, `refreshToken`)
 * và thông tin `user` (đồng thời Backend cũng set HttpOnly cookies `access_token`, `refresh_token`).
 */
export interface AuthSessionResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUserProfile;
  isNewUser?: boolean;
}

export const authApi = {
  /**
   * **Mục tiêu:** Đăng nhập tài khoản nội bộ bằng email và mật khẩu.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/AuthView.tsx`.
   *   - Gọi tới: `POST /api/v1/auth/login` (`apps/api/src/modules/auth/auth.routes.ts`).
   *   - Backend kiểm tra trạng thái `LOCKED`, đối chiếu mật khẩu bằng `argon2.verify` trên bảng `accounts`,
   *     truy vấn `user_profiles`, cập nhật `lastLoginAt`, ký JWT và set HttpOnly cookies.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `email`, `password`.
   *   - Output: `Promise<AuthSessionResponse>` (hoặc ném `ApiHttpError` 401 `INVALID_CREDENTIALS` / 403 `ACCOUNT_LOCKED`).
   */
  login: (email: string, password?: string) =>
    httpRequest<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * **Mục tiêu:** Đăng ký tài khoản học viên (`STUDENT`) mới trong một ACID transaction.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/AuthView.tsx`.
   *   - Gọi tới: `POST /api/v1/auth/register` (`apps/api/src/modules/auth/auth.routes.ts`).
   *   - Backend băm mật khẩu bằng `argon2.hash`, khởi tạo đồng thời 3 bảng `accounts`, `account_identities` (`LOCAL`),
   *     và `user_profiles` (mặc định `interviewCredits = 0` và khung `cvParsedData` rỗng).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `fullName`, `email`, `password`.
   *   - Output: `Promise<AuthSessionResponse>` với `isNewUser: true` (hoặc 409 `EMAIL_ALREADY_EXISTS`).
   */
  register: (fullName: string, email: string, password?: string) =>
    httpRequest<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password }),
    }),

  /**
   * **Mục tiêu:** Xác thực người dùng bằng Google OAuth2 ID Token (tự động tạo tài khoản mới nếu lần đầu đăng nhập).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: Luồng đăng nhập Google (alias tương thích ngược cùng endpoint với `googleLogin`).
   *   - Gọi tới: `POST /api/v1/auth/google` (`apps/api/src/modules/auth/auth.routes.ts`), nơi Backend xác minh
   *     chữ ký `idToken` qua `https://oauth2.googleapis.com/tokeninfo` và liên kết bảng `account_identities` (`GOOGLE`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `idToken` (chuỗi JWT do Google Identity Services cấp).
   *   - Output: `Promise<AuthSessionResponse>` (hoặc 401 `INVALID_GOOGLE_TOKEN` / 403 `ACCOUNT_LOCKED`).
   */
  googleAuth: (idToken: string) =>
    httpRequest<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  /**
   * **Mục tiêu:** Đăng nhập/đăng ký nhanh bằng Google OAuth2 ID Token.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/AuthView.tsx`.
   *   - Gọi tới: `POST /api/v1/auth/google` (`apps/api/src/modules/auth/auth.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `idToken` (Google ID Token).
   *   - Output: `Promise<AuthSessionResponse>` chứa cặp JWT, `user` và cờ `isNewUser`.
   */
  googleLogin: (idToken: string) =>
    httpRequest<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  /**
   * **Mục tiêu:** Khôi phục phiên đăng nhập hiện tại và lấy thông tin hồ sơ mới nhất của người dùng đang đăng nhập.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/context/AcademyContext.tsx` khi khởi tạo app hoặc làm mới trạng thái phiên.
   *   - Gọi tới: `GET /api/v1/auth/me` (`apps/api/src/modules/auth/auth.routes.ts`, có middleware `requireAuth`).
   *     Nếu Access Token hết hạn (401), `httpRequest` sẽ tự động gọi `/auth/refresh` rồi thử lại yêu cầu này.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: Không có tham số (định danh qua Bearer Token / Cookie).
   *   - Output: `Promise<AuthUserProfile>` — đã tự động mở lớp bọc `{ user }` nếu Backend trả về object lồng.
   */
  getMe: async (): Promise<AuthUserProfile> => {
    // Bước 1: Gửi GET /auth/me (tự đính kèm Bearer JWT và kích hoạt auto-refresh nếu 401)
    const res = await httpRequest<AuthUserProfile | { user: AuthUserProfile }>('/auth/me', {
      method: 'GET',
    });
    // Bước 2: Chuẩn hóa dữ liệu đầu ra — Backend trả `{ user: AuthUserProfile }`, bóc tách trực tiếp về `AuthUserProfile`
    if (res && typeof res === 'object' && 'user' in res && res.user) {
      return res.user;
    }
    return res as AuthUserProfile;
  },

  /**
   * **Mục tiêu:** Đăng xuất khỏi hệ thống phía server bằng cách xóa sạch cặp HttpOnly cookie `access_token` và `refresh_token`.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `AcademyContext.tsx`, `InstructorPortalView.tsx`, `AdminPortalView.tsx` (kết hợp gọi `clearAuthTokens()` ở client).
   *   - Gọi tới: `POST /api/v1/auth/logout` (`apps/api/src/modules/auth/auth.routes.ts`).
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Output: `Promise<{ success: boolean; loggedOutAt: string }>`.
   */
  logout: () =>
    httpRequest<{ success: boolean; loggedOutAt: string }>('/auth/logout', {
      method: 'POST',
    }),

  /**
   * **Mục tiêu:** Đổi mật khẩu đăng nhập cho tài khoản đang hoạt động.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/StudentDashboardView.tsx` (tab bảo mật tài khoản).
   *   - Gọi tới: `POST /api/v1/auth/change-password` (`apps/api/src/modules/auth/auth.routes.ts`, có `requireAuth`).
   *   - Backend xác minh `currentPassword` bằng `argon2.verify`, sau đó băm `newPassword` và cập nhật `accounts.passwordHash`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `currentPassword`, `newPassword` (tối thiểu 6 ký tự theo Zod schema).
   *   - Output: `Promise<{ success: boolean; message: string }>` (hoặc 400 `INVALID_CURRENT_PASSWORD`).
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    httpRequest<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
