/**
 * ============================================================================
 * FILE: apiClient.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Tầng lõi giao tiếp HTTP (HTTP Core Client)
 * ============================================================================
 * Vai trò:
 *   - Đóng vai trò cổng giao tiếp mạng duy nhất (Single HTTP Gateway) của toàn bộ
 *     ứng dụng React Frontend khi gọi xuống Backend API (`apps/api`, prefix `/api/v1`).
 *   - Quản lý vòng đời JWT Token (Access Token & Refresh Token) đồng bộ giữa bộ nhớ
 *     RAM và Storage trình duyệt (`localStorage` / `sessionStorage`).
 *   - Tự động đính kèm `Authorization: Bearer <token>`, `X-Request-ID` (Correlation ID
 *     để truy vết log xuyên suốt Frontend -> Backend -> AI Service), và `credentials: 'include'`
 *     (gửi kèm HttpOnly Cookie).
 *   - Triển khai cơ chế Silent Token Refresh + Hàng đợi thử lại (Retry Queue bằng
 *     `inflightRefreshPromise`) khi gặp mã lỗi `401 Unauthorized`, đảm bảo nhiều request
 *     đồng thời chỉ gọi `/auth/refresh` đúng 1 lần duy nhất.
 *   - Chuẩn hóa toàn bộ lỗi HTTP thành lớp `ApiHttpError` giàu ngữ cảnh (`status`, `code`, `details`).
 *
 * Liên kết chéo (Cross-layer):
 *   - Được import & gọi bởi: Toàn bộ 8 module `*.api.ts` trong `apps/web/src/services/`,
 *     `apps/web/src/context/AcademyContext.tsx`, `apps/web/src/views/AuthView.tsx`,
 *     và `apps/web/src/services/services.test.ts`.
 *   - Gọi trực tiếp tới Backend: `POST /api/v1/auth/refresh` trong `apps/api/src/modules/auth/auth.routes.ts`
 *     và tất cả endpoint REST của `apps/api/src/index.ts`.
 * ============================================================================
 */

const env = (import.meta as any).env || {};
const explicitBaseUrl = env.VITE_API_BASE_URL ? String(env.VITE_API_BASE_URL).trim() : '';

/**
 * Cấu hình gốc cho HTTP Client.
 * - `BASE_URL`: Ưu tiên biến môi trường `VITE_API_BASE_URL` (khi deploy tách domain);
 *   mặc định dùng `/api/v1` để đi qua Vite Dev Proxy hoặc Reverse Proxy cùng origin.
 */
export const API_CONFIG = {
  BASE_URL: explicitBaseUrl || '/api/v1',
  HAS_EXPLICIT_BACKEND: true,
};

// Khóa lưu trữ token trên trình duyệt và biến cache trên RAM (fallback khi chạy trong môi trường SSR/Node test hoặc iframe bị khóa storage)
const ACCESS_TOKEN_STORAGE_KEY = '3t_academy_access_token';
const REFRESH_TOKEN_STORAGE_KEY = '3t_academy_refresh_token';
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;
// Biến khóa chống gọi trùng (Single-flight Promise): giữ Promise refresh đang chạy để các request 401 đồng thời chờ chung 1 kết quả
let inflightRefreshPromise: Promise<string | null> | null = null;

/**
 * **Mục tiêu:** Ghi hoặc xóa một cặp khóa-giá trị đồng bộ trên cả `localStorage` và `sessionStorage`.
 * **Liên kết luồng (Cross-layer):** Hàm nội bộ được gọi bởi `setAuthAccessToken` và `setAuthRefreshToken`.
 * **Đầu vào / Đầu ra (Input / Output):**
 *   - Input: `key` (tên khóa storage), `value` (chuỗi token cần lưu, hoặc `null` để xóa sạch).
 *   - Output: `void`.
 */
