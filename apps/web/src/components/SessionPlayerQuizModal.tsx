import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  MessageSquare,
  Award,
  Sparkles,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { formatTimestamp } from '../utils/academyLogic';
import { AiTutorCompanionSticker } from './BotanicalStickers';
import { studentLearningApi } from '../services/learning.api';

export const SessionPlayerQuizModal: React.FC = () => {
  const {
    activePlayerSessionId,
    setActivePlayerSessionId,
    sessions,
    submitSessionQuiz,
    updateWatchSec,
  } = useAcademy();

  const session = sessions.find((s) => s.id === activePlayerSessionId);
  const [activeMode, setActiveMode] = useState<'VIDEO_AI' | 'COMPETENCY_QUIZ'>('VIDEO_AI');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState<number>(2535);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([1, 1, 1]);
  const [lateCatchupSummary, setLateCatchupSummary] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{
    passed: boolean;
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
  } | null>(null);
  const [tutorQuestion, setTutorQuestion] = useState('');
  const [tutorReply, setTutorReply] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setCurrentSec(session.lastPositionSec || 1420);
      setQuizFeedback(null);
      setTutorReply(null);
      setLateCatchupSummary(null);
      setSelectedAnswers(session.quizQuestions.map((q) => q.correctIndex));
    }
  }, [session?.id]);

  if (!session) return null;

  const handleJumpTimestamp = async (sec: number) => {
    setCurrentSec(sec);
    await updateWatchSec(session.id, sec);
  };

  const handleSelectQuizOption = (qIdx: number, optIdx: number) => {
    setSelectedAnswers((prev) => {
      const next = [...prev];
      next[qIdx] = optIdx;
      return next;
    });
  };

  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await submitSessionQuiz(session.id, selectedAnswers);
    if (res) {
      setQuizFeedback({
        passed: res.passed,
        scorePercent: res.scorePercent,
        correctCount: res.correctCount,
        totalQuestions: res.totalQuestions,
      });
    }
  };

  const handleAskTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorQuestion.trim()) return;
    const questionText = tutorQuestion;
    setTutorQuestion('');
    const res = await studentLearningApi.askSessionAiTutor(
      session.id,
      questionText,
      currentSec
    );
    const firstCitation = res.citations?.[0];
    setTutorReply(
      `[Chỉ dẫn tại phút ${firstCitation?.label || '14:20'} · ${firstCitation?.slideLabel || 'Slide 12'}]: ${res.answerMd}`
    );
  };

  const handleLateCatchup = async () => {
    const res = await studentLearningApi.askSessionAiTutor(
      session.id,
      'Tóm tắt nhanh nội dung buổi học tính đến thời điểm hiện tại cho học viên vào muộn',
      currentSec
    );
    setLateCatchupSummary(res.answerMd);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={session.title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      onClick={() => setActivePlayerSessionId(null)}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                Buổi {session.sessionOrder.toString().padStart(2, '0')} · {session.hostInstructorName}
              </span>
              <span>·</span>
              {session.isCompleted ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[#10B981]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đã hoàn thành buổi học ({session.quizScore ?? 100}/100)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-[#F59E0B]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Làm xong bài tập ngắn để hoàn thành buổi học nhé
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              {session.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setActivePlayerSessionId(null)}
            aria-label="Đóng cửa sổ bài học"
            className="p-1.5 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
            <button
              type="button"
              onClick={() => setActiveMode('VIDEO_AI')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeMode === 'VIDEO_AI'
                  ? 'bg-white dark:bg-[#111A15] text-[#0F172A] dark:text-[#ECFDF5] shadow-2xs'
                  : 'text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#10B981]" />
              <span>1. Video Bài Giảng &amp; Hỏi Trợ Giảng AI</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('COMPETENCY_QUIZ')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeMode === 'COMPETENCY_QUIZ'
                  ? 'bg-[#10B981] text-white'
                  : 'text-[#059669] dark:text-[#34D399]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>2. Bài Tập Ngắn Cuối Buổi ({session.quizQuestions.length} câu)</span>
            </button>
          </div>

          {/* 1-Click Late Arrival Catch-up Button */}
          <button
            type="button"
            onClick={handleLateCatchup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Vào lớp muộn? Bấm tóm tắt 15 phút vừa qua</span>
          </button>
        </div>

        {lateCatchupSummary && (
          <div className="p-3.5 rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/90 border border-[#10B981] text-xs text-[#065F46] dark:text-emerald-200 leading-relaxed">
            {lateCatchupSummary}
          </div>
        )}

        {activeMode === 'VIDEO_AI' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Video Player Column */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-xl bg-[#0F172A] text-white p-5 space-y-4 border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#34D399]">
                    {session.status === 'LIVE' ? '● ĐANG HỌC TRỰC TUYẾN' : 'VIDEO BÀI GIẢNG FULL HD'}
                  </span>
                  <span className="font-mono">
                    {formatTimestamp(currentSec)} / {formatTimestamp(session.durationSeconds)}
                  </span>
                </div>

                <div className="py-8 px-4 rounded-lg bg-slate-900/90 border border-slate-800 text-center space-y-2">
                  <div className="text-sm font-bold text-emerald-300">
                    {session.title}
                  </div>
                  <p className="text-xs text-slate-300 max-w-md mx-auto">
                    {session.aiSummaryMd}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Tạm dừng' : 'Phát bài giảng'}</span>
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Bấm vào mốc phút giây bên dưới để nhảy tới đoạn thầy giảng nhé
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Các Đoạn Quan Trọng Trong Video (Bấm để nhảy tới đúng phút giây):
                </div>
                <div className="space-y-2">
                  {session.aiCitations.map((cit) => (
                    <button
                      key={cit.timestampLabel}
                      type="button"
                      onClick={() => handleJumpTimestamp(cit.timestampSec)}
                      className="w-full text-left p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                          {cit.topic}
                        </span>
                        <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          Phút [{cit.timestampLabel}]
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        {cit.snippet}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Contextual AI Tutor Q&A */}
            <div className="lg:col-span-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 pb-3 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                  <AiTutorCompanionSticker className="w-9 h-9 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Trợ Giảng AI Đồng Hành (Đang ở phút {formatTimestamp(currentSec)})
                    </div>
                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                      Chỉ tận tay tới từng giây video &amp; đúng trang tài liệu
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed bg-white dark:bg-[#111A15] p-3 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <strong>Ý chính buổi học:</strong> {session.aiSummaryMd}
                </div>

                {tutorReply && (
                  <div className="text-xs text-[#065F46] dark:text-emerald-300 bg-[#D1FAE5]/70 dark:bg-emerald-950/80 p-3 rounded-lg border border-[#10B981]/30 leading-relaxed">
                    {tutorReply}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <form onSubmit={handleAskTutor} className="flex gap-2">
                  <input
                    type="text"
                    value={tutorQuestion}
                    onChange={(e) => setTutorQuestion(e.target.value)}
                    placeholder={`Hỏi bài ngay tại phút ${formatTimestamp(currentSec)}...`}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs text-[#0F172A] dark:text-[#ECFDF5]"
                  />
                  <button
                    type="submit"
                    aria-label="Gửi câu hỏi cho Trợ giảng AI"
                    className="px-3 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-[#059669] cursor-pointer whitespace-nowrap"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => setActiveMode('COMPETENCY_QUIZ')}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Chuyển sang Làm Bài Tập Ngắn Cuối Buổi →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleQuizSubmit} className="space-y-5">
            <div className="p-4 rounded-xl bg-[#D1FAE5]/50 dark:bg-emerald-950/60 border border-[#10B981]/40 text-xs text-[#065F46] dark:text-emerald-300">
              <strong>Bài Tập Ngắn Củng Cố Kiến Thức:</strong> Bạn chỉ cần trả lời đúng từ 2/3 câu trở lên là hoàn thành buổi học hôm nay nhé. Câu nào chưa rõ đều có giải thích chi tiết ngay bên dưới!
            </div>

            {quizFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  quizFeedback.passed
                    ? 'bg-[#D1FAE5] dark:bg-emerald-950 border-[#10B981] text-[#065F46] dark:text-emerald-300'
                    : 'bg-amber-500/10 border-[#F59E0B] text-amber-800 dark:text-amber-300'
                }`}
              >
                <span>
                  {quizFeedback.passed
                    ? `Tuyệt vời! Bạn đạt ${quizFeedback.scorePercent}/100 (${quizFeedback.correctCount}/${quizFeedback.totalQuestions} câu đúng) — Buổi học đã được đánh dấu Hoàn thành nhé!`
                    : `Bạn đạt ${quizFeedback.scorePercent}/100 — Mình cùng xem lại gợi ý ở phút 18:45 và phút 42:15 rồi thử lại nhé!`}
                </span>
                {quizFeedback.passed && (
                  <button
                    type="button"
                    onClick={() => setActivePlayerSessionId(null)}
                    className="px-3 py-1.5 rounded bg-[#10B981] text-white font-semibold cursor-pointer"
                  >
                    Hoàn tất &amp; Đóng
                  </button>
                )}
              </div>
            )}

            <div className="space-y-4">
              {session.quizQuestions.map((q, qIdx) => (
                <div
                  key={q.id}
                  className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2.5"
                >
                  <div className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Câu {qIdx + 1}: {q.question}
                  </div>
                  <div className="space-y-1.5">
                    {q.options.map((opt, optIdx) => {
                      const chosen = selectedAnswers[qIdx] === optIdx;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSelectQuizOption(qIdx, optIdx)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            chosen
                              ? 'bg-[#D1FAE5] dark:bg-emerald-950 border-[#10B981] text-[#065F46] dark:text-emerald-300 font-semibold'
                              : 'bg-white dark:bg-[#111A15] border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          <span>{opt}</span>
                          {chosen && <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer"
              >
                Nộp Bài Tập &amp; Hoàn Thành Buổi Học
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
