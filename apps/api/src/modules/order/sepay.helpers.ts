/**
 * ============================================================================
 * TỆP: apps/api/src/modules/order/sepay.helpers.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Bộ hàm tiện ích thuần (Pure Helpers) xử lý bảo mật,
 *     chuẩn hóa URL và bóc tách mã đơn hàng cho cổng thanh toán tự động **SePay VietQR**.
 *   - Đảm bảo 3 lớp phòng thủ cho luồng Webhook tiền vào:
 *     1. Xác thực khóa bí mật bằng so sánh hằng thời gian (`crypto.timingSafeEqual`)
 *        chống tấn công đo thời gian (Timing Attack) qua cả chuẩn `Authorization: Apikey/Bearer`
 *        lẫn header tùy biến `X-Sepay-Secret`.
 *     2. Lọc đúng giao dịch tiền vào (`transferType === 'in'`), bỏ qua giao dịch tiền ra.
 *     3. Bóc tách chính xác mã đơn (`3T...` / `ET...` / `ORD...`) từ nội dung chuyển khoản ngân hàng.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Được gọi bởi: `apps/api/src/modules/order/order.routes.ts` (trong `handleSepayWebhook`,
 *     `reconcileUnmatchedSepayTransactions`, `getConfiguredSepayWebhookUrls`) và bộ unit test SePay.
 *   - Không truy vấn DB trực tiếp, không gọi AI Service.
 * ============================================================================
 */
import crypto from 'node:crypto';

export interface SepayWebhookUrls {
  publicBaseUrl: string;
  primaryWebhookUrl: string;
  backupWebhookUrl: string;
  fallbackWebhookUrls: string[];
}

/** Chuẩn hóa Base URL: xóa khoảng trắng hai đầu và cắt bỏ toàn bộ dấu `/` dư ở cuối. */
export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

/**
 * Xây dựng bộ danh sách URL Webhook chính và dự phòng (Primary / Backup / Fallback) cho SePay.
 *
 * - **Mục tiêu:** Cho phép khai báo endpoint Health Check và hướng dẫn cấu hình webhook SePay
 *   hỗ trợ đồng thời nhiều đường dẫn tương thích ngược (`/api/v1/webhooks/sepay`, `/api/webhooks/sepay`, ...).
 * - **Đầu vào:** `publicBaseUrlRaw` (`PUBLIC_API_URL`), `primaryOverride`, `backupOverride`.
 * - **Đầu ra:** Đối tượng `SepayWebhookUrls` đã loại trùng danh sách fallback.
 */
export function buildSepayWebhookUrls(
  publicBaseUrlRaw: string,
  primaryOverride?: string,
  backupOverride?: string
): SepayWebhookUrls {
  const publicBaseUrl = normalizeBaseUrl(publicBaseUrlRaw);
  const primaryWebhookUrl =
    primaryOverride && primaryOverride.trim()
      ? primaryOverride.trim()
      : `${publicBaseUrl}/api/v1/webhooks/sepay`;
  const backupWebhookUrl =
    backupOverride && backupOverride.trim()
      ? backupOverride.trim()
      : `${publicBaseUrl}/api/v1/webhooks/sepay/backup`;

  const candidates = [
    backupWebhookUrl,
    `${publicBaseUrl}/webhooks/sepay`,
    `${publicBaseUrl}/webhooks/sepay/backup`,
    `${publicBaseUrl}/api/webhooks/sepay`,
    `${publicBaseUrl}/api/webhooks/sepay/backup`,
    `${publicBaseUrl}/api/v1/sepay/webhook`,
  ];

  const fallbackWebhookUrls = Array.from(
    new Set(candidates.filter((url) => url !== primaryWebhookUrl))
  );

  return {
    publicBaseUrl,
    primaryWebhookUrl,
    backupWebhookUrl,
    fallbackWebhookUrls,
  };
}

/** Biểu thức chính quy nhận diện mã đơn hàng chuẩn hệ thống (`3T...`, `ET...`, có hoặc không có tiền tố `ORD`). */
const ORDER_CODE_PATTERN =
  /(?:^|[^A-Z0-9])((?:ORD)?(?:3T|ET)\d[A-Z0-9]*|(?:ORD)?(?:3T|ET)(?:-[0-9]+)+)(?=$|[^A-Z0-9])/i;

/**
 * Bóc tách mã đơn hàng (`orderCode`) từ payload Webhook do SePay đẩy về.
 *
 * - **Mục tiêu:** Dù ngân hàng có chèn thêm tiền tố/hậu tố vào nội dung chuyển khoản (ví dụ `MBVCB 3T123456781 FT26...`),
 *   hệ thống vẫn rút ra chính xác mã đơn viết hoa để đối soát.
 * - **Đầu vào:** `payload` — JSON body của SePay Webhook.
 * - **Đầu ra:** Chuỗi `orderCode` viết hoa nếu khớp mẫu, hoặc `null` nếu không tìm thấy (sẽ lưu trạng thái `UNMATCHED_ORDER`).
 */