function writeStorageItem(key: string, value: string | null): void {
  // Bước 1: Bỏ qua nếu đang chạy ở môi trường không có `window` (ví dụ Node.js unit test hoặc SSR)
  if (typeof window === 'undefined') return;
  // Bước 2: Duyệt lần lượt cả 2 kho lưu trữ để giữ trạng thái nhất quán giữa các tab và phiên trình duyệt
  for (const storageKind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageKind];
      if (!storage) continue;
      if (value) {
        storage.setItem(key, value);
      } else {
        storage.removeItem(key);
      }
    } catch {
      // Ignore storage errors (e.g. sandboxed iframe or quota)
    }
  }
}

/**
 * **Mục tiêu:** Đọc giá trị token từ trình duyệt, ưu tiên `localStorage` rồi fallback sang `sessionStorage`.
 * **Liên kết luồng (Cross-layer):** Hàm nội bộ phục vụ `getAuthAccessToken` và `getAuthRefreshToken`.
 * **Đầu vào / Đầu ra (Input / Output):**
 *   - Input: `key` (tên khóa cần đọc).
 *   - Output: Chuỗi giá trị tìm thấy hoặc `null` nếu chưa lưu / storage bị chặn.
 */
function readStorageItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  for (const storageKind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageKind];
      if (!storage) continue;
      const val = storage.getItem(key);
      if (val) return val;
    } catch {
      // Ignore storage errors
    }
  }
  return null;
}

/**
 * **Mục tiêu:** Lưu JWT Access Token mới vào cả bộ nhớ RAM lẫn trình duyệt (hoặc xóa khi truyền `null`).
 * **Liên kết luồng (Cross-layer):** Được gọi từ `AuthView.tsx`, `AcademyContext.tsx` sau khi đăng nhập/đăng ký thành công,
 *   và gọi nội bộ trong `refreshAccessTokenOnce` sau khi cấp mới token.
 * **Đầu vào / Đầu ra (Input / Output):** Input: `token: string | null`; Output: `void`.
 */
