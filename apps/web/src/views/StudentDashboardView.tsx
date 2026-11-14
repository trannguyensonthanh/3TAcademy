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
  Home,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAcademy, StudentSidebarTab } from '../context/AcademyContext';
import { formatTimestamp, formatVnd, formatScheduleSlots } from '../utils/academyLogic';
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
    receipts,
    certificates,
    navigate,
    setActivePlayerSessionId,
    theme,
    toggleTheme,
    setCommandPaletteOpen,
    currentUser,
    role,
  } = useAcademy();

  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [expandedCertCode, setExpandedCertCode] = useState<string | null>(null);

  const fallbackLive = sessions.find((s) => s.status === 'LIVE') ?? null;
  const fallbackResume = sessions.find((s) => !s.isCompleted) ?? sessions[0];
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
  const studentPhone =
    currentUser?.phone || profileAndSkills.userProfile?.phone || '';
  const studentBio =
    currentUser?.bio ||
    profileAndSkills.userProfile?.bio ||
    profileAndSkills.userProfile?.headline ||
    '';
  const studentCareerGoal =
    currentUser?.careerGoal ||
    profileAndSkills.userProfile?.careerGoal ||
    profileAndSkills.userProfile?.careerObjective ||
    '';
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
  const resumeSession = dashboardSummary.resumeSession ?? fallbackResume;
  const effectiveUpcomingTasks =
    dashboardSummary.upcomingTasks && dashboardSummary.upcomingTasks.length > 0
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
      <aside className="w-full lg:w-[280px] shrink-0 lg:h-screen lg:sticky lg:top-0 bg-white dark:bg-[#111A15] border-b lg:border-b-0 lg:border-r border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between gap-6">
        <div className="space-y-6">
          {/* Top Brand + Subsystem Label */}
          <div className="flex items-center justify-between pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/');
                }}
                className="text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5] hover:text-[#10B981]"
              >
                3T Academy
              </a>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#10B981] mt-0.5">
                Góc Học Tập Học Viên
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Về Trang chủ Học viện"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] cursor-pointer"
            >
              <Home className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Trang chủ</span>
            </button>
          </div>

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
              <span className="w-2 h-2 rounded-full bg-[#10B981] absolute top-1.5 right-1.5" />
            </button>

            {showNotifPopover && (
              <div className="absolute right-0 top-12 w-80 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-xl p-4 space-y-2.5 text-xs z-30">
                <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Thông báo mới của bạn (2)
                </div>
                <div className="p-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  • Lớp Kỹ Sư AI Khóa K01 đang học trực tuyến Buổi 5 (19:30 - 21:30).
                </div>
                <div className="p-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  • Bạn hiện có {interviewCredits} lượt Luyện phỏng vấn giọng nói 1-1 cùng Senior AI.
                </div>
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
                    {myEnrolledCohorts.length > 0
                      ? 'Bạn chỉ cần làm xong bài tập ngắn (10 câu) bên dưới là hoàn thành buổi học hôm nay rồi nhé.'
                      : 'Bạn hiện chưa ghi danh vào đợt khai giảng nào. Hãy khám phá danh mục khóa học hoặc nhờ Cố vấn AI gợi ý lộ trình phù hợp nhất.'}
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
                    <span>Luyện phỏng vấn ({interviewCredits} Credits)</span>
                  </button>
                </div>
              </div>

              {/* EMPTY STATE BANNER KHI HỌC VIÊN MỚI CHƯA GHI DANH LỚP NÀO */}
              {myEnrolledCohorts.length === 0 && (
                <section
                  aria-label="Thông báo chưa ghi danh đợt học"
                  className="rounded-xl bg-white dark:bg-[#111A15] border-2 border-dashed border-[#10B981]/60 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      CHƯA CÓ ĐỢT HỌC ĐANG THEO HỌC (`enrollments = 0`)
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Ghi danh khóa học đầu tiên để mở khóa phòng học Video, Livestream &amp; Bài tập
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Chọn đợt học phù hợp lịch cá nhân và thanh toán học phí qua VietQR để kích hoạt tài khoản học viên chính thức ngay lập tức.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate('/courses')}
                      className="px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                    >
                      Khám phá Khóa học &amp; Ghi danh →
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/advisor')}
                      className="px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                    >
                      Nhờ AI Tư vấn Lộ trình
                    </button>
                  </div>
                </section>
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
              {resumeSession && primaryCohort && (
                <section
                  aria-label="Tiếp tục bài học gần nhất và chuỗi ngày học tập"
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
                >
                  <div className="lg:col-span-8 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                          HỌC TIẾP BÀI GẦN NHẤT · {primaryCohort.name.toUpperCase()}
                        </span>
                        <span className="font-mono font-semibold">
                          Đã xem tới phút {formatTimestamp(resumeSession.lastPositionSec)} /{' '}
                          {formatTimestamp(resumeSession.durationSeconds)}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Buổi {resumeSession.sessionOrder}: {resumeSession.title} — Đã xem tới phút{' '}
                        {formatTimestamp(resumeSession.lastPositionSec)}
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
                            onClick={() => navigate(`/app/cohorts/${primaryCohort.id}`)}
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
                  <button
                    type="button"
                    onClick={() =>
                      navigate(primaryCohort ? `/app/cohorts/${primaryCohort.id}` : '/courses')
                    }
                    className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                  >
                    Xem toàn bộ bài tập →
                  </button>
                </div>

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
                            onClick={() => navigate(`/app/assessments/${task.sessionId}`)}
                            className="px-3.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer whitespace-nowrap"
                          >
                            Làm bài ngay
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

          {/* SIDEBAR SUB-VIEW: SKILL_MAP (/app/progress) — ĐỘC QUYỀN HỆ THỐNG BIỂU ĐỒ PHÂN TÍCH KỸ NĂNG & TIẾN ĐỘ HỌC VIÊN */}
          {studentSidebarTab === 'SKILL_MAP' && (() => {
            const skillStates = profileAndSkills.studentSkillStates;
            const lowestSkill =
              [...skillStates].sort(
                (a, b) => (a.masteryScore ?? a.score) - (b.masteryScore ?? b.score)
              )[0] ?? skillStates[0];
            const lowestScore = lowestSkill ? lowestSkill.masteryScore ?? lowestSkill.score : 76;
            const lowestEvidence = lowestSkill ? lowestSkill.evidenceCount ?? 3 : 3;

            const sessionAttemptTrend =
              dashboardSummary.attemptTrend && dashboardSummary.attemptTrend.length > 0
                ? dashboardSummary.attemptTrend
                : sessions.slice(0, 5).map((s) => {
                    const val = typeof s.quizScore === 'number' ? s.quizScore : 0;
                    return {
                      label: `Buổi ${s.sessionOrder}`,
                      subLabel: s.title.slice(0, 18),
                      value: val,
                      detailText: `Đạt ${(val / 10).toFixed(1)}/10 · ${s.title}`,
                    };
                  });

            const totalSessionsCount = Math.max(1, sessions.length);
            const completedSessionsCount = sessions.filter((s) => s.isCompleted).length;
            const liveSessionsCount = sessions.filter(
              (s) => s.status === 'LIVE' && !s.isCompleted
            ).length;
            const remainingSessionsCount = Math.max(
              0,
              totalSessionsCount - completedSessionsCount - liveSessionsCount
            );

            const completionSegments = [
              {
                label: 'Hoàn thành đúng hạn & Đạt >= 80%',
                value: completedSessionsCount,
                countText: `${completedSessionsCount}/${totalSessionsCount} buổi học`,
                color: '#10B981',
                description: 'Đã xem hết video bài giảng và vượt qua bài trắc nghiệm mở khóa.',
              },
              {
                label: 'Đang học trực tuyến tối nay',
                value: liveSessionsCount,
                countText: `${liveSessionsCount}/${totalSessionsCount} buổi học`,
                color: '#0EA5E9',
                description: 'Đang tham gia ca học Live và hoàn thành câu hỏi kiểm tra.',
              },
              {
                label: 'Sắp mở khóa & Thi cuối khóa',
                value: remainingSessionsCount,
                countText: `${remainingSessionsCount}/${totalSessionsCount} buổi học`,
                color: '#F59E0B',
                description: 'Mở khóa tuần tự ngay sau khi hoàn thành buổi học trước.',
              },
            ];

            return (
              <div className="space-y-6">
                {/* Header */}
                <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Kỹ Năng &amp; Tiến Độ Học Tập Của Bạn
                    </h1>
                    <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                      Phân tích trực quan mức độ thành thạo kỹ năng (`student_skill_states`) và xu hướng điểm kiểm tra (`assessment_attempts`) qua từng buổi học.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                    <div className="px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <span className="text-[#475569] dark:text-[#94A3B8]">Điểm TB kiểm tra: </span>
                      <strong className="text-[#059669] dark:text-[#34D399] tabular-nums">84.2%</strong>
                    </div>
                    <div className="px-3.5 py-2 rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/80 text-[#065F46] dark:text-emerald-300 font-bold tabular-nums">
                      Độ chính xác MCQ: 88%
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
                          ĐA GIÁC NĂNG LỰC KỸ NĂNG ĐÀO TẠO
                        </span>
                        <span className="text-[11px] font-mono text-[#475569] dark:text-[#94A3B8]">
                          Di chuột vào đỉnh để xem chi tiết
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Điểm thành thạo kỹ năng thuộc khóa đang học
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Tổng hợp từ <code className="font-mono">student_skill_states.mastery_score</code> và số bài kiểm tra minh chứng (<code className="font-mono">evidence_count</code>).
                      </p>
                    </div>

                    <RadarSkillChart
                      skills={skillStates.slice(0, 6).map((sk) => ({
                        code: sk.code,
                        name: sk.name,
                        shortLabel: sk.name,
                        masteryScore: sk.masteryScore ?? sk.score,
                        evidenceCount: sk.evidenceCount ?? 4,
                        sourceLabel: sk.sourceLabel,
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
                        Biểu đồ điểm số qua các buổi học (`score_pct`)
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Theo dõi kết quả làm bài kiểm tra mở khóa cuối mỗi buổi học so với mốc chuẩn 70% của học viện.
                      </p>
                    </div>

                    <SmoothAreaLineChart
                      data={sessionAttemptTrend}
                      thresholdValue={70}
                      thresholdLabel="Mốc đạt chuẩn 70%"
                      unit="%"
                      primarySeriesLabel="Điểm kiểm tra (score_pct)"
                    />

                    <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                      <span>Tất cả 5/5 buổi đã làm đều vượt mốc chuẩn 70%.</span>
                      <span className="font-mono font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
                        Cao nhất: 90% (Buổi 3 &amp; Buổi 4)
                      </span>
                    </div>
                  </div>
                </div>

                {/* HÀNG 2: BIỂU ĐỒ VÒNG TRÒN TỶ LỆ HOÀN THÀNH + THẺ KHUYẾN NGHỊ ÔN TẬP TỪ AI */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Biểu đồ Vòng tròn Tỷ lệ Hoàn thành Buổi học & Độ chính xác Trắc nghiệm */}
                  <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        TỶ LỆ HOÀN THÀNH BUỔI HỌC &amp; ĐỘ CHÍNH XÁC TRẮC NGHIỆM
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Tiến độ hoàn thành lộ trình Khóa K01
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Di chuột vào từng phần trên vòng tròn để xem số buổi học và tỷ lệ hoàn thành tương ứng.
                      </p>
                    </div>

                    <DonutGaugeChart
                      segments={completionSegments}
                      centerLabel="Độ chính xác MCQ"
                      centerValue="88%"
                      centerSubtext="44/50 câu đúng"
                    />
                  </div>

                  {/* Thẻ Khuyến nghị Ôn tập từ AI (chỉ ra kỹ năng đang có điểm thấp nhất cần củng cố) */}
                  <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111A15] border border-[#10B981] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        <span>KHUYẾN NGHỊ ÔN TẬP TỪ AI · CỦNG CỐ KỸ NĂNG THẤP NHẤT</span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Cần ưu tiên củng cố: {lowestSkill?.name} ({lowestScore}/100)
                      </h3>

                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        Hệ thống nhận thấy kỹ năng <strong>{lowestSkill?.name}</strong> (<code className="font-mono">{lowestSkill?.code}</code>) hiện có điểm thấp nhất trong nhóm kỹ năng khóa học ({lowestScore}/100 qua {lowestEvidence} bài kiểm tra). Ở bài kiểm tra gần nhất, bạn chọn nhầm phương án xử lý phân quyền truy cập tài liệu theo phòng ban trước khi trả kết quả tìm kiếm.
                      </p>

                      <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5 text-xs">
                        <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          Lộ trình ôn tập 15 phút được đề xuất:
                        </div>
                        <div className="text-[#475569] dark:text-[#94A3B8]">
                          1. Xem lại <strong>Buổi 4 — Phút 14:20 đến 18:45</strong> (Slide Trang 12: Kiểm soát phân quyền SQL).
                        </div>
                        <div className="text-[#475569] dark:text-[#94A3B8]">
                          2. Làm lại bài tập trắc nghiệm Buổi 4 để nâng điểm kỹ năng này lên trên <strong>85/100</strong> trước kỳ thi cuối khóa.
                        </div>
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
                        <span>Ôn lại đoạn video Buổi {resumeSession?.sessionOrder ?? 1} ngay</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            resumeSession
                              ? `/app/assessments/${resumeSession.id}`
                              : primaryCohort
                              ? `/app/cohorts/${primaryCohort.id}`
                              : '/courses'
                          )
                        }
                        className="px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                      >
                        Làm lại bài kiểm tra
                      </button>
                    </div>
                  </div>
                </div>

                {/* DANH SÁCH CHI TIẾT KỸ NĂNG ĐÀO TẠO & THẺ KỸ NĂNG TỪ CV */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Cột trái: Danh sách kỹ năng khóa học (0-100) */}
                  <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        CHI TIẾT ĐIỂM KỸ NĂNG KHÓA HỌC ĐÃ ĐĂNG KÝ (KHÓA K01 &amp; KHÓA K04)
                      </div>
                      <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Bảng điểm kỹ năng đào tạo tại Học viện ({skillStates.length} kỹ năng)
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {skillStates.map((sk) => {
                        const sc = sk.masteryScore ?? sk.score;
                        const ev = sk.evidenceCount ?? 4;
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
                                {ev} minh chứng
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cột phải: Danh sách thẻ kỹ năng từ CV cá nhân */}
                  <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#475569] dark:text-[#94A3B8]">
                        TRÍCH XUẤT TỪ CV CÁ NHÂN · KHÔNG TỰ CHẤM ĐIỂM %
                      </div>
                      <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Kỹ năng &amp; Công nghệ khác ghi nhận từ CV của bạn
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Được đồng bộ tự động từ hồ sơ CV sang Phòng Luyện Phỏng Vấn để câu hỏi sát với kinh nghiệm thực tế của bạn.
                      </p>
                    </div>

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
              </div>

              {/* Lịch sử đóng học phí */}
              <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Lịch sử đóng học phí
                </h2>
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
              </div>
            </div>
          )}

          {/* SIDEBAR SUB-VIEW: SETTINGS */}
          {studentSidebarTab === 'SETTINGS' && (
            <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    src={studentAvatarUrl}
                    name={studentFullName}
                    className="w-12 h-12 rounded-2xl"
                  />
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Thông Tin Tài Khoản &amp; Hồ Sơ Khởi Đầu
                    </h1>
                    {studentBio && (
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                        {studentBio}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/onboarding')}
                  className="px-3.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#059669] dark:text-[#34D399] cursor-pointer"
                >
                  Cập nhật Hồ sơ Khởi đầu &amp; Mục tiêu →
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Họ và tên học viên</div>
                  <div className="font-bold text-sm text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
                    {studentFullName}
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Email đăng nhập</div>
                  <div className="font-mono font-bold text-[#059669] dark:text-[#34D399] mt-0.5">
                    {currentUser?.email || profileAndSkills.userProfile?.email || 'Chưa cập nhật'}
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Số điện thoại / Zalo</div>
                  <div className="font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
                    {studentPhone}
                  </div>
                </div>
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Vai trò &amp; Đợt học</div>
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
                    {currentUser?.role || 'STUDENT'} · {myEnrolledCohorts.length} đợt ghi danh
                  </div>
                </div>
              </div>

              {studentCareerGoal && (
                <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                    Mục tiêu nghề nghiệp cốt lõi
                  </div>
                  <p className="text-xs sm:text-sm text-[#0F172A] dark:text-[#ECFDF5]">
                    {studentCareerGoal}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                <div>
                  <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Chế độ màn hình Sáng / Tối bảo vệ mắt khi học đêm
                  </div>
                  <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Đang sử dụng: {theme === 'light' ? 'Giao diện Sáng dịu mắt' : 'Giao diện Tối tập trung'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold cursor-pointer"
                >
                  Đổi sang chế độ {theme === 'light' ? 'Tối' : 'Sáng'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
