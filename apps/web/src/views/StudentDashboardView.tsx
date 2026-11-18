import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Compass,
  MessageSquareText,
  Award,
  Settings,
  Play,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  FileText,
  Mic,
  Search,
  Bell,
  ChevronDown,
  ChevronUp,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Moon,
  BellRing,
} from 'lucide-react';
import { useAcademy, StudentSidebarTab } from '../context/AcademyContext';
import {
  formatTimestamp,
  formatVnd,
  formatScheduleSlots,
  evaluatePasswordStrength,
} from '../utils/academyLogic';
import { authApi } from '../services/auth.api';
import {
  StreakLeafFlameSticker,
  AvatarWithFallback,
  CompetencyVerifiedShield,
} from '../components/BotanicalStickers';
import { StudentProfileCvWorkspace } from '../components/StudentProfileCvWorkspace';
import { StudentVoiceInterviewWorkspace } from '../components/StudentVoiceInterviewWorkspace';
import { GraduationCertificateDiploma } from '../components/GraduationCertificateDiploma';
import {
  RadarSkillChart,
  SmoothAreaLineChart,
  DonutGaugeChart,
} from '../components/charts';
import { studentLearningApi } from '../services/learning.api';
import { orderApi } from '../services/order.api';
import {
  profileAndInterviewApi,
  EnrolledSkillStateItem,
  ExternalCvSkillTagItem,
} from '../services/profile-interview.api';
import { useAsyncData, useAsyncQuery } from '../hooks/useAsyncData';
import { Cohort } from '../types/domain';

const DEFAULT_ENROLLED_SKILL_STATES: EnrolledSkillStateItem[] = [];
const DEFAULT_EXTERNAL_CV_SKILLS: ExternalCvSkillTagItem[] = [];

