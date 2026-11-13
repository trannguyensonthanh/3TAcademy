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
} from 'lucide-react';
import { useAcademy, InstructorSidebarTab } from '../context/AcademyContext';
import { Enrollment, Notification, ChatMessage } from '../types/domain';
import { formatScheduleSlots } from '../utils/academyLogic';
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
} from '../services/teach.api';
import { authApi } from '../services/auth.api';
import { useAsyncData } from '../hooks/useAsyncData';

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
    setRole,
    navigate,
  } = useAcademy();

  // 5 mục gọn gàng trên Sidebar của Giảng viên (có mục Thống kê lớp học tách biệt)
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

  const { data: scheduleData, refetch: refetchSchedule } = useAsyncData(
    () => teachApi.getInstructorSchedule(),
    []
  );
  const { data: instructorCohortsData } = useAsyncData(
    () => teachApi.getInstructorCohorts(),
    []
  );

  const [analyticsCohortId, setAnalyticsCohortId] = useState<string>('cohort-ai-k01');
  const [enrollmentsState, setEnrollmentsState] = useState<Enrollment[]>([]);
  const [notificationsState, setNotificationsState] = useState<Notification[]>([]);
  const [chatMessagesState, setChatMessagesState] = useState<ChatMessage[]>([]);
  const [remindedEnrollmentIds, setRemindedEnrollmentIds] = useState<Record<string, boolean>>({});
  const [analyticsReminderToast, setAnalyticsReminderToast] = useState<string | null>(null);

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
  const [selectedCohortId, setSelectedCohortId] = useState<string>('cohort-ai-k01');
  const effectiveCohorts =
    instructorCohortsData && instructorCohortsData.length > 0
      ? instructorCohortsData
      : cohorts;
  const selectedCohort =
    effectiveCohorts.find((c) => c.id === selectedCohortId) ?? effectiveCohorts[0];

  const cohortSessions = sessions
    .filter((s) => s.cohortId === selectedCohortId)
    .sort((a, b) => a.sessionOrder - b.sessionOrder);
  const displayCohortSessions = cohortSessions.length > 0 ? cohortSessions : sessions;

  const [selectedSessionId, setSelectedSessionId] = useState<string>('sess-k01-05');
  const activeSession =
    displayCohortSessions.find((s) => s.id === selectedSessionId) ??
    displayCohortSessions[0];

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
  const [supplementaryVideoName, setSupplementaryVideoName] = useState<string>('');
  const [editSessionSummary, setEditSessionSummary] = useState<string>(
    activeSession.aiSummaryMd
  );
  const [sessionSavedMsg, setSessionSavedMsg] = useState<string | null>(null);
  const [newMatTitle, setNewMatTitle] = useState<string>('');
  const [newMatType, setNewMatType] = useState<'SLIDE' | 'PDF'>('SLIDE');
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
  >({
    'sess-k01-04': 'PUBLISHED',
    'sess-k01-05': 'DRAFT',
  });
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
      if (scheduleData.examReviews && scheduleData.examReviews.length > 0) {
        setExamReviews(
          scheduleData.examReviews.map((r) => ({
            ...r,
            studentEmail: r.studentEmail ?? 'hocvien@3t.edu.vn',
            examTitle:
              r.examTitle ?? 'Thi cuối khóa Kỹ Sư AI Thực Chiến (25 câu trắc nghiệm)',
            submittedAt: r.submittedAt ?? 'Hôm nay · 18:45',
          }))
        );
      }
    }
  }, [scheduleData]);

  const [cohortDetailEnrollments, setCohortDetailEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    let cancelled = false;
    teachApi
      .getInstructorCohortDetail(selectedCohortId)
      .then((detail) => {
        if (cancelled) return;
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedCohortId]);

  useEffect(() => {
    let cancelled = false;
    teachApi
      .getInstructorSessionDetail(selectedCohortId, selectedSessionId)
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedCohortId, selectedSessionId]);

  const liveSession =
    scheduleData?.liveSession ??
    sessions.find((s) => s.status === 'LIVE') ??
    sessions[4];

  // Mở Cấp 2 (Chi tiết 1 lớp)
  const handleOpenCohortLevel2 = async (cohortId: string) => {
    setSelectedCohortId(cohortId);
    setCohortFlowLevel('LEVEL_2_COHORT_DETAIL');
    setFinalExamSavedNotice(null);
    const detail = await teachApi.getInstructorCohortDetail(cohortId);
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
  const handleOpenSessionLevel3 = async (sessId: string) => {
    setSelectedSessionId(sessId);
    const found = displayCohortSessions.find((s) => s.id === sessId);
    if (found) {
      setEditSessionSummary(found.aiSummaryMd);
    }
    setIsPlayingReplayPreview(false);
    setSessionSavedMsg(null);
    setUploadSavedMsg(null);
    setQuizNotice(null);
    setEditingQuestionIdx(null);
    setShowAddSessionQForm(false);
    setCohortFlowLevel('LEVEL_3_SESSION_DETAIL');
    const detail = await teachApi.getInstructorSessionDetail(selectedCohortId, sessId);
    if (detail.assessmentId) {
      setSessionAssessmentIdById((prev) => ({
        ...prev,
        [sessId]: detail.assessmentId!,
      }));
    }
    if (detail.questions) {
      setSessionQuizzesById((prev) => ({
        ...prev,
        [sessId]: prev[sessId] ?? detail.questions,
      }));
    }
  };

  const handleCreateGuestLink = async () => {
    const res = await teachApi.createGuestSpeakerLink(liveSession.id);
    navigator.clipboard?.writeText(res.oneTimeGuestUrl).catch(() => {});
    setGuestLinkGenerated(res.oneTimeGuestUrl);
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

  // Lưu tóm tắt kiến thức trọng tâm & tải tài liệu cho buổi học (Cấp 3 - Khối 2)
  const handleSaveSessionSummaryAndMaterials = async (e: React.FormEvent) => {
    e.preventDefault();
    const summaryMd = editSessionSummary.trim() || activeSession.aiSummaryMd;
    const matTitle = newMatTitle.trim();
    await teachApi.updateSessionSummary(activeSession.id, summaryMd);
    updateSessionDetails(activeSession.id, {
      aiSummaryMd: summaryMd,
    });
    if (matTitle) {
      addCohortMaterial(
        selectedCohortId,
        activeSession.sessionOrder,
        matTitle,
        newMatType
      );
      setNewMatTitle('');
    }
    setSessionSavedMsg(
      `Đã lưu ghi chú tóm tắt kiến thức trọng tâm và tài liệu đính kèm cho Buổi ${activeSession.sessionOrder}.`
    );
    setTimeout(() => setSessionSavedMsg(null), 3500);
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
    setShowAddSessionQForm(true);
  };

  const handleSaveSessionQuestionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQPrompt.trim() || !newQOptA.trim() || !newQOptB.trim()) return;

    const list = [...currentSessionQuestions];
    const isEditing = editingQuestionIdx !== null && Boolean(list[editingQuestionIdx]);
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
        skillCode: 'HYBRID-RAG',
        skillName: 'Kiến thức trọng tâm buổi học',
        reviewTimestampLabel: '14:20 - 16:05',
        reviewJumpSec: 25,
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
      skillCode: 'FINAL-EXAM',
      skillName: 'Kiến thức tổng hợp toàn khóa',
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
  };

  const sessionMaterials = materials.filter(
    (m) => m.cohortId === selectedCohortId && m.sessionOrder === activeSession.sessionOrder
  );

  const filteredDiscussions = discussions.filter(
    (d) => qaCohortFilter === 'ALL' || d.cohortId === qaCohortFilter
  );

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
              src={AVATAR_MINH_KHOA}
              alt="TS. Trần Minh Khoa"
              className="w-10 h-10 rounded-full object-cover border border-[#10B981] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">TS. Trần Minh Khoa</p>
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

            {/* Thẻ Buổi học sắp diễn ra hôm nay */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border-2 border-[#10B981] p-6 space-y-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#EF4444]/10 text-[#EF4444] text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                    <span>CA DẠY TỐI NAY · 19:30 - 21:30 · LỚP KỸ SƯ AI KHÓA K01</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold">
                    Buổi 5: Kết hợp tìm kiếm từ khóa &amp; tìm kiếm ngữ nghĩa cho Trợ lý AI
                  </h2>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                    Giảng viên: TS. Trần Minh Khoa · Trợ giảng cùng trực lớp: KS. Đặng Hoàng Nam · Sĩ số: 48 học viên
                  </p>
                </div>

                {/* 2 Nút thao tác nhanh bắt buộc */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/live/${liveSession.id}`)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bắt đầu buổi học trực tuyến</span>
                  </button>

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

              {/* Các ca dạy tiếp theo trong tuần */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      Tối Thứ 5 tuần này · 19:30 - 21:30
                    </div>
                    <div className="font-bold text-sm">
                      Lớp Kỹ Sư AI Thực Chiến — Khóa K01 (Buổi 6)
                    </div>
                    <div className="text-[#475569] dark:text-[#94A3B8]">
                      Chủ đề: Xây dựng quy trình tự động kiểm tra chất lượng câu trả lời
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold shrink-0">
                    Sắp tới
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      Tối Thứ 7 tuần này · 19:30 - 21:30
                    </div>
                    <div className="font-bold text-sm">
                      Lớp Kỹ Sư AI Thực Chiến — Khóa K02 (Buổi 2)
                    </div>
                    <div className="text-[#475569] dark:text-[#94A3B8]">
                      Chủ đề: Thiết kế cơ sở dữ liệu phục vụ tìm kiếm tài liệu nội bộ
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold shrink-0">
                    Sắp tới
                  </span>
                </div>
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
                  {cohorts.map((cohort) => {
                    const countSessions =
                      sessions.filter((s) => s.cohortId === cohort.id).length || 6;
                    const instructorName =
                      cohort.staff.find((s) => s.role === 'INSTRUCTOR')?.fullName ??
                      'TS. Trần Minh Khoa';
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
                              Lịch học cố định: <strong className="text-[#0F172A] dark:text-white">{formatScheduleSlots(cohort.scheduleSlots)}</strong>
                            </div>
                            <div>
                              Khai giảng: <strong>{cohort.startDate}</strong> · Sĩ số:{' '}
                              <strong>{cohort.enrolledCount} học viên</strong> · Thời lượng:{' '}
                              <strong>{countSessions} buổi học</strong>
                            </div>
                            <div>
                              Giảng viên phụ trách: <strong>{instructorName}</strong> · Hỗ trợ học viên: <strong>Trợ giảng AI 24/7</strong>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                            {cohort.status === 'ONGOING'
                              ? '● Đang giảng dạy'
                              : cohort.status === 'OPENING'
                              ? '● Sắp khai giảng'
                              : '● Đã hoàn thành'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenCohortLevel2(cohort.id)}
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
                    {cohorts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCohortId(c.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                          selectedCohortId === c.id
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
                      Lịch học chuẩn của lớp: <strong>{formatScheduleSlots(selectedCohort.scheduleSlots)}</strong> · Sĩ số:{' '}
                      <strong>{selectedCohort.enrolledCount} học viên</strong>
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
                        Bấm vào từng buổi học để mở không gian chi tiết (Livestream / Bản ghi, Tài liệu tóm tắt &amp; 10 câu trắc nghiệm của buổi đó).
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
                              label: 'Hôm nay dạy trực tuyến',
                              cls: 'bg-[#EF4444]/15 text-[#EF4444]',
                            }
                          : {
                              label: 'Sắp tới',
                              cls: 'bg-slate-200/70 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8]',
                            };

                      return (
                        <div
                          key={sess.id}
                          className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] flex flex-col justify-between gap-4 transition-all"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-[#059669] dark:text-[#34D399]">
                                Buổi {sess.sessionOrder.toString().padStart(2, '0')} · {sess.scheduledStart}
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

                            <p className="text-xs text-[#475569] dark:text-[#94A3B8] line-clamp-2">
                              {sess.aiSummaryMd}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center justify-between gap-2 text-xs">
                            <span className="text-[#475569] dark:text-[#94A3B8]">
                              10 câu trắc nghiệm mở khóa · {sess.attachmentsCount} tài liệu
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenSessionLevel3(sess.id)}
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <div>
                    <h2 className="text-lg font-bold">
                      3. Bảng tiến độ &amp; Điểm kiểm tra của học viên trong lớp ({selectedCohort.code})
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Theo dõi chuyên cần và điểm trung bình các bài kiểm tra mở khóa của từng học viên trong lớp.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                          <th className="py-3 px-3 font-semibold">Học viên</th>
                          <th className="py-3 px-3 font-semibold">Tham gia buổi học</th>
                          <th className="py-3 px-3 font-semibold">Bài kiểm tra đã đạt</th>
                          <th className="py-3 px-3 font-semibold">Điểm trung bình</th>
                          <th className="py-3 px-3 font-semibold">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2ECE7] dark:divide-[#1E2D24]">
                        {cohortDetailEnrollments
                          .map(
                            (enr): CohortStudentProgressRow => ({
                              id: enr.id,
                              fullName: enr.studentName,
                              email: enr.studentEmail,
                              attendedCount: `${enr.completedSessionsCount}/${enr.totalSessionsCount} buổi`,
                              completedQuizzes: `${Math.max(
                                0,
                                enr.totalSessionsCount - enr.missingQuizzesCount
                              )}/${enr.totalSessionsCount} bài`,
                              avgScore: `${(enr.avgScorePct / 10).toFixed(1)} / 10`,
                              statusLabel:
                                enr.riskLevel === 'LOW'
                                  ? 'Đúng tiến độ'
                                  : 'Cần nhắc làm bài',
                            })
                          )
                          .map((row) => (
                          <tr key={row.id}>
                            <td className="py-3 px-3">
                              <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                                {row.fullName}
                              </div>
                              <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                                {row.email}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold">
                              {row.attendedCount}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold">
                              {row.completedQuizzes}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-[#059669] dark:text-[#34D399]">
                              {row.avgScore}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex px-2.5 py-1 rounded-md font-bold text-[11px] ${
                                  row.statusLabel === 'Đúng tiến độ'
                                    ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                    : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                                }`}
                              >
                                {row.statusLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                        Lịch học cố định: {activeSession.scheduledStart}
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
                        ? 'Đã dạy xong — Có bản ghi tự động từ Livestream'
                        : activeSession.status === 'LIVE'
                        ? 'Hôm nay dạy trực tuyến (19:30 - 21:30)'
                        : 'Buổi học sắp tới / Bổ trợ'}
                    </span>
                  </div>

                  {/* Trường hợp 1: Buổi học sắp/đang diễn ra hôm nay (LIVE) */}
                  {activeSession.status === 'LIVE' && (
                    <div className="p-6 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border-2 border-[#10B981] space-y-4">
                      <div className="space-y-1">
                        <div className="text-xs font-mono font-bold text-[#EF4444]">
                          ● PHÒNG DẠY TRỰC TUYẾN ĐÃ SẴN SÀNG CHO CA TỐI NAY
                        </div>
                        <p className="text-sm font-bold">
                          Bấm nút bên dưới để mở sân khấu Livestream giảng dạy hoặc tạo đường dẫn mời chuyên gia khách mời.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/live/${activeSession.id}`)}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold shadow-xs cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Mở Phòng Livestream Dạy Học</span>
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

                  {/* Trường hợp 2: Buổi học đã dạy xong (REPLAY_READY) -> Trình xem Bản ghi tự động từ Livestream (KHÔNG có nút ghi đè video) */}
                  {activeSession.status === 'REPLAY_READY' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden text-white">
                        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-emerald-400 font-semibold">
                            Bản ghi tự động từ buổi Livestream · Buổi {activeSession.sessionOrder}: {activeSession.title}
                          </span>
                          <span className="font-mono text-slate-400">
                            Độ phân giải 1080p · Thời lượng: 02:00:00
                          </span>
                        </div>

                        <div className="p-6 min-h-[220px] flex flex-col justify-between bg-gradient-to-br from-slate-900 via-[#090F0C] to-emerald-950/40">
                          <div className="space-y-2 max-w-2xl">
                            <span className="inline-block px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono">
                              Đã đồng bộ tự động sau khi kết thúc ca dạy trực tuyến
                            </span>
                            <h3 className="text-base sm:text-lg font-bold">
                              {activeSession.title}
                            </h3>
                            <p className="text-xs text-slate-300">
                              Hệ thống tự động lưu giữ nguyên vẹn bản ghi buổi học trực tuyến cùng các mốc thời gian thảo luận để học viên trong lớp ôn tập.
                            </p>
                          </div>

                          <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setIsPlayingReplayPreview((prev) => !prev)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {isPlayingReplayPreview
                                  ? 'Đang phát bản ghi Livestream (00:14:20 / 02:00:00)'
                                  : 'Xem lại bản ghi buổi Livestream'}
                              </span>
                            </button>

                            <span className="text-[11px] font-mono text-slate-400">
                              ✓ Bản ghi gốc từ Livestream được bảo toàn tự động
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trường hợp 3: Buổi học sắp tới hoặc buổi bổ trợ chưa Livestream (SCHEDULED) */}
                  {activeSession.status === 'SCHEDULED' && (
                    <div className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-bold">
                            Buổi học chưa diễn ra ({activeSession.scheduledStart})
                          </div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            Nếu đây là buổi học bổ trợ không dạy qua Livestream, giảng viên có thể tải lên video bài giảng bổ trợ bên dưới.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => navigate(`/live/${activeSession.id}`)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Mở Phòng Livestream Dạy Học</span>
                        </button>
                      </div>

                      <div className="pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <Film className="w-4 h-4 text-[#10B981]" />
                          <span>
                            {supplementaryVideoName ||
                              'Chưa có video bổ trợ (Mặc định sẽ tự động ghi hình khi Livestream)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSupplementaryVideoName(
                              `Video-Bo-Tro-Buoi-0${activeSession.sessionOrder}-1080p.mp4`
                            )
                          }
                          className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
                        >
                          Tải video bổ trợ lên
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* KHỐI 2 (CẤP 3): TÀI LIỆU & TÓM TẮT BUỔI HỌC */}
                <form
                  onSubmit={handleSaveSessionSummaryAndMaterials}
                  className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#10B981]" />
                    <h2 className="text-lg font-bold">
                      2. Tài liệu &amp; Tóm tắt kiến thức trọng tâm (Buổi {activeSession.sessionOrder})
                    </h2>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Ghi chú tóm tắt kiến thức trọng tâm sau buổi dạy
                    </label>
                    <textarea
                      rows={3}
                      value={editSessionSummary}
                      onChange={(e) => setEditSessionSummary(e.target.value)}
                      placeholder="Viết tóm tắt các ý chính và lưu ý thực hành của buổi học này..."
                      className="w-full p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold mb-1.5">
                        Tải lên file Slide PDF / Tài liệu bài tập mới cho buổi học
                      </label>
                      <input
                        type="text"
                        value={newMatTitle}
                        onChange={(e) => setNewMatTitle(e.target.value)}
                        placeholder={`VD: Slide bài giảng Buổi ${activeSession.sessionOrder}.pdf`}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Loại tài liệu</label>
                      <select
                        value={newMatType}
                        onChange={(e) => setNewMatType(e.target.value as 'SLIDE' | 'PDF')}
                        className="w-full px-3 py-2 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                      >
                        <option value="SLIDE">Slide bài giảng PDF</option>
                        <option value="PDF">Tài liệu hướng dẫn / Bài tập</option>
                      </select>
                    </div>
                  </div>

                  {/* Danh sách tài liệu hiện có của buổi học */}
                  {sessionMaterials.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <div className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                        Tài liệu đã đính kèm trong Buổi {activeSession.sessionOrder}:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sessionMaterials.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-medium"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>{m.title}</span>
                          </span>
                        ))}
                      </div>
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
                      <span>Lưu tóm tắt &amp; Tài liệu buổi học</span>
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
                        <span>Tạo 10 câu hỏi gợi ý từ nội dung buổi học này (DRAFT)</span>
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

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                {cohorts.map((c) => (
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
              {filteredDiscussions.map((thread) => {
                const isVerified =
                  thread.verifiedByStaff || verifiedThreadIds.includes(thread.id);
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
                        onClick={() =>
                          setVerifiedThreadIds((prev) =>
                            prev.includes(thread.id) ? prev : [...prev, thread.id]
                          )
                        }
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
            3. THỐNG KÊ LỚP HỌC (/teach/analytics) — TÁCH RIÊNG 4 BIỂU ĐỒ CHUYÊN SÂU
           ================================================================== */}
        {instructorSidebarTab === 'CLASS_ANALYTICS' && (() => {
          const currentAnalyticsCohort =
            cohorts.find((c) => c.id === analyticsCohortId) ?? cohorts[0];
          const isK01 = currentAnalyticsCohort.id === 'cohort-ai-k01';

          // 1. Lấy dữ liệu enrollments theo lớp và nhóm riskLevel (LOW / MEDIUM / HIGH)
          const cohortEnrollments = enrollmentsState.filter(
            (e) => e.cohortId === currentAnalyticsCohort.id
          );
          const effectiveEnrollments =
            cohortEnrollments.length > 0 ? cohortEnrollments : enrollmentsState;
          const highRiskEnrollments = effectiveEnrollments.filter(
            (e) => e.riskLevel === 'HIGH'
          );
          const lowRiskCount = effectiveEnrollments.filter((e) => e.riskLevel === 'LOW').length;
          const mediumRiskCount = effectiveEnrollments.filter(
            (e) => e.riskLevel === 'MEDIUM'
          ).length;
          const highRiskCount = highRiskEnrollments.length;

          const sessionStackedProgress = isK01
            ? [
                {
                  label: 'Buổi 1',
                  subLabel: 'Kiến trúc AI',
                  subtitle: 'Buổi 1: Kiến trúc tổng thể hệ thống Trợ lý AI doanh nghiệp',
                  values: { lowRisk: 45, mediumRisk: 2, highRisk: 1 },
                },
                {
                  label: 'Buổi 2',
                  subLabel: 'Vector DB',
                  subtitle: 'Buổi 2: Chia nhỏ văn bản PDF & Lưu trữ chỉ mục tìm kiếm',
                  values: { lowRisk: 43, mediumRisk: 3, highRisk: 2 },
                },
                {
                  label: 'Buổi 3',
                  subLabel: 'pgvector SQL',
                  subtitle: 'Buổi 3: Xây dựng bộ tìm kiếm ngữ nghĩa trên PostgreSQL',
                  values: { lowRisk: 40, mediumRisk: 5, highRisk: 3 },
                },
                {
                  label: 'Buổi 4',
                  subLabel: 'Phân quyền',
                  subtitle: 'Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu',
                  values: { lowRisk: 38, mediumRisk: 7, highRisk: 3 },
                },
                {
                  label: 'Buổi 5',
                  subLabel: 'Hybrid Search',
                  subtitle: 'Buổi 5: Kết hợp tìm kiếm từ khóa & ngữ nghĩa (Đang học)',
                  values: { lowRisk: 35, mediumRisk: 9, highRisk: 4 },
                },
                {
                  label: 'Buổi 6',
                  subLabel: 'Kiểm thử & Thi',
                  subtitle: 'Buổi 6: Kiểm thử chất lượng câu trả lời & Thi cuối khóa',
                  values: { lowRisk: 34, mediumRisk: 10, highRisk: 4 },
                },
              ]
            : [
                {
                  label: 'Buổi 1',
                  subLabel: 'Khởi động',
                  subtitle: 'Buổi 1: Thiết lập môi trường & Quy trình xử lý dữ liệu',
                  values: { lowRisk: 32, mediumRisk: 2, highRisk: 0 },
                },
                {
                  label: 'Buổi 2',
                  subLabel: 'Làm sạch DL',
                  subtitle: 'Buổi 2: Làm sạch dữ liệu bảng biểu lớn',
                  values: { lowRisk: 30, mediumRisk: 3, highRisk: 1 },
                },
                {
                  label: 'Buổi 3',
                  subLabel: 'Truy vấn SQL',
                  subtitle: 'Buổi 3: Tối ưu truy vấn báo cáo phân tích',
                  values: { lowRisk: 29, mediumRisk: 4, highRisk: 1 },
                },
                {
                  label: 'Buổi 4',
                  subLabel: 'Tự động hóa',
                  subtitle: 'Buổi 4: Xây dựng luồng cập nhật báo cáo tự động',
                  values: { lowRisk: 27, mediumRisk: 5, highRisk: 2 },
                },
                {
                  label: 'Buổi 5',
                  subLabel: 'Trực quan hóa',
                  subtitle: 'Buổi 5: Thiết kế bảng điều khiển chỉ số vận hành',
                  values: { lowRisk: 26, mediumRisk: 6, highRisk: 2 },
                },
                {
                  label: 'Buổi 6',
                  subLabel: 'Bảo vệ dự án',
                  subtitle: 'Buổi 6: Bảo vệ dự án cuối khóa & Đánh giá đầu ra',
                  values: { lowRisk: 26, mediumRisk: 6, highRisk: 2 },
                },
              ];

          // 2. Phổ điểm số & Hiệu quả khóa học (assessment_attempts.score_pct)
          const scoreBuckets = isK01
            ? [
                {
                  rangeLabel: '< 50',
                  bandTitle: 'Chưa đạt chuẩn',
                  studentCount: 2,
                  percentage: 4,
                  color: '#EF4444',
                  sampleNote: 'Cần học viên xem lại video bài giảng và làm lại bài kiểm tra mở khóa.',
                },
                {
                  rangeLabel: '50 - 69',
                  bandTitle: 'Cần củng cố thêm',
                  studentCount: 5,
                  percentage: 10,
                  color: '#F59E0B',
                  sampleNote: 'Đã nắm lý thuyết cơ bản nhưng còn nhầm câu hỏi tình huống thực tế.',
                },
                {
                  rangeLabel: '70 - 84',
                  bandTitle: 'Đạt chuẩn tốt',
                  studentCount: 22,
                  percentage: 46,
                  color: '#10B981',
                  sampleNote: 'Nắm vững kiến thức trọng tâm và vượt mốc mở khóa buổi tiếp theo.',
                },
                {
                  rangeLabel: '85 - 100',
                  bandTitle: 'Xuất sắc',
                  studentCount: 19,
                  percentage: 40,
                  color: 'emerald-gradient',
                  sampleNote: 'Hoàn thành xuất sắc cả câu hỏi kiến trúc hệ thống và tối ưu hiệu năng.',
                },
              ]
            : [
                {
                  rangeLabel: '< 50',
                  bandTitle: 'Chưa đạt chuẩn',
                  studentCount: 1,
                  percentage: 3,
                  color: '#EF4444',
                  sampleNote: 'Cần giảng viên nhắc nhở hoàn thành bài tập cơ bản.',
                },
                {
                  rangeLabel: '50 - 69',
                  bandTitle: 'Cần củng cố thêm',
                  studentCount: 4,
                  percentage: 12,
                  color: '#F59E0B',
                  sampleNote: 'Cần ôn lại phần truy vấn nhóm dữ liệu nâng cao.',
                },
                {
                  rangeLabel: '70 - 84',
                  bandTitle: 'Đạt chuẩn tốt',
                  studentCount: 16,
                  percentage: 47,
                  color: '#10B981',
                  sampleNote: 'Hoàn thành đúng hạn và vượt chuẩn 70% của học viện.',
                },
                {
                  rangeLabel: '85 - 100',
                  bandTitle: 'Xuất sắc',
                  studentCount: 13,
                  percentage: 38,
                  color: 'emerald-gradient',
                  sampleNote: 'Nắm rất chắc kỹ năng thực hành dự án.',
                },
              ];

          // 3. Gom nhóm trực tiếp từ chat_messages.detectedTopic kết hợp discussion_threads
          const detectedTopicCounts = chatMessagesState.reduce<Record<string, number>>(
            (acc, msg) => {
              if (msg.detectedTopic) {
                acc[msg.detectedTopic] = (acc[msg.detectedTopic] || 0) + 1;
              }
              return acc;
            },
            {}
          );

          const topicBottlenecks = [
            {
              skillCode: 'RAG & Vector Search',
              topicName: 'Cân bằng trọng số Hybrid Search (BM25 + pgvector) & Tách bảng PDF',
              sessionLabel: 'Buổi 4 & 5',
              wrongAnswerRatePct: 38,
              discussionQuestionsCount: 14,
              aiTutorQueriesCount: 38 + (detectedTopicCounts['RAG & Vector Search'] || 0) * 4,
              recommendationNote:
                'Dành 10 phút đầu Buổi 5 minh họa trực tiếp công thức chuẩn hóa điểm RRF trên dữ liệu hợp đồng mẫu.',
            },
            {
              skillCode: 'PostgreSQL & SQL',
              topicName: 'Kiểm soát phân quyền truy cập tài liệu ở tầng truy vấn SQL (Row-Level)',
              sessionLabel: 'Buổi 3 & 4',
              wrongAnswerRatePct: 31,
              discussionQuestionsCount: 11,
              aiTutorQueriesCount: 28 + (detectedTopicCounts['PostgreSQL & SQL'] || 0) * 4,
              recommendationNote:
                'Ghim câu lệnh SQL lọc quyền phòng ban trước khi chạy toán tử khoảng cách vector lên đầu mục thảo luận.',
            },
            {
              skillCode: 'FastAPI',
              topicName: 'Xác thực JWT Dependency Injection & Kiểm soát bất đồng bộ trên FastAPI',
              sessionLabel: 'Buổi 3',
              wrongAnswerRatePct: 24,
              discussionQuestionsCount: 9,
              aiTutorQueriesCount: 22 + (detectedTopicCounts['FastAPI'] || 0) * 3,
              recommendationNote:
                'Bổ sung sơ đồ luồng Middleware kiểm tra quyền trước khi gọi tầng truy vấn cơ sở dữ liệu.',
            },
            {
              skillCode: 'Python',
              topicName: 'Xử lý bất đồng bộ (asyncio.gather) giảm độ trễ phản hồi dưới 800ms',
              sessionLabel: 'Buổi 2 & 3',
              wrongAnswerRatePct: 18,
              discussionQuestionsCount: 6,
              aiTutorQueriesCount: 17 + (detectedTopicCounts['Python'] || 0) * 3,
              recommendationNote:
                'Đa số học viên đã nắm vững, chỉ cần lưu ý cách xử lý lỗi timeout khi gọi API ngoài.',
            },
            {
              skillCode: 'Redis & Docker',
              topicName: 'Thiết lập Semantic Cache bằng Redis & Đóng gói Docker Compose',
              sessionLabel: 'Buổi 5 & 6',
              wrongAnswerRatePct: 14,
              discussionQuestionsCount: 5,
              aiTutorQueriesCount:
                12 +
                ((detectedTopicCounts['Redis'] || 0) + (detectedTopicCounts['Docker'] || 0)) * 3,
              recommendationNote:
                'Cung cấp sẵn file cấu hình mẫu docker-compose.yml để học viên đối chiếu nhanh.',
            },
          ];

          // 4. Tính toán trực tiếp từ bảng notifications (type === 'AI_STUDY_REMINDER')
          const aiReminders = notificationsState.filter(
            (n) => n.type === 'AI_STUDY_REMINDER'
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
                <div className="w-full space-y-1">
                  <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                    PHÂN TÍCH CHUYÊN SÂU DÀNH CHO GIẢNG VIÊN
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold">
                    Thống kê lớp học &amp; Chất lượng tiếp thu bài giảng
                  </h1>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                    Theo dõi tiến độ hoàn thành bài học, mức độ chuyên cần của học viên, phổ điểm kiểm tra và các chủ đề thảo luận nhiều nhất trong lớp.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                  <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] mr-1">
                    Chọn lớp phụ trách:
                  </span>
                  {cohorts.map((cohort) => {
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
                          Đúng hạn: {lowRiskCount} · Cần lưu ý: {mediumRiskCount} · Cần hỗ trợ: {highRiskCount}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold">
                        Tiến độ học tập &amp; Mức độ cần hỗ trợ
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Thống kê tỷ lệ tham gia các buổi học và phân loại mức độ chuyên cần của học viên trong lớp.
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
                          86% đạt từ 70 điểm trở lên
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
                        {isK01 ? '81.4 / 100' : '79.2 / 100'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Vượt qua lần 1
                      </div>
                      <div className="text-base font-bold font-mono text-[#0F172A] dark:text-white mt-0.5">
                        {isK01 ? '86%' : '85%'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                        Đủ điều kiện thi
                      </div>
                      <div className="text-base font-bold font-mono text-[#059669] dark:text-[#34D399] mt-0.5">
                        {isK01 ? '41 / 48 HV' : '29 / 34 HV'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Biểu đồ 3: Chủ đề kỹ thuật học viên hỏi nhiều nhất */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4 min-w-0">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        3. CÁC CHỦ ĐỀ HỌC VIÊN HỎI NHIỀU NHẤT
                      </span>
                      <span className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399]">
                        Chủ đề trọng tâm
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold">
                      Các chủ đề kỹ thuật được thảo luận nhiều nhất
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Tổng hợp những phần kiến thức học viên đặt nhiều câu hỏi nhất trong buổi học để giảng viên lưu ý giải đáp thêm.
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
