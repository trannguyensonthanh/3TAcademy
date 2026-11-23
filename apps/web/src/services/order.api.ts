/**
 * ============================================================================
 * FILE: order.api.ts
 * KIẾN TRÚC 3 TẦNG: Frontend (`apps/web`) — Service Đơn hàng & Thanh toán VietQR SePay
 * ============================================================================
 * Vai trò:
 *   - Đảm nhiệm luồng thương mại ghi danh đợt học (Checkout Flow): tạo đơn hàng chống
 *     trùng lặp bằng `Idempotency-Key`, sinh ảnh VietQR động từ SePay, polling trạng thái
 *     thanh toán theo thời gian thực và tra cứu lịch sử biên lai học phí của học viên.
 *
 * Liên kết chéo (Cross-layer):
 *   - Được gọi bởi: `VietQrCheckoutView.tsx`, `StudentDashboardView.tsx`, `AcademyContext.tsx`.
 *   - Gọi sang Backend: `apps/api/src/modules/order/order.routes.ts` (các route `/api/v1/orders/*`),
 *     tương tác ACID với bảng `orders`, `payment_transactions`, `enrollments`, `cohorts`,
 *     `user_profiles` (tự động cộng +4 lượt phỏng vấn AI khi SePay webhook khớp giao dịch)
 *     và `notifications`.
 * ============================================================================
 */

import { httpRequest } from './apiClient';
import { OrderReceipt } from '../types/domain';

/**
 * Phản hồi khi khởi tạo (hoặc tái sử dụng) đơn hàng thanh toán VietQR SePay.
 * Chứa đầy đủ thông tin tài khoản thụ hưởng, nội dung chuyển khoản `transferContent`
 * (chính là `orderCode`), thời hạn thanh toán `expiresAt` (TTL 15 phút) và URL ảnh mã QR.
 */
export interface SepayOrderCreatedResponse {
  orderCode: string;
  cohortId: string;
  cohortCode: string;
  courseTitle?: string;
  amountVnd: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
  expiresAt?: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  transferContent: string;
  qrImageUrl: string;
}

/** Alias kiểu dữ liệu phản hồi tạo đơn hàng cho các component cũ. */
export type CreateOrderResponse = SepayOrderCreatedResponse;

export const orderApi = {
  /**
   * **Mục tiêu:** Tạo mới (hoặc tái sử dụng đơn `PENDING` còn hạn) đơn hàng ghi danh vào một đợt học và nhận mã VietQR SePay.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/VietQrCheckoutView.tsx`.
   *   - Gọi tới: `POST /api/v1/orders` (`apps/api/src/modules/order/order.routes.ts`, yêu cầu `requireAuth`).
   *   - Backend đối soát giao dịch SePay chưa khớp, kiểm tra sức chứa lớp (`COHORT_FULL`), chống ghi danh trùng (`ALREADY_ENROLLED`),
   *     dùng khóa chống lặp `Idempotency-Key` (cả ở Header lẫn Body) và tạo ảnh QR từ `https://qr.sepay.vn/img`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `cohortId` (ID đợt học), `idempotencyKey` (khóa duy nhất tránh tạo đúp đơn khi bấm nhiều lần), `forceNew?` (ép hết hạn đơn cũ để tạo mã QR mới).
   *   - Output: `Promise<SepayOrderCreatedResponse>`.
   */
  createCohortOrder: (cohortId: string, idempotencyKey: string, forceNew?: boolean) =>
    httpRequest<SepayOrderCreatedResponse>('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ cohortId, idempotencyKey, forceNew }),
    }),

  /**
   * **Mục tiêu:** Kiểm tra trạng thái hiện tại của đơn hàng (dùng cho cơ chế polling định kỳ trên màn hình quét mã VietQR).
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `apps/web/src/views/VietQrCheckoutView.tsx`.
   *   - Gọi tới: `GET /api/v1/orders/:orderCode` (`apps/api/src/modules/order/order.routes.ts`).
   *   - Backend kiểm tra quyền sở hữu đơn hàng (chỉ chủ đơn hoặc `ADMIN`, trả 403 `FORBIDDEN_ORDER_ACCESS` nếu sai),
   *     tự động đối soát webhook SePay mới nhất, cập nhật `EXPIRED` nếu quá TTL 15 phút, và trả kèm `receipt` ngay khi đạt `PAID`.
   * **Đầu vào / Đầu ra (Input / Output):**
   *   - Input: `orderCode` (mã đơn hàng dạng `3T...`).
   *   - Output: Trạng thái đơn hàng, mã giao dịch ngân hàng `transactionRef` và biên lai `receipt` (nếu đã thanh toán).
   */
  getOrderStatus: (orderCode: string) =>
    httpRequest<{
      orderCode: string;
      status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
      paidAt?: string;
      expiresAt?: string;
      transactionRef?: string;
      receipt?: OrderReceipt;
    }>(`/orders/${encodeURIComponent(orderCode)}`, { method: 'GET' }),

  /**
   * **Mục tiêu:** Lấy lịch sử toàn bộ biên lai thanh toán học phí đã hoàn tất (`PAID`) của học viên hiện tại.
   * **Liên kết luồng (Cross-layer):**
   *   - Gọi từ: `StudentDashboardView.tsx`, `AcademyContext.tsx`.
   *   - Gọi tới: `GET /api/v1/orders/my-history` (`apps/api/src/modules/order/order.routes.ts` — truy vấn `orders`, `payment_transactions`, `cohorts`, `courses`).
   * **Đầu vào / Đầu ra (Input / Output):** Output: `Promise<OrderReceipt[]>`.
   */
  getMyOrderHistory: () =>
    httpRequest<OrderReceipt[]>('/orders/my-history', {
      method: 'GET',
    }),
};

/** Alias tương thích ngược cho `orderApi`. */
export const orderSepayApi = orderApi;
