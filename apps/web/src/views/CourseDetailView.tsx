import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Lock,
  LogIn,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { ActivityTag } from '../types/domain';
import {
  formatVnd,
  checkCohortScheduleConflict,
  findOverlappingSlotPair,
  formatScheduleSlots,
  getDayOfWeekLabel,
} from '../utils/academyLogic';
import { AvatarWithFallback } from '../components/BotanicalStickers';
import { useAsyncData } from '../hooks/useAsyncData';
import { catalogApi } from '../services/catalog.api';

const ACTIVITY_LABELS: Record<ActivityTag, string> = {
  THEORY: 'Lý thuyết Trọng tâm',
  LIVE_CODING: 'Live Coding Thực chiến',
  EXERCISE_REVIEW: 'Chữa bài & Code Review',
  WORKSHOP: 'Workshop Thiết kế Hệ thống',
};

export const CourseDetailView: React.FC<{ slug: string }> = ({ slug }) => {
  const { courses, cohorts, enrolledCohortIds, navigate, role } = useAcademy();

  const cleanSlug = slug.split('?')[0];
  const { data: detailData } = useAsyncData(
    () => catalogApi.getCourseBySlug(cleanSlug),
    [cleanSlug]
  );

  const fallbackCourse =
    courses.find((c) => c.slug === cleanSlug) ??
    courses[0] ?? {
      id: '',
      slug: cleanSlug,
      title: 'Đang tải khóa học...',
      category: 'AI & Dữ liệu' as const,
      shortDescription: '',
      descriptionMd: '',
      difficultyLevel: 3 as const,
      ratingAvg: 0,
      reviewCount: 0,
      skills: [],
      syllabusTemplate: [],
    };
  const course = detailData?.course
    ? {
        ...detailData.course,
        syllabusTemplate:
          detailData.syllabusTemplate?.modules ?? detailData.course.syllabusTemplate ?? [],
      }
    : fallbackCourse;

  const courseCohorts =
    detailData?.cohorts && detailData.cohorts.length > 0
      ? detailData.cohorts
      : cohorts.filter((c) => c.courseId === course.id);
  const [selectedCohortId, setSelectedCohortId] = useState<string>(
    courseCohorts[0]?.id ?? cohorts[0]?.id ?? ''
  );

  React.useEffect(() => {
    if (courseCohorts.length === 0) return;
    if (!courseCohorts.some((c) => String(c.id) === String(selectedCohortId))) {
      const preferred =
        courseCohorts.find((c) => c.status === 'OPENING') ?? courseCohorts[0];
      if (preferred) {
        setSelectedCohortId(preferred.id);
      }
    }
  }, [courseCohorts, selectedCohortId]);

  const [expandedOrders, setExpandedOrders] = useState<number[]>([1, 4, 5]);

  const selectedCohort =
    courseCohorts.find((c) => c.id === selectedCohortId) ??
    courseCohorts[0] ??
    cohorts[0] ?? {
      id: selectedCohortId,
      courseId: course.id,
      instructorId: '',
      code: '',
      name: 'Chưa có đợt khai giảng',
      curriculumVersion: 'v2026',
      tuitionVnd: 0,
      enrolledCount: 0,
      enrollmentOpenAt: '',
      startDate: '',
      endDate: '',
      scheduleSlots: [],
      status: 'OPENING' as const,
      staff: [],
    };

  const enrolledCohorts = cohorts.filter((c) => enrolledCohortIds.includes(c.id));
  const conflictingCohort = checkCohortScheduleConflict(selectedCohort, enrolledCohorts);
  const overlappingSlotPair = conflictingCohort
    ? findOverlappingSlotPair(selectedCohort, conflictingCohort)
    : null;
  const isAlreadyEnrolled = enrolledCohortIds.includes(selectedCohort.id);

  const toggleSessionAccordion = (order: number) => {
    setExpandedOrders((prev) =>
      prev.includes(order) ? prev.filter((o) => o !== order) : [...prev, order]
    );
  };

  const prerequisites = course.skills.filter((s) => s.type === 'PREREQUISITE');
  const outcomes = course.skills.filter((s) => s.type === 'LEARNING_OUTCOME');

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-10 space-y-8">
      {/* Breadcrumb Back */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#10B981]" />
          <span>Quay lại Danh mục Khóa học</span>
        </button>
      </div>

      {/* 12-Column Layout: 8-Col Main Content + 4-Col Sticky Enrollment Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* 8-Column Main Content */}
        <div className="lg:col-span-8 space-y-8">
          {/* Course Header & Overview */}
          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
              <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                {course.category}
              </span>
              <span>·</span>
              <span className="font-mono">Cấp độ {course.difficultyLevel}/5</span>
              <span>·</span>
              <span className="tabular-nums">
                Đánh giá {course.ratingAvg}/5 ({course.reviewCount} học viên tốt nghiệp)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
              {course.title}
            </h1>

            <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              {course.descriptionMd}
            </p>

            {/* Prerequisite vs Learning Outcome Skill Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                  Kỹ năng đầu vào cần có (Prerequisites):
                </div>
                <div className="flex flex-wrap gap-2">
                  {prerequisites.length === 0 ? (
                    <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Không yêu cầu kinh nghiệm trước
                    </span>
                  ) : (
                    prerequisites.map((sk) => (
                      <span
                        key={sk.code}
                        className="px-2.5 py-1 rounded-md bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-medium text-[#0F172A] dark:text-[#ECFDF5]"
                      >
                        {sk.name} ({sk.code})
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#065F46] dark:text-emerald-300">
                  Năng lực đầu ra đạt được (Learning Outcomes):
                </div>
                <div className="flex flex-wrap gap-2">
                  {outcomes.map((sk) => (
                    <span
                      key={sk.code}
                      className="px-2.5 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 text-xs font-semibold"
                    >
                      {sk.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cohort Selection Cards (So sánh các đợt học) */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Chọn Đợt Khai Giảng Phù Hợp Lịch Cá Nhân
              </h2>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                Mỗi đợt học có Giảng viên phụ trách chính riêng. Nhấn chọn đợt học để kiểm tra xung đột lịch tự động.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseCohorts.map((ch) => {
                const isSelected = ch.id === selectedCohort.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedCohortId(ch.id)}
                    className={`text-left rounded-xl p-5 border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      isSelected
                        ? 'bg-white dark:bg-[#111A15] border-2 border-[#10B981] shadow-sm'
                        : 'bg-white/70 dark:bg-[#111A15]/70 border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]/60'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-sm text-[#059669] dark:text-[#34D399]">
                          {ch.code}
                        </span>
                        <span className="text-xs font-semibold text-[#065F46] dark:text-emerald-300">
                          {ch.status === 'OPENING' ? 'Đang mở ghi danh' : 'Đang học'}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {ch.name}
                      </div>

                      <div className="space-y-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>
                            Khai giảng: <strong className="font-mono">{ch.startDate}</strong> — Kết thúc: <strong className="font-mono">{ch.endDate}</strong>
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                            <span className="font-medium text-[#0F172A] dark:text-[#ECFDF5]">
                              {formatScheduleSlots(ch.scheduleSlots)}
                            </span>
                          </div>
                          {ch.scheduleSlots && ch.scheduleSlots.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pl-5">
                              {ch.scheduleSlots.map((slot, idx) => (
                                <span
                                  key={`${ch.id}-slot-${idx}`}
                                  className="px-2 py-0.5 rounded bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981]/35 text-[11px] font-mono font-semibold text-[#065F46] dark:text-emerald-300"
                                >
                                  {getDayOfWeekLabel(slot.dayOfWeek)}: {slot.startTime} - {slot.endTime}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span>Đã ghi danh: {ch.enrolledCount} học viên</span>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Staff */}
                    <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-2">
                      {ch.staff.map((st) => (
                        <div key={st.id} className="flex items-center gap-2">
                          <AvatarWithFallback
                            src={st.avatarUrl}
                            name={st.fullName}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-xs text-[#0F172A] dark:text-[#ECFDF5] font-medium truncate">
                            {st.fullName}{' '}
                            <span className="text-[#475569] dark:text-[#94A3B8] font-normal">
                              (Giảng viên phụ trách)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expandable Syllabus Accordion */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Đề Cương Chi Tiết ({course.syllabusTemplate.length} Buổi Học Thực Chiến)
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Phiên bản giáo trình <span className="font-mono font-semibold">{selectedCohort.curriculumVersion}</span> · Mỗi buổi đều có Quiz kiểm tra năng lực ngắn để mở khóa hoàn thành.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setExpandedOrders(
                    expandedOrders.length === course.syllabusTemplate.length
                      ? []
                      : course.syllabusTemplate.map((s) => s.order)
                  )
                }
                className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
              >
                {expandedOrders.length === course.syllabusTemplate.length
                  ? 'Thu gọn tất cả'
                  : 'Mở rộng tất cả'}
              </button>
            </div>

            <div className="space-y-2.5">
              {course.syllabusTemplate.map((item) => {
                const isExpanded = expandedOrders.includes(item.order);
                return (
                  <div
                    key={item.order}
                    className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] overflow-hidden"
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleSessionAccordion(item.order)}
                      className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-[#F7FBF9] dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 shrink-0">
                          Buổi {item.order.toString().padStart(2, '0')}
                        </span>
                        <span className="text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] truncate">
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline text-xs text-[#475569] dark:text-[#94A3B8]">
                          {item.activityTags.map((t) => ACTIVITY_LABELS[t]).join(' · ')}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#475569]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#475569]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                        <p className="leading-relaxed">{item.summary}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {item.activityTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded bg-[#D1FAE5]/70 dark:bg-emerald-950/70 text-[#065F46] dark:text-emerald-300 font-medium"
                            >
                              {ACTIVITY_LABELS[tag]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4-Column Sticky Enrollment Card */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5 shadow-xs">
          <div className="pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24] space-y-1">
            <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
              Đợt học đang chọn ghi danh
            </div>
            <div className="font-mono text-lg font-bold text-[#059669] dark:text-[#34D399]">
              {selectedCohort.code}
            </div>
            <div className="text-xs font-medium text-[#0F172A] dark:text-[#ECFDF5]">
              {selectedCohort.name}
            </div>
          </div>

          {/* Schedule Conflict Check Banner */}
          {conflictingCohort && !isAlreadyEnrolled && (
            <div className="rounded-lg bg-amber-500/10 border border-[#F59E0B]/40 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <span>Cảnh báo trùng khung giờ học trong tuần</span>
              </div>
              <p className="text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                Lịch học{' '}
                <strong>
                  {formatScheduleSlots(selectedCohort.scheduleSlots)}
                </strong>{' '}
                {overlappingSlotPair ? (
                  <>
                    bị chồng lấn ca{' '}
                    <strong className="font-mono">
                      {getDayOfWeekLabel(overlappingSlotPair.targetSlot.dayOfWeek)} (
                      {overlappingSlotPair.targetSlot.startTime} -{' '}
                      {overlappingSlotPair.targetSlot.endTime})
                    </strong>{' '}
                  </>
                ) : (
                  'trùng lịch '
                )}
                với đợt <span className="font-mono font-semibold">{conflictingCohort.code}</span> mà bạn đang theo học. Bạn có thể chọn đợt khai giảng khác hoặc xem lại qua bản ghi Replay kèm AI Tutor.
              </p>
            </div>
          )}

          {isAlreadyEnrolled && (
            <div className="rounded-lg bg-[#D1FAE5]/70 dark:bg-emerald-950/80 border border-[#10B981]/40 p-3.5 flex items-center gap-2.5 text-xs text-[#065F46] dark:text-emerald-300 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>Bạn đã là học viên chính thức của đợt {selectedCohort.code}.</span>
            </div>
          )}

          <div className="space-y-2.5 text-xs text-[#475569] dark:text-[#94A3B8]">
            <div className="flex items-center justify-between">
              <span>Ngày khai giảng:</span>
              <span className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                {selectedCohort.startDate}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span>Lịch học trực tiếp:</span>
                <span className="font-medium text-right text-[#0F172A] dark:text-[#ECFDF5]">
                  {formatScheduleSlots(selectedCohort.scheduleSlots)}
                </span>
              </div>
              {selectedCohort.scheduleSlots && selectedCohort.scheduleSlots.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {selectedCohort.scheduleSlots.map((slot, idx) => (
                    <span
                      key={`aside-slot-${idx}`}
                      className="px-2 py-0.5 rounded bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981]/35 text-[11px] font-mono font-semibold text-[#065F46] dark:text-emerald-300"
                    >
                      {getDayOfWeekLabel(slot.dayOfWeek)} ({slot.startTime} - {slot.endTime})
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span>Sĩ số đã ghi danh:</span>
              <span className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                {selectedCohort.enrolledCount} học viên
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Giáo trình áp dụng:</span>
              <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                Phiên bản {selectedCohort.curriculumVersion}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
                Học phí trọn khóa:
              </span>
              <span className="text-2xl font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                {formatVnd(selectedCohort.tuitionVnd)}
              </span>
            </div>

            {/* 1-Click Direct Enrollment Button - Requires STUDENT login */}
            {isAlreadyEnrolled && role === 'STUDENT' ? (
              <button
                type="button"
                onClick={() => navigate(`/app/cohorts/${selectedCohort.id}`)}
                className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Vào Không Gian Lớp Học Ngay →
              </button>
            ) : role === 'GUEST' ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                    <Lock className="w-4 h-4 text-[#F59E0B] shrink-0" />
                    <span>Yêu cầu đăng nhập để ghi danh</span>
                  </div>
                  <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    Bạn hiện đang ở trạng thái Khách. Vui lòng đăng nhập hoặc tạo tài khoản học viên để bảo lưu chỗ và nhận thông tin thanh toán học phí.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Đăng nhập để ghi danh ({selectedCohort.code})</span>
                </button>
              </div>
            ) : role !== 'STUDENT' ? (
              <div className="rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] p-3.5 text-xs text-[#475569] dark:text-[#94A3B8] text-center space-y-1">
                <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                  Tài khoản {role === 'INSTRUCTOR' ? 'Giảng viên' : 'Quản trị viên'}
                </div>
                <p className="text-[11px]">
                  Tính năng ghi danh khóa học chỉ áp dụng cho tài khoản Học viên.
                </p>
              </div>
            ) : selectedCohort.status === 'CLOSED' ? (
              <button
                type="button"
                disabled
                className="w-full py-3 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8] text-sm font-semibold cursor-not-allowed whitespace-nowrap"
              >
                Đợt học đã kết thúc ghi danh ({selectedCohort.code})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/checkout/${selectedCohort.code}`)}
                className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                Đăng ký Đợt học này ({selectedCohort.code})
              </button>
            )}

            <div className="flex items-center gap-2 text-[11px] text-[#475569] dark:text-[#94A3B8] pt-1">
              <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>
                Thanh toán chuyển khoản ngân hàng tự động qua mã VietQR (SePay Webhook mở khóa trong 3 giây).
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
