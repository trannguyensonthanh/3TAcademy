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
  Notification,
} from '../types/domain';
import {
  evaluateSessionQuizAndUnlock,
  QuizEvaluationOutput,
  updateSessionWatchPosition,
} from '../utils/academyLogic';
import { authApi, AuthUserProfile } from '../services/auth.api';
import {
  clearAuthTokens,
  hasStoredAuthSession,
} from '../services/apiClient';
import { catalogApi, CatalogSummaryResponse } from '../services/catalog.api';
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
  | 'STUDENT_MANAGEMENT'
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
  isAuthLoading: boolean;
  isEnrollmentsHydrated: boolean;
  setRole: (role: AppRole) => void;
  currentUser: AuthUserProfile | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<AuthUserProfile | null>>;
  refreshEnrollments: () => Promise<void>;
  refreshCertificates: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  catalogSummary: CatalogSummaryResponse | null;
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
    maxSeats?: number;
    startDate: string;
    scheduleSlots: CohortScheduleSlot[];
    instructorName: string;
  }) => void;
  updateCohortSchedule: (cohortId: string, scheduleSlots: CohortScheduleSlot[]) => void;
  sessions: ClassSession[];
  rescheduleSession: (sessionId: string, newDateText: string) => void;
  updateSessionDetails: (
    sessionId: string,
    updates: {
      title?: string;
      aiSummaryMd?: string;
      videoR2Key?: string;
      status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
    }
  ) => void;
  addAiGeneratedQuizToSession: (sessionId: string) => void;
  enrolledCohortIds: string[];
  enrollInCohort: (cohortCode: string) => OrderReceipt | null;
  submitSessionQuiz: (sessionId: string, answers: number[]) => QuizEvaluationOutput | null;
  updateWatchSec: (sessionId: string, sec: number, durationSeconds?: number) => void;
  updateVideoProgress: (
    sessionId: string,
    sec: number,
    durationSeconds?: number
  ) => Promise<void>;
  upcomingTasks: UpcomingTaskItem[];
  notifications: Notification[];
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
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
    fileType: 'VIDEO' | 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK',
    materialUrl?: string
  ) => void;
  certificates: Record<string, CertificateRecord>;
  toggleCertificateRevoke: (certCode: string) => void;
  issueNewCertificate: (
    studentNameOrEnrollmentId: string,
    studentEmail?: string,
    cohortCode?: string,
    finalScore?: number
  ) => Promise<string>;
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

const AcademyContext = createContext<AcademyContextValue | undefined>(undefined);

