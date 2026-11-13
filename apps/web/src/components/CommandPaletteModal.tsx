import React, { useState } from 'react';
import { Search, X, ArrowRight, BookOpen, ShieldCheck } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { formatVnd, formatScheduleSlots } from '../utils/academyLogic';

export const CommandPaletteModal: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    courses,
    cohorts,
    navigate,
    role,
    toggleTheme,
  } = useAcademy();
  const [query, setQuery] = useState('');

  if (!isCommandPaletteOpen) return null;

  const q = query.trim().toLowerCase();

  const matchedCourses = courses.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.skills.some((s) => s.name.toLowerCase().includes(q))
  );

  const matchedCohorts = cohorts.filter(
    (c) =>
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      formatScheduleSlots(c.scheduleSlots).toLowerCase().includes(q)
  );

  const quickZones = [
    { label: 'Trang Chủ Học Viện', path: '/', allowedRoles: ['GUEST', 'STUDENT', 'INSTRUCTOR', 'ADMIN'] },
    { label: 'Danh Mục & Bộ Lọc Khóa Học', path: '/courses', allowedRoles: ['GUEST', 'STUDENT', 'INSTRUCTOR', 'ADMIN'] },
    { label: 'Về Học Viện & Câu Hỏi Thường Gặp', path: '/about', allowedRoles: ['GUEST', 'STUDENT', 'INSTRUCTOR', 'ADMIN'] },
    { label: 'Trợ Lý Tư Vấn Lộ Trình Học', path: '/advisor', allowedRoles: ['GUEST', 'STUDENT', 'INSTRUCTOR', 'ADMIN'] },
    { label: 'Góc Học Tập Học Viên', path: '/app', allowedRoles: ['STUDENT', 'ADMIN'] },
    { label: 'Hồ sơ của tôi (Resume cá nhân)', path: '/app/profile-cv', allowedRoles: ['STUDENT', 'ADMIN'] },
    { label: 'Luyện phỏng vấn (Duyệt CV & Phỏng vấn giọng nói)', path: '/app/mock-interview', allowedRoles: ['STUDENT', 'ADMIN'] },
    { label: 'Kỹ năng & Tiến độ học tập', path: '/app/progress', allowedRoles: ['STUDENT', 'ADMIN'] },
    { label: 'Cổng Giảng Dạy Giảng Viên', path: '/teach', allowedRoles: ['INSTRUCTOR', 'ADMIN'] },
    { label: 'Hệ Thống Quản Trị Học Viện', path: '/admin', allowedRoles: ['ADMIN'] },
  ].filter(
    (z) =>
      z.allowedRoles.includes(role) &&
      (!q || z.label.toLowerCase().includes(q) || z.path.toLowerCase().includes(q))
  );

  const handleSelect = (path: string) => {
    setCommandPaletteOpen(false);
    navigate(path);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm nhanh khóa học, đợt khai giảng và màn hình"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
          <Search className="w-4 h-4 text-[#10B981] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm khóa học, mã lớp học, kỹ năng hoặc màn hình..."
            className="w-full bg-transparent text-sm text-[#0F172A] dark:text-[#ECFDF5] placeholder:text-[#475569] dark:placeholder:text-[#94A3B8] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            aria-label="Đóng bảng tìm kiếm"
            className="p-1 rounded-md text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Container */}
        <div className="max-h-[420px] overflow-y-auto p-4 space-y-5 text-xs">
          {/* Cohorts */}
          {matchedCohorts.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-2">
                Đợt học đang mở ghi danh (Cohorts)
              </div>
              <div className="space-y-1.5">
                {matchedCohorts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const matchedCourse = courses.find((cr) => cr.id === c.courseId);
                      handleSelect(
                        matchedCourse
                          ? `/courses/${matchedCourse.slug}?cohort=${c.code}`
                          : `/courses`
                      );
                    }}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg hover:bg-[#F7FBF9] dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                          {c.code}
                        </span>
                        <span className="text-[#475569] dark:text-[#94A3B8]">·</span>
                        <span className="font-medium text-[#0F172A] dark:text-[#ECFDF5] truncate">
                          {c.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                        Khai giảng {c.startDate} · {formatScheduleSlots(c.scheduleSlots)}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5] shrink-0">
                      {formatVnd(c.tuitionVnd)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Courses */}
          {matchedCourses.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-2">
                Chương trình đào tạo (Courses)
              </div>
              <div className="space-y-1.5">
                {matchedCourses.map((cr) => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => handleSelect(`/courses/${cr.slug}`)}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-[#F7FBF9] dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BookOpen className="w-4 h-4 text-[#10B981] shrink-0" />
                      <span className="font-medium text-[#0F172A] dark:text-[#ECFDF5] truncate">
                        {cr.title}
                      </span>
                    </div>
                    <span className="text-[#475569] dark:text-[#94A3B8] shrink-0">
                      {cr.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Zone Navigation */}
          <div>
            <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-2">
              Điều hướng nhanh
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {quickZones.map((z) => (
                <button
                  key={z.path}
                  type="button"
                  onClick={() => handleSelect(z.path)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                >
                  <span className="truncate font-medium text-[#0F172A] dark:text-[#ECFDF5]">
                    {z.label}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Theme Action */}
          <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                setCommandPaletteOpen(false);
              }}
              className="inline-flex items-center gap-1 text-[#059669] dark:text-[#34D399] font-medium cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Đổi giao diện Sáng/Tối</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
