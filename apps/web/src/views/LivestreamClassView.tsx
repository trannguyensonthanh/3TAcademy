import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  Heart,
  Sparkles,
  LogOut,
  Send,
  MessageSquare,
  HelpCircle,
  FileText,
  Users,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  AvatarWithFallback,
  AVATAR_MINH_KHOA,
} from '../components/BotanicalStickers';
import { learningApi } from '../services/learning.api';

interface LiveChatMessage {
  id: string;
  sender: string;
  roleLabel?: string;
  time: string;
  text: string;
}

interface LiveQuestionItem {
  id: string;
  author: string;
  time: string;
  question: string;
  votes: number;
  answeredByInstructor?: boolean;
}

interface FloatingReaction {
  id: number;
  label: string;
  leftPct: number;
}

const INITIAL_LIVE_CHAT: LiveChatMessage[] = [];

const INITIAL_LIVE_QA: LiveQuestionItem[] = [];

const LIVE_TRANSCRIPT_LINES: { time: string; speaker: string; text: string }[] = [];

export const LivestreamClassView: React.FC<{
  sessionId: string;
  isGuestEntry?: boolean;
}> = ({ sessionId, isGuestEntry = false }) => {
  const { navigate, role, sessions, cohorts, enrolledCohortIds, currentUser } = useAcademy();

  // Guest speaker 1-click entry mode (/live/guest)
  const [guestMode, setGuestMode] = useState<boolean>(isGuestEntry);
  const [joinedAsVerifiedGuest, setJoinedAsVerifiedGuest] = useState<boolean>(false);
  const [guestInviteToken, setGuestInviteToken] = useState<string>('');
  const [guestVerifyError, setGuestVerifyError] = useState<string | null>(null);
  const [isVerifyingGuest, setIsVerifyingGuest] = useState<boolean>(false);
  const [guestDisplayName, setGuestDisplayName] = useState<string>('');
  const [guestRoleHeadline, setGuestRoleHeadline] = useState<string>('');
  const [joinedGuestName, setJoinedGuestName] = useState<string>(
    currentUser?.fullName || 'Học viên'
  );

  // Real Webcam via navigator.mediaDevices.getUserMedia({ video: true })
  const streamRef = useRef<MediaStream | null>(null);
  const guestVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveSelfVideoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [webcamNotice, setWebcamNotice] = useState<string | null>(null);

  // Bottom bar controls
  const [micOn, setMicOn] = useState<boolean>(true);
  const [camOn, setCamOn] = useState<boolean>(true);
  const [screenSharing, setScreenSharing] = useState<boolean>(false);
  const [handRaised, setHandRaised] = useState<boolean>(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Right 3-tab panel: CHAT | QA | LIVE_SUMMARY
  const [rightTab, setRightTab] = useState<'CHAT' | 'QA' | 'LIVE_SUMMARY'>('LIVE_SUMMARY');
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>(INITIAL_LIVE_CHAT);
  const [chatInput, setChatInput] = useState<string>('');

  const [qaList, setQaList] = useState<LiveQuestionItem[]>(INITIAL_LIVE_QA);
  const [newQaText, setNewQaText] = useState<string>('');

  const [showLateJoinSummary, setShowLateJoinSummary] = useState<boolean>(true);
  const [lateJoinAiSummaryText, setLateJoinAiSummaryText] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  useEffect(() => {
    if (webcamActive && streamRef.current) {
      if (guestVideoRef.current) {
        guestVideoRef.current.srcObject = streamRef.current;
      }
      if (liveSelfVideoRef.current) {
        liveSelfVideoRef.current.srcObject = streamRef.current;
      }
    }
  }, [webcamActive, guestMode]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleEnableRealWebcam = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebcamNotice(
        'Trình duyệt hiện tại không có thiết bị Camera vật lý — đã bật chế độ khung hình đại diện an toàn.'
      );
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = mediaStream;
      setWebcamActive(true);
      setCamOn(true);
      setWebcamNotice('Đã bật Camera thật trên trình duyệt thành công!');
      if (guestVideoRef.current) {
        guestVideoRef.current.srcObject = mediaStream;
      }
      if (liveSelfVideoRef.current) {
        liveSelfVideoRef.current.srcObject = mediaStream;
      }
    } catch {
      setWebcamNotice(
        'Trình duyệt chưa cấp quyền Camera hoặc không tìm thấy Webcam — đã giữ khung hình đại diện an toàn.'
      );
    }
  };

  const triggerReaction = (label: string) => {
    const id = Date.now() + Math.random();
    const leftPct = 20 + Math.floor(Math.random() * 55);
    setFloatingReactions((prev) => [...prev, { id, label, leftPct }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2200);
  };

  const activeSession =
    sessions.find((s) => s.id === sessionId) ??
    sessions.find((s) => s.status === 'LIVE') ??
    sessions[0] ?? {
      id: sessionId,
      cohortId: '',
      sessionOrder: 1,
      title: 'Đang tải phòng học trực tuyến...',
      status: 'LIVE' as const,
      scheduledStart: '',
      scheduledEnd: '',
      durationSeconds: 3600,
      lastPositionSec: 0,
      isCompleted: false,
      quizScore: 0,
      hostInstructorName: '',
      attachmentsCount: 0,
      aiSummaryMd: '',
      aiCitations: [],
    };
  const activeCohort =
    cohorts.find((c) => c.id === activeSession.cohortId) ?? cohorts[0];

  const isEnrolledOrAuthorized =
    role === 'INSTRUCTOR' ||
    role === 'ADMIN' ||
    isGuestEntry ||
    joinedAsVerifiedGuest ||
    enrolledCohortIds.includes(activeSession.cohortId);

  useEffect(() => {
    let active = true;
    const loadSessionRealtimeData = async () => {
      try {
        const [discussions, liveChat] = await Promise.all([
          learningApi.getSessionDiscussions(activeSession.id),
          learningApi.getLiveSessionChat(activeSession.id),
        ]);
        if (!active) return;
        if (discussions.length > 0) {
          setQaList(
            discussions.map((d, idx) => ({
              id: d.id,
              author: d.authorName,
              time: d.timestampLabel || d.createdAt,
              question: d.questionTitle || d.questionBody,
              votes: 18 - idx * 3,
              answeredByInstructor: d.verifiedByStaff || d.isResolved,
            }))
          );
        }
        if (liveChat.length > 0) {
          setChatMessages(
            liveChat.map((m) => ({
              id: m.id,
              sender: m.senderName,
              roleLabel: m.isStaff ? m.senderRole : undefined,
              time: m.timeLabel,
              text: m.text,
            }))
          );
        }
      } catch {
        // Keep existing Q&A and Chat lists
      }
    };
    void loadSessionRealtimeData();
    return () => {
      active = false;
    };
  }, [activeSession.id]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    const senderName = currentUser?.fullName || joinedGuestName || 'Nguyễn Văn An';
    const roleLabel =
      role === 'INSTRUCTOR'
        ? 'Giảng viên'
        : joinedAsVerifiedGuest
        ? 'Khách mời'
        : undefined;
    setChatInput('');
    try {
      const created = await learningApi.sendLiveSessionChat(activeSession.id, text);
      if (created?.id) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: created.id,
            sender: created.senderName || senderName,
            roleLabel: roleLabel || (created.isStaff ? created.senderRole : undefined),
            time: created.timeLabel || 'Vừa xong',
            text: created.text,
          },
        ]);
        return;
      }
    } catch {
      // Fallback below
    }
    const msg: LiveChatMessage = {
      id: `lc-${Date.now()}`,
      sender: senderName,
      roleLabel,
      time: 'Vừa xong',
      text,
    };
    setChatMessages((prev) => [...prev, msg]);
  };

  const handleAskQa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQaText.trim()) return;
    const questionText = newQaText.trim();
    const authorName = currentUser?.fullName || joinedGuestName || 'Nguyễn Văn An';
    setNewQaText('');
    const res = await learningApi.createSessionQuestion(
      activeSession.id,
      questionText,
      860,
      questionText
    );
    const createdThread = res.thread;
    const item: LiveQuestionItem = {
      id: createdThread?.id || res.threadId || `lqa-${Date.now()}`,
      author: createdThread?.authorName || authorName,
      time: createdThread?.timestampLabel || 'Vừa xong',
      question: createdThread?.questionTitle || questionText,
      votes: 1,
      answeredByInstructor: Boolean(createdThread?.verifiedByStaff),
    };
    setQaList((prev) => [item, ...prev]);
  };

  const handleUpvoteQa = (id: string) => {
    setQaList((prev) =>
      prev
        .map((q) => (q.id === id ? { ...q, votes: q.votes + 1 } : q))
        .sort((a, b) => b.votes - a.votes)
    );
  };

  const handleRequestLateJoinSummary = async () => {
    setShowLateJoinSummary(true);
    setIsGeneratingSummary(true);
    try {
      const res = await learningApi.askSessionAiTutor(
        activeSession.id,
        'Tóm tắt nhanh 10 phút vừa qua cho học viên vào lớp muộn'
      );
      if (res?.answerMd) {
        setLateJoinAiSummaryText(res.answerMd);
      }
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleVerifyAndJoinGuestStage = async () => {
    setIsVerifyingGuest(true);
    setGuestVerifyError(null);
    try {
      const verified = await learningApi.verifyGuestSpeakerToken(
        guestInviteToken,
        activeSession.id
      );
      if (!verified.valid) {
        setGuestVerifyError('Mã mời diễn giả không hợp lệ hoặc đã hết hạn.');
        return;
      }
      setJoinedGuestName(guestDisplayName || verified.guestRoleLabel || 'Diễn giả Khách mời');
      setJoinedAsVerifiedGuest(true);
      setGuestMode(false);
    } catch {
      setGuestVerifyError('Mã mời diễn giả không hợp lệ hoặc đã hết hạn.');
    } finally {
      setIsVerifyingGuest(false);
    }
  };

  // ============================================================================
  // MÀN HÌNH THAM GIA NHANH CHO DIỄN GIẢ KHÁCH MỜI (/live/guest)
  // ============================================================================
  if (guestMode) {
    return (
      <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl bg-[#111A15] border border-[#1E2D24] p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/15 border border-[#10B981]/40 text-[#34D399] text-xs font-bold">
              <UserPlus className="w-3.5 h-3.5" />
              <span>LINK THAM GIA NHANH 1 CHẠM CHO DIỄN GIẢ KHÁCH MỜI</span>
            </span>
            <span className="font-mono text-xs text-red-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
              ĐANG LIVE
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Chào mừng Chuyên gia đến với Phòng học Trực tuyến 3T Academy
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Lớp Kỹ Sư AI Thực Chiến — Khóa K01 · Bạn chỉ cần nhập Tên hiển thị, kiểm tra Mic/Camera và vào thẳng phòng học chỉ với 1 chạm (không cần tạo tài khoản).
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tên hiển thị của bạn trên sân khấu lớp học:
              </label>
              <input
                type="text"
                value={guestDisplayName}
                onChange={(e) => setGuestDisplayName(e.target.value)}
                placeholder="Nhập họ tên và chức danh của bạn..."
                className="w-full px-4 py-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] focus:border-[#10B981] text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Đơn vị công tác / Chuyên môn chia sẻ:
              </label>
              <input
                type="text"
                value={guestRoleHeadline}
                onChange={(e) => setGuestRoleHeadline(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] focus:border-[#10B981] text-sm text-white focus:outline-none"
              />
            </div>

            {/* Quick Mic & Real Camera Check */}
            <div className="p-4 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-3">
              {webcamActive && (
                <video
                  ref={guestVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-40 rounded-lg object-cover border border-[#10B981]"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    name={guestDisplayName || 'Khách mời'}
                    className="w-11 h-11 rounded-full ring-2 ring-[#10B981]"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-white">{guestDisplayName}</div>
                    <div className="text-emerald-400">{guestRoleHeadline}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEnableRealWebcam}
                    className="px-3 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Bật Camera thật</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMicOn((prev) => !prev)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      micOn
                        ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                        : 'bg-red-500/20 text-red-300 border border-red-500/50'
                    }`}
                  >
                    {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{micOn ? 'Mic: Đang bật' : 'Mic: Đã tắt'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamOn((prev) => !prev)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      camOn
                        ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                        : 'bg-red-500/20 text-red-300 border border-red-500/50'
                    }`}
                  >
                    {camOn ? (
                      <Video className="w-3.5 h-3.5" />
                    ) : (
                      <VideoOff className="w-3.5 h-3.5" />
                    )}
                    <span>{camOn ? 'Camera: Đang bật' : 'Camera: Đã tắt'}</span>
                  </button>
                </div>
              </div>

              {webcamNotice && (
                <p className="text-[11px] text-emerald-300">{webcamNotice}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleVerifyAndJoinGuestStage}
            disabled={isVerifyingGuest}
            className="w-full py-3.5 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold shadow-md transition-colors cursor-pointer disabled:opacity-60"
          >
            {isVerifyingGuest
              ? 'Đang xác thực Token Diễn giả...'
              : 'Vào thẳng Phòng học Trực tuyến ngay (1 chạm) →'}
          </button>
          {guestVerifyError && (
            <p className="text-xs text-red-400 text-center">{guestVerifyError}</p>
          )}
        </div>
      </div>
    );
  }

  if (!isEnrolledOrAuthorized) {
    return (
      <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl bg-[#111A15] border-2 border-amber-500/60 p-8 text-center space-y-4">
          <div className="text-xs font-mono font-bold text-amber-400">
            403 FORBIDDEN · NOT_ENROLLED_IN_COHORT
          </div>
          <h1 className="text-xl font-bold text-white">
            Bạn chưa ghi danh vào {activeCohort?.name || 'Đợt học này'}
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Phòng học trực tuyến Livestream chỉ dành cho Học viên chính thức của đợt học ({activeCohort?.code}), Giảng viên phụ trách hoặc Diễn giả khách mời có mã mời hợp lệ.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/courses')}
              className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
            >
              Đăng ký Đợt học ngay →
            </button>
            <button
              type="button"
              onClick={() => setGuestMode(true)}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-emerald-300 cursor-pointer"
            >
              Vào bằng Link Diễn giả Khách mời
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // GIAO DIỆN PHÒNG HỌC TRỰC TUYẾN LIVESTREAM (/live/:sessionId)
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex flex-col justify-between pb-20">
      {/* Top Header of Live Classroom */}
      <header className="px-6 py-3.5 bg-[#111A15] border-b border-[#1E2D24] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-500/20 border border-[#EF4444]/60 text-[#EF4444] font-mono text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
            <span>ĐANG HỌC TRỰC TUYẾN</span>
          </span>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white">
              {activeCohort?.name || 'Lớp Kỹ Sư AI Thực Chiến — Khóa K01'} · Buổi {activeSession.sessionOrder}: {activeSession.title}
            </h1>
            <p className="text-[11px] text-slate-400">
              Mã phòng: {activeSession.id} · Giảng viên phụ trách chính: {activeSession.hostInstructorName || 'TS. Trần Minh Khoa'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-emerald-300">
            <Users className="w-3.5 h-3.5 text-[#10B981]" />
            <span>46 thành viên đang trong lớp</span>
          </span>

          <button
            type="button"
            onClick={() => setGuestMode(true)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-emerald-300 cursor-pointer"
          >
            Màn hình Khách mời 1 chạm (/live/guest)
          </button>
        </div>
      </header>

      {/* Main 2-Column Live Stage + Right 3-Tab Panel */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SÂN KHẤU CHÍNH (8 CỘT) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Instructor Screen Share & Live Coding Stage */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-xl relative">
            <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-emerald-400 font-semibold">
                Màn hình chia sẻ bài giảng &amp; Viết code trực tiếp — TS. Trần Minh Khoa
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Slide trang 14 · hybrid_search_pipeline.ts
              </span>
            </div>

            <div className="p-6 space-y-4 relative min-h-[340px] flex flex-col justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 text-xs font-mono">
                  Thực hành trực tiếp: Kết hợp tìm kiếm từ khóa &amp; ý nghĩa câu hỏi
                </div>
                <pre className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
{`export async function searchEnterpriseKnowledge(query: string, departmentId: string) {
  // Bước 1: Lọc tài liệu thuộc đúng phòng ban của nhân viên
  const [keywordHits, semanticHits] = await Promise.all([
    findByExactKeyword(query, departmentId, { limit: 20 }),
    findBySemanticMeaning(query, departmentId, { limit: 20 }),
  ]);

  // Bước 2: Gộp kết quả và giữ nguyên số trang trích dẫn gốc
  return mergeAndRankTopPassages(keywordHits, semanticHits, { topK: 5 });
}`}
                </pre>
              </div>

              {/* Floating Emoji Reactions */}
              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  style={{ left: `${r.leftPct}%` }}
                  className=" bottom-14 absolute px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white animate-bounce pointer-events-none"
                >
                  {r.label}
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
                <span>
                  Đang giảng: <strong>Vì sao dùng Promise.all giúp giảm một nửa thời gian chờ?</strong>
                </span>
                {handRaised && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold">
                    <Hand className="w-3.5 h-3.5" />
                    Bạn đang giơ tay xin phát biểu
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Khung hình Camera của Giảng viên chính & Diễn giả khách mời */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-xl bg-[#111A15] border-2 border-[#10B981] flex items-center gap-3">
              <img
                src={AVATAR_MINH_KHOA}
                alt="TS. Trần Minh Khoa"
                className="w-11 h-11 rounded-full object-cover shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {activeSession.hostInstructorName || 'TS. Trần Minh Khoa'}
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold">
                  Giảng viên chính · Đang nói
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#111A15] border border-[#1E2D24] space-y-2">
              {webcamActive ? (
                <video
                  ref={liveSelfVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-24 rounded-lg object-cover border border-[#10B981]"
                />
              ) : (
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    name={joinedGuestName}
                    className="w-11 h-11 rounded-full shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{joinedGuestName}</div>
                    <div className="text-[11px] text-emerald-300 truncate">
                      Diễn giả / Học viên · Đã kết nối
                    </div>
                  </div>
                </div>
              )}
              {webcamNotice && (
                <div className="text-[10px] text-emerald-300 truncate">{webcamNotice}</div>
              )}
            </div>
          </div>

          {/* THANH ĐIỀU KHIỂN PHÍA DƯỚI */}
          <div className="rounded-2xl bg-[#111A15] border border-[#1E2D24] p-4 flex flex-wrap items-center justify-between gap-3">
            {/* Mic, Camera, Bật Camera thật, Chia sẻ màn hình, Giơ tay phát biểu */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleEnableRealWebcam}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                <Video className="w-4 h-4" />
                <span>{webcamActive ? 'Webcam thật: Đang bật' : 'Bật Camera thật'}</span>
              </button>

              <button
                type="button"
                onClick={() => setMicOn((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  micOn
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {micOn ? <Mic className="w-4 h-4 text-[#10B981]" /> : <MicOff className="w-4 h-4" />}
                <span>{micOn ? 'Tắt Mic' : 'Bật Mic'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCamOn((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  camOn
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {camOn ? (
                  <Video className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <VideoOff className="w-4 h-4" />
                )}
                <span>{camOn ? 'Tắt Camera' : 'Bật Camera'}</span>
              </button>

              <button
                type="button"
                onClick={() => setScreenSharing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  screenSharing
                    ? 'bg-[#10B981] text-white'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <MonitorUp className="w-4 h-4" />
                <span>{screenSharing ? 'Đang chia sẻ màn hình' : 'Chia sẻ màn hình'}</span>
              </button>

              <button
                type="button"
                onClick={() => setHandRaised((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  handRaised
                    ? 'bg-[#F59E0B] text-slate-950'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Hand className="w-4 h-4" />
                <span>{handRaised ? 'Hạ tay xuống' : 'Giơ tay phát biểu'}</span>
              </button>
            </div>

            {/* Thanh Thả biểu tượng cảm xúc (Tim, Vỗ tay, Tuyệt vời) + Nút Rời lớp */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#090F0C] border border-[#1E2D24]">
                <button
                  type="button"
                  onClick={() => triggerReaction('❤️ Thả tim bài giảng')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-rose-300 cursor-pointer"
                >
                  ❤️ Tim
                </button>
                <button
                  type="button"
                  onClick={() => triggerReaction('👏 Vỗ tay tán thưởng')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-amber-300 cursor-pointer"
                >
                  👏 Vỗ tay
                </button>
                <button
                  type="button"
                  onClick={() => triggerReaction('🌟 Tuyệt vời dễ hiểu')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-emerald-300 cursor-pointer"
                >
                  🌟 Tuyệt vời
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    role === 'INSTRUCTOR'
                      ? '/teach'
                      : role === 'ADMIN'
                      ? '/admin'
                      : activeSession.cohortId
                      ? `/app/cohorts/${activeSession.cohortId}`
                      : '/app'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{role === 'INSTRUCTOR' ? 'Kết thúc & Về Cổng Giảng Viên' : 'Rời lớp'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* CỘT TƯƠNG TÁC BÊN PHẢI (4 CỘT — 3 TAB GỌN GÀNG) */}
        <aside className="lg:col-span-4 rounded-2xl bg-[#111A15] border border-[#1E2D24] flex flex-col overflow-hidden">
          {/* 3-Tab Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1.5 bg-[#090F0C] border-b border-[#1E2D24]">
            <button
              type="button"
              onClick={() => setRightTab('CHAT')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                rightTab === 'CHAT'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('QA')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                rightTab === 'QA'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Hỏi đáp ({qaList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('LIVE_SUMMARY')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                rightTab === 'LIVE_SUMMARY'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Tóm tắt bài giảng</span>
            </button>
          </div>

          {/* TAB 1: TRÒ CHUYỆN LỚP HỌC (CHAT) */}
          {rightTab === 'CHAT' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[480px]">
              <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {msg.sender}{' '}
                        {msg.roleLabel && (
                          <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                            {msg.roleLabel}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">{msg.time}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-[#1E2D24]">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Nhắn trao đổi cùng cả lớp..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: HỎI ĐÁP CÓ BÌNH CHỌN (HỎI ĐÁP) */}
          {rightTab === 'QA' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[480px]">
              <div className="space-y-3 overflow-y-auto max-h-[360px] pr-1">
                <div className="text-[11px] text-slate-400">
                  Thả tim bình chọn câu hỏi bạn cũng đang thắc mắc để đẩy lên đầu cho Giảng viên giải đáp trước nhé:
                </div>
                {qaList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300">
                        {item.author} · {item.time}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpvoteQa(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono font-bold cursor-pointer"
                      >
                        <Heart className="w-3 h-3 fill-current" />
                        <span>{item.votes}</span>
                      </button>
                    </div>
                    <p className="text-white font-medium leading-relaxed">{item.question}</p>
                    {item.answeredByInstructor && (
                      <div className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đang được Giảng viên giải đáp trên màn hình</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAskQa} className="flex gap-2 pt-2 border-t border-[#1E2D24]">
                <input
                  type="text"
                  value={newQaText}
                  onChange={(e) => setNewQaText(e.target.value)}
                  placeholder="Đặt câu hỏi cho Giảng viên..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Gửi câu hỏi
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: TRỢ LÝ PHÒNG LIVE (TÓM TẮT BÀI GIẢNG) */}
          {rightTab === 'LIVE_SUMMARY' && (
            <div className="p-4 space-y-4 min-h-[480px]">
              <button
                type="button"
                onClick={handleRequestLateJoinSummary}
                disabled={isGeneratingSummary}
                className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {isGeneratingSummary
                    ? 'Trợ giảng AI đang tổng hợp 10 phút vừa qua...'
                    : 'Tóm tắt nhanh 10 phút vừa qua (Dành cho bạn vào lớp muộn)'}
                </span>
              </button>

              {showLateJoinSummary && (
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-[#10B981]/60 space-y-2.5 text-xs">
                  <div className="font-bold text-emerald-300 flex items-center justify-between">
                    <span>3 Ý CHÍNH THẦY VỪA GIẢNG TRONG 10 PHÚT QUA:</span>
                    <span className="font-mono text-[10px]">19:35 - 19:45</span>
                  </div>
                  {lateJoinAiSummaryText && (
                    <p className="text-emerald-200 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-emerald-500/30">
                      {lateJoinAiSummaryText}
                    </p>
                  )}
                  <ul className="space-y-1.5 text-slate-200 leading-relaxed">
                    <li>
                      • <strong>Ý 1:</strong> Luôn lọc tài liệu theo đúng phòng ban của nhân viên trước khi tìm kiếm để đảm bảo phân quyền an toàn.
                    </li>
                    <li>
                      • <strong>Ý 2:</strong> Chạy song song tìm kiếm từ khóa (bắt trúng mã hợp đồng) và tìm kiếm ngữ nghĩa (hiểu câu hỏi tự nhiên) bằng <code>Promise.all</code>.
                    </li>
                    <li>
                      • <strong>Ý 3:</strong> Giữ nguyên số trang gốc ở kết quả trả về để người dùng bấm vào kiểm chứng ngay.
                    </li>
                  </ul>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-300">
                  Lời giảng trực tiếp đang được ghi lại theo từng phút:
                </div>
                {LIVE_TRANSCRIPT_LINES.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400">{line.speaker}</span>
                      <span className="font-mono text-[11px] text-slate-400">{line.time}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{line.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
