import { httpRequest } from './apiClient';
import { OrderReceipt } from '../types/domain';

export interface SepayOrderCreatedResponse {
  orderCode: string;
  cohortId: string;
  cohortCode: string;
  courseTitle?: string;
  amountVnd: number;
  status: 'PENDING' | 'PAID';
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  transferContent: string;
  qrImageUrl: string;
}

export type CreateOrderResponse = SepayOrderCreatedResponse;

export const orderApi = {
  createCohortOrder: (cohortId: string, idempotencyKey: string) =>
    httpRequest<SepayOrderCreatedResponse>('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ cohortId, idempotencyKey }),
    }),

  getOrderStatus: (orderCode: string) =>
    httpRequest<{
      orderCode: string;
      status: 'PENDING' | 'PAID';
      paidAt?: string;
      transactionRef?: string;
    }>(`/orders/${encodeURIComponent(orderCode)}`, { method: 'GET' }),

  simulateSepayWebhook: (orderCode: string) =>
    httpRequest<{
      orderCode: string;
      status: 'PAID';
      gateway: 'SEPAY_VIETQR';
      matchStatus: 'MATCHED';
      transactionRef: string;
      paidAt: string;
      receipt?: OrderReceipt;
    }>('/webhooks/sepay/simulate', {
      method: 'POST',
      body: JSON.stringify({ orderCode }),
    }),

  getMyOrderHistory: () =>
    httpRequest<OrderReceipt[]>('/orders/my-history', {
      method: 'GET',
    }),
};

export const orderSepayApi = orderApi;
