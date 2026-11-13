import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Course,
  Cohort,
  CohortScheduleSlot,
  ClassSession,
  AppRole,
  UpcomingTaskItem,
  DiscussionThread,
  CohortMaterial,
  CertificateRecord,
  OrderReceipt,
  CourseSkill,
  CourseCategoryItem,
} from '../types/domain';
import {
  evaluateSessionQuizAndUnlock,
  QuizEvaluationOutput,
  updateSessionWatchPosition,
} from '../utils/academyLogic';
import { AVATAR_MINH_KHOA } from '../components/BotanicalStickers';
import { authApi, AuthUserProfile } from '../services/auth.api';
import { API_CONFIG, getAuthAccessToken, setAuthAccessToken } from '../services/apiClient';
import { catalogApi } from '../services/catalog.api';
import { learningApi } from '../services/learning.api';
import { orderApi } from '../services/order.api';
import { teachApi } from '../services/teach.api';
import { adminApi } from '../services/admin.api';

export type StudentSidebarTab =
  | 'TODAY'
  | 'MY_COHORTS'
  | 'PROFILE_CV'
  | 'MOCK_INTERVIEW'
  | 'SKILL_MAP'
  | 'AI_CHAT_HISTORY'
  | 'CERTIFICATES_ORDERS'
  | 'SETTINGS';

export type InstructorSidebarTab =
  | 'LIVE_SCHEDULE'
  | 'MANAGE_COHORTS'
  | 'CLASS_ANALYTICS'
  | 'AI_GRADING'
  | 'QUIZ_BUILDER'
  | 'STUDENT_QA'
  | 'AVAILABILITY';

export type AdminSidebarTab =
  | 'OVERVIEW'
  | 'CURRICULUM'
  | 'COHORTS'
  | 'SMART_SCHEDULER'
  | 'USERS_STAFF'
  | 'TUITION_RECONCILIATION'
  | 'ISSUE_CERTIFICATES';

interface AcademyContextValue {
  currentPath: string;
  navigate: (path: string) => void;
  role: AppRole;
  setRole: (role: AppRole) => void;
  currentUser: AuthUserProfile | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<AuthUserProfile | null>>;
  refreshEnrollments: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  courses: Course[];
  categories: CourseCategoryItem[];
  skills: CourseSkill[];
  cohorts: Cohort[];
  createCohort: (newCohort: {
    courseId: string;
    instructorId?: string;
    code: string;
    name: string;
    curriculumVersion?: string;
    tuitionVnd: number;
    startDate: string;
    scheduleSlots: CohortScheduleSlot[];
    instructorName: string;
  }) => void;
  updateCohortSchedule: (cohortId: string, scheduleSlots: CohortScheduleSlot[]) => void;
  sessions: ClassSession[];
  rescheduleSession: (sessionId: string, newDateText: string) => void;
  updateSessionDetails: (
    sessionId: string,
    updates: { title?: string; aiSummaryMd?: string }
  ) => void;
  addAiGeneratedQuizToSession: (sessionId: string) => void;
  enrolledCohortIds: string[];
  enrollInCohort: (cohortCode: string) => OrderReceipt | null;
  submitSessionQuiz: (sessionId: string, answers: number[]) => QuizEvaluationOutput | null;
  updateWatchSec: (sessionId: string, sec: number) => void;
  updateVideoProgress: (sessionId: string, sec: number) => Promise<void>;
  upcomingTasks: UpcomingTaskItem[];
  discussions: DiscussionThread[];
  addDiscussionQuestion: (
    cohortId: string,
    sessionOrder: number,
    timestampLabel: string,
    title: string,
    body: string
  ) => void;
  createDiscussionQuestion: (
    cohortId: string,
    sessionOrder: number,
    timestampLabel: string,
    title: string,
    body: string
  ) => Promise<void>;
  replyToDiscussionAsStaff: (threadId: string, replyText: string) => void;
  materials: CohortMaterial[];
  addCohortMaterial: (
    cohortId: string,
    sessionOrder: number,
    title: string,
    fileType: 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK'
  ) => void;
  certificates: Record<string, CertificateRecord>;
  toggleCertificateRevoke: (certCode: string) => void;
  issueNewCertificate: (
    studentName: string,
    studentEmail: string,
    cohortCode: string,
    finalScore: number
  ) => string;
  receipts: OrderReceipt[];
  studentSidebarTab: StudentSidebarTab;
  setStudentSidebarTab: (tab: StudentSidebarTab) => void;
  interviewCredits: number;
  setInterviewCredits: React.Dispatch<React.SetStateAction<number>>;
  latestCvFileName: string;
  latestCvUpdatedAt: string;
  updateLatestCv: (fileName: string) => void;
  instructorSidebarTab: InstructorSidebarTab;
  setInstructorSidebarTab: (tab: InstructorSidebarTab) => void;
  adminSidebarTab: AdminSidebarTab;
  setAdminSidebarTab: (tab: AdminSidebarTab) => void;
  activePlayerSessionId: string | null;
  setActivePlayerSessionId: (sessionId: string | null) => void;
  searchQueryGlobal: string;
  setSearchQueryGlobal: (q: string) => void;
}

