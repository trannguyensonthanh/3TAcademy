import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  CheckCircle2,
  FileText,
  Download,
  Search,
  Send,
  Sparkles,
  ArrowLeft,
  Award,
  BookOpen,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { formatTimestamp } from '../utils/academyLogic';
import { AiTutorCompanionSticker } from '../components/BotanicalStickers';
import {
  SessionVideoPlayer,
  type VideoChapterItem,
} from '../components/SessionVideoPlayer';
import { studentLearningApi } from '../services/learning.api';
import { useAsyncQuery } from '../hooks/useAsyncData';
import type { ClassSession } from '../types/domain';

interface TranscriptLine {
  sec: number;
  timeLabel: string;
  speaker: string;
  text: string;
  slidePage: number;
}

interface AiTutorMessage {
  id: string;
  sender: 'STUDENT' | 'AI_TUTOR';
  text: string;
  citations?: {
    label: string;
    jumpSec: number;
    slideLabel?: string;
  }[];
}

export const SessionVideoRoomView: React.FC<{
  cohortId: string;
  sessionId: string;
}> = ({ cohortId, sessionId }) => {
  const {
    cohorts,
    sessions,
    materials,
    discussions,
    enrolledCohortIds,
    role,
    currentUser,
    updateWatchSec,
    navigate,
  } = useAcademy();

  const lastSyncedSecRef = useRef<number>(0);

  const cohort =
    cohorts.find(
      (c) => String(c.id) === String(cohortId) || c.code.toLowerCase() === cohortId.toLowerCase()
    ) ?? {
      id: cohortId,
      courseId: '',
      code: cohortId,
      name: '',
      mode: 'HYBRID' as const,
      startDate: '',
      endDate: '',
      scheduleLabel: '',
      scheduleSlots: [],
      tuitionVnd: 0,
      capacity: 0,
      enrolledCount: 0,
      seatsRemaining: 0,
      status: 'UPCOMING' as const,
      staff: [],
    };

  const fallbackSession: ClassSession =
    sessions.find((s) => String(s.id) === String(sessionId)) ?? {
      id: sessionId,
      cohortId: cohort.id,
      sessionOrder: 1,
      title: 'Đang tải buổi học...',
      activityTags: [],
      status: 'REPLAY_READY',
      scheduledStart: '',
      scheduledEnd: '',
      videoR2Key: '',
      videoProvider: 'R2_HLS_AES128',
      durationSeconds: 600,
      lastPositionSec: 0,
      isCompleted: false,
      quizStatus: 'NOT_STARTED',
      quizScore: 0,
      quizQuestions: [],
      hostInstructorName: '',
      attachmentsCount: 0,
      aiSummaryMd: '',
      aiCitations: [],
    };

  const {
    data: sessionDetail,
    isLoading: isSessionLoading,
    hasSettled: hasSessionSettled,
    error: sessionError,
    errorStatus: sessionErrorStatus,
    errorCode: sessionErrorCode,
    refetch: refetchSession,
  } = useAsyncQuery(
    () => studentLearningApi.getSessionDetail(cohortId, sessionId),
    {
      session: fallbackSession,
      videoUrl: '',
      transcript: [],
      attachments: [],
      quizSummary: {
        assessmentId: `quiz-${fallbackSession.id}`,
        questionCount: 10,
        passingScoreOutOf10: 7.0,
        isCompleted: fallbackSession.isCompleted,
        bestScorePercent: fallbackSession.quizScore,
      },
      discussions: [],
      isPlaceholder: true,
    } as {
      session: typeof fallbackSession;
      videoUrl: string;
      playbackType?: 'MP4' | 'HLS' | 'NONE';
      storageKey?: string;
      chapters?: { sec: number; timeLabel: string; title: string; slideRange: string }[];
      aiChatHistory?: {
        id: string;
        role: 'AI' | 'USER';
        content: string;
        citations?: { label: string; jumpSec: number; slideLabel: string }[];
      }[];
      accessDenied?: boolean;
      isPlaceholder?: boolean;
      transcript: TranscriptLine[];
      attachments: typeof materials;
      quizSummary: {
        assessmentId: string;
        questionCount: number;
        passingScoreOutOf10: number;
        isCompleted: boolean;
        bestScorePercent?: number | null;
      };
      discussions: typeof discussions;
    },
    [cohortId, sessionId, role, currentUser?.id]
  );

  const session = sessionDetail.session ?? fallbackSession;
  const quizAssessmentId =
    sessionDetail.quizSummary?.assessmentId ||
    session.assessmentId ||
    `quiz-${session.id}`;
  const videoUrl = sessionDetail.videoUrl || '';
  const transcriptLines = sessionDetail.transcript ?? [];
  const sessionAttachments =
    sessionDetail.attachments && sessionDetail.attachments.length > 0
      ? sessionDetail.attachments
      : materials;

  const { data: sessionDiscussions, refetch: refetchDiscussions } = useAsyncQuery(
    () => studentLearningApi.getSessionDiscussions(session.id),
    sessionDetail.discussions ?? discussions,
    [session.id]
  );

  const effectiveDiscussions =
    sessionDiscussions && sessionDiscussions.length > 0
      ? sessionDiscussions
      : sessionDetail.discussions ?? discussions;

  const querySeekSec = (() => {
    if (typeof window === 'undefined') return null;
    const tParam = new URLSearchParams(window.location.search).get('t');
    if (!tParam) return null;
    const parsed = Number(tParam);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  })();

  const initialResumeSec =
    querySeekSec !== null ? querySeekSec : Math.max(0, session.lastPositionSec || 0);

  const [currentSec, setCurrentSec] = useState<number>(initialResumeSec);
  const [seekRequest, setSeekRequest] = useState<{
    sec: number;
    label?: string;
    nonce: number;
  } | null>(null);

  const videoChapters: VideoChapterItem[] =
    sessionDetail.chapters && sessionDetail.chapters.length > 0
      ? sessionDetail.chapters.map((ch, idx, arr) => ({
          id: `chap-api-${idx + 1}`,
          title: ch.title,
          startSec: ch.sec,
          endSec: arr[idx + 1] ? arr[idx + 1].sec - 1 : Math.max(session.durationSeconds || 600, ch.sec + 60),
          label: `${ch.timeLabel} · ${ch.slideRange}`,
        }))
      : [];

  const [rightTab, setRightTab] = useState<'TRANSCRIPT' | 'AI_TUTOR' | 'CLASS_QA'>('AI_TUTOR');
  const [transcriptSearch, setTranscriptSearch] = useState<string>('');
  const [aiMessages, setAiMessages] = useState<AiTutorMessage[]>([]);
  const [aiInput, setAiInput] = useState<string>('');
  const [seekBanner, setSeekBanner] = useState<string | null>(null);
  const [qaTitle, setQaTitle] = useState<string>('');

  useEffect(() => {
    if (sessionDetail.aiChatHistory && sessionDetail.aiChatHistory.length > 0) {
      setAiMessages(
        sessionDetail.aiChatHistory.map((m) => ({
          id: m.id,
          sender: m.role === 'USER' ? 'STUDENT' : 'AI_TUTOR',
          text: m.content,
          citations: m.citations,
        }))
      );
    }
  }, [sessionDetail.aiChatHistory]);

  const persistProgress = (sec: number, completed?: boolean) => {
    const rounded = Math.max(0, Math.floor(sec));
    lastSyncedSecRef.current = rounded;
    updateWatchSec(session.id, rounded);
    void studentLearningApi.updateVideoProgress(session.id, rounded, completed);
  };

  const handleJumpToSecond = async (sec: number, labelInfo?: string) => {
    const targetSec = Math.max(0, Math.floor(sec));
    setCurrentSec(targetSec);
    setSeekRequest({ sec: targetSec, label: labelInfo, nonce: Date.now() });
    persistProgress(targetSec);
    setSeekBanner(
      labelInfo
        ? `Đã tua video tới mốc ${formatTimestamp(targetSec)} (${labelInfo})`
        : `Đã tua video tới mốc ${formatTimestamp(targetSec)}`
    );
    setTimeout(() => setSeekBanner(null), 4000);
  };

  const handleSendAiQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    const q = aiInput.trim();
    setAiInput('');

    const userMsg: AiTutorMessage = {
      id: `u-${Date.now()}`,
      sender: 'STUDENT',
      text: q,
    };
    setAiMessages((prev) => [...prev, userMsg]);

    const res = await studentLearningApi.askSessionAiTutor(
      session.id,
      q,
      Math.floor(currentSec)
    );
    const aiReply: AiTutorMessage = {
      id: `a-${Date.now()}`,
      sender: 'AI_TUTOR',
      text: res.answerMd,
      citations: res.citations,
    };

    setAiMessages((prev) => [...prev, aiReply]);
  };

  const handlePostClassQa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaTitle.trim()) return;
    const title = qaTitle.trim();
    setQaTitle('');
    await studentLearningApi.createSessionQuestion(
      session.id,
      title,
      Math.floor(currentSec),
      title
    );
    await refetchDiscussions();
  };

  const activeSubtitleLine =
    transcriptLines.length > 0
      ? transcriptLines
          .slice()
          .reverse()
          .find((line) => currentSec >= line.sec - 4) ?? transcriptLines[0]
      : null;

  const filteredTranscript = transcriptLines.filter(
    (line) =>
      !transcriptSearch.trim() ||
      line.text.toLowerCase().includes(transcriptSearch.toLowerCase()) ||
      line.timeLabel.includes(transcriptSearch)
  );

  const hasCohortInContext = enrolledCohortIds.some(
    (id) => String(id) === String(cohort.id) || String(id) === String(cohortId)
  );
  const isPendingInitialLoad =
    isSessionLoading || (!hasSessionSettled && Boolean(sessionDetail.isPlaceholder));
  const isExplicitNotEnrolled =
    Boolean(sessionDetail.accessDenied) ||
    sessionErrorCode === 'NOT_ENROLLED_IN_COHORT' ||
    sessionErrorStatus === 403;
  const hasNonEnrollmentError =
    Boolean(sessionError) && !isExplicitNotEnrolled && Boolean(sessionDetail.isPlaceholder);

  if (isPendingInitialLoad) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin mx-auto" />
        <p className="text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
          Đang tải phòng học video &amp; trợ giảng AI...
        </p>
      </div>
    );
  }

  if (hasNonEnrollmentError) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-xs font-bold">
            KHÔNG THỂ TẢI PHÒNG HỌC VIDEO
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Tạm thời không tải được bài giảng đợt {cohort.code || cohortId}
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
            {sessionError}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void refetchSession()}
            className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Thử tải lại bài giảng
          </button>
          <button
            type="button"
            onClick={() => navigate(`/app/cohorts/${cohort.id || cohortId}`)}
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Quay lại Không gian lớp học
          </button>
        </div>
      </div>
    );
  }

  const hasBackendAuthorizedSession =
    !sessionError &&
    !sessionDetail.accessDenied &&
    !sessionDetail.isPlaceholder;
  const isEnrolledInCohort =
    role === 'INSTRUCTOR' ||
    role === 'ADMIN' ||
    hasBackendAuthorizedSession ||
    (hasCohortInContext && !isExplicitNotEnrolled);

  if (!isEnrolledInCohort) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-xs font-bold">
            PHÒNG HỌC VIDEO NỘI BỘ · YÊU CẦU GHI DANH
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Bạn cần ghi danh vào đợt {cohort.code} để xem bài giảng này
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
            Bài giảng video, lời giảng đồng bộ từng giây và Trợ giảng AI chỉ mở cho học viên chính thức của đợt học.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/checkout/${cohort.code}`)}
            className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Đăng ký đợt học {cohort.code}
          </button>
          <button
            type="button"
            onClick={() => navigate('/courses')}
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Quay lại Danh mục Khóa học
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5] pb-24">
      {/* Slim Top Navigation Bar */}
      <div className="h-14 px-6 bg-white dark:bg-[#111A15] border-b border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/app/cohorts/${cohort.id}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Quay lại Lộ trình lớp {cohort.code}</span>
          </button>
          <div className="truncate text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Buổi {session.sessionOrder.toString().padStart(2, '0')}: {session.title}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {session.status === 'LIVE' && (
            <button
              type="button"
              onClick={() => navigate(`/live/${session.id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Vào Phòng Live</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/app/assessments/${quizAssessmentId}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Làm bài kiểm tra buổi học (10 câu A, B, C, D)</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace (Left 70% = 8 cols | Right 30% = 4 cols) */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (70% CHIỀU RỘNG) — TRÌNH PHÁT VIDEO TÁI SỬ DỤNG & MỞ KHÓA BUỔI HỌC */}
        <div className="lg:col-span-8 space-y-6">
          {seekBanner && (
            <div className="px-4 py-2.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/70 border border-[#10B981]/50 text-[#065F46] dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>{seekBanner}</span>
            </div>
          )}

          <SessionVideoPlayer
            src={videoUrl}
            title={session.title}
            initialPositionSec={initialResumeSec}
            seekRequest={seekRequest}
            watermarkText={`${currentUser?.email || currentUser?.fullName || 'Học viên'} · Học viên ${cohort.code}`}
            chapters={videoChapters}
            activeSubtitle={
              activeSubtitleLine
                ? {
                    timeLabel: activeSubtitleLine.timeLabel,
                    speaker: activeSubtitleLine.speaker,
                    text: activeSubtitleLine.text,
                  }
                : null
            }
            onTimeUpdate={(sec) => {
              setCurrentSec(sec);
              if (Math.abs(sec - lastSyncedSecRef.current) >= 10) {
                persistProgress(sec);
              }
            }}
            onPauseSave={(sec) => {
              if (sec > 0 && sec !== lastSyncedSecRef.current) {
                persistProgress(sec);
              }
            }}
            onEnded={(dur) => {
              persistProgress(dur > 0 ? dur : currentSec);
            }}
            onJumpChapter={(sec, labelTitle) => {
              setCurrentSec(sec);
              persistProgress(sec);
              setSeekBanner(`Đã tua video tới mốc ${formatTimestamp(sec)} (${labelTitle})`);
              setTimeout(() => setSeekBanner(null), 4000);
            }}
          />

          {/* 2. THẺ "BÀI TẬP MỞ KHÓA BUỔI HỌC" (ĐẶT NGAY DƯỚI VIDEO — 10 CÂU TRẮC NGHIỆM A, B, C, D) */}
          <div className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xs">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                <Award className="w-4 h-4 text-[#10B981]" />
                <span>BÀI TẬP MỞ KHÓA BUỔI HỌC · 10 CÂU TRẮC NGHIỆM 4 ĐÁP ÁN (A, B, C, D)</span>
              </div>
              <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Hoàn thành 10 câu trắc nghiệm ngắn để ghi nhận hoàn tất Buổi {session.sessionOrder}
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Bạn hãy hoàn thành bài kiểm tra ngắn (10 câu) bên dưới để hệ thống ghi nhận bạn đã nắm vững và hoàn tất buổi học này nhé!
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
              {session.isCompleted ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    <span>
                      Đã hoàn thành buổi học — Đạt {((session.quizScore ?? 80) / 10).toFixed(1)}/10 điểm
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/app/assessments/${quizAssessmentId}/results`)
                      }
                      className="px-3.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
                    >
                      Xem lại kết quả &amp; gợi ý ôn tập
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/assessments/${quizAssessmentId}`)}
                      className="px-3.5 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                    >
                      Làm lại bài kiểm tra (10 câu)
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/app/assessments/${quizAssessmentId}`)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>Làm bài kiểm tra buổi học (10 câu)</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. TÓM TẮT TRỌNG TÂM BUỔI HỌC & TÀI LIỆU TẢI VỀ */}
          <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  <BookOpen className="w-5 h-5 text-[#10B981]" />
                  <h3>Tóm Tắt Trọng Tâm Buổi Học (Đồng bộ từ Giảng viên &amp; AI)</h3>
                </div>
                <span className="text-[11px] font-mono text-[#059669] dark:text-[#34D399]">
                  Buổi {session.sessionOrder.toString().padStart(2, '0')} · {session.hostInstructorName}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed whitespace-pre-line">
                {session.aiSummaryMd || 'Nội dung tóm tắt buổi học đang được giảng viên cập nhật.'}
              </p>
              {videoChapters.length > 0 && (
                <ul className="space-y-2 text-xs sm:text-sm text-[#0F172A] dark:text-[#ECFDF5] pt-1">
                  {videoChapters.map((chap) => (
                    <li key={chap.id} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-mono text-[#059669] dark:text-[#34D399]">
                          [{chap.label}]
                        </strong>{' '}
                        {chap.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
              <h4 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Tài Liệu Slide PDF &amp; Mã Nguồn Bài Tập Của Buổi Học
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sessionAttachments.slice(0, 4).map((mat) => (
                  <div
                    key={mat.id}
                    className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#10B981] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{mat.title}</div>
                        <div className="text-[11px] font-mono text-[#475569] dark:text-[#94A3B8]">
                          {mat.fileType} · {mat.fileSize}
                        </div>
                      </div>
                    </div>
                    <a
                      href={mat.downloadUrl || '#'}
                      download={mat.title}
                      onClick={(e) => {
                        if (!mat.downloadUrl || mat.downloadUrl.startsWith('#')) {
                          e.preventDefault();
                        }
                        setSeekBanner(`Đã tải tài liệu "${mat.title}" về máy của bạn!`);
                        setTimeout(() => setSeekBanner(null), 3500);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#059669] dark:text-[#34D399] shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải về</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================================
            CỘT PHẢI (30% CHIỀU RỘNG) — KHUNG TƯƠNG TÁC 3 TAB GỌN GÀNG
           ==================================================================== */}
        <aside className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] overflow-hidden lg:sticky lg:top-20">
          {/* 3-Tab Switcher */}
          <div
            role="tablist"
            aria-label="Khung tương tác bài giảng"
            className="grid grid-cols-3 gap-1 p-1.5 bg-[#F7FBF9] dark:bg-[#090F0C] border-b border-[#E2ECE7] dark:border-[#1E2D24]"
          >
            <button
              role="tab"
              aria-selected={rightTab === 'TRANSCRIPT'}
              type="button"
              onClick={() => setRightTab('TRANSCRIPT')}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                rightTab === 'TRANSCRIPT'
                  ? 'bg-[#10B981] text-white'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              Lời giảng
            </button>

            <button
              role="tab"
              aria-selected={rightTab === 'AI_TUTOR'}
              type="button"
              onClick={() => setRightTab('AI_TUTOR')}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                rightTab === 'AI_TUTOR'
                  ? 'bg-[#10B981] text-white'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              Hỏi Trợ giảng AI
            </button>

            <button
              role="tab"
              aria-selected={rightTab === 'CLASS_QA'}
              type="button"
              onClick={() => setRightTab('CLASS_QA')}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                rightTab === 'CLASS_QA'
                  ? 'bg-[#10B981] text-white'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              Thảo luận lớp
            </button>
          </div>

          {/* TAB 1: LỜI GIẢNG (TRANSCRIPT) — BẤM VÀO LÀ TUA VIDEO THẬT */}
          {rightTab === 'TRANSCRIPT' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                <Search className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Tìm từ khóa trong lời giảng..."
                  className="w-full bg-transparent text-xs focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                Bấm vào bất kỳ dòng thời gian nào bên dưới để trình phát <code>&lt;video&gt;</code> bên trái nhảy thẳng tới đúng giây đó và phát tiếp:
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredTranscript.map((line) => {
                  const isActive = Math.abs(currentSec - line.sec) < 8;
                  return (
                    <button
                      key={line.sec}
                      type="button"
                      onClick={() => handleJumpToSecond(line.sec, `Slide trang ${line.slidePage}`)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isActive
                          ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/70 border-[#10B981]'
                          : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#10B981] text-white">
                          [{line.timeLabel}]
                        </span>
                        <span className="font-mono text-[11px] text-[#059669] dark:text-[#34D399]">
                          Slide trang {line.slidePage}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {line.speaker}
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        {line.text}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: HỎI TRỢ GIẢNG AI — NÚT [00:10], [00:25], [00:45] TUA VIDEO THẬT */}
          {rightTab === 'AI_TUTOR' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[540px]">
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                <div className="p-3 rounded-xl bg-[#D1FAE5]/50 dark:bg-emerald-950/60 border border-[#10B981]/40 flex items-center gap-2.5 text-xs text-[#065F46] dark:text-emerald-300">
                  <AiTutorCompanionSticker className="w-7 h-7 shrink-0" />
                  <span>
                    Trợ giảng AI nắm rõ từng giây bài giảng. Bấm vào các nút <strong>[00:10]</strong>, <strong>[00:25]</strong>, <strong>[00:45]</strong> để tua trình phát video bên trái tới đúng giây đó nhé!
                  </span>
                </div>

                {aiMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl text-xs space-y-2.5 ${
                      msg.sender === 'STUDENT'
                        ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]'
                        : 'bg-white dark:bg-[#111A15] border-2 border-[#10B981]/60 shadow-2xs'
                    }`}
                  >
                    <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5] flex items-center gap-1.5">
                      {msg.sender === 'AI_TUTOR' && (
                        <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
                      )}
                      <span>
                        {msg.sender === 'STUDENT' ? 'Bạn hỏi:' : 'Trợ giảng AI giải đáp:'}
                      </span>
                    </div>

                    <p className="text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      {msg.text}
                    </p>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.citations.map((cit, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleJumpToSecond(cit.jumpSec, cit.slideLabel)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 hover:bg-[#10B981] hover:text-white text-[#065F46] dark:text-emerald-300 font-mono text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{cit.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                <button
                  type="button"
                  onClick={() =>
                    setAiInput('Vì sao phải dùng Promise.all để xử lý bất đồng bộ vậy ạ?')
                  }
                  className="text-left text-[11px] font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                >
                  + Gợi ý hỏi: Vì sao phải dùng Promise.all để xử lý bất đồng bộ?
                </button>

                <form onSubmit={handleSendAiQuestion} className="flex gap-2">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Hỏi Trợ giảng AI về bài giảng này..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs focus:outline-none focus:border-[#10B981]"
                  />
                  <button
                    type="submit"
                    aria-label="Gửi câu hỏi cho Trợ giảng AI"
                    className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: THẢO LUẬN LỚP HỌC */}
          {rightTab === 'CLASS_QA' && (
            <div className="p-4 space-y-4">
              <form onSubmit={handlePostClassQa} className="space-y-2">
                <div className="text-xs font-bold">
                  Đặt câu hỏi tại mốc video [{formatTimestamp(Math.floor(currentSec))}]:
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qaTitle}
                    onChange={(e) => setQaTitle(e.target.value)}
                    placeholder="Nhập câu hỏi thảo luận cùng lớp..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-[#10B981] text-white text-xs font-bold cursor-pointer"
                  >
                    Đăng
                  </button>
                </div>
              </form>

              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {effectiveDiscussions.slice(0, 6).map((th) => (
                  <div
                    key={th.id}
                    className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleJumpToSecond(th.videoTimestampSec ?? th.timestampSec ?? 25)
                        }
                        className="font-mono font-bold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                      >
                        Phút [{th.timestampLabel}]
                      </button>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
                        {th.verifiedByStaff ? 'Giảng viên đã xác nhận' : 'Câu hỏi thảo luận'}
                      </span>
                    </div>
                    <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {th.questionTitle}
                    </div>
                    {(th.contentMd || th.questionBody) && (
                      <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        {th.contentMd ?? th.questionBody}
                      </p>
                    )}
                    {th.replies[0] && (
                      <p className="text-[#475569] dark:text-[#94A3B8] leading-relaxed pt-1 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                        {th.replies[0].content}
                      </p>
                    )}
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
