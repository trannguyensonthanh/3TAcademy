import React from 'react';
import {
  Search,
  ArrowRight,
  Calendar,
  Clock,
  Users,
  ShieldCheck,
  MessageSquareText,
  Sparkles,
  HeartHandshake,
  BookOpenCheck,
  Compass,
  Award,
  Cpu,
  Cloud,
  Database,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { CourseCategoryItem } from '../types/domain';
import { formatVnd, formatScheduleSlots } from '../utils/academyLogic';
import {
  AvatarWithFallback,
} from '../components/BotanicalStickers';
import { useAsyncData } from '../hooks/useAsyncData';
import { catalogApi } from '../services/catalog.api';

function resolveCategoryIcon(cat: CourseCategoryItem) {
  const key = (cat.iconName || cat.slug || cat.name || '').toLowerCase();
  if (key.includes('ai') || key.includes('rag') || key.includes('trí tuệ')) return Cpu;
  if (
    key.includes('cloud') ||
    key.includes('swe') ||
    key.includes('backend') ||
    key.includes('hệ thống') ||
    key.includes('phan-mem') ||
    key.includes('phần mềm')
  ) {
    return Cloud;
  }
  return Database;
}

const WHY_CHOOSE_ACADEMY = [
  {
    icon: Users,
    title: 'Học trực tiếp theo lớp, luôn có thầy cô và bạn cùng tiến',
    description:
      'Mỗi khóa học đều có lịch học buổi tối cố định hàng tuần. Bạn được trao đổi trực tiếp với giảng viên và trợ giảng ngay trong giờ học chứ không phải tự bơi một mình qua hàng trăm video thu sẵn.',
  },
  {
    icon: Compass,
    title: 'Vào lớp muộn hay xem lại bài lúc khuya đều theo kịp dễ dàng',
    description:
      'Hôm nào tăng ca vào lớp trễ 10–15 phút, bạn chỉ cần bấm xem tóm tắt nhanh để nắm ngay mạch bài giảng. Khi tự ôn bài lúc khuya, trợ giảng thông minh sẽ chỉ dẫn tới đúng phút giây video bạn cần xem.',
  },
  {
    icon: BookOpenCheck,
    title: 'Làm bài tập thực tế, được sửa từng dòng và chỉ rõ chỗ cần ôn',
    description:
      'Sau mỗi buổi học đều có bài tập ngắn vừa sức để bạn củng cố kiến thức. Với đồ án thực hành, trợ giảng sẽ góp ý chi tiết từng đoạn mã nguồn để bạn tiến bộ thật qua từng tuần.',
  },
  {
    icon: Award,
    title: 'Hoàn thành khóa học có sẵn đồ án thật trong CV & được luyện phỏng vấn',
    description:
      'Khi tốt nghiệp, đồ án thực tế bạn vừa làm được cập nhật thẳng vào hồ sơ năng lực, đồng thời bạn được tặng thêm các buổi luyện phỏng vấn giọng nói 1-1 để tự tin đi ứng tuyển.',
  },
];

export const HomeView: React.FC = () => {
  const {
    catalogSummary: contextSummary,
    courses: contextCourses,
    categories: contextCategories,
    cohorts,
    navigate,
    searchQueryGlobal,
    setSearchQueryGlobal,
  } = useAcademy();

  const { data: apiSummary } = useAsyncData(() => catalogApi.getSummary(), []);
  const { data: apiCourses } = useAsyncData(() => catalogApi.getCourses(), []);
  const { data: apiCategories } = useAsyncData(() => catalogApi.getCategories(), []);
  const summary = apiSummary ?? contextSummary;
  const courses = apiCourses && apiCourses.length > 0 ? apiCourses : contextCourses;
  const categories =
    apiCategories && apiCategories.length > 0 ? apiCategories : contextCategories;
  const instructors = summary?.instructors ?? [];

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/courses');
  };

  return (
    <div className="space-y-20 pb-28">
      {/* 1. HERO & TÌM KIẾM KHÓA HỌC */}
      <section className="pt-12 md:pt-16 pb-16 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
        <div className="max-w-[1040px] mx-auto px-6 text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
              <span>3T Academy · Học Viện Đào Tạo Công Nghệ Thực Chiến</span>
            </div>

            <h1
              className="text-3xl sm:text-5xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5] leading-[1.15]"
              style={{ textWrap: 'balance' }}
            >
              Làm Chủ Kỹ Năng Công Nghệ Thực Chiến
            </h1>

            <p className="text-base sm:text-lg text-[#475569] dark:text-[#94A3B8] leading-relaxed max-w-2xl mx-auto">
              Học trực tiếp cùng chuyên gia theo từng đợt khai giảng, tự tay làm đồ án thực tế và luôn có đội ngũ giảng viên, trợ giảng đồng hành giải đáp cùng bạn suốt khóa học.
            </p>
          </div>

          {/* Search Bar & AI Advisor CTA */}
          <form onSubmit={handleHeroSearch} className="max-w-2xl mx-auto space-y-4">
            <label htmlFor="hero-course-search" className="sr-only">
              Tìm kiếm khóa học hoặc kỹ năng bạn muốn học
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5 p-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-xs">
              <div className="flex items-center gap-2.5 flex-1 px-3 py-1.5">
                <Search className="w-4 h-4 text-[#10B981] shrink-0" />
                <input
                  id="hero-course-search"
                  type="text"
                  value={searchQueryGlobal}
                  onChange={(e) => setSearchQueryGlobal(e.target.value)}
                  placeholder="Bạn muốn học kỹ năng gì hôm nay? Ví dụ: Python, SQL, Xây dựng Trợ lý AI, Backend..."
                  className="w-full bg-transparent text-sm text-[#0F172A] dark:text-[#ECFDF5] placeholder:text-[#475569] dark:placeholder:text-[#94A3B8] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Tìm Khóa Học
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/advisor')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 hover:bg-emerald-200/80 dark:hover:bg-emerald-900/80 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <MessageSquareText className="w-4 h-4" />
                <span>Nhờ AI tư vấn lộ trình phù hợp</span>
              </button>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {categories.map((cat) => {
                  const CatIcon = resolveCategoryIcon(cat);
                  const countVal = cat.courseCount ?? cat.count ?? 0;
                  return (
                    <button
                      key={String(cat.id)}
                      type="button"
                      onClick={() => {
                        const isAll =
                          String(cat.id).toLowerCase() === 'all' ||
                          (cat.slug || '').toLowerCase() === 'all';
                        setSearchQueryGlobal(isAll ? '' : cat.name);
                        navigate('/courses');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-medium text-[#0F172A] dark:text-[#ECFDF5] transition-colors cursor-pointer"
                    >
                      <CatIcon className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>{cat.name}</span>
                      <span className="font-mono text-[11px] text-[#059669] dark:text-[#34D399]">
                        ({countVal})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </form>

          {/* Real Academy Stats from PostgreSQL */}
          {(() => {
            const publishedCount =
              summary?.stats?.publishedCoursesCount ??
              summary?.publishedCoursesCount ??
              courses.length;
            const activeCohortsVal =
              summary?.stats?.openingOrActiveCohortsCount ??
              summary?.activeCohortsCount ??
              cohorts.filter((c) => c.status === 'OPENING' || c.status === 'ONGOING').length;
            const avgRatingVal =
              summary?.stats?.averageRating ?? summary?.ratingAvg ?? 0;
            const reviewsCountVal =
              summary?.stats?.reviewsCount ?? summary?.reviewCount ?? 0;
            const sessionsCountVal =
              summary?.stats?.sessionsPerCourse ?? summary?.sessionsPerCourse ?? 6;
            return (
              <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {[
                  {
                    value: `${publishedCount} Lộ trình`,
                    label: 'Chương trình đào tạo chuyên sâu chuẩn Production',
                  },
                  {
                    value: `${activeCohortsVal} Đợt mở`,
                    label: 'Lớp học trực tuyến đang tuyển sinh & giảng dạy',
                  },
                  {
                    value: avgRatingVal > 0 ? `${avgRatingVal}/5.0` : '24/7',
                    label:
                      reviewsCountVal > 0
                        ? `Đánh giá thực tế từ ${reviewsCountVal} lượt phản hồi học viên`
                        : 'Trợ giảng AI RAG trích dẫn bài giảng từng giây',
                  },
                  {
                    value: `${String(sessionsCountVal).padStart(2, '0')} Buổi`,
                    label: 'Học trực tiếp, vượt Quiz >= 70% & thi cuối khóa',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-4 text-center space-y-1"
                  >
                    <div className="text-xl sm:text-2xl font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      {stat.value}
                    </div>
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-snug">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* 2. TẠI SAO NÊN CHỌN HỌC TẠI 3T ACADEMY */}
      <section className="max-w-[1320px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#059669] dark:text-[#34D399]">
              <HeartHandshake className="w-4 h-4 text-[#10B981]" />
              <span>Giá trị thực tế dành cho người học</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
              Tại Sao Nên Chọn Học Tại 3T Academy?
            </h2>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
              Chúng mình tập trung vào việc giúp bạn hiểu sâu bản chất, làm ra sản phẩm chạy được thật và không bỏ cuộc giữa chừng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/about')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#059669] dark:text-[#34D399] hover:underline whitespace-nowrap cursor-pointer"
          >
            <span>Tìm hiểu thêm về Học viện</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {WHY_CHOOSE_ACADEMY.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. CÁC KHÓA HỌC & ĐỢT KHAI GIẢNG ĐANG MỞ ĐĂNG KÝ */}
      <section className="max-w-[1320px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
              Các Khóa Học &amp; Đợt Khai Giảng Đang Mở
            </h2>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
              Mỗi khóa học đều có lịch khai giảng trực tiếp hàng tuần và giới hạn sĩ số vừa phải để giảng viên theo sát hỗ trợ từng bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/courses')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#059669] dark:text-[#34D399] hover:underline whitespace-nowrap cursor-pointer"
          >
            <span>Xem toàn bộ {courses.length} khóa học</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => {
            const embeddedCohorts = course.cohorts;
            const courseCohorts =
              embeddedCohorts && embeddedCohorts.length > 0
                ? embeddedCohorts
                : cohorts.filter((c) => c.courseId === course.id);
            const activeCohorts = courseCohorts.filter(
              (c) => c.status === 'OPENING' || c.status === 'ONGOING'
            );
            const cohort =
              activeCohorts.find((c) => c.status === 'OPENING') ??
              activeCohorts[0] ??
              courseCohorts[0];
            if (!cohort) return null;

            return (
              <article
                key={course.id}
                className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5 hover:border-[#10B981] transition-colors"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                      {cohort.code}
                      {activeCohorts.length > 1 ? ` (+${activeCohorts.length - 1} đợt khác)` : ''}
                    </span>
                    <span>
                      {course.category} · Trình độ {course.difficultyLevel}/5
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                    <a
                      href={`/courses/${course.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/courses/${course.slug}`);
                      }}
                      className="hover:text-[#059669] dark:hover:text-[#34D399] transition-colors"
                    >
                      {course.title}
                    </a>
                  </h3>

                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed line-clamp-2">
                    {course.shortDescription}
                  </p>

                  <div className="pt-2 space-y-2 text-xs text-[#475569] dark:text-[#94A3B8] border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <span>
                        Đợt gần nhất ({cohort.name.split('—')[0]?.trim() || cohort.code}):{' '}
                        <strong className="font-mono text-[#0F172A] dark:text-[#ECFDF5]">
                          {cohort.startDate}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <span>{formatScheduleSlots(cohort.scheduleSlots)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <span className="tabular-nums">
                        Đã đăng ký:{' '}
                        <strong className="font-mono text-[#0F172A] dark:text-[#ECFDF5]">
                          {cohort.enrolledCount} học viên
                        </strong>
                      </span>
                    </div>
                  </div>

                  {cohort.staff && cohort.staff.length > 0 && (
                    <div className="pt-2 space-y-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                      {cohort.staff.map((st) => (
                        <div key={st.id} className="flex items-center gap-2.5">
                          <AvatarWithFallback
                            src={st.avatarUrl}
                            name={st.fullName}
                            className="w-7 h-7 rounded-full"
                          />
                          <div className="min-w-0 text-xs">
                            <span className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                              {st.fullName}
                            </span>
                            <span className="text-[#475569] dark:text-[#94A3B8]">
                              {' '}
                              · Giảng viên phụ trách chính
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                      Học phí trọn khóa
                    </div>
                    <div className="text-base font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {formatVnd(cohort.tuitionVnd)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/courses/${course.slug}?cohort=${cohort.code}`)}
                    className="px-4 py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Xem chi tiết &amp; Ghi danh
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 4. ĐỘI NGŨ GIẢNG VIÊN CHUYÊN MÔN */}
      <section className="max-w-[1320px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
              Đội Ngũ Giảng Viên Phụ Trách Chuyên Môn
            </h2>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
              Những chuyên gia đang xây dựng hệ thống thực tế tại doanh nghiệp, trực tiếp đứng lớp giảng dạy và thẩm định năng lực đầu ra cho bạn.
            </p>
          </div>
        </div>

        {instructors.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 text-xs text-[#475569] dark:text-[#94A3B8]">
            Đang tải danh sách giảng viên từ hệ thống...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {instructors.map((expert) => (
              <div
                key={expert.id}
                className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
              >
                <div className="flex items-center gap-3.5">
                  <AvatarWithFallback
                    src={expert.avatarUrl}
                    name={expert.fullName}
                    className="w-14 h-14 rounded-full"
                  />
                  <div>
                    <div className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {expert.fullName}
                    </div>
                    <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                      {expert.headline}
                    </div>
                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                      {expert.organization} · {expert.yearsOfExperience}+ năm kinh nghiệm
                    </div>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  {expert.expertiseSummaryMd || expert.bio || ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="max-w-[1320px] mx-auto px-6 pt-10 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#475569] dark:text-[#94A3B8]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          <span>© 2026 3T Academy — Học Viện Đào Tạo Công Nghệ &amp; AI Thực Chiến.</span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="/courses"
            onClick={(e) => {
              e.preventDefault();
              navigate('/courses');
            }}
            className="hover:text-[#0F172A] dark:hover:text-white"
          >
            Danh mục Khóa học
          </a>
          <a
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              navigate('/about');
            }}
            className="hover:text-[#0F172A] dark:hover:text-white"
          >
            Về Học viện
          </a>
          <a
            href="/advisor"
            onClick={(e) => {
              e.preventDefault();
              navigate('/advisor');
            }}
            className="hover:text-[#0F172A] dark:hover:text-white"
          >
            Tư vấn lộ trình
          </a>
        </div>
      </footer>
    </div>
  );
};
