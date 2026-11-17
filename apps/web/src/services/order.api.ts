import { httpRequest } from './apiClient';
import { OrderReceipt } from '../types/domain';

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

export type CreateOrderResponse = SepayOrderCreatedResponse;

export const orderApi = {
  createCohortOrder: (cohortId: string, idempotencyKey: string, forceNew?: boolean) =>
    httpRequest<SepayOrderCreatedResponse>('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ cohortId, idempotencyKey, forceNew }),
    }),

  getOrderStatus: (orderCode: string) =>
    httpRequest<{
      orderCode: string;
      status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
      paidAt?: string;
      expiresAt?: string;
      transactionRef?: string;
      receipt?: OrderReceipt;
    }>(`/orders/${encodeURIComponent(orderCode)}`, { method: 'GET' }),

  getMyOrderHistory: () =>
    httpRequest<OrderReceipt[]>('/orders/my-history', {
      method: 'GET',
    }),
};

export const orderSepayApi = orderApi;