function mapTeachPathToTab(path: string): InstructorSidebarTab {
  if (path.startsWith('/teach/cohorts') || path.startsWith('/teach/quizzes')) {
    return 'MANAGE_COHORTS';
  }
  if (path.startsWith('/teach/students')) return 'STUDENT_MANAGEMENT';
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

  const [role, setRoleState] = useState<AppRole>('GUEST');
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(() => {
    const p = window.location.pathname || '/';
    const isProtected =
      p.startsWith('/app') ||
      p.startsWith('/teach') ||
      p.startsWith('/admin') ||
      p.startsWith('/cohorts/') ||
      p.startsWith('/checkout/') ||
      p.startsWith('/onboarding') ||
      (p.startsWith('/live/') && p !== '/live/guest');
    return hasStoredAuthSession() || isProtected;
  });
  const [isEnrollmentsHydrated, setIsEnrollmentsHydrated] = useState<boolean>(false);

  const normalizeAppRole = (rawRole?: string | null): AppRole => {
    const upper = String(rawRole || '').trim().toUpperCase();
    if (upper === 'STUDENT' || upper === 'INSTRUCTOR' || upper === 'ADMIN') {
      return upper;
    }
    return 'GUEST';
  };

  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [catalogSummary, setCatalogSummary] = useState<CatalogSummaryResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<CourseCategoryItem[]>([]);
  const [skills, setSkills] = useState<CourseSkill[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [enrolledCohortIds, setEnrolledCohortIds] = useState<string[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTaskItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionThread[]>([]);
  const [materials, setMaterials] = useState<CohortMaterial[]>([]);
  const [certificates, setCertificates] = useState<Record<string, CertificateRecord>>({});
  const [receipts, setReceipts] = useState<OrderReceipt[]>([]);

  const [studentSidebarTab, setStudentSidebarTab] = useState<StudentSidebarTab>(() => {
    const p = window.location.pathname || '/';
    if (p.startsWith('/app/profile-cv')) return 'PROFILE_CV';
    if (p.startsWith('/app/mock-interview')) return 'MOCK_INTERVIEW';
    if (p.startsWith('/app/progress')) return 'SKILL_MAP';
    return 'TODAY';
  });
  const [interviewCredits, setInterviewCredits] = useState<number>(0);
  const [latestCvFileName, setLatestCvFileName] = useState<string>('');
  const [latestCvUpdatedAt, setLatestCvUpdatedAt] = useState<string>('');

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

  // 1a. Hydrate Auth Session immediately
  useEffect(() => {
    const p = window.location.pathname || '/';
    const isProtected =
      p.startsWith('/app') ||
      p.startsWith('/teach') ||
      p.startsWith('/admin') ||
      p.startsWith('/cohorts/') ||
      p.startsWith('/checkout/') ||
      p.startsWith('/onboarding') ||
      (p.startsWith('/live/') && p !== '/live/guest');

    if (!hasStoredAuthSession() && !isProtected) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;
    setIsAuthLoading(true);
    authApi
      .getMe()
      .then((meRes) => {
        if (!isMounted) return;
        const normalizedRole = normalizeAppRole(meRes?.role);
        if (meRes && normalizedRole !== 'GUEST') {
          setCurrentUser({ ...meRes, role: normalizedRole });
          setRoleState(normalizedRole);
          if (typeof meRes.interviewCredits === 'number') {
            setInterviewCredits(meRes.interviewCredits);
          }
        } else {
          setCurrentUser(null);
          setEnrolledCohortIds([]);
          setIsEnrollmentsHydrated(false);
          setRoleState('GUEST');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCurrentUser(null);
        setEnrolledCohortIds([]);
        setRoleState('GUEST');
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 1a-2. Hydrate Public Catalog, Summary, Categories, Skills & Cohorts (NO guest certificate fetch!)
  useEffect(() => {
    let isMounted = true;
    const hydratePublicCatalog = async () => {
      try {
        const [
          summaryRes,
          coursesRes,
          categoriesRes,
          skillsRes,
          cohortsRes,
        ] = await Promise.all([
          catalogApi.getSummary().catch(() => null),
          catalogApi.getCourses().catch(() => [] as Course[]),
          catalogApi.getCategories().catch(() => [] as CourseCategoryItem[]),
          catalogApi.getSkills().catch(() => [] as CourseSkill[]),
          catalogApi.getCohorts().catch(() => [] as Cohort[]),
        ]);

        if (!isMounted) return;
        if (summaryRes) setCatalogSummary(summaryRes);
        setCourses(coursesRes);
        setCategories(categoriesRes);
        setSkills(skillsRes);
        setCohorts(cohortsRes);
      } catch {
        // Keep safe initial state on error
      }
    };
    void hydratePublicCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshCertificates = useCallback(async () => {
    if (role === 'GUEST') {
      setCertificates({});
      return;
    }
    try {
      const certsRes = await catalogApi.getCertificates();
      setCertificates(certsRes || {});
    } catch {
      // Ignore error
    }
  }, [role]);

  // Hydrate authenticated user's certificates whenever role / user changes
  useEffect(() => {
    if (role === 'GUEST') {
      setCertificates({});
      return;
    }
    let isMounted = true;
    catalogApi
      .getCertificates()
      .then((certsRes) => {
        if (isMounted) {
          setCertificates(certsRes || {});
        }
      })
      .catch(() => {
        if (isMounted) setCertificates({});
      });
    return () => {
      isMounted = false;
    };
  }, [role, currentUser?.id]);

  // 1b. Hydrate Instructor Schedule when role is INSTRUCTOR or ADMIN
  useEffect(() => {
    if (role !== 'INSTRUCTOR' && role !== 'ADMIN') {
      return;
    }
    let isMounted = true;
    teachApi
      .getInstructorSchedule()
      .then((scheduleRes) => {
        if (!isMounted || !scheduleRes) return;
        if (scheduleRes.allSessions) {
          setSessions(scheduleRes.allSessions);
        }
        if (scheduleRes.discussions) {
          setDiscussions(scheduleRes.discussions);
        }
        if (scheduleRes.materials) {
          setMaterials(scheduleRes.materials);
        }
        if (scheduleRes.notifications) {
          setNotifications(scheduleRes.notifications);
        }
      })
      .catch(() => {
        // Ignore error when unauthorized
      });
    return () => {
      isMounted = false;
    };
  }, [role, currentUser?.id]);

  const refreshEnrollments = useCallback(async () => {
    try {
      const [enrollmentsRes, ordersRes, cohortsRes, dashboardRes, certsRes, meRes] =
        await Promise.all([
          learningApi.getMyEnrollments().catch(() => null),
          orderApi.getMyOrderHistory().catch(() => null),
          catalogApi.getCohorts().catch(() => [] as Cohort[]),
          learningApi.getStudentDashboard().catch(() => null),
          catalogApi.getCertificates().catch(() => null),
          authApi.getMe().catch(() => null),
        ]);
      if (enrollmentsRes) {
        const enrolledCohortsList = Array.isArray(enrollmentsRes.cohorts)
          ? enrollmentsRes.cohorts
          : [];
        const rawIds = Array.isArray(enrollmentsRes.enrolledCohortIds)
          ? enrollmentsRes.enrolledCohortIds.map((id) => String(id))
          : enrolledCohortsList.map((c) => String(c.id));
        const normalizedIds = Array.from(
          new Set([
            ...rawIds,
            ...enrolledCohortsList.map((c) => String(c.id)),
          ])
        ).filter(Boolean);
        setEnrolledCohortIds(normalizedIds);
        setIsEnrollmentsHydrated(true);

        if (cohortsRes.length > 0 || enrolledCohortsList.length > 0) {
          setCohorts((prev) => {
            const map = new Map<string, Cohort>();
            for (const c of prev) map.set(String(c.id), c);
            for (const c of cohortsRes) {
              map.set(String(c.id), { ...map.get(String(c.id)), ...c, id: String(c.id) });
            }
            for (const c of enrolledCohortsList) {
              map.set(String(c.id), { ...map.get(String(c.id)), ...c, id: String(c.id) });
            }
            return Array.from(map.values());
          });
        }
      }
      if (Array.isArray(ordersRes) && ordersRes.length > 0) {
        setReceipts(ordersRes);
      } else if (enrollmentsRes && Array.isArray(enrollmentsRes.receipts)) {
        setReceipts(enrollmentsRes.receipts);
      }
      if (dashboardRes) {
        if (Array.isArray(dashboardRes.upcomingTasks)) {
          setUpcomingTasks(dashboardRes.upcomingTasks);
        }
        if (Array.isArray(dashboardRes.sessions)) {
          setSessions(dashboardRes.sessions);
        }
        if (Array.isArray(dashboardRes.notifications)) {
          setNotifications(dashboardRes.notifications);
        }
      }
      if (certsRes) {
        setCertificates(certsRes);
      }
      if (meRes && typeof meRes.interviewCredits === 'number') {
        setInterviewCredits(meRes.interviewCredits);
      }
    } catch {
      // Ignore refresh error
    }
  }, []);

  // 2. When role === 'STUDENT', hydrate student enrollments, orders, dashboard, sessions, notifications, and current user
  useEffect(() => {
    if (role !== 'STUDENT') return;
    let isMounted = true;
    const hydrateStudentAccount = async () => {
      try {
        const [enrollmentsRes, ordersRes, meRes, dashboardRes, cohortsRes, coursesRes, certsRes] =
          await Promise.all([
            learningApi.getMyEnrollments().catch(() => null),
            orderApi.getMyOrderHistory().catch(() => null),
            authApi.getMe().catch(() => null),
            learningApi.getStudentDashboard().catch(() => null),
            catalogApi.getCohorts().catch(() => [] as Cohort[]),
            catalogApi.getCourses().catch(() => [] as Course[]),
            catalogApi.getCertificates().catch(() => null),
          ]);
        if (!isMounted) return;

        const enrolledCohortsList =
          enrollmentsRes && Array.isArray(enrollmentsRes.cohorts)
            ? enrollmentsRes.cohorts
            : [];

        if (enrollmentsRes) {
          const derivedIds = Array.from(
            new Set([
              ...(Array.isArray(enrollmentsRes.enrolledCohortIds)
                ? enrollmentsRes.enrolledCohortIds.map((id) => String(id))
                : []),
              ...enrolledCohortsList.map((c) => String(c.id)),
            ])
          ).filter(Boolean);
          setEnrolledCohortIds(derivedIds);
          setIsEnrollmentsHydrated(true);
        }

        if (cohortsRes.length > 0 || enrolledCohortsList.length > 0) {
          setCohorts((prev) => {
            const map = new Map<string, Cohort>();
            for (const c of prev) map.set(String(c.id), c);
            for (const c of cohortsRes) {
              map.set(String(c.id), { ...map.get(String(c.id)), ...c, id: String(c.id) });
            }
            for (const c of enrolledCohortsList) {
              map.set(String(c.id), { ...map.get(String(c.id)), ...c, id: String(c.id) });
            }
            return Array.from(map.values());
          });
        }
        if (coursesRes.length > 0) {
          setCourses(coursesRes);
        }

        if (Array.isArray(ordersRes)) {
          setReceipts(ordersRes);
        } else if (enrollmentsRes && Array.isArray(enrollmentsRes.receipts)) {
          setReceipts(enrollmentsRes.receipts);
        }
        if (dashboardRes) {
          setUpcomingTasks(dashboardRes.upcomingTasks || []);
          if (Array.isArray(dashboardRes.sessions)) {
            setSessions(dashboardRes.sessions);
          }
          if (Array.isArray(dashboardRes.notifications)) {
            setNotifications(dashboardRes.notifications);
          }
        }
        if (certsRes) {
          setCertificates(certsRes);
        }
        if (meRes) {
          const normalizedRole = normalizeAppRole(meRes.role);
          setCurrentUser({
            ...meRes,
            role: normalizedRole === 'GUEST' ? 'STUDENT' : normalizedRole,
          });
          if (typeof meRes.interviewCredits === 'number') {
            setInterviewCredits(meRes.interviewCredits);
          }
        }
      } catch {
        // Keep existing state on error
      }
    };
    void hydrateStudentAccount();
    return () => {
      isMounted = false;
    };
  }, [role, currentUser?.id]);

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
    const normalizedNewRole = normalizeAppRole(newRole);
    if (normalizedNewRole === 'GUEST') {
      setRoleState('GUEST');
      setIsAuthLoading(false);
      setIsEnrollmentsHydrated(false);
      clearAuthTokens();
      setCurrentUser(null);
      setEnrolledCohortIds([]);
      setReceipts([]);
      setUpcomingTasks([]);
      setNotifications([]);
      setSessions([]);
      setDiscussions([]);
      setMaterials([]);
      setCertificates({});
      setInterviewCredits(0);
      setLatestCvFileName('');
      setLatestCvUpdatedAt('');
      void authApi.logout().catch(() => undefined);
      if (
        window.location.pathname.startsWith('/app') ||
        window.location.pathname.startsWith('/teach') ||
        window.location.pathname.startsWith('/admin')
      ) {
        window.history.pushState({}, '', '/');
        setCurrentPath('/');
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }

    if (normalizedNewRole !== 'STUDENT') {
      setIsEnrollmentsHydrated(false);
    }
    setRoleState(normalizedNewRole);
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
        navigate('/login');
        return null;
      }

      const targetCohort = cohorts.find(
        (c) => c.code.toLowerCase() === cohortCode.toLowerCase() || c.id === cohortCode
      );
      if (!targetCohort) return null;

      const existingReceipt = receipts.find((r) => r.cohortCode === targetCohort.code) ?? null;
      if (enrolledCohortIds.includes(targetCohort.id) && existingReceipt) {
        return existingReceipt;
      }

      navigate(`/checkout/${encodeURIComponent(targetCohort.code)}`);
      return existingReceipt;
    },
    [cohorts, enrolledCohortIds, navigate, receipts, role]
  );

  const createCohort = useCallback(
    (newCohort: {
      courseId: string;
      instructorId?: string;
      code: string;
      name: string;
      curriculumVersion?: string;
      tuitionVnd: number;
      maxSeats?: number;
      startDate: string;
      scheduleSlots: CohortScheduleSlot[];
      instructorName: string;
    }) => {
      void (async () => {
        const resolvedInstructorId =
          newCohort.instructorId ||
          cohorts.find((c) => c.staff?.[0]?.fullName === newCohort.instructorName)?.instructorId ||
          catalogSummary?.instructors?.find((inst) => inst.fullName === newCohort.instructorName)?.id ||
          '2';
        const res = await adminApi.manageCohorts({
          courseId: newCohort.courseId,
          instructorId: resolvedInstructorId,
          curriculumVersion: newCohort.curriculumVersion || 'v2026.2',
          code: newCohort.code,
          name: newCohort.name,
          tuitionVnd: newCohort.tuitionVnd,
          maxSeats: newCohort.maxSeats ?? 35,
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
    [catalogSummary?.instructors, cohorts]
  );

  const updateCohortSchedule = useCallback(
    (cohortId: string, scheduleSlots: CohortScheduleSlot[]) => {
      const target = cohorts.find((c) => c.id === cohortId);
      if (!target) return;
      void (async () => {
        const res = await adminApi.manageCohorts({
          cohortId,
          courseId: target.courseId,
          instructorId: target.instructorId,
          curriculumVersion: target.curriculumVersion,
          code: target.code,
          name: target.name,
          tuitionVnd: target.tuitionVnd,
          maxSeats: target.maxSeats,
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
    (
      sessionId: string,
      updates: {
        title?: string;
        aiSummaryMd?: string;
        videoR2Key?: string;
        status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      }
    ) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
      );
      void (async () => {
        const res =
          updates.aiSummaryMd !== undefined &&
          updates.title === undefined &&
          updates.videoR2Key === undefined &&
          updates.status === undefined
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
      const target = sessions.find((s) => s.id === sessionId);
      const hasClientAnswerKey =
        Boolean(target?.quizQuestions?.length) &&
        typeof target?.quizQuestions?.[0]?.correctIndex === 'number';

      const optimisticEvaluation: QuizEvaluationOutput | null =
        target && hasClientAnswerKey
          ? evaluateSessionQuizAndUnlock(target, answers)
          : null;

      void (async () => {
        const apiEval = await learningApi.submitSessionQuiz(sessionId, answers);
        if (apiEval?.updatedSession) {
          setSessions((prev) => {
            const exists = prev.some((s) => s.id === sessionId);
            if (!exists) return [...prev, apiEval.updatedSession];
            return prev.map((s) => (s.id === sessionId ? apiEval.updatedSession : s));
          });
        }
        const dashboardRes = await learningApi.getStudentDashboard();
        if (dashboardRes.upcomingTasks) {
          setUpcomingTasks(dashboardRes.upcomingTasks);
        }
        if (Array.isArray(dashboardRes.sessions)) {
          setSessions(dashboardRes.sessions);
        }
      })();

      return optimisticEvaluation;
    },
    [sessions]
  );

  const updateVideoProgress = useCallback(
    async (sessionId: string, sec: number, durationSeconds?: number) => {
      const res = await learningApi.updateVideoProgress(
        sessionId,
        sec,
        undefined,
        durationSeconds
      );
      if (res.updatedSession) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? res.updatedSession! : s))
        );
      } else {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...updateSessionWatchPosition(s, sec),
                  maxWatchedSec: Math.max(s.maxWatchedSec ?? 0, sec),
                  ...(typeof durationSeconds === 'number' && durationSeconds > 0
                    ? { durationSeconds: Math.round(durationSeconds) }
                    : {}),
                }
              : s
          )
        );
      }
    },
    []
  );

  const updateWatchSec = useCallback(
    (sessionId: string, sec: number, durationSeconds?: number) => {
      void updateVideoProgress(sessionId, sec, durationSeconds);
    },
    [updateVideoProgress]
  );

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true, readAt: nowIso } : n))
    );
    await learningApi.markNotificationRead(notificationId).catch(() => undefined);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: nowIso })));
    await learningApi.markAllNotificationsRead().catch(() => undefined);
  }, []);

  const createDiscussionQuestion = useCallback(
    async (
      cohortId: string,
      sessionOrder: number,
      timestampLabel: string,
      title: string,
      body: string
    ) => {
      const targetSession = sessions.find(
        (s) => s.cohortId === cohortId && s.sessionOrder === sessionOrder
      );
      if (!targetSession) return;

      const parts = (timestampLabel || '00:00').split(':').map(Number);
      const sec =
        parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])
          ? parts[0] * 60 + parts[1]
          : 0;

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
      fileType: 'VIDEO' | 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK',
      materialUrl?: string
    ) => {
      const targetSession = sessions.find(
        (s) => s.cohortId === cohortId && s.sessionOrder === sessionOrder
      );
      if (!targetSession) return;

      void (async () => {
        const res = await teachApi.updateSessionMaterials(targetSession.id, {
          cohortId,
          sessionOrder,
          materialTitle: title,
          materialUrl,
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
    async (
      studentNameOrEnrollmentId: string,
      studentEmail?: string,
      cohortCode?: string
    ): Promise<string> => {
      if (role !== 'ADMIN') {
        await refreshCertificates();
        return '';
      }

      let enrollmentId = /^\d+$/.test(studentNameOrEnrollmentId.trim())
        ? studentNameOrEnrollmentId.trim()
        : '';

      if (!enrollmentId && studentEmail) {
        const overview = await adminApi.getAdminOverview();
        const matched = overview.enrollments.find(
          (e) =>
            e.studentEmail.toLowerCase() === studentEmail.toLowerCase() &&
            (!cohortCode || e.cohortCode.toLowerCase() === cohortCode.toLowerCase())
        );
        if (matched) {
          enrollmentId = matched.id;
        }
      }

      if (!enrollmentId) return '';

      const batchRes = await adminApi.issueCertificatesBatch([enrollmentId]);
      if (batchRes.issuedCertificates) {
        setCertificates((prev) => ({
          ...prev,
          ...batchRes.issuedCertificates,
        }));
      } else {
        await refreshCertificates();
      }
      return batchRes.certificateCodes?.[0] || '';
    },
    [refreshCertificates, role]
  );

  return (
    <AcademyContext.Provider
      value={{
        currentPath,
        navigate,
        role,
        isAuthLoading,
        isEnrollmentsHydrated,
        setRole,
        currentUser,
        setCurrentUser,
        refreshEnrollments,
        refreshCertificates,
        theme,
        toggleTheme,
        setTheme,
        isCommandPaletteOpen,
        setCommandPaletteOpen,
        catalogSummary,
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
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
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
