import crypto from 'crypto';
import { env } from '../config/env.js';

export interface CreatePaymentUrlParams {
  orderCode: string;
  amountVnd: number;
  orderInfo: string;
  ipAddr: string;
}

export function createVnpayPaymentUrl({
  orderCode,
  amountVnd,
  orderInfo,
  ipAddr,
}: CreatePaymentUrlParams): string {
  const tmnCode = env.VNPAY_TMN_CODE || 'TESTCODE';
  const secretKey = env.VNPAY_HASH_SECRET || 'SECRETKEYTEST';
  const vnpUrl = env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const returnUrl = env.VNPAY_RETURN_URL || 'http://localhost:3000/checkout/result';

  const date = new Date();
  const createDate = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);

  const vnpParams: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderCode,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: (amountVnd * 100).toString(),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: createDate,
  };

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(vnpParams).sort();
  const signData = sortedKeys.map((k) => `${k}=${encodeURIComponent(vnpParams[k]!)}`).join('&');

  const hmac = crypto.createHmac('sha512', secretKey);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return `${vnpUrl}?${signData}&vnp_SecureHash=${signed}`;
}