export const StudentDashboardView: React.FC = () => {
  const {
    studentSidebarTab,
    setStudentSidebarTab,
    interviewCredits,
    sessions,
    cohorts,
    courses,
    enrolledCohortIds,
    upcomingTasks,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    receipts,
    certificates,
    navigate,
    setActivePlayerSessionId,
    theme,
    toggleTheme,
    setCommandPaletteOpen,
    currentUser,
    setCurrentUser,
    role,
  } = useAcademy();

  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [expandedCertCode, setExpandedCertCode] = useState<string | null>(null);

  // Account Settings & Password Change states (tab SETTINGS)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [autoPlayNextVideo, setAutoPlayNextVideo] = useState<boolean>(
    () => (currentUser?.preferences?.autoPlayNextVideo as boolean | undefined) ?? true
  );
  const [autoShowSubtitles, setAutoShowSubtitles] = useState<boolean>(
    () => (currentUser?.preferences?.autoShowSubtitles as boolean | undefined) ?? true
  );
  const [notifyBeforeLive15m, setNotifyBeforeLive15m] = useState<boolean>(
    () => (currentUser?.preferences?.notifyBeforeLive15m as boolean | undefined) ?? true
  );
  const [notifyQuizAndCert, setNotifyQuizAndCert] = useState<boolean>(
    () => (currentUser?.preferences?.notifyQuizAndCert as boolean | undefined) ?? true
  );

  const persistPreferencePatch = (patch: Record<string, boolean>) => {
    const mergedPrefs = {
      ...(currentUser?.preferences || {}),
      autoPlayNextVideo,
      autoShowSubtitles,
      notifyBeforeLive15m,
      notifyQuizAndCert,
      ...patch,
    };
    setCurrentUser((prev) => (prev ? { ...prev, preferences: mergedPrefs } : prev));
    void profileAndInterviewApi
      .updateMyProfile({
        fullName: currentUser?.fullName || 'Học viên',
        bio: currentUser?.bio || '',
        careerGoal: currentUser?.careerGoal || '',
        phone: currentUser?.phone,
        avatarUrl: currentUser?.avatarUrl,
        preferences: mergedPrefs,
      })
      .catch(() => undefined);
  };

  const passwordStrength = evaluatePasswordStrength(newPassword);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại của bạn.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới cần có tối thiểu 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('Mật khẩu mới phải khác với mật khẩu hiện tại.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(
        res.message || 'Đã đổi mật khẩu đăng nhập thành công.'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Mật khẩu hiện tại không chính xác hoặc không thể đổi mật khẩu lúc này.';
      setPasswordError(msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const fallbackLive = sessions.find((s) => s.status === 'LIVE') ?? null;
  const fallbackResume =
    sessions.find((s) => s.status === 'REPLAY_READY' && !s.isCompleted) ??
    sessions.find((s) => s.status === 'REPLAY_READY') ??
    null;
  const authQueryKey = `${role}:${currentUser?.id || ''}`;

  const { data: dashboardSummary } = useAsyncQuery(
    () => studentLearningApi.getDashboardSummary(),
    {
      liveSession: fallbackLive,
      resumeSession: fallbackResume,
      upcomingTasks,
      streakDays: 0,
    },
    [authQueryKey]
  );

  const { data: enrollmentsData, isLoading: isEnrollmentsLoading } = useAsyncData(
    () => studentLearningApi.getMyEnrollments(),
    [authQueryKey]
  );

  const { data: orderHistoryData } = useAsyncData(
    () => orderApi.getMyOrderHistory(),
    [authQueryKey]
  );

  const { data: profileAndSkills } = useAsyncQuery(
    () => profileAndInterviewApi.getMyProfileAndSkills(),
    {
      userProfile: {
        fullName: currentUser?.fullName || '',
        headline: currentUser?.bio || '',
        email: currentUser?.email || '',
        phone: currentUser?.phone || '',
        githubUrl: '',
        linkedinUrl: '',
        careerObjective: currentUser?.careerGoal || '',
        latestCvFileName: '',
        latestCvUpdatedAt: '',
        interviewCredits,
        cvParsedData: {
          fileName: '',
          updatedAt: '',
          fullName: currentUser?.fullName || '',
          headline: currentUser?.bio || '',
          email: currentUser?.email || '',
          phone: currentUser?.phone || '',
          githubUrl: '',
          linkedinUrl: '',
          careerObjective: currentUser?.careerGoal || '',
          projects: [],
          externalSkills: [],
        },
      },
      studentSkillStates: DEFAULT_ENROLLED_SKILL_STATES,
      externalCvSkills: DEFAULT_EXTERNAL_CV_SKILLS,
    },
    [authQueryKey]
  );

  const studentFullName =
    currentUser?.fullName || profileAndSkills.userProfile?.fullName || 'Học viên';
  const studentAvatarUrl =
    currentUser?.avatarUrl || profileAndSkills.userProfile?.avatarUrl || '';
  const studentShortName =
    studentFullName.trim().split(/\s+/).slice(-1)[0] || studentFullName;

  // RÀNG BUỘC 3.1: Xóa bỏ mục Hỏi đáp đứng rời rạc bên ngoài (gộp gọn vào trong Phòng Học Video từng buổi)
  const sidebarItems: {
    id: StudentSidebarTab;
    label: string;
    path: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
  }[] = [
    { id: 'TODAY', label: 'Hôm nay học gì', path: '/app', icon: LayoutDashboard },
    { id: 'MY_COHORTS', label: 'Lớp đang theo học', path: '/app', icon: BookOpen },
    { id: 'PROFILE_CV', label: 'Hồ sơ của tôi', path: '/app/profile-cv', icon: FileText },
    {
      id: 'MOCK_INTERVIEW',
      label: 'Luyện phỏng vấn',
      path: '/app/mock-interview',
      icon: Mic,
      badge: `${interviewCredits} Credits`,
    },
    { id: 'SKILL_MAP', label: 'Kỹ năng & Tiến độ', path: '/app/progress', icon: Compass },
    { id: 'CERTIFICATES_ORDERS', label: 'Chứng chỉ & Học phí', path: '/app', icon: Award },
    { id: 'SETTINGS', label: 'Tài khoản', path: '/app', icon: Settings },
  ];

  const liveSession =
    dashboardSummary.liveSession !== undefined
      ? dashboardSummary.liveSession?.status === 'LIVE'
        ? dashboardSummary.liveSession
        : null
      : fallbackLive;
  const rawResume =
    dashboardSummary.resumeSession !== undefined
      ? dashboardSummary.resumeSession
      : fallbackResume;
  const resumeSession =
    rawResume && rawResume.status === 'REPLAY_READY' ? rawResume : null;
  const effectiveUpcomingTasks =
    dashboardSummary.upcomingTasks !== undefined
      ? dashboardSummary.upcomingTasks
      : upcomingTasks;
  const effectiveEnrolledIds = Array.isArray(enrollmentsData?.enrolledCohortIds)
    ? enrollmentsData.enrolledCohortIds.map((id) => String(id))
    : enrolledCohortIds.map((id) => String(id));
  const effectiveEnrolledIdSet = new Set(effectiveEnrolledIds);
  const myEnrolledCohorts = (() => {
    const byId = new Map<string, Cohort>();
    if (Array.isArray(enrollmentsData?.cohorts)) {
      for (const ch of enrollmentsData.cohorts) {
        byId.set(String(ch.id), ch);
      }
    }
    for (const ch of cohorts) {
      if (effectiveEnrolledIdSet.has(String(ch.id)) && !byId.has(String(ch.id))) {
        byId.set(String(ch.id), ch);
      }
    }
    return Array.from(byId.values());
  })();
  const primaryCohort = myEnrolledCohorts[0];
  const resumeCohort =
    (resumeSession
      ? myEnrolledCohorts.find((c) => String(c.id) === String(resumeSession.cohortId))
      : undefined) || primaryCohort;
  const liveCohort =
    (liveSession
      ? myEnrolledCohorts.find((c) => String(c.id) === String(liveSession.cohortId))
      : undefined) || primaryCohort;
  const effectiveReceipts =
    orderHistoryData && orderHistoryData.length > 0
      ? orderHistoryData
      : Array.isArray(enrollmentsData?.receipts) && enrollmentsData.receipts.length > 0
      ? enrollmentsData.receipts
      : receipts;

  const currentTabInfo =
    sidebarItems.find((item) => item.id === studentSidebarTab) ?? sidebarItems[0];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5]">
      {/* FULL-HEIGHT LEFT SIDEBAR */}
      <aside className="w-full lg:w-[280px] shrink-0 lg:min-h-[calc(100vh-4rem)] lg:sticky lg:top-16 bg-white dark:bg-[#111A15] border-b lg:border-b-0 lg:border-r border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between gap-6">
        <div className="space-y-4">
          {/* Single Navigation Menu */}
          <nav aria-label="Điều hướng góc học tập học viên" className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = studentSidebarTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStudentSidebarTab(item.id);
                    navigate(item.path);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-white/5 hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-[#10B981]'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Direct Jump to Active Class */}
          {primaryCohort && (
            <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-2">
              <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                Vào nhanh phòng học chính:
              </div>
              <button
                type="button"
                onClick={() => navigate(`/app/cohorts/${primaryCohort.id}`)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-left text-xs font-bold text-[#059669] dark:text-[#34D399] cursor-pointer"
              >
                <span className="leading-snug">{primaryCohort.name}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Student Account Info */}
        <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AvatarWithFallback
              src={studentAvatarUrl}
              name={studentFullName}
              className="w-9 h-9 rounded-full"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5] truncate">
                {studentFullName}
              </div>
              <div className="text-[11px] text-[#059669] dark:text-[#34D399] truncate">
                {myEnrolledCohorts[0]
                  ? `Học viên chính thức · ${myEnrolledCohorts[0].code}`
                  : 'Tài khoản Học viên · Chưa ghi danh lớp'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Slim Page Header Bar (Breadcrumb Left + Search Ctrl+K & Notification Bell Right) */}
        <div className="h-14 px-6 bg-white/80 dark:bg-[#111A15]/80 backdrop-blur-md border-b border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-[#475569] dark:text-[#94A3B8]">Góc Học Tập</span>
            <span className="text-[#475569] dark:text-[#94A3B8]">/</span>
            <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              {currentTabInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-3 relative">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs text-[#475569] dark:text-[#94A3B8] cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#10B981]" />
              <span className="hidden sm:inline">Tìm nhanh bài học, tài liệu...</span>
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
                Ctrl+K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setShowNotifPopover((prev) => !prev)}
              aria-label="Thông báo học tập"
              className="relative p-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[#0F172A] dark:text-[#ECFDF5]" />
              {(notifications.some((n) => !n.isRead) || Boolean(liveSession)) && (
                <span className="w-2 h-2 rounded-full bg-[#10B981] absolute top-1.5 right-1.5" />
              )}
            </button>

            {showNotifPopover && (
              <div className="absolute right-0 top-12 w-88 max-w-[90vw] rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-xl p-4 space-y-2.5 text-xs z-30">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Thông báo học tập ({notifications.filter((n) => !n.isRead).length} chưa đọc)
                  </span>
                  {notifications.some((n) => !n.isRead) && (
                    <button
                      type="button"
                      onClick={() => void markAllNotificationsRead()}
                      className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                    >
                      Đọc tất cả
                    </button>
                  )}
                </div>
                {liveSession && liveSession.status === 'LIVE' && liveCohort && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifPopover(false);
                      navigate(`/live/${liveSession.id}`);
                    }}
                    className="w-full text-left p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 font-medium cursor-pointer"
                  >
                    • Lớp {liveCohort.code} đang diễn ra trực tuyến: {liveSession.title} →
                  </button>
                )}
                {notifications.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {notifications.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (!n.isRead) void markNotificationRead(n.id);
                          setShowNotifPopover(false);
                          if (n.cohortId) navigate(`/app/cohorts/${n.cohortId}`);
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                          n.isRead
                            ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]'
                            : 'bg-[#D1FAE5]/40 dark:bg-emerald-950/50 border-[#10B981]/50 text-[#0F172A] dark:text-[#ECFDF5]'
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-between gap-2">
                          <span className="truncate">{n.title}</span>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] leading-snug line-clamp-2">{n.message}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#334155] dark:text-[#CBD5E1]">
                    • Chưa có thông báo mới. Bạn hiện có <strong>{interviewCredits} lượt</strong> phỏng vấn thử 1-1 cùng AI.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Scrollable Content */}
        <div className="p-6 sm:p-8 pb-28 max-w-[1160px] w-full mx-auto space-y-6">
          {studentSidebarTab === 'TODAY' && (
            <div className="space-y-6">
              {/* Warm Greeting Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    {myEnrolledCohorts.length > 0 && resumeSession
                      ? `Chào ${studentShortName}, hôm nay mình cùng học tiếp bài số ${resumeSession.sessionOrder} nhé!`
                      : `Chào ${studentShortName}, chào mừng bạn đến với Góc Học Tập 3T Academy!`}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                    {myEnrolledCohorts.length > 0 && resumeSession
                      ? 'Bạn chỉ cần làm xong bài tập ngắn (10 câu) bên dưới là hoàn thành buổi học hôm nay rồi nhé.'
                      : myEnrolledCohorts.length > 0 && primaryCohort
                      ? `Bạn đã ghi danh đợt học ${primaryCohort.code}. Hãy xem lộ trình các buổi học và tài liệu chuẩn bị trước giờ mở lớp nhé.`
                      : 'Theo dõi tổng quan lộ trình học tập, khám phá các khóa học đang mở đăng ký hoặc luyện phỏng vấn thực chiến.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSidebarTab('PROFILE_CV');
                      navigate('/app/profile-cv');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>Hồ sơ của tôi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSidebarTab('MOCK_INTERVIEW');
                      navigate('/app/mock-interview');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold hover:opacity-90 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>Luyện phỏng vấn ({interviewCredits} lượt)</span>
                  </button>
                </div>
              </div>

              {/* TỔNG QUAN HỌC TẬP (4 THẺ KPI THỰC TẾ) */}
              <section
                aria-label="Chỉ số tổng quan học tập"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <div
                  onClick={() => {
                    setStudentSidebarTab('MY_COHORTS');
                    navigate('/app/cohorts');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setStudentSidebarTab('MY_COHORTS');
                      navigate('/app/cohorts');
                    }
                  }}
                  className="p-4 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-semibold">Lớp đang theo học</span>
                    <BookOpen className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="text-xl font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5] tabular-nums">
                    {myEnrolledCohorts.length} lớp
                  </div>
                  <div className="text-[11px] text-[#059669] dark:text-[#34D399] truncate">
                    {myEnrolledCohorts[0]
                      ? `Đang học: ${myEnrolledCohorts[0].code}`
                      : 'Chưa ghi danh đợt học nào'}
                  </div>
                </div>

                <div
                  onClick={() => {
                    setStudentSidebarTab('SKILL_MAP');
                    navigate('/app/progress');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setStudentSidebarTab('SKILL_MAP');
                      navigate('/app/progress');
                    }
                  }}
                  className="p-4 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-semibold">Tiến độ buổi học</span>
                    <Compass className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="text-xl font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5] tabular-nums">
                    {sessions.filter((s) => s.isCompleted).length}/{sessions.length} buổi
                  </div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                    {sessions.length > 0
                      ? `${profileAndSkills.studentSkillStates.length} kỹ năng đã chấm điểm`
                      : 'Mở khóa ngay sau khi ghi danh'}
                  </div>
                </div>

                <div
                  onClick={() => {
                    setStudentSidebarTab('CERTIFICATES_ORDERS');
                    navigate('/app/certificates');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setStudentSidebarTab('CERTIFICATES_ORDERS');
                      navigate('/app/certificates');
                    }
                  }}
                  className="p-4 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-semibold">Chứng chỉ tốt nghiệp</span>
                    <Award className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="text-xl font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5] tabular-nums">
                    {Object.values(certificates).length} văn bằng
                  </div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                    {Object.values(certificates).length > 0
                      ? 'Đã xác thực số hiệu trên hệ thống'
                      : 'Cấp khi hoàn thành khóa học'}
                  </div>
                </div>

                <div
                  onClick={() => {
                    setStudentSidebarTab('MOCK_INTERVIEW');
                    navigate('/app/mock-interview');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setStudentSidebarTab('MOCK_INTERVIEW');
                      navigate('/app/mock-interview');
                    }
                  }}
                  className="p-4 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-semibold">Luyện phỏng vấn 1-1</span>
                    <Mic className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="text-xl font-mono font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
                    {interviewCredits} lượt
                  </div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                    Phỏng vấn giọng nói cùng AI
                  </div>
                </div>
              </section>

              {/* KHI HỌC VIÊN CHƯA GHI DANH LỚP NÀO: BẢNG ĐIỀU KHIỂN KHỞI ĐẦU & GỢI Ý KHÓA ĐANG MỞ */}
              {myEnrolledCohorts.length === 0 && (
                <div className="space-y-6">
                  <section
                    aria-label="Thông báo chưa ghi danh đợt học"
                    className="rounded-2xl bg-gradient-to-br from-[#F7FBF9] to-[#E6F7EF]/60 dark:from-[#111A15] dark:to-[#0D281D]/50 border border-[#10B981]/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5"
                  >
                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10B981]/15 text-[#059669] dark:text-[#34D399] text-xs font-bold">
                        <span>Bắt đầu hành trình học tập tại 3T Academy</span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Bạn chưa đăng ký lớp học nào đang diễn ra
                      </h2>
                      <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] max-w-2xl leading-relaxed">
                        Chọn một đợt học phù hợp với lịch cá nhân và hoàn tất học phí qua mã VietQR để mở khóa ngay phòng học trực tuyến, video bài giảng, trợ giảng AI và hệ thống bài tập thực hành.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate('/courses')}
                        className="px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer shadow-xs"
                      >
                        Khám phá các khóa học →
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/advisor')}
                        className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                      >
                        Nhờ AI Tư vấn Lộ trình
                      </button>
                    </div>
                  </section>

                  {/* DANH SÁCH ĐỢT HỌC ĐANG MỞ ĐĂNG KÝ NGAY TRÊN DASHBOARD */}
                  <section
                    aria-label="Các đợt học đang mở đăng ký"
                    className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Các đợt học đang mở đăng ký ({cohorts.filter((c) => c.status === 'OPENING').length} lớp)
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Lịch học trực tuyến buổi tối cùng giảng viên và trợ giảng đồng hành sát sao.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/courses')}
                        className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                      >
                        Xem tất cả khóa học →
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {cohorts
                        .filter((c) => c.status === 'OPENING')
                        .slice(0, 4)
                        .map((ch) => {
                          const course = courses.find((cr) => String(cr.id) === String(ch.courseId));
                          return (
                            <div
                              key={ch.id}
                              className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] transition-colors flex flex-col justify-between space-y-3"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                    {ch.code}
                                  </span>
                                  <span className="font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                    {formatVnd(ch.tuitionVnd)}
                                  </span>
                                </div>
                                <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                  {course?.title ?? ch.name}
                                </div>
                                <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                                  Khai giảng: {ch.startDate} · Lịch học: {formatScheduleSlots(ch.scheduleSlots)}
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2">
                                <span className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                                  GV: {ch.staff[0]?.fullName || 'Giảng viên 3T Academy'}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {course?.slug && (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/courses/${course.slug}`)}
                                      className="px-3 py-1.5 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                                    >
                                      Chi tiết
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/checkout/${ch.code}`)}
                                    className="px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Ghi danh ngay
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                </div>
              )}

              {/* BLOCK 1: LIVE EVENT BANNER (CHỈ HIỂN THỊ KHI GIẢNG VIÊN ĐANG BẬT LIVE) */}
              {liveSession && liveSession.status === 'LIVE' && liveCohort && (
                <section
                  aria-label="Sự kiện lớp học trực tiếp hôm nay"
                  className="rounded-xl bg-[#0F172A] text-white border border-slate-800 p-6 space-y-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-red-500/20 border border-[#EF4444]/50 text-[#EF4444] font-mono text-xs font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse" />
                      <span>ĐANG HỌC TRỰC TUYẾN · {liveCohort.name.toUpperCase()}</span>
                    </div>
                    <span className="font-mono text-xs text-emerald-300">
                      Giảng viên đang mở phòng trực tuyến · Vào lớp trao đổi ngay
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                      ĐANG LIVE — Buổi {liveSession.sessionOrder}: {liveSession.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                      Cùng Giảng viên phụ trách chính {liveCohort.staff[0]?.fullName || liveSession.hostInstructorName} thực hành trực tiếp và giải đáp câu hỏi ngay tại lớp.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-800">
                    <div className="flex flex-wrap items-center gap-4">
                      {liveCohort.staff.map((st) => (
                        <div key={st.id} className="flex items-center gap-2.5">
                          <AvatarWithFallback
                            src={st.avatarUrl}
                            name={st.fullName}
                            className="w-8 h-8 rounded-full"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-white">{st.fullName}</div>
                            <div className="text-[11px] text-slate-400">
                              Giảng viên phụ trách chính
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/live/${liveSession.id}`)}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Vào Phòng Học Live Ngay</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* BLOCK 2: CONTINUE LEARNING & 7-DAY STREAK */}
              {resumeSession && resumeCohort && (
                <section
                  aria-label="Tiếp tục bài học gần nhất và chuỗi ngày học tập"
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
                >
                  <div className="lg:col-span-8 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                          HỌC TIẾP BÀI GẦN NHẤT · {resumeCohort.name.toUpperCase()}
                        </span>
                        <span className="font-mono font-semibold">
                          Đã xem tới phút {formatTimestamp(resumeSession.lastPositionSec)} /{' '}
                          {formatTimestamp(resumeSession.durationSeconds)}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Buổi {resumeSession.sessionOrder}:{' '}
                        {(resumeSession.title || '')
                          .replace(/^Buổi\s+\d+\s*(?:\([^)]*\))?\s*:\s*/i, '')
                          .trim() || resumeSession.title}{' '}
                        — Đã xem tới phút {formatTimestamp(resumeSession.lastPositionSec)}
                      </h2>

                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        {resumeSession.aiSummaryMd}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-[#10B981] rounded-full"
                          style={{
                            width: `${Math.round(
                              (resumeSession.lastPositionSec / Math.max(1, resumeSession.durationSeconds)) * 100
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
                          {resumeSession.isCompleted ? (
                            <span className="text-[#10B981] font-semibold">
                              ✓ Bạn đã hoàn thành bài tập 10 câu của Buổi {resumeSession.sessionOrder} ({resumeSession.quizScore}/100)
                            </span>
                          ) : (
                            `Bạn chỉ cần làm xong bài kiểm tra 10 câu là hoàn thành Buổi ${resumeSession.sessionOrder} nhé!`
                          )}
                        </span>

                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/app/cohorts/${resumeSession.cohortId}/sessions/${resumeSession.id}`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Tiếp tục học &amp; Làm bài tập Buổi {resumeSession.sessionOrder}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/app/cohorts/${resumeCohort.id}`)}
                            className="px-3.5 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer whitespace-nowrap"
                          >
                            Xem lộ trình lớp học
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="flex items-center gap-3.5">
                      <StreakLeafFlameSticker className="w-14 h-14 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                          THÓI QUEN HỌC ĐỀU ĐẶN
                        </div>
                        <div className="text-2xl font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Chuỗi {dashboardSummary.streakDays} Ngày
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      Tuyệt vời lắm {studentShortName} ơi! Bạn đã duy trì việc học đều đặn suốt {dashboardSummary.streakDays} ngày qua. Cùng làm xong bài tập ngắn Buổi {resumeSession.sessionOrder} hôm nay để nối dài chuỗi ngày học lên {dashboardSummary.streakDays + 1} ngày nhé!
                    </p>

                    <div className="grid grid-cols-7 gap-1.5 pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] text-center font-mono text-[11px]">
                      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
                        <div
                          key={day}
                          className="py-1.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold"
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {!resumeSession && primaryCohort && (
                <section
                  aria-label="Thông tin đợt học sắp khai giảng"
                  className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                      ĐỢT HỌC ĐÃ GHI DANH · {primaryCohort.code}
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {primaryCohort.name} — Khai giảng dự kiến: {primaryCohort.startDate}
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Các buổi học của đợt này chưa tới giờ mở lớp. Video bài giảng và bài tập 10 câu sẽ được mở tự động sau từng buổi học.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/cohorts/${primaryCohort.id}`)}
                    className="px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Xem lộ trình lớp học →
                  </button>
                </section>
              )}

              {/* BLOCK 3: UPCOMING QUIZZES & ASSIGNMENTS */}
              <section
                aria-label="Bài tập ngắn và dự án sắp tới hạn"
                className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Bài Tập Ngắn (10 Câu) &amp; Kỳ Thi Cuối Khóa (25 Câu)
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Làm xong bài tập ngắn sau mỗi buổi giúp bạn nắm chắc kiến thức và nhận huy hiệu hoàn thành buổi học.
                    </p>
                  </div>
                  {primaryCohort && (
                    <button
                      type="button"
                      onClick={() => navigate(`/app/cohorts/${primaryCohort.id}`)}
                      className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                    >
                      Xem toàn bộ bài tập →
                    </button>
                  )}
                </div>

                {effectiveUpcomingTasks.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-1.5">
                    <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Chưa có bài tập hoặc kỳ thi nào cần làm ngay
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                      {myEnrolledCohorts.length === 0
                        ? 'Sau khi bạn đăng ký một lớp học, danh sách bài tập trắc nghiệm cuối mỗi buổi (10 câu) và kỳ thi cuối khóa sẽ hiển thị tại đây.'
                        : 'Các bài tập trắc nghiệm sẽ tự động mở khóa ngay sau khi buổi học trực tuyến kết thúc hoặc khi có video xem lại.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2ECE7] dark:divide-[#1E2D24]">
                    {effectiveUpcomingTasks.slice(0, 4).map((task) => {
                      const urgencyStyles =
                        task.urgency === 'SAFE'
                          ? {
                              text: 'text-[#10B981]',
                              bg: 'bg-[#D1FAE5]/70 dark:bg-emerald-950/80',
                              icon: CheckCircle2,
                            }
                          : task.urgency === 'WARNING'
                          ? {
                              text: 'text-[#F59E0B]',
                              bg: 'bg-amber-500/10',
                              icon: Clock,
                            }
                          : {
                              text: 'text-[#EF4444]',
                              bg: 'bg-red-500/10',
                              icon: AlertTriangle,
                            };
                      const StatusIcon = urgencyStyles.icon;

                      return (
                        <div
                          key={task.id}
                          className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                                {task.cohortCode || primaryCohort?.name || 'Lớp đang theo học'}
                              </span>
                              <span className="text-[#475569] dark:text-[#94A3B8]">·</span>
                              <span className="text-[#475569] dark:text-[#94A3B8]">
                                {task.statusLabel}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                              {task.title}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-mono text-xs font-bold ${urgencyStyles.bg} ${urgencyStyles.text}`}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              <span>{task.dueText}</span>
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  task.type === 'PROJECT_MILESTONE'
                                    ? `/app/exams/${task.id}/proctored`
                                    : `/app/assessments/${task.id || task.sessionId}`
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer whitespace-nowrap"
                            >
                              Làm bài ngay
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 1: HỒ SƠ CỦA TÔI */}
          {studentSidebarTab === 'PROFILE_CV' && <StudentProfileCvWorkspace />}

          {/* TAB 2: LUYỆN PHỎNG VẤN (2 VÒNG) */}
          {studentSidebarTab === 'MOCK_INTERVIEW' && <StudentVoiceInterviewWorkspace />}

          {/* SIDEBAR SUB-VIEW: MY_COHORTS */}
          {studentSidebarTab === 'MY_COHORTS' && (
            <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Lớp Đang Theo Học ({myEnrolledCohorts.length} Lớp)
                  </h1>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Bấm vào lớp học để xem lộ trình từng buổi, tải tài liệu và làm bài tập ngắn nhé.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/courses')}
                  className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                >
                  Tìm thêm khóa học mới
                </button>
              </div>

              {isEnrollmentsLoading && myEnrolledCohorts.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                  Đang tải danh sách lớp đang theo học...
                </div>
              ) : myEnrolledCohorts.length === 0 ? (
                <div className="rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#10B981]/60 p-8 text-center space-y-3">
                  <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Bạn chưa có lớp học nào đang theo học
                  </div>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                    Hãy khám phá danh mục khóa học và ghi danh vào đợt khai giảng phù hợp để bắt đầu học tập cùng giảng viên.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/courses')}
                    className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer"
                  >
                    Khám phá khóa học ngay →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myEnrolledCohorts.map((ch) => {
                    const course = courses.find((cr) => String(cr.id) === String(ch.courseId));
                    const courseTitleText =
                      course?.title ||
                      (ch as Cohort & { courseTitle?: string }).courseTitle ||
                      ch.name;
                    return (
                      <div
                        key={ch.id}
                        className="rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                              {ch.code}
                            </span>
                            <span className="text-[#475569] dark:text-[#94A3B8]">
                              Khai giảng {ch.startDate}
                            </span>
                          </div>
                          <div className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            {ch.name}
                          </div>
                          <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            {courseTitleText} · Lịch học: {formatScheduleSlots(ch.scheduleSlots)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => navigate(`/app/cohorts/${ch.id}`)}
                          className="w-full py-2.5 px-4 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer"
                        >
                          Vào Không Gian Lớp Học →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SIDEBAR SUB-VIEW: SKILL_MAP (/app/progress) — HỆ THỐNG BIỂU ĐỒ PHÂN TÍCH KỸ NĂNG & TIẾN ĐỘ HỌC VIÊN */}
          {studentSidebarTab === 'SKILL_MAP' && (() => {
            const skillStates = profileAndSkills.studentSkillStates;
            const hasEnrolled = myEnrolledCohorts.length > 0;
            const hasSkills = skillStates.length > 0;

            const lowestSkill = hasSkills
              ? [...skillStates].sort(
                  (a, b) => (a.masteryScore ?? a.score) - (b.masteryScore ?? b.score)
                )[0]
              : undefined;
            const lowestScore = lowestSkill ? lowestSkill.masteryScore ?? lowestSkill.score : 0;
            const lowestEvidence = lowestSkill ? lowestSkill.evidenceCount ?? 1 : 0;

            const scoredSessions = sessions.filter(
              (s) => typeof s.quizScore === 'number' && s.quizScore > 0
            );

            const sessionAttemptTrend =
              dashboardSummary.attemptTrend && dashboardSummary.attemptTrend.length > 0
                ? dashboardSummary.attemptTrend
                : scoredSessions.map((s) => {
                    const val = s.quizScore ?? 0;
                    return {
                      label: `Buổi ${s.sessionOrder}`,
                      subLabel: s.title.slice(0, 18),
                      value: val,
                      detailText: `Đạt ${(val / 10).toFixed(1)}/10 · ${s.title}`,
                    };
                  });

            const hasQuizTrend = sessionAttemptTrend.length > 0;
            const passedTrendCount = sessionAttemptTrend.filter((d) => d.value >= 70).length;
            const highestTrendItem = hasQuizTrend
              ? [...sessionAttemptTrend].sort((a, b) => b.value - a.value)[0]
              : undefined;

            const avgSkillScore = hasSkills
              ? Math.round(
                  skillStates.reduce((acc, s) => acc + (s.masteryScore ?? s.score ?? 0), 0) /
                    skillStates.length
                )
              : null;

            const avgQuizPct = hasQuizTrend
              ? Math.round(
                  sessionAttemptTrend.reduce((acc, item) => acc + item.value, 0) /
                    sessionAttemptTrend.length
                )
              : avgSkillScore;

            const totalSessionsCount = sessions.length;
            const completedSessionsCount = sessions.filter((s) => s.isCompleted).length;
            const liveSessionsCount = sessions.filter(
              (s) => s.status === 'LIVE' && !s.isCompleted
            ).length;
            const remainingSessionsCount = Math.max(
              0,
              totalSessionsCount - completedSessionsCount - liveSessionsCount
            );
            const completionRatioPct =
              totalSessionsCount > 0
                ? Math.round((completedSessionsCount / totalSessionsCount) * 100)
                : 0;

            const completionSegments =
              totalSessionsCount > 0
                ? [
                    {
                      label: 'Đã hoàn thành buổi học & Bài tập',
                      value: completedSessionsCount,
                      countText: `${completedSessionsCount}/${totalSessionsCount} buổi học`,
                      color: '#10B981',
                      description: 'Đã xem video bài giảng và vượt qua bài kiểm tra cuối buổi.',
                    },
                    {
                      label: 'Đang diễn ra trực tuyến',
                      value: liveSessionsCount,
                      countText: `${liveSessionsCount}/${totalSessionsCount} buổi học`,
                      color: '#0EA5E9',
                      description: 'Đang tham gia ca học trực tuyến cùng giảng viên.',
                    },
                    {
                      label: 'Chưa hoàn thành / Sắp mở lớp',
                      value: remainingSessionsCount,
                      countText: `${remainingSessionsCount}/${totalSessionsCount} buổi học`,
                      color: '#F59E0B',
                      description: 'Các buổi học tiếp theo trong lộ trình lớp học của bạn.',
                    },
                  ]
                : [];

            return (
              <div className="space-y-6">
                {/* Header */}
                <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Kỹ Năng &amp; Tiến Độ Học Tập Của Bạn
                    </h1>
                    <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                      Theo dõi trực quan mức độ thành thạo từng kỹ năng chuyên môn và kết quả làm bài kiểm tra qua các buổi học thực tế.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0 font-mono text-xs">
                    <div className="px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <span className="text-[#475569] dark:text-[#94A3B8]">Điểm TB kiểm tra: </span>
                      <strong className="text-[#059669] dark:text-[#34D399] tabular-nums">
                        {avgQuizPct !== null ? `${avgQuizPct}%` : 'Chưa có'}
                      </strong>
                    </div>
                    <div className="px-3.5 py-2 rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/80 text-[#065F46] dark:text-emerald-300 font-bold tabular-nums">
                      Kỹ năng đã chấm: {skillStates.length}
                    </div>
                  </div>
                </div>

                {/* HÀNG 1 (2 CỘT CÂN ĐỐI): RADAR SKILL CHART & SMOOTH AREA LINE CHART */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Cột 1: Biểu đồ Đa giác Năng lực (RadarSkillChart) */}
                  <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          BIỂU ĐỒ NĂNG LỰC CHUYÊN MÔN
                        </span>
                        {hasSkills && (
                          <span className="text-[11px] font-mono text-[#475569] dark:text-[#94A3B8]">
                            Di chuột vào đỉnh để xem chi tiết
                          </span>
                        )}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Điểm thành thạo kỹ năng thuộc khóa đang học
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Tổng hợp tự động từ điểm số các bài kiểm tra trắc nghiệm cuối buổi học và bài thi cuối khóa của bạn.
                      </p>
                    </div>

                    <RadarSkillChart
                      skills={skillStates.slice(0, 6).map((sk) => ({
                        code: sk.code,
                        name: sk.name,
                        masteryScore: sk.masteryScore ?? sk.score,
                        evidenceCount: sk.evidenceCount ?? 1,
                      }))}
                    />
                  </div>

                  {/* Cột 2: Biểu đồ Đường Xu hướng Điểm kiểm tra qua từng Buổi học (SmoothAreaLineChart) */}
                  <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          XU HƯỚNG ĐIỂM KIỂM TRA QUA TỪNG BUỔI
                        </span>
                        <span className="text-[11px] font-mono text-[#D97706] dark:text-amber-300 font-semibold">
                          Mốc đạt chuẩn: 70%
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Biểu đồ điểm số qua các buổi học
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Theo dõi kết quả làm bài kiểm tra mở khóa cuối mỗi buổi học so với mốc chuẩn 70% của học viện.
                      </p>
                    </div>

                    {!hasQuizTrend ? (
                      <div className="w-full py-10 px-4 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] flex flex-col items-center justify-center text-center space-y-2.5 my-auto">
                        <div className="w-11 h-11 rounded-full bg-[#E6F7EF] dark:bg-[#0D281D] flex items-center justify-center text-[#059669] dark:text-[#34D399]">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Chưa có lịch sử làm bài kiểm tra
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-sm leading-relaxed">
                          Khi bạn hoàn thành bài kiểm tra 10 câu cuối mỗi buổi học, biểu đồ xu hướng điểm số sẽ được cập nhật tại đây.
                        </p>
                      </div>
                    ) : (
                      <>
                        <SmoothAreaLineChart
                          data={sessionAttemptTrend}
                          thresholdValue={70}
                          thresholdLabel="Mốc đạt chuẩn 70%"
                          unit="%"
                          primarySeriesLabel="Điểm bài kiểm tra"
                        />

                        <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                          <span>
                            Đã vượt mốc chuẩn 70%: <strong>{passedTrendCount}/{sessionAttemptTrend.length}</strong> bài kiểm tra.
                          </span>
                          {highestTrendItem && (
                            <span className="font-mono font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
                              Cao nhất: {highestTrendItem.value}% ({highestTrendItem.label})
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* HÀNG 2: BIỂU ĐỒ VÒNG TRÒN TỶ LỆ HOÀN THÀNH + THẺ KHUYẾN NGHỊ ÔN TẬP TỪ AI */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Biểu đồ Vòng tròn Tỷ lệ Hoàn thành Buổi học */}
                  <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        TỶ LỆ HOÀN THÀNH LỘ TRÌNH LỚP HỌC
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {primaryCohort
                          ? `Tiến độ hoàn thành lộ trình ${primaryCohort.code}`
                          : 'Tiến độ hoàn thành các buổi học'}
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Thống kê số buổi học đã hoàn thành dựa trên tiến độ xem video bài giảng và làm bài kiểm tra thực tế.
                      </p>
                    </div>

                    {!hasEnrolled || totalSessionsCount === 0 ? (
                      <div className="w-full py-10 px-4 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] flex flex-col items-center justify-center text-center space-y-3 my-auto">
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Bạn chưa ghi danh vào đợt học nào
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md leading-relaxed">
                          Tỷ lệ hoàn thành buổi học và độ chính xác trắc nghiệm chỉ được tính khi bạn đã đăng ký khóa học và bắt đầu tham gia các buổi học.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate('/courses')}
                          className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                        >
                          Xem các khóa học đang mở →
                        </button>
                      </div>
                    ) : (
                      <DonutGaugeChart
                        segments={completionSegments}
                        centerLabel="Hoàn thành"
                        centerValue={`${completionRatioPct}%`}
                        centerSubtext={`${completedSessionsCount}/${totalSessionsCount} buổi học`}
                      />
                    )}
                  </div>

                  {/* Thẻ Khuyến nghị Ôn tập từ AI */}
                  <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        <span>KHUYẾN NGHỊ ÔN TẬP TỪ HỆ THỐNG</span>
                      </div>

                      {!lowestSkill ? (
                        <div className="py-8 px-4 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-2.5">
                          <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Chưa có khuyến nghị ôn tập cá nhân hóa
                          </div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                            Hệ thống sẽ phân tích các câu trả lời trắc nghiệm của bạn sau từng buổi học để chỉ ra kỹ năng cần ưu tiên củng cố và đoạn video bài giảng nên xem lại.
                          </p>
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  primaryCohort ? `/app/cohorts/${primaryCohort.id}` : '/courses'
                                )
                              }
                              className="px-4 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                            >
                              {primaryCohort ? 'Mở không gian lớp học →' : 'Tìm hiểu lộ trình học →'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Cần ưu tiên củng cố: {lowestSkill.name} ({lowestScore}/100)
                          </h3>

                          <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                            Hệ thống ghi nhận kỹ năng <strong>{lowestSkill.name}</strong> hiện có điểm thành thạo <strong>{lowestScore}/100</strong> (qua {lowestEvidence} bài kiểm tra minh chứng). Bạn nên ôn tập lại kiến thức trọng tâm của kỹ năng này để nâng điểm số lên mốc chuẩn tốt nghiệp 80/100.
                          </p>

                          <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5 text-xs">
                            <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                              Gợi ý hành động tiếp theo:
                            </div>
                            <div className="text-[#475569] dark:text-[#94A3B8]">
                              1. Xem lại video bài giảng và tài liệu đính kèm của buổi học liên quan đến kỹ năng <strong>{lowestSkill.name}</strong>.
                            </div>
                            <div className="text-[#475569] dark:text-[#94A3B8]">
                              2. Thực hiện lại bài kiểm tra trắc nghiệm cuối buổi để cải thiện mức độ thành thạo.
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 pt-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  primaryCohort && resumeSession
                                    ? `/app/cohorts/${resumeSession.cohortId || primaryCohort.id}/sessions/${resumeSession.id}`
                                    : primaryCohort
                                    ? `/app/cohorts/${primaryCohort.id}`
                                    : '/courses'
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {resumeSession
                                  ? `Ôn lại bài giảng Buổi ${resumeSession.sessionOrder}`
                                  : 'Vào lớp học ôn tập'}
                              </span>
                            </button>
                            {resumeSession && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/app/assessments/${resumeSession.assessmentId || resumeSession.id}`
                                  )
                                }
                                className="px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                              >
                                Làm lại bài kiểm tra
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* DANH SÁCH CHI TIẾT KỸ NĂNG ĐÀO TẠO & THẺ KỸ NĂNG TỪ CV */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Cột trái: Danh sách kỹ năng khóa học (0-100) */}
                  <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        CHI TIẾT ĐIỂM KỸ NĂNG ĐÀO TẠO TẠI HỌC VIỆN
                      </div>
                      <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Bảng điểm kỹ năng đào tạo tại Học viện ({skillStates.length} kỹ năng)
                      </h2>
                    </div>

                    {skillStates.length === 0 ? (
                      <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-2">
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Chưa có kỹ năng nào được chấm điểm
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto leading-relaxed">
                          Điểm kỹ năng đào tạo sẽ tự động xuất hiện tại đây sau khi bạn đăng ký khóa học và hoàn thành các bài kiểm tra trắc nghiệm.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {skillStates.map((sk) => {
                          const sc = sk.masteryScore ?? sk.score;
                          const ev = sk.evidenceCount ?? 1;
                          return (
                            <div
                              key={sk.code}
                              className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                  {sk.name}
                                </span>
                                <span className="font-mono text-xs font-bold tabular-nums text-[#059669] dark:text-[#34D399]">
                                  {sc}/100
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-[#10B981] rounded-full"
                                  style={{ width: `${sc}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                <span>{sk.sourceLabel}</span>
                                <span className="font-mono tabular-nums">
                                  {ev} bài kiểm tra
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Cột phải: Danh sách thẻ kỹ năng từ CV cá nhân */}
                  <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#475569] dark:text-[#94A3B8]">
                        TRÍCH XUẤT TỪ HỒ SƠ CÁ NHÂN
                      </div>
                      <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Kỹ năng &amp; Công nghệ ghi nhận từ CV của bạn
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Được đồng bộ từ hồ sơ CV sang Phòng Luyện Phỏng Vấn để câu hỏi sát với kinh nghiệm thực tế của bạn.
                      </p>
                    </div>

                    {profileAndSkills.externalCvSkills.length === 0 ? (
                      <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-3">
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Chưa có kỹ năng nào được trích xuất từ CV
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                          Hãy tải file CV PDF hoặc bổ sung kỹ năng trong mục Hồ sơ của tôi để đồng bộ sang Phòng Luyện Phỏng Vấn.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setStudentSidebarTab('PROFILE_CV');
                            navigate('/app/profile-cv');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#059669] dark:text-[#34D399] cursor-pointer"
                        >
                          Cập nhật Hồ sơ &amp; CV →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {profileAndSkills.externalCvSkills.map((ext) => (
                          <div
                            key={ext.name}
                            className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col justify-between gap-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                {ext.name}
                              </span>
                              <span className="text-[11px] font-mono text-[#059669] dark:text-[#34D399]">
                                Từ CV của bạn
                              </span>
                            </div>
                            <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                              {ext.note}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SIDEBAR SUB-VIEW: AI_CHAT_HISTORY */}
          {studentSidebarTab === 'AI_CHAT_HISTORY' && (
            <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Lịch Sử Hỏi Bài Cùng Trợ Giảng AI
                  </h1>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Bấm vào nút mốc phút giây để nhảy thẳng tới đúng đoạn video và trang tài liệu thầy đã giảng nhé.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/advisor')}
                  className="px-3.5 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                >
                  Tư vấn lộ trình học
                </button>
              </div>
              <div className="space-y-3 text-xs">
                {sessions
                  .flatMap((s) =>
                    s.aiCitations.map((c) => ({
                      sessionId: s.id,
                      sessionTitle: s.title,
                      ...c,
                    }))
                  )
                  .map((item, idx) => (
                    <div
                      key={`${item.sessionId}-${idx}`}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          Phút [{item.timestampLabel}] · {item.sessionTitle}
                        </div>
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {item.topic}
                        </div>
                        <p className="text-[#475569] dark:text-[#94A3B8]">{item.snippet}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivePlayerSessionId(item.sessionId)}
                        className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] font-semibold shrink-0 cursor-pointer"
                      >
                        Xem đoạn {item.timestampLabel}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* SIDEBAR SUB-VIEW: CERTIFICATES_ORDERS */}
          {studentSidebarTab === 'CERTIFICATES_ORDERS' && (
            <div className="space-y-6">
              {/* Danh sách Khóa học đã tốt nghiệp & Bằng khen dạng Accordion */}
              <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Khóa học đã tốt nghiệp &amp; Bằng chứng nhận
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                    Bấm vào từng khóa học để mở rộng hoặc thu gọn xem văn bằng chứng nhận và tải file PDF.
                  </p>
                </div>

                {Object.values(certificates).length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-2">
                    <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Chưa có bằng chứng nhận tốt nghiệp nào
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                      Sau khi bạn hoàn thành các buổi học và vượt qua kỳ thi cuối khóa, bằng chứng nhận tốt nghiệp sẽ được cấp tự động tại đây.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.values(certificates).map((c) => {
                      const isExpanded = expandedCertCode === c.certificateCode;
                      return (
                        <div
                          key={c.certificateCode}
                          data-testid={`certificate-item-${c.certificateCode}`}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isExpanded
                              ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#10B981] shadow-sm'
                              : 'bg-white dark:bg-[#111A15] border-[#E2ECE7] dark:border-[#1E2D24] hover:border-emerald-300'
                          }`}
                        >
                          {/* Header dạng FAQ Accordion: Bấm vào để mở hoặc thu lại */}
                          <div
                            onClick={() =>
                              setExpandedCertCode(isExpanded ? null : c.certificateCode)
                            }
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedCertCode(isExpanded ? null : c.certificateCode);
                              }
                            }}
                            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3.5">
                              <CompetencyVerifiedShield className="w-12 h-12 shrink-0" />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-[#059669] dark:text-[#34D399]">
                                    {c.cohortCode}
                                  </span>
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                                    Đã tốt nghiệp
                                  </span>
                                  <span className="text-xs font-mono text-slate-500">
                                    Số hiệu: {c.certificateCode}
                                  </span>
                                </div>
                                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5] mt-1">
                                  {c.courseTitle}
                                </h3>
                                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                                  Điểm: <strong className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">{c.finalScore}/100</strong> · Ngày cấp: {c.issuedAt}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                              <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                                {isExpanded ? 'Thu gọn bằng' : 'Xem bằng chứng nhận'}
                              </span>
                              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Nội dung Bằng khen được mở ra khi học viên bấm vào */}
                          {isExpanded && (
                            <div className="px-5 pb-5 pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-4">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const certCohort =
                                      myEnrolledCohorts.find((ch) => ch.code === c.cohortCode) ??
                                      cohorts.find((ch) => ch.code === c.cohortCode) ??
                                      primaryCohort;
                                    navigate(
                                      certCohort ? `/app/cohorts/${certCohort.id}` : '/courses'
                                    );
                                  }}
                                  className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                                >
                                  Mở lại nội dung lớp học →
                                </button>
                              </div>

                              <GraduationCertificateDiploma
                                certificate={c}
                                showActionHeader={true}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lịch sử đóng học phí */}
              <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Lịch sử đóng học phí
                </h2>
                {effectiveReceipts.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] text-center space-y-2">
                    <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Chưa có biên lai đóng học phí nào
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                      Lịch sử giao dịch và biên lai học phí điện tử của bạn sẽ được lưu trữ tại đây ngay sau khi thanh toán thành công.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    {effectiveReceipts.map((r) => (
                      <div
                        key={r.orderCode}
                        className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            Mã đăng ký: {r.orderCode} · Lớp {r.cohortCode}
                          </div>
                          <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                            {r.courseTitle}
                          </div>
                          <div className="text-[#475569] dark:text-[#94A3B8]">
                            {r.bankName} · {r.paidAt}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-sm font-bold text-[#059669] dark:text-[#34D399]">
                            {formatVnd(r.amountVnd)}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold text-[10px]">
                            ✓ Đã thanh toán thành công
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SIDEBAR SUB-VIEW: SETTINGS (CÀI ĐẶT TÀI KHOẢN & BẢO MẬT) */}
          {studentSidebarTab === 'SETTINGS' && (
            <div className="space-y-6">
              {/* Header + Liên kết sang Hồ sơ của tôi */}
              <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Cài Đặt Tài Khoản &amp; Bảo Mật
                  </h1>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                    Quản lý mật khẩu đăng nhập, chế độ hiển thị và tùy chọn thông báo học tập.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStudentSidebarTab('PROFILE_CV');
                    navigate('/app/profile-cv');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold text-[#059669] dark:text-[#34D399] cursor-pointer shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Chỉnh sửa thông tin cá nhân &amp; CV tại Hồ sơ của tôi →</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* CỘT TRÁI: ĐỔI MẬT KHẨU ĐĂNG NHẬP */}
                <section
                  aria-label="Đổi mật khẩu đăng nhập"
                  className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/80 text-[#059669] dark:text-[#34D399] flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Đổi mật khẩu đăng nhập
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Tài khoản đăng nhập:{' '}
                          <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                            {currentUser?.email ||
                              profileAndSkills.userProfile?.email ||
                              'hocvien@3t.edu.vn'}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {passwordError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  {passwordSuccess && (
                    <div
                      role="status"
                      className="p-3.5 rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/60 border border-[#10B981]/40 text-xs font-semibold text-[#065F46] dark:text-emerald-300 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="settings-current-password"
                        className="block text-xs font-bold text-[#334155] dark:text-[#CBD5E1]"
                      >
                        Mật khẩu hiện tại
                      </label>
                      <div className="relative">
                        <input
                          id="settings-current-password"
                          type={showPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Nhập mật khẩu đang sử dụng..."
                          autoComplete="current-password"
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] focus:border-[#10B981] focus:outline-hidden text-sm text-[#0F172A] dark:text-[#ECFDF5]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#ECFDF5] cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="settings-new-password"
                          className="block text-xs font-bold text-[#334155] dark:text-[#CBD5E1]"
                        >
                          Mật khẩu mới
                        </label>
                        <input
                          id="settings-new-password"
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Tối thiểu 6 ký tự..."
                          autoComplete="new-password"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] focus:border-[#10B981] focus:outline-hidden text-sm text-[#0F172A] dark:text-[#ECFDF5]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="settings-confirm-password"
                          className="block text-xs font-bold text-[#334155] dark:text-[#CBD5E1]"
                        >
                          Xác nhận mật khẩu mới
                        </label>
                        <input
                          id="settings-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Nhập lại mật khẩu mới..."
                          autoComplete="new-password"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] focus:border-[#10B981] focus:outline-hidden text-sm text-[#0F172A] dark:text-[#ECFDF5]"
                        />
                      </div>
                    </div>

                    {newPassword.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#475569] dark:text-[#94A3B8]">
                            Độ mạnh mật khẩu mới:
                          </span>
                          <span className="font-bold text-[#059669] dark:text-[#34D399]">
                            {passwordStrength.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[1, 2, 3, 4].map((lvl) => (
                            <div
                              key={lvl}
                              className={`h-1.5 rounded-full transition-colors ${
                                passwordStrength.score >= lvl
                                  ? 'bg-[#10B981]'
                                  : 'bg-[#E2ECE7] dark:bg-[#1E2D24]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        type="submit"
                        disabled={isChangingPassword}
                        className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        {isChangingPassword ? 'Đang cập nhật...' : 'Lưu mật khẩu mới'}
                      </button>
                    </div>
                  </form>
                </section>

                {/* CỘT PHẢI: TÙY CHỌN GIAO DIỆN & THÔNG BÁO HỌC TẬP */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Khối Giao diện & Trình phát video */}
                  <section
                    aria-label="Giao diện và trải nghiệm học tập"
                    className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2.5 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3.5">
                      <div className="w-8 h-8 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-center text-[#10B981]">
                        {theme === 'light' ? (
                          <Sun className="w-4 h-4" />
                        ) : (
                          <Moon className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Giao diện &amp; Trình phát bài giảng
                        </h2>
                        <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                          Tùy chỉnh chế độ hiển thị và trình phát video
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                        <div>
                          <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Chế độ màn hình Sáng / Tối
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                            Đang dùng: {theme === 'light' ? 'Giao diện Sáng' : 'Giao diện Tối'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={toggleTheme}
                          className="px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer shrink-0"
                        >
                          Đổi sang {theme === 'light' ? 'Tối' : 'Sáng'}
                        </button>
                      </div>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] cursor-pointer">
                        <div>
                          <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Tự động phát tiếp tại mốc đang xem
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                            Khôi phục đúng giây video gần nhất khi mở lại bài giảng
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={autoPlayNextVideo}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setAutoPlayNextVideo(val);
                            persistPreferencePatch({ autoPlayNextVideo: val });
                          }}
                          className="w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] cursor-pointer">
                        <div>
                          <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Mặc định bật phụ đề tiếng Việt (CC)
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                            Hiển thị phụ đề kỹ thuật trong phòng học video
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={autoShowSubtitles}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setAutoShowSubtitles(val);
                            persistPreferencePatch({ autoShowSubtitles: val });
                          }}
                          className="w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  </section>

                  {/* Khối Thông báo học tập */}
                  <section
                    aria-label="Tùy chọn thông báo học tập"
                    className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2.5 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3.5">
                      <div className="w-8 h-8 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-center text-[#10B981]">
                        <BellRing className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Thông báo nhắc lịch học
                        </h2>
                        <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                          Nhận thông báo lịch học trực tuyến và kết quả bài tập
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] cursor-pointer">
                        <div>
                          <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Nhắc trước giờ học Live 15 phút
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                            Hiển thị thông báo khi giảng viên mở phòng học trực tuyến
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={notifyBeforeLive15m}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifyBeforeLive15m(val);
                            persistPreferencePatch({ notifyBeforeLive15m: val });
                          }}
                          className="w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] cursor-pointer">
                        <div>
                          <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            Thông báo kết quả bài tập &amp; chứng chỉ
                          </div>
                          <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                            Cập nhật khi hoàn thành bài kiểm tra hoặc được cấp chứng chỉ
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={notifyQuizAndCert}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifyQuizAndCert(val);
                            persistPreferencePatch({ notifyQuizAndCert: val });
                          }}
                          className="w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
