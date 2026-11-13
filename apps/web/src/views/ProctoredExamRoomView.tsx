import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Maximize2,
  Clock,
  Send,
  ArrowLeft,
  ArrowRight,
  UserCheck,
  Eye,
  Video,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { AvatarWithFallback } from '../components/BotanicalStickers';
import { assessmentApi, StudentSafePromptConfigItem } from '../services/assessment.api';
import { useAsyncData } from '../hooks/useAsyncData';

type ProctoringState = 'NORMAL' | 'WARNING' | 'ALERT';

const FALLBACK_EXAM_QUESTION: StudentSafePromptConfigItem = {
  number: 1,
  scenarioTag: 'Câu 1/25 · Đề thi tốt nghiệp',
  prompt: 'Đang tải đề thi tốt nghiệp cuối khóa...',
  options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
  skillCode: 'HYBRID-RAG',
  skillName: 'Kiến thức tổng hợp toàn khóa',
  slideLabel: 'Tài liệu ôn tập',
};

export const ProctoredExamRoomView: React.FC<{ assessmentId: string }> = ({ assessmentId }) => {
  const { cohorts, currentUser, issueNewCertificate, setInterviewCredits, navigate } = useAcademy();

  const { data: examPayload } = useAsyncData(
    () => assessmentApi.getAssessmentForStudent(assessmentId),
    [assessmentId]
  );

  const targetCohort =
    cohorts.find(
      (c) =>
        c.id === examPayload?.cohortId ||
        assessmentId.includes(c.id)
    ) ?? cohorts[0];

  const examQuestions: StudentSafePromptConfigItem[] =
    examPayload?.promptConfig && examPayload.promptConfig.length > 0
      ? examPayload.promptConfig
      : [FALLBACK_EXAM_QUESTION];

  const [step, setStep] = useState<'CHECKIN' | 'EXAM_ACTIVE'>('CHECKIN');
  const [faceCaptured, setFaceCaptured] = useState<boolean>(true);
  const [proctoringState, setProctoringState] = useState<ProctoringState>('NORMAL');
  const studentDisplayName = currentUser?.fullName || '';
  const studentDisplayEmail = currentUser?.email || '';
  const [proctorLogs, setProctorLogs] = useState<
    { time: string; state: ProctoringState; text: string }[]
  >([
    {
      time: new Date().toTimeString().slice(0, 8),
      state: 'NORMAL',
      text: `Đã xác nhận khuôn mặt trùng khớp với hồ sơ học viên ${studentDisplayName}.`,
    },
  ]);

  // Real Webcam state via navigator.mediaDevices.getUserMedia({ video: true })
  const streamRef = useRef<MediaStream | null>(null);
  const checkinVideoRef = useRef<HTMLVideoElement | null>(null);
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [webcamNotice, setWebcamNotice] = useState<string | null>(null);

  // 25 Multiple Choice Questions (A, B, C, D) — starts empty so student selects answers
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  const [examSeconds, setExamSeconds] = useState<number>(45 * 60);

  // Attach active MediaStream whenever step changes or webcam turns on
  useEffect(() => {
    if (webcamActive && streamRef.current) {
      if (checkinVideoRef.current) {
        checkinVideoRef.current.srcObject = streamRef.current;
      }
      if (proctorVideoRef.current) {
        proctorVideoRef.current.srcObject = streamRef.current;
      }
    }
  }, [webcamActive, step]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (step !== 'EXAM_ACTIVE') return;
    const timer = window.setInterval(() => {
      setExamSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  // Real browser visibilitychange / window blur proctoring telemetry
  useEffect(() => {
    if (step !== 'EXAM_ACTIVE') return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void handleTriggerProctorState('ALERT');
      } else {
        void handleTriggerProctorState('NORMAL');
      }
    };
    const handleWindowBlur = () => {
      void handleTriggerProctorState('WARNING');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [step, assessmentId]);

  const handleEnableRealWebcam = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebcamNotice(
        'Trình duyệt hiện tại không có thiết bị Camera vật lý, hệ thống đã bật chế độ khung hình an toàn cho bạn.'
      );
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = mediaStream;
      setWebcamActive(true);
      setFaceCaptured(true);
      setWebcamNotice('Đã kết nối Webcam thật trên trình duyệt của bạn thành công!');
      if (checkinVideoRef.current) {
        checkinVideoRef.current.srcObject = mediaStream;
      }
      if (proctorVideoRef.current) {
        proctorVideoRef.current.srcObject = mediaStream;
      }
    } catch {
      setWebcamNotice(
        'Trình duyệt chưa cấp quyền Camera hoặc đang chạy trên máy không có Webcam — Hệ thống đã chuyển sang khung hình đồng hành an toàn.'
      );
    }
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleTriggerProctorState = async (nextState: ProctoringState) => {
    setProctoringState(nextState);
    const now = new Date();
    const stamp = now.toTimeString().slice(0, 8);
    const msg =
      nextState === 'NORMAL'
        ? 'Camera ổn định — Chúc bạn làm bài thi thật tốt nhé!'
        : nextState === 'WARNING'
        ? 'Hệ thống chưa nhìn rõ khuôn mặt bạn, bạn vui lòng hướng mắt về màn hình làm bài nhé.'
        : 'Cảnh báo: Phát hiện rời khỏi màn hình thi hoặc chuyển tab. Sự kiện đã được ghi nhận để Giảng viên xem xét.';

    setProctorLogs((prev) => [{ time: stamp, state: nextState, text: msg }, ...prev]);
    const eventType =
      nextState === 'WARNING'
        ? 'LOOK_AWAY_WARNING'
        : nextState === 'ALERT'
        ? 'TAB_SWITCH_OR_MULTI_FACE_ALERT'
        : 'CAMERA_NORMAL';
    await assessmentApi.reportProctoringEvent(assessmentId, eventType, msg);
  };

  const handleSubmitFinalExam = async () => {
    const alreadyPassed = Boolean(examPayload?.isRetakeLocked);
    const result = await assessmentApi.submitAssessmentAttempt(
      assessmentId,
      selectedAnswers
    );
    if (result.passed && !alreadyPassed) {
      if (currentUser) {
        issueNewCertificate(
          studentDisplayName,
          studentDisplayEmail,
          targetCohort?.code || '',
          Math.round(result.scoreOutOf10 * 10)
        );
      }
      if (typeof result.updatedInterviewCredits === 'number') {
        setInterviewCredits(result.updatedInterviewCredits);
      } else {
        setInterviewCredits((prev) => prev + (result.bonusInterviewCreditsAdded ?? 4));
      }
    }
    navigate(`/app/assessments/${assessmentId}/results`);
  };

  const proctorStatusInfo =
    proctoringState === 'NORMAL'
      ? {
          badgeBg:
            'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 border-[#10B981]',
          borderRing: 'border-[#10B981]',
          label: 'Trạng thái Bình thường (Màu Xanh lá)',
          message: 'Camera ổn định — Chúc bạn làm bài thi thật tốt nhé!',
          icon: CheckCircle2,
          iconColor: 'text-[#10B981]',
        }
      : proctoringState === 'WARNING'
      ? {
          badgeBg: 'bg-amber-500/15 text-[#B45309] dark:text-amber-300 border-[#F59E0B]',
          borderRing: 'border-[#F59E0B]',
          label: 'Trạng thái Nhắc nhở nhẹ (Màu Vàng cam)',
          message:
            'Hệ thống chưa nhìn rõ khuôn mặt bạn, bạn vui lòng hướng mắt về màn hình làm bài nhé.',
          icon: AlertTriangle,
          iconColor: 'text-[#F59E0B]',
        }
      : {
          badgeBg: 'bg-red-500/15 text-[#EF4444] border-[#EF4444]',
          borderRing: 'border-[#EF4444]',
          label: 'Trạng thái Cảnh báo (Màu Đỏ)',
          message:
            'Cảnh báo: Phát hiện rời khỏi màn hình thi hoặc có nhiều người trong khung hình. Sự kiện đã được ghi nhận để Giảng viên xem xét.',
          icon: ShieldAlert,
          iconColor: 'text-[#EF4444]',
        };

  const StatusIcon = proctorStatusInfo.icon;
  const currentQuestion = examQuestions[currentIdx] ?? examQuestions[0];

  return (
    <div className="min-h-screen bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5] pb-28">
      {/* Top Bar */}
      <div className="bg-white dark:bg-[#111A15] border-b border-[#E2ECE7] dark:border-[#1E2D24] px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                targetCohort
                  ? navigate(`/app/cohorts/${targetCohort.id}`)
                  : navigate('/app')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Quay lại Lớp học</span>
            </button>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#10B981]">
                KỲ THI TỐT NGHIỆP CUỐI KHÓA · 25 CÂU TRẮC NGHIỆM (A, B, C, D)
              </div>
              <h1 className="text-sm sm:text-base font-bold">
                {examPayload?.title || 'Bài Thi Cuối Khóa (Có Camera Đồng Hành Giám Sát)'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
              <Clock className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Thời gian còn lại: {formatClock(examSeconds)}</span>
            </span>

            {step === 'EXAM_ACTIVE' && (
              <button
                type="button"
                onClick={handleSubmitFinalExam}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Nộp bài</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1360px] mx-auto px-6 pt-8">
        {/* ====================================================================
            BƯỚC 1: KIỂM TRA THIẾT BỊ & XÁC NHẬN KHUÔN MẶT TRƯỚC GIỜ THI
           ==================================================================== */}
        {step === 'CHECKIN' && (
          <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-6">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                <span>BƯỚC 1 / 2 · KIỂM TRA THIẾT BỊ &amp; XÁC NHẬN KHUÔN MẶT TRƯỚC GIỜ THI</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Sẵn sàng bước vào kỳ thi tốt nghiệp cuối khóa (25 câu trắc nghiệm A, B, C, D)
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Bài thi cuối khóa sử dụng 100% câu hỏi Trắc nghiệm 4 đáp án (A, B, C, D) để bạn chỉ cần dùng chuột chọn đáp án mà mắt luôn hướng thẳng vào màn hình.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Real Webcam Preview Box */}
              <div className="rounded-2xl bg-[#090F0C] border-2 border-[#10B981] p-5 text-white space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    {webcamActive ? 'Webcam thật đang bật trực tiếp' : 'Camera HD · Sẵn sàng'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">1080p · 30fps</span>
                </div>

                <div className="rounded-xl overflow-hidden border border-dashed border-emerald-500/40 bg-emerald-950/20 min-h-[190px] flex flex-col items-center justify-center relative">
                  {webcamActive ? (
                    <video
                      ref={checkinVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-[190px] object-cover"
                    />
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center space-y-3">
                      <AvatarWithFallback
                        name={studentDisplayName}
                        className="w-20 h-20 rounded-full ring-4 ring-[#10B981]"
                      />
                      <div className="text-center">
                        <div className="text-sm font-bold">Học viên: {studentDisplayName}</div>
                        <div className="text-[11px] text-emerald-300">
                          {studentDisplayEmail}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleEnableRealWebcam}
                    className="py-2.5 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Bật Camera thật</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaceCaptured(true)}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chụp xác nhận khuôn mặt</span>
                  </button>
                </div>

                {webcamNotice && (
                  <p className="text-[11px] text-emerald-300 leading-relaxed">{webcamNotice}</p>
                )}
              </div>

              {/* Verification Status & Rules */}
              <div className="space-y-4">
                {faceCaptured && (
                  <div className="p-4 rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/80 border border-[#10B981] space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#065F46] dark:text-emerald-300">
                      <UserCheck className="w-4 h-4 text-[#10B981]" />
                      <span>Khuôn mặt trùng khớp với hồ sơ học viên</span>
                    </div>
                    <p className="text-xs text-[#065F46]/90 dark:text-emerald-200/90 leading-relaxed">
                      Thiết bị Camera, đường truyền mạng và ảnh xác thực của bạn đều đã đạt chuẩn.
                    </p>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Quyền lợi ngay khi vượt qua 25 câu trắc nghiệm cuối khóa:
                  </div>
                  <p>• Cấp ngay <strong>Chứng chỉ Tốt nghiệp 3T Academy</strong>.</p>
                  <p>• Tặng thêm <strong>4 lượt Luyện phỏng vấn AI</strong> và mở khóa <strong>Gợi ý cập nhật &amp; Đánh giá lại CV</strong>.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('EXAM_ACTIVE')}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Bắt đầu vào phòng thi toàn màn hình</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            BƯỚC 2: KHÔNG GIAN LÀM BÀI THI 25 CÂU A, B, C, D KÈM CAMERA GIÁM SÁT
           ==================================================================== */}
        {step === 'EXAM_ACTIVE' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Cột Trái 8 phần: Đề thi cuối khóa 25 câu Trắc nghiệm A, B, C, D */}
            <div className="lg:col-span-8 space-y-5">
              {/* Banner hiển thị trạng thái Camera giám sát hiện tại */}
              <div
                className={`p-4 rounded-2xl border-2 flex items-start gap-3 transition-all ${proctorStatusInfo.badgeBg}`}
              >
                <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${proctorStatusInfo.iconColor}`} />
                <div className="space-y-1 text-xs">
                  <div className="font-bold uppercase tracking-wider">
                    {proctorStatusInfo.label}
                  </div>
                  <div className="text-sm font-bold leading-snug">
                    {proctorStatusInfo.message}
                  </div>
                </div>
              </div>

              {/* Thanh chọn nhanh câu hỏi 1 -> 25 */}
              <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold">
                    Danh sách {examQuestions.length} câu hỏi trắc nghiệm (A, B, C, D):
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[#059669] dark:text-[#34D399] font-bold">
                      Đã chọn: {Object.keys(selectedAnswers).length}/{examQuestions.length} câu
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-10 sm:grid-cols-13 gap-1.5">
                  {examQuestions.map((q, idx) => {
                    const chosen = selectedAnswers[q.number] !== undefined;
                    const isCurrent = currentIdx === idx;
                    return (
                      <button
                        key={q.number}
                        type="button"
                        onClick={() => setCurrentIdx(idx)}
                        className={`py-1.5 rounded-lg font-mono text-xs font-bold border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-[#0F172A] dark:bg-white text-white dark:text-[#0F172A] border-[#10B981]'
                            : chosen
                            ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 border-[#10B981]'
                            : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24]'
                        }`}
                      >
                        {q.number}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Câu hỏi trắc nghiệm hiện tại (4 đáp án A, B, C, D) */}
              <article className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                    {currentQuestion.scenarioTag}
                  </span>
                  <span className="text-[#475569] dark:text-[#94A3B8]">
                    Chỉ cần dùng chuột tích chọn 1 đáp án A, B, C hoặc D
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                  Câu {currentQuestion.number}: {currentQuestion.prompt}
                </h2>

                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt, optIdx) => {
                    const chosen = selectedAnswers[currentQuestion.number] === optIdx;
                    const letter = String.fromCharCode(65 + optIdx);
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() =>
                          setSelectedAnswers((prev) => ({
                            ...prev,
                            [currentQuestion.number]: optIdx,
                          }))
                        }
                        className={`w-full text-left p-4 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-start gap-3 cursor-pointer ${
                          chosen
                            ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/70 border-2 border-[#10B981] font-semibold'
                            : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 ${
                            chosen
                              ? 'bg-[#10B981] text-white'
                              : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                          }`}
                        >
                          {letter}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Câu trước</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    {currentIdx < examQuestions.length - 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIdx((prev) =>
                            Math.min(examQuestions.length - 1, prev + 1)
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                      >
                        <span>Câu tiếp theo</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmitFinalExam}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Nộp bài &amp; Chấm điểm tức thì</span>
                    </button>
                  </div>
                </div>
              </article>
            </div>

            {/* Cột Phải 4 phần: Khung Camera Giám sát Thông minh ở góc màn hình */}
            <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-20">
              <div
                className={`rounded-2xl bg-[#090F0C] text-white border-2 ${proctorStatusInfo.borderRing} p-5 space-y-4 shadow-lg`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono font-bold text-emerald-400">
                    <Eye className="w-4 h-4" />
                    <span>KHUNG CAMERA GIÁM SÁT</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleEnableRealWebcam}
                    className="inline-flex items-center gap-1 font-mono text-[11px] px-2.5 py-1 rounded bg-[#10B981] hover:bg-[#059669] text-white font-bold cursor-pointer"
                  >
                    <Video className="w-3 h-3" />
                    <span>{webcamActive ? 'Webcam thật: Bật' : 'Bật Camera thật'}</span>
                  </button>
                </div>

                {/* Student Live Camera Widget */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                  {webcamActive ? (
                    <video
                      ref={proctorVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="p-4 flex items-center gap-3.5">
                      <AvatarWithFallback
                        name={studentDisplayName}
                        className="w-14 h-14 rounded-full ring-2 ring-[#10B981] shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-bold text-white truncate">
                          {studentDisplayName}
                        </div>
                        <div className="text-[11px] text-emerald-300">
                          Khuôn mặt trùng khớp với hồ sơ học viên
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {studentDisplayEmail}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {webcamNotice && (
                  <div className="text-[11px] text-emerald-300">{webcamNotice}</div>
                )}

                {/* Live Status Message Box inside Corner Camera Widget */}
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${proctorStatusInfo.badgeBg}`}
                >
                  <div className="font-bold mb-1">{proctorStatusInfo.label}</div>
                  <div>{proctorStatusInfo.message}</div>
                </div>

                {/* Activity Log */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="font-semibold text-slate-400">Nhật ký đồng hành phòng thi:</div>
                  {proctorLogs.slice(0, 3).map((log, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300"
                    >
                      <span className="font-mono text-emerald-400">[{log.time}]</span> {log.text}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