export function setAuthAccessToken(token: string | null): void {
  memoryAccessToken = token;
  writeStorageItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

/**
 * **Mục tiêu:** Lấy JWT Access Token hiện hành để gắn vào header `Authorization: Bearer <token>` hoặc SSE query param.
 * **Liên kết luồng (Cross-layer):** Được dùng bởi `httpRequest` và `learningApi.getLiveEventsUrl` (`learning.api.ts`).
 * **Đầu vào / Đầu ra (Input / Output):** Output: Chuỗi Access Token hoặc `null` nếu chưa đăng nhập.
 */
export function getAuthAccessToken(): string | null {
  return readStorageItem(ACCESS_TOKEN_STORAGE_KEY) || memoryAccessToken;
}

/**
 * **Mục tiêu:** Lưu JWT Refresh Token mới vào RAM và Storage trình duyệt để phục vụ tự động gia hạn phiên.
 * **Liên kết luồng (Cross-layer):** Được gọi sau khi `authApi.login` / `register` / `googleLogin` trả về hoặc khi `refreshAccessTokenOnce` xoay vòng token (token rotation).
 * **Đầu vào / Đầu ra (Input / Output):** Input: `token: string | null`; Output: `void`.
 */
export function setAuthRefreshToken(token: string | null): void {
  memoryRefreshToken = token;
  writeStorageItem(REFRESH_TOKEN_STORAGE_KEY, token);
}

/**
 * **Mục tiêu:** Lấy JWT Refresh Token hiện đang lưu để gửi lên `POST /api/v1/auth/refresh`.
 * **Liên kết luồng (Cross-layer):** Được gọi bởi `refreshAccessTokenOnce` và `hasStoredAuthSession`.
 * **Đầu vào / Đầu ra (Input / Output):** Output: Chuỗi Refresh Token hoặc `null`.
 */
export function getAuthRefreshToken(): string | null {
  return readStorageItem(REFRESH_TOKEN_STORAGE_KEY) || memoryRefreshToken;
}

/**
 * **Mục tiêu:** Xóa sạch toàn bộ Access Token và Refresh Token khỏi RAM và Storage khi đăng xuất hoặc phiên hết hạn hoàn toàn.
 * **Liên kết luồng (Cross-layer):** Được gọi từ `AcademyContext.tsx` (hàm `logout`), `refreshAccessTokenOnce` (khi refresh trả 401/403).
 * **Đầu vào / Đầu ra (Input / Output):** Output: `void`.
 */
export function clearAuthTokens(): void {
  setAuthAccessToken(null);
  setAuthRefreshToken(null);
}

/**
 * **Mục tiêu:** Kiểm tra nhanh phía client xem người dùng có khả năng đang còn phiên đăng nhập hay không trước khi gọi `/auth/me`.
 * **Liên kết luồng (Cross-layer):** Được dùng trong `AcademyContext.tsx` lúc khởi động ứng dụng (bootstrap session).
 * **Đầu vào / Đầu ra (Input / Output):** Output: `boolean` (`true` nếu còn ít nhất Access Token hoặc Refresh Token).
 */
export function hasStoredAuthSession(): boolean {
  return Boolean(getAuthAccessToken() || getAuthRefreshToken());
}

/**
 * **Mục tiêu:** Sinh mã định danh duy nhất cho mỗi HTTP request (`X-Request-ID`) phục vụ Distributed Tracing xuyên 3 tầng.
 * **Liên kết luồng (Cross-layer):** Gắn vào header `X-Request-ID` -> Backend middleware đọc làm `req.correlationId` -> chuyển tiếp sang `apps/ai-service`.
 * **Đầu vào / Đầu ra (Input / Output):** Output: Chuỗi UUID v4 (hoặc chuỗi dự phòng theo timestamp + random nếu trình duyệt cũ thiếu `crypto.randomUUID`).
 */
function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback below
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * **Mục tiêu:** Thực hiện gọi API gia hạn Access Token (Silent Refresh) theo cơ chế Single-Flight / Retry Queue.
 *   Đảm bảo nếu có N request song song cùng bị lỗi `401`, hệ thống chỉ gửi DUY NHẤT 1 yêu cầu `POST /auth/refresh`,
 *   còn N-1 request kia đứng chờ chung `inflightRefreshPromise` rồi cùng nhận token mới để thử lại.
 * **Liên kết luồng (Cross-layer):**
 *   - Được gọi bởi: `httpRequest` khi nhận HTTP `401`.
 *   - Gọi sang Backend: `POST /api/v1/auth/refresh` trong `apps/api/src/modules/auth/auth.routes.ts`
 *     (Backend xác thực `refreshToken` trong body hoặc HttpOnly cookie `refresh_token`, kiểm tra tài khoản không bị `LOCKED`,
 *     sau đó cấp cặp `accessToken` + `refreshToken` mới và cập nhật cookie).
 * **Đầu vào / Đầu ra (Input / Output):**
 *   - Output: `Promise<string | null>` — trả về `accessToken` mới nếu thành công, hoặc `null` nếu phiên đã hết hạn / bị thu hồi.
 */
async function refreshAccessTokenOnce(): Promise<string | null> {
  // Bước 1: Kiểm tra hàng đợi (Retry Queue) — nếu đã có luồng refresh đang chạy, tái sử dụng ngay Promise đó để tránh race condition
  if (inflightRefreshPromise) {
    return inflightRefreshPromise;
  }

  // Bước 2: Khởi tạo 1 IIFE async và gán vào `inflightRefreshPromise` để khóa các luồng gọi đồng thời
  inflightRefreshPromise = (async () => {
    try {
      // Bước 2.1: Đọc Refresh Token từ Storage/RAM (nếu null vẫn gửi body `{}` để Backend thử đọc từ HttpOnly Cookie)
      const refreshToken = getAuthRefreshToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        },
        credentials: 'include',
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });

      // Bước 2.2: Nếu refresh thất bại với 401/403 (token giả mạo, hết hạn hoặc tài khoản bị khóa) -> dọn sạch token local để buộc đăng nhập lại
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearAuthTokens();
        }
        return null;
      }

      // Bước 2.3: Phân tích phản hồi JSON (hỗ trợ cả dạng bọc `{ success: true, data }` lẫn dạng phẳng `{ accessToken, refreshToken }`)
      const json = await response.json();
      const payload =
        json && typeof json === 'object' && 'data' in json && json.success === true
          ? json.data
          : json;

      // Bước 2.4: Lưu cặp token vừa được xoay vòng (Token Rotation) vào RAM + Storage và trả về cho các request đang xếp hàng chờ retry
      if (payload && typeof payload.accessToken === 'string' && payload.accessToken) {
        setAuthAccessToken(payload.accessToken);
        if (typeof payload.refreshToken === 'string' && payload.refreshToken) {
          setAuthRefreshToken(payload.refreshToken);
        }
        return payload.accessToken as string;
      }

      return null;
    } catch {
      return null;
    } finally {
      // Bước 3: Giải phóng khóa sau khi hoàn tất (thành công hoặc lỗi) để các chu kỳ hết hạn sau có thể refresh tiếp
      inflightRefreshPromise = null;
    }
  })();

  return inflightRefreshPromise;
}