export function extractOrderCodeFromSepayPayload(
  payload: Record<string, unknown>
): string | null {
  // Bước 1: Ưu tiên kiểm tra các trường mã chuyên biệt do SePay đã tự bóc sẵn (`code`, `orderCode`)
  for (const directField of [payload.code, payload.orderCode]) {
    if (typeof directField === 'string') {
      const trimmed = directField.trim().toUpperCase();
      if (trimmed) {
        const directMatch = trimmed.match(ORDER_CODE_PATTERN);
        if (directMatch && directMatch[1]) {
          return directMatch[1].toUpperCase();
        }
      }
    }
  }

  // Bước 2: Nếu không có ở trường trực tiếp, quét regex trong trường nội dung/mô tả giao dịch ngân hàng (`content` / `description`)
  const content = String(payload.content || payload.description || '');
  const match = content.match(ORDER_CODE_PATTERN);
  return match && match[1] ? match[1].toUpperCase() : null;
}

/**
 * Kiểm tra giao dịch Webhook SePay có phải là tiền chuyển VÀO tài khoản học viện hay không.
 *
 * - **Mục tiêu:** Chặn trường hợp biến động số dư tiền RA (`transferType: 'out'`) kích hoạt nhầm đơn hàng.
 * - **Đầu vào:** `payload` của SePay Webhook.
 * - **Đầu ra:** `true` nếu là tiền vào (`'in'` hoặc trường bị lược bỏ ở mock cũ), `false` nếu là tiền ra (`'out'`).
 */
export function isIncomingSepayTransfer(payload: Record<string, unknown>): boolean {
  if (payload.transferType === undefined || payload.transferType === null) {
    return true;
  }
  const normalized = String(payload.transferType).trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized === 'in';
}

/**
 * So sánh 2 chuỗi bí mật theo thời gian hằng số (`crypto.timingSafeEqual`) để chống tấn công Timing Attack.
 */
function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Xác thực quyền gọi SePay Webhook thông qua khóa bí mật cấu hình (`SEPAY_WEBHOOK_SECRET`).
 *
 * - **Mục tiêu:** Đảm bảo chỉ máy chủ SePay thật (nắm giữ secret key) mới có thể xác nhận thanh toán,
 *   ngăn kẻ xấu tự gửi request giả mạo để kích hoạt khóa học miễn phí.
 * - **Cơ chế xác thực:**
 *   + Chấp nhận header `Authorization: Apikey <secret>` hoặc `Authorization: Bearer <secret>` (chuẩn SePay).
 *   + Chấp nhận thêm header dự phòng `X-Sepay-Secret: <secret>`.
 *   + Ở môi trường `production`, bắt buộc phải cấu hình `SEPAY_WEBHOOK_SECRET` (nếu thiếu luôn trả `false`).
 * - **Đầu vào:** `headers` từ Express Request, `configuredSecret` từ biến môi trường.
 * - **Đầu ra:** `true` nếu xác thực hợp lệ, `false` nếu bị từ chối (trả HTTP 401).
 */
export function isSepaySecretAuthorized(
  headers: Record<string, string | string[] | undefined>,
  configuredSecret?: string
): boolean {
  // Bước 1: Kiểm tra khóa bí mật cấu hình; trên Production tuyệt đối không cho qua nếu chưa thiết lập secret
  const secret = configuredSecret?.trim();
  if (!secret) {
    // In production, webhook secret is mandatory; in dev/test, allow when unset.
    return process.env.NODE_ENV !== 'production';
  }

  // Bước 2: Kiểm tra chuẩn `Authorization: Apikey <secret>` hoặc `Bearer <secret>` bằng so sánh constant-time
  const rawAuth = headers.authorization ?? headers.Authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    const token = trimmed.replace(/^(?:Apikey|Bearer)\s+/i, '').trim();
    if (safeEqualStrings(token, secret)) {
      return true;
    }
  }

  // Bước 3: Kiểm tra header dự phòng `X-Sepay-Secret` bằng so sánh constant-time
  const rawCustomHeader = headers['x-sepay-secret'] ?? headers['X-Sepay-Secret'];
  const customHeader = Array.isArray(rawCustomHeader) ? rawCustomHeader[0] : rawCustomHeader;
  if (typeof customHeader === 'string' && safeEqualStrings(customHeader.trim(), secret)) {
    return true;
  }

  return false;
}
