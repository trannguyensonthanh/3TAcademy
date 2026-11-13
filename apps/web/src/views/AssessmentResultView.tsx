import React, { useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  BookOpen,
  Award,
  ArrowLeft,
  ArrowRight,
  FileText,
  ShieldCheck,
  Compass,
  Mic,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { CompetencyVerifiedShield } from '../components/BotanicalStickers';
import { assessmentApi, StoredMcqAttemptResult, McqQuestionItem } from '../services/assessment.api';
import { useAsyncData } from '../hooks/useAsyncData';

const DEFAULT_SUBMISSION: StoredMcqAttemptResult = {
  assessmentId: '',
  isFinalExam: false,
  selectedAnswers: {},
  correctCount: 0,
  totalQuestions: 0,
  scoreOutOf10: 0,
  passed: false,
  submittedAt: '',
  updatedSkills: [],
  wrongItems: [],
};

export const AssessmentResultView: React.FC<{ assessmentId: string }> = ({ assessmentId }) => {
  const {
    sessions,
    submitSessionQuiz,
    setStudentSidebarTab,
    interviewCredits,
    navigate,
  } = useAcademy();

  const { data: resultData } = useAsyncData(
    () => assessmentApi.getAssessmentResult(assessmentId),
    [assessmentId]
  );

  const isFinalExamFallback =
    assessmentId.toLowerCase().includes('exam') ||
    assessmentId.toLowerCase().includes('final');
  const isFinalExam = resultData?.isFinalExam ?? isFinalExamFallback;
  const questions: McqQuestionItem[] = resultData?.questionsWithExplanations ?? [];
  const submission: StoredMcqAttemptResult = resultData?.submission ?? {
    ...DEFAULT_SUBMISSION,
    assessmentId,
    isFinalExam,
  };

  const targetSession =
    sessions.find(
      (s) =>
        s.id === resultData?.sessionId ||
        s.assessmentId === assessmentId ||
        assessmentId.includes(s.id)
    ) ??
    sessions.find((s) => s.sessionOrder === 4) ??
    sessions[3];

  const resolvedFinalExamId =
    resultData?.finalExamId ||
    `final-exam-${resultData?.cohortId || targetSession?.cohortId || 'cohort-ai-k01'}`;

  // Sync session completion only when a real passing submission exists, using the student's submitted answers
  useEffect(() => {
    if (
      resultData?.hasStoredAttempt &&
      submission.passed &&
      !isFinalExam &&
      targetSession &&
      !targetSession.isCompleted
    ) {
      const submittedChoices =
        submission.selectedIndices ??
        Object.keys(submission.selectedAnswers || {})
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => submission.selectedAnswers[Number(k)]);
      submitSessionQuiz(targetSession.id, submittedChoices);
    }
  }, [
    isFinalExam,
    resultData?.hasStoredAttempt,
    submission.passed,
    submission.selectedAnswers,
    submission.selectedIndices,
    submitSessionQuiz,
    targetSession,
  ]);

  const wrongQuestions = questions.filter(
    (q) =>
      submission.selectedAnswers[q.number] !== undefined &&
      submission.selectedAnswers[q.number] !== q.correctIndex
  );

  return (
    <div className="min-h-screen bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5] pb-28">
      {/* Top Bar */}
      <div className="bg-white dark:bg-[#111A15] border-b border-[#E2ECE7] dark:border-[#1E2D24] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(`/app/cohorts/${targetSession.cohortId}/sessions/${targetSession.id}`)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Quay lại Phòng học Video Buổi {targetSession.sessionOrder}</span>
            </button>
            <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
              Chấm điểm trắc nghiệm tức thì (0 giây chờ đợi)
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {isFinalExam && submission.passed ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Đã đỗ Kỳ thi Cuối khóa (25 câu) &amp; Nhận +4 Credits — Đã khóa thi lại</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  navigate(`/app/exams/${resolvedFinalExamId}/proctored`)
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F172A] dark:bg-white/10 text-white text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Thi Cuối Khóa 25 Câu Trắc Nghiệm (Có Camera Giám Sát) →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 pt-8 space-y-6">
        {/* ====================================================================
            KHỐI 1: TỔNG KẾT ĐIỂM SỐ TỨC THÌ & MỞ KHÓA QUYỀN LỢI HỌC VIÊN
           ==================================================================== */}
        <section
          aria-label="Tổng kết điểm số và mở khóa hoàn thành buổi học"
          className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-6 sm:p-8 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <CompetencyVerifiedShield className="w-16 h-16 shrink-0" />
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>
                    {!submission.passed
                      ? `Kết quả chưa đạt ngưỡng qua môn (${submission.scoreOutOf10.toFixed(1)}/10) — Hãy xem gợi ý ôn tập bên dưới và làm lại nhé!`
                      : isFinalExam
                      ? 'Chúc mừng bạn đã vượt qua kỳ thi tốt nghiệp cuối khóa! Đã mở khóa Chứng chỉ + Tặng 4 lượt Luyện phỏng vấn AI + Đã khóa thi lại.'
                      : `Chúc mừng bạn đã vượt qua bài kiểm tra! Buổi học số ${targetSession.sessionOrder} đã được đánh dấu Hoàn thành.`}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Kết quả chấm điểm tức thì:{' '}
                  <span className="font-mono text-[#10B981]">
                    Đạt {submission.correctCount}/{submission.totalQuestions} câu —{' '}
                    {submission.scoreOutOf10.toFixed(1)} điểm
                  </span>
                </h1>

                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed max-w-2xl">
                  {isFinalExam
                    ? 'Hệ thống đã tự động cấp Chứng chỉ Tốt nghiệp cho bạn, cộng thêm 4 lượt Luyện phỏng vấn giọng nói cùng AI (khóa thi lại để tránh cộng trùng Credits)!'
                    : 'Hệ thống đã tự động chấm điểm 10 câu trắc nghiệm (A, B, C, D) ngay lập tức, đánh dấu Hoàn thành buổi học và cập nhật Điểm Kỹ Năng vào Bản đồ kỹ năng của bạn.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
              {isFinalExam ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSidebarTab('CERTIFICATES_ORDERS');
                      navigate('/app');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    <Award className="w-4 h-4" />
                    <span>Xem Bằng Tốt Nghiệp Trong Góc Học Tập</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSidebarTab('MOCK_INTERVIEW');
                      navigate('/app/mock-interview');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    <Mic className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>Dùng 4 Lượt Luyện Phỏng Vấn AI ({interviewCredits} Credits)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSidebarTab('PROFILE_CV');
                      navigate('/app/profile-cv');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>Mở Hồ Sơ Của Tôi Để Cập Nhật CV</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/cohorts/${targetSession.cohortId}`)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    <Award className="w-4 h-4" />
                    <span>Xem Lộ Trình Lớp Đã Mở Khóa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/assessments/${assessmentId}`)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <span>Làm lại bài trắc nghiệm (10 câu) để đạt 10/10</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ====================================================================
            KHỐI 2: CHỈ DẪN ÔN TẬP THÔNG MINH CHO CÂU TRẮC NGHIỆM CHỌN SAI
           ==================================================================== */}
        {wrongQuestions.length > 0 && (
          <section
            aria-label="Chỉ dẫn ôn tập thông minh cho câu chọn sai"
            className="rounded-2xl bg-amber-500/10 border-2 border-[#F59E0B]/60 p-6 space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/20 text-[#B45309] dark:text-amber-300 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                  <span>
                    CHỈ DẪN ÔN TẬP THÔNG MINH CHO CÂU TRẮC NGHIỆM CHỌN SAI ({wrongQuestions.length} CÂU)
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                  Ở câu số {wrongQuestions[0].number}, bạn đã chọn chưa chính xác. Đáp án đúng là{' '}
                  <span className="text-[#059669] dark:text-[#34D399]">
                    Đáp án {String.fromCharCode(65 + wrongQuestions[0].correctIndex)}
                  </span>
                  . Bạn hãy bấm vào nút bên cạnh để mở lại đúng đoạn bài giảng thầy Khoa giải thích nhé!
                </h2>

                <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  <strong>Giải thích dễ hiểu:</strong> {wrongQuestions[0].explanation}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/app/cohorts/${targetSession.cohortId}/sessions/${targetSession.id}?t=${wrongQuestions[0].reviewJumpSec}`
                    )
                  }
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>[Xem lại đoạn video 14:20 - 16:05]</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ====================================================================
            KHỐI 3: CHI TIẾT ĐÁP ÁN TRẮC NGHIỆM (A, B, C, D) & CẬP NHẬT ĐIỂM KỸ NĂNG
           ==================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Cột Trái 8 phần: Chi tiết đáp án từng câu trắc nghiệm A, B, C, D */}
          <section className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Chi Tiết Đáp Án Từng Câu Trắc Nghiệm ({questions.length} Câu A, B, C, D)
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Hệ thống tự động đối chiếu đáp án bạn chọn với đáp án đúng và gợi ý đoạn video tương ứng.
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {questions.map((q) => {
                const userChoiceIdx = submission.selectedAnswers[q.number];
                const isCorrect = userChoiceIdx === q.correctIndex;
                const userLetter =
                  userChoiceIdx !== undefined ? String.fromCharCode(65 + userChoiceIdx) : 'Chưa chọn';
                const correctLetter = String.fromCharCode(65 + q.correctIndex);

                return (
                  <article
                    key={q.number}
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      isCorrect
                        ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24]'
                        : 'bg-amber-500/5 border-[#F59E0B]/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2.5 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
                          Câu {q.number}
                        </span>
                        <span className="text-[#475569] dark:text-[#94A3B8] font-medium">
                          Kỹ năng: {q.skillName}
                        </span>
                      </div>

                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                          Chọn đúng (Đáp án {correctLetter})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/20 text-[#B45309] dark:text-amber-300 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                          Chọn sai · Cần xem lại đoạn 14:20 - 16:05
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                      {q.prompt}
                    </h3>

                    <div className="text-xs space-y-1 pt-1">
                      <div>
                        <span className="text-[#475569] dark:text-[#94A3B8]">Đáp án bạn chọn: </span>
                        <span
                          className={`font-semibold ${
                            isCorrect
                              ? 'text-[#059669] dark:text-[#34D399]'
                              : 'text-[#EF4444]'
                          }`}
                        >
                          {userChoiceIdx !== undefined
                            ? `${userLetter}. ${q.options[userChoiceIdx]}`
                            : 'Chưa chọn đáp án'}
                        </span>
                      </div>
                      {!isCorrect && (
                        <div>
                          <span className="text-[#475569] dark:text-[#94A3B8]">Đáp án đúng: </span>
                          <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                            {correctLetter}. {q.options[q.correctIndex]}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] bg-white dark:bg-[#111A15] p-3 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] leading-relaxed">
                      <strong>Giải thích dễ hiểu:</strong> {q.explanation}
                    </p>

                    {!isCorrect && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/app/cohorts/${targetSession.cohortId}/sessions/${targetSession.id}?t=${q.reviewJumpSec}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>[Xem lại đoạn video 14:20 - 16:05]</span>
                        </button>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold">
                          <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>{q.slideLabel}</span>
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* Cột Phải 4 phần: Tự động cập nhật Điểm Kỹ Năng vào Bản đồ kỹ năng */}
          <section className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-[#10B981]" />
                  <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Điểm Kỹ Năng Vừa Được Cập Nhật
                  </h2>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300">
                  Tự động +Điểm
                </span>
              </div>

              <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Dựa trên các câu trắc nghiệm bạn vừa trả lời đúng, hệ thống đã tự động cộng điểm vào <strong>Bản đồ kỹ năng</strong> của bạn:
              </p>

              <div className="space-y-3">
                {submission.updatedSkills.map((sk) => (
                  <div
                    key={sk.code}
                    className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        {sk.code}
                      </span>
                      <span className="font-mono font-bold text-[#10B981]">
                        {sk.previousScore} ➔ {sk.newScore}/100 ({sk.delta})
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {sk.name}
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#10B981] rounded-full transition-all"
                        style={{ width: `${sk.newScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setStudentSidebarTab('SKILL_MAP');
                  navigate('/app');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                Xem Bản Đồ Kỹ Năng Của Bạn →
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-[#10B981]" />
                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Bước Tiếp Theo Trên Lộ Trình Học
                </h3>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/live/sess-k01-05')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Vào Phòng Học Trực Tuyến (Buổi 5)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app/exams/exam-final-k01')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Thi Cuối Khóa 20 Câu Trắc Nghiệm (Camera Giám Sát)</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#10B981]" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