/**
 * **Mục tiêu:** Quyết định xem một endpoint bị 401 có được phép kích hoạt cơ chế auto-refresh token hay không.
 *   Chặn vòng lặp vô hạn (infinite loop) nếu chính `/auth/refresh` trả 401, và tránh refresh vô nghĩa khi sai mật khẩu ở `/auth/login`, `/auth/register`, `/auth/google`, `/auth/logout`.
 * **Liên kết luồng (Cross-layer):** Được gọi trong `httpRequest` trước khi quyết định gọi `refreshAccessTokenOnce`.
 * **Đầu vào / Đầu ra (Input / Output):** Input: `normalizedEndpoint` (đường dẫn đã chuẩn hóa bắt đầu bằng `/`); Output: `boolean`.
 */
function shouldAttemptTokenRefresh(normalizedEndpoint: string): boolean {
  return (
    normalizedEndpoint !== '/auth/login' &&
    normalizedEndpoint !== '/auth/register' &&
    normalizedEndpoint !== '/auth/google' &&
    normalizedEndpoint !== '/auth/refresh' &&
    normalizedEndpoint !== '/auth/logout'
  );
}

/**
 * **Mục tiêu:** Lớp ngoại lệ HTTP chuẩn hóa của tầng Frontend Service, thay thế `Error` mặc định để tầng UI/View
 *   có thể phân nhánh xử lý chính xác theo mã trạng thái HTTP (`status`: 401/403/404/409/500) và mã nghiệp vụ (`code`, ví dụ `NOT_ENROLLED_IN_COHORT`, `COHORT_FULL`, `SCHEDULE_CONFLICT_DETECTED`).
 * **Liên kết luồng (Cross-layer):** Được ném ra từ `httpRequest` khi `!response.ok`, được bắt ở các View (`CohortWorkspaceView`, `VietQrCheckoutView`, `AuthView`, `AdminPortalView`...) và kiểm thử trong `services.test.ts`.
 * **Đầu vào / Đầu ra (Input / Output):**
 *   - Thuộc tính: `message` (thông báo tiếng Việt hiển thị cho người dùng), `status` (HTTP status code), `code` (mã lỗi nghiệp vụ từ Backend), `details` (raw JSON body từ Backend).
 */
