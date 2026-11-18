import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
  Download,
  ArrowRight,
  RotateCcw,
  Lock,
  LogIn,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  formatVnd,
  formatTimestamp,
  generateCohortIcsContent,
  formatScheduleSlots,
} from '../utils/academyLogic';
import { CelebrationBotanicalSticker } from '../components/BotanicalStickers';
import { OrderReceipt } from '../types/domain';
import { orderApi, SepayOrderCreatedResponse } from '../services/order.api';
import { learningApi } from '../services/learning.api';

export const VietQrCheckoutView: React.FC<{ cohortCode: string }> = ({ cohortCode }) => {
  const {
    cohorts,
    courses,
    refreshEnrollments,
    currentUser,
    navigate,
    role,
  } = useAcademy();

  const targetCohort = cohorts.find(
    (c) =>
      c.code.toLowerCase() === cohortCode.toLowerCase() ||
      String(c.id) === String(cohortCode)
  );
  const course = targetCohort
    ? courses.find((cr) => cr.id === targetCohort.courseId)
    : undefined;

  const [paymentState, setPaymentState] = useState<'WAITING' | 'SUCCESS' | 'EXPIRED'>('WAITING');
  const [secondsLeft, setSecondsLeft] = useState<number>(900);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [icsDownloaded, setIcsDownloaded] = useState(false);
  const [qrImageError, setQrImageError] = useState(false);
  const [order, setOrder] = useState<SepayOrderCreatedResponse | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isRenewingOrder, setIsRenewingOrder] = useState<boolean>(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState<boolean>(false);

  const computeRemainingSeconds = (expiresAtIso?: string): number => {
    if (!expiresAtIso) return 900;
    const diffSec = Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000);
    return Math.max(0, diffSec);
  };

  const finalizePaidOrder = React.useCallback(
    async (
      activeOrder: SepayOrderCreatedResponse,
      statusRes?: {
        orderCode?: string;
        paidAt?: string;
        transactionRef?: string;
        receipt?: OrderReceipt;
      }
    ) => {
      if (!targetCohort) return;
      await refreshEnrollments();
      const enrollmentsRes = await learningApi.getMyEnrollments();
      const matchedReceipt =
        statusRes?.receipt ??
        enrollmentsRes.receipts.find(
          (r) =>
            r.orderCode === (statusRes?.orderCode || activeOrder.orderCode) ||
            r.cohortCode === targetCohort.code
        );
      setReceipt(
        matchedReceipt ?? {
          orderCode: statusRes?.orderCode || activeOrder.orderCode,
          cohortCode: targetCohort.code,
          courseTitle: course?.title || targetCohort.name,
          amountVnd: activeOrder.amountVnd,
          paidAt: statusRes?.paidAt || new Date().toLocaleDateString('vi-VN'),
          bankName: activeOrder.bankName,
          transactionRef:
            statusRes?.transactionRef || `SEPAY-${statusRes?.orderCode || activeOrder.orderCode}`,
        }
      );
      setPaymentState('SUCCESS');
    },
    [course?.title, refreshEnrollments, targetCohort]
  );

  const initializeOrRenewOrder = React.useCallback(
    async (forceNew = false) => {
      if (!targetCohort || role !== 'STUDENT') return;
      try {
        setOrderError(null);
        if (forceNew) {
          setIsRenewingOrder(true);
        }
        const idempotencyKey = forceNew
          ? `idem-renew-${targetCohort.id}-${Date.now()}`
          : `idem-checkout-${targetCohort.id}`;
        let created = await orderApi.createCohortOrder(targetCohort.id, idempotencyKey, forceNew);

        if (created.status === 'PAID') {
          setOrder(created);
          await finalizePaidOrder(created);
          return;
        }

        let remaining = computeRemainingSeconds(created.expiresAt);
        // If backend returned an already-expired order, request a fresh 15-minute order
        if ((created.status === 'EXPIRED' || remaining <= 0) && !forceNew) {
          created = await orderApi.createCohortOrder(
            targetCohort.id,
            `idem-renew-${targetCohort.id}-${Date.now()}`,
            true
          );
          remaining = computeRemainingSeconds(created.expiresAt);
        }

        setOrder(created);
        setQrImageError(false);
        setSecondsLeft(remaining > 0 ? remaining : 900);
        setPaymentState('WAITING');
      } catch (err) {
        setOrderError(
          err instanceof Error ? err.message : 'Không thể khởi tạo đơn thanh toán SePay.'
        );
      } finally {
        setIsRenewingOrder(false);
      }
    },
    [finalizePaidOrder, role, targetCohort]
  );

  useEffect(() => {
    void initializeOrRenewOrder(false);
  }, [initializeOrRenewOrder]);

  const orderCode = order?.orderCode || '';
  const accountNumber = order?.accountNumber || '';
  const accountHolder = order?.accountHolder || '';

  useEffect(() => {
    if (paymentState !== 'WAITING' || !order) return;
    const timer = setInterval(() => {
      if (order.expiresAt) {
        const remaining = computeRemainingSeconds(order.expiresAt);
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          setPaymentState('EXPIRED');
        }
      } else {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setPaymentState('EXPIRED');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [paymentState, order]);

  // Poll GET /orders/:orderCode every 3 seconds in both WAITING and EXPIRED states
  // so that late bank webhooks arriving near/after the 15-minute mark still auto-unlock the course
  useEffect(() => {
    if (paymentState === 'SUCCESS' || !order?.orderCode || !targetCohort) return;
    let active = true;
    const pollTimer = setInterval(async () => {
      try {
        const statusRes = await orderApi.getOrderStatus(order.orderCode);
        if (!active) return;
        if (statusRes.status === 'PAID') {
          await finalizePaidOrder(order, statusRes);
        } else if (statusRes.status === 'EXPIRED' && paymentState === 'WAITING') {
          setSecondsLeft(0);
          setPaymentState('EXPIRED');
        }
      } catch {
        // Ignore transient network poll errors
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(pollTimer);
    };
  }, [finalizePaidOrder, order, paymentState, targetCohort]);

  const handleManualCheckPayment = async () => {
    if (!order?.orderCode) return;
    try {
      setIsCheckingPayment(true);
      setOrderError(null);
      const statusRes = await orderApi.getOrderStatus(order.orderCode);
      if (statusRes.status === 'PAID') {
        await finalizePaidOrder(order, statusRes);
      } else {
        setOrderError(
          `Hệ thống chưa ghi nhận biến động số dư cho mã đơn ${order.orderCode}. Nếu bạn chưa chuyển khoản, hãy nhấn "Tạo lại mã VietQR mới (15:00)" bên dưới.`
        );
      }
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : 'Không thể kiểm tra trạng thái đơn hàng.'
      );
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const handleCopy = (fieldKey: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleDownloadIcs = () => {
    if (!targetCohort) return;
    const content = generateCohortIcsContent(targetCohort, course?.title || targetCohort.name);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Lich-Hoc-${targetCohort.code}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIcsDownloaded(true);
  };

  if (role !== 'STUDENT') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-[#F59E0B] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Yêu cầu đăng nhập tài khoản Học viên
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            Bạn cần đăng nhập tài khoản học viên để tiến hành ghi danh và thanh toán học phí đợt học{' '}
            <strong className="font-mono text-[#059669] dark:text-[#34D399]">{cohortCode}</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập tài khoản Học viên</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
          >
            <span>Về trang chủ</span>
          </button>
        </div>
      </div>
    );
  }

  if (!targetCohort) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
          Không tìm thấy đợt khai giảng ({cohortCode})
        </h1>
        <button
          type="button"
          onClick={() => navigate('/courses')}
          className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
        >
          Quay lại danh mục khóa học
        </button>
      </div>
    );
  }

  if (paymentState === 'SUCCESS' && receipt) {
    return (
      <div className="max-w-[780px] mx-auto px-6 py-12">
        <div className="rounded-xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-8 space-y-6 text-center shadow-sm">
          <CelebrationBotanicalSticker className="w-20 h-20 mx-auto" />

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
              SEPAY WEBHOOK VERIFIED · MỞ KHÓA LỚP HỌC TỨC THÌ
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Ghi Danh Thành Công Đợt Học {targetCohort.code}!
            </h1>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8] max-w-xl mx-auto">
              Hệ thống đã đối soát tự động khoản chuyển khoản mã <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">{receipt.orderCode}</span> và kích hoạt quyền truy cập đầy đủ vào Không gian Lớp học của học viên <strong>{currentUser?.fullName}</strong>.
            </p>
          </div>

          {/* Transaction Receipt Card */}
          <div className="rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] p-5 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
              <span className="font-semibold text-[#475569] dark:text-[#94A3B8]">
                BIÊN LAI GIAO DỊCH ĐIỆN TỬ (SEPAY RECEIPT)
              </span>
              <span className="font-mono font-bold text-[#10B981]">{receipt.transactionRef}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[#475569] dark:text-[#94A3B8]">Mã đơn ghi danh:</div>
                <div className="font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  {receipt.orderCode}
                </div>
              </div>
              <div>
                <div className="text-[#475569] dark:text-[#94A3B8]">Số tiền đã thanh toán:</div>
                <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                  {formatVnd(receipt.amountVnd)}
                </div>
              </div>
              <div>
                <div className="text-[#475569] dark:text-[#94A3B8]">Đợt khai giảng &amp; Lịch học:</div>
                <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                  {targetCohort.code} · {formatScheduleSlots(targetCohort.scheduleSlots)}
                </div>
              </div>
              <div>
                <div className="text-[#475569] dark:text-[#94A3B8]">Ngân hàng đối soát:</div>
                <div className="font-medium text-[#0F172A] dark:text-[#ECFDF5]">
                  {receipt.bankName}
                </div>
              </div>
            </div>
          </div>

          {/* Actions: Download .ics Calendar & Enter Cohort Workspace */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>
                {icsDownloaded
                  ? 'Đã tải tệp Lịch học (.ics)'
                  : `Tải Lịch Học Chuẩn (.ics) Cho ${targetCohort.code}`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/app/cohorts/${targetCohort.id}`)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>Vào Không Gian Lớp Học Ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-6 pt-8 pb-28 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
          Thanh Toán Chuyển Khoản Ngân Hàng Tự Động VietQR (SePay)
        </h1>
        <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
          Không cần nhập thẻ thủ công — Quét mã VietQR Napas247 để hệ thống SePay tự động xác nhận và mở khóa lớp học trong 3 giây.
        </p>
      </div>

      {orderError && (
        <div className="rounded-xl bg-red-500/10 border border-[#EF4444]/40 p-4 text-xs text-[#EF4444]">
          {orderError}
        </div>
      )}

      {/* 2-Column Instant VietQR Bank Transfer Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN (6 cols): Order Summary & Instructions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
              <div>
                <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Thông tin đơn ghi danh trực tiếp
                </div>
                <div className="font-mono text-base font-bold text-[#059669] dark:text-[#34D399]">
                  Mã đơn: {orderCode || 'Đang khởi tạo...'}
                </div>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold ${
                  paymentState === 'EXPIRED'
                    ? 'bg-red-500/10 text-[#EF4444]'
                    : 'bg-amber-500/10 text-[#F59E0B]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {paymentState === 'EXPIRED'
                    ? 'Đơn đã hết hạn (00:00)'
                    : `Hết hạn sau: ${formatTimestamp(secondsLeft)}`}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-[#475569] dark:text-[#94A3B8]">Chương trình đào tạo:</div>
                <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
                  {course?.title || targetCohort.name}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Mã đợt khai giảng:</div>
                  <div className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                    {targetCohort.code} ({targetCohort.curriculumVersion})
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Ngày khai giảng:</div>
                  <div className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                    {targetCohort.startDate}
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Lịch học hàng tuần:</div>
                  <div className="font-medium text-[#0F172A] dark:text-[#ECFDF5]">
                    {formatScheduleSlots(targetCohort.scheduleSlots)}
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Email học viên nhận lớp:</div>
                  <div className="font-mono font-medium text-[#0F172A] dark:text-[#ECFDF5]">
                    {currentUser?.email}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-baseline justify-between">
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                  Tổng học phí thanh toán:
                </span>
                <span className="text-2xl font-mono font-bold text-[#059669] dark:text-[#34D399]">
                  {formatVnd(targetCohort.tuitionVnd)}
                </span>
              </div>
            </div>
          </div>

          {/* 3-Step Guide */}
          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Hướng Dẫn 3 Bước Thanh Toán Tự Động
            </h2>
            <ol className="space-y-3 text-xs text-[#475569] dark:text-[#94A3B8]">
              <li className="flex items-start gap-3">
                <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300">
                  1
                </span>
                <span>
                  Mở <strong>App Ngân hàng bất kỳ</strong> (MBBank, Vietcombank, Techcombank, BIDV, ACB...) hoặc Ví điện tử hỗ trợ Napas247.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300">
                  2
                </span>
                <span>
                  Quét <strong>mã VietQR bên phải</strong> — số tiền <strong className="font-mono">{formatVnd(targetCohort.tuitionVnd)}</strong> và nội dung chuyển khoản bắt buộc <strong className="font-mono text-[#059669] dark:text-[#34D399]">{orderCode}</strong> sẽ được điền tự động.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300">
                  3
                </span>
                <span>
                  Hệ thống <strong>SePay Webhook</strong> tự động xác nhận biến động số dư và mở khóa Không gian Lớp học trong <strong>3 giây</strong>.
                </span>
              </li>
            </ol>
          </div>
        </div>

        {/* RIGHT COLUMN (6 cols): Interactive VietQR Payment Box */}
        <div className="lg:col-span-6 space-y-5">
          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
            {/* Bank & Napas247 Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
              <div>
                <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  {order?.bankName || 'Chuyển khoản nhanh Napas247'}
                </div>
                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                  Chuyển khoản nhanh Napas247 · VietQR Chính thức
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
                VietQR · SePay
              </span>
            </div>

            {paymentState === 'EXPIRED' ? (
              <div className="rounded-xl bg-red-500/10 border border-[#EF4444]/40 p-8 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-[#EF4444] mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Mã VietQR Cho Đơn {orderCode} Đã Hết Thời Gian Giữ Chỗ
                  </h3>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Nếu bạn vừa chuyển khoản cho mã đơn <span className="font-mono font-semibold">{orderCode}</span>, hệ thống vẫn tự động đối soát ngầm hoặc bạn có thể bấm kiểm tra ngay bên dưới. Nếu chưa chuyển khoản, hãy tạo mã VietQR mới (15:00).
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isRenewingOrder}
                    onClick={() => {
                      void initializeOrRenewOrder(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-[#059669] disabled:opacity-60 cursor-pointer"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRenewingOrder ? 'animate-spin' : ''}`} />
                    <span>
                      {isRenewingOrder
                        ? 'Đang khởi tạo mã VietQR mới...'
                        : 'Tạo lại mã VietQR mới (15:00)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isCheckingPayment}
                    onClick={() => {
                      void handleManualCheckPayment();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[#0F172A] dark:text-[#ECFDF5] text-xs font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>
                      {isCheckingPayment
                        ? 'Đang đối soát giao dịch...'
                        : 'Tôi đã chuyển khoản — Kiểm tra lại'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* VietQR Code Card */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                    {order?.qrImageUrl && !qrImageError ? (
                      <img
                        src={order.qrImageUrl}
                        alt={`Mã VietQR thanh toán đơn ${orderCode}`}
                        onError={() => setQrImageError(true)}
                        className="w-44 h-44 object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-500 text-center p-4">
                        {order ? `Mã QR đơn ${orderCode}` : 'Đang tạo mã VietQR...'}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-2">
                    Quét bằng Camera Ngân hàng · Tự động kiểm tra trạng thái đơn mỗi 3 giây
                  </span>
                </div>

                {/* Copyable Bank Transfer Details */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div>
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Chủ tài khoản thụ hưởng:
                      </div>
                      <div className="font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {accountHolder || '—'}
                      </div>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div>
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Số tài khoản thụ hưởng:
                      </div>
                      <div className="font-mono text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {accountNumber || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!accountNumber}
                      onClick={() => handleCopy('ACC', accountNumber)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] font-medium cursor-pointer"
                    >
                      {copiedField === 'ACC' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                          <span className="text-[#10B981]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div>
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Số tiền chính xác:
                      </div>
                      <div className="font-mono text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {formatVnd(targetCohort.tuitionVnd)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('AMT', targetCohort.tuitionVnd.toString())}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] font-medium cursor-pointer"
                    >
                      {copiedField === 'AMT' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                          <span className="text-[#10B981]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Mandatory Transfer Content Highlighted in Emerald Mono */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg bg-[#D1FAE5]/80 dark:bg-emerald-950/90 border border-[#10B981]">
                    <div>
                      <div className="text-[11px] font-semibold text-[#065F46] dark:text-emerald-300">
                        Nội dung chuyển khoản bắt buộc (Tự động đối soát):
                      </div>
                      <div className="font-mono text-base font-bold text-[#065F46] dark:text-emerald-200 tracking-wide">
                        {orderCode || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!orderCode}
                      onClick={() => handleCopy('CODE', orderCode)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#10B981] text-white font-semibold hover:bg-[#059669] cursor-pointer"
                    >
                      {copiedField === 'CODE' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã chép mã</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép mã</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live SePay Webhook Polling Status Indicator */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 py-2.5 px-4 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-medium text-[#059669] dark:text-[#34D399]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-ping shrink-0" />
                    <span>Đang chờ ngân hàng xác nhận giao dịch tự động (SePay Webhook)...</span>
                  </div>
                  <button
                    type="button"
                    disabled={isCheckingPayment}
                    onClick={() => {
                      void handleManualCheckPayment();
                    }}
                    className="shrink-0 px-2.5 py-1 rounded bg-white dark:bg-[#111A15] border border-[#10B981]/40 hover:border-[#10B981] text-[11px] font-semibold text-[#059669] dark:text-[#34D399] disabled:opacity-60 cursor-pointer"
                  >
                    {isCheckingPayment ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
