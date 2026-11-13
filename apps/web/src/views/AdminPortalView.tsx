import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarPlus,
  CalendarClock,
  Users,
  Receipt,
  Award,
  Plus,
  CheckCircle2,
  Search,
  ShieldCheck,
  Edit3,
  Lock,
  Unlock,
  Check,
  ArrowUp,
  ArrowDown,
  GitBranch,
  Layers,
  Trash2,
  Clock,
  LogOut,
  UserPlus,
  AlertCircle,
  Sparkles,
  Shield,
  GraduationCap,
} from 'lucide-react';
import { useAcademy, AdminSidebarTab } from '../context/AcademyContext';
import {
  formatCurrencyVnd,
  formatScheduleSlots,
  getDayOfWeekLabel,
} from '../utils/academyLogic';
import {
  Course,
  CourseCategory,
  CohortScheduleSlot,
  SyllabusTemplateItem,
} from '../types/domain';
import {
  adminApi,
  AdminUserAccountItem,
  EligibleGraduateItem,
} from '../services/admin.api';
import { authApi } from '../services/auth.api';
import { catalogApi } from '../services/catalog.api';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  ComboBarLineChart,
  StackedBarChart,
  SmoothAreaLineChart,
  CourseRatingDistributionChart,
} from '../components/charts';

interface WeeklyTimetableRow {
  cohortCode: string;
  cohortName: string;
  instructor: string;
  days: {
    mon?: string;
    tue?: string;
    wed?: string;
    thu?: string;
    fri?: string;
    sat?: string;
    sun?: string;
  };
}

interface CurriculumVersionItem {
  versionId: string;
  versionLabel: string;
  yearTag: string;
  appliedCohortsText: string;
  isLockedHistorical: boolean;
  sessions: SyllabusTemplateItem[];
}

