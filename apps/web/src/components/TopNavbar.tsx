import React from 'react';
import {
  Search,
  Sparkles,
  GraduationCap,
  LayoutDashboard,
  Presentation,
  Settings,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { authApi } from '../services/auth.api';
import { AvatarWithFallback } from './BotanicalStickers';

export const TopNavbar: React.FC = () => {
  const { currentPath, navigate, role, setRole, setCommandPaletteOpen, currentUser } =
    useAcademy();

  const navItems = [
    { label: 'Trang chủ', path: '/' },
    { label: 'Các khóa học', path: '/courses' },
    { label: 'Tư vấn lộ trình', path: '/advisor', highlight: true },
    { label: 'Về học viện', path: '/about' },
  ];

  const handleLogout = async () => {
    await authApi.logout();
    setRole('GUEST');
    navigate('/login');
  };

  // Giảng viên và Quản trị viên sử dụng Sidebar độc lập, ẩn hoàn toàn Top Header để tránh lẫn lộn phân quyền
  const isManagementRoute =
    role === 'INSTRUCTOR' ||
    role === 'ADMIN' ||
    currentPath.startsWith('/teach') ||
    currentPath.startsWith('/admin');

  if (isManagementRoute) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/95 dark:bg-[#090F0C]/95 backdrop-blur-md border-b border-[#E2ECE7] dark:border-[#1E2D24] transition-colors">
      <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Identity — Gọn gàng, không hiển thị số phiên bản nội bộ */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none shrink-0"
        >
          <div className="w-9 h-9 rounded-lg bg-[#10B981] flex items-center justify-center text-white shadow-xs group-hover:bg-[#059669] transition-colors shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-base tracking-tight text-[#0F172A] dark:text-[#ECFDF5] whitespace-nowrap">
              3T Academy
            </div>
            <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] hidden sm:block whitespace-nowrap">
              Học công nghệ thực chiến
            </p>
          </div>
        </button>

        {/* Main Public Navigation */}
        <nav aria-label="Điều hướng chính" className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? currentPath === '/'
                : currentPath.startsWith(item.path.split('/CERT')[0]);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#D1FAE5]/70 text-[#065F46] dark:bg-emerald-950/80 dark:text-emerald-300 font-semibold'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#ECFDF5] hover:bg-slate-100/70 dark:hover:bg-white/5'
                }`}
              >
                {item.highlight && <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions: Quick Search + Role Workspace Button + Logout */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Tìm kiếm nhanh khóa học và kỹ năng (Ctrl+K)"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs text-[#475569] dark:text-[#94A3B8] hover:border-[#10B981] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="hidden lg:inline">Tìm khóa học...</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-[#090F0C] rounded border border-[#E2ECE7] dark:border-[#1E2D24]">
              Ctrl K
            </kbd>
          </button>

          {role === 'GUEST' && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </button>
          )}

          {role === 'STUDENT' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <AvatarWithFallback
                  src={currentUser?.avatarUrl}
                  name={currentUser?.fullName || 'Nguyễn Văn An'}
                  className="w-6 h-6 rounded-full"
                />
                <LayoutDashboard className="w-4 h-4 hidden sm:inline" />
                <span>Góc học tập của tôi</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất tài khoản"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#EF4444] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#EF4444] transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
