import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Sun,
  Moon,
  Search,
  ChevronDown,
  ChevronUp,
  Compass,
  UserCheck,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { AppRole } from '../types/domain';
import { authApi } from '../services/auth.api';

const ROLE_OPTIONS: { value: AppRole; label: string; subtitle: string }[] = [
  { value: 'GUEST', label: 'GUEST (Khách)', subtitle: 'Chưa đăng nhập' },
  { value: 'STUDENT', label: 'STUDENT (Học viên Nguyễn Văn An)', subtitle: 'Đang học K01' },
  { value: 'INSTRUCTOR', label: 'INSTRUCTOR (TS. Trần Minh Khoa)', subtitle: 'Giảng viên chính' },
  { value: 'ADMIN', label: 'ADMIN (Ban Tổ Chức)', subtitle: 'Quản trị học vụ' },
];

const QUICK_SCREENS: { path: string; label: string; zone: string }[] = [
  { path: '/', label: '1. Trang Chủ Học Viện (/)', zone: 'Zone 1' },
  { path: '/courses', label: '2. Danh Mục & Bộ Lọc (/courses)', zone: 'Zone 1' },
  {
    path: '/courses/ai-engineer-hybrid-rag',
    label: '3. Chi Tiết Khóa Học & Chọn Lớp (/courses/:slug)',
    zone: 'Zone 1',
  },
  { path: '/about', label: '4. Về Học Viện & Câu Hỏi Thường Gặp (/about)', zone: 'Zone 1' },
  { path: '/advisor', label: '5. Trợ Lý AI Tư Vấn Lộ Trình (/advisor)', zone: 'Zone 1' },
  {
    path: '/checkout/AI-ENG-2026-K01',
    label: '6. Thanh Toán Học Phí VietQR (/checkout/AI-ENG-2026-K01)',
    zone: 'Zone 1',
  },
  {
    path: '/app',
    label: '7. Bằng Tốt Nghiệp & Học Phí (/app)',
    zone: 'Học Viên',
  },
  { path: '/login', label: '8. Đăng Nhập / Đăng Ký (/login)', zone: 'Zone 2' },
  { path: '/onboarding', label: '9. Thiết Lập Lộ Trình 4 Bước (/onboarding)', zone: 'Zone 2' },
  { path: '/app', label: '10. Góc Học Tập Học Viên (/app)', zone: 'Học Viên' },
  {
    path: '/app/cohorts/cohort-ai-k01',
    label: '11. Phòng Học Lớp K01 (/app/cohorts/:id)',
    zone: 'Học Viên',
  },
  { path: '/teach', label: '12. Cổng Giảng Dạy Giảng Viên (/teach)', zone: 'Giảng Viên' },
  { path: '/admin', label: '13. Hệ Thống Quản Trị Học Viện (/admin)', zone: 'Quản Trị' },
];

export const DevToolbar: React.FC = () => {
  const {
    role,
    setRole,
    theme,
    toggleTheme,
    currentPath,
    navigate,
    setCommandPaletteOpen,
  } = useAcademy();
  const [expanded, setExpanded] = useState(false);

  const currentRoleInfo = ROLE_OPTIONS.find((r) => r.value === role) ?? ROLE_OPTIONS[1];

  return (
    <aside
      aria-label="Thanh công cụ chuyển đổi vai trò và điều hướng nhanh"
      className="fixed bottom-3 right-3 z-50 max-w-[92vw]"
    >
      {expanded ? (
        <div className="w-[380px] max-w-full rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-xl p-4 text-xs text-[#0F172A] dark:text-[#ECFDF5]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="flex items-center gap-2 font-semibold">
              <SlidersHorizontal className="w-4 h-4 text-[#10B981]" />
              <span>Bộ Chuyển Đổi Vai Trò & Màn Hình (Dev Preview)</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Thu gọn thanh công cụ Dev"
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-[#475569] dark:text-[#94A3B8] cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Role State Switcher */}
          <div className="mb-3">
            <label
              htmlFor="dev-role-select"
              className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1.5"
            >
              Vai trò hiện tại (Role State):
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={async () => {
                      if (opt.value === 'GUEST') {
                        await authApi.logout();
                      }
                      setRole(opt.value);
                    }}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#D1FAE5] dark:bg-emerald-950/90 border-[#10B981] text-[#065F46] dark:text-emerald-300 font-semibold'
                        : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    <div className="truncate">{opt.label}</div>
                    <div className="text-[10px] opacity-80 truncate">{opt.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Quick Screen Jumper */}
          <div className="mb-3">
            <label
              htmlFor="dev-screen-jumper"
              className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mb-1.5"
            >
              Chuyển nhanh tới 10 màn hình trọng tâm:
            </label>
            <select
              id="dev-screen-jumper"
              value={
                QUICK_SCREENS.some((s) => s.path === currentPath) ? currentPath : QUICK_SCREENS[0].path
              }
              onChange={(e) => navigate(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-medium focus:outline-2 focus:outline-emerald-500"
            >
              {QUICK_SCREENS.map((scr) => (
                <option key={scr.path} value={scr.path}>
                  [{scr.zone}] {scr.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Theme Toggle & Command Palette Trigger */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#059669]" />
                  <span>Giao diện Tối (Botanical Dark)</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Giao diện Sáng (Mint Light)</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#10B981] text-white font-semibold hover:bg-[#059669] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="font-mono">Ctrl+K</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 p-1.5 rounded-xl bg-white/95 dark:bg-[#111A15]/95 backdrop-blur-md border border-[#E2ECE7] dark:border-[#1E2D24] shadow-lg text-xs">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{currentRoleInfo.label}</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng'}
            className="p-2 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Mở bảng điều hướng nhanh Ctrl+K"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Ctrl+K</span>
          </button>
        </div>
      )}
    </aside>
  );
};