export const AdminPortalView: React.FC = () => {
  const {
    adminSidebarTab,
    setAdminSidebarTab,
    courses,
    cohorts: contextCohorts,
    createCohort,
    updateCohortSchedule,
    receipts,
    certificates: contextCertificates,
    toggleCertificateRevoke,
    currentUser,
    setRole,
    navigate,
  } = useAcademy();

  const { data: overviewData, refetch: refetchAdminOverview } = useAsyncData(
    () => adminApi.getAdminOverview(),
    []
  );
  const { data: sepayTransactionsData } = useAsyncData(
    () => adminApi.getSepayTransactions(),
    []
  );

  const cohorts = overviewData?.cohorts ?? contextCohorts;
  const certificates = overviewData?.certificates ?? contextCertificates;
  const enrollmentsList = overviewData?.enrollments ?? [];
  const chatMessagesList = overviewData?.chatMessages ?? [];
  const notificationsList = overviewData?.notifications ?? [];

  // Sub-tabs cho mục Tổng quan học viện (/admin)
  const [overviewSubTab, setOverviewSubTab] = useState<
    'GROWTH_TUITION' | 'TRAINING_AI_ANALYTICS'
  >('GROWTH_TUITION');

  const { data: apiCourses, refetch: refetchCourses } = useAsyncData(
    () => catalogApi.getCourses(),
    []
  );
  const courseCatalog = apiCourses && apiCourses.length > 0 ? apiCourses : courses;
  const [selectedCourseForVersionId, setSelectedCourseForVersionId] = useState<string>(
    courseCatalog[0]?.id ?? ''
  );
  const [courseVersionsMap, setCourseVersionsMap] = useState<
    Record<string, CurriculumVersionItem[]>
  >({});
  const [activeVersionId, setActiveVersionId] = useState<string>('v2026');
  const [newSessionTitleInput, setNewSessionTitleInput] = useState<string>('');
  const [newSessionSummaryInput, setNewSessionSummaryInput] = useState<string>('');
  const [editingSessionOrder, setEditingSessionOrder] = useState<number | null>(null);
  const [editingSessionTitleVal, setEditingSessionTitleVal] = useState<string>('');

  const [showCreateCourseForm, setShowCreateCourseForm] = useState(false);
  const [courseFormTitle, setCourseFormTitle] = useState('');
  const [courseFormCategory, setCourseFormCategory] = useState<CourseCategory>('AI & Dữ liệu');
  const [courseFormDesc, setCourseFormDesc] = useState('');
  const [courseFormSkills, setCourseFormSkills] = useState(
    'Xây dựng ứng dụng AI, Thiết kế cơ sở dữ liệu tìm kiếm, Triển khai thực tế'
  );
  const [courseSavedNotice, setCourseSavedNotice] = useState<string | null>(null);

  // Tab 3: Mở lớp khai giảng (Chọn Phiên bản đề cương v2025 vs v2026)
  const [newCohortCourseId, setNewCohortCourseId] = useState(
    courseCatalog[0]?.id ?? 'course-ai-eng'
  );
  const [newCohortCurriculumVersion, setNewCohortCurriculumVersion] = useState<string>(
    'Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)'
  );
  const [newCohortCode, setNewCohortCode] = useState('AI-ENG-2026-K02');
  const [newCohortName, setNewCohortName] = useState('Khóa K02 — Khai giảng Năm 2026');
  const [newCohortTuition, setNewCohortTuition] = useState(8900000);
  const [newCohortOpenRegDate, setNewCohortOpenRegDate] = useState('20/11/2026');
  const [newCohortStart, setNewCohortStart] = useState('15/12/2026');
  const [newCohortScheduleSlots, setNewCohortScheduleSlots] = useState<CohortScheduleSlot[]>([
    { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
    { dayOfWeek: 5, startTime: '16:30', endTime: '18:30' },
  ]);
  const [editingCohortScheduleId, setEditingCohortScheduleId] = useState<string | null>(null);
  const [newCohortInstructor, setNewCohortInstructor] = useState('TS. Trần Minh Khoa');
  const [cohortCreatedNotice, setCohortCreatedNotice] = useState<string | null>(null);

  // Tab 4: Học viên, Giảng viên & Quản trị viên
  const accounts: AdminUserAccountItem[] = overviewData?.accounts ?? [];
  const instructorAccounts = accounts.filter(
    (a) => a.roleCategory === 'Giảng viên' && !a.locked
  );
  const [roleFilter, setRoleFilter] = useState<
    'ALL' | 'Học viên' | 'Giảng viên' | 'Quản trị viên'
  >('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  // Form State cho Tạo tài khoản mới (Khớp lược đồ database: accounts, user_profiles, instructor_profiles)
  const [formRole, setFormRole] = useState<'STUDENT' | 'INSTRUCTOR' | 'ADMIN'>('STUDENT');
  // NOT NULL fields
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('3T@Pass2026');
  const [formFullName, setFormFullName] = useState('');
  const [formHeadline, setFormHeadline] = useState('');
  // Nullable fields
  const [formAvatarUrl, setFormAvatarUrl] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formCareerGoal, setFormCareerGoal] = useState('');
  const [formInterviewCredits, setFormInterviewCredits] = useState<number>(2);
  const [formOrganization, setFormOrganization] = useState('');
  const [formYearsOfExp, setFormYearsOfExp] = useState<string>('');
  const [formExpertiseSummary, setFormExpertiseSummary] = useState('');
  const [formLinkedin, setFormLinkedin] = useState('');
  const [formGithub, setFormGithub] = useState('');
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  // Tab 5: Học phí & Chứng chỉ
  const [financeSubTab, setFinanceSubTab] = useState<'TUITION' | 'CERTIFICATES'>('TUITION');
  const [receiptSearch, setReceiptSearch] = useState('');
  const eligibleGraduates: EligibleGraduateItem[] = overviewData?.eligibleGraduates ?? [];
  const [certIssuedToast, setCertIssuedToast] = useState<string | null>(null);

  // Sidebar items (5 mục tinh gọn của Cổng Quản Trị Học Viện)
  const sidebarItems: {
    id: AdminSidebarTab;
    path: string;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'OVERVIEW', path: '/admin', label: 'Tổng quan học viện', icon: BarChart3 },
    { id: 'CURRICULUM', path: '/admin/courses', label: 'Chương trình đào tạo', icon: BookOpen },
    { id: 'COHORTS', path: '/admin/cohorts', label: 'Mở lớp khai giảng', icon: CalendarPlus },
    { id: 'USERS_STAFF', path: '/admin/users', label: 'Học viên & Giảng viên', icon: Users },
    {
      id: 'TUITION_RECONCILIATION',
      path: '/admin/finance',
      label: 'Học phí & Chứng chỉ',
      icon: Receipt,
    },
  ];

  // Lấy danh sách phiên bản đề cương của khóa học đang chọn
  const currentCourseobj =
    courseCatalog.find((c) => c.id === selectedCourseForVersionId) ??
    courseCatalog[0] ?? {
      id: selectedCourseForVersionId,
      slug: '',
      title: 'Chưa có khóa học',
      category: 'AI & Dữ liệu' as const,
      shortDescription: '',
      descriptionMd: '',
      difficultyLevel: 3 as const,
      ratingAvg: 0,
      reviewCount: 0,
      skills: [],
      syllabusTemplate: [],
    };
  const currentVersionsList: CurriculumVersionItem[] = courseVersionsMap[
    selectedCourseForVersionId
  ] ?? [
    {
      versionId: 'v2025',
      versionLabel: 'Phiên bản 2025 (v2025 — Chuẩn khóa cũ)',
      yearTag: 'Năm học 2025',
      appliedCohortsText: 'Đang áp dụng cho: Đợt K01 (Giữ nguyên lịch sử học tập)',
      isLockedHistorical: true,
      sessions: currentCourseobj.syllabusTemplate ?? [],
    },
    {
      versionId: 'v2026',
      versionLabel: 'Phiên bản 2026 mới (v2026 — Cập nhật mới)',
      yearTag: 'Năm học 2026',
      appliedCohortsText: 'Đang áp dụng cho: Đợt K02, K03 (Cho phép chỉnh sửa độc lập)',
      isLockedHistorical: false,
      sessions: currentCourseobj.syllabusTemplate ?? [],
    },
  ];

  const activeVersionObj =
    currentVersionsList.find((v) => v.versionId === activeVersionId) ??
    currentVersionsList[currentVersionsList.length - 1];

  const updateActiveVersionSessions = (newSessions: SyllabusTemplateItem[]) => {
    const reordered = newSessions.map((s, idx) => ({
      ...s,
      order: idx + 1,
    }));
    setCourseVersionsMap((prev) => {
      const list = prev[selectedCourseForVersionId] ?? currentVersionsList;
      return {
        ...prev,
        [selectedCourseForVersionId]: list.map((v) =>
          v.versionId === activeVersionObj.versionId ? { ...v, sessions: reordered } : v
        ),
      };
    });
  };

  // Đổi thứ tự buổi học trong Phiên bản đề cương đang mở (Admin độc quyền)
  const handleMoveSessionOrder = async (index: number, direction: 'UP' | 'DOWN') => {
    if (activeVersionObj.isLockedHistorical) return;
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    const list = [...activeVersionObj.sessions];
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    updateActiveVersionSessions(list);
    await adminApi.manageCourses({
      id: selectedCourseForVersionId,
      versionId: activeVersionObj.versionId,
      syllabusTemplate: list,
    });
    setCourseSavedNotice(
      `Đã cập nhật thứ tự buổi học trong ${activeVersionObj.versionLabel} (Không ảnh hưởng tới Phiên bản 2025 của khóa cũ).`
    );
    setTimeout(() => setCourseSavedNotice(null), 4000);
  };

  // Lưu tên buổi học chỉnh sửa trong Phiên bản đề cương 2026
  const handleSaveEditedSessionTitle = async (order: number) => {
    if (!editingSessionTitleVal.trim() || activeVersionObj.isLockedHistorical) return;
    const updated = activeVersionObj.sessions.map((s) =>
      s.order === order ? { ...s, title: editingSessionTitleVal.trim() } : s
    );
    updateActiveVersionSessions(updated);
    setEditingSessionOrder(null);
    await adminApi.manageCourses({
      id: selectedCourseForVersionId,
      versionId: activeVersionObj.versionId,
      syllabusTemplate: updated,
    });
    setCourseSavedNotice(
      `Đã cập nhật tên Buổi ${order} trong ${activeVersionObj.versionLabel}.`
    );
    setTimeout(() => setCourseSavedNotice(null), 4000);
  };

  // Thêm buổi học mới vào Phiên bản đề cương 2026
  const handleAddSessionToVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitleInput.trim() || activeVersionObj.isLockedHistorical) return;
    const nextOrder = activeVersionObj.sessions.length + 1;
    const nextList: SyllabusTemplateItem[] = [
      ...activeVersionObj.sessions,
      {
        order: nextOrder,
        title: newSessionTitleInput.trim(),
        summary:
          newSessionSummaryInput.trim() ||
          'Chủ đề mới cập nhật riêng cho đợt mở lớp năm nay.',
        activityTags: ['THEORY', 'LIVE_CODING'],
      },
    ];
    updateActiveVersionSessions(nextList);
    setNewSessionTitleInput('');
    setNewSessionSummaryInput('');
    await adminApi.manageCourses({
      id: selectedCourseForVersionId,
      versionId: activeVersionObj.versionId,
      syllabusTemplate: nextList,
    });
    setCourseSavedNotice(
      `Đã thêm Buổi ${nextOrder} vào ${activeVersionObj.versionLabel} (Đợt K01 năm 2025 vẫn giữ nguyên 6 buổi cũ).`
    );
    setTimeout(() => setCourseSavedNotice(null), 4000);
  };

  // Tạo nhánh phiên bản đề cương mới (VD: Phiên bản 2027)
  const handleCloneNewVersion = async () => {
    const newVerId = `v${2025 + currentVersionsList.length}`;
    const newVer: CurriculumVersionItem = {
      versionId: newVerId,
      versionLabel: `Phiên bản ${2025 + currentVersionsList.length} mới (${newVerId})`,
      yearTag: `Năm học ${2025 + currentVersionsList.length}`,
      appliedCohortsText: `Dành cho các đợt mở lớp mới từ Khóa K0${currentVersionsList.length + 1} trở đi`,
      isLockedHistorical: false,
      sessions: activeVersionObj.sessions.map((s) => ({ ...s })),
    };
    setCourseVersionsMap((prev) => ({
      ...prev,
      [selectedCourseForVersionId]: [...currentVersionsList, newVer],
    }));
    setActiveVersionId(newVerId);
    await adminApi.manageCourses({
      id: selectedCourseForVersionId,
      versionId: newVerId,
      syllabusTemplate: newVer.sessions,
    });
    setCourseSavedNotice(
      `Đã tạo nhánh đề cương "${newVer.versionLabel}" độc lập để chỉnh sửa cho đợt khai giảng mới.`
    );
    setTimeout(() => setCourseSavedNotice(null), 4000);
  };

  const handleSaveNewCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormTitle.trim()) return;
    const parsedSkills = courseFormSkills
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name, idx) => ({
        type: 'LEARNING_OUTCOME' as const,
        code: `SKILL_${idx + 1}`,
        name,
      }));

    const newCourse: Course = {
      id: `course-${Date.now()}`,
      slug: `khoa-hoc-${Date.now()}`,
      title: courseFormTitle.trim(),
      category: courseFormCategory,
      shortDescription:
        courseFormDesc.trim() || 'Chương trình đào tạo thực hành cùng giảng viên doanh nghiệp.',
      descriptionMd:
        courseFormDesc.trim() || 'Chương trình đào tạo thực hành cùng giảng viên doanh nghiệp.',
      difficultyLevel: 3,
      ratingAvg: 4.9,
      reviewCount: 42,
      skills:
        parsedSkills.length > 0
          ? parsedSkills
          : [
              {
                type: 'LEARNING_OUTCOME',
                code: 'SKILL_CORE',
                name: 'Thực hành dự án thực tế',
              },
            ],
      syllabusTemplate: [
        {
          order: 1,
          title: 'Buổi 1: Kiến trúc tổng thể và thiết lập môi trường thực hành',
          summary: 'Lý thuyết trọng tâm và thực hành.',
          activityTags: ['THEORY', 'LIVE_CODING'],
        },
        {
          order: 2,
          title: 'Buổi 2: Xử lý dữ liệu và tích hợp mô hình ngôn ngữ',
          summary: 'Thực hành trên bộ dữ liệu mẫu.',
          activityTags: ['LIVE_CODING'],
        },
      ],
    };
    const res = await adminApi.manageCourses(newCourse);
    await refetchCourses();
    setSelectedCourseForVersionId(res.courseId || newCourse.id);
    setShowCreateCourseForm(false);
    setCourseSavedNotice(`Đã tạo chương trình đào tạo mới "${newCourse.title}".`);
    setTimeout(() => setCourseSavedNotice(null), 4000);
  };

  // Handler for Tab 3: Mở lớp khai giảng (Schedule Slots Builder)
  const handleAddScheduleSlot = () => {
    const usedDays = new Set(newCohortScheduleSlots.map((s) => s.dayOfWeek));
    const candidateDays: CohortScheduleSlot['dayOfWeek'][] = [1, 2, 3, 4, 5, 6, 0];
    const nextDay = candidateDays.find((d) => !usedDays.has(d)) ?? 6;
    setNewCohortScheduleSlots((prev) => [
      ...prev,
      { dayOfWeek: nextDay, startTime: '19:30', endTime: '21:30' },
    ]);
  };

  const handleRemoveScheduleSlot = (index: number) => {
    if (newCohortScheduleSlots.length <= 1) return;
    setNewCohortScheduleSlots((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateScheduleSlot = (
    index: number,
    updates: Partial<CohortScheduleSlot>
  ) => {
    setNewCohortScheduleSlots((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot))
    );
  };

  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCohortCode.trim() || !newCohortName.trim() || newCohortScheduleSlots.length === 0) {
      return;
    }
    const formattedSchedule = formatScheduleSlots(newCohortScheduleSlots);
    const matchedInstructorAcc = instructorAccounts.find(
      (a) => a.fullName === newCohortInstructor || a.id === newCohortInstructor
    );
    const matchedCohortStaff = cohorts.find(
      (c) => c.staff[0]?.fullName === newCohortInstructor
    );
    const instructorId =
      matchedInstructorAcc?.id ||
      matchedCohortStaff?.instructorId ||
      (newCohortInstructor === 'ThS. Lê Thu Hà' ? 'usr-inst-ha' : 'usr-inst-khoa');
    const resolvedInstructorName =
      matchedInstructorAcc?.fullName || newCohortInstructor;

    await adminApi.manageCohorts({
      cohortId: editingCohortScheduleId ?? undefined,
      courseId: newCohortCourseId,
      instructorId,
      curriculumVersion: newCohortCurriculumVersion.slice(0, 120),
      code: newCohortCode.trim(),
      name: newCohortName.trim(),
      tuitionVnd: Number(newCohortTuition) || 8500000,
      startDate: newCohortStart,
      scheduleSlots: newCohortScheduleSlots,
      instructorName: resolvedInstructorName,
    });

    await refetchAdminOverview();

    if (editingCohortScheduleId) {
      setCohortCreatedNotice(
        `Đã cập nhật lịch học "${formattedSchedule}" (schedule_slots JSONB) cho lớp ${newCohortCode}!`
      );
      setEditingCohortScheduleId(null);
    } else {
      setCohortCreatedNotice(
        `Đã mở lớp "${newCohortName}" (${newCohortCode}) · Lịch học: "${formattedSchedule}"!`
      );
    }
    setTimeout(() => setCohortCreatedNotice(null), 4500);
  };

  // Handlers for Tab 4: Học viên, Giảng viên & Quản trị viên
  const handleResetAddAccountForm = () => {
    setFormEmail('');
    setFormPassword('3T@Pass2026');
    setFormFullName('');
    setFormHeadline('');
    setFormAvatarUrl('');
    setFormBio('');
    setFormCareerGoal('');
    setFormInterviewCredits(2);
    setFormOrganization('');
    setFormYearsOfExp('');
    setFormExpertiseSummary('');
    setFormLinkedin('');
    setFormGithub('');
    setFormValidationError(null);
    setShowAddAccountModal(false);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);

    const trimmedEmail = formEmail.trim();
    const trimmedPassword = formPassword.trim();
    const trimmedFullName = formFullName.trim();
    const trimmedHeadline = formHeadline.trim();

    // 1. Kiểm tra các trường bắt buộc
    if (!trimmedEmail) {
      setFormValidationError('Vui lòng nhập Email tài khoản.');
      return;
    }
    if (!trimmedPassword) {
      setFormValidationError('Vui lòng nhập Mật khẩu khởi tạo.');
      return;
    }
    if (!trimmedFullName) {
      setFormValidationError('Vui lòng nhập Họ và tên.');
      return;
    }
    if (formRole === 'INSTRUCTOR' && !trimmedHeadline) {
      setFormValidationError(
        'Vui lòng nhập Tiêu đề / Chức danh chuyên môn của Giảng viên.'
      );
      return;
    }

    try {
      setIsSubmittingAccount(true);
      const res = await adminApi.createAccount({
        email: trimmedEmail,
        password: trimmedPassword,
        role: formRole,
        fullName: trimmedFullName,
        avatarUrl: formAvatarUrl.trim() || undefined,
        bio: formBio.trim() || undefined,
        careerGoal: formCareerGoal.trim() || undefined,
        interviewCredits:
          typeof formInterviewCredits === 'number'
            ? formInterviewCredits
            : formRole === 'STUDENT'
            ? 2
            : 99,
        instructorHeadline: formRole === 'INSTRUCTOR' ? trimmedHeadline : undefined,
        instructorOrganization:
          formRole === 'INSTRUCTOR' && formOrganization.trim()
            ? formOrganization.trim()
            : undefined,
        instructorYearsOfExperience:
          formRole === 'INSTRUCTOR' && formYearsOfExp
            ? Number(formYearsOfExp)
            : undefined,
        instructorExpertiseSummaryMd:
          formRole === 'INSTRUCTOR' && formExpertiseSummary.trim()
            ? formExpertiseSummary.trim()
            : undefined,
        instructorSocialLinks:
          formRole === 'INSTRUCTOR' && (formLinkedin.trim() || formGithub.trim())
            ? {
                linkedin: formLinkedin.trim() || undefined,
                github: formGithub.trim() || undefined,
              }
            : undefined,
      });

      const newAcc = res.account;
      await refetchAdminOverview();
      const roleText =
        formRole === 'ADMIN'
          ? 'Quản trị viên'
          : formRole === 'INSTRUCTOR'
          ? 'Giảng viên'
          : 'Học viên';
      setAccountNotice(
        `Đã tạo tài khoản ${roleText} thành công cho ${newAcc.fullName} (${newAcc.email}).`
      );
      handleResetAddAccountForm();
      setTimeout(() => setAccountNotice(null), 4500);
    } catch (err: any) {
      setFormValidationError(err.message || 'Lỗi khi tạo tài khoản, vui lòng thử lại.');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleToggleLockAccount = async (id: string) => {
    const targetAcc = accounts.find((a) => a.id === id);
    if (!targetAcc) return;
    const nextLocked = !targetAcc.locked;
    const apiRole =
      targetAcc.roleCategory === 'Quản trị viên'
        ? 'ADMIN'
        : targetAcc.roleCategory === 'Giảng viên'
        ? 'INSTRUCTOR'
        : 'STUDENT';
    await adminApi.manageUsers({
      userId: id,
      role: apiRole,
      isActive: !nextLocked,
    });
    await refetchAdminOverview();
    setAccountNotice(
      nextLocked
        ? `Đã khóa tài khoản của ${targetAcc.fullName}.`
        : `Đã mở khóa tài khoản của ${targetAcc.fullName}.`
    );
    setTimeout(() => setAccountNotice(null), 3500);
  };

  // Handlers for Tab 6: Học phí & Chứng chỉ
  const handleIssueSingleCertificate = async (grad: EligibleGraduateItem) => {
    if (grad.issuedCertCode) return;
    const res = await adminApi.issueCertificatesBatch([grad.id]);
    const code = res.certificateCodes[0] || `CERT-3T-2026-8899`;
    await refetchAdminOverview();
    setCertIssuedToast(`Đã cấp chứng chỉ mã ${code} cho học viên ${grad.studentName}.`);
    setTimeout(() => setCertIssuedToast(null), 4000);
  };

  const handleBatchIssueCertificates = async () => {
    const pending = eligibleGraduates.filter((g) => !g.issuedCertCode);
    if (pending.length === 0) return;

    const enrollmentIds = pending.map((g) => g.id);
    await adminApi.issueCertificatesBatch(enrollmentIds);
    await refetchAdminOverview();
    setCertIssuedToast(
      `Đã duyệt và cấp chứng chỉ tốt nghiệp cho toàn bộ ${pending.length} học viên đủ điều kiện.`
    );
    setTimeout(() => setCertIssuedToast(null), 4000);
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchRole = roleFilter === 'ALL' || acc.roleCategory === roleFilter;
    const matchQuery =
      !userSearch.trim() ||
      acc.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
      acc.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      acc.cohortAssigned.toLowerCase().includes(userSearch.toLowerCase());
    return matchRole && matchQuery;
  });

  const combinedReceipts =
    receipts.length > 0
      ? receipts
      : (sepayTransactionsData ?? []).map((tx) => ({
          orderCode: tx.orderCode ?? 'UNMATCHED',
          cohortCode: tx.transferContent.split(' ')[1] || 'AI-ENG-K01',
          courseTitle: 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
          amountVnd: tx.amountVnd,
          paidAt: tx.processedAt,
          bankName: 'MBBank',
          transactionRef: tx.referenceNumber,
        }));

  const filteredReceipts = combinedReceipts.filter(
    (r) =>
      r.orderCode.toLowerCase().includes(receiptSearch.toLowerCase()) ||
      r.cohortCode.toLowerCase().includes(receiptSearch.toLowerCase()) ||
      r.courseTitle.toLowerCase().includes(receiptSearch.toLowerCase())
  );

  const pendingGraduateCount = eligibleGraduates.filter((g) => !g.issuedCertCode).length;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7FBF9] dark:bg-[#090F0C] text-[#0F172A] dark:text-[#ECFDF5]">
      {/* FIXED LEFT SIDEBAR ONLY — KHÓA CHẶT TRONG CỔNG QUẢN TRỊ (/admin) */}
      <aside className="w-full lg:w-[272px] shrink-0 lg:h-screen lg:sticky lg:top-0 bg-white dark:bg-[#111A15] border-b lg:border-b-0 lg:border-r border-[#E2ECE7] dark:border-[#1E2D24] p-5 flex flex-col justify-between gap-6">
        <div className="space-y-6">
          {/* Brand (Không có nút Trang chủ dẫn sang giao diện Học viên) */}
          <div className="pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
              3T Academy
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#10B981] mt-0.5">
              Cổng Quản Trị Học Viện
            </div>
          </div>

          {/* 6 Sidebar Items */}
          <nav className="space-y-1.5" aria-label="Menu Quản Trị Học Viện">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active =
                adminSidebarTab === item.id ||
                (item.id === 'TUITION_RECONCILIATION' &&
                  adminSidebarTab === 'ISSUE_CERTIFICATES');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setAdminSidebarTab(item.id);
                    navigate(item.path);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-[#090F0C] hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Admin Info & Logout */}
        <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">
                {currentUser?.fullName || 'Quản trị viên'}
              </p>
              <p className="text-[11px] text-[#059669] dark:text-[#34D399] font-semibold truncate">
                Quản lý Đào tạo &amp; Giáo vụ
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
            <span>Đăng xuất quyền quản trị</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 min-w-0 overflow-x-hidden p-6 md:p-8 pb-24 flex flex-col gap-6">
        {/* =========================================================
            1. TỔNG QUAN HỌC VIỆN (/admin) — 2 CHẾ ĐỘ XEM (SUB-TABS TÁCH BIỆT)
           ========================================================= */}
        {adminSidebarTab === 'OVERVIEW' && (() => {
          const monthlyComboData = [
            {
              month: 'Tháng 6',
              revenueMillionVnd: 380,
              newEnrollments: 165,
              sepayMatchedRatePct: 98.5,
            },
            {
              month: 'Tháng 7',
              revenueMillionVnd: 445,
              newEnrollments: 190,
              sepayMatchedRatePct: 99.1,
            },
            {
              month: 'Tháng 8',
              revenueMillionVnd: 512,
              newEnrollments: 220,
              sepayMatchedRatePct: 99.4,
            },
            {
              month: 'Tháng 9',
              revenueMillionVnd: 590,
              newEnrollments: 260,
              sepayMatchedRatePct: 99.2,
            },
            {
              month: 'Tháng 10',
              revenueMillionVnd: 642,
              newEnrollments: 285,
              sepayMatchedRatePct: 99.6,
            },
            {
              month: 'Tháng 11',
              revenueMillionVnd: 685,
              newEnrollments: 300,
              sepayMatchedRatePct: 99.8,
            },
          ];

          const cohortRetentionData = [
            {
              label: 'AI-K01',
              subLabel: 'v2025 · 48 HV',
              subtitle: 'Lớp Kỹ Sư AI Thực Chiến — Khóa K01 (Đang học Buổi 5/6)',
              values: { active: 36, completed: 10, revoked: 2 },
            },
            {
              label: 'AI-K02',
              subLabel: 'v2026 · 38 HV',
              subtitle: 'Lớp Kỹ Sư AI Thực Chiến — Khóa K02 (Đang mở ghi danh & học Buổi 2)',
              values: { active: 37, completed: 0, revoked: 1 },
            },
            {
              label: 'PY-K04',
              subLabel: 'v2025 · 52 HV',
              subtitle: 'Lớp Lập Trình Python & Xử Lý Dữ Liệu — Khóa K04 (Đã tốt nghiệp)',
              values: { active: 4, completed: 46, revoked: 2 },
            },
            {
              label: 'DATA-K01',
              subLabel: 'v2026 · 34 HV',
              subtitle: 'Lớp Phân Tích Dữ Liệu Kinh Doanh — Khóa K01 (Đang học Buổi 3)',
              values: { active: 32, completed: 0, revoked: 2 },
            },
          ];

          const aiSystemWeeklyData = [
            {
              label: 'Tuần 1',
              subLabel: '214 buổi PV',
              value: 1240,
              secondaryValue: 640,
              detailText: '1.240 câu hỏi Trợ giảng AI · 214 lượt phỏng vấn · Độ trễ TB 640ms',
            },
            {
              label: 'Tuần 2',
              subLabel: '248 buổi PV',
              value: 1480,
              secondaryValue: 610,
              detailText: '1.480 câu hỏi Trợ giảng AI · 248 lượt phỏng vấn · Độ trễ TB 610ms',
            },
            {
              label: 'Tuần 3',
              subLabel: '290 buổi PV',
              value: 1720,
              secondaryValue: 580,
              detailText: '1.720 câu hỏi Trợ giảng AI · 290 lượt phỏng vấn · Độ trễ TB 580ms',
            },
            {
              label: 'Tuần 4',
              subLabel: '335 buổi PV',
              value: 1960,
              secondaryValue: 540,
              detailText: '1.960 câu hỏi Trợ giảng AI · 335 lượt phỏng vấn · Độ trễ TB 540ms',
            },
            {
              label: 'Tuần 5',
              subLabel: '362 buổi PV',
              value: 2180,
              secondaryValue: 515,
              detailText: '2.180 câu hỏi Trợ giảng AI · 362 lượt phỏng vấn · Độ trễ TB 515ms',
            },
            {
              label: 'Tuần 6',
              subLabel: '410 buổi PV',
              value: 2450,
              secondaryValue: 490,
              detailText: '2.450 câu hỏi Trợ giảng AI · 410 lượt phỏng vấn · Độ trễ TB 490ms',
            },
          ];

          const ratingDistribution = [
            {
              stars: 5,
              count: 342,
              percentage: 86,
              highlightQuote:
                'Bài giảng thực chiến, Trợ giảng AI trích dẫn đúng từng giây video giúp mình ôn bài cực nhanh.',
            },
            {
              stars: 4,
              count: 44,
              percentage: 11,
              highlightQuote:
                'Giảng viên giải đáp kỹ, phòng luyện phỏng vấn 2 vòng rất sát với câu hỏi tuyển dụng thực tế.',
            },
            {
              stars: 3,
              count: 8,
              percentage: 2,
              highlightQuote:
                'Nội dung Buổi 4 khá nhiều kiến thức nâng cao, cần xem lại bản ghi 2 lần mới nắm hết.',
            },
            {
              stars: 2,
              count: 4,
              percentage: 1,
              highlightQuote: 'Mong học viện mở thêm các khung giờ học sáng cuối tuần.',
            },
            {
              stars: 1,
              count: 0,
              percentage: 0,
              highlightQuote: 'Chưa ghi nhận đánh giá 1 sao.',
            },
          ];

          return (
            <div className="space-y-6">
              {/* Header + 2 Sub-tabs chuyển đổi chế độ xem */}
              <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Tổng quan học viện</h1>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                    Phân tích tăng trưởng học phí VietQR, tỷ lệ giữ chân học viên giữa các đợt khai giảng và hiệu năng hệ thống AI.
                  </p>
                </div>

                {/* 2 Sub-tabs tách biệt */}
                <div className="inline-flex items-center gap-1.5 p-1.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] shrink-0">
                  <button
                    type="button"
                    onClick={() => setOverviewSubTab('GROWTH_TUITION')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      overviewSubTab === 'GROWTH_TUITION'
                        ? 'bg-[#10B981] text-white shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    1. Tăng trưởng &amp; Học phí
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewSubTab('TRAINING_AI_ANALYTICS')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      overviewSubTab === 'TRAINING_AI_ANALYTICS'
                        ? 'bg-[#10B981] text-white shadow-xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    2. Phân tích Đào tạo &amp; Hiệu quả AI
                  </button>
                </div>
              </div>

              {/* CHẾ ĐỘ XEM 1: TĂNG TRƯỞNG & HỌC PHÍ */}
              {overviewSubTab === 'GROWTH_TUITION' && (
                <div className="space-y-6">
                  {/* 4 thẻ chỉ số KPI chính */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5">
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] font-medium">
                        Tổng số học viên đang học
                      </p>
                      <p className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-[#0F172A] dark:text-white">
                        {(overviewData?.totalStudentsCount ?? 0).toLocaleString('vi-VN')} học viên
                      </p>
                      <p className="text-xs text-[#10B981] font-semibold mt-1">
                        Dữ liệu đồng bộ từ hệ thống
                      </p>
                    </div>

                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5">
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] font-medium">
                        Học phí VietQR thu trong tháng
                      </p>
                      <p className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-[#10B981]">
                        {formatCurrencyVnd(overviewData?.totalRevenueVnd ?? 0)}
                      </p>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                        Đối soát tự động qua SePay Webhook
                      </p>
                    </div>

                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5">
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] font-medium">
                        Số lớp đang vận hành
                      </p>
                      <p className="text-2xl font-bold font-mono tabular-nums mt-1.5">
                        {overviewData?.activeCohortsCount ?? cohorts.length} lớp học
                      </p>
                      <p className="text-xs text-[#10B981] font-semibold mt-1">
                        Theo dõi thời gian thực
                      </p>
                    </div>

                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5">
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] font-medium">
                        Số chứng chỉ số đã cấp
                      </p>
                      <p className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-[#0F172A] dark:text-white">
                        {(overviewData?.issuedCertificatesCount ?? Object.keys(certificates).length).toLocaleString('vi-VN')} chứng chỉ
                      </p>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                        Đạt chuẩn đầu ra của học viện
                      </p>
                    </div>
                  </div>

                  {/* Biểu đồ Kép Kết hợp Cột & Đường (Combo Bar + Line Chart) */}
                  <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          BIỂU ĐỒ KÉP KẾT HỢP CỘT &amp; ĐƯỜNG (COMBO BAR + LINE CHART)
                        </div>
                        <h2 className="text-base sm:text-lg font-bold mt-0.5">
                          Doanh thu học phí VietQR (`orders.amount_vnd`) &amp; Học viên ghi danh mới theo tháng
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Di chuột vào từng tháng để xem chi tiết doanh thu học phí, số lượng học viên mới và tỷ lệ đối soát tự động qua SePay.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                        6 tháng gần nhất · Năm 2026
                      </span>
                    </div>

                    <ComboBarLineChart data={monthlyComboData} />
                  </div>

                  {/* Danh sách các lớp có buổi học trực tuyến trong ngày */}
                  <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold">
                          Các lớp có buổi học trực tuyến hôm nay
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Theo dõi tình trạng vận hành các ca học tối nay của học viện
                        </p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#10B981]">
                        2 ca học tối nay
                      </span>
                    </div>

                    <div className="space-y-3">
                      {[
                        {
                          cohortCode: 'AI-ENG-2026-K01',
                          className: 'Lớp Kỹ Sư AI Thực Chiến — Khóa K01 (Đề cương v2025)',
                          sessionTitle:
                            'Buổi 5: Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa cho Trợ lý AI',
                          timeText: '19:30 - 21:30 hôm nay',
                          instructor: 'TS. Trần Minh Khoa',
                          studentCount: 48,
                        },
                        {
                          cohortCode: 'DATA-ANL-2026-K01',
                          className:
                            'Lớp Phân Tích Dữ Liệu Kinh Doanh — Khóa K01 (Đề cương v2026)',
                          sessionTitle: 'Buổi 3: Thiết kế báo cáo quản trị doanh thu',
                          timeText: '20:00 - 22:00 hôm nay',
                          instructor: 'ThS. Lê Thu Hà',
                          studentCount: 34,
                        },
                      ].map((item) => (
                        <div
                          key={item.cohortCode}
                          className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                                {item.cohortCode}
                              </span>
                              <span className="text-xs text-[#475569] dark:text-[#94A3B8]">·</span>
                              <span className="text-sm font-bold">{item.className}</span>
                            </div>
                            <p className="text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                              {item.sessionTitle}
                            </p>
                            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                              Khung giờ: {item.timeText} · Giảng viên: {item.instructor} · Sĩ số:{' '}
                              {item.studentCount} học viên
                            </p>
                          </div>

                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã sẵn sàng phòng dạy trực tuyến
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* CHẾ ĐỘ XEM 2: PHÂN TÍCH ĐÀO TẠO & HIỆU QUẢ AI */}
              {overviewSubTab === 'TRAINING_AI_ANALYTICS' && (
                <div className="space-y-6">
                  {/* 3 Thẻ thống kê nhanh */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5 space-y-1">
                      <span className="text-[11px] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        MỨC ĐỘ CHUYÊN CẦN CỦA HỌC VIÊN
                      </span>
                      <div className="text-lg font-bold font-mono">
                        Đúng hạn: {enrollmentsList.filter((e) => e.riskLevel === 'LOW').length} · Lưu ý:{' '}
                        {enrollmentsList.filter((e) => e.riskLevel === 'MEDIUM').length} · Cần hỗ trợ:{' '}
                        {enrollmentsList.filter((e) => e.riskLevel === 'HIGH').length}
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Phân loại mức độ chuyên cần và chuyên cần của học viên trên toàn hệ thống.
                      </p>
                    </div>

                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5 space-y-1">
                      <span className="text-[11px] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        CHỦ ĐỀ THẮC MẮC NHIỀU NHẤT
                      </span>
                      <div className="text-lg font-bold">
                        RAG &amp; Vector Search, PostgreSQL &amp; SQL
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        {chatMessagesList.filter((m) => m.detectedTopic !== null).length} chủ đề trọng tâm được học viên đặt câu hỏi và thảo luận nhiều nhất.
                      </p>
                    </div>

                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-5 space-y-1">
                      <span className="text-[11px] font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        HIỆU QUẢ LỜI NHẮC ÔN TẬP
                      </span>
                      <div className="text-lg font-bold font-mono text-[#10B981]">
                        {notificationsList.filter((n) => n.actedAt !== null).length}/
                        {notificationsList.length} HV quay lại học (
                        {notificationsList.length > 0
                          ? Math.round(
                              (notificationsList.filter((n) => n.actedAt !== null).length /
                                notificationsList.length) *
                                100
                            )
                          : 0}
                        %)
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Đã xem thông báo: {notificationsList.filter((n) => n.isRead).length}/
                        {notificationsList.length} lượt nhắc.
                      </p>
                    </div>
                  </div>

                  {/* Hàng 1: Biểu đồ 1 (Cohort Retention & Dropout) & Biểu đồ 2 (AI Token, Questions & Latency) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    {/* Biểu đồ 1: Tỷ lệ Hoàn thành, Giữ chân & Tỷ lệ Bỏ học giữa các Đợt khai giảng */}
                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            1. TỶ LỆ GIỮ CHÂN &amp; TỐT NGHIỆP GIỮA CÁC ĐỢT KHAI GIẢNG
                          </span>
                          <span className="text-[11px] font-mono text-[#059669] dark:text-[#34D399] font-bold">
                            Tỷ lệ giữ chân: 95.9%
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold">
                          So sánh Đang học (`ACTIVE`), Tốt nghiệp (`COMPLETED`) &amp; Bỏ học (`REVOKED`)
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Đối chiếu chất lượng hoàn thành khóa học giữa các đợt mở lớp K01, K02, K04.
                        </p>
                      </div>

                      <StackedBarChart
                        data={cohortRetentionData}
                        unit="HV"
                        segments={[
                          {
                            key: 'active',
                            label: 'Đang theo học (ACTIVE)',
                            color: '#0EA5E9',
                          },
                          {
                            key: 'completed',
                            label: 'Đã tốt nghiệp (COMPLETED)',
                            color: '#10B981',
                          },
                          {
                            key: 'revoked',
                            label: 'Bảo lưu / Bỏ học (REVOKED)',
                            color: '#EF4444',
                          },
                        ]}
                      />
                    </div>

                    {/* Biểu đồ 2: Hoạt động & Hiệu năng Hệ thống AI (AI Token, Questions & Latency Chart) */}
                    <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                            2. HOẠT ĐỘNG &amp; HIỆU NĂNG HỆ THỐNG AI THEO TUẦN
                          </span>
                          <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                            Độ trễ TB: 515 ms
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold">
                          Số câu hỏi giải đáp, Lượt luyện phỏng vấn &amp; Tốc độ phản hồi
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Thống kê số câu hỏi giải đáp theo tuần, số buổi luyện phỏng vấn và tốc độ phản hồi trung bình của hệ thống.
                        </p>
                      </div>

                      <SmoothAreaLineChart
                        data={aiSystemWeeklyData}
                        thresholdValue={undefined}
                        minY={800}
                        maxY={2600}
                        unit=" câu"
                        secondaryUnit="ms"
                        primarySeriesLabel="Câu hỏi giải đáp"
                        secondarySeriesLabel="Độ trễ phản hồi (ms)"
                      />

                      <div className="pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span>Tổng cộng 1.859 buổi luyện phỏng vấn giọng nói đã thực hiện.</span>
                        <span className="font-mono font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
                          99.4% phản hồi &lt; 800ms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hàng 2: Biểu đồ 3 — Đánh giá Khóa học (course_reviews.rating) */}
                  <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                          3. PHÂN BỔ ĐÁNH GIÁ KHÓA HỌC (`course_reviews.rating` 1 – 5 SAO)
                        </div>
                        <h2 className="text-base sm:text-lg font-bold mt-0.5">
                          Mức độ hài lòng của học viên sau khi hoàn thành khóa học
                        </h2>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Di chuột vào từng mức sao để xem số lượng đánh giá và trích dẫn nhận xét tiêu biểu của học viên.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        97% đánh giá 4 – 5 sao
                      </span>
                    </div>

                    <CourseRatingDistributionChart
                      items={ratingDistribution}
                      averageRating={4.9}
                      totalReviews={398}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* =========================================================
            2. CHƯƠNG TRÌNH ĐÀO TẠO & PHIÊN BẢN ĐỀ CƯƠNG THEO NĂM HỌC (/admin/courses)
           ========================================================= */}
        {adminSidebarTab === 'CURRICULUM' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Chương trình đào tạo &amp; Phiên bản Đề cương theo Năm học
                </h1>
                <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                  Admin là người duy nhất thiết lập tên các buổi học, thứ tự buổi học và quản lý phiên bản đề cương riêng cho từng đợt mở lớp (Phiên bản 2025 vs Phiên bản 2026 mới).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateCourseForm((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tạo chương trình đào tạo gốc mới
              </button>
            </div>

            {courseSavedNotice && (
              <div className="p-4 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{courseSavedNotice}</span>
              </div>
            )}

            {/* Form tạo mới chương trình gốc */}
            {showCreateCourseForm && (
              <form
                onSubmit={handleSaveNewCourse}
                className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#10B981] p-6 space-y-4"
              >
                <h2 className="text-base font-bold">Tạo chương trình đào tạo gốc mới</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Tên khóa học gốc</label>
                    <input
                      type="text"
                      required
                      value={courseFormTitle}
                      onChange={(e) => setCourseFormTitle(e.target.value)}
                      placeholder="VD: Kỹ Sư Dữ Liệu Lớn & Tự Động Hóa"
                      className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Danh mục đào tạo</label>
                    <select
                      value={courseFormCategory}
                      onChange={(e) => setCourseFormCategory(e.target.value as CourseCategory)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                    >
                      <option value="AI & Dữ liệu">AI &amp; Dữ liệu</option>
                      <option value="Kỹ thuật Phần mềm & Cloud">
                        Kỹ thuật Phần mềm &amp; Cloud
                      </option>
                      <option value="Phân tích Dữ liệu">Phân tích Dữ liệu</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Mô tả ngắn</label>
                  <input
                    type="text"
                    value={courseFormDesc}
                    onChange={(e) => setCourseFormDesc(e.target.value)}
                    placeholder="Tóm tắt mục tiêu đào tạo..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Nhóm kỹ năng đầu ra (phân cách bằng dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={courseFormSkills}
                    onChange={(e) => setCourseFormSkills(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateCourseForm(false)}
                    className="px-4 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#10B981] text-white text-xs font-bold cursor-pointer"
                  >
                    Lưu khóa học gốc
                  </button>
                </div>
              </form>
            )}

            {/* Chọn Khóa học gốc */}
            <div className="flex flex-wrap items-center gap-2">
              {courseCatalog.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => {
                    setSelectedCourseForVersionId(course.id);
                    setActiveVersionId('v2026');
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCourseForVersionId === course.id
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]'
                  }`}
                >
                  {course.title}
                </button>
              ))}
            </div>

            {/* Khung Quản lý Phiên bản Đề cương theo Năm học (Phiên bản 2025 vs Phiên bản 2026 mới) */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                <div className="space-y-1">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                    {currentCourseobj.category}
                  </span>
                  <h2 className="text-xl font-bold mt-1">{currentCourseobj.title}</h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    {currentCourseobj.shortDescription}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCloneNewVersion}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#10B981] text-[#059669] dark:text-[#34D399] hover:bg-[#D1FAE5]/30 text-xs font-bold cursor-pointer"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>Nhân bản tạo Phiên bản Đề cương năm mới</span>
                </button>
              </div>

              {/* Bộ chuyển đổi giữa Phiên bản 2025 (Đợt K01) và Phiên bản 2026 mới (Đợt K02, K03) */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                  Chọn Phiên bản Đề cương theo Đợt mở lớp / Năm học:
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentVersionsList.map((ver) => {
                    const isSelected = ver.versionId === activeVersionObj.versionId;
                    return (
                      <button
                        key={ver.versionId}
                        type="button"
                        onClick={() => {
                          setActiveVersionId(ver.versionId);
                          setEditingSessionOrder(null);
                        }}
                        className={`text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? 'bg-[#D1FAE5]/50 dark:bg-emerald-950/60 border-2 border-[#10B981]'
                            : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#059669] dark:text-[#34D399]">
                            {ver.yearTag} · {ver.sessions.length} buổi học
                          </span>
                          {ver.isLockedHistorical ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8]">
                              <Lock className="w-3 h-3" />
                              Bảo toàn cho Khóa K01 cũ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-[#10B981] text-white">
                              <Edit3 className="w-3 h-3" />
                              Cho phép sửa &amp; thêm buổi mới
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {ver.versionLabel}
                        </div>
                        <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          {ver.appliedCohortsText}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Danh sách các Buổi học trong Phiên bản Đề cương đang chọn */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold">
                      Chi tiết Đề cương: {activeVersionObj.versionLabel} ({activeVersionObj.sessions.length} buổi)
                    </h3>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      {activeVersionObj.isLockedHistorical
                        ? 'Phiên bản năm 2025 của Đợt K01 được khóa cố định để học viên cũ xem lại lịch sử học tập không bị xáo trộn.'
                        : 'Bạn đang ở Phiên bản 2026 mới (Áp dụng cho Đợt K02, K03): Có thể sửa tên buổi học, đổi thứ tự buổi hoặc thêm buổi học mới hoàn toàn độc lập với Đợt K01.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {activeVersionObj.sessions.map((item, idx) => (
                    <div
                      key={item.order}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                            Buổi {item.order}
                          </span>
                          {editingSessionOrder === item.order ? (
                            <div className="flex-1 flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={editingSessionTitleVal}
                                onChange={(e) => setEditingSessionTitleVal(e.target.value)}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#10B981] text-xs sm:text-sm font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditedSessionTitle(item.order)}
                                className="px-3 py-1.5 rounded-lg bg-[#10B981] text-white text-xs font-bold cursor-pointer"
                              >
                                Lưu tên buổi
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSessionOrder(null)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] text-xs cursor-pointer"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                              {item.title}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          {item.summary}
                        </p>
                      </div>

                      {!activeVersionObj.isLockedHistorical && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSessionOrder(item.order);
                              setEditingSessionTitleVal(item.title);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>Sửa tên buổi</span>
                          </button>

                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSessionOrder(idx, 'UP')}
                            title="Đẩy thứ tự buổi học lên"
                            className="p-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] disabled:opacity-40 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={idx === activeVersionObj.sessions.length - 1}
                            onClick={() => handleMoveSessionOrder(idx, 'DOWN')}
                            title="Hạ thứ tự buổi học xuống"
                            className="p-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] disabled:opacity-40 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Form Thêm buổi học mới riêng cho Phiên bản 2026 */}
                {!activeVersionObj.isLockedHistorical && (
                  <form
                    onSubmit={handleAddSessionToVersion}
                    className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981]/60 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-[#059669] dark:text-[#34D399]">
                      <Plus className="w-4 h-4" />
                      <span>
                        Thêm buổi học mới vào {activeVersionObj.versionLabel} (Độc lập với Đợt K01 năm 2025)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        value={newSessionTitleInput}
                        onChange={(e) => setNewSessionTitleInput(e.target.value)}
                        placeholder={`Tên Buổi ${activeVersionObj.sessions.length + 1} mới (VD: Tích hợp công cụ tự động hóa mới 2026)...`}
                        className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSessionSummaryInput}
                          onChange={(e) => setNewSessionSummaryInput(e.target.value)}
                          placeholder="Tóm tắt trọng tâm buổi học..."
                          className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shrink-0 cursor-pointer"
                        >
                          Thêm buổi học
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            3. MỞ LỚP KHAI GIẢNG (/admin/cohorts) — GÁN PHIÊN BẢN ĐỀ CƯƠNG THEO ĐỢT
           ========================================================= */}
        {adminSidebarTab === 'COHORTS' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Mở lớp khai giảng theo Phiên bản Đề cương</h1>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                Tạo các đợt mở lớp mới (Khóa K01, Khóa K02...) và chọn Phiên bản Đề cương năm học áp dụng riêng cho từng đợt mở lớp.
              </p>
            </div>

            <form
              onSubmit={handleCreateCohort}
              className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#10B981]" />
                <h2 className="text-base font-bold">
                  Tạo đợt mở lớp mới &amp; Chọn Phiên bản Đề cương áp dụng
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Chương trình đào tạo gốc
                  </label>
                  <select
                    value={newCohortCourseId}
                    onChange={(e) => setNewCohortCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  >
                    {courseCatalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Phiên bản Đề cương năm học áp dụng
                  </label>
                  <select
                    value={newCohortCurriculumVersion}
                    onChange={(e) => setNewCohortCurriculumVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#10B981] bg-[#D1FAE5]/30 dark:bg-emerald-950/40 text-xs sm:text-sm font-bold text-[#065F46] dark:text-[#34D399]"
                  >
                    <option value="Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)">
                      Phiên bản 2026 mới (v2026 — Cập nhật công nghệ mới)
                    </option>
                    <option value="Phiên bản 2025 (v2025 — 6 buổi chuẩn khóa K01)">
                      Phiên bản 2025 (v2025 — Giữ nguyên chuẩn khóa K01)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Mã lớp học</label>
                  <input
                    type="text"
                    value={newCohortCode}
                    onChange={(e) => setNewCohortCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Tên đợt mở lớp</label>
                  <input
                    type="text"
                    value={newCohortName}
                    onChange={(e) => setNewCohortName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Mức học phí (VNĐ)</label>
                  <input
                    type="number"
                    value={newCohortTuition}
                    onChange={(e) => setNewCohortTuition(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Ngày mở đăng ký</label>
                  <input
                    type="text"
                    value={newCohortOpenRegDate}
                    onChange={(e) => setNewCohortOpenRegDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Ngày khai giảng</label>
                  <input
                    type="text"
                    value={newCohortStart}
                    onChange={(e) => setNewCohortStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Giảng viên phụ trách chính</label>
                  <select
                    value={newCohortInstructor}
                    onChange={(e) => setNewCohortInstructor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                  >
                    {instructorAccounts.length > 0 ? (
                      instructorAccounts.map((inst) => (
                        <option key={inst.id} value={inst.fullName}>
                          {inst.fullName}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="TS. Trần Minh Khoa">TS. Trần Minh Khoa</option>
                        <option value="ThS. Lê Thu Hà">ThS. Lê Thu Hà</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* BỘ THIẾT LẬP CA HỌC TRONG TUẦN (SCHEDULE SLOTS BUILDER — POSTGRESQL JSONB) */}
              <div className="p-5 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981]/40 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      SCHEDULE SLOTS BUILDER (`cohorts.schedule_slots` JSONB)
                    </div>
                    <h3 className="text-sm sm:text-base font-bold mt-0.5">
                      Thiết lập các Ca học trong tuần (Hỗ trợ khung giờ khác nhau cho từng Thứ)
                    </h3>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Chọn Thứ trong tuần, Giờ bắt đầu (<code className="font-mono">startTime</code>) và Giờ kết thúc (<code className="font-mono">endTime</code>) riêng biệt cho từng buổi học.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddScheduleSlot}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm buổi học trong tuần</span>
                  </button>
                </div>

                {/* Các mẫu chọn nhanh (Presets) */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    Mẫu nhanh:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewCohortScheduleSlots([
                        { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
                        { dayOfWeek: 5, startTime: '16:30', endTime: '18:30' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold cursor-pointer"
                  >
                    Khác giờ: Thứ 2 (19:30 - 21:30) · Thứ 6 (16:30 - 18:30)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNewCohortScheduleSlots([
                        { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
                        { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold cursor-pointer"
                  >
                    Cùng giờ: Thứ 3 &amp; Thứ 7 (19:30 - 21:30)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNewCohortScheduleSlots([
                        { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
                        { dayOfWeek: 0, startTime: '15:00', endTime: '17:00' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold cursor-pointer"
                  >
                    Cuối tuần: Thứ 4 (19:30 - 21:30) · Chủ Nhật (15:00 - 17:00)
                  </button>
                </div>

                {/* Danh sách từng dòng ca học trong tuần */}
                <div className="space-y-2.5">
                  {newCohortScheduleSlots.map((slot, idx) => (
                    <div
                      key={`${slot.dayOfWeek}-${idx}`}
                      className="p-3 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                          Buổi {idx + 1} · Thứ trong tuần
                        </label>
                        <select
                          aria-label={`Chọn thứ cho buổi ${idx + 1}`}
                          value={slot.dayOfWeek}
                          onChange={(e) =>
                            handleUpdateScheduleSlot(idx, {
                              dayOfWeek: Number(
                                e.target.value
                              ) as CohortScheduleSlot['dayOfWeek'],
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs font-bold"
                        >
                          <option value={1}>Thứ 2 (dayOfWeek = 1)</option>
                          <option value={2}>Thứ 3 (dayOfWeek = 2)</option>
                          <option value={3}>Thứ 4 (dayOfWeek = 3)</option>
                          <option value={4}>Thứ 5 (dayOfWeek = 4)</option>
                          <option value={5}>Thứ 6 (dayOfWeek = 5)</option>
                          <option value={6}>Thứ 7 (dayOfWeek = 6)</option>
                          <option value={0}>Chủ Nhật (dayOfWeek = 0)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                          Giờ bắt đầu (`startTime`)
                        </label>
                        <input
                          type="time"
                          aria-label={`Giờ bắt đầu buổi ${idx + 1}`}
                          value={slot.startTime}
                          onChange={(e) =>
                            handleUpdateScheduleSlot(idx, { startTime: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs font-mono font-bold"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                          Giờ kết thúc (`endTime`)
                        </label>
                        <input
                          type="time"
                          aria-label={`Giờ kết thúc buổi ${idx + 1}`}
                          value={slot.endTime}
                          onChange={(e) =>
                            handleUpdateScheduleSlot(idx, { endTime: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs font-mono font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2 flex sm:justify-end pt-2 sm:pt-4">
                        <button
                          type="button"
                          disabled={newCohortScheduleSlots.length <= 1}
                          onClick={() => handleRemoveScheduleSlot(idx)}
                          className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                            newCohortScheduleSlots.length <= 1
                              ? 'opacity-40 cursor-not-allowed text-[#475569]'
                              : 'bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dòng xem trước kết quả từ formatScheduleSlots(scheduleSlots) */}
                <div className="p-3.5 rounded-xl bg-[#D1FAE5]/40 dark:bg-emerald-950/40 border border-[#10B981]/40 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-4 h-4 text-[#059669] dark:text-[#34D399] shrink-0" />
                    <span className="text-[#475569] dark:text-[#94A3B8]">
                      Xem trước chuỗi hiển thị (`formatScheduleSlots`):
                    </span>
                    <strong className="text-[#065F46] dark:text-[#34D399] font-bold">
                      {formatScheduleSlots(newCohortScheduleSlots)}
                    </strong>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {newCohortScheduleSlots.map((s, i) => (
                      <span
                        key={`${s.dayOfWeek}-${i}`}
                        className="px-2 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#10B981]/40 text-[11px] font-mono font-semibold text-[#065F46] dark:text-[#34D399]"
                      >
                        {getDayOfWeekLabel(s.dayOfWeek)}: {s.startTime} - {s.endTime}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {cohortCreatedNotice ? (
                  <p className="text-xs font-bold text-[#059669] dark:text-[#34D399]">
                    ✓ {cohortCreatedNotice}
                  </p>
                ) : (
                  <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    {editingCohortScheduleId
                      ? `Đang chỉnh sửa lịch học (scheduleSlots) cho lớp ${newCohortCode}.`
                      : 'Lưu mảng scheduleSlots chuẩn JSONB xuống hệ thống và tự động kiểm tra xung đột ca học.'}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  {editingCohortScheduleId && (
                    <button
                      type="button"
                      onClick={() => setEditingCohortScheduleId(null)}
                      className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-bold cursor-pointer"
                    >
                      Hủy chỉnh sửa
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                  >
                    {editingCohortScheduleId
                      ? 'Lưu cập nhật Ca học (scheduleSlots)'
                      : 'Tạo đợt mở lớp'}
                  </button>
                </div>
              </div>
            </form>

            {/* Danh sách các đợt mở lớp kèm Phiên bản Đề cương & Thẻ Ca Học (scheduleSlots) */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-3">
              <h2 className="text-base font-bold">
                Danh sách các đợt mở lớp &amp; Các ca học trong tuần (`scheduleSlots` — {cohorts.length} lớp)
              </h2>

              <div className="space-y-3">
                {cohorts.map((c, idx) => {
                  const mainInstructor =
                    c.staff.find((s) => s.role === 'INSTRUCTOR')?.fullName ?? 'TS. Trần Minh Khoa';
                  const versionBadge =
                    c.code.includes('K01') && idx === 0
                      ? 'Phiên bản 2025 (v2025 — 6 buổi cố định)'
                      : 'Phiên bản 2026 mới (v2026 — Đã cập nhật buổi học mới)';
                  const formattedSlotsText = formatScheduleSlots(c.scheduleSlots);

                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                            {c.code}
                          </span>
                          <span className="text-sm font-bold">{c.name}</span>
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#10B981]/50 text-[#059669] dark:text-[#34D399]">
                            {versionBadge}
                          </span>
                        </div>

                        {/* Các thẻ ca học trực quan từ cohort.scheduleSlots */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            Ca học trong tuần:
                          </span>
                          {c.scheduleSlots?.map((slot, sIdx) => (
                            <span
                              key={`${c.id}-slot-${sIdx}`}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white dark:bg-[#111A15] border border-[#10B981]/40 text-xs font-mono font-semibold text-[#065F46] dark:text-[#34D399]"
                            >
                              <Clock className="w-3 h-3 text-[#10B981]" />
                              <span>
                                {getDayOfWeekLabel(slot.dayOfWeek)} ({slot.startTime} - {slot.endTime})
                              </span>
                            </span>
                          ))}
                          <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            ➔ <strong>{formattedSlotsText}</strong>
                          </span>
                        </div>

                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          Khai giảng: <strong>{c.startDate}</strong> · Giảng viên phụ trách:{' '}
                          <strong>{mainInstructor}</strong> ({c.instructorId}) · Sĩ số:{' '}
                          {c.enrolledCount} học viên
                        </p>
                      </div>

                      <div className="text-right space-y-1.5">
                        <p className="font-mono text-sm font-bold text-[#10B981]">
                          {formatCurrencyVnd(c.tuitionVnd)}
                        </p>
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCohortScheduleId(c.id);
                              setNewCohortCourseId(c.courseId);
                              setNewCohortCode(c.code);
                              setNewCohortName(c.name);
                              setNewCohortTuition(c.tuitionVnd);
                              setNewCohortStart(c.startDate);
                              setNewCohortScheduleSlots(
                                c.scheduleSlots && c.scheduleSlots.length > 0
                                  ? c.scheduleSlots.map((s) => ({ ...s }))
                                  : [
                                      { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
                                      { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
                                    ]
                              );
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Chỉnh sửa ca học (`scheduleSlots`)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminSidebarTab('CURRICULUM');
                              setActiveVersionId(
                                c.code.includes('K01') && idx === 0 ? 'v2025' : 'v2026'
                              );
                              navigate('/admin/courses');
                            }}
                            className="text-[11px] font-bold text-[#475569] dark:text-[#94A3B8] hover:text-[#059669] dark:hover:text-[#34D399] hover:underline cursor-pointer"
                          >
                            Xem / Chỉnh sửa phiên bản đề cương →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            5. HỌC VIÊN, GIẢNG VIÊN & QUẢN TRỊ VIÊN (/admin/users)
           ========================================================= */}
        {adminSidebarTab === 'USERS_STAFF' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Học viên, Giảng viên &amp; Quản trị viên</h1>
                <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                  Quản lý và cấp quyền truy cập tài khoản toàn hệ thống cho học viên, giảng viên và quản trị viên.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAddAccountModal((prev) => !prev);
                  setFormValidationError(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>Thêm tài khoản mới</span>
              </button>
            </div>

            {accountNotice && (
              <div className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{accountNotice}</span>
              </div>
            )}

            {/* Form thêm tài khoản mới (Học viên, Giảng viên, Quản trị viên) */}
            {showAddAccountModal && (
              <form
                onSubmit={handleCreateAccount}
                className="bg-white dark:bg-[#111A15] rounded-2xl border-2 border-[#10B981] p-6 space-y-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Khởi tạo tài khoản hệ thống mới
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                      Điền thông tin để tạo tài khoản mới. Các trường có dấu (<span className="text-red-500 font-bold">*</span>) là bắt buộc.
                    </p>
                  </div>

                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                    Tài khoản nội bộ
                  </span>
                </div>

                {/* Chọn vai trò (STUDENT, INSTRUCTOR, ADMIN) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Chọn vai trò tài khoản <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('STUDENT');
                        if (formInterviewCredits === 99) setFormInterviewCredits(2);
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        formRole === 'STUDENT'
                          ? 'border-[#10B981] bg-[#10B981]/10 text-[#065F46] dark:text-[#34D399] ring-1 ring-[#10B981]'
                          : 'border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8] hover:border-[#10B981]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                        <GraduationCap className="w-4 h-4 text-[#10B981]" />
                        <span>Học viên</span>
                      </div>
                      <p className="text-[11px] mt-1 text-[#64748B] dark:text-[#94A3B8]">
                        Tài khoản người học, nhận lượt phỏng vấn và nộp bài tập.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('INSTRUCTOR');
                        setFormInterviewCredits(99);
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        formRole === 'INSTRUCTOR'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                          : 'border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8] hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                        <Users className="w-4 h-4 text-blue-500" />
                        <span>Giảng viên</span>
                      </div>
                      <p className="text-[11px] mt-1 text-[#64748B] dark:text-[#94A3B8]">
                        Giảng dạy trực tuyến, quản lý lớp và tạo bài kiểm tra.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('ADMIN');
                        setFormInterviewCredits(99);
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        formRole === 'ADMIN'
                          ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500'
                          : 'border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8] hover:border-purple-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                        <Shield className="w-4 h-4 text-purple-500" />
                        <span>Quản trị viên</span>
                      </div>
                      <p className="text-[11px] mt-1 text-[#64748B] dark:text-[#94A3B8]">
                        Quản lý toàn bộ học viện, duyệt chứng chỉ và tài chính.
                      </p>
                    </button>
                  </div>
                </div>

                {/* 1. Thông tin đăng nhập */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                    1. Thông tin đăng nhập
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Email đăng nhập <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="VD: hocvien.ai@3tacademy.vn"
                        className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm focus:outline-none focus:border-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Mật khẩu khởi tạo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="Mật khẩu đăng nhập ban đầu"
                        className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm font-mono focus:outline-none focus:border-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Họ và tên <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formFullName}
                        onChange={(e) => setFormFullName(e.target.value)}
                        placeholder="VD: Nguyễn Văn An / TS. Trần Minh Khoa"
                        className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Thông tin cá nhân (Tùy chọn) */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                    2. Thông tin cá nhân (Tùy chọn)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className={formRole === 'STUDENT' ? '' : 'sm:col-span-2'}>
                      <label className="block text-xs font-semibold mb-1">
                        Ảnh đại diện URL
                      </label>
                      <input
                        type="url"
                        value={formAvatarUrl}
                        onChange={(e) => setFormAvatarUrl(e.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                        className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                      />
                    </div>

                    {/* Chỉ học viên mới có Mục tiêu nghề nghiệp & Số lượt phỏng vấn AI */}
                    {formRole === 'STUDENT' && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Mục tiêu nghề nghiệp
                          </label>
                          <input
                            type="text"
                            value={formCareerGoal}
                            onChange={(e) => setFormCareerGoal(e.target.value)}
                            placeholder="VD: Kỹ sư AI Thực chiến, Backend Python..."
                            className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Lượt phỏng vấn AI khởi tạo
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formInterviewCredits}
                            onChange={(e) =>
                              setFormInterviewCredits(
                                Math.max(0, parseInt(e.target.value) || 0)
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Giới thiệu bản thân
                    </label>
                    <textarea
                      rows={2}
                      value={formBio}
                      onChange={(e) => setFormBio(e.target.value)}
                      placeholder="Mô tả tóm tắt kinh nghiệm hoặc định hướng..."
                      className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-sm resize-none"
                    />
                  </div>
                </div>

                {/* 3. Thông tin chuyên môn Giảng viên (Chỉ hiển thị khi chọn Giảng viên) */}
                {formRole === 'INSTRUCTOR' && (
                  <div className="space-y-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/30">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span>3. Thông tin chuyên môn Giảng viên</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold mb-1">
                          Tiêu đề / Chức danh chuyên môn <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formHeadline}
                          onChange={(e) => setFormHeadline(e.target.value)}
                          placeholder="VD: Kỹ sư Trưởng AI &amp; Xử lý ngôn ngữ tự nhiên"
                          className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Số năm kinh nghiệm
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formYearsOfExp}
                          onChange={(e) => setFormYearsOfExp(e.target.value)}
                          placeholder="VD: 8"
                          className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Đơn vị công tác
                        </label>
                        <input
                          type="text"
                          value={formOrganization}
                          onChange={(e) => setFormOrganization(e.target.value)}
                          placeholder="VD: 3T Academy, Viện Công nghệ AI..."
                          className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Liên kết LinkedIn
                        </label>
                        <input
                          type="text"
                          value={formLinkedin}
                          onChange={(e) => setFormLinkedin(e.target.value)}
                          placeholder="linkedin.com/in/giangvien"
                          className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Liên kết GitHub
                        </label>
                        <input
                          type="text"
                          value={formGithub}
                          onChange={(e) => setFormGithub(e.target.value)}
                          placeholder="github.com/giangvien"
                          className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Tóm tắt chuyên môn
                      </label>
                      <textarea
                        rows={2}
                        value={formExpertiseSummary}
                        onChange={(e) => setFormExpertiseSummary(e.target.value)}
                        placeholder="Tóm tắt công trình nghiên cứu, kinh nghiệm đào tạo thực tế..."
                        className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#090F0C] text-sm resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Ghi chú về quy trình phân công lớp */}
                <div className="p-3.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Lưu ý:
                  </span>{' '}
                  Tài khoản mới sẽ có trạng thái <em>&quot;Chưa phân công lớp&quot;</em>. Bạn có thể phân công giảng dạy hoặc xếp lớp cho học viên sau tại mục <strong>&quot;Quản lý Đợt học&quot;</strong>.
                </div>

                {formValidationError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formValidationError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetAddAccountForm}
                    className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:bg-[#F7FBF9] dark:hover:bg-[#090F0C] cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAccount}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSubmittingAccount ? 'Đang tạo...' : 'Tạo tài khoản'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Bộ lọc vai trò + Tìm kiếm */}
            <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'ALL', label: 'Tất cả vai trò' },
                      { id: 'Học viên', label: 'Học viên' },
                      { id: 'Giảng viên', label: 'Giảng viên' },
                      { id: 'Quản trị viên', label: 'Quản trị viên' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRoleFilter(tab.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        roleFilter === tab.id
                          ? 'bg-[#10B981] text-white'
                          : 'bg-[#F7FBF9] dark:bg-[#090F0C] text-[#475569] dark:text-[#94A3B8] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Tìm theo tên, email, lớp..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs focus:outline-none focus:border-[#10B981]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredAccounts.map((acc) => {
                  const isTeacher = acc.roleCategory === 'Giảng viên';
                  const isAdmin = acc.roleCategory === 'Quản trị viên';
                  const badgeColor = isAdmin
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                    : isTeacher
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                    : 'bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] border-emerald-500/20';

                  return (
                    <div
                      key={acc.id}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4 transition-colors"
                    >
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                            {acc.fullName}
                          </span>
                          <span className="text-xs text-[#475569] dark:text-[#94A3B8] font-mono">
                            ({acc.email})
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${badgeColor}`}
                          >
                            {acc.roleDetail || acc.roleCategory}
                          </span>
                          {acc.locked && (
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                              Đang bị khóa
                            </span>
                          )}
                        </div>

                        {/* Chi tiết chức danh chuyên môn hoặc mục tiêu */}
                        {acc.instructorHeadline && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Chức danh: {acc.instructorHeadline}
                            {acc.instructorOrganization ? ` · ${acc.instructorOrganization}` : ''}
                            {acc.instructorYearsOfExperience ? ` (${acc.instructorYearsOfExperience} năm KN)` : ''}
                          </p>
                        )}
                        {acc.careerGoal && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Mục tiêu nghề nghiệp: {acc.careerGoal}
                          </p>
                        )}

                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                          Lớp phụ trách / theo học: <span className="font-semibold">{acc.cohortAssigned}</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleLockAccount(acc.id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                          acc.locked
                            ? 'bg-[#10B981] hover:bg-[#059669] text-white shadow-xs'
                            : 'border border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#111A15] text-[#475569] dark:text-[#94A3B8] hover:border-red-400 hover:text-red-600'
                        }`}
                      >
                        {acc.locked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Mở khóa tài khoản</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Khóa tài khoản</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            6. HỌC PHÍ & CHỨNG CHỈ (/admin/finance)
           ========================================================= */}
        {(adminSidebarTab === 'TUITION_RECONCILIATION' ||
          adminSidebarTab === 'ISSUE_CERTIFICATES') && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Học phí &amp; Chứng chỉ</h1>
                <p className="text-sm text-[#475569] dark:text-[#94A3B8] mt-1">
                  Theo dõi học phí chuyển khoản qua mã QR và duyệt cấp chứng chỉ tốt nghiệp cho học viên đủ điều kiện.
                </p>
              </div>

              {/* 2 Sub-tabs */}
              <div className="inline-flex p-1 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
                <button
                  type="button"
                  onClick={() => setFinanceSubTab('TUITION')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    financeSubTab === 'TUITION'
                      ? 'bg-[#10B981] text-white'
                      : 'text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  Quản lý Học phí
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceSubTab('CERTIFICATES')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    financeSubTab === 'CERTIFICATES'
                      ? 'bg-[#10B981] text-white'
                      : 'text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  Cấp Chứng chỉ tốt nghiệp
                </button>
              </div>
            </div>

            {/* SUB-TAB 1: QUẢN LÝ HỌC PHÍ */}
            {financeSubTab === 'TUITION' && (
              <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold">
                      Danh sách đơn đăng ký khóa học &amp; Lịch sử đóng học phí qua mã QR
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Các giao dịch chuyển khoản học phí đã được hệ thống xác nhận tự động
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={receiptSearch}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      placeholder="Tìm theo mã đơn, mã lớp..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredReceipts.map((r) => (
                    <div
                      key={r.orderCode}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                            Mã đơn: {r.orderCode}
                          </span>
                          <span className="text-xs font-mono text-[#475569] dark:text-[#94A3B8]">
                            Mã GD ngân hàng: {r.transactionRef}
                          </span>
                        </div>
                        <p className="text-sm font-bold mt-1">
                          {r.courseTitle} ({r.cohortCode})
                        </p>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                          {r.bankName} · Thanh toán lúc: {r.paidAt}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-mono text-base font-bold text-[#10B981]">
                          {formatCurrencyVnd(r.amountVnd)}
                        </p>
                        <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                          ✓ Đã xác nhận &amp; mở lớp học
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: CẤP CHỨNG CHỈ TỐT NGHIỆP */}
            {financeSubTab === 'CERTIFICATES' && (
              <div className="space-y-6">
                {certIssuedToast && (
                  <div className="p-4 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{certIssuedToast}</span>
                  </div>
                )}

                {/* Danh sách học viên đủ điều kiện tốt nghiệp chờ cấp chứng chỉ */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold">
                        Danh sách học viên đủ điều kiện cấp Chứng chỉ tốt nghiệp
                      </h2>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        Các học viên dưới đây đã hoàn thành đủ các buổi học và vượt qua bài thi cuối khóa
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={pendingGraduateCount === 0}
                      onClick={handleBatchIssueCertificates}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                        pendingGraduateCount > 0
                          ? 'bg-[#10B981] hover:bg-[#059669] text-white'
                          : 'bg-[#E2ECE7] dark:bg-[#1E2D24] text-[#94A3B8] cursor-not-allowed'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      Duyệt cấp chứng chỉ hàng loạt ({pendingGraduateCount})
                    </button>
                  </div>

                  <div className="space-y-3">
                    {eligibleGraduates.map((grad) => (
                      <div
                        key={grad.id}
                        className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">{grad.studentName}</span>
                            <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
                              ({grad.studentEmail})
                            </span>
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                              {grad.cohortCode}
                            </span>
                          </div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                            {grad.courseTitle} · Tiến độ: <strong>{grad.completedSessionsText}</strong> · Điểm thi cuối khóa:{' '}
                            <strong className="text-[#10B981]">{grad.finalExamScore}/100</strong>
                          </p>
                        </div>

                        <div>
                          {grad.issuedCertCode ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399] text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã cấp ({grad.issuedCertCode})
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleIssueSingleCertificate(grad)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                            >
                              <Award className="w-3.5 h-3.5" />
                              Cấp chứng chỉ
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Danh sách chứng chỉ đã cấp */}
                <div className="bg-white dark:bg-[#111A15] rounded-2xl border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-3">
                  <h2 className="text-base font-bold">
                    Chứng chỉ tốt nghiệp đã cấp ({Object.keys(certificates).length})
                  </h2>
                  {Object.values(certificates).map((cert) => (
                    <div
                      key={cert.certificateCode}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-[#065F46]/40 text-[#065F46] dark:text-[#34D399]">
                            {cert.certificateCode}
                          </span>
                          <span className="text-sm font-bold">{cert.studentName}</span>
                          <span className="text-xs font-mono font-bold text-[#10B981]">
                            Điểm tổng kết: {cert.finalScore}/100
                          </span>
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
                          {cert.courseTitle} ({cert.cohortCode}) · Ngày cấp: {cert.issuedAt}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono font-semibold text-[#059669] dark:text-[#34D399]">
                          {cert.isRevoked ? 'Đang tạm thu hồi' : 'Hiệu lực hợp lệ'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCertificateRevoke(cert.certificateCode)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                            cert.isRevoked
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#EF4444]/10 text-[#EF4444]'
                          }`}
                        >
                          {cert.isRevoked ? 'Khôi phục hiệu lực' : 'Tạm thu hồi'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
