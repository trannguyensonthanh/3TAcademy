import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  orders,
  paymentTransactions,
  enrollments,
  cohorts,
  courses,
  notifications,
} from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { resolveCohort } from '../../db/helpers.js';
import { env } from '../../config/env.js';

export const orderRouter = Router();

const createOrderSchema = z.object({
  cohortId: z.union([z.number(), z.string()]),
  idempotencyKey: z.string().optional(),
});

function buildOrderQrResponse(
  order: {
    orderCode: string;
    amountVnd: number;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
    expiresAt: Date;
  },
  cohort: { id: number; code: string; name: string },
  courseTitle: string
) {
  const bankName = env.SEPAY_BANK_NAME;
  const accountNumber = env.SEPAY_ACCOUNT_NUMBER;
  const accountHolder = env.SEPAY_ACCOUNT_HOLDER;
  const transferContent = order.orderCode;
  const qrImageUrl = `https://qr.sepay.vn/img?bank=${encodeURIComponent(bankName)}&acc=${encodeURIComponent(accountNumber)}&template=compact&amount=${order.amountVnd}&des=${encodeURIComponent(transferContent)}`;

  return {
    orderCode: order.orderCode,
    cohortId: String(cohort.id),
    cohortCode: cohort.code,
    courseTitle,
    amountVnd: order.amountVnd,
    status: order.status,
    expiresAt: order.expiresAt.toISOString(),
    bankName,
    accountNumber,
    accountHolder,
    transferContent,
    qrImageUrl,
    bankInfo: {
      bankName,
      accountNumber,
      accountName: accountHolder,
      transferContent,
    },
  };
}

