import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  Send,
  ArrowLeft,
  ArrowRight,
  Award,
  Lock,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { assessmentApi, StudentSafePromptConfigItem } from '../services/assessment.api';
import { useAsyncQuery } from '../hooks/useAsyncData';

const FALLBACK_SINGLE_QUESTION: StudentSafePromptConfigItem = {
  number: 1,
  scenarioTag: 'Câu 1 · Tình huống thực tế',
  prompt: 'Đang tải đề kiểm tra trắc nghiệm...',
  options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
  skillCode: 'HYBRID-RAG',
  skillName: 'Tìm Kiếm Kết Hợp (Từ Khóa & Ngữ Nghĩa)',
  slideLabel: 'Slide bài giảng',
};

export const AssessmentRoomView: React.FC<{ assessmentId: string }> = ({ assessmentId }) => {
  const {
    cohorts,
    sessions,
    currentUser,
    submitSessionQuiz,
    issueNewCertificate,
    setInterviewCredits,
    navigate,
  } = useAcademy();

  const isFinalExamFallback =
    assessmentId.toLowerCase().includes('final') ||
    assessmentId.toLowerCase().includes('exam');

  const { data: assessmentPayload } = useAsyncQuery(
    () => assessmentApi.getAssessmentForStudent(assessmentId),
    {
      assessmentId,
      isFinalExam: isFinalExamFallback,
      title: isFinalExamFallback
        ? 'Bài Thi Tốt Nghiệp Cuối Khóa Kỹ Sư AI Thực Chiến — Khóa K01 (25 câu A, B, C, D)'
        : 'Bài Kiểm Tra Mở Khóa Cuối Buổi Học (10 câu Trắc nghiệm A, B, C, D)',
      questionCount: isFinalExamFallback ? 25 : 10,
      timeLimitMinutes: isFinalExamFallback ? 45 : 15,
      isRetakeLocked: false,
      promptConfig: [FALLBACK_SINGLE_QUESTION],
    },
    [assessmentId]
  );

  const isFinalExam = assessmentPayload.isFinalExam;
  const questions =
    assessmentPayload.promptConfig.length > 0
      ? assessmentPayload.promptConfig
      : [FALLBACK_SINGLE_QUESTION];

  const normalizedSessionId =
    assessmentPayload.sessionId || assessmentId.replace(/^quiz-/, '');
  const session =
    sessions.find(
      (s) => s.id === normalizedSessionId || s.assessmentId === assessmentId
    ) ??
    sessions.find((s) => s.sessionOrder === 4) ??
    sessions[3];
  const matchedCohort =
    cohorts.find(
      (c) =>
        c.id === (assessmentPayload.cohortId || session?.cohortId)
    ) ?? cohorts[0];

  const [currentIdx, setCurrentIdx] = useState<number>(0);

  // Selected option index (0=A, 1=B, 2=C, 3=D) per question number — starts empty so student genuinely answers
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    isFinalExam ? 45 * 60 : 15 * 60
  );
  const [autoSaveText, setAutoSaveText] = useState<string>('Chưa chọn đáp án — Hệ thống tự động lưu khi bạn tích chọn');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSelectOption = (questionNumber: number, optionIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionNumber]: optionIndex,
    }));
    const letter = String.fromCharCode(65 + optionIndex);
    setAutoSaveText(`Đã tự động lưu đáp án ${letter} cho Câu ${questionNumber}`);
  };

  const handleSubmitInstantMcq = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const alreadyPassedFinal = assessmentPayload.isRetakeLocked;
      const result = await assessmentApi.submitAssessmentAttempt(
        assessmentId,
        selectedAnswers
      );

      // Update session completion state when passing a session quiz
      if (!isFinalExam && result.passed && session) {
        const orderedChoices = questions.map((q) => selectedAnswers[q.number] ?? 0);
        submitSessionQuiz(session.id, orderedChoices);
      }

      // If final exam is passed for the FIRST time, refresh graduation certificate & add +4 interview credits
      if (isFinalExam && result.passed && !alreadyPassedFinal) {
        if (currentUser) {
          issueNewCertificate(
            currentUser.fullName,
            currentUser.email,
            matchedCohort?.code || '',
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestion = questions[currentIdx] ?? questions[0];
  const answeredCount = Object.keys(selectedAnswers).length;
  const isLockedFinalRetake = isFinalExam && assessmentPayload.isRetakeLocked;

  return (
    <div className="min-h-screen bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5] pb-24">
      {/* Sticky Top Header Bar */}
      <div className="bg-white dark:bg-[#111A15] border-b border-[#E2ECE7] dark:border-[#1E2D24] px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() =>
                session
                  ? navigate(`/app/cohorts/${session.cohortId}/sessions/${session.id}`)
                  : navigate('/app')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Quay lại bài giảng</span>
            </button>

            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#10B981]">
                {isFinalExam
                  ? 'BÀI THI TỐT NGHIỆP CUỐI KHÓA (25 CÂU TRẮC NGHIỆM A, B, C, D)'
                  : `BÀI KIỂM TRA MỞ KHÓA BUỔI ${session?.sessionOrder || ''} (10 CÂU TRẮC NGHIỆM A, B, C, D)`}
              </div>
              <h1 className="text-sm sm:text-base font-bold truncate">
                {assessmentPayload.title ||
                  (isFinalExam
                    ? 'Đánh Giá Tổng Kết Toàn Khóa'
                    : `Kiểm tra nhanh kiến thức: ${session?.title || ''}`)}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#059669] dark:text-[#34D399] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              <span>{autoSaveText}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              <Clock className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Thời gian còn lại: {formatTimer(remainingSeconds)}</span>
            </span>

            {!isLockedFinalRetake && (
              <button
                type="button"
                onClick={handleSubmitInstantMcq}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Đang chấm điểm...' : 'Nộp bài'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {isLockedFinalRetake ? (
        <div className="max-w-3xl mx-auto px-6 pt-12">
          <div className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#059669] dark:text-[#34D399] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">
              Bạn đã hoàn thành kỳ thi tốt nghiệp cuối khóa &amp; Nhận Chứng chỉ (+4 Credits)
            </h2>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
              Để đảm bảo tính minh bạch và không cộng trùng lặp lượt phỏng vấn (Credits), bài thi tốt nghiệp cuối khóa đã được khóa sau khi bạn vượt qua.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(`/app/assessments/${assessmentId}/results`)}
                className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                Xem bảng điểm &amp; Chứng chỉ của bạn →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1280px] mx-auto px-6 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Question Navigator */}
          <aside className="lg:col-span-3 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-5 space-y-4 lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                Danh sách {questions.length} câu hỏi
              </h2>
              <span className="font-mono text-xs font-bold text-[#10B981]">
                {answeredCount}/{questions.length} đã chọn
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const hasChosen = selectedAnswers[q.number] !== undefined;
                return (
                  <button
                    key={q.number}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`py-2.5 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-[#0F172A] dark:bg-white text-white dark:text-[#0F172A] border-[#10B981] ring-2 ring-[#10B981]/30'
                        : hasChosen
                        ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 border-[#10B981]'
                        : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24]'
                    }`}
                  >
                    {q.number}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
              <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                Hình thức làm bài thống nhất:
              </div>
              <p>
                • 100% Trắc nghiệm chọn 1 đáp án đúng trong 4 lựa chọn (<strong>A, B, C, D</strong>).
              </p>
              <p>
                • Chấm điểm tự động ngay lập tức (<strong>0 giây chờ đợi</strong>) ngay khi bạn bấm Nộp bài.
              </p>
              <p>
                • Đạt từ <strong>7.0/10</strong> trở lên sẽ mở khóa hoàn thành buổi học.
              </p>
            </div>
          </aside>

          {/* Right Question Workspace */}
          <div className="lg:col-span-9 space-y-6">
            <article className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
                  <Award className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>{currentQuestion.scenarioTag}</span>
                </span>
                <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                  Kỹ năng đánh giá: {currentQuestion.skillName}
                </span>
              </div>

              <h2 className="text-base sm:text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                Câu {currentQuestion.number}: {currentQuestion.prompt}
              </h2>

              {/* 4 Radio Options A, B, C, D */}
              <div className="space-y-3">
                {currentQuestion.options.map((opt, optIdx) => {
                  const chosen = selectedAnswers[currentQuestion.number] === optIdx;
                  const letter = String.fromCharCode(65 + optIdx);
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(currentQuestion.number, optIdx)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
                        chosen
                          ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/70 border-2 border-[#10B981] text-[#0F172A] dark:text-white font-semibold'
                          : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 ${
                          chosen
                            ? 'bg-[#10B981] text-white'
                            : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="text-xs sm:text-sm leading-relaxed">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Navigation */}
              <div className="pt-5 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Câu trước</span>
                </button>

                <div className="flex items-center gap-3">
                  {currentIdx < questions.length - 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentIdx((prev) => Math.min(questions.length - 1, prev + 1))
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                    >
                      <span>Câu tiếp theo</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmitInstantMcq}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Nộp bài &amp; Xem kết quả ngay (0 giây)</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      )}
    </div>
  );
};
