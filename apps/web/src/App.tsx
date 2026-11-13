import React from 'react';
import { Lock, ShieldAlert, ArrowRight, Home, LogIn } from 'lucide-react';
import { AcademyProvider, useAcademy } from './context/AcademyContext';
import { TopNavbar } from './components/TopNavbar';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { SessionPlayerQuizModal } from './components/SessionPlayerQuizModal';
import { HomeView } from './views/HomeView';
import { CoursesCatalogView } from './views/CoursesCatalogView';
import { CourseDetailView } from './views/CourseDetailView';
import { AboutAcademyView } from './views/AboutAcademyView';
import { AiAdvisorView } from './views/AiAdvisorView';
import { VietQrCheckoutView } from './views/VietQrCheckoutView';
import { AuthView } from './views/AuthView';
import { OnboardingWizardView } from './views/OnboardingWizardView';
import { StudentDashboardView } from './views/StudentDashboardView';
import { CohortWorkspaceView } from './views/CohortWorkspaceView';
import { InstructorPortalView } from './views/InstructorPortalView';
import { AdminPortalView } from './views/AdminPortalView';
import { SessionVideoRoomView } from './views/SessionVideoRoomView';
import { AssessmentRoomView } from './views/AssessmentRoomView';
import { AssessmentResultView } from './views/AssessmentResultView';
import { ProctoredExamRoomView } from './views/ProctoredExamRoomView';
import { LivestreamClassView } from './views/LivestreamClassView';
import { AppRole, UserRole } from './types/domain';

interface RoleAccessGuardProps {
  allowedRoles: UserRole[];
  areaLabel: string;
}