// 6.1 POST /orders
orderRouter.post('/orders', requireAuth, validate(createOrderSchema), async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const { cohortId: rawCohortId, idempotencyKey } = req.body;

    const cohort = await resolveCohort(rawCohortId);
    if (!cohort) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'COHORT_NOT_FOUND',
        message: 'Không tìm thấy đợt học',
        error: {
          code: 'COHORT_NOT_FOUND',
          message: 'Không tìm thấy đợt học',
        },
      });
      return;
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, cohort.courseId))
      .limit(1);
    const courseTitle = course?.title || cohort.name;

    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.accountId, accountId), eq(enrollments.cohortId, cohort.id)))
      .limit(1);

    if (existingEnrollment && existingEnrollment.status === 'ACTIVE') {
      const message = 'Bạn đã đăng ký đợt học này rồi';
      res.status(409).json({
        success: false,
        status: 409,
        code: 'ALREADY_ENROLLED',
        message,
        error: {
          code: 'ALREADY_ENROLLED',
          message,
        },
      });
      return;
    }

    if (idempotencyKey) {
      const [existingByIdem] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.accountId, accountId), eq(orders.idempotencyKey, idempotencyKey)))
        .limit(1);

      if (existingByIdem) {
        res.status(200).json(buildOrderQrResponse(existingByIdem, cohort, courseTitle));
        return;
      }
    }

    const orderCode = `3T${Date.now().toString().slice(-8)}${accountId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const [order] = await db
      .insert(orders)
      .values({
        orderCode,
        accountId,
        cohortId: cohort.id,
        amountVnd: cohort.tuitionVnd,
        status: 'PENDING',
        idempotencyKey: idempotencyKey || `idem_${orderCode}`,
        expiresAt,
      })
      .returning();

    res.status(201).json(buildOrderQrResponse(order!, cohort, courseTitle));
  } catch (err) {
    next(err);
  }
});

// 6.2 GET /orders/my-history
orderRouter.get('/orders/my-history', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const userOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.accountId, accountId), eq(orders.status, 'PAID')))
      .orderBy(desc(orders.paidAt), desc(orders.createdAt));

    const allCohorts = await db.select().from(cohorts);
    const allCourses = await db.select().from(courses);
    const allTxns = await db.select().from(paymentTransactions);

    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const txnByOrderId = new Map(
      allTxns.filter((t) => t.orderId !== null).map((t) => [t.orderId!, t])
    );

    const receipts = userOrders.map((ord) => {
      const ch = cohortMap.get(ord.cohortId);
      const cr = ch ? courseMap.get(ch.courseId) : undefined;
      const tx = txnByOrderId.get(ord.id);
      const paidDate = ord.paidAt || ord.createdAt;
      return {
        orderCode: ord.orderCode,
        cohortCode: ch?.code || '',
        courseTitle: cr?.title || ch?.name || '',
        amountVnd: ord.amountVnd,
        paidAt: paidDate.toLocaleDateString('vi-VN'),
        bankName: env.SEPAY_BANK_NAME,
        transactionRef: tx?.gatewayTxnId || `SEPAY-${ord.orderCode}`,
      };
    });

    res.json(receipts);
  } catch (err) {
    next(err);
  }
});

// 6.3 GET /orders/:orderCode
orderRouter.get('/orders/:orderCode', requireAuth, async (req, res, next) => {
  try {
    const orderCode = String(req.params.orderCode || '').trim();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderCode, orderCode))
      .limit(1);

    if (!order) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'Không tìm thấy đơn hàng',
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Không tìm thấy đơn hàng',
        },
      });
      return;
    }

    const [txn] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, order.id))
      .limit(1);

    const [cohort] = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.id, order.cohortId))
      .limit(1);

    const [course] = cohort
      ? await db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1)
      : [];

    const receipt =
      order.status === 'PAID'
        ? {
            orderCode: order.orderCode,
            cohortCode: cohort?.code || '',
            courseTitle: course?.title || cohort?.name || '',
            amountVnd: order.amountVnd,
            paidAt: (order.paidAt || order.createdAt).toLocaleDateString('vi-VN'),
            bankName: env.SEPAY_BANK_NAME,
            transactionRef: txn?.gatewayTxnId || `SEPAY-${order.orderCode}`,
          }
        : undefined;

    res.json({
      orderCode: order.orderCode,
      status: order.status,
      amountVnd: order.amountVnd,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      expiresAt: order.expiresAt.toISOString(),
      cohortId: String(order.cohortId),
      transactionRef: txn?.gatewayTxnId,
      receipt,
    });
  } catch (err) {
    next(err);
  }
});

// Helper function to fulfill order payment in an ACID transaction
async function fulfillOrderPayment(
  orderCode: string,
  gatewayTxnId: string,
  transferAmount: number,
  rawPayload: Record<string, unknown>
) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderCode, orderCode))
    .limit(1);

  if (!order) return null;

  const [cohort] = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.id, order.cohortId))
    .limit(1);

  const [course] = cohort
    ? await db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1)
    : [];

  const effectiveAmount = transferAmount > 0 ? transferAmount : order.amountVnd;
  if (effectiveAmount < order.amountVnd) {
    await db.insert(paymentTransactions).values({
      orderId: order.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId,
      amountVnd: effectiveAmount,
      responseCode: 'AMOUNT_MISMATCH',
      rawPayload,
      matchStatus: 'AMOUNT_MISMATCH',
    });
    return {
      matchStatus: 'AMOUNT_MISMATCH' as const,
      order,
      cohort,
      course,
      paidAt: null,
      gatewayTxnId,
    };
  }

  const paidAt = order.paidAt || new Date();

  if (order.status !== 'PAID') {
    await db.transaction(async (tx) => {
      await tx.insert(paymentTransactions).values({
        orderId: order.id,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId,
        amountVnd: effectiveAmount,
        responseCode: '00',
        rawPayload,
        matchStatus: 'MATCHED',
      });

      await tx
        .update(orders)
        .set({ status: 'PAID', paidAt })
        .where(eq(orders.id, order.id));

      await tx
        .insert(enrollments)
        .values({
          accountId: order.accountId,
          cohortId: order.cohortId,
          orderId: order.id,
          status: 'ACTIVE',
        })
        .onConflictDoUpdate({
          target: [enrollments.accountId, enrollments.cohortId],
          set: { status: 'ACTIVE', orderId: order.id },
        });

      await tx
        .update(cohorts)
        .set({
          enrolledCount: sql`${cohorts.enrolledCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(cohorts.id, order.cohortId));

      await tx.insert(notifications).values({
        recipientId: order.accountId,
        type: 'PAYMENT_CONFIRMED',
        title: `Thanh toán thành công đơn ${order.orderCode}`,
        body: `Hệ thống SePay đã xác nhận chuyển khoản ${order.amountVnd.toLocaleString('vi-VN')}đ. Chào mừng bạn vào đợt học ${cohort?.code || ''}!`,
        metadata: { orderCode: order.orderCode, cohortId: order.cohortId },
      });
    });
  }

  return {
    matchStatus: 'MATCHED' as const,
    order,
    cohort,
    course,
    paidAt,
    gatewayTxnId,
  };
}

