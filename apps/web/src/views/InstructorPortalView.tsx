import React, { useState, useEffect } from 'react';
import {
  Video,
  Layers,
  MessageSquare,
  Calendar,
  Copy,
  Check,
  Upload,
  Send,
  Play,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Save,
  FileText,
  Film,
  Camera,
  UserCheck,
  RotateCcw,
  ArrowLeft,
  BookOpen,
  Award,
  Sparkles,
  Edit3,
  Lock,
  BarChart3,
  LogOut,
  Search,
  ExternalLink,
  X,
} from 'lucide-react';
import { useAcademy, InstructorSidebarTab } from '../context/AcademyContext';
import { Enrollment, Notification, ChatMessage, ClassSession, CohortMaterial } from '../types/domain';
import {
  formatScheduleSlots,
  formatSessionDateTimeVi,
  formatCleanSummaryText,
} from '../utils/academyLogic';
import { AVATAR_MINH_KHOA, AvatarWithFallback } from '../components/BotanicalStickers';
import {
  StackedBarChart,
  ScoreHistogramChart,
  HorizontalTopicBarChart,
  DonutGaugeChart,
} from '../components/charts';
import {
  teachApi,
  McqQuestionItem,
  AssessmentPublishStatus,
  CourseSkillOption,
} from '../services/teach.api';
import { authApi } from '../services/auth.api';
import { useAsyncData } from '../hooks/useAsyncData';
import { SessionVideoPlayer } from '../components/SessionVideoPlayer';

interface BehindScheduleStudent {
  id: string;
  fullName: string;
  email: string;
  cohortCode: string;
  missingSessionsText: string;
  completedSessions: string;
  lastActive: string;
  reminded: boolean;
}

interface CohortStudentProgressRow {
  id: string;
  fullName: string;
  email: string;
  attendedCount: string;
  completedQuizzes: string;
  avgScore: string;
  statusLabel: 'Đúng tiến độ' | 'Cần nhắc làm bài';
}

interface ProctoredExamReviewItem {
  id: string;
  studentName: string;
  studentEmail: string;
  cohortCode: string;
  examTitle: string;
  mcqScore: string;
  submittedAt: string;
  cameraFlagReason: string;
  cameraTimestamp: string;
  snapshotNote: string;
  decision: 'PENDING' | 'APPROVED' | 'RETAKE_REQUIRED';
}

