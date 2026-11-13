import React, { useState, useMemo } from 'react';
import {
  Search,
  RotateCcw,
  Calendar,
  Users,
  ArrowRight,
  Cpu,
  Cloud,
  Database,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { CourseCategoryItem } from '../types/domain';
import { formatVnd, formatScheduleSlots } from '../utils/academyLogic';
import { EmptyStateBotanicalIllustration } from '../components/BotanicalStickers';
import { useAsyncData } from '../hooks/useAsyncData';
import { catalogApi } from '../services/catalog.api';

function getCategoryFallbackIcon(cat: CourseCategoryItem) {
  const key = (cat.iconName || cat.slug || cat.name || '').toLowerCase();
  if (key.includes('ai') || key.includes('rag')) return Cpu;
  if (key.includes('cloud') || key.includes('swe') || key.includes('phan-mem') || key.includes('phần mềm')) {
    return Cloud;
  }
  return Database;
}

const TARGET_SKILLS = ['Python', 'Trợ lý AI', 'RAG', 'Node.js', 'SQL'];

const DIFFICULTY_LABELS: Record<number, { text: string; colorClass: string }> = {
  1: { text: '1 · Nhập môn', colorClass: 'text-[#10B981]' },
  2: { text: '2 · Cơ bản Thực chiến', colorClass: 'text-[#10B981]' },
  3: { text: '3 · Trung cấp Chuyên sâu', colorClass: 'text-[#F59E0B]' },
  4: { text: '4 · Nâng cao Production', colorClass: 'text-[#F59E0B]' },
  5: { text: '5 · Chuyên gia Kiến trúc', colorClass: 'text-[#EF4444]' },
};

export const CoursesCatalogView: React.FC = () => {
  const {
    courses: contextCourses,
    categories: contextCategories,
    cohorts,
    navigate,
    searchQueryGlobal,
    setSearchQueryGlobal,
  } = useAcademy();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [onlyOpeningCohorts, setOnlyOpeningCohorts] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'POPULAR' | 'PRICE_ASC' | 'DIFFICULTY'>('POPULAR');

  const { data: apiCategories } = useAsyncData(() => catalogApi.getCategories(), []);
  const { data: apiCourses } = useAsyncData(
    () =>
      catalogApi.getCourses({
        category: selectedCategory === 'ALL' ? '' : selectedCategory,
        query: searchQueryGlobal,
      }),
    [selectedCategory, searchQueryGlobal]
  );

  const courses = apiCourses ?? contextCourses;
  const categoryList =
    apiCategories && apiCategories.length > 0 ? apiCategories : contextCategories;

  const filteredCourses = useMemo(() => {
    const q = searchQueryGlobal.trim().toLowerCase();

    const list = courses.filter((course) => {
      if (selectedCategory !== 'ALL' && course.category !== selectedCategory) {
        return false;
      }
      if (selectedDifficulty !== null && course.difficultyLevel !== selectedDifficulty) {
        return false;
      }
      if (
        selectedSkill &&
        !course.skills.some((s) => s.name.toLowerCase() === selectedSkill.toLowerCase())
      ) {
        return false;
      }
      const courseCohorts = cohorts.filter((ch) => ch.courseId === course.id);
      if (onlyOpeningCohorts && !courseCohorts.some((ch) => ch.status === 'OPENING')) {
        return false;
      }
      if (q) {
        const matchTitle = course.title.toLowerCase().includes(q);
        const matchDesc = course.shortDescription.toLowerCase().includes(q);
        const matchSkill = course.skills.some((s) => s.name.toLowerCase().includes(q));
        const matchCohortCode = courseCohorts.some((ch) =>
          ch.code.toLowerCase().includes(q)
        );
        if (!matchTitle && !matchDesc && !matchSkill && !matchCohortCode) {
          return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'DIFFICULTY') {
        return b.difficultyLevel - a.difficultyLevel;
      }
      if (sortBy === 'PRICE_ASC') {
        const minA = Math.min(
          ...cohorts.filter((c) => c.courseId === a.id).map((c) => c.tuitionVnd)
        );
        const minB = Math.min(
          ...cohorts.filter((c) => c.courseId === b.id).map((c) => c.tuitionVnd)
        );
        return minA - minB;
      }
      return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    });
  }, [
    courses,
    cohorts,
    selectedCategory,
    selectedDifficulty,
    selectedSkill,
    onlyOpeningCohorts,
    searchQueryGlobal,
    sortBy,
  ]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedDifficulty(null);
    setSelectedSkill(null);
    setOnlyOpeningCohorts(true);
    setSearchQueryGlobal('');
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
          Danh Mục Chương Trình &amp; Đợt Học Trực Tiếp
        </h1>
        <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
          Lọc chính xác theo nhóm chuyên ngành, độ khó (1–5) và kỹ năng mục tiêu để chọn đợt khai giảng phù hợp nhất.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar Filter (280px on desktop) */}
        <aside className="w-full lg:w-[280px] shrink-0 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-5 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Bộ Lọc Chuyên Sâu
            </h2>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại</span>
            </button>
          </div>

          {/* Toggle: Chỉ hiện khóa đang mở đợt học */}
          <div className="pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                Chỉ hiện khóa đang mở đợt học
              </span>
              <input
                type="checkbox"
                checked={onlyOpeningCohorts}
                onChange={(e) => setOnlyOpeningCohorts(e.target.checked)}
                className="w-4 h-4 accent-[#10B981] rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
              Chuyên ngành đào tạo
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 font-semibold'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-white/5'
                }`}
              >
                Tất cả chuyên ngành ({courses.length})
              </button>
              {categoryList.map((cat) => {
                const CatIcon = getCategoryFallbackIcon(cat);
                const countVal = cat.courseCount ?? cat.count;
                return (
                  <button
                    key={String(cat.id)}
                    type="button"
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat.name
                        ? 'bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 font-semibold'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <CatIcon className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <span className="truncate">{cat.name}</span>
                    </span>
                    {countVal !== undefined && (
                      <span className="font-mono text-[11px] opacity-80">{countVal}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty Filter (1-5 color-coded) */}
          <div className="space-y-2 pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
              Mức độ chuyên sâu (1 – 5)
            </div>
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map((lvl) => {
                const active = selectedDifficulty === lvl;
                const info = DIFFICULTY_LABELS[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedDifficulty(active ? null : lvl)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 font-semibold'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-white/5'
                    }`}
                  >
                    <span>{info.text}</span>
                    <span className={`font-mono font-bold ${info.colorClass}`}>Bậc {lvl}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Skills */}
          <div className="space-y-2.5 pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
              Kỹ năng trọng tâm
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TARGET_SKILLS.map((skill) => {
                const active = selectedSkill === skill;
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => setSelectedSkill(active ? null : skill)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#10B981] text-white font-semibold'
                        : 'bg-[#D1FAE5]/70 dark:bg-emerald-950/60 text-[#065F46] dark:text-emerald-300 hover:bg-[#D1FAE5]'
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Area: Search & Sort Bar + 3-Column Grid */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Top Search & Sort Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-3">
            <div className="flex items-center gap-2.5 flex-1 px-2">
              <Search className="w-4 h-4 text-[#10B981] shrink-0" />
              <input
                type="text"
                aria-label="Tìm kiếm trong danh mục khóa học"
                value={searchQueryGlobal}
                onChange={(e) => setSearchQueryGlobal(e.target.value)}
                placeholder="Tìm theo tên khóa học, kỹ năng (Python, Trợ lý AI, SQL) hoặc mã lớp..."
                className="w-full bg-transparent text-xs sm:text-sm text-[#0F172A] dark:text-[#ECFDF5] placeholder:text-[#475569] dark:placeholder:text-[#94A3B8] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="catalog-sort" className="text-xs text-[#475569] dark:text-[#94A3B8]">
                Sắp xếp:
              </label>
              <select
                id="catalog-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-medium text-[#0F172A] dark:text-[#ECFDF5]"
              >
                <option value="POPULAR">Nhiều học viên đánh giá nhất</option>
                <option value="PRICE_ASC">Học phí thấp đến cao</option>
                <option value="DIFFICULTY">Cấp độ chuyên sâu giảm dần</option>
              </select>
            </div>
          </div>

          {/* 3-Column Course Grid */}
          {filteredCourses.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-12 text-center space-y-4">
              <EmptyStateBotanicalIllustration className="w-16 h-16 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Không tìm thấy chương trình khớp bộ lọc hiện tại
                </h3>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Thử gỡ bỏ bộ lọc độ khó hoặc nhấn Đặt lại để xem toàn bộ các đợt khai giảng đang mở.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-[#059669] transition-colors cursor-pointer"
              >
                Hiển thị tất cả khóa học
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                const courseCohorts = cohorts.filter((c) => c.courseId === course.id);
                const primaryCohort = courseCohorts[0];
                const diffInfo = DIFFICULTY_LABELS[course.difficultyLevel];

                return (
                  <article
                    key={course.id}
                    className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between space-y-4 hover:border-[#10B981] transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span>{course.category}</span>
                        <span className={`font-mono font-semibold ${diffInfo.colorClass}`}>
                          Độ khó {course.difficultyLevel}/5
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                        <a
                          href={`/courses/${course.slug}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/courses/${course.slug}`);
                          }}
                          className="hover:text-[#059669] dark:hover:text-[#34D399]"
                        >
                          {course.title}
                        </a>
                      </h3>

                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed line-clamp-3">
                        {course.shortDescription}
                      </p>

                      {/* Skills summary line */}
                      <div className="text-xs text-[#065F46] dark:text-emerald-300 font-medium pt-1">
                        Kỹ năng: {course.skills.map((s) => s.name).join(' · ')}
                      </div>

                      {primaryCohort && (
                        <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                              {primaryCohort.code}
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Users className="w-3.5 h-3.5 text-[#10B981]" />
                              {primaryCohort.enrolledCount} học viên
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                            <span>
                              Khai giảng {primaryCohort.startDate} · {formatScheduleSlots(primaryCohort.scheduleSlots)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                          Đánh giá {course.ratingAvg}/5 ({course.reviewCount})
                        </div>
                        <div className="text-sm font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {primaryCohort ? formatVnd(primaryCohort.tuitionVnd) : 'Liên hệ'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/courses/${course.slug}`)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>Chọn đợt học</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