// 6.4 POST /webhooks/sepay
orderRouter.post('/webhooks/sepay', async (req, res, next) => {
  try {
    const payload = (req.body || {}) as Record<string, unknown>;
    const content: string = String(
      payload.content || payload.description || payload.orderCode || ''
    );
    const transferAmount = Number(payload.transferAmount || payload.amount || 0);
    const gatewayTxnId = String(
      payload.id || payload.referenceCode || payload.referenceNumber || `SEPAY_${Date.now()}`
    );

    const match = content.match(/(?:3T|ET)[A-Z0-9-]+/i);
    const extractedCode = match ? match[0].toUpperCase() : null;

    if (!extractedCode) {
      await db.insert(paymentTransactions).values({
        orderId: null,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId,
        amountVnd: transferAmount,
        responseCode: 'UNMATCHED',
        rawPayload: payload,
        matchStatus: 'UNMATCHED_ORDER',
      });
      res.json({
        success: true,
        status: 'PENDING',
        gateway: 'SEPAY_VIETQR',
        matchStatus: 'UNMATCHED_ORDER',
        transactionRef: gatewayTxnId,
      });
      return;
    }

    const fulfilled = await fulfillOrderPayment(
      extractedCode,
      gatewayTxnId,
      transferAmount,
      payload
    );

    if (!fulfilled) {
      await db.insert(paymentTransactions).values({
        orderId: null,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId,
        amountVnd: transferAmount,
        responseCode: 'UNMATCHED',
        rawPayload: payload,
        matchStatus: 'UNMATCHED_ORDER',
      });
      res.json({
        success: true,
        status: 'PENDING',
        gateway: 'SEPAY_VIETQR',
        matchStatus: 'UNMATCHED_ORDER',
        orderCode: extractedCode,
        transactionRef: gatewayTxnId,
      });
      return;
    }

    if (fulfilled.matchStatus === 'AMOUNT_MISMATCH') {
      res.json({
        success: true,
        status: 'PENDING',
        gateway: 'SEPAY_VIETQR',
        matchStatus: 'AMOUNT_MISMATCH',
        orderCode: fulfilled.order.orderCode,
        transactionRef: gatewayTxnId,
      });
      return;
    }

    const paidDate = fulfilled.paidAt || new Date();

    res.json({
      success: true,
      orderCode: fulfilled.order.orderCode,
      status: 'PAID',
      gateway: 'SEPAY_VIETQR',
      matchStatus: 'MATCHED',
      transactionRef: fulfilled.gatewayTxnId,
      paidAt: paidDate.toISOString(),
      receipt: {
        orderCode: fulfilled.order.orderCode,
        cohortCode: fulfilled.cohort?.code || '',
        courseTitle: fulfilled.course?.title || fulfilled.cohort?.name || '',
        amountVnd: fulfilled.order.amountVnd,
        paidAt: paidDate.toLocaleDateString('vi-VN'),
        bankName: env.SEPAY_BANK_NAME,
        transactionRef: fulfilled.gatewayTxnId,
      },
    });
  } catch (err) {
    next(err);
  }
});
