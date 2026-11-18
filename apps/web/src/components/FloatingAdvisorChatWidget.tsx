import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  ArrowRight,
  Maximize2,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { catalogApi } from '../services/catalog.api';
import { formatVnd } from '../utils/academyLogic';
import { AiTutorCompanionSticker } from './BotanicalStickers';
import { FormattedChatMessage } from './FormattedChatMessage';

interface FloatingChatTurn {
  id: string;
  sender: 'USER' | 'AI';
  text: string;
  recommendedCohortCodes?: string[];
  timestamp: string;
}

const FLOATING_QUICK_PROMPTS = [
  'Mình mới bắt đầu thì nên học lớp nào trước?',
  'Tư vấn lộ trình Kỹ sư AI Thực chiến',
  'Lịch học buổi tối các lớp đang mở đăng ký?',
];

export const FloatingAdvisorChatWidget: React.FC = () => {
  const { currentPath, navigate, cohorts, courses, role, enrolledCohortIds } = useAcademy();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<FloatingChatTurn[]>([
    {
      id: 'float-welcome',
      sender: 'AI',
      text: 'Chào bạn nha! Mình là Trợ lý Tư vấn Lộ trình của **3T Academy**.\n\nBạn đang quan tâm đến **Trí tuệ nhân tạo & AI**, **Lập trình Backend**, **Kỹ thuật Dữ liệu** hay **Python & SQL Nền tảng** để mình gợi ý lớp phù hợp nhất cho bạn nhé?',
      recommendedCohortCodes: ['AI-ENG-2026-K01', 'PY-SQL-2026-K01'],
      timestamp: 'Trực tuyến',
    },
  ]);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, isSending]);

  // Hide widget on full-screen advisor view, live video room, or exam room to avoid overlapping controls
  if (
    currentPath === '/advisor' ||
    currentPath.startsWith('/live/') ||
    currentPath.includes('/sessions/') ||
    currentPath.startsWith('/app/assessments/') ||
    currentPath.startsWith('/app/exams/') ||
    currentPath.startsWith('/app/quizzes/')
  ) {
    return null;
  }

  const handleAskAdvisor = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || isSending) return;

    const userTurn: FloatingChatTurn = {
      id: `u-${Date.now()}`,
      sender: 'USER',
      text: clean,
      timestamp: 'Vừa xong',
    };
    setMessages((prev) => [...prev, userTurn]);
    setInput('');
    setIsSending(true);

    try {
      const res = await catalogApi.askCareerAdvisor(clean, 'Học viên 3T Academy');
      const matchedCohort = cohorts.find(
        (c) =>
          c.id === res.recommendedCohortId ||
          c.code.toLowerCase() === String(res.recommendedCohortId).toLowerCase()
      );
      const recCodes =
        res.recommendedCohortCodes && res.recommendedCohortCodes.length > 0
          ? res.recommendedCohortCodes
          : matchedCohort
          ? [matchedCohort.code]
          : [];

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'AI',
          text: res.replyText,
          recommendedCohortCodes: recCodes.slice(0, 2),
          timestamp: 'Vừa xong',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'AI',
          text: 'Hiện tại kết nối tư vấn đang bận một chút, bạn thử gửi lại câu hỏi sau vài giây nhé!',
          timestamp: 'Vừa xong',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    void handleAskAdvisor(input);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {/* Popup Chat Window */}
      {isOpen && (
        <div className="mb-3 w-[360px] sm:w-[410px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#065F46] to-[#10B981] text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0">
                <AiTutorCompanionSticker className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-bold truncate">
                    Trợ lý Tư vấn Lộ trình 3T
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-[#6EE7B7] animate-pulse shrink-0" />
                </div>
                <p className="text-[11px] text-emerald-100 truncate">
                  Tư vấn chọn lớp phù hợp · RAG chống ảo giác
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Mở trang Tư vấn toàn màn hình"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/advisor');
                }}
                className="p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Làm mới cuộc trò chuyện"
                onClick={() =>
                  setMessages([
                    {
                      id: `reset-${Date.now()}`,
                      sender: 'AI',
                      text: 'Mình đã làm mới cuộc trò chuyện. Bạn cần tư vấn khóa học hay lộ trình công việc nào cứ nhắn mình nha!',
                      recommendedCohortCodes: ['AI-ENG-2026-K01'],
                      timestamp: 'Vừa xong',
                    },
                  ])
                }
                className="p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Đóng cửa sổ chat"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div
            ref={scrollContainerRef}
            className="p-4 space-y-3.5 max-h-[380px] min-h-[280px] overflow-y-auto bg-[#F8FAFC] dark:bg-[#0B120E]"
          >
            {messages.map((msg) => {
              const isAi = msg.sender === 'AI';
              const recCohorts = (msg.recommendedCohortCodes ?? [])
                .map((code) => cohorts.find((c) => c.code === code))
                .filter((c): c is NonNullable<typeof c> => Boolean(c));

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 ${
                      isAi
                        ? 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#0F172A] dark:text-[#ECFDF5] shadow-2xs'
                        : 'bg-[#10B981] text-white'
                    }`}
                  >
                    <FormattedChatMessage
                      text={msg.text}
                      isUser={!isAi}
                      className="text-xs leading-relaxed"
                    />

                    {/* Recommended Cohorts inside AI bubble */}
                    {isAi && recCohorts.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                          Lớp đang mở ghi danh gợi ý cho bạn:
                        </div>
                        {recCohorts.map((ch) => {
                          const course = courses.find((cr) => cr.id === ch.courseId);
                          const isEnrolled = enrolledCohortIds.includes(ch.id);
                          return (
                            <div
                              key={ch.id}
                              className="p-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col gap-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                  {ch.code}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                  {formatVnd(ch.tuitionVnd)}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5] line-clamp-1">
                                {course?.title ?? ch.name}
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="inline-flex items-center gap-1 text-[10px] text-[#475569] dark:text-[#94A3B8]">
                                  <Calendar className="w-3 h-3 text-[#10B981]" />
                                  KG: {ch.startDate}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsOpen(false);
                                    if (isEnrolled) {
                                      navigate(`/app/cohorts/${ch.id}`);
                                    } else if (course?.slug) {
                                      navigate(`/courses/${course.slug}`);
                                    } else if (role === 'GUEST') {
                                      navigate('/login');
                                    } else {
                                      navigate(`/checkout/${ch.code}`);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-semibold transition-colors cursor-pointer"
                                >
                                  <span>{isEnrolled ? 'Vào lớp' : 'Xem chi tiết'}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 text-xs text-[#059669] dark:text-[#34D399] px-2 py-1">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                <span>Trợ lý 3T đang tìm lộ trình phù hợp cho bạn...</span>
              </div>
            )}
          </div>

          {/* Quick prompts */}
          <div className="px-3.5 py-2 bg-white dark:bg-[#111A15] border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {FLOATING_QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isSending}
                onClick={() => void handleAskAdvisor(q)}
                className="px-2.5 py-1 rounded-full bg-[#F1F5F9] dark:bg-[#16221B] hover:bg-[#E6F7EF] dark:hover:bg-[#1E2D24] text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] hover:text-[#059669] dark:hover:text-[#34D399] whitespace-nowrap transition-colors cursor-pointer shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-white dark:bg-[#111A15] border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi về khóa học, lịch học, học phí..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs text-[#0F172A] dark:text-[#ECFDF5] focus:outline-none focus:border-[#10B981]"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="p-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white transition-colors cursor-pointer shrink-0"
              title="Gửi câu hỏi"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Circular / Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Mở khung chat tư vấn lộ trình"
        className="group flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full bg-gradient-to-r from-[#059669] to-[#10B981] hover:from-[#047857] hover:to-[#059669] text-white shadow-lg hover:shadow-xl transition-all cursor-pointer border border-white/20"
      >
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
          {isOpen ? (
            <X className="w-4 h-4 text-white" />
          ) : (
            <MessageCircle className="w-4 h-4 text-white" />
          )}
          {!isOpen && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#A7F3D0] border-2 border-[#059669]" />
          )}
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1 text-xs font-bold leading-none">
            <Sparkles className="w-3 h-3 text-[#A7F3D0]" />
            <span>{isOpen ? 'Thu gọn tư vấn' : 'Tư vấn lộ trình'}</span>
          </div>
          <div className="text-[10px] text-emerald-100 leading-tight mt-0.5 hidden sm:block">
            Hỏi đáp nhanh cùng 3T Academy
          </div>
        </div>
      </button>
    </div>
  );
};