export class ApiHttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * **Mục tiêu:** Hàm thực thi HTTP Request chuẩn sản xuất cho toàn bộ hệ thống Frontend.
 *   Tự động gắn `Content-Type: application/json` (trừ khi gửi `FormData`), gắn `X-Request-ID`,
 *   tự động đính kèm `Authorization: Bearer <token>`, bật `credentials: 'include'`,
 *   tự động gia hạn JWT khi gặp `401` và thử lại request, đồng thời chuẩn hóa lỗi (`ApiHttpError`) và giải nén payload trả về.
 * **Liên kết luồng (Cross-layer):**
 *   - Được gọi bởi: Tất cả 8 module API (`auth.api.ts`, `catalog.api.ts`, `order.api.ts`, `learning.api.ts`,
 *     `assessment.api.ts`, `profile-interview.api.ts`, `teach.api.ts`, `admin.api.ts`).
 *   - Gọi sang Backend: Mọi route thuộc `/api/v1/*` trên Express server (`apps/api`).
 * **Đầu vào / Đầu ra (Input / Output):**
 *   - Input: `endpoint` (đường dẫn tương đối sau `/api/v1`, ví dụ `'/auth/me'`), `options` (tùy chọn `RequestInit` của Fetch API).
 *   - Output: `Promise<T>` — dữ liệu đã giải nén từ JSON response; ném `ApiHttpError` nếu HTTP status >= 400.
 *
 * Production HTTP Client:
 * Automatically attaches `Content-Type: application/json`, `X-Request-ID`,
 * `Authorization: Bearer <token>`, and `credentials: 'include'`.
 */
export async function httpRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  // Bước 1: Chuẩn hóa HTTP method (mặc định GET) và ghép URL đầy đủ với tiền tố `API_CONFIG.BASE_URL`
  const method = (options?.method || 'GET').toUpperCase();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_CONFIG.BASE_URL}${normalizedEndpoint}`;

  // Bước 2: Hàm tạo Headers dùng chung cho cả lần gọi đầu tiên và lần gọi retry sau khi refresh token
  const buildHeaders = (tokenOverride?: string | null) => {
    const headers = new Headers(options?.headers || {});
    // Bước 2.1: Chỉ đặt `Content-Type: application/json` khi body KHÔNG phải `FormData` (với FormData, trình duyệt phải tự sinh multipart boundary)
    if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    // Bước 2.2: Gắn Correlation ID để theo dõi log từ Frontend -> Backend -> AI Service
    headers.set('X-Request-ID', generateRequestId());

    // Bước 2.3: Tự động gắn JWT Bearer Token (ưu tiên `tokenOverride` khi retry sau refresh) nếu caller chưa tự truyền header Authorization
    const accessToken = tokenOverride ?? getAuthAccessToken();
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return headers;
  };

  // Bước 3: Gửi HTTP request lần đầu, bật `credentials: 'include'` để trình duyệt tự đính kèm HttpOnly auth cookies
  let response = await fetch(url, {
    ...options,
    method,
    headers: buildHeaders(),
    credentials: 'include',
  });

  // Bước 4: Xử lý 401 Unauthorized — tự động kích hoạt Silent Refresh Token và thử lại đúng 1 lần (Retry Queue)
  if (response.status === 401 && shouldAttemptTokenRefresh(normalizedEndpoint)) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      response = await fetch(url, {
        ...options,
        method,
        headers: buildHeaders(newToken),
        credentials: 'include',
      });
    }
  }

  // Bước 5: Xử lý lỗi HTTP (>= 400) — bóc tách `message`, `code`, `details` từ Backend JSON để ném `ApiHttpError` có cấu trúc
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorCode: string | undefined;
    let errorDetails: unknown;
    try {
      const errorBody = await response.json();
      errorDetails = errorBody;
      // Hỗ trợ cả 2 định dạng trả lỗi của Backend: phẳng (`{ message, code }`) và lồng (`{ error: { message, code } }`)
      if (errorBody?.message) {
        errorMessage = errorBody.message;
      } else if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      }
      if (typeof errorBody?.code === 'string') {
        errorCode = errorBody.code;
      } else if (typeof errorBody?.error?.code === 'string') {
        errorCode = errorBody.error.code;
      }
    } catch {
      // Keep status text
    }
    throw new ApiHttpError(errorMessage, response.status, errorCode, errorDetails);
  }

  // Bước 6: Đọc JSON thành công và tự động bóc lớp bọc chuẩn `{ success: true, data: ... }` nếu có
  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json && json.success === true) {
    return json.data as T;
  }
  return json as T;
}