export const InstructorPortalView: React.FC = () => {
  const {
    instructorSidebarTab,
    setInstructorSidebarTab,
    cohorts,
    sessions,
    updateSessionDetails,
    discussions,
    replyToDiscussionAsStaff,
    materials,
    addCohortMaterial,
    currentUser,
    setRole,
    navigate,
  } = useAcademy();

  const { data: scheduleData, refetch: refetchSchedule } = useAsyncData(
    () => teachApi.getInstructorSchedule(),
    [currentUser?.id]
  );
  const { data: instructorCohortsData } = useAsyncData(
    () => teachApi.getInstructorCohorts(),
    [currentUser?.id]
  );

  const [analyticsCohortId, setAnalyticsCohortId] = useState<string>('1');
  const [enrollmentsState, setEnrollmentsState] = useState<Enrollment[]>([]);
  const [notificationsState, setNotificationsState] = useState<Notification[]>([]);
  const [chatMessagesState, setChatMessagesState] = useState<ChatMessage[]>([]);
  const [remindedEnrollmentIds, setRemindedEnrollmentIds] = useState<Record<string, boolean>>({});
  const [analyticsReminderToast, setAnalyticsReminderToast] = useState<string | null>(null);

  // State cho Tab Quản lý học viên (STUDENT_MANAGEMENT) & Modal Hồ sơ học viên chi tiết
  const [studentMgmtCohortFilter, setStudentMgmtCohortFilter] = useState<string>('ALL');
  const [studentMgmtStatusFilter, setStudentMgmtStatusFilter] = useState<
    'ALL' | 'NEW' | 'ON_TRACK' | 'BEHIND'
  >('ALL');
  const [studentMgmtSearch, setStudentMgmtSearch] = useState<string>('');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<Enrollment | null>(null);

  // 6 mục trên Sidebar của Giảng viên (có Quản lý học viên & Thống kê lớp học)
  const sidebarItems: {
    id: InstructorSidebarTab;
    label: string;
    path: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
  }[] = [
    {
      id: 'LIVE_SCHEDULE',
      label: 'Lịch dạy hôm nay',
      path: '/teach',
      icon: Video,
      badge: 'Hôm nay',
    },
    {
      id: 'MANAGE_COHORTS',
      label: 'Lớp đang phụ trách',
      path: '/teach/cohorts',
      icon: Layers,
    },
    {
      id: 'STUDENT_MANAGEMENT',
      label: 'Quản lý học viên',
      path: '/teach/students',
      icon: UserCheck,
      badge: enrollmentsState.length > 0 ? `${enrollmentsState.length} HV` : undefined,
    },
    {
      id: 'CLASS_ANALYTICS',
      label: 'Thống kê lớp học',
      path: '/teach/analytics',
      icon: BarChart3,
    },
    {
      id: 'STUDENT_QA',
      label: 'Hỏi đáp học viên',
      path: '/teach/discussions',
      icon: MessageSquare,
    },
    {
      id: 'AVAILABILITY',
      label: 'Xem lại ca thi cuối khóa',
      path: '/teach/schedule',
      icon: Camera,
    },
  ];

  // Tab 1: Lịch dạy hôm nay — Danh sách học viên chậm tiến độ lấy từ API enrollments
  const [guestLinkGenerated, setGuestLinkGenerated] = useState<string | null>(null);
  const behindStudents: BehindScheduleStudent[] = enrollmentsState
    .filter((enr) => enr.missingQuizzesCount > 0 || enr.riskLevel !== 'LOW')
    .map((enr) => ({
      id: enr.id,
      fullName: enr.studentName,
      email: enr.studentEmail,
      cohortCode: enr.cohortCode,
      missingSessionsText: `Chưa hoàn thành ${enr.missingQuizzesCount} bài kiểm tra mở khóa`,
      completedSessions: `${enr.completedSessionsCount}/${enr.totalSessionsCount} buổi`,
      lastActive: enr.lastActivityAt,
      reminded:
        Boolean(remindedEnrollmentIds[enr.id]) ||
        notificationsState.some((n) => n.userId === enr.userId && n.type === 'AI_STUDY_REMINDER'),
    }));
  const [remindToast, setRemindToast] = useState<string | null>(null);

  // Tab 2: Lớp đang phụ trách — Luồng 3 cấp rõ ràng (LEVEL_1 -> LEVEL_2 -> LEVEL_3)
  const [cohortFlowLevel, setCohortFlowLevel] = useState<
    'LEVEL_1_COHORTS' | 'LEVEL_2_COHORT_DETAIL' | 'LEVEL_3_SESSION_DETAIL'
  >('LEVEL_1_COHORTS');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('1');
  const [cohortDetailSessions, setCohortDetailSessions] = useState<ClassSession[]>([]);

  const effectiveCohorts = (() => {
    if (instructorCohortsData && instructorCohortsData.length > 0) {
      return instructorCohortsData;
    }
    if (currentUser?.role === 'INSTRUCTOR') {
      const matched = cohorts.filter(
        (c) =>
          String(c.instructorId) === String(currentUser.id) ||
          c.staff?.some(
            (s) =>
              s.role === 'INSTRUCTOR' &&
              (String(s.id) === String(currentUser.id) ||
                s.fullName === currentUser.fullName)
          )
      );
      if (matched.length > 0) return matched;
    }
    return cohorts;
  })();

  useEffect(() => {
    if (effectiveCohorts.length === 0) return;
    if (!effectiveCohorts.some((c) => String(c.id) === String(selectedCohortId))) {
      setSelectedCohortId(String(effectiveCohorts[0].id));
    }
    if (!effectiveCohorts.some((c) => String(c.id) === String(analyticsCohortId))) {
      setAnalyticsCohortId(String(effectiveCohorts[0].id));
    }
  }, [effectiveCohorts, selectedCohortId, analyticsCohortId]);

  const selectedCohort =
    effectiveCohorts.find((c) => String(c.id) === String(selectedCohortId)) ??
    effectiveCohorts[0] ?? {
      id: selectedCohortId,
      courseId: '',
      instructorId: currentUser?.id ?? '',
      code: '',
      name: 'Chưa có lớp học',
      curriculumVersion: 'v2026',
      tuitionVnd: 0,
      enrolledCount: 0,
      enrollmentOpenAt: '',
      startDate: '',
      endDate: '',
      scheduleSlots: [],
      status: 'ONGOING' as const,
      staff: [],
    };

  const allInstructorSessions =
    scheduleData?.allSessions && scheduleData.allSessions.length > 0
      ? scheduleData.allSessions
      : sessions;

  const cohortSessions = allInstructorSessions
    .filter((s) => String(s.cohortId) === String(selectedCohort.id))
    .sort((a, b) => a.sessionOrder - b.sessionOrder);

  const detailMatchesSelectedCohort =
    cohortDetailSessions.length > 0 &&
    cohortDetailSessions.every((s) => String(s.cohortId) === String(selectedCohort.id));

  const displayCohortSessions = detailMatchesSelectedCohort
    ? [...cohortDetailSessions].sort((a, b) => a.sessionOrder - b.sessionOrder)
    : cohortSessions;

  const [selectedSessionId, setSelectedSessionId] = useState<string>('1');

  useEffect(() => {
    if (displayCohortSessions.length === 0) return;
    if (!displayCohortSessions.some((s) => String(s.id) === String(selectedSessionId))) {
      setSelectedSessionId(String(displayCohortSessions[0].id));
    }
  }, [displayCohortSessions, selectedSessionId]);

  const activeSession =
    displayCohortSessions.find((s) => String(s.id) === String(selectedSessionId)) ??
    displayCohortSessions[0] ?? {
      id: selectedSessionId,
      cohortId: selectedCohort.id,
      sessionOrder: 1,
      title: 'Chưa có buổi học',
      activityTags: [],
      hostInstructorName: currentUser?.fullName ?? 'Giảng viên',
      scheduledStart: '',
      scheduledEnd: '',
      status: 'SCHEDULED' as const,
      videoR2Key: '',
      videoProvider: 'R2_HLS_AES128' as const,
      durationSeconds: 7200,
      isCompleted: false,
      lastPositionSec: 0,
      aiSummaryMd: '',
      attachmentsCount: 0,
      quizStatus: 'PENDING' as const,
      quizScore: null,
      aiCitations: [],
      quizQuestions: [],
    };

  // Cấp 2: Đề thi tốt nghiệp cuối khóa của lớp (25 câu A, B, C, D)
  const [showAllFinalQuestions, setShowAllFinalQuestions] = useState<boolean>(false);
  const [showAddFinalQForm, setShowAddFinalQForm] = useState<boolean>(false);
  const [finalExamAssessmentId, setFinalExamAssessmentId] = useState<string>('');
  const [finalMcqList, setFinalMcqList] = useState<McqQuestionItem[]>([]);
  const [finalExamPublishStatus, setFinalExamPublishStatus] =
    useState<AssessmentPublishStatus>('PUBLISHED');
  const [finalExamSavedNotice, setFinalExamSavedNotice] = useState<string | null>(null);

  // Cấp 3: Khối 1 (Livestream / Bản ghi), Khối 2 (Tài liệu & Tóm tắt), Khối 3 (Bài kiểm tra 10 câu của buổi)
  const [isPlayingReplayPreview, setIsPlayingReplayPreview] = useState<boolean>(false);
  const [sessionVideoUrlById, setSessionVideoUrlById] = useState<Record<string, string>>({});
  const [videoInputUrl, setVideoInputUrl] = useState<string>('');
  const [videoSaveMsg, setVideoSaveMsg] = useState<string | null>(null);
  const [isSavingVideo, setIsSavingVideo] = useState<boolean>(false);
  const [editSessionSummary, setEditSessionSummary] = useState<string>(
    activeSession.aiSummaryMd
  );
  const [sessionSavedMsg, setSessionSavedMsg] = useState<string | null>(null);
  const [newMatTitle, setNewMatTitle] = useState<string>('');
  const [newMatUrl, setNewMatUrl] = useState<string>('');
  const [newMatType, setNewMatType] = useState<
    'VIDEO' | 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK'
  >('SLIDE');
  const [localMaterials, setLocalMaterials] = useState<CohortMaterial[]>([]);
  const [previewSuppVideoUrl, setPreviewSuppVideoUrl] = useState<string | null>(null);
  const [uploadSavedMsg, setUploadSavedMsg] = useState<string | null>(null);

  // Bài kiểm tra 10 câu A, B, C, D gắn trực tiếp với từng buổi học + Trạng thái DRAFT / PUBLISHED
  const [sessionAssessmentIdById, setSessionAssessmentIdById] = useState<
    Record<string, string>
  >({});
  const [sessionQuizzesById, setSessionQuizzesById] = useState<
    Record<string, McqQuestionItem[]>
  >({});
  const [sessionQuizStatusById, setSessionQuizStatusById] = useState<
    Record<string, AssessmentPublishStatus>
  >({});
  const currentSessionQuestions =
    sessionQuizzesById[activeSession.id] ?? [];
  const currentSessionQuizStatus: AssessmentPublishStatus =
    sessionQuizStatusById[activeSession.id] ?? 'PUBLISHED';

  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [showAddSessionQForm, setShowAddSessionQForm] = useState<boolean>(false);
  const [newQPrompt, setNewQPrompt] = useState<string>('');
  const [newQOptA, setNewQOptA] = useState<string>('');
  const [newQOptB, setNewQOptB] = useState<string>('');
  const [newQOptC, setNewQOptC] = useState<string>('');
  const [newQOptD, setNewQOptD] = useState<string>('');
  const [newQCorrectIdx, setNewQCorrectIdx] = useState<number>(0);
  const [newQExplanation, setNewQExplanation] = useState<string>('');
  const [cohortCourseSkills, setCohortCourseSkills] = useState<CourseSkillOption[]>([]);
  const [newQSkillCode, setNewQSkillCode] = useState<string>('');
  const [quizNotice, setQuizNotice] = useState<string | null>(null);

  // Tab 3: Hỏi đáp học viên (Lọc theo lớp)
  const [qaCohortFilter, setQaCohortFilter] = useState<string>('ALL');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [verifiedThreadIds, setVerifiedThreadIds] = useState<string[]>([]);

  // Tab 4: Xem lại ca thi cuối khóa
  const [examReviews, setExamReviews] = useState<ProctoredExamReviewItem[]>([]);

  useEffect(() => {
    if (scheduleData) {
      if (scheduleData.enrollments) {
        setEnrollmentsState(scheduleData.enrollments);
      }
      if (scheduleData.notifications) {
        setNotificationsState(scheduleData.notifications);
      }
      if (scheduleData.chatMessages) {
        setChatMessagesState(scheduleData.chatMessages);
      }
      if (scheduleData.materials) {
        setLocalMaterials(scheduleData.materials);
      }
      if (scheduleData.examReviews) {
        setExamReviews(
          scheduleData.examReviews.map((r) => ({
            ...r,
            studentEmail: r.studentEmail ?? 'hocvien@3t.edu.vn',
            examTitle: r.examTitle ?? 'Kỳ thi tốt nghiệp cuối khóa (Trắc nghiệm)',
            submittedAt: r.submittedAt ?? 'Đã nộp bài',
          }))
        );
      }
    }
  }, [scheduleData]);

  const [cohortDetailEnrollments, setCohortDetailEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    if (!selectedCohort.id) return;
    let cancelled = false;
    teachApi
      .getInstructorCohortDetail(selectedCohort.id)
      .then((detail) => {
        if (cancelled) return;
        if (detail.sessions && detail.sessions.length > 0) {
          setCohortDetailSessions(detail.sessions);
        }
        if (detail.finalExamAssessmentId) {
          setFinalExamAssessmentId(detail.finalExamAssessmentId);
        }
        if (detail.finalExamQuestions) {
          setFinalMcqList(detail.finalExamQuestions);
        }
        if (detail.finalExamPublishStatus) {
          setFinalExamPublishStatus(detail.finalExamPublishStatus);
        }
        if (detail.enrollments) {
          setCohortDetailEnrollments(detail.enrollments);
        }
        if (detail.courseSkills && detail.courseSkills.length > 0) {
          setCohortCourseSkills(detail.courseSkills);
          setNewQSkillCode((prev) =>
            detail.courseSkills!.some((s) => s.code === prev) ? prev : detail.courseSkills![0]!.code
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedCohort.id]);

  useEffect(() => {
    if (!selectedCohort.id || !selectedSessionId) return;
    let cancelled = false;
    teachApi
      .getInstructorSessionDetail(selectedCohort.id, selectedSessionId)
      .then((detail) => {
        if (cancelled) return;
        if (detail.assessmentId) {
          setSessionAssessmentIdById((prev) => ({
            ...prev,
            [selectedSessionId]: detail.assessmentId!,
          }));
        }
        if (detail.questions) {
          setSessionQuizzesById((prev) => ({
            ...prev,
            [selectedSessionId]: prev[selectedSessionId] ?? detail.questions,
          }));
        }
        if (detail.publishStatus) {
          setSessionQuizStatusById((prev) => ({
            ...prev,
            [selectedSessionId]: prev[selectedSessionId] ?? detail.publishStatus,
          }));
        }
        if (detail.courseSkills && detail.courseSkills.length > 0) {
          setCohortCourseSkills(detail.courseSkills);
          setNewQSkillCode((prev) =>
            detail.courseSkills!.some((s) => s.code === prev) ? prev : detail.courseSkills![0]!.code
          );
        }
        if (detail.videoUrl !== undefined) {
          setSessionVideoUrlById((prev) => ({
            ...prev,
            [selectedSessionId]: detail.videoUrl || '',
          }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedCohort.id, selectedSessionId]);

  const instructorCohortIds = new Set(effectiveCohorts.map((c) => String(c.id)));

  const scopedInstructorSessions = allInstructorSessions.filter(
    (s) => instructorCohortIds.size === 0 || instructorCohortIds.has(String(s.cohortId))
  );

  const activeLiveSession =
    scheduleData?.liveSession?.status === 'LIVE'
      ? scheduleData.liveSession
      : scopedInstructorSessions.find((s) => s.status === 'LIVE') ?? null;

  const upcomingScheduledSessions = (
    scheduleData?.upcomingSessions && scheduleData.upcomingSessions.length > 0
      ? scheduleData.upcomingSessions.filter((s) => s.status === 'SCHEDULED')
      : scopedInstructorSessions.filter((s) => s.status === 'SCHEDULED')
  ).sort((a, b) => {
    const tA = new Date(a.scheduledStart).getTime();
    const tB = new Date(b.scheduledStart).getTime();
    if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) return tA - tB;
    return a.sessionOrder - b.sessionOrder;
  });

  const nextScheduledSession = upcomingScheduledSessions[0] ?? null;

  const liveSession =
    activeLiveSession ??
    nextScheduledSession ??
    displayCohortSessions[displayCohortSessions.length - 1] ??
    activeSession;

  const liveSessionCohort =
    effectiveCohorts.find((c) => String(c.id) === String(liveSession.cohortId)) ??
    cohorts.find((c) => String(c.id) === String(liveSession.cohortId)) ??
    selectedCohort;

  // Mở Cấp 2 (Chi tiết 1 lớp)
  const handleOpenCohortLevel2 = async (cohortId: string) => {
    setSelectedCohortId(cohortId);
    setCohortFlowLevel('LEVEL_2_COHORT_DETAIL');
    setFinalExamSavedNotice(null);
    const detail = await teachApi.getInstructorCohortDetail(cohortId);
    if (detail.sessions && detail.sessions.length > 0) {
      setCohortDetailSessions(detail.sessions);
    }
    if (detail.finalExamAssessmentId) {
      setFinalExamAssessmentId(detail.finalExamAssessmentId);
    }
    if (detail.finalExamQuestions) {
      setFinalMcqList(detail.finalExamQuestions);
    }
    if (detail.finalExamPublishStatus) {
      setFinalExamPublishStatus(detail.finalExamPublishStatus);
    }
    if (detail.enrollments) {
      setCohortDetailEnrollments(detail.enrollments);
    }
  };

  // Mở Cấp 3 (Chi tiết 1 buổi học cụ thể trong lớp)
  const handleOpenSessionLevel3 = async (sessId: string, overrideCohortId?: string) => {
    const targetCohortId = overrideCohortId || selectedCohort.id;
    if (overrideCohortId && overrideCohortId !== selectedCohortId) {
      setSelectedCohortId(overrideCohortId);
    }
    setSelectedSessionId(sessId);
    const found =
      displayCohortSessions.find((s) => String(s.id) === String(sessId)) ??
      scopedInstructorSessions.find((s) => String(s.id) === String(sessId));
    if (found) {
      setEditSessionSummary(formatCleanSummaryText(found.aiSummaryMd));
      setVideoInputUrl(found.videoR2Key || '');
    }
    setIsPlayingReplayPreview(false);
    setSessionSavedMsg(null);
    setVideoSaveMsg(null);
    setUploadSavedMsg(null);
    setQuizNotice(null);
    setEditingQuestionIdx(null);
    setShowAddSessionQForm(false);
    setCohortFlowLevel('LEVEL_3_SESSION_DETAIL');
    const detail = await teachApi.getInstructorSessionDetail(targetCohortId, sessId);
    if (detail.session?.aiSummaryMd !== undefined) {
      setEditSessionSummary(formatCleanSummaryText(detail.session.aiSummaryMd));
    }
    if (detail.session?.videoR2Key !== undefined) {
      setVideoInputUrl(detail.session.videoR2Key || '');
    }
    if (detail.videoUrl !== undefined) {
      setSessionVideoUrlById((prev) => ({
        ...prev,
        [sessId]: detail.videoUrl || '',
      }));
    }
    if (detail.assessmentId) {
      setSessionAssessmentIdById((prev) => ({
        ...prev,
        [sessId]: detail.assessmentId!,
      }));
    }
    if (detail.materials) {
      setLocalMaterials((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of detail.materials!) {
          map.set(m.id, m);
        }
        return Array.from(map.values());
      });
    }
    if (detail.questions) {
      setSessionQuizzesById((prev) => ({
        ...prev,
        [sessId]: prev[sessId] ?? detail.questions,
      }));
    }
  };

  const handleSaveSessionVideoAndStatus = async (
    nextStatus?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY'
  ) => {
    setIsSavingVideo(true);
    setVideoSaveMsg(null);
    try {
      const res = await teachApi.updateSessionMaterials(activeSession.id, {
        videoR2Key: videoInputUrl.trim(),
        ...(nextStatus ? { status: nextStatus } : {}),
      });
      if (res.videoUrl !== undefined) {
        setSessionVideoUrlById((prev) => ({
          ...prev,
          [activeSession.id]: res.videoUrl || '',
        }));
      }
      updateSessionDetails(activeSession.id, {
        videoR2Key: videoInputUrl.trim(),
        ...(res.session?.status ? { status: res.session.status } : {}),
      });
      setCohortDetailSessions((prev) =>
        prev.map((s) =>
          String(s.id) === String(activeSession.id)
            ? {
                ...s,
                videoR2Key: videoInputUrl.trim(),
                ...(res.session?.status ? { status: res.session.status } : {}),
              }
            : s
        )
      );
      await refetchSchedule();
      setVideoSaveMsg(
        `Đã lưu nguồn video & cập nhật trạng thái Buổi ${activeSession.sessionOrder} lên hệ thống.`
      );
      setTimeout(() => setVideoSaveMsg(null), 4000);
    } finally {
      setIsSavingVideo(false);
    }
  };

  const handleCreateGuestLink = async () => {
    const res = await teachApi.createGuestSpeakerLink(liveSession.id);
    navigator.clipboard?.writeText(res.oneTimeGuestUrl).catch(() => {});
    setGuestLinkGenerated(res.oneTimeGuestUrl);
  };

  const handleStartAndEnterLiveSession = async (targetSessionId: string) => {
    try {
      await teachApi.updateSessionLiveStatus(targetSessionId, { status: 'LIVE' });
      updateSessionDetails(targetSessionId, { status: 'LIVE' });
      setCohortDetailSessions((prev) =>
        prev.map((s) =>
          String(s.id) === String(targetSessionId) ? { ...s, status: 'LIVE' } : s
        )
      );
      await refetchSchedule();
    } catch {
      // Proceed to room where host can also toggle status
    }
    navigate(`/live/${targetSessionId}`);
  };

  const handleStopLiveSession = async (targetSessionId: string) => {
    try {
      await teachApi.updateSessionLiveStatus(targetSessionId, { status: 'REPLAY_READY' });
      updateSessionDetails(targetSessionId, { status: 'REPLAY_READY' });
      setCohortDetailSessions((prev) =>
        prev.map((s) =>
          String(s.id) === String(targetSessionId) ? { ...s, status: 'REPLAY_READY' } : s
        )
      );
      await refetchSchedule();
    } catch {
      // Ignore error
    }
  };

  const handleRemindStudent = async (studentId: string, name: string) => {
    const res = await teachApi.sendAiPersonalizedReminder(studentId);
    setRemindedEnrollmentIds((prev) => ({ ...prev, [studentId]: true }));
    await refetchSchedule();
    setRemindToast(res.title || `Đã gửi thông báo nhắc làm bài kiểm tra cho học viên ${name}.`);
    setTimeout(() => setRemindToast(null), 3500);
  };

  const handleRemindAllBehind = async () => {
    await Promise.all(
      behindStudents.map((st) => teachApi.sendAiPersonalizedReminder(st.id))
    );
    const updatedMap: Record<string, boolean> = {};
    behindStudents.forEach((st) => {
      updatedMap[st.id] = true;
    });
    setRemindedEnrollmentIds((prev) => ({ ...prev, ...updatedMap }));
    await refetchSchedule();
    setRemindToast('Đã gửi lời nhắc làm bài kiểm tra tới toàn bộ học viên đang chậm tiến độ.');
    setTimeout(() => setRemindToast(null), 3500);
  };

  // Lưu tóm tắt kiến thức trọng tâm & tải tài liệu / video bổ sung cho buổi học (Cấp 3 - Khối 2)
  const handleSaveSessionSummaryAndMaterials = async (e: React.FormEvent) => {
    e.preventDefault();
    const summaryMd = formatCleanSummaryText(editSessionSummary.trim() || activeSession.aiSummaryMd);
    const matTitle = newMatTitle.trim();
    const matUrl = newMatUrl.trim();
    const res = await teachApi.updateSessionMaterials(activeSession.id, {
      aiSummaryMd: summaryMd,
      ...(matTitle
        ? {
            materialTitle: matTitle,
            materialUrl: matUrl || undefined,
            fileType: newMatType,
          }
        : {}),
    });
    updateSessionDetails(activeSession.id, {
      aiSummaryMd: summaryMd,
    });
    setCohortDetailSessions((prev) =>
      prev.map((s) =>
        String(s.id) === String(activeSession.id)
          ? {
              ...s,
              aiSummaryMd: summaryMd,
              attachmentsCount: matTitle ? s.attachmentsCount + 1 : s.attachmentsCount,
            }
          : s
      )
    );
    if (res.material) {
      setLocalMaterials((prev) => [
        res.material!,
        ...prev.filter((m) => m.id !== res.material!.id),
      ]);
      setNewMatTitle('');
      setNewMatUrl('');
    } else if (matTitle) {
      addCohortMaterial(
        selectedCohort.id,
        activeSession.sessionOrder,
        matTitle,
        newMatType,
        matUrl || undefined
      );
      setNewMatTitle('');
      setNewMatUrl('');
    }
    setSessionSavedMsg(
      matTitle
        ? `Đã lưu ghi chú tóm tắt và đính kèm "${matTitle}" cho Buổi ${activeSession.sessionOrder}.`
        : `Đã lưu ghi chú tóm tắt kiến thức trọng tâm cho Buổi ${activeSession.sessionOrder}.`
    );
    setTimeout(() => setSessionSavedMsg(null), 4000);
  };

  // Tạo 10 câu hỏi gợi ý từ nội dung buổi học đang chọn -> Mặc định ở trạng thái Bản nháp (DRAFT)
  const handleAutoSuggest5QuestionsForSession = async () => {
    const res = await teachApi.generateSessionQuizByAi(activeSession.id);
    if (res.assessmentId) {
      setSessionAssessmentIdById((prev) => ({
        ...prev,
        [activeSession.id]: res.assessmentId,
      }));
    }
    const suggested: McqQuestionItem[] = res.items.map((q, idx) => ({
      ...q,
      number: idx + 1,
      scenarioTag: `Câu ${idx + 1}/${res.items.length} · Buổi ${activeSession.sessionOrder}: ${activeSession.title}`,
    }));
    setSessionQuizzesById((prev) => ({
      ...prev,
      [activeSession.id]: suggested,
    }));
    setSessionQuizStatusById((prev) => ({
      ...prev,
      [activeSession.id]: res.status, // 'DRAFT'
    }));
    setQuizNotice(
      `Đã tạo ${suggested.length} câu hỏi gợi ý ở trạng thái Bản nháp (DRAFT) cho Buổi ${activeSession.sessionOrder}. Giảng viên vui lòng rà soát và bấm "Duyệt & Xuất bản đề (PUBLISHED)" để mở cho học viên làm bài.`
    );
    setTimeout(() => setQuizNotice(null), 5000);
  };

  // Duyệt & Xuất bản bộ đề buổi học (DRAFT -> PUBLISHED)
  const handlePublishSessionQuiz = async () => {
    const targetAssessmentId =
      sessionAssessmentIdById[activeSession.id] ||
      activeSession.assessmentId ||
      `quiz-${activeSession.id}`;
    const res = await teachApi.publishAssessment(
      targetAssessmentId,
      currentSessionQuestions
    );
    setSessionQuizStatusById((prev) => ({
      ...prev,
      [activeSession.id]: res.status,
    }));
    setQuizNotice(
      `Đã duyệt & xuất bản bộ đề (${currentSessionQuestions.length} câu trắc nghiệm) sang trạng thái PUBLISHED cho học viên Buổi ${activeSession.sessionOrder}.`
    );
    setTimeout(() => setQuizNotice(null), 4500);
  };

  // Duyệt & Xuất bản đề thi cuối khóa (DRAFT -> PUBLISHED)
  const handlePublishFinalExam = async () => {
    const targetFinalAssessmentId =
      finalExamAssessmentId || `final-exam-${selectedCohort.id}`;
    const res = await teachApi.publishAssessment(
      targetFinalAssessmentId,
      finalMcqList
    );
    setFinalExamPublishStatus(res.status);
    setFinalExamSavedNotice(
      `Đã duyệt & xuất bản đề thi tốt nghiệp cuối khóa (${finalMcqList.length} câu trắc nghiệm) sang trạng thái PUBLISHED cho lớp ${selectedCohort.code}.`
    );
    setTimeout(() => setFinalExamSavedNotice(null), 4500);
  };

  const openEditSessionQuestion = (idx: number) => {
    const q = currentSessionQuestions[idx];
    if (!q) return;
    setEditingQuestionIdx(idx);
    setNewQPrompt(q.prompt);
    setNewQOptA(q.options[0] || '');
    setNewQOptB(q.options[1] || '');
    setNewQOptC(q.options[2] || '');
    setNewQOptD(q.options[3] || '');
    setNewQCorrectIdx(q.correctIndex);
    setNewQExplanation(q.explanation);
    setNewQSkillCode(q.skillCode || cohortCourseSkills[0]?.code || '');
    setShowAddSessionQForm(true);
  };

  const openNewSessionQuestion = () => {
    setEditingQuestionIdx(null);
    setNewQPrompt('');
    setNewQOptA('');
    setNewQOptB('');
    setNewQOptC('');
    setNewQOptD('');
    setNewQCorrectIdx(0);
    setNewQExplanation('');
    setNewQSkillCode(cohortCourseSkills[0]?.code || currentSessionQuestions[0]?.skillCode || '');
    setShowAddSessionQForm(true);
  };

  const handleSaveSessionQuestionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQPrompt.trim() || !newQOptA.trim() || !newQOptB.trim()) return;

    const list = [...currentSessionQuestions];
    const isEditing = editingQuestionIdx !== null && Boolean(list[editingQuestionIdx]);
    const selectedSkill =
      cohortCourseSkills.find((s) => s.code === newQSkillCode) || cohortCourseSkills[0];
    if (editingQuestionIdx !== null && list[editingQuestionIdx]) {
      list[editingQuestionIdx] = {
        ...list[editingQuestionIdx],
        prompt: newQPrompt.trim(),
        options: [
          newQOptA.trim(),
          newQOptB.trim(),
          newQOptC.trim() || 'Phương án C',
          newQOptD.trim() || 'Phương án D',
        ],
        correctIndex: newQCorrectIdx,
        explanation:
          newQExplanation.trim() ||
          'Giải thích đáp án đúng dựa trên nội dung trọng tâm của buổi học.',
        skillId: selectedSkill?.id ?? list[editingQuestionIdx].skillId,
        skillCode: selectedSkill?.code ?? list[editingQuestionIdx].skillCode,
        skillName: selectedSkill?.name ?? list[editingQuestionIdx].skillName,
      };
    } else {
      const nextNum = list.length + 1;
      list.push({
        number: nextNum,
        scenarioTag: `Câu ${nextNum} · Buổi ${activeSession.sessionOrder}`,
        prompt: newQPrompt.trim(),
        options: [
          newQOptA.trim(),
          newQOptB.trim(),
          newQOptC.trim() || 'Phương án C',
          newQOptD.trim() || 'Phương án D',
        ],
        correctIndex: newQCorrectIdx,
        explanation:
          newQExplanation.trim() ||
          'Giải thích đáp án đúng dựa trên nội dung trọng tâm của buổi học.',
        skillId: selectedSkill?.id,
        skillCode: selectedSkill?.code || 'GENERAL',
        skillName: selectedSkill?.name || 'Kiến thức trọng tâm buổi học',
        reviewTimestampLabel: '00:10 — 00:25',
        reviewJumpSec: 10,
        slideLabel: 'Slide bài giảng',
      });
    }

    const targetSessionAssessmentId =
      sessionAssessmentIdById[activeSession.id] ||
      activeSession.assessmentId ||
      `quiz-${activeSession.id}`;
    const res = await teachApi.publishAssessment(
      targetSessionAssessmentId,
      list,
      'DRAFT'
    );
    const detail = await teachApi.getInstructorSessionDetail(
      selectedCohortId,
      activeSession.id
    );
    setSessionQuizzesById((prev) => ({
      ...prev,
      [activeSession.id]: detail.questions ?? list,
    }));
    setSessionQuizStatusById((prev) => ({
      ...prev,
      [activeSession.id]: res.status,
    }));
    setQuizNotice(
      isEditing
        ? `Đã lưu cập nhật Câu hỏi số ${(editingQuestionIdx ?? 0) + 1} của Buổi ${activeSession.sessionOrder} lên hệ thống.`
        : `Đã lưu Câu hỏi số ${list.length} vào bài kiểm tra cuối Buổi ${activeSession.sessionOrder}.`
    );
    setShowAddSessionQForm(false);
    setEditingQuestionIdx(null);
    setTimeout(() => setQuizNotice(null), 4000);
  };

  // Thêm câu hỏi mới vào Đề thi tốt nghiệp cuối khóa của lớp (Cấp 2) -> Gửi API lưu bản nháp
  const handleAddFinalExamQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQPrompt.trim() || !newQOptA.trim() || !newQOptB.trim()) return;
    const nextNum = finalMcqList.length + 1;
    const selectedSkill =
      cohortCourseSkills.find((s) => s.code === newQSkillCode) || cohortCourseSkills[0];
    const created: McqQuestionItem = {
      number: nextNum,
      scenarioTag: `Câu ${nextNum} · Đề thi tốt nghiệp ${selectedCohort.code}`,
      prompt: newQPrompt.trim(),
      options: [
        newQOptA.trim(),
        newQOptB.trim(),
        newQOptC.trim() || 'Phương án C',
        newQOptD.trim() || 'Phương án D',
      ],
      correctIndex: newQCorrectIdx,
      explanation:
        newQExplanation.trim() ||
        'Giải thích đáp án đúng cho câu hỏi thi tốt nghiệp cuối khóa.',
      skillId: selectedSkill?.id,
      skillCode: selectedSkill?.code || 'GENERAL',
      skillName: selectedSkill?.name || 'Kiến thức tổng hợp toàn khóa',
      reviewTimestampLabel: 'Ôn tập cuối khóa',
      reviewJumpSec: 10,
      slideLabel: 'Tài liệu ôn tập',
    };
    const nextList = [...finalMcqList, created];
    const targetFinalAssessmentId =
      finalExamAssessmentId || `final-exam-${selectedCohort.id}`;
    const res = await teachApi.publishAssessment(
      targetFinalAssessmentId,
      nextList,
      'DRAFT'
    );
    const detail = await teachApi.getInstructorCohortDetail(selectedCohort.id);
    if (detail.finalExamQuestions) {
      setFinalMcqList(detail.finalExamQuestions);
    }
    setFinalExamPublishStatus(res.status);
    setShowAddFinalQForm(false);
    setNewQPrompt('');
    setNewQOptA('');
    setNewQOptB('');
    setNewQOptC('');
    setNewQOptD('');
    setNewQExplanation('');
    setFinalExamSavedNotice(
      `Đã thêm Câu hỏi số ${nextNum} (Trạng thái: Bản nháp ${res.status}). Hãy bấm "Duyệt & Xuất bản đề (PUBLISHED)" để áp dụng cho lớp ${selectedCohort.code}.`
    );
    setTimeout(() => setFinalExamSavedNotice(null), 4500);
  };

  const handleExamDecision = async (
    reviewId: string,
    decision: 'APPROVED' | 'RETAKE_REQUIRED'
  ) => {
    await teachApi.reviewExamProctoring(reviewId, decision);
    setExamReviews((prev) =>
      prev.map((item) => (item.id === reviewId ? { ...item, decision } : item))
    );
    await refetchSchedule();
  };

  const handleToggleVerifyThread = async (threadId: string, currentVerified: boolean) => {
    const nextVerified = !currentVerified;
    try {
      await teachApi.verifyDiscussionThread(threadId, nextVerified);
    } catch {
      // Optimistic fallback if already updated
    }
    setVerifiedThreadIds((prev) => {
      const cleaned = prev.filter((id) => id !== threadId && id !== `unverify:${threadId}`);
      return nextVerified ? [...cleaned, threadId] : [...cleaned, `unverify:${threadId}`];
    });
  };

  const combinedMaterials = (() => {
    const map = new Map<string, CohortMaterial>();
    for (const m of materials) map.set(m.id, m);
    for (const m of localMaterials) map.set(m.id, m);
    return Array.from(map.values());
  })();

  const sessionMaterials = combinedMaterials.filter(
    (m) =>
      (String(m.cohortId) === String(selectedCohort.id) &&
        m.sessionOrder === activeSession.sessionOrder) ||
      (m.sessionId && String(m.sessionId) === String(activeSession.id))
  );

  const filteredDiscussions = discussions.filter((d) => {
    if (qaCohortFilter !== 'ALL') {
      return String(d.cohortId) === String(qaCohortFilter);
    }
    return instructorCohortIds.size === 0 || instructorCohortIds.has(String(d.cohortId));
  });

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5]">
      {/* ====================================================================
          LEFT SIDEBAR CỐ ĐỊNH BÊN TRÁI (CHỈ 4 MỤC — KHÔNG CÓ NÚT TRANG CHỦ)
         ==================================================================== */}
      <aside className="w-full lg:w-[272px] shrink-0 lg:h-screen lg:sticky lg:top-0 bg-white dark:bg-[#111A15] border-b lg:border-b-0 lg:border-r border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between gap-6">
        <div className="space-y-6">
          {/* Brand + Portal Title (Khóa chặt trong Cổng Giảng Viên) */}
          <div className="pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
              3T Academy
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#10B981] mt-0.5">
              Cổng Giảng Viên &amp; Trợ Giảng
            </div>
          </div>

          {/* 4 Sidebar Menu Items */}
          <nav className="space-y-1.5" aria-label="Menu Cổng Giảng Viên và Trợ Giảng">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active =
                instructorSidebarTab === item.id ||
                (item.id === 'MANAGE_COHORTS' && instructorSidebarTab === 'QUIZ_BUILDER');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setInstructorSidebarTab(item.id);
                    if (item.id === 'MANAGE_COHORTS') {
                      setCohortFlowLevel('LEVEL_1_COHORTS');
                    }
                    navigate(item.path);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-[#090F0C] hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Instructor Profile Footer & Logout */}
        <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={currentUser?.avatarUrl || AVATAR_MINH_KHOA}
              alt={currentUser?.fullName || 'Giảng viên'}
              className="w-10 h-10 rounded-full object-cover border border-[#10B981] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">
                {currentUser?.fullName || 'Giảng viên'}
              </p>
              <p className="text-[11px] text-[#059669] dark:text-[#34D399] font-semibold truncate">
                Giảng viên chính
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await authApi.logout();
              setRole('GUEST');
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#EF4444] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#EF4444] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất tài khoản giảng viên</span>
          </button>
        </div>
      </aside>

      {/* ====================================================================
          MAIN WORKSPACE AREA (KHÔNG CÓ TOP HEADER LẶP LẠI MENU)
         ==================================================================== */}
      <div className="flex-1 min-w-0 overflow-x-hidden p-6 md:p-8 pb-28 flex flex-col gap-6">
        {/* ==================================================================
            1. LỊCH DẠY HÔM NAY (/teach)
           ================================================================== */}
        {instructorSidebarTab === 'LIVE_SCHEDULE' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Lịch dạy hôm nay &amp; Trong tuần</h1>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                Quản lý các ca dạy trực tuyến sắp diễn ra và nhắc nhở học viên hoàn thành bài kiểm tra trước giờ lên lớp.
              </p>
            </div>

            {/* Thẻ Trạng thái Phòng học Trực tuyến hôm nay (Đồng bộ trạng thái LIVE & SCHEDULED thật từ Backend) */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border-2 border-[#10B981] p-6 space-y-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  {activeLiveSession ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#EF4444]/10 text-[#EF4444] text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                      <span>
                        ĐANG MỞ PHÒNG TRỰC TUYẾN · {liveSessionCohort.code} · BUỔI{' '}
                        {activeLiveSession.sessionOrder}
                      </span>
                    </div>
                  ) : nextScheduledSession ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>
                        CA DẠY TRỰC TUYẾN SẮP TỚI · {liveSessionCohort.code} · CHƯA DIỄN RA (CHƯA CÓ BẢN GHI)
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>
                        ĐÃ HOÀN THÀNH CÁC CA DẠY TRONG LỊCH · ĐÃ CÓ BẢN GHI VIDEO
                      </span>
                    </div>
                  )}
                  <h2 className="text-lg sm:text-xl font-bold">
                    {liveSessionCohort.code ? `[${liveSessionCohort.code}] ` : ''}Buổi{' '}
                    {liveSession.sessionOrder}: {liveSession.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                    Lớp: <strong>{liveSessionCohort.name}</strong> · Lịch dự kiến:{' '}
                    <strong>{formatSessionDateTimeVi(liveSession.scheduledStart)}</strong> ·{' '}
                    {activeLiveSession
                      ? 'Học viên trong lớp đang thấy phòng Live và có thể vào học ngay.'
                      : nextScheduledSession
                      ? 'Buổi học này chưa diễn ra và chưa có bản ghi video. Khi đến giờ lên lớp, bấm Bắt đầu buổi học trực tuyến để mở phòng.'
                      : 'Tất cả các buổi học trước đó đã có bản ghi video. Bạn có thể mở lại phòng trực tuyến bổ trợ nếu cần.'}
                  </p>
                </div>

                {/* Các nút điều khiển mở / vào / tắt phòng học trực tuyến */}
                <div className="flex flex-wrap items-center gap-3">
                  {activeLiveSession || nextScheduledSession ? (
                    <button
                      type="button"
                      onClick={() => void handleStartAndEnterLiveSession(liveSession.id)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {activeLiveSession
                          ? 'Vào phòng dạy trực tuyến'
                          : `Bắt đầu dạy trực tuyến (Buổi ${liveSession.sessionOrder})`}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInstructorSidebarTab('MANAGE_COHORTS');
                        void handleOpenSessionLevel3(liveSession.id, String(liveSession.cohortId));
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Film className="w-4 h-4" />
                      <span>Xem bản ghi &amp; Quản lý buổi học →</span>
                    </button>
                  )}

                  {activeLiveSession && (
                    <button
                      type="button"
                      onClick={() => void handleStopLiveSession(activeLiveSession.id)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <span>Tắt Live (Đóng phòng)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCreateGuestLink}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] hover:border-[#10B981] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {guestLinkGenerated ? (
                      <>
                        <Check className="w-4 h-4 text-[#10B981]" />
                        <span className="text-[#059669] dark:text-[#34D399]">
                          Đã tạo &amp; sao chép link Khách mời
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#10B981]" />
                        <span>Tạo link mời Khách mời</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {guestLinkGenerated && (
                <div className="p-3.5 rounded-xl bg-[#D1FAE5]/60 dark:bg-emerald-950/70 border border-[#10B981]/50 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-[#065F46] dark:text-emerald-300">
                      Đường dẫn dùng 1 lần cho Diễn giả bên ngoài (vào thẳng không cần tạo tài khoản):
                    </div>
                    <div className="font-mono text-[#0F172A] dark:text-white break-all">
                      {guestLinkGenerated}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/live/guest')}
                    className="px-3.5 py-1.5 rounded-lg bg-[#10B981] text-white font-bold cursor-pointer shrink-0"
                  >
                    Mở màn hình Khách mời →
                  </button>
                </div>
              )}

              {/* Các ca dạy sắp tới (đồng bộ 100% từ danh sách buổi học trạng thái SCHEDULED của giảng viên) */}
              <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Danh sách các buổi học sắp diễn ra (Chưa có bản ghi video):
                  </span>
                  <span className="text-[#475569] dark:text-[#94A3B8]">
                    Đồng bộ trực tiếp với tiến độ từng lớp học bên mục Lớp đang phụ trách
                  </span>
                </div>

                {upcomingScheduledSessions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingScheduledSessions.slice(0, 4).map((upcomingSess) => {
                      const sessCohort =
                        effectiveCohorts.find(
                          (c) => String(c.id) === String(upcomingSess.cohortId)
                        ) ??
                        cohorts.find(
                          (c) => String(c.id) === String(upcomingSess.cohortId)
                        );
                      return (
                        <div
                          key={upcomingSess.id}
                          className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 text-xs min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                                {sessCohort?.code || 'LỚP HỌC'}
                              </span>
                              <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                {formatSessionDateTimeVi(upcomingSess.scheduledStart)}
                              </span>
                            </div>
                            <div className="font-bold text-sm text-[#0F172A] dark:text-[#ECFDF5]">
                              {sessCohort?.name || 'Lớp phụ trách'} — Buổi{' '}
                              {upcomingSess.sessionOrder}
                            </div>
                            <div className="text-[#475569] dark:text-[#94A3B8] line-clamp-1">
                              Chủ đề: {upcomingSess.title}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                              Chưa diễn ra
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInstructorSidebarTab('MANAGE_COHORTS');
                                void handleOpenSessionLevel3(
                                  upcomingSess.id,
                                  String(upcomingSess.cohortId)
                                );
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold text-[#059669] dark:text-[#34D399] cursor-pointer"
                            >
                              Chi tiết →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {effectiveCohorts.map((c) => {
                      const cSessions = scopedInstructorSessions.filter(
                        (s) => String(s.cohortId) === String(c.id)
                      );
                      const completedCount = cSessions.filter(
                        (s) => s.status === 'REPLAY_READY'
                      ).length;
                      return (
                        <div
                          key={c.id}
                          className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 text-xs">
                            <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                              {c.code} · {formatScheduleSlots(c.scheduleSlots)}
                            </div>
                            <div className="font-bold text-sm">{c.name}</div>
                            <div className="text-[#475569] dark:text-[#94A3B8]">
                              Đã hoàn thành {completedCount}/{cSessions.length || 6} buổi học · Có đầy đủ bản ghi video
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold shrink-0">
                            Đã có bản ghi
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Khối bên dưới: Danh sách học viên đang chậm tiến độ */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">
                    Học viên đang chậm tiến độ (Chưa hoàn thành bài kiểm tra buổi trước)
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Giảng viên phụ trách lớp bấm gửi lời nhắc để các bạn hoàn thành bài kiểm tra ngắn trước giờ học mới.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRemindAllBehind}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Gửi lời nhắc cho tất cả ({behindStudents.length})</span>
                </button>
              </div>

              {remindToast && (
                <div className="p-3 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                  ✓ {remindToast}
                </div>
              )}

              <div className="divide-y divide-[#E2ECE7] dark:divide-[#1E2D24]">
                {behindStudents.map((st) => (
                  <div
                    key={st.id}
                    className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarWithFallback
                        name={st.fullName}
                        className="w-10 h-10 rounded-full shrink-0"
                      />
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#0F172A] dark:text-[#ECFDF5]">
                            {st.fullName}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            {st.cohortCode}
                          </span>
                        </div>
                        <div className="text-[#EF4444] font-semibold">
                          {st.missingSessionsText}
                        </div>
                        <div className="text-[#475569] dark:text-[#94A3B8]">
                          Email: {st.email} · Đã hoàn thành: {st.completedSessions} · Truy cập gần nhất: {st.lastActive}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {st.reminded ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Đã gửi lời nhắc</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemindStudent(st.id, st.fullName)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                        >
                          <Bell className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Gửi lời nhắc</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            2. LỚP ĐANG PHỤ TRÁCH (/teach/cohorts) — LUỒNG 3 CẤP RÕ RÀNG
           ================================================================== */}
        {(instructorSidebarTab === 'MANAGE_COHORTS' ||
          instructorSidebarTab === 'QUIZ_BUILDER') && (
          <div className="space-y-6">
            {/* --------------------------------------------------------------
                CẤP 1: DANH SÁCH CÁC LỚP ĐANG DẠY
               -------------------------------------------------------------- */}
            {cohortFlowLevel === 'LEVEL_1_COHORTS' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold">
                    Lớp đang phụ trách (Quản lý Buổi học, Tài liệu &amp; Đề kiểm tra)
                  </h1>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                    Chọn một lớp học bên dưới để xem danh sách các buổi học, đề thi tốt nghiệp cuối khóa và tiến độ học viên của lớp đó.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {effectiveCohorts.map((cohort) => {
                    const cohortSessList = allInstructorSessions.filter(
                      (s) => String(s.cohortId) === String(cohort.id)
                    );
                    const countSessions = cohortSessList.length || 6;
                    const replayCount = cohortSessList.filter(
                      (s) => s.status === 'REPLAY_READY'
                    ).length;
                    const liveCount = cohortSessList.filter(
                      (s) => s.status === 'LIVE'
                    ).length;
                    const scheduledCount = cohortSessList.filter(
                      (s) => s.status === 'SCHEDULED'
                    ).length;
                    const instructorName =
                      cohort.staff?.find((s) => s.role === 'INSTRUCTOR')?.fullName ??
                      currentUser?.fullName ??
                      'TS. Lê Minh Khoa';

                    const statusDisplay =
                      liveCount > 0
                        ? `● Đang mở phòng trực tuyến (${replayCount}/${countSessions} buổi có bản ghi)`
                        : replayCount > 0 && scheduledCount > 0
                        ? `● Đang giảng dạy (${replayCount}/${countSessions} buổi có bản ghi · ${scheduledCount} buổi sắp tới)`
                        : replayCount > 0 && scheduledCount === 0
                        ? `● Đã hoàn thành (${replayCount}/${countSessions} buổi có bản ghi)`
                        : `● Sắp khai giảng (${countSessions} buổi chưa diễn ra)`;

                    return (
                      <div
                        key={cohort.id}
                        className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] p-6 flex flex-col justify-between gap-5 transition-all shadow-[0_1px_3px_rgba(15,23,42,0.03)]"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                              {cohort.code}
                            </span>
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                              Đề cương áp dụng: {cohort.curriculumVersion || 'Phiên bản 2026'}
                            </span>
                          </div>

                          <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            {cohort.name}
                          </h2>

                          <div className="space-y-1.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                            <div>
                              Lịch học cố định:{' '}
                              <strong className="text-[#0F172A] dark:text-white">
                                {formatScheduleSlots(cohort.scheduleSlots)}
                              </strong>
                            </div>
                            <div>
                              Khai giảng: <strong>{cohort.startDate}</strong> · Sĩ số:{' '}
                              <strong>{cohort.enrolledCount} học viên</strong> · Thời lượng:{' '}
                              <strong>{countSessions} buổi học</strong>
                            </div>
                            <div>
                              Giảng viên phụ trách: <strong>{instructorName}</strong> · Hỗ trợ học viên:{' '}
                              <strong>Trợ giảng AI 24/7</strong>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                            {statusDisplay}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleOpenCohortLevel2(cohort.id)}
                            className="px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer transition-colors"
                          >
                            Vào quản lý lớp học này →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------
                CẤP 2: KHÔNG GIAN RIÊNG CỦA 1 LỚP CỤ THỂ (VD: KHÓA K01)
               -------------------------------------------------------------- */}
            {cohortFlowLevel === 'LEVEL_2_COHORT_DETAIL' && (
              <div className="space-y-6">
                {/* Thanh điều hướng quay lại Cấp 1 */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setCohortFlowLevel('LEVEL_1_COHORTS')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#10B981]" />
                    <span>Quay lại danh sách các lớp đang phụ trách</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveCohorts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void handleOpenCohortLevel2(c.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                          String(selectedCohort.id) === String(c.id)
                            ? 'bg-[#10B981] text-white'
                            : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                        }`}
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thông tin tổng quan của Lớp đang chọn */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                        {selectedCohort.code}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                        Đề cương áp dụng: {selectedCohort.curriculumVersion || 'Phiên bản 2026'}
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold mt-1">
                      {selectedCohort.name}
                    </h1>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Lịch học chuẩn của lớp:{' '}
                      <strong>{formatScheduleSlots(selectedCohort.scheduleSlots)}</strong> · Sĩ số:{' '}
                      <strong>
                        {Math.max(selectedCohort.enrolledCount, cohortDetailEnrollments.length)} học viên
                      </strong>
                    </p>
                  </div>
                </div>

                {/* PHẦN 1 (CẤP 2): DANH SÁCH CÁC BUỔI HỌC CỦA LỚP (BUỔI 1 -> BUỔI 6) */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold">
                        1. Danh sách các Buổi học của lớp ({displayCohortSessions.length} buổi)
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Bấm vào từng buổi học để mở không gian chi tiết (Livestream / Bản ghi, Tài liệu tóm tắt &amp; bài kiểm tra trắc nghiệm của buổi đó).
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] dark:text-[#94A3B8] px-3 py-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <Lock className="w-3.5 h-3.5 text-[#10B981]" />
                      Tên buổi học &amp; lịch trình chuẩn do Học viện thiết lập
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayCohortSessions.map((sess) => {
                      const statusBadge =
                        sess.status === 'REPLAY_READY'
                          ? {
                              label: 'Đã hoàn thành - Có bản ghi',
                              cls: 'bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]',
                            }
                          : sess.status === 'LIVE'
                          ? {
                              label: 'Đang dạy trực tuyến',
                              cls: 'bg-[#EF4444]/15 text-[#EF4444]',
                            }
                          : {
                              label: 'Sắp tới - Chưa có bản ghi',
                              cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                            };

                      return (
                        <div
                          key={sess.id}
                          className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] flex flex-col justify-between gap-4 transition-all"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-[#059669] dark:text-[#34D399]">
                                Buổi {sess.sessionOrder.toString().padStart(2, '0')} ·{' '}
                                {formatSessionDateTimeVi(sess.scheduledStart)}
                              </span>
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${statusBadge.cls}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>

                            <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                              {sess.title}
                            </h3>

                            <p className="text-xs text-[#475569] dark:text-[#94A3B8] line-clamp-2 leading-relaxed">
                              {formatCleanSummaryText(sess.aiSummaryMd)}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2 text-xs">
                            <span className="text-[#475569] dark:text-[#94A3B8]">
                              {sess.quizQuestions && sess.quizQuestions.length > 0 ? `${sess.quizQuestions.length} câu trắc nghiệm mở khóa` : 'Bài kiểm tra trắc nghiệm mở khóa'} · {sess.attachmentsCount} tài liệu
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleOpenSessionLevel3(sess.id)}
                              className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-bold cursor-pointer transition-colors"
                            >
                              Quản lý chi tiết Buổi {sess.sessionOrder} →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PHẦN 2 (CẤP 2): ĐỀ THI TỐT NGHIỆP CUỐI KHÓA CỦA LỚP (25 CÂU TRẮC NGHIỆM A, B, C, D) */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Award className="w-5 h-5 text-[#10B981]" />
                        <h2 className="text-lg font-bold">
                          2. Đề thi tốt nghiệp cuối khóa của lớp {selectedCohort.code} ({finalMcqList.length} câu trắc nghiệm A, B, C, D)
                        </h2>
                        <span
                          className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md ${
                            finalExamPublishStatus === 'PUBLISHED'
                              ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {finalExamPublishStatus === 'PUBLISHED'
                            ? 'Đã xuất bản (PUBLISHED)'
                            : 'Bản nháp (DRAFT)'}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                        Bộ đề thi tốt nghiệp áp dụng riêng cho học viên lớp {selectedCohort.name} (chấm điểm tự động 100% trắc nghiệm 4 đáp án).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAddFinalQForm((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#10B981] text-[#059669] dark:text-[#34D399] text-xs font-bold cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Thêm câu hỏi vào đề thi cuối khóa</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePublishFinalExam}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Duyệt &amp; Xuất bản đề (PUBLISHED)</span>
                      </button>
                    </div>
                  </div>

                  {finalExamSavedNotice && (
                    <div className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                      ✓ {finalExamSavedNotice}
                    </div>
                  )}

                  {showAddFinalQForm && (
                    <form
                      onSubmit={handleAddFinalExamQuestion}
                      className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] space-y-4"
                    >
                      <h3 className="text-sm font-bold">
                        Thêm câu hỏi trắc nghiệm mới vào Đề thi cuối khóa ({selectedCohort.code})
                      </h3>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Nội dung câu hỏi</label>
                        <textarea
                          rows={2}
                          required
                          value={newQPrompt}
                          onChange={(e) => setNewQPrompt(e.target.value)}
                          placeholder="Nhập câu hỏi lý thuyết hoặc tình huống thực tế..."
                          className="w-full p-3 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          value={newQOptA}
                          onChange={(e) => setNewQOptA(e.target.value)}
                          placeholder="Đáp án A"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                        <input
                          type="text"
                          required
                          value={newQOptB}
                          onChange={(e) => setNewQOptB(e.target.value)}
                          placeholder="Đáp án B"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                        <input
                          type="text"
                          value={newQOptC}
                          onChange={(e) => setNewQOptC(e.target.value)}
                          placeholder="Đáp án C"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                        <input
                          type="text"
                          value={newQOptD}
                          onChange={(e) => setNewQOptD(e.target.value)}
                          placeholder="Đáp án D"
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1">Đáp án đúng</label>
                          <select
                            value={newQCorrectIdx}
                            onChange={(e) => setNewQCorrectIdx(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-bold"
                          >
                            <option value={0}>Đáp án A</option>
                            <option value={1}>Đáp án B</option>
                            <option value={2}>Đáp án C</option>
                            <option value={3}>Đáp án D</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Kỹ năng đánh giá (thuộc khóa học)
                          </label>
                          <select
                            value={newQSkillCode || cohortCourseSkills[0]?.code || ''}
                            onChange={(e) => setNewQSkillCode(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold"
                          >
                            {cohortCourseSkills.length > 0 ? (
                              cohortCourseSkills.map((sk) => (
                                <option key={sk.id} value={sk.code}>
                                  {sk.name} ({sk.code})
                                </option>
                              ))
                            ) : (
                              <option value="">Kỹ năng mặc định của khóa học</option>
                            )}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold mb-1">
                            Giải thích đáp án đúng
                          </label>
                          <input
                            type="text"
                            value={newQExplanation}
                            onChange={(e) => setNewQExplanation(e.target.value)}
                            placeholder="Giải thích ngắn gọn vì sao phương án này đúng..."
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddFinalQForm(false)}
                          className="px-4 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[#10B981] text-white text-xs font-bold cursor-pointer"
                        >
                          Lưu câu hỏi vào đề thi
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    {(showAllFinalQuestions ? finalMcqList : finalMcqList.slice(0, 4)).map(
                      (q, idx) => (
                        <div
                          key={q.number}
                          className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                              Câu {idx + 1}/{finalMcqList.length}
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold">
                              Đáp án đúng: {['A', 'B', 'C', 'D'][q.correctIndex]}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold">{q.prompt}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {q.options.map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className={`p-2.5 rounded-lg border ${
                                  oIdx === q.correctIndex
                                    ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/60 border-[#10B981] font-semibold'
                                    : 'bg-white dark:bg-[#111A15] border-[#E2ECE7] dark:border-[#1E2D24]'
                                }`}
                              >
                                <span className="font-mono font-bold mr-1.5">
                                  {['A', 'B', 'C', 'D'][oIdx]}.
                                </span>
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllFinalQuestions((prev) => !prev)}
                    className="w-full py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold text-[#059669] dark:text-[#34D399] cursor-pointer"
                  >
                    {showAllFinalQuestions
                      ? 'Thu gọn danh sách câu hỏi đề thi cuối khóa'
                      : `Xem toàn bộ ${finalMcqList.length} câu trắc nghiệm đề thi cuối khóa →`}
                  </button>
                </div>

                {/* PHẦN 3 (CẤP 2): BẢNG TIẾN ĐỘ & ĐIỂM SỐ CỦA HỌC VIÊN TRONG LỚP */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">
                        3. Danh sách Học viên, Tiến độ &amp; Câu hỏi trong lớp ({selectedCohort.code})
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Theo dõi học viên mới đăng ký, tiến độ từng buổi học, điểm kiểm tra trung bình và các câu hỏi thảo luận.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStudentMgmtCohortFilter(String(selectedCohort.id));
                        setInstructorSidebarTab('STUDENT_MANAGEMENT');
                        navigate('/teach/students');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] text-[#059669] dark:text-[#34D399] text-xs font-bold cursor-pointer hover:bg-[#D1FAE5]/40"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Mở Quản lý học viên toàn diện →</span>
                    </button>
                  </div>

                  {cohortDetailEnrollments.length === 0 ? (
                    <div className="p-6 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#E2ECE7] dark:border-[#1E2D24] text-center space-y-1">
                      <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Chưa có học viên nào hoàn tất ghi danh vào lớp {selectedCohort.code}
                      </div>
                      <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Ngay khi học viên thanh toán học phí qua VietQR/SePay, hồ sơ học viên sẽ tự động đồng bộ vào danh sách này.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                            <th className="py-3 px-3 font-semibold">Học viên</th>
                            <th className="py-3 px-3 font-semibold">Mã đơn &amp; Ngày đăng ký</th>
                            <th className="py-3 px-3 font-semibold">Tiến độ buổi học</th>
                            <th className="py-3 px-3 font-semibold">Điểm trung bình</th>
                            <th className="py-3 px-3 font-semibold">Câu hỏi đã đặt</th>
                            <th className="py-3 px-3 font-semibold">Trạng thái</th>
                            <th className="py-3 px-3 font-semibold text-right">Hồ sơ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2ECE7] dark:divide-[#1E2D24]">
                          {cohortDetailEnrollments.map((enr) => {
                            const statusLabel =
                              enr.riskLevel === 'LOW' ? 'Đúng tiến độ' : 'Cần nhắc làm bài';
                            return (
                              <tr key={enr.id} className="hover:bg-[#F7FBF9]/60 dark:hover:bg-[#090F0C]/60">
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                      {enr.studentName}
                                    </span>
                                    {enr.isNewEnrollment && (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-mono text-[10px] font-bold">
                                        MỚI ĐĂNG KÝ
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                    {enr.studentEmail}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                    {enr.orderCode || 'Đã kích hoạt'}
                                  </div>
                                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                    {enr.enrolledAtFormatted || enr.lastActivityAt?.slice(0, 10)}
                                  </div>
                                </td>
                                <td className="py-3 px-3 font-mono font-semibold">
                                  {enr.completedSessionsCount}/{enr.totalSessionsCount} buổi
                                </td>
                                <td className="py-3 px-3 font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                  {(enr.avgScorePct / 10).toFixed(1)} / 10
                                </td>
                                <td className="py-3 px-3 font-mono font-semibold">
                                  {enr.questionsCount ?? 0} câu hỏi
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex px-2.5 py-1 rounded-md font-bold text-[11px] ${
                                      statusLabel === 'Đúng tiến độ'
                                        ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                        : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                                    }`}
                                  >
                                    {statusLabel}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStudentDetail(enr)}
                                    className="px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[#059669] dark:text-[#34D399] font-bold cursor-pointer"
                                  >
                                    Xem chi tiết →
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------
                CẤP 3: MÀN HÌNH CHI TIẾT RỘNG RÃI DÀNH RIÊNG CHO 1 BUỔI HỌC
               -------------------------------------------------------------- */}
            {cohortFlowLevel === 'LEVEL_3_SESSION_DETAIL' && (
              <div className="space-y-6">
                {/* Thanh điều hướng quay lại Cấp 2 + Chuyển nhanh giữa các buổi trong lớp */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setCohortFlowLevel('LEVEL_2_COHORT_DETAIL')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#10B981]" />
                    <span>Quay lại {selectedCohort.name}</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {displayCohortSessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleOpenSessionLevel3(s.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold cursor-pointer ${
                          s.id === activeSession.id
                            ? 'bg-[#10B981] text-white'
                            : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                        }`}
                      >
                        Buổi {s.sessionOrder}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thông tin cố định của Buổi học (Tên buổi học & Lịch học do Học viện thiết lập — Không cho sửa tên / đổi lịch) */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                        {selectedCohort.code} · Buổi {activeSession.sessionOrder}
                      </span>
                      <span className="text-xs font-mono text-[#475569] dark:text-[#94A3B8]">
                        Lịch học cố định: {formatSessionDateTimeVi(activeSession.scheduledStart)}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] px-2.5 py-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <Lock className="w-3.5 h-3.5 text-[#10B981]" />
                      Đề cương &amp; Lịch học chuẩn của Học viện
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold">
                    Buổi {activeSession.sessionOrder}: {activeSession.title}
                  </h1>
                </div>

                {/* KHỐI 1 (CẤP 3): KHU VỰC GIẢNG DẠY TRỰC TUYẾN / BẢN GHI BUỔI HỌC */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-[#10B981]" />
                      <h2 className="text-lg font-bold">
                        1. Khu vực Giảng dạy Trực tuyến &amp; Bản ghi Buổi học
                      </h2>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-lg ${
                        activeSession.status === 'REPLAY_READY'
                          ? 'bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]'
                          : activeSession.status === 'LIVE'
                          ? 'bg-[#EF4444]/15 text-[#EF4444]'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {activeSession.status === 'REPLAY_READY'
                        ? 'Đã kết thúc & Lưu bản ghi chính thức (Đã khóa trạng thái)'
                        : activeSession.status === 'LIVE'
                        ? 'Đang phát trực tuyến (19:30 - 21:30)'
                        : 'Buổi học sắp tới — Chưa diễn ra'}
                    </span>
                  </div>

                  {/* Trường hợp 1: Buổi học đang diễn ra (LIVE) */}
                  {activeSession.status === 'LIVE' && (
                    <div className="p-6 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border-2 border-[#10B981] space-y-4">
                      <div className="space-y-1">
                        <div className="text-xs font-mono font-bold text-[#EF4444]">
                          ● PHÒNG DẠY TRỰC TUYẾN ĐANG MỞ CHO HỌC VIÊN
                        </div>
                        <p className="text-sm font-bold">
                          Học viên có thể vào lớp ngay lúc này. Khi buổi dạy kết thúc, bấm Tắt Live để chốt bản ghi chính thức (sau khi kết thúc sẽ khóa trạng thái buổi học).
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/live/${activeSession.id}`)}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold shadow-xs cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Vào Phòng Dạy Trực Tuyến</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleStopLiveSession(activeSession.id)}
                          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
                        >
                          <span>Kết thúc buổi dạy &amp; Chốt bản ghi chính thức</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleCreateGuestLink}
                          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#111A15] hover:border-[#10B981] text-xs sm:text-sm font-bold cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-[#10B981]" />
                          <span>Tạo link mời Khách mời</span>
                        </button>
                      </div>

                      {guestLinkGenerated && (
                        <div className="p-3.5 rounded-xl bg-[#D1FAE5]/60 dark:bg-emerald-950/70 border border-[#10B981]/50 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <span className="font-mono break-all">{guestLinkGenerated}</span>
                          <button
                            type="button"
                            onClick={() => navigate('/live/guest')}
                            className="px-3 py-1.5 rounded-lg bg-[#10B981] text-white font-bold cursor-pointer"
                          >
                            Xem giao diện Khách mời →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trường hợp 2: Buổi học đã dạy xong (REPLAY_READY) -> Hiển thị Bản ghi chính thức & Khóa vĩnh viễn trạng thái */}
                  {activeSession.status === 'REPLAY_READY' && (
                    <div className="space-y-4">
                      <SessionVideoPlayer
                        src={
                          sessionVideoUrlById[activeSession.id] ||
                          (activeSession.videoR2Key?.startsWith('http') ||
                          activeSession.videoR2Key?.startsWith('/')
                            ? activeSession.videoR2Key
                            : '')
                        }
                        title={activeSession.title}
                        compact
                        emptyTitle="Bản ghi buổi học đã lưu trữ"
                        emptyDescription="Bản ghi chính thức của buổi học đã được khóa cố định (chưa gắn đường dẫn phát trực tiếp trên trình duyệt)."
                      />

                      <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-start justify-between gap-3 text-xs">
                        <div className="space-y-1 max-w-3xl">
                          <div className="inline-flex items-center gap-1.5 font-bold text-[#065F46] dark:text-[#34D399]">
                            <Lock className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                            <span>
                              Bản ghi buổi học đã hoàn tất và được khóa cố định (Không chuyển ngược về LIVE / SCHEDULED)
                            </span>
                          </div>
                          <p className="text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                            Buổi học đã kết thúc vào lịch trình{' '}
                            <strong>{formatSessionDateTimeVi(activeSession.scheduledStart)}</strong> và đã lưu video bản ghi chính thức cho học viên ôn tập. Nếu giảng viên cần giải thích thêm, đính chính hoặc đăng{' '}
                            <strong>Video hướng dẫn bổ sung</strong>, vui lòng thêm tại{' '}
                            <strong>Mục 2 (Tài liệu, Ghi chú &amp; Video hướng dẫn bổ sung)</strong> ngay bên dưới.
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-[11px] font-bold shrink-0">
                          Đã chốt bản ghi
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Trường hợp 3: Buổi học sắp tới chưa phát trực tuyến (SCHEDULED) */}
                  {activeSession.status === 'SCHEDULED' && (
                    <div className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-bold">
                            Buổi học chưa diễn ra ({formatSessionDateTimeVi(activeSession.scheduledStart)})
                          </div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            Khi đến giờ lên lớp, bấm nút bên phải để mở phòng học trực tuyến cho học viên tham gia.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleStartAndEnterLiveSession(activeSession.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Mở Phòng &amp; Bắt Đầu Dạy Trực Tuyến</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* KHỐI 2 (CẤP 3): TÀI LIỆU, GHI CHÚ & VIDEO HƯỚNG DẪN BỔ SUNG */}
                <form
                  onSubmit={handleSaveSessionSummaryAndMaterials}
                  className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-[#10B981]" />
                      <h2 className="text-lg font-bold">
                        2. Tài liệu, Ghi chú &amp; Video hướng dẫn bổ sung (Buổi {activeSession.sessionOrder})
                      </h2>
                    </div>
                    <span className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399] px-2.5 py-1 rounded-lg bg-[#D1FAE5]/60 dark:bg-emerald-950/60">
                      Cho phép bổ sung Slide, PDF, Source Code &amp; Video hướng dẫn sau buổi học
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Ghi chú tóm tắt kiến thức trọng tâm &amp; nội dung bổ sung sau buổi dạy
                    </label>
                    <textarea
                      rows={3}
                      value={editSessionSummary}
                      onChange={(e) => setEditSessionSummary(e.target.value)}
                      placeholder="Viết tóm tắt các ý chính, đính chính hoặc lưu ý thực hành bổ sung của buổi học này..."
                      className="w-full p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm leading-relaxed"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
                    <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Thêm học liệu hoặc Video hướng dẫn bổ sung cho Buổi {activeSession.sessionOrder}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold mb-1.5">
                          Tên tài liệu / Tiêu đề Video hướng dẫn bổ sung
                        </label>
                        <input
                          type="text"
                          value={newMatTitle}
                          onChange={(e) => setNewMatTitle(e.target.value)}
                          placeholder={
                            newMatType === 'VIDEO'
                              ? `VD: Video hướng dẫn bổ sung Buổi ${activeSession.sessionOrder} - Chữa bài tập thực hành.mp4`
                              : `VD: Slide bài giảng Buổi ${activeSession.sessionOrder}.pdf`
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">
                          Loại học liệu bổ sung
                        </label>
                        <select
                          value={newMatType}
                          onChange={(e) =>
                            setNewMatType(
                              e.target.value as
                                | 'VIDEO'
                                | 'SLIDE'
                                | 'PDF'
                                | 'REPO'
                                | 'NOTEBOOK'
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold"
                        >
                          <option value="VIDEO">Video hướng dẫn / Video bổ sung (MP4 / Link)</option>
                          <option value="SLIDE">Slide bài giảng PDF</option>
                          <option value="PDF">Tài liệu hướng dẫn / Bài tập PDF</option>
                          <option value="REPO">Source Code / GitHub Repo mẫu</option>
                          <option value="NOTEBOOK">Jupyter Notebook (.ipynb)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1.5">
                        Đường dẫn Video bổ sung (.mp4 / .m3u8) hoặc Link tải tài liệu (Tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={newMatUrl}
                        onChange={(e) => setNewMatUrl(e.target.value)}
                        placeholder={
                          newMatType === 'VIDEO'
                            ? 'VD: https://.../video-huong-dan-bo-sung.mp4'
                            : 'VD: https://.../tai-lieu-bo-sung.pdf (Để trống nếu tải lên kho lưu trữ mặc định)'
                        }
                        className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Danh sách tài liệu & video bổ sung hiện có của buổi học */}
                  {sessionMaterials.length > 0 && (
                    <div className="pt-2 space-y-3">
                      <div className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                        Tài liệu &amp; Video bổ sung đã đính kèm trong Buổi {activeSession.sessionOrder} ({sessionMaterials.length}):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sessionMaterials.map((m) => {
                          const isVideoMat =
                            m.fileType === 'VIDEO' ||
                            m.type === 'VIDEO' ||
                            m.title.toLowerCase().endsWith('.mp4') ||
                            m.title.toLowerCase().includes('video');
                          return (
                            <div
                              key={m.id}
                              className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isVideoMat ? (
                                  <Film className="w-4 h-4 text-[#10B981] shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-[#10B981] shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold truncate">{m.title}</div>
                                  <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                    {isVideoMat ? 'Video hướng dẫn bổ sung' : `Học liệu ${m.fileType}`} · {m.fileSize}
                                  </div>
                                </div>
                              </div>
                              {isVideoMat && m.downloadUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewSuppVideoUrl((prev) =>
                                      prev === m.downloadUrl ? null : m.downloadUrl
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold text-[11px] shrink-0 cursor-pointer"
                                >
                                  {previewSuppVideoUrl === m.downloadUrl ? 'Đóng video' : 'Xem video'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {previewSuppVideoUrl && (
                        <div className="pt-2 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#059669] dark:text-[#34D399]">
                              Trình phát Video hướng dẫn bổ sung:
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewSuppVideoUrl(null)}
                              className="text-xs font-semibold text-[#475569] hover:text-[#EF4444] cursor-pointer"
                            >
                              Đóng trình phát ✕
                            </button>
                          </div>
                          <SessionVideoPlayer
                            src={previewSuppVideoUrl}
                            title="Video hướng dẫn bổ sung"
                            compact
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {sessionSavedMsg && (
                    <div className="p-3 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                      ✓ {sessionSavedMsg}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu tóm tắt, Tài liệu &amp; Video bổ sung</span>
                    </button>
                  </div>
                </form>

                {/* KHỐI 3 (CẤP 3): BÀI KIỂM TRA CUỐI BUỔI HỌC (10 CÂU TRẮC NGHIỆM A, B, C, D CỦA RIÊNG BUỔI NÀY) */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-lg font-bold">
                          3. Bài kiểm tra cuối buổi học ({currentSessionQuestions.length} câu Trắc nghiệm A, B, C, D — Buổi {activeSession.sessionOrder})
                        </h2>
                        <span
                          className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md ${
                            currentSessionQuizStatus === 'PUBLISHED'
                              ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {currentSessionQuizStatus === 'PUBLISHED'
                            ? 'Đã xuất bản (PUBLISHED)'
                            : 'Bản nháp (DRAFT)'}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                        Khi AI mới tạo câu hỏi gợi ý, đề sẽ ở trạng thái <strong>Bản nháp (DRAFT)</strong>. Giảng viên rà soát và bấm <strong>Duyệt &amp; Xuất bản đề (PUBLISHED)</strong> để mở cho học viên làm bài.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleAutoSuggest5QuestionsForSession}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/90 hover:bg-[#10B981] hover:text-white text-[#065F46] dark:text-emerald-300 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Tạo bộ câu hỏi gợi ý từ nội dung buổi học này (DRAFT)</span>
                      </button>

                      <button
                        type="button"
                        onClick={openNewSessionQuestion}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#10B981] text-[#059669] dark:text-[#34D399] text-xs font-bold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm câu hỏi trắc nghiệm</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePublishSessionQuiz}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Duyệt &amp; Xuất bản đề (PUBLISHED)</span>
                      </button>
                    </div>
                  </div>

                  {quizNotice && (
                    <div className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                      ✓ {quizNotice}
                    </div>
                  )}

                  {/* Form Thêm hoặc Sửa câu hỏi trắc nghiệm A, B, C, D của buổi học */}
                  {showAddSessionQForm && (
                    <form
                      onSubmit={handleSaveSessionQuestionForm}
                      className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">
                          {editingQuestionIdx !== null
                            ? `Chỉnh sửa Câu hỏi số ${editingQuestionIdx + 1} (Buổi ${activeSession.sessionOrder})`
                            : `Thêm câu hỏi trắc nghiệm mới (Buổi ${activeSession.sessionOrder})`}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddSessionQForm(false);
                            setEditingQuestionIdx(null);
                          }}
                          className="text-xs font-semibold text-[#475569] cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1">Nội dung câu hỏi</label>
                        <textarea
                          rows={2}
                          required
                          value={newQPrompt}
                          onChange={(e) => setNewQPrompt(e.target.value)}
                          placeholder="Nhập câu hỏi lý thuyết hoặc tình huống thực hành trong buổi học..."
                          className="w-full p-3 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1">Đáp án A</label>
                          <input
                            type="text"
                            required
                            value={newQOptA}
                            onChange={(e) => setNewQOptA(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">Đáp án B</label>
                          <input
                            type="text"
                            required
                            value={newQOptB}
                            onChange={(e) => setNewQOptB(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">Đáp án C</label>
                          <input
                            type="text"
                            value={newQOptC}
                            onChange={(e) => setNewQOptC(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">Đáp án D</label>
                          <input
                            type="text"
                            value={newQOptD}
                            onChange={(e) => setNewQOptD(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Chọn 1 đáp án đúng
                          </label>
                          <select
                            value={newQCorrectIdx}
                            onChange={(e) => setNewQCorrectIdx(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-bold"
                          >
                            <option value={0}>Đáp án A là đáp án đúng</option>
                            <option value={1}>Đáp án B là đáp án đúng</option>
                            <option value={2}>Đáp án C là đáp án đúng</option>
                            <option value={3}>Đáp án D là đáp án đúng</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Kỹ năng đánh giá (thuộc khóa học)
                          </label>
                          <select
                            value={newQSkillCode || cohortCourseSkills[0]?.code || ''}
                            onChange={(e) => setNewQSkillCode(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold"
                          >
                            {cohortCourseSkills.length > 0 ? (
                              cohortCourseSkills.map((sk) => (
                                <option key={sk.id} value={sk.code}>
                                  {sk.name} ({sk.code})
                                </option>
                              ))
                            ) : (
                              <option value="">Kỹ năng mặc định của khóa học</option>
                            )}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold mb-1">
                            Giải thích đáp án đúng
                          </label>
                          <input
                            type="text"
                            value={newQExplanation}
                            onChange={(e) => setNewQExplanation(e.target.value)}
                            placeholder="Giải thích ngắn gọn để học viên hiểu rõ sau khi nộp bài..."
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddSessionQForm(false);
                            setEditingQuestionIdx(null);
                          }}
                          className="px-4 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[#10B981] text-white text-xs font-bold cursor-pointer"
                        >
                          Lưu câu hỏi
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Danh sách 5 câu hỏi trắc nghiệm của buổi học */}
                  <div className="space-y-3">
                    {currentSessionQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            Câu {idx + 1}/{currentSessionQuestions.length} · Trắc nghiệm 4 đáp án (A, B, C, D)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-bold">
                              Đáp án đúng: {['A', 'B', 'C', 'D'][q.correctIndex]}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditSessionQuestion(idx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3 text-[#10B981]" />
                              <span>Sửa câu hỏi</span>
                            </button>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {q.prompt}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = oIdx === q.correctIndex;
                            return (
                              <div
                                key={oIdx}
                                className={`p-2.5 rounded-lg border ${
                                  isCorrect
                                    ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/60 border-[#10B981] font-semibold text-[#065F46] dark:text-emerald-200'
                                    : 'bg-white dark:bg-[#111A15] border-[#E2ECE7] dark:border-[#1E2D24]'
                                }`}
                              >
                                <span className="font-mono font-bold mr-1.5">
                                  {['A', 'B', 'C', 'D'][oIdx]}.
                                </span>
                                <span>{opt}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] pt-1">
                          <strong>Giải thích:</strong> {q.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            3. HỎI ĐÁP HỌC VIÊN (/teach/discussions)
           ================================================================== */}
        {instructorSidebarTab === 'STUDENT_QA' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Hỏi đáp học viên theo từng lớp</h1>
                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                  Danh sách các câu hỏi thắc mắc của học viên gắn kèm mốc thời gian trong bài giảng để Giảng viên và Trợ giảng phản hồi, xác nhận.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQaCohortFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    qaCohortFilter === 'ALL'
                      ? 'bg-[#10B981] text-white'
                      : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                  }`}
                >
                  Tất cả các lớp
                </button>
                {effectiveCohorts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setQaCohortFilter(c.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      qaCohortFilter === c.id
                        ? 'bg-[#10B981] text-white'
                        : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              {filteredDiscussions.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#E2ECE7] dark:border-[#1E2D24] text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                  Chưa có câu hỏi thảo luận nào trong phạm vi lớp đang chọn.
                </div>
              ) : null}
              {filteredDiscussions.map((thread) => {
                const isVerified =
                  (thread.verifiedByStaff && !verifiedThreadIds.includes(`unverify:${thread.id}`)) ||
                  verifiedThreadIds.includes(thread.id);
                return (
                  <div
                    key={thread.id}
                    className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono font-bold">
                          Buổi {thread.sessionOrder} · Mốc video {thread.timestampLabel}
                        </span>
                        <span className="font-bold">{thread.authorName}</span>
                        <span className="text-[#475569] dark:text-[#94A3B8]">
                          · {thread.createdAt}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleVerifyThread(thread.id, isVerified)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-md font-bold cursor-pointer ${
                          isVerified
                            ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                            : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>
                          {isVerified
                            ? 'Đã xác nhận câu trả lời đúng'
                            : 'Xác nhận câu trả lời đúng'}
                        </span>
                      </button>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold">{thread.questionTitle}</h3>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                        {thread.questionBody}
                      </p>
                    </div>

                    {thread.replies.map((rep) => (
                      <div
                        key={rep.id}
                        className="p-3.5 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#059669] dark:text-[#34D399]">
                            {rep.authorName}
                          </span>
                          <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {rep.createdAt}
                          </span>
                        </div>
                        <p className="text-[#0F172A] dark:text-[#ECFDF5] leading-relaxed">
                          {rep.content}
                        </p>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={replyTexts[thread.id] ?? ''}
                        onChange={(e) =>
                          setReplyTexts((prev) => ({
                            ...prev,
                            [thread.id]: e.target.value,
                          }))
                        }
                        placeholder="Nhập câu trả lời hướng dẫn cho học viên..."
                        className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const txt = replyTexts[thread.id]?.trim();
                          if (!txt) return;
                          replyToDiscussionAsStaff(thread.id, txt);
                          setReplyTexts((prev) => ({ ...prev, [thread.id]: '' }));
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Trả lời &amp; Xác nhận</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================
            2B. QUẢN LÝ HỌC VIÊN TOÀN DIỆN (/teach/students)
           ================================================================== */}
        {instructorSidebarTab === 'STUDENT_MANAGEMENT' && (() => {
          const scopedEnrollments = enrollmentsState.filter((e) => {
            if (
              studentMgmtCohortFilter !== 'ALL' &&
              String(e.cohortId) !== String(studentMgmtCohortFilter)
            ) {
              return false;
            }
            if (studentMgmtStatusFilter === 'NEW' && !e.isNewEnrollment) {
              return false;
            }
            if (studentMgmtStatusFilter === 'ON_TRACK' && e.riskLevel !== 'LOW') {
              return false;
            }
            if (studentMgmtStatusFilter === 'BEHIND' && e.riskLevel === 'LOW') {
              return false;
            }
            if (studentMgmtSearch.trim()) {
              const q = studentMgmtSearch.trim().toLowerCase();
              const matched =
                e.studentName.toLowerCase().includes(q) ||
                e.studentEmail.toLowerCase().includes(q) ||
                (e.orderCode || '').toLowerCase().includes(q) ||
                e.cohortCode.toLowerCase().includes(q);
              if (!matched) return false;
            }
            return true;
          });

          const cohortScopedAll = enrollmentsState.filter(
            (e) =>
              studentMgmtCohortFilter === 'ALL' ||
              String(e.cohortId) === String(studentMgmtCohortFilter)
          );
          const newEnrollmentsCount = cohortScopedAll.filter((e) => e.isNewEnrollment).length;
          const onTrackCount = cohortScopedAll.filter((e) => e.riskLevel === 'LOW').length;
          const behindCount = cohortScopedAll.filter((e) => e.riskLevel !== 'LOW').length;
          const totalQuestionsAsked = cohortScopedAll.reduce(
            (sum, e) => sum + (e.questionsCount ?? 0),
            0
          );

          return (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      QUẢN LÝ HỌC VIÊN &amp; THEO DÕI GHI DANH THỜI GIAN THỰC
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">
                      Danh sách Học viên, Tiến độ học tập &amp; Lịch sử đặt câu hỏi
                    </h1>
                    <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                      Theo dõi học viên mới đăng ký qua cổng thanh toán, lớp đang theo học, tiến độ từng buổi (Buổi 1 ➔ Buổi 6), điểm kiểm tra và các câu hỏi học viên đã đặt.
                    </p>
                  </div>
                </div>

                {/* 5 Thẻ chỉ số tổng quan */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                      Tổng số học viên
                    </div>
                    <div className="text-xl font-bold font-mono text-[#0F172A] dark:text-white mt-0.5">
                      {cohortScopedAll.length} HV
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#D1FAE5]/40 dark:bg-[#065F46]/25 border border-[#10B981]/30">
                    <div className="text-[11px] font-semibold text-[#065F46] dark:text-[#34D399]">
                      Mới đăng ký (7 ngày)
                    </div>
                    <div className="text-xl font-bold font-mono text-[#10B981] mt-0.5">
                      {newEnrollmentsCount} HV
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                      Đúng tiến độ
                    </div>
                    <div className="text-xl font-bold font-mono text-[#059669] dark:text-[#34D399] mt-0.5">
                      {onTrackCount} HV
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                      Cần nhắc nhở / hỗ trợ
                    </div>
                    <div className="text-xl font-bold font-mono text-[#F59E0B] mt-0.5">
                      {behindCount} HV
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                    <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                      Tổng câu hỏi đã đặt
                    </div>
                    <div className="text-xl font-bold font-mono text-[#0F172A] dark:text-white mt-0.5">
                      {totalQuestionsAsked} câu
                    </div>
                  </div>
                </div>

                {/* Bộ lọc theo Lớp, Trạng thái & Tìm kiếm */}
                <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] mr-1">
                      Lớp học:
                    </span>
                    <button
                      type="button"
                      onClick={() => setStudentMgmtCohortFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        studentMgmtCohortFilter === 'ALL'
                          ? 'bg-[#10B981] text-white'
                          : 'bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]'
                      }`}
                    >
                      Tất cả các lớp ({enrollmentsState.length})
                    </button>
                    {effectiveCohorts.map((c) => {
                      const countInCohort = enrollmentsState.filter(
                        (e) => String(e.cohortId) === String(c.id)
                      ).length;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setStudentMgmtCohortFilter(String(c.id))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            String(studentMgmtCohortFilter) === String(c.id)
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]'
                          }`}
                        >
                          {c.code} ({countInCohort})
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#F7FBF9] dark:bg-[#090F0C] p-1 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24]">
                      {(
                        [
                          { id: 'ALL', label: 'Tất cả' },
                          { id: 'NEW', label: 'Mới đăng ký' },
                          { id: 'ON_TRACK', label: 'Đúng tiến độ' },
                          { id: 'BEHIND', label: 'Cần hỗ trợ' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStudentMgmtStatusFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            studentMgmtStatusFilter === tab.id
                              ? 'bg-[#10B981] text-white'
                              : 'text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-[230px]">
                      <Search className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={studentMgmtSearch}
                        onChange={(e) => setStudentMgmtSearch(e.target.value)}
                        placeholder="Tìm tên, email, mã đơn..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {remindToast && (
                <div className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                  ✓ {remindToast}
                </div>
              )}

              {/* Bảng danh sách học viên chi tiết */}
              <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                {scopedEnrollments.length === 0 ? (
                  <div className="p-8 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#E2ECE7] dark:border-[#1E2D24] text-center space-y-1.5">
                    <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Không tìm thấy học viên nào khớp bộ lọc hiện tại
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Khi học viên hoàn tất thanh toán học phí qua VietQR / SePay, hồ sơ ghi danh và tiến độ học tập sẽ hiển thị ngay tại đây.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                          <th className="py-3 px-3 font-semibold">Học viên &amp; Liên hệ</th>
                          <th className="py-3 px-3 font-semibold">Lớp học &amp; Mã đơn học phí</th>
                          <th className="py-3 px-3 font-semibold">Thời gian đăng ký</th>
                          <th className="py-3 px-3 font-semibold">Tiến độ từng buổi</th>
                          <th className="py-3 px-3 font-semibold">Điểm TB</th>
                          <th className="py-3 px-3 font-semibold">Câu hỏi đã đặt</th>
                          <th className="py-3 px-3 font-semibold">Trạng thái</th>
                          <th className="py-3 px-3 font-semibold text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2ECE7] dark:divide-[#1E2D24]">
                        {scopedEnrollments.map((enr) => {
                          const isReminded = Boolean(remindedEnrollmentIds[enr.id]);
                          const progList = enr.sessionProgressList || [];
                          return (
                            <tr
                              key={enr.id}
                              className="hover:bg-[#F7FBF9]/70 dark:hover:bg-[#090F0C]/70 transition-colors"
                            >
                              <td className="py-3.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  <AvatarWithFallback
                                    name={enr.studentName}
                                    className="w-9 h-9 rounded-full shrink-0"
                                  />
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                        {enr.studentName}
                                      </span>
                                      {enr.isNewEnrollment && (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-mono text-[10px] font-bold">
                                          MỚI ĐĂNG KÝ
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                      {enr.studentEmail}
                                      {enr.phone ? ` · ${enr.phone}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-3">
                                <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                  {enr.cohortCode}
                                </div>
                                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate max-w-[200px]">
                                  {enr.orderCode
                                    ? `Mã đơn: ${enr.orderCode}`
                                    : enr.cohortName || 'Ghi danh chính thức'}
                                </div>
                              </td>

                              <td className="py-3.5 px-3">
                                <div className="font-mono font-semibold text-[#0F172A] dark:text-white">
                                  {enr.enrolledAtFormatted || enr.lastActivityAt?.slice(0, 10)}
                                </div>
                                <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                  Hoạt động: {enr.lastActivityAt?.slice(0, 10)}
                                </div>
                              </td>

                              <td className="py-3.5 px-3">
                                <div className="font-mono font-bold">
                                  {enr.completedSessionsCount}/{enr.totalSessionsCount} buổi (
                                  {enr.progressPercent ??
                                    Math.round(
                                      (enr.completedSessionsCount /
                                        Math.max(1, enr.totalSessionsCount)) *
                                        100
                                    )}
                                  %)
                                </div>
                                {progList.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    {progList.map((sp) => (
                                      <span
                                        key={sp.sessionId}
                                        title={`Buổi ${sp.sessionOrder}: ${sp.title} — ${
                                          sp.isCompleted
                                            ? 'Đã hoàn thành'
                                            : sp.isWatched
                                              ? 'Đã xem video'
                                              : 'Chưa học'
                                        }`}
                                        className={`w-5 h-4 rounded text-[9px] font-mono font-bold inline-flex items-center justify-center ${
                                          sp.isCompleted
                                            ? 'bg-[#10B981] text-white'
                                            : sp.isWatched
                                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                              : 'bg-[#E2ECE7] dark:bg-[#1E2D24] text-[#475569] dark:text-[#94A3B8]'
                                        }`}
                                      >
                                        B{sp.sessionOrder}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td className="py-3.5 px-3 font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                <div>{(enr.avgScorePct / 10).toFixed(1)} / 10</div>
                                <div className="text-[10px] font-normal text-[#475569] dark:text-[#94A3B8]">
                                  Thiếu {enr.missingQuizzesCount} bài quiz
                                </div>
                              </td>

                              <td className="py-3.5 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono font-bold text-[11px] ${
                                    (enr.questionsCount ?? 0) > 0
                                      ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                      : 'bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8]'
                                  }`}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>{enr.questionsCount ?? 0} câu hỏi</span>
                                </span>
                              </td>

                              <td className="py-3.5 px-3">
                                <span
                                  className={`inline-flex px-2.5 py-1 rounded-md font-bold text-[11px] ${
                                    enr.riskLevel === 'LOW'
                                      ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                      : enr.riskLevel === 'MEDIUM'
                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                        : 'bg-[#EF4444]/15 text-[#EF4444]'
                                  }`}
                                >
                                  {enr.riskLevel === 'LOW'
                                    ? 'Đúng tiến độ'
                                    : enr.riskLevel === 'MEDIUM'
                                      ? 'Cần lưu ý'
                                      : 'Cần hỗ trợ sớm'}
                                </span>
                              </td>

                              <td className="py-3.5 px-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStudentDetail(enr)}
                                    className="px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-bold cursor-pointer"
                                  >
                                    Xem hồ sơ &amp; Tiến độ
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isReminded}
                                    onClick={() => handleRemindStudent(enr.id, enr.studentName)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    {isReminded ? 'Đã nhắc' : 'Nhắc học'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ==================================================================
            3. THỐNG KÊ LỚP HỌC (/teach/analytics) — TÁCH RIÊNG 4 BIỂU ĐỒ CHUYÊN SÂU
           ================================================================== */}
        {instructorSidebarTab === 'CLASS_ANALYTICS' && (() => {
          const currentAnalyticsCohort =
            effectiveCohorts.find((c) => String(c.id) === String(analyticsCohortId)) ??
            effectiveCohorts[0] ??
            selectedCohort;

          // 1. Lấy dữ liệu enrollments theo lớp và nhóm riskLevel (LOW / MEDIUM / HIGH)
          const cohortEnrollments = enrollmentsState.filter(
            (e) => String(e.cohortId) === String(currentAnalyticsCohort.id)
          );
          const effectiveEnrollments = cohortEnrollments;
          const highRiskEnrollments = effectiveEnrollments.filter(
            (e) => e.riskLevel === 'HIGH'
          );
          const lowRiskCount = effectiveEnrollments.filter((e) => e.riskLevel === 'LOW').length;
          const mediumRiskCount = effectiveEnrollments.filter(
            (e) => e.riskLevel === 'MEDIUM'
          ).length;
          const highRiskCount = highRiskEnrollments.length;

          const analyticsSessions = allInstructorSessions
            .filter((s) => String(s.cohortId) === String(currentAnalyticsCohort.id))
            .sort((a, b) => a.sessionOrder - b.sessionOrder);
          const effectiveAnalyticsSessions =
            analyticsSessions.length > 0 ? analyticsSessions : displayCohortSessions;

          const sessionStackedProgress = effectiveAnalyticsSessions.map((sess) => ({
            label: `Buổi ${sess.sessionOrder}`,
            subLabel: `Buổi ${sess.sessionOrder}`,
            subtitle: `Buổi ${sess.sessionOrder}: ${sess.title}`,
            values: {
              lowRisk: effectiveEnrollments.filter(
                (e) => e.completedSessionsCount >= sess.sessionOrder && e.riskLevel === 'LOW'
              ).length,
              mediumRisk: effectiveEnrollments.filter(
                (e) => e.completedSessionsCount >= sess.sessionOrder && e.riskLevel === 'MEDIUM'
              ).length,
              highRisk: effectiveEnrollments.filter(
                (e) => e.completedSessionsCount >= sess.sessionOrder && e.riskLevel === 'HIGH'
              ).length,
            },
          }));

          // 2. Phổ điểm số & Hiệu quả khóa học tính từ enrollmentsState
          const totalEnr = Math.max(1, effectiveEnrollments.length);
          const below50Count = effectiveEnrollments.filter((e) => e.avgScorePct < 50).length;
          const b50to69Count = effectiveEnrollments.filter(
            (e) => e.avgScorePct >= 50 && e.avgScorePct < 70
          ).length;
          const b70to84Count = effectiveEnrollments.filter(
            (e) => e.avgScorePct >= 70 && e.avgScorePct < 85
          ).length;
          const above85Count = effectiveEnrollments.filter((e) => e.avgScorePct >= 85).length;
          const avgClassScore =
            effectiveEnrollments.length > 0
              ? (
                  effectiveEnrollments.reduce((sum, e) => sum + e.avgScorePct, 0) /
                  effectiveEnrollments.length
                ).toFixed(1)
              : '0.0';
          const eligibleCount = effectiveEnrollments.filter((e) => e.avgScorePct >= 70).length;
          const passRatePct =
            effectiveEnrollments.length > 0
              ? Math.round((eligibleCount / effectiveEnrollments.length) * 100)
              : 0;

          const scoreBuckets = [
            {
              rangeLabel: '< 50',
              bandTitle: 'Chưa đạt chuẩn',
              studentCount: below50Count,
              percentage:
                effectiveEnrollments.length > 0
                  ? Math.round((below50Count / totalEnr) * 100)
                  : 0,
              color: '#EF4444',
              sampleNote: 'Cần học viên xem lại video bài giảng và làm lại bài kiểm tra mở khóa.',
            },
            {
              rangeLabel: '50 - 69',
              bandTitle: 'Cần củng cố thêm',
              studentCount: b50to69Count,
              percentage:
                effectiveEnrollments.length > 0
                  ? Math.round((b50to69Count / totalEnr) * 100)
                  : 0,
              color: '#F59E0B',
              sampleNote: 'Đã nắm lý thuyết cơ bản nhưng còn nhầm câu hỏi tình huống thực tế.',
            },
            {
              rangeLabel: '70 - 84',
              bandTitle: 'Đạt chuẩn tốt',
              studentCount: b70to84Count,
              percentage:
                effectiveEnrollments.length > 0
                  ? Math.round((b70to84Count / totalEnr) * 100)
                  : 0,
              color: '#10B981',
              sampleNote: 'Nắm vững kiến thức trọng tâm và vượt mốc mở khóa buổi tiếp theo.',
            },
            {
              rangeLabel: '85 - 100',
              bandTitle: 'Xuất sắc',
              studentCount: above85Count,
              percentage:
                effectiveEnrollments.length > 0
                  ? Math.round((above85Count / totalEnr) * 100)
                  : 0,
              color: 'emerald-gradient',
              sampleNote: 'Hoàn thành xuất sắc cả câu hỏi kiến trúc hệ thống và tối ưu hiệu năng.',
            },
          ];

          // 3. Gom nhóm 100% từ dữ liệu thật của lớp đang chọn (discussion_threads + chat_messages + điểm kiểm tra từng buổi)
          const cohortDiscussions = discussions.filter(
            (d) => String(d.cohortId) === String(currentAnalyticsCohort.id)
          );
          const cohortStudentChatMsgs = chatMessagesState.filter(
            (m) =>
              String(m.cohortId) === String(currentAnalyticsCohort.id) &&
              m.senderRole === 'STUDENT'
          );

          const topicBottlenecks = effectiveAnalyticsSessions
            .map((sess) => {
              const sessDiscCount = cohortDiscussions.filter(
                (d) =>
                  (d.sessionId && String(d.sessionId) === String(sess.id)) ||
                  d.sessionOrder === sess.sessionOrder
              ).length;
              const sessAiCount = cohortStudentChatMsgs.filter(
                (m) => String(m.sessionId) === String(sess.id)
              ).length;

              const quizScoresForSess = effectiveEnrollments
                .map(
                  (e) =>
                    e.sessionProgressList?.find(
                      (sp) =>
                        String(sp.sessionId) === String(sess.id) ||
                        sp.sessionOrder === sess.sessionOrder
                    )?.quizScorePct ?? null
                )
                .filter((sc): sc is number => sc !== null);

              const avgQuizScore =
                quizScoresForSess.length > 0
                  ? quizScoresForSess.reduce((s, v) => s + v, 0) / quizScoresForSess.length
                  : null;
              const wrongRatePct =
                avgQuizScore !== null ? Math.max(0, Math.round(100 - avgQuizScore)) : 0;

              return {
                skillCode: `${currentAnalyticsCohort.code}-S0${sess.sessionOrder}`,
                topicName: sess.title,
                sessionLabel: `Buổi ${sess.sessionOrder}`,
                wrongAnswerRatePct: wrongRatePct,
                discussionQuestionsCount: sessDiscCount,
                aiTutorQueriesCount: sessAiCount,
                recommendationNote:
                  sessDiscCount + sessAiCount > 0
                    ? `Có ${sessDiscCount} thảo luận và ${sessAiCount} câu hỏi AI tại Buổi ${sess.sessionOrder}. Giảng viên nên giải đáp thêm hoặc đính kèm Video hướng dẫn bổ sung.`
                    : `Học viên đã làm bài kiểm tra Buổi ${sess.sessionOrder} với tỷ lệ sai trung bình ${wrongRatePct}%.`,
              };
            })
            .filter(
              (item) =>
                item.discussionQuestionsCount > 0 ||
                item.aiTutorQueriesCount > 0 ||
                item.wrongAnswerRatePct > 0
            )
            .sort(
              (a, b) =>
                b.discussionQuestionsCount +
                b.aiTutorQueriesCount +
                b.wrongAnswerRatePct -
                (a.discussionQuestionsCount + a.aiTutorQueriesCount + a.wrongAnswerRatePct)
            );

          // 4. Tính toán trực tiếp từ bảng notifications (type === 'AI_STUDY_REMINDER') của lớp đang chọn
          const aiReminders = notificationsState.filter(
            (n) =>
              n.type === 'AI_STUDY_REMINDER' &&
              (!n.cohortId || String(n.cohortId) === String(currentAnalyticsCohort.id))
          );
          const totalSentCount = aiReminders.length;
          const totalReadCount = aiReminders.filter((n) => n.isRead).length;
          const totalActedCount = aiReminders.filter((n) => n.actedAt !== null).length;
          const readOnlyNotActedCount = Math.max(0, totalReadCount - totalActedCount);
          const unreadCount = Math.max(0, totalSentCount - totalReadCount);

          const readRatePct =
            totalSentCount > 0 ? Math.round((totalReadCount / totalSentCount) * 100) : 0;
          const actedRatePct =
            totalSentCount > 0 ? Math.round((totalActedCount / totalSentCount) * 100) : 0;

          const reminderEffectivenessSegments = [
            {
              label: 'Đã vào học tiếp',
              value: totalActedCount,
              countText: `${totalActedCount}/${totalSentCount} lượt (${actedRatePct}%)`,
              color: '#10B981',
              description:
                'Học viên đã mở thông báo, xem lại bài giảng và hoàn thành bài tập.',
            },
            {
              label: 'Đã xem thông báo',
              value: readOnlyNotActedCount,
              countText: `${readOnlyNotActedCount}/${totalSentCount} lượt`,
              color: '#0EA5E9',
              description:
                'Học viên đã xem thông báo nhưng chưa hoàn thành bài tập mở khóa.',
            },
            {
              label: 'Chưa mở thông báo',
              value: unreadCount,
              countText: `${unreadCount}/${totalSentCount} lượt`,
              color: '#F59E0B',
              description:
                'Thông báo vừa được gửi hoặc học viên chưa mở ứng dụng.',
            },
          ];

          const handleSendAiReminderToHighRisk = async (enr: Enrollment) => {
            const res = await teachApi.sendAiPersonalizedReminder(enr.id);
            setRemindedEnrollmentIds((prev) => ({ ...prev, [enr.id]: true }));
            setNotificationsState((prev) => [
              {
                id: res.notificationId,
                userId: enr.userId,
                studentName: enr.studentName,
                cohortId: enr.cohortId,
                cohortCode: enr.cohortCode,
                type: 'AI_STUDY_REMINDER',
                title: res.title,
                message: `Lộ trình ôn tập 15 phút dành cho ${enr.studentName}: Còn thiếu ${enr.missingQuizzesCount} bài kiểm tra ngắn.`,
                isRead: false,
                sentAt: res.createdAt,
                readAt: null,
                actedAt: null,
              },
              ...prev,
            ]);
            setAnalyticsReminderToast(
              `Đã gửi lời nhắc ôn tập cho học viên ${enr.studentName}.`
            );
            setTimeout(() => setAnalyticsReminderToast(null), 4500);
          };

          return (
            <div className="flex flex-col gap-6 w-full min-w-0">
              {/* Header của Thống kê lớp học */}
              <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col gap-4 w-full">
                <div className="w-full flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      PHÂN TÍCH CHUYÊN SÂU DÀNH CHO GIẢNG VIÊN (DỮ LIỆU THỰC TẾ TỪ HỆ THỐNG)
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">
                      Thống kê lớp học &amp; Chất lượng tiếp thu bài giảng
                    </h1>
                    <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                      Theo dõi tiến độ hoàn thành bài học, mức độ chuyên cần của học viên, phổ điểm kiểm tra và các chủ đề thảo luận thực tế trong lớp.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentMgmtCohortFilter(String(currentAnalyticsCohort.id));
                      setInstructorSidebarTab('STUDENT_MANAGEMENT');
                      navigate('/teach/students');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] text-[#059669] dark:text-[#34D399] text-xs font-bold cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Xem danh sách {effectiveEnrollments.length} học viên lớp này →</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                  <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] mr-1">
                    Chọn lớp phụ trách:
                  </span>
                  {effectiveCohorts.map((cohort) => {
                    const active = cohort.id === currentAnalyticsCohort.id;
                    return (
                      <button
                        key={cohort.id}
                        type="button"
                        onClick={() => setAnalyticsCohortId(cohort.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-[#10B981] text-white shadow-xs'
                            : 'bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        {cohort.code} · {cohort.name.split('—')[0].trim()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {analyticsReminderToast && (
                <div className="p-4 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 border border-[#10B981]/30 text-[#065F46] dark:text-[#34D399] text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10B981]" />
                  <span>{analyticsReminderToast}</span>
                </div>
              )}

              {/* Lưới biểu đồ 2 cột */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                {/* Biểu đồ 1: Tiến độ học tập & Mức độ chuyên cần */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5 min-w-0">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          1. TIẾN ĐỘ HỌC TẬP &amp; MỨC ĐỘ CHUYÊN CẦN ({currentAnalyticsCohort.code})
                        </span>
                        <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                          Tổng: {effectiveEnrollments.length} HV · Đúng hạn: {lowRiskCount} · Cần lưu ý: {mediumRiskCount} · Cần hỗ trợ: {highRiskCount}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold">
                        Tiến độ học tập &amp; Mức độ cần hỗ trợ
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Thống kê tỷ lệ hoàn thành các buổi học và phân loại mức độ chuyên cần thực tế của học viên trong lớp.
                      </p>
                    </div>

                    <StackedBarChart
                      data={sessionStackedProgress}
                      unit="HV"
                      segments={[
                        {
                          key: 'lowRisk',
                          label: 'Đúng hạn',
                          color: '#10B981',
                        },
                        {
                          key: 'mediumRisk',
                          label: 'Cần lưu ý',
                          color: '#F59E0B',
                        },
                        {
                          key: 'highRisk',
                          label: 'Cần hỗ trợ sớm',
                          color: '#EF4444',
                        },
                      ]}
                    />
                  </div>

                  {/* Danh sách học viên cần hỗ trợ */}
                  <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#EF4444] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Danh sách học viên cần hỗ trợ thêm: {highRiskEnrollments.length} học viên
                        </span>
                      </span>
                      <span className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                        Ưu tiên đồng hành
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {highRiskEnrollments.map((enr) => {
                        const isReminded = Boolean(remindedEnrollmentIds[enr.id]);
                        return (
                          <div
                            key={enr.id}
                            className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold">{enr.studentName}</span>
                                <span className="px-2 py-0.5 rounded bg-[#EF4444]/15 text-[#EF4444] text-[11px] font-bold">
                                  Cần hỗ trợ ({Math.round(enr.dropoutRiskScore * 100)}%)
                                </span>
                                <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                  Tiến độ: {enr.completedSessionsCount}/{enr.totalSessionsCount} buổi
                                </span>
                              </div>
                              <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                Còn thiếu {enr.missingQuizzesCount} bài kiểm tra · Điểm TB: {enr.avgScorePct}% · Hoạt động gần nhất: {enr.lastActivityAt.slice(0, 10)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentDetail(enr)}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold cursor-pointer"
                              >
                                Chi tiết
                              </button>
                              <button
                                type="button"
                                disabled={isReminded}
                                onClick={() => handleSendAiReminderToHighRisk(enr)}
                                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                  isReminded
                                    ? 'bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]'
                                    : 'bg-[#10B981] hover:bg-[#059669] text-white shadow-xs'
                                }`}
                              >
                                {isReminded ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Đã gửi lời nhắc</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                    <span>Gửi lời nhắc ôn tập</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Biểu đồ 2: Phổ điểm số & Hiệu quả khóa học */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5 min-w-0">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          2. PHỔ ĐIỂM SỐ &amp; HIỆU QUẢ KHÓA HỌC
                        </span>
                        <span className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399]">
                          {effectiveEnrollments.length > 0
                            ? `${passRatePct}% đạt từ 70 điểm trở lên`
                            : 'Chưa có dữ liệu điểm kiểm tra'}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold">
                        Phổ điểm các bài kiểm tra
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Thống kê kết quả các bài kiểm tra trắc nghiệm và tỷ lệ đạt chuẩn qua từng buổi học.
                      </p>
                    </div>

                    <ScoreHistogramChart buckets={scoreBuckets} />
                  </div>

                  <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Điểm TB toàn lớp
                      </div>
                      <div className="text-base font-bold font-mono text-[#10B981] mt-0.5">
                        {avgClassScore} / 100
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Tỷ lệ đạt chuẩn
                      </div>
                      <div className="text-base font-bold font-mono text-[#0F172A] dark:text-white mt-0.5">
                        {passRatePct}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Đủ điều kiện thi
                      </div>
                      <div className="text-base font-bold font-mono text-[#059669] dark:text-[#34D399] mt-0.5">
                        {eligibleCount} / {effectiveEnrollments.length} HV
                      </div>
                    </div>
                  </div>
                </div>

                {/* Biểu đồ 3: Chủ đề kỹ thuật học viên hỏi nhiều nhất (100% Dữ liệu thật) */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4 min-w-0">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        3. CÁC CHỦ ĐỀ HỌC VIÊN HỎI NHIỀU NHẤT ({currentAnalyticsCohort.code})
                      </span>
                      <span className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399]">
                        {cohortDiscussions.length} thảo luận · {cohortStudentChatMsgs.length} câu hỏi AI
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold">
                      Các chủ đề kỹ thuật được thảo luận thực tế trong lớp
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Tổng hợp trực tiếp từ các câu hỏi thảo luận, lượt hỏi Trợ giảng AI và kết quả bài kiểm tra của học viên trong lớp {currentAnalyticsCohort.code}.
                    </p>
                  </div>

                  <HorizontalTopicBarChart items={topicBottlenecks} />
                </div>

                {/* Biểu đồ 4: Hiệu quả các Lời nhắc học tập */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-5 min-w-0">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        4. HIỆU QUẢ LỜI NHẮC ÔN TẬP
                      </span>
                      <span className="text-[11px] font-semibold text-[#10B981]">
                        Tỷ lệ quay lại học: {actedRatePct}%
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold">
                      Hiệu quả lời nhắc: Đã gửi ➔ Đã xem ➔ Tiếp tục học
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Thống kê mức độ tương tác của học viên khi nhận thông báo nhắc lịch học và ôn tập kiến thức.
                    </p>
                  </div>

                  {/* Phễu 3 bước trực quan */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[10px] font-semibold uppercase text-[#475569] dark:text-[#94A3B8]">
                        1. Đã gửi lời nhắc
                      </div>
                      <div className="text-lg font-bold font-mono text-[#0F172A] dark:text-white mt-0.5">
                        {totalSentCount} lượt
                      </div>
                      <div className="text-[11px] text-[#059669] dark:text-[#34D399] font-semibold">
                        100% thông báo
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[10px] font-semibold uppercase text-[#475569] dark:text-[#94A3B8]">
                        2. Đã xem thông báo
                      </div>
                      <div className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400 mt-0.5">
                        {totalReadCount} HV
                      </div>
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                        Đạt {readRatePct}%
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#D1FAE5]/40 dark:bg-[#065F46]/25 border border-[#10B981]/30">
                      <div className="text-[10px] font-semibold uppercase text-[#065F46] dark:text-[#34D399]">
                        3. Đã vào học tiếp
                      </div>
                      <div className="text-lg font-bold font-mono text-[#10B981] mt-0.5">
                        {totalActedCount} HV
                      </div>
                      <div className="text-[11px] text-[#059669] dark:text-[#34D399] font-bold">
                        Chuyển đổi {actedRatePct}%
                      </div>
                    </div>
                  </div>

                  <DonutGaugeChart
                    segments={reminderEffectivenessSegments}
                    centerLabel="Quay lại học"
                    centerValue={`${actedRatePct}%`}
                    centerSubtext={`${totalActedCount}/${totalSentCount} lượt`}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* ==================================================================
            4. XEM LẠI CA THI CUỐI KHÓA (/teach/schedule)
           ================================================================== */}
        {(instructorSidebarTab === 'AVAILABILITY' ||
          instructorSidebarTab === 'AI_GRADING') && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">
                Xem lại ca thi cuối khóa (Có cảnh báo từ Camera giám sát)
              </h1>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                Kiểm tra ảnh chụp tự động của các bài thi tốt nghiệp cuối khóa có cảnh báo từ Camera giám sát để quyết định công nhận kết quả hoặc yêu cầu thi lại.
              </p>
            </div>

            {/* Duyệt các bài thi cuối khóa có cảnh báo từ Camera giám sát */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">
                    Danh sách ca thi cuối khóa cần Giảng viên kiểm tra ({examReviews.length} ca thi)
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Xem lại ảnh chụp tại thời điểm hệ thống phát hiện học viên rời khỏi khung hình hoặc có người lạ xuất hiện trong phòng thi.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-[#F59E0B]/15 text-[#F59E0B] font-mono text-xs font-bold">
                  {examReviews.filter((r) => r.decision === 'PENDING').length} ca thi chờ duyệt
                </span>
              </div>

              {examReviews.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#E2ECE7] dark:border-[#1E2D24] text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                  Hiện không có ca thi cuối khóa nào có cảnh báo bất thường từ Camera giám sát.
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {examReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-3.5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{rev.studentName}</span>
                          <span className="px-2 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            {rev.cohortCode}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#10B981]">
                          Điểm trắc nghiệm: {rev.mcqScore}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
                        <div className="flex items-center justify-between text-[11px] text-amber-300 font-mono">
                          <span className="inline-flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5" />
                            Ảnh chụp tự động từ Camera giám sát
                          </span>
                          <span>{rev.cameraTimestamp}</span>
                        </div>
                        <div className="text-xs font-semibold text-white">
                          Lý do cảnh báo: {rev.cameraFlagReason}
                        </div>
                        <div className="text-[11px] text-slate-300">{rev.snapshotNote}</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-2">
                      {rev.decision === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
                          <UserCheck className="w-4 h-4 text-[#10B981]" />
                          <span>Đã công nhận kết quả thi</span>
                        </span>
                      ) : rev.decision === 'RETAKE_REQUIRED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EF4444]/15 text-[#EF4444] text-xs font-bold">
                          <RotateCcw className="w-4 h-4" />
                          <span>Đã yêu cầu học viên thi lại</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 w-full">
                          <button
                            type="button"
                            onClick={() => handleExamDecision(rev.id, 'APPROVED')}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Công nhận kết quả</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExamDecision(rev.id, 'RETAKE_REQUIRED')}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] text-xs font-bold cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Yêu cầu thi lại</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODAL CHI TIẾT HỒ SƠ, TIẾN ĐỘ TỪNG BUỔI & CÂU HỎI CỦA HỌC VIÊN
           ================================================================== */}
        {selectedStudentDetail && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                <div className="flex items-center gap-3.5">
                  <AvatarWithFallback
                    name={selectedStudentDetail.studentName}
                    className="w-12 h-12 rounded-full shrink-0"
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {selectedStudentDetail.studentName}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 font-mono text-xs font-bold">
                        {selectedStudentDetail.cohortCode}
                      </span>
                      {selectedStudentDetail.isNewEnrollment && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-mono text-[10px] font-bold">
                          MỚI ĐĂNG KÝ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Email: <strong>{selectedStudentDetail.studentEmail}</strong>
                      {selectedStudentDetail.phone ? ` · SĐT: ${selectedStudentDetail.phone}` : ''}
                      {selectedStudentDetail.orderCode
                        ? ` · Mã đơn học phí: ${selectedStudentDetail.orderCode}`
                        : ''}
                      {selectedStudentDetail.enrolledAtFormatted
                        ? ` · Ngày đăng ký: ${selectedStudentDetail.enrolledAtFormatted}`
                        : ''}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStudentDetail(null)}
                  className="p-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#EF4444] text-[#475569] hover:text-[#EF4444] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tóm tắt nhanh chỉ số học viên */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div className="text-[#475569] dark:text-[#94A3B8]">Lớp theo học</div>
                  <div className="font-bold text-sm mt-0.5 truncate">
                    {selectedStudentDetail.cohortName || selectedStudentDetail.cohortCode}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div className="text-[#475569] dark:text-[#94A3B8]">Tiến độ hoàn thành</div>
                  <div className="font-mono font-bold text-sm text-[#10B981] mt-0.5">
                    {selectedStudentDetail.completedSessionsCount}/
                    {selectedStudentDetail.totalSessionsCount} buổi
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div className="text-[#475569] dark:text-[#94A3B8]">Điểm trung bình Quiz</div>
                  <div className="font-mono font-bold text-sm text-[#059669] dark:text-[#34D399] mt-0.5">
                    {(selectedStudentDetail.avgScorePct / 10).toFixed(1)} / 10 (
                    {selectedStudentDetail.avgScorePct}%)
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div className="text-[#475569] dark:text-[#94A3B8]">Câu hỏi đã đặt</div>
                  <div className="font-mono font-bold text-sm mt-0.5">
                    {selectedStudentDetail.questionsCount ?? 0} câu hỏi
                  </div>
                </div>
              </div>

              {/* A. Tiến độ từng buổi học của học viên */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#10B981]" />
                  <span>
                    1. Tiến độ học tập &amp; Điểm kiểm tra từng buổi ({selectedStudentDetail.cohortCode})
                  </span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(selectedStudentDetail.sessionProgressList || []).map((sp) => (
                    <div
                      key={sp.sessionId}
                      className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            Buổi {sp.sessionOrder}
                          </span>
                          <span className="font-bold truncate">{sp.title}</span>
                        </div>
                        <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                          {sp.isWatched ? 'Đã xem video bài giảng' : 'Chưa xem video'} ·{' '}
                          {sp.quizScorePct !== null
                            ? `Điểm bài kiểm tra: ${sp.quizScorePct}%`
                            : 'Chưa nộp bài kiểm tra'}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold text-[11px] shrink-0 ${
                          sp.isCompleted
                            ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                            : sp.isWatched
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-200/70 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        {sp.isCompleted
                          ? 'Đã hoàn thành'
                          : sp.isWatched
                            ? 'Đang học'
                            : 'Chưa học'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* B. Danh sách các câu hỏi học viên đã đặt (Thảo luận & AI Tutor) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#10B981]" />
                  <span>
                    2. Lịch sử câu hỏi học viên đã đặt trong Thảo luận &amp; Trợ giảng AI (
                    {selectedStudentDetail.studentQuestions?.length ?? 0})
                  </span>
                </h3>

                {!selectedStudentDetail.studentQuestions ||
                selectedStudentDetail.studentQuestions.length === 0 ? (
                  <div className="p-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-dashed border-[#E2ECE7] dark:border-[#1E2D24] text-center text-xs text-[#475569] dark:text-[#94A3B8]">
                    Học viên này chưa đặt câu hỏi nào trong mục Thảo luận buổi học hoặc Trợ giảng AI.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedStudentDetail.studentQuestions.map((sq) => (
                      <div
                        key={sq.id}
                        className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                sq.source === 'DISCUSSION'
                                  ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              {sq.source === 'DISCUSSION'
                                ? 'Thảo luận buổi học'
                                : 'Hỏi Trợ giảng AI'}
                            </span>
                            <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                              Buổi {sq.sessionOrder}: {sq.sessionTitle}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                            {new Date(sq.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {sq.title}
                        </div>
                        {sq.content && sq.content !== sq.title && (
                          <p className="text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                            {sq.content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleRemindStudent(
                      selectedStudentDetail.id,
                      selectedStudentDetail.studentName
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Gửi lời nhắc học tập cho {selectedStudentDetail.studentName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentDetail(null)}
                  className="px-4 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-bold cursor-pointer"
                >
                  Đóng hồ sơ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
