import React, { useState } from 'react';
import {
  Play,
  Lock,
  CheckCircle2,
  FileText,
  Download,
  Award,
  Calendar,
  Clock,
  ArrowLeft,
  ShieldCheck,
  Video,
  Sparkles,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  formatTimestamp,
  formatScheduleSlots,
  getDayOfWeekLabel,
} from '../utils/academyLogic';
import {
  CompetencyVerifiedShield,
  AvatarWithFallback,
} from '../components/BotanicalStickers';
import { GraduationCertificateDiploma } from '../components/GraduationCertificateDiploma';
import { studentLearningApi } from '../services/learning.api';
import { assessmentApi } from '../services/assessment.api';
import { useAsyncData, useAsyncQuery } from '../hooks/useAsyncData';

export const CohortWorkspaceView: React.FC<{ cohortId: string }> = ({ cohortId }) => {
  const {
    cohorts,
    courses,
    sessions,
    materials,
    certificates,
    enrolledCohortIds,
    role,
    setStudentSidebarTab,
    navigate,
  } = useAcademy();

  const fallbackCohort =
    cohorts.find(
      (c) => c.id === cohortId || c.code.toLowerCase() === cohortId.toLowerCase()
    ) ??
    cohorts[0] ?? {
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
  const fallbackCourse =
    courses.find((cr) => cr.id === fallbackCohort.courseId) ??
    courses[0] ?? {
      id: fallbackCohort.courseId,
      categoryId: '',
      categorySlug: 'ai',
      categoryName: '',
      code: '',
      slug: '',
      title: 'Đang tải khóa học...',
      subtitle: '',
      level: 'INTERMEDIATE' as const,
      durationWeeks: 0,
      totalSessions: 0,
      priceVnd: 0,
      rating: 0,
      reviewCount: 0,
      capstoneSummary: '',
      skills: [],
      syllabusTemplate: [],
    };

  const { data: workspaceData } = useAsyncQuery(
    () => studentLearningApi.getCohortWorkspace(cohortId),
    {
      cohort: fallbackCohort,
      course: fallbackCourse,
      sessions,
      materials,
      finalExamPassed: false,
    },
    [cohortId]
  );

  const cohort = workspaceData.cohort ?? fallbackCohort;
  const course = workspaceData.course ?? fallbackCourse;
  const resolvedFinalExamId =
    workspaceData.finalExamId || `final-exam-${cohort.id}`;

  const { data: finalExamResult } = useAsyncData(
    () => assessmentApi.getAssessmentResult(resolvedFinalExamId),
    [resolvedFinalExamId]
  );

  const workspaceSessions =
    workspaceData.sessions && workspaceData.sessions.length > 0
      ? workspaceData.sessions
      : sessions;
  const workspaceMaterials =
    workspaceData.materials && workspaceData.materials.length > 0
      ? workspaceData.materials
      : materials;

  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'MATERIALS' | 'CERTIFICATE'>(
    'SYLLABUS'
  );
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const completedCount = workspaceSessions.filter((s) => s.isCompleted).length;
  const primaryCert =
    Object.values(certificates).find((c) => c.cohortCode === cohort.code) ??
    Object.values(certificates)[0];
  const isFinalExamLocked = Boolean(
    workspaceData.finalExamPassed || finalExamResult?.hasPassedFinalExam
  );
  const isEnrolledInCohort =
    role === 'INSTRUCTOR' ||
    role === 'ADMIN' ||
    (enrolledCohortIds.includes(cohort.id) && !workspaceData.accessDenied);

  if (!isEnrolledInCohort) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-[#F59E0B] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-xs font-bold">
            YÊU CẦU GHI DANH LỚP HỌC · 403 ENROLLMENT GUARD
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Bạn chưa ghi danh vào Không gian Lớp học đợt {cohort.code}
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            Không gian lớp học, video bài giảng, tài liệu nội bộ và phòng thi cuối khóa của đợt{' '}
            <strong className="font-mono text-[#059669] dark:text-[#34D399]">{cohort.code}</strong>{' '}
            ({course.title}) chỉ dành cho học viên đã hoàn tất đăng ký và thanh toán học phí.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/checkout/${cohort.code}`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <span>Đăng ký &amp; Thanh toán đợt {cohort.code}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(`/courses/${course.slug}`)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
          >
            <span>Xem chi tiết khóa học</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 space-y-6">
      {/* Top Breadcrumb & Back */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#10B981] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại Góc Học Tập Của Tôi</span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold">
            LỚP HỌC ĐỢT {cohort.code}
          </span>
          <span className="px-2.5 py-1 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
            Lịch học cố định: {formatScheduleSlots(cohort.scheduleSlots)}
          </span>
        </div>
      </div>

      {/* Cohort Header Banner */}
      <section className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
              KHÔNG GIAN LỚP HỌC ĐỒNG HÀNH · LỘ TRÌNH {course.syllabusTemplate.length} BUỔI HỌC
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              {course.title} — {cohort.name}
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
              Khai giảng: {cohort.startDate} — Kết thúc dự kiến: {cohort.endDate} · Đã hoàn thành{' '}
              <strong className="font-mono text-[#10B981]">
                {completedCount}/{workspaceSessions.length}
              </strong>{' '}
              buổi học (yêu cầu xem bài giảng &amp; đạt &ge; 7.0/10 bài kiểm tra 10 câu cuối mỗi buổi).
            </p>
            {cohort.scheduleSlots && cohort.scheduleSlots.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                  Các ca học trong tuần:
                </span>
                {cohort.scheduleSlots.map((slot, idx) => (
                  <span
                    key={`${cohort.id}-ws-slot-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981]/40 text-xs font-mono font-bold text-[#065F46] dark:text-[#34D399]"
                  >
                    <Clock className="w-3.5 h-3.5 text-[#10B981]" />
                    <span>
                      {getDayOfWeekLabel(slot.dayOfWeek)} ({slot.startTime} - {slot.endTime})
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Teaching Staff Badges */}
          <div className="flex flex-wrap items-center gap-4 shrink-0">
            {cohort.staff.map((st) => (
              <div
                key={st.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
              >
                <AvatarWithFallback
                  src={st.avatarUrl}
                  name={st.fullName}
                  className="w-10 h-10 rounded-full"
                />
                <div className="text-xs">
                  <div className="font-semibold text-[#059669] dark:text-[#34D399]">
                    Giảng viên phụ trách chính
                  </div>
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">{st.fullName}</div>
                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    {st.organization}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 Workspace Sub-Tabs (Gộp gọn toàn bộ Hỏi đáp vào trong Phòng Học Video của từng buổi) */}
        <div
          role="tablist"
          aria-label="Chuyển đổi phân khu trong lớp học"
          className="flex flex-wrap items-center gap-2 pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24]"
        >
          {[
            { id: 'SYLLABUS', label: '1. Lộ trình từng buổi học & Phòng học Video' },
            { id: 'MATERIALS', label: '2. Tài liệu & Học liệu của lớp' },
            { id: 'CERTIFICATE', label: '3. Thi cuối khóa (25 câu) & Chứng chỉ tốt nghiệp' },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#10B981] text-white'
                    : 'bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: SYLLABUS & VIDEO SESSIONS */}
      {activeTab === 'SYLLABUS' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/70 border border-[#10B981] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-[#065F46] dark:text-emerald-200 font-medium">
              <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0" />
              <span>
                <strong>Quy tắc hoàn thành buổi học:</strong> Để được tính hoàn thành một buổi, bạn cần xem ít nhất{' '}
                <strong className="font-mono">80%</strong> thời lượng bài giảng VÀ làm đạt từ{' '}
                <strong className="font-mono">7.0/10</strong> trở lên bài kiểm tra ngắn (10 câu trắc nghiệm A, B, C, D) cuối buổi đó nhé.
              </span>
            </div>
            <span className="font-mono font-bold text-[#065F46] dark:text-emerald-300 shrink-0">
              Tiến độ: {completedCount}/{workspaceSessions.length} buổi đã hoàn thành
            </span>
          </div>

          <div className="space-y-3">
            {workspaceSessions.map((sess) => {
              const watchPct = Math.min(
                100,
                Math.round((sess.lastPositionSec / sess.durationSeconds) * 100)
              );

              return (
                <article
                  key={sess.id}
                  className={`rounded-xl bg-white dark:bg-[#111A15] border p-5 transition-all ${
                    sess.status === 'LIVE'
                      ? 'border-2 border-[#EF4444]'
                      : sess.isCompleted
                      ? 'border-[#10B981]/60'
                      : 'border-[#E2ECE7] dark:border-[#1E2D24]'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-2 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold px-2.5 py-0.5 rounded bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                          Buổi {sess.sessionOrder.toString().padStart(2, '0')}
                        </span>

                        {sess.status === 'REPLAY_READY' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>Đã có video bài giảng · Đã xem {watchPct}%</span>
                          </span>
                        )}

                        {sess.status === 'LIVE' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-500/15 text-[#EF4444] font-mono font-bold">
                            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                            <span>ĐANG HỌC TRỰC TUYẾN NGAY LÚC NÀY</span>
                          </span>
                        )}

                        {sess.status === 'SCHEDULED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8] font-medium">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Chưa tới giờ mở lớp ({sess.scheduledStart})</span>
                          </span>
                        )}

                        {sess.isCompleted ? (
                          <span className="font-mono font-bold text-[#10B981]">
                            ✓ Đã hoàn thành · Bài kiểm tra 10 câu: {sess.quizScore}/100
                          </span>
                        ) : (
                          sess.status === 'REPLAY_READY' && (
                            <span className="font-mono font-semibold text-[#F59E0B]">
                              • Đang mở bài kiểm tra 10 câu (Cần đạt &ge; 7.0/10 để hoàn thành)
                            </span>
                          )
                        )}
                      </div>

                      <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {sess.title}
                      </h2>

                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        {sess.aiSummaryMd}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#475569] dark:text-[#94A3B8] pt-1">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>
                            {sess.scheduledStart} – {sess.scheduledEnd}
                          </span>
                        </span>
                        <span>·</span>
                        <span>Giảng viên: {sess.hostInstructorName}</span>
                        <span>·</span>
                        <span>{sess.attachmentsCount} tài liệu đính kèm</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {sess.status === 'LIVE' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/live/${sess.id}`)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Vào Phòng Học Trực Tuyến Ngay</span>
                        </button>
                      )}

                      {sess.status === 'REPLAY_READY' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/app/cohorts/${cohort.id}/sessions/${sess.id}`)
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>
                              Xem Video &amp; Hỏi Trợ Giảng AI (Phút {formatTimestamp(sess.lastPositionSec)})
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/app/assessments/${
                                  sess.assessmentId || `quiz-${sess.id}`
                                }`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer whitespace-nowrap"
                          >
                            <Award className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>
                              {sess.isCompleted
                                ? `Làm lại bài kiểm tra (${sess.quizScore}/100)`
                                : 'Làm bài kiểm tra 10 câu'}
                            </span>
                          </button>
                        </>
                      )}

                      {sess.status === 'SCHEDULED' && (
                        <span className="px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                          Mở phòng lúc {sess.scheduledStart}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TÀI LIỆU & HỌC LIỆU CỦA LỚP */}
      {activeTab === 'MATERIALS' && (
        <div className="space-y-5">
          <div className="rounded-xl bg-[#D1FAE5]/60 dark:bg-emerald-950/60 border border-[#10B981] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2.5 text-[#065F46] dark:text-emerald-200">
              <Sparkles className="w-5 h-5 text-[#10B981] shrink-0" />
              <span>
                <strong>Mẹo học tập:</strong> Toàn bộ phần <strong>Hỏi Trợ giảng AI</strong> và{' '}
                <strong>Thảo luận lớp gắn theo mốc giây video</strong> đã được tích hợp trực tiếp ở cột bên phải trong{' '}
                <strong>Phòng Học Video</strong> của từng buổi học để bạn vừa xem vừa hỏi bài tiện lợi nhất!
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const targetVideoSession =
                  workspaceSessions.find((s) => s.sessionOrder === 4) ??
                  workspaceSessions.find((s) => s.status === 'REPLAY_READY') ??
                  workspaceSessions[0];
                if (targetVideoSession) {
                  navigate(
                    `/app/cohorts/${cohort.id}/sessions/${targetVideoSession.id}`
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-bold shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Mở Phòng Học Video Buổi 4 →</span>
            </button>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Kho Tài Liệu, Slide Bài Giảng &amp; Mã Nguồn Thực Hành ({workspaceMaterials.length} học liệu)
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Tài liệu chuẩn do Học viện và Giảng viên biên soạn riêng cho từng buổi học của lớp {cohort.code}.
                </p>
              </div>
              {downloadToast && (
                <span className="px-3 py-1.5 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                  ✓ {downloadToast}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspaceMaterials.map((mat) => {
                const matchedSession =
                  workspaceSessions.find((s) => s.sessionOrder === mat.sessionOrder) ??
                  workspaceSessions[3] ??
                  workspaceSessions[0];
                return (
                  <div
                    key={mat.id}
                    className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 text-[#059669] dark:text-[#34D399] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          Buổi {mat.sessionOrder} · {mat.fileType} ({mat.fileSize})
                        </div>
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {mat.title}
                        </div>
                        <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                          Cập nhật: {mat.updatedAt}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/app/cohorts/${cohort.id}/sessions/${matchedSession.id}`)
                        }
                        className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                      >
                        Xem video &amp; hỏi đáp buổi này →
                      </button>

                      <a
                        href={mat.downloadUrl || '#'}
                        download={mat.title}
                        onClick={(e) => {
                          if (!mat.downloadUrl || mat.downloadUrl.startsWith('#')) {
                            e.preventDefault();
                          }
                          setDownloadToast(`Đã tải xuống "${mat.title}"`);
                          setTimeout(() => setDownloadToast(null), 3000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>Tải tài liệu</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: THI CUỐI KHÓA (25 CÂU) & CHỨNG CHỈ TỐT NGHIỆP */}
      {activeTab === 'CERTIFICATE' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
                PHÒNG THI CUỐI KHÓA · 25 CÂU TRẮC NGHIỆM (A, B, C, D)
              </div>
              <h2 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Kỳ Thi Tốt Nghiệp Cuối Khóa &amp; Nhận 4 Lượt Luyện Phỏng Vấn AI
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Để đảm bảo giá trị thực chất và sự công bằng cho tấm bằng tốt nghiệp của bạn, bài thi cuối khóa gồm{' '}
                <strong>25 câu trắc nghiệm 4 đáp án (A, B, C, D)</strong> được thực hiện trong chế độ toàn màn hình có Camera đồng hành giám sát.
              </p>

              <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs">
                <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                  Trạng thái điều kiện dự thi của bạn:
                </div>
                <div className="flex items-center justify-between">
                  <span>• Số buổi học đã hoàn thành (xem &ge; 80% + đạt bài tập 10 câu):</span>
                  <span className="font-mono font-bold text-[#10B981]">
                    {completedCount}/{workspaceSessions.length} buổi
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>• Kiểm tra Camera &amp; Micrô trước giờ thi:</span>
                  <span className="font-mono font-bold text-[#10B981]">Đã sẵn sàng</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>• Phần thưởng khi vượt qua kỳ thi tốt nghiệp:</span>
                  <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                    Bằng Tốt Nghiệp PDF + 4 Credits Phỏng vấn AI
                  </span>
                </div>
              </div>

              {isFinalExamLocked ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/90 border border-[#10B981] text-xs text-[#065F46] dark:text-emerald-300 font-semibold flex items-center justify-between gap-2">
                    <span>
                      ✓ Bạn đã vượt qua kỳ thi tốt nghiệp cuối khóa, nhận Chứng chỉ và +4 Credits phỏng vấn (Đã khóa thi lại để bảo toàn kết quả).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/app/assessments/${resolvedFinalExamId}/results`)
                    }
                    className="w-full py-3 px-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] text-xs sm:text-sm font-bold text-[#059669] dark:text-[#34D399] cursor-pointer"
                  >
                    Xem lại Bảng điểm Kỳ thi Tốt nghiệp (25 câu) →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/app/exams/${resolvedFinalExamId}/proctored`)
                  }
                  className="w-full py-3 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold cursor-pointer"
                >
                  Vào Phòng Thi Cuối Khóa (25 Câu · Có Camera Giám Sát) →
                </button>
              )}
            </div>

            {primaryCert && (
              <div className="lg:col-span-6 rounded-xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-6 space-y-5">
                <div className="flex items-center gap-3.5">
                  <CompetencyVerifiedShield className="w-14 h-14 shrink-0" />
                  <div>
                    <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      CHỨNG CHỈ TỐT NGHIỆP CÁ NHÂN · ĐÃ CẤP CHÍNH CHỦ
                    </div>
                    <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      {primaryCert.courseTitle}
                    </h2>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs font-mono">
                  <div>Học viên sở hữu: {primaryCert.studentName}</div>
                  <div>Mã chứng chỉ: {primaryCert.certificateCode}</div>
                  <div>Điểm tổng kết: {primaryCert.finalScore}/100 (Loại Xuất Sắc)</div>
                  <div className="text-[#059669] dark:text-[#34D399] truncate">
                    Mã xác thực: {primaryCert.verificationSignature}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStudentSidebarTab('CERTIFICATES_ORDERS');
                    navigate('/app');
                  }}
                  className="w-full py-3 px-5 rounded-xl bg-[#0F172A] dark:bg-white text-white dark:text-[#0F172A] text-xs sm:text-sm font-bold cursor-pointer"
                >
                  Mở Bằng Tốt Nghiệp Trong Góc Học Tập →
                </button>
              </div>
            )}
          </div>

          {/* Full Ceremonial Diploma Preview & PDF Export for Learner */}
          {primaryCert && (
            <GraduationCertificateDiploma certificate={primaryCert} showActionHeader={true} />
          )}
        </div>
      )}
    </div>
  );
};