const FALLBACK_BOOT_COURSE: Course = {
  id: 'course-ai-eng',
  slug: 'ky-su-ai-thuc-chien-rag-agents',
  title: 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
  category: 'AI & Dữ liệu',
  difficultyLevel: 2,
  shortDescription: 'Đang tải thông tin khóa học từ hệ thống...',
  descriptionMd: 'Đang tải thông tin khóa học từ hệ thống...',
  syllabusTemplate: [
    {
      order: 1,
      title: 'Buổi 1: Kiến trúc tổng thể hệ thống Trợ lý AI doanh nghiệp',
      summary: 'Khởi tạo luồng dữ liệu và chỉ mục tìm kiếm.',
      activityTags: ['THEORY', 'LIVE_CODING'],
    },
  ],
  skills: [
    { type: 'LEARNING_OUTCOME', code: 'HYBRID-RAG', name: 'Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)' },
  ],
  ratingAvg: 4.9,
  reviewCount: 128,
};

const FALLBACK_BOOT_COHORT: Cohort = {
  id: 'cohort-ai-k01',
  courseId: 'course-ai-eng',
  instructorId: 'usr-inst-khoa',
  code: 'AI-ENG-K01',
  name: 'Kỹ Sư AI Thực Chiến — Khóa K01',
  curriculumVersion: 'v2.4',
  tuitionVnd: 6800000,
  enrolledCount: 48,
  enrollmentOpenAt: '01/10/2026',
  startDate: '15/10/2026',
  endDate: '15/12/2026',
  scheduleSlots: [
    { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
    { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
  ],
  status: 'ONGOING',
  staff: [
    {
      id: 'st-01',
      role: 'INSTRUCTOR',
      fullName: 'TS. Trần Minh Khoa',
      headline: 'Giảng viên chính',
      avatarUrl: AVATAR_MINH_KHOA,
      organization: '3T Academy',
    },
  ],
};

const FALLBACK_BOOT_SESSION: ClassSession = {
  id: 'sess-ai-04',
  cohortId: 'cohort-ai-k01',
  sessionOrder: 4,
  title: 'Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu',
  activityTags: ['LIVE_CODING', 'WORKSHOP'],
  hostInstructorName: 'TS. Trần Minh Khoa',
  scheduledStart: '05/11/2026 · 19:30',
  scheduledEnd: '05/11/2026 · 21:30',
  status: 'REPLAY_READY',
  videoR2Key: 'cohorts/k01/sess-04/master.m3u8',
  videoProvider: 'R2_HLS_AES128',
  durationSeconds: 5400,
  lastPositionSec: 4920,
  attachmentsCount: 3,
  quizStatus: 'PASSED',
  quizScore: 90,
  isCompleted: true,
  aiSummaryMd: 'Tóm tắt nội dung buổi học đang được đồng bộ từ hệ thống...',
  quizQuestions: [
    {
      id: 'q-boot-1',
      question: 'Phương pháp nào giúp giữ nguyên cấu trúc bảng biểu trong tài liệu PDF?',
      options: [
        'Nhận diện bảng biểu và chuyển sang Markdown kèm tiêu đề mục cha',
        'Cắt nhỏ cố định mỗi 100 ký tự',
        'Xóa toàn bộ bảng biểu',
        'Chuyển thành ảnh tĩnh không văn bản',
      ],
      correctIndex: 0,
      explanation: 'Giữ nguyên cấu trúc bảng Markdown giúp mô hình hiểu chính xác hàng và cột.',
    },
  ],
  aiCitations: [],
};

const FALLBACK_BOOT_CERT: CertificateRecord = {
  certificateCode: 'CERT-3T-2026-8891',
  studentName: 'Nguyễn Văn An',
  studentEmail: 'an.nguyen.dev@gmail.com',
  courseTitle: 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
  cohortCode: 'AI-ENG-K01',
  issuedAt: '12/11/2026',
  verificationSignature: '3T-SHA256-VERIFIED-8891',
  finalScore: 94,
  proctoringIntegrity: 'Đã xác thực hợp lệ 100% qua hệ thống giám thị AI',
  isRevoked: false,
  skillsMastered: [
    { code: 'HYBRID-RAG', name: 'Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)', score: 94 },
  ],
};

const AcademyContext = createContext<AcademyContextValue | undefined>(undefined);

function mapTeachPathToTab(path: string): InstructorSidebarTab {
  if (path.startsWith('/teach/cohorts') || path.startsWith('/teach/quizzes')) {
    return 'MANAGE_COHORTS';
  }
  if (path.startsWith('/teach/analytics')) return 'CLASS_ANALYTICS';
  if (path.startsWith('/teach/discussions')) return 'STUDENT_QA';
  if (path.startsWith('/teach/schedule')) return 'AVAILABILITY';
  return 'LIVE_SCHEDULE';
}

function mapAdminPathToTab(path: string): AdminSidebarTab {
  if (path.startsWith('/admin/courses')) return 'CURRICULUM';
  if (path.startsWith('/admin/cohorts') || path.startsWith('/admin/scheduler')) return 'COHORTS';
  if (path.startsWith('/admin/users')) return 'USERS_STAFF';
  if (path.startsWith('/admin/finance')) return 'TUITION_RECONCILIATION';
  return 'OVERVIEW';
}

export const AcademyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  const [role, setRoleState] = useState<AppRole>(() => {
    const p = window.location.pathname || '/';
    if (p.startsWith('/teach')) return 'INSTRUCTOR';
    if (p.startsWith('/admin')) return 'ADMIN';
    return 'STUDENT';
  });

  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>(() => {
    if (API_CONFIG.HAS_EXPLICIT_BACKEND && !getAuthAccessToken()) {
      return null;
    }
    return {
      id: 'acc-01',
      fullName: 'Nguyễn Văn An',
      email: 'an.nguyen.dev@gmail.com',
      role: 'STUDENT',
    };
  });

  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [courses, setCourses] = useState<Course[]>([FALLBACK_BOOT_COURSE]);
  const [categories, setCategories] = useState<CourseCategoryItem[]>([]);
  const [skills, setSkills] = useState<CourseSkill[]>(FALLBACK_BOOT_COURSE.skills);
  const [cohorts, setCohorts] = useState<Cohort[]>([FALLBACK_BOOT_COHORT]);
  const [sessions, setSessions] = useState<ClassSession[]>([FALLBACK_BOOT_SESSION]);
  const [enrolledCohortIds, setEnrolledCohortIds] = useState<string[]>(() => {
    if (API_CONFIG.HAS_EXPLICIT_BACKEND && !getAuthAccessToken()) {
      return [];
    }
    return ['cohort-ai-k01', 'cohort-py-k04'];
  });
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTaskItem[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionThread[]>([]);
  const [materials, setMaterials] = useState<CohortMaterial[]>([]);
  const [certificates, setCertificates] = useState<Record<string, CertificateRecord>>({
    [FALLBACK_BOOT_CERT.certificateCode]: FALLBACK_BOOT_CERT,
  });
  const [receipts, setReceipts] = useState<OrderReceipt[]>([]);

  const [studentSidebarTab, setStudentSidebarTab] = useState<StudentSidebarTab>(() => {
    const p = window.location.pathname || '/';
    if (p.startsWith('/app/profile-cv')) return 'PROFILE_CV';
    if (p.startsWith('/app/mock-interview')) return 'MOCK_INTERVIEW';
    if (p.startsWith('/app/progress')) return 'SKILL_MAP';
    return 'TODAY';
  });
  const [interviewCredits, setInterviewCredits] = useState<number>(4);
  const [latestCvFileName, setLatestCvFileName] = useState<string>(
    'CV_Nguyen_Van_An_2026.pdf'
  );
  const [latestCvUpdatedAt, setLatestCvUpdatedAt] = useState<string>('10/11/2026');

  const updateLatestCv = useCallback((fileName: string) => {
    setLatestCvFileName(fileName);
    setLatestCvUpdatedAt('Hôm nay · Vừa cập nhật');
  }, []);

  const [instructorSidebarTab, setInstructorSidebarTab] = useState<InstructorSidebarTab>(() =>
    mapTeachPathToTab(window.location.pathname || '/')
  );
  const [adminSidebarTab, setAdminSidebarTab] = useState<AdminSidebarTab>(() =>
    mapAdminPathToTab(window.location.pathname || '/')
  );

  const [activePlayerSessionId, setActivePlayerSessionId] = useState<string | null>(null);
  const [searchQueryGlobal, setSearchQueryGlobal] = useState('');

  // 1a. Hydrate Public Catalog, Categories, Skills, Cohorts, Certificates & Current Session on startup
  // (Decoupled from /teach/schedule so public and student users never fail on RBAC 403)
  useEffect(() => {
    let isMounted = true;
    const hydratePublicCatalogAndAuth = async () => {
      try {
        const [
          coursesRes,
          categoriesRes,
          skillsRes,
          cohortsRes,
          certsRes,
          meRes,
        ] = await Promise.all([
          catalogApi.getCourses(),
          catalogApi.getCategories(),
          catalogApi.getSkills(),
          catalogApi.getCohorts(),
          catalogApi.getCertificates().catch(() => ({} as Record<string, CertificateRecord>)),
          authApi.getMe().catch(() => null),
        ]);

        if (!isMounted) return;
        if (coursesRes.length > 0) setCourses(coursesRes);
        setCategories(categoriesRes);
        if (skillsRes.length > 0) setSkills(skillsRes);
        if (cohortsRes.length > 0) setCohorts(cohortsRes);
        if (Object.keys(certsRes).length > 0) setCertificates(certsRes);

        if (meRes) {
          setCurrentUser(meRes);
          if (
            meRes.role &&
            !window.location.pathname.startsWith('/teach') &&
            !window.location.pathname.startsWith('/admin')
          ) {
            setRoleState(meRes.role);
          }
        } else if (API_CONFIG.HAS_EXPLICIT_BACKEND) {
          setCurrentUser(null);
          setEnrolledCohortIds([]);
          if (
            !window.location.pathname.startsWith('/teach') &&
            !window.location.pathname.startsWith('/admin')
          ) {
            setRoleState('GUEST');
          }
        }
      } catch {
        // Keep safe initial state on error
      }
    };
    void hydratePublicCatalogAndAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // 1b. Hydrate Instructor Schedule only when role is INSTRUCTOR/ADMIN or when using local mock fallback
  useEffect(() => {
    if (
      API_CONFIG.HAS_EXPLICIT_BACKEND &&
      role !== 'INSTRUCTOR' &&
      role !== 'ADMIN'
    ) {
      return;
    }
    let isMounted = true;
    teachApi
      .getInstructorSchedule()
      .then((scheduleRes) => {
        if (!isMounted || !scheduleRes) return;
        if (scheduleRes.allSessions && scheduleRes.allSessions.length > 0) {
          setSessions(scheduleRes.allSessions);
        }
        if (scheduleRes.discussions) {
          setDiscussions(scheduleRes.discussions);
        }
        if (scheduleRes.materials) {
          setMaterials(scheduleRes.materials);
        }
      })
      .catch(() => {
        // Ignore 401/403 when non-instructor accesses public views
      });
    return () => {
      isMounted = false;
    };
  }, [role]);

  const refreshEnrollments = useCallback(async () => {
    try {
      const [enrollmentsRes, ordersRes, cohortsRes] = await Promise.all([
        learningApi.getMyEnrollments(),
        orderApi.getMyOrderHistory(),
        catalogApi.getCohorts(),
      ]);
      if (Array.isArray(enrollmentsRes.enrolledCohortIds)) {
        setEnrolledCohortIds(enrollmentsRes.enrolledCohortIds);
      }
      if (Array.isArray(ordersRes) && ordersRes.length > 0) {
        setReceipts(ordersRes);
      } else if (Array.isArray(enrollmentsRes.receipts)) {
        setReceipts(enrollmentsRes.receipts);
      }
      if (Array.isArray(cohortsRes) && cohortsRes.length > 0) {
        setCohorts(cohortsRes);
      }
    } catch {
      // Ignore refresh error
    }
  }, []);

  // 2. When role === 'STUDENT', call learningApi.getMyEnrollments(), orderApi.getMyOrderHistory(), and authApi.getMe()
  useEffect(() => {
    if (role !== 'STUDENT') return;
    let isMounted = true;
    const hydrateStudentAccount = async () => {
      try {
        const [enrollmentsRes, ordersRes, meRes, dashboardRes] = await Promise.all([
          learningApi.getMyEnrollments(),
          orderApi.getMyOrderHistory(),
          authApi.getMe(),
          learningApi.getStudentDashboard(),
        ]);
        if (!isMounted) return;
        if (Array.isArray(enrollmentsRes.enrolledCohortIds)) {
          setEnrolledCohortIds(enrollmentsRes.enrolledCohortIds);
        }
        if (Array.isArray(ordersRes) && ordersRes.length > 0) {
          setReceipts(ordersRes);
        } else if (Array.isArray(enrollmentsRes.receipts)) {
          setReceipts(enrollmentsRes.receipts);
        }
        if (dashboardRes.upcomingTasks) {
          setUpcomingTasks(dashboardRes.upcomingTasks);
        }
        if (meRes) {
          setCurrentUser(meRes);
        }
      } catch {
        // Keep existing state on error
      }
    };
    void hydrateStudentAccount();
    return () => {
      isMounted = false;
    };
  }, [role]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const onPopState = () => {
      const nextPath = window.location.pathname || '/';
      setCurrentPath(nextPath);
      if (nextPath.startsWith('/teach')) {
        setInstructorSidebarTab(mapTeachPathToTab(nextPath));
      } else if (nextPath.startsWith('/admin')) {
        setAdminSidebarTab(mapAdminPathToTab(nextPath));
      } else if (nextPath.startsWith('/app/profile-cv')) {
        setStudentSidebarTab('PROFILE_CV');
      } else if (nextPath.startsWith('/app/mock-interview')) {
        setStudentSidebarTab('MOCK_INTERVIEW');
      } else if (nextPath.startsWith('/app/progress')) {
        setStudentSidebarTab('SKILL_MAP');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    if (path.startsWith('/teach')) {
      setInstructorSidebarTab(mapTeachPathToTab(path));
    } else if (path.startsWith('/admin')) {
      setAdminSidebarTab(mapAdminPathToTab(path));
    } else if (path.startsWith('/app/profile-cv')) {
      setStudentSidebarTab('PROFILE_CV');
    } else if (path.startsWith('/app/mock-interview')) {
      setStudentSidebarTab('MOCK_INTERVIEW');
    } else if (path.startsWith('/app/progress')) {
      setStudentSidebarTab('SKILL_MAP');
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const setRole = useCallback((newRole: AppRole) => {
    setRoleState(newRole);
    if (newRole === 'INSTRUCTOR') {
      setCurrentUser((prev) =>
        prev?.role === 'INSTRUCTOR'
          ? prev
          : {
              id: 'acc-03',
              fullName: 'TS. Trần Minh Khoa',
              email: 'khoa.tran@3tacademy.vn',
              role: 'INSTRUCTOR',
            }
      );
      window.history.pushState({}, '', '/teach');
      setCurrentPath('/teach');
    } else if (newRole === 'ADMIN') {
      setCurrentUser((prev) =>
        prev?.role === 'ADMIN'
          ? prev
          : {
              id: 'acc-05',
              fullName: 'Phạm Thu Trang',
              email: 'trang.pham.admin@3tacademy.vn',
              role: 'ADMIN',
            }
      );
      window.history.pushState({}, '', '/admin');
      setCurrentPath('/admin');
    } else if (newRole === 'STUDENT') {
      setCurrentUser((prev) =>
        prev && prev.role === 'STUDENT'
          ? prev
          : {
              id: 'acc-01',
              fullName: 'Nguyễn Văn An',
              email: 'an.nguyen.dev@gmail.com',
              role: 'STUDENT',
            }
      );
      if (
        window.location.pathname.startsWith('/teach') ||
        window.location.pathname.startsWith('/admin')
      ) {
        window.history.pushState({}, '', '/app');
        setCurrentPath('/app');
      }
    } else if (newRole === 'GUEST') {
      setAuthAccessToken(null);
      setCurrentUser(null);
      void authApi.logout();
      if (
        window.location.pathname.startsWith('/app') ||
        window.location.pathname.startsWith('/teach') ||
        window.location.pathname.startsWith('/admin')
      ) {
        window.history.pushState({}, '', '/');
        setCurrentPath('/');
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const enrollInCohort = useCallback(
    (cohortCode: string): OrderReceipt | null => {
      if (role !== 'STUDENT') {
        return null;
      }

      const targetCohort = cohorts.find(
        (c) => c.code.toLowerCase() === cohortCode.toLowerCase() || c.id === cohortCode
      );
      if (!targetCohort) return null;

      const course = courses.find((cr) => cr.id === targetCohort.courseId);

      void (async () => {
        const currentEnrollments = await learningApi.getMyEnrollments();
        if (!currentEnrollments.enrolledCohortIds.includes(targetCohort.id)) {
          const orderRes = await orderApi.createCohortOrder(
            targetCohort.id,
            `idem-ctx-${Date.now()}`
          );
          await orderApi.simulateSepayWebhook(orderRes.orderCode);
        }
        await refreshEnrollments();
      })();

      return (
        receipts.find((r) => r.cohortCode === targetCohort.code) ?? {
          orderCode: 'ET20268891',
          cohortCode: targetCohort.code,
          courseTitle: course?.title ?? targetCohort.name,
          amountVnd: targetCohort.tuitionVnd,
          paidAt: 'Vừa xong · Mở khóa lớp học tự động qua SePay Webhook',
          bankName: 'MBBank — Ngân hàng Quân Đội (Chuyển khoản QR 24/7)',
          transactionRef: 'MB-QR-99881204',
        }
      );
    },
    [cohorts, courses, receipts, refreshEnrollments, role]
  );

  const createCohort = useCallback(
    (newCohort: {
      courseId: string;
      instructorId?: string;
      code: string;
      name: string;
      curriculumVersion?: string;
      tuitionVnd: number;
      startDate: string;
      scheduleSlots: CohortScheduleSlot[];
      instructorName: string;
    }) => {
      void (async () => {
        const resolvedInstructorId =
          newCohort.instructorId ||
          cohorts.find((c) => c.staff[0]?.fullName === newCohort.instructorName)?.instructorId ||
          (newCohort.instructorName.includes('Hà') ? 'usr-inst-ha' : 'usr-inst-khoa');
        const res = await adminApi.manageCohorts({
          courseId: newCohort.courseId,
          instructorId: resolvedInstructorId,
          curriculumVersion: newCohort.curriculumVersion || 'v2.5',
          code: newCohort.code,
          name: newCohort.name,
          tuitionVnd: newCohort.tuitionVnd,
          startDate: newCohort.startDate,
          scheduleSlots: newCohort.scheduleSlots,
          instructorName: newCohort.instructorName,
        });
        if (res.cohort) {
          setCohorts((prev) => [
            res.cohort!,
            ...prev.filter((c) => c.id !== res.cohort!.id),
          ]);
        } else {
          const overview = await adminApi.getAdminOverview();
          setCohorts(overview.cohorts);
        }
      })();
    },
    [cohorts]
  );

  const updateCohortSchedule = useCallback(
    (cohortId: string, scheduleSlots: CohortScheduleSlot[]) => {
      const target = cohorts.find((c) => c.id === cohortId) ?? cohorts[0];
      void (async () => {
        const res = await adminApi.manageCohorts({
          cohortId,
          courseId: target.courseId,
          instructorId: target.instructorId,
          curriculumVersion: target.curriculumVersion,
          code: target.code,
          name: target.name,
          tuitionVnd: target.tuitionVnd,
          startDate: target.startDate,
          scheduleSlots,
        });
        if (res.cohort) {
          setCohorts((prev) =>
            prev.map((c) => (c.id === cohortId ? res.cohort! : c))
          );
        } else {
          const list = await catalogApi.getCohorts();
          if (list.length > 0) setCohorts(list);
        }
      })();
    },
    [cohorts]
  );

  const rescheduleSession = useCallback((sessionId: string, newDateText: string) => {
    void (async () => {
      const res = await teachApi.updateSessionMaterials(sessionId, {
        scheduledStart: newDateText,
      });
      if (res.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? res.session! : s))
        );
      }
    })();
  }, []);

  const updateSessionDetails = useCallback(
    (sessionId: string, updates: { title?: string; aiSummaryMd?: string }) => {
      // Optimistically update session summary in state immediately
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
      );
      void (async () => {
        const res =
          updates.aiSummaryMd !== undefined && updates.title === undefined
            ? await teachApi.updateSessionSummary(sessionId, updates.aiSummaryMd)
            : await teachApi.updateSessionMaterials(sessionId, updates);
        if (res.session) {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? res.session! : s))
          );
        }
      })();
    },
    []
  );

  const addAiGeneratedQuizToSession = useCallback((sessionId: string) => {
    void (async () => {
      await teachApi.generateSessionQuizByAi(sessionId);
      const scheduleRes = await teachApi.getInstructorSchedule();
      if (scheduleRes.allSessions && scheduleRes.allSessions.length > 0) {
        setSessions(scheduleRes.allSessions);
      }
    })();
  }, []);

  const submitSessionQuiz = useCallback(
    (sessionId: string, answers: number[]): QuizEvaluationOutput | null => {
      const target = sessions.find((s) => s.id === sessionId) ?? sessions[0];
      const hasClientAnswerKey =
        Boolean(target?.quizQuestions?.length) &&
        typeof target?.quizQuestions?.[0]?.correctIndex === 'number';

      const optimisticEvaluation: QuizEvaluationOutput | null =
        target && hasClientAnswerKey
          ? evaluateSessionQuizAndUnlock(target, answers)
          : target
          ? {
              correctCount: answers.length,
              totalQuestions: answers.length || 10,
              scorePercent: 80,
              passed: true,
              updatedSession: {
                ...target,
                quizStatus: 'PASSED' as const,
                quizScore: 80,
                isCompleted: true,
              },
            }
          : null;

      void (async () => {
        const apiEval = await learningApi.submitSessionQuiz(sessionId, answers);
        if (apiEval?.updatedSession) {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? apiEval.updatedSession : s))
          );
        }
        const dashboardRes = await learningApi.getStudentDashboard();
        if (dashboardRes.upcomingTasks) {
          setUpcomingTasks(dashboardRes.upcomingTasks);
        }
      })();

      return optimisticEvaluation;
    },
    [sessions]
  );

  const updateVideoProgress = useCallback(async (sessionId: string, sec: number) => {
    const res = await learningApi.updateVideoProgress(sessionId, sec);
    if (res.updatedSession) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? res.updatedSession! : s))
      );
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updateSessionWatchPosition(s, sec) : s))
      );
    }
  }, []);

  const updateWatchSec = useCallback(
    (sessionId: string, sec: number) => {
      void updateVideoProgress(sessionId, sec);
    },
    [updateVideoProgress]
  );

  const createDiscussionQuestion = useCallback(
    async (
      cohortId: string,
      sessionOrder: number,
      timestampLabel: string,
      title: string,
      body: string
    ) => {
      const targetSession =
        sessions.find(
          (s) => s.cohortId === cohortId && s.sessionOrder === sessionOrder
        ) ?? sessions[0];
      const parts = (timestampLabel || '14:20').split(':').map(Number);
      const sec =
        parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])
          ? parts[0] * 60 + parts[1]
          : 860;

      const res = await learningApi.createSessionQuestion(
        targetSession.id,
        body,
        sec,
        title
      );
      if (res.thread) {
        setDiscussions((prev) => [
          res.thread!,
          ...prev.filter((d) => d.id !== res.thread!.id),
        ]);
      } else {
        const list = await learningApi.getSessionDiscussions(targetSession.id);
        setDiscussions(list);
      }
    },
    [sessions]
  );

  const addDiscussionQuestion = useCallback(
    (
      cohortId: string,
      sessionOrder: number,
      timestampLabel: string,
      title: string,
      body: string
    ) => {
      void createDiscussionQuestion(cohortId, sessionOrder, timestampLabel, title, body);
    },
    [createDiscussionQuestion]
  );

  const replyToDiscussionAsStaff = useCallback((threadId: string, replyText: string) => {
    void (async () => {
      const res = await teachApi.replyAndVerifyDiscussion(threadId, replyText);
      if (res.thread) {
        setDiscussions((prev) =>
          prev.map((th) => (th.id === threadId ? res.thread! : th))
        );
      }
    })();
  }, []);

  const addCohortMaterial = useCallback(
    (
      cohortId: string,
      sessionOrder: number,
      title: string,
      fileType: 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK'
    ) => {
      const targetSession =
        sessions.find(
          (s) => s.cohortId === cohortId && s.sessionOrder === sessionOrder
        ) ?? sessions[0];
      void (async () => {
        const res = await teachApi.updateSessionMaterials(targetSession.id, {
          cohortId,
          sessionOrder,
          materialTitle: title,
          fileType,
        });
        if (res.material) {
          setMaterials((prev) => [res.material!, ...prev]);
        }
      })();
    },
    [sessions]
  );

  const toggleCertificateRevoke = useCallback((certCode: string) => {
    void (async () => {
      const res = await adminApi.toggleCertificateRevoke(certCode);
      if (res.certificate) {
        setCertificates((prev) => ({
          ...prev,
          [certCode]: res.certificate,
        }));
      }
    })();
  }, []);

  const issueNewCertificate = useCallback(
    (
      _studentName: string,
      studentEmail: string,
      _cohortCode: string,
      _finalScore: number
    ): string => {
      let issuedCode = 'CERT-3T-2026-8891';
      void (async () => {
        // Only ADMIN can call /admin/certificates/issue.
        // When a STUDENT completes the final exam, the backend issues the certificate in POST /assessments/:id/submit,
        // so the student client simply refreshes public certificates.
        if (role === 'ADMIN') {
          const batchRes = await adminApi.issueCertificatesBatch([studentEmail]);
          if (batchRes.certificateCodes?.[0]) {
            issuedCode = batchRes.certificateCodes[0];
          }
          if (batchRes.issuedCertificates) {
            setCertificates((prev) => ({
              ...prev,
              ...batchRes.issuedCertificates,
            }));
            return;
          }
        }
        const certsRes = await catalogApi.getCertificates();
        if (Object.keys(certsRes).length > 0) {
          setCertificates(certsRes);
        }
      })();

      return issuedCode;
    },
    [role]
  );

  return (
    <AcademyContext.Provider
      value={{
        currentPath,
        navigate,
        role,
        setRole,
        currentUser,
        setCurrentUser,
        refreshEnrollments,
        theme,
        toggleTheme,
        setTheme,
        isCommandPaletteOpen,
        setCommandPaletteOpen,
        courses,
        categories,
        skills,
        cohorts,
        createCohort,
        updateCohortSchedule,
        sessions,
        rescheduleSession,
        updateSessionDetails,
        addAiGeneratedQuizToSession,
        enrolledCohortIds,
        enrollInCohort,
        submitSessionQuiz,
        updateWatchSec,
        updateVideoProgress,
        upcomingTasks,
        discussions,
        addDiscussionQuestion,
        createDiscussionQuestion,
        replyToDiscussionAsStaff,
        materials,
        addCohortMaterial,
        certificates,
        toggleCertificateRevoke,
        issueNewCertificate,
        receipts,
        studentSidebarTab,
        setStudentSidebarTab,
        interviewCredits,
        setInterviewCredits,
        latestCvFileName,
        latestCvUpdatedAt,
        updateLatestCv,
        instructorSidebarTab,
        setInstructorSidebarTab,
        adminSidebarTab,
        setAdminSidebarTab,
        activePlayerSessionId,
        setActivePlayerSessionId,
        searchQueryGlobal,
        setSearchQueryGlobal,
      }}
    >
      {children}
    </AcademyContext.Provider>
  );
};

export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext);
  if (!ctx) {
    throw new Error('useAcademy must be used inside AcademyProvider');
  }
  return ctx;
}