const RoleAccessGuard: React.FC<RoleAccessGuardProps> = ({ allowedRoles, areaLabel }) => {
  const { role, navigate } = useAcademy();

  const roleNameMap: Record<AppRole, string> = {
    GUEST: 'Khách (Chưa đăng nhập)',
    STUDENT: 'Học viên',
    INSTRUCTOR: 'Giảng viên',
    ADMIN: 'Quản trị viên',
  };

  const allowedLabel = allowedRoles.map((r) => roleNameMap[r]).join(' hoặc ');

  const getPrimaryDestination = () => {
    if (role === 'ADMIN') return { path: '/admin', label: 'Về trang Quản trị học viện' };
    if (role === 'INSTRUCTOR') return { path: '/teach', label: 'Về Cổng giảng viên' };
    if (role === 'STUDENT') return { path: '/app', label: 'Về Góc học tập của tôi' };
    return { path: '/login', label: 'Đăng nhập tài khoản Học viên' };
  };

  const dest = getPrimaryDestination();

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-8 text-center space-y-5 shadow-md">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          {role === 'GUEST' ? <Lock className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-md bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono text-xs font-semibold text-[#059669] dark:text-[#34D399]">
            Kiểm soát phân quyền truy cập
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            {role === 'GUEST'
              ? 'Yêu cầu đăng nhập để truy cập'
              : `Trang này chỉ dành riêng cho ${allowedLabel}`}
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            {role === 'GUEST' ? (
              <>
                Khu vực <strong>{areaLabel}</strong> yêu cầu tài khoản đã được xác thực. Vui lòng đăng nhập với tài khoản{' '}
                <strong>{allowedLabel}</strong> để tiếp tục.
              </>
            ) : (
              <>
                Hiện tại bạn đang đăng nhập với vai trò <strong>{roleNameMap[role]}</strong>. Khu vực{' '}
                <strong>{areaLabel}</strong> chỉ dành riêng cho <strong>{allowedLabel}</strong> theo chính sách phân quyền của học viện.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(dest.path)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            {role === 'GUEST' ? <LogIn className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            <span>{dest.label}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4 text-[#10B981]" />
            <span>Về trang chủ</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthRestoringScreen: React.FC = () => (
  <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-3">
    <div className="w-8 h-8 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin mx-auto" />
    <p className="text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
      Đang khôi phục phiên đăng nhập...
    </p>
  </div>
);

const AppRouter: React.FC = () => {
  const { currentPath, role, isAuthLoading } = useAcademy();
  const cleanPath = currentPath.split('?')[0] || '/';

  // 1. Dedicated Instructor Portal (/teach*) — CHỈ GIẢNG VIÊN (INSTRUCTOR) ĐƯỢC TRUY CẬP
  if (cleanPath.startsWith('/teach')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'INSTRUCTOR') {
      return (
        <RoleAccessGuard
          allowedRoles={['INSTRUCTOR']}
          areaLabel="Cổng giảng dạy của Giảng viên"
        />
      );
    }
    return <InstructorPortalView />;
  }

  // 2. Dedicated Admin Portal (/admin*) — CHỈ QUẢN TRỊ VIÊN (ADMIN) ĐƯỢC TRUY CẬP
  if (cleanPath.startsWith('/admin')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'ADMIN') {
      return (
        <RoleAccessGuard
          allowedRoles={['ADMIN']}
          areaLabel="Hệ thống Quản trị học viện"
        />
      );
    }
    return <AdminPortalView />;
  }

  // 3. Dedicated About Academy & FAQ page (/about) — PUBLIC
  if (cleanPath === '/about') {
    return <AboutAcademyView />;
  }

  // 4. Livestream Classroom & 1-Click Guest Speaker (/live/:sessionId & /live/guest)
  if (cleanPath === '/live/guest') {
    return <LivestreamClassView sessionId="sess-k01-05" isGuestEntry={true} />;
  }
  if (cleanPath.startsWith('/live/')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT' && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}
          areaLabel="Phòng học trực tuyến"
        />
      );
    }
    const liveSessionId = cleanPath.replace('/live/', '') || 'sess-k01-05';
    return <LivestreamClassView sessionId={liveSessionId} />;
  }

  // 4b. Không gian Lớp học & Phòng học Video (/app/cohorts/:cohortId, /app/cohorts/:cohortId/sessions/:sessionId, /cohorts/:cohortId)
  // Đồng bộ phân quyền với Backend & View guards: Học viên đã ghi danh, Giảng viên và Quản trị viên đều được truy cập
  if (cleanPath.startsWith('/app/cohorts/') && cleanPath.includes('/sessions/')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT' && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}
          areaLabel="Phòng học Video & Trợ giảng AI"
        />
      );
    }
    const parts = cleanPath.replace('/app/cohorts/', '').split('/sessions/');
    const cohortId = decodeURIComponent(parts[0] || '');
    const sessionId = decodeURIComponent(parts[1] || '');
    return <SessionVideoRoomView key={`${cohortId}-${sessionId}`} cohortId={cohortId} sessionId={sessionId} />;
  }

  if (cleanPath.startsWith('/app/cohorts/')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT' && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}
          areaLabel="Không gian Lớp học"
        />
      );
    }
    const cohortId = decodeURIComponent(cleanPath.replace('/app/cohorts/', ''));
    return <CohortWorkspaceView key={cohortId} cohortId={cohortId} />;
  }

  if (cleanPath.startsWith('/cohorts/')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT' && role !== 'INSTRUCTOR' && role !== 'ADMIN') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}
          areaLabel="Không gian Lớp học"
        />
      );
    }
    const cohortId = decodeURIComponent(cleanPath.replace('/cohorts/', ''));
    return <CohortWorkspaceView key={cohortId} cohortId={cohortId} />;
  }

  // 5. Các trang Học tập cá nhân của Học viên (/app*, /onboarding)
  if (cleanPath.startsWith('/app') || cleanPath === '/onboarding') {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT']}
          areaLabel="Góc học tập cá nhân của Học viên"
        />
      );
    }

    if (cleanPath === '/onboarding') {
      return <OnboardingWizardView />;
    }

    // Assessment Result & Exact Video Review Guide (/app/assessments/:assessmentId/result or /results)
    if (
      cleanPath.startsWith('/app/assessments/') &&
      (cleanPath.endsWith('/results') || cleanPath.endsWith('/result'))
    ) {
      const assessmentId = cleanPath
        .replace('/app/assessments/', '')
        .replace(/\/results?$/, '');
      return <AssessmentResultView assessmentId={assessmentId || 'sess-k01-04'} />;
    }

    // Assessment Room (/app/assessments/:assessmentId)
    if (cleanPath.startsWith('/app/assessments/')) {
      const assessmentId = cleanPath.replace('/app/assessments/', '') || 'sess-k01-04';
      return <AssessmentRoomView assessmentId={assessmentId} />;
    }

    // Proctored Final Exam Room (/app/exams/:assessmentId)
    if (cleanPath.startsWith('/app/exams/')) {
      const examId = cleanPath.replace('/app/exams/', '') || 'exam-final-k01';
      return <ProctoredExamRoomView assessmentId={examId} />;
    }

    return <StudentDashboardView />;
  }

  // 6. Public Routes
  if (cleanPath === '/' || cleanPath === '') {
    return <HomeView />;
  }
  if (cleanPath === '/courses') {
    return <CoursesCatalogView />;
  }
  if (cleanPath.startsWith('/courses/')) {
    const slug = cleanPath.replace('/courses/', '');
    return <CourseDetailView slug={slug} />;
  }
  if (cleanPath === '/advisor') {
    return <AiAdvisorView />;
  }
  if (cleanPath.startsWith('/checkout/')) {
    if (isAuthLoading) return <AuthRestoringScreen />;
    if (role !== 'STUDENT') {
      return (
        <RoleAccessGuard
          allowedRoles={['STUDENT']}
          areaLabel="Cổng đăng ký & đóng học phí đợt học"
        />
      );
    }
    const cohortCode = cleanPath.replace('/checkout/', '');
    return <VietQrCheckoutView cohortCode={cohortCode} />;
  }
  if (cleanPath.startsWith('/verify') || cleanPath.startsWith('/certificates/verify')) {
    // Tích hợp trực tiếp vào trang Góc học tập cá nhân
    return <StudentDashboardView />;
  }
  if (cleanPath === '/login') {
    return <AuthView initialMode="LOGIN" />;
  }
  if (cleanPath === '/register') {
    return <AuthView initialMode="REGISTER" />;
  }

  return <HomeView />;
};

export default function App() {
  return (
    <AcademyProvider>
      <div className="min-h-screen flex flex-col bg-[#F7FBF9] text-[#0F172A] dark:bg-[#090F0C] dark:text-[#ECFDF5]">
        <TopNavbar />
        <main className="flex-1">
          <AppRouter />
        </main>
        <SessionPlayerQuizModal />
        <CommandPaletteModal />
      </div>
    </AcademyProvider>
  );
}
