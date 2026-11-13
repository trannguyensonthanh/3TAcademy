import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
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

export const orderRouter = Router();

const createOrderSchema = z.object({
  cohortId: z.union([z.number(), z.string()]),
  idempotencyKey: z.string().optional(),
});

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

    res.status(201).json({
      orderCode: order!.orderCode,
      cohortId: String(cohort.id),
      cohortCode: cohort.code,
      courseTitle: course?.title || cohort.name,
      amountVnd: order!.amountVnd,
      status: order!.status,
      expiresAt: order!.expiresAt.toISOString(),
      qrImageUrl: `https://qr.sepay.vn/img?bank=MBBank&acc=0389998888&template=compact&amount=${order!.amountVnd}&des=${order!.orderCode}`,
      bankInfo: {
        bankName: 'MBBank',
        accountNumber: '0389998888',
        accountName: 'CONG TY CO PHAN CONG NGHE VA DAO TAO 3T',
        transferContent: order!.orderCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 6.2 GET /orders/:orderCode
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

    res.json({
      orderCode: order.orderCode,
      status: order.status,
      amountVnd: order.amountVnd,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      expiresAt: order.expiresAt.toISOString(),
      cohortId: String(order.cohortId),
      transactionRef: txn?.gatewayTxnId,
    });
  } catch (err) {
    next(err);
  }
});

// Helper function to fulfill order payment in an ACID transaction
async function fulfillOrderPayment(orderCode: string, gatewayTxnId: string, rawPayload: Record<string, unknown>) {
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

  const paidAt = order.paidAt || new Date();

  if (order.status !== 'PAID') {
    await db.transaction(async (tx) => {
      await tx.insert(paymentTransactions).values({
        orderId: order.id,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId,
        amountVnd: order.amountVnd,
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
    order,
    cohort,
    course,
    paidAt,
    gatewayTxnId,
  };
}

// 6.3 POST /webhooks/sepay
orderRouter.post('/webhooks/sepay', async (req, res, next) => {
  try {
    const payload = (req.body || {}) as Record<string, unknown>;
    const content: string = String(payload.content || payload.description || '');
    const transferAmount = Number(payload.transferAmount || payload.amount || 0);
    const gatewayTxnId = String(payload.id || payload.referenceCode || `SEPAY_${Date.now()}`);

    const match = content.match(/3T[A-Z0-9-]+/i);
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
      res.json({ success: true, matchStatus: 'UNMATCHED_ORDER' });
      return;
    }

    const fulfilled = await fulfillOrderPayment(extractedCode, gatewayTxnId, payload);
    if (!fulfilled) {
      res.json({ success: true, matchStatus: 'UNMATCHED_ORDER' });
      return;
    }

    res.json({
      success: true,
      matchStatus: 'MATCHED',
      orderCode: fulfilled.order.orderCode,
    });
  } catch (err) {
    next(err);
  }
});

// 6.4 POST /webhooks/sepay/simulate
const simulateSchema = z.object({
  orderCode: z.string().min(3),
});

orderRouter.post(
  '/webhooks/sepay/simulate',
  requireAuth,
  validate(simulateSchema),
  async (req, res, next) => {
    try {
      const { orderCode } = req.body;
      const gatewayTxnId = `SEPAY-MB-${Date.now()}`;

      const fulfilled = await fulfillOrderPayment(orderCode, gatewayTxnId, {
        simulated: true,
        orderCode,
        timestamp: new Date().toISOString(),
      });

      if (!fulfilled) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ORDER_NOT_FOUND',
          message: 'Không tìm thấy đơn hàng cần giả lập thanh toán',
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Không tìm thấy đơn hàng cần giả lập thanh toán',
          },
        });
        return;
      }

      res.json({
        simulated: true,
        orderCode: fulfilled.order.orderCode,
        status: 'PAID',
        enrollmentStatus: 'ACTIVE',
        paidAt: fulfilled.paidAt.toISOString(),
        receipt: {
          orderCode: fulfilled.order.orderCode,
          cohortCode: fulfilled.cohort?.code || 'AI-ENG-2026-K01',
          courseTitle:
            fulfilled.course?.title ||
            fulfilled.cohort?.name ||
            'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Agent',
          amountVnd: fulfilled.order.amountVnd,
          paidAt: fulfilled.paidAt.toLocaleString('vi-VN'),
          bankName: 'MBBank (Ngân hàng Quân Đội)',
          transactionRef: fulfilled.gatewayTxnId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
