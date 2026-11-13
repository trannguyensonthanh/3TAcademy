import {
  INITIAL_COURSES,
  INITIAL_COHORTS,
  INITIAL_CLASS_SESSIONS,
  INITIAL_DISCUSSION_THREADS,
  INITIAL_COHORT_MATERIALS,
  INITIAL_UPCOMING_TASKS,
  INITIAL_RECEIPTS,
  INITIAL_CERTIFICATES,
  INITIAL_USER_PROFILES,
  INITIAL_STUDENT_SKILL_STATES,
  INITIAL_PAYMENT_TRANSACTIONS,
  INITIAL_ASSESSMENTS,
  INITIAL_MOCK_INTERVIEWS,
  INITIAL_ENROLLMENTS,
  INITIAL_CHAT_MESSAGES,
  INITIAL_NOTIFICATIONS,
  ACADEMY_FAQS,
  AVATAR_MINH_KHOA,
} from '../data/mockDatabase';
import {
  SESSION_4_MCQ_QUESTIONS,
  FINAL_EXAM_25_MCQ_QUESTIONS,
  McqQuestionItem,
  AssessmentPublishStatus,
  StoredMcqAttemptResult,
  toStudentSafePromptConfig,
  evaluateMcqSubmission,
  loadStoredMcqResult,
  hasStudentPassedFinalExam,
} from '../data/phase2QuizBank';
import {
  Course,
  CvScreeningResult,
  InterviewTargetLevel,
  MockInterviewRecord,
  DiscussionThread,
  CohortMaterial,
  CertificateRecord,
  OrderReceipt,
  Cohort,
} from '../types/domain';
import {
  formatScheduleSlots,
  evaluateSessionQuizAndUnlock,
  updateSessionWatchPosition,
} from '../utils/academyLogic';
import { AdminUserAccountItem, EligibleGraduateItem } from '../services/admin.api';
import { ExamCameraReviewItem } from '../services/teach.api';

// In-memory state for stateful mock backend operations during the session
let mockUserProfile = structuredClone(INITIAL_USER_PROFILES[0]);
let mockStudentSkillStates = structuredClone(INITIAL_STUDENT_SKILL_STATES);
let mockCourses = structuredClone(INITIAL_COURSES);
let mockCohorts = structuredClone(INITIAL_COHORTS);
let mockSessions = structuredClone(INITIAL_CLASS_SESSIONS);
let mockDiscussions = structuredClone(INITIAL_DISCUSSION_THREADS);
let mockMaterials = structuredClone(INITIAL_COHORT_MATERIALS);
let mockUpcomingTasks = structuredClone(INITIAL_UPCOMING_TASKS);
let mockReceipts = structuredClone(INITIAL_RECEIPTS);
let mockCertificates: Record<string, CertificateRecord> = structuredClone(INITIAL_CERTIFICATES);
let mockEnrolledCohortIds: string[] = ['cohort-ai-k01', 'cohort-py-k04'];

const mockPaymentTransactions = structuredClone(INITIAL_PAYMENT_TRANSACTIONS);
const mockAssessments = structuredClone(INITIAL_ASSESSMENTS);
const mockEnrollments = structuredClone(INITIAL_ENROLLMENTS);
const mockChatMessages = structuredClone(INITIAL_CHAT_MESSAGES);
const mockNotifications = structuredClone(INITIAL_NOTIFICATIONS);
const mockInterviewsMap = new Map<string, MockInterviewRecord>(
  INITIAL_MOCK_INTERVIEWS.map((item) => [item.id, structuredClone(item)])
);
const mockAssessmentQuestionsMap = new Map<string, McqQuestionItem[]>([
  ['quiz-sess-ai-04', structuredClone(SESSION_4_MCQ_QUESTIONS)],
  ['quiz-sess-ai-05', structuredClone(SESSION_4_MCQ_QUESTIONS)],
  ['final-exam-cohort-ai-k01', structuredClone(FINAL_EXAM_25_MCQ_QUESTIONS)],
]);
const mockStoredResultsMap = new Map<string, StoredMcqAttemptResult>();
const mockPendingOrderCohortMap = new Map<string, string>();

let mockAdminAccounts: AdminUserAccountItem[] = [
  {
    id: 'acc-01',
    fullName: 'Nguyễn Văn An',
    email: 'an.nguyen.dev@gmail.com',
    roleCategory: 'Học viên',
    roleDetail: 'Học viên',
    cohortAssigned: 'AI-ENG-K01, PY-DATA-K04',
    locked: false,
    careerGoal: 'Kỹ sư AI Thực chiến & Backend Python',
    interviewCredits: 4,
  },
  {
    id: 'acc-02',
    fullName: 'Trần Bảo Ngọc',
    email: 'ngoc.tran.ai@gmail.com',
    roleCategory: 'Học viên',
    roleDetail: 'Học viên',
    cohortAssigned: 'AI-ENG-K01',
    locked: false,
    careerGoal: 'Chuyên viên Xử lý dữ liệu lớn',
    interviewCredits: 3,
  },
  {
    id: 'acc-03',
    fullName: 'TS. Trần Minh Khoa',
    email: 'khoa.tran@3tacademy.vn',
    roleCategory: 'Giảng viên',
    roleDetail: 'Giảng viên Trưởng Khối AI',
    cohortAssigned: 'AI-ENG-K01, AI-ENG-K02',
    locked: false,
    instructorHeadline: 'Giảng viên Trưởng Khối AI & Xử lý ngôn ngữ tự nhiên',
    instructorOrganization: '3T Academy & ĐH Bách Khoa TP.HCM',
    instructorYearsOfExperience: 10,
    instructorExpertiseSummaryMd: 'Nghiên cứu và đào tạo chuyên sâu về LLM, Multi-Agent RAG và ứng dụng AI thực tế.',
  },
  {
    id: 'acc-04',
    fullName: 'ThS. Nguyễn Thu Hà',
    email: 'ha.nguyen@3tacademy.vn',
    roleCategory: 'Giảng viên',
    roleDetail: 'Giảng viên chuyên môn',
    cohortAssigned: 'FULLSTACK-AI-K03',
    locked: false,
    instructorHeadline: 'Kỹ sư Trưởng Fullstack & Cloud AI Solutions',
    instructorOrganization: 'FPT Software & 3T Academy',
    instructorYearsOfExperience: 8,
    instructorExpertiseSummaryMd: 'Chuyên gia kiến trúc hệ thống đám mây, vi dịch vụ FastAPI và tích hợp mô hình ngôn ngữ lớn.',
  },
  {
    id: 'acc-05',
    fullName: 'Phạm Thu Trang',
    email: 'trang.pham.admin@3tacademy.vn',
    roleCategory: 'Quản trị viên',
    roleDetail: 'Quản lý Đào tạo & Giáo vụ',
    cohortAssigned: 'Toàn hệ thống',
    locked: false,
  },
];

let mockEligibleGraduates: EligibleGraduateItem[] = [
  {
    id: 'grad-01',
    studentName: 'Nguyễn Văn An',
    studentEmail: 'an.nguyen.dev@gmail.com',
    cohortCode: 'AI-ENG-K01',
    courseTitle: 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
    completedSessionsText: '6/6 buổi (100%)',
    finalExamScore: 94,
    issuedCertCode: 'CERT-3T-2026-8891',
  },
  {
    id: 'grad-02',
    studentName: 'Trần Bảo Ngọc',
    studentEmail: 'ngoc.tran.ai@gmail.com',
    cohortCode: 'AI-ENG-K01',
    courseTitle: 'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
    completedSessionsText: '6/6 buổi (100%)',
    finalExamScore: 91,
  },
  {
    id: 'grad-03',
    studentName: 'Lê Quốc Khánh',
    studentEmail: 'khanh.le.data@gmail.com',
    cohortCode: 'PY-DATA-K04',
    courseTitle: 'Phân Tích Dữ Liệu Thực Chiến Với Python, SQL & Tự Động Hóa Báo Cáo',
    completedSessionsText: '6/6 buổi (100%)',
    finalExamScore: 88,
  },
];

let mockExamReviews: ExamCameraReviewItem[] = [
  {
    id: 'rev-01',
    studentName: 'Lê Quốc Bảo',
    cohortCode: 'AI-ENG-K01',
    mcqScore: '22/25 câu đúng (8.8/10 điểm)',
    cameraFlagReason: 'Rời khỏi khung hình 18 giây ở phút thứ 24',
    cameraTimestamp: 'Phút 24:12 · Đang làm Câu 15/25',
    snapshotNote: 'Học viên cúi xuống nhặt bút rơi dưới bàn, không phát hiện thiết bị lạ.',
    decision: 'PENDING',
  },
  {
    id: 'rev-02',
    studentName: 'Phạm Hải Đăng',
    cohortCode: 'AI-ENG-K01',
    mcqScore: '20/25 câu đúng (8.0/10 điểm)',
    cameraFlagReason: 'Phát hiện người thứ 2 đi ngang phía sau lưng ở phút thứ 31',
    cameraTimestamp: 'Phút 31:05 · Đang làm Câu 19/25',
    snapshotNote: 'Người nhà đi ngang qua phòng trong 4 giây, không giao tiếp hay nhìn vào màn hình.',
    decision: 'PENDING',
  },
];

function parseBodyRecord(body: unknown): Record<string, any> {
  if (!body) return {};
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const file = body.get('file');
    const explicitFileName = body.get('fileName');
    const mode = body.get('mode');
    const fileName =
      typeof explicitFileName === 'string' && explicitFileName
        ? explicitFileName
        : file && typeof (file as File).name === 'string'
        ? (file as File).name
        : 'CV_Cap_Nhat_2026.pdf';
    return {
      fileName,
      mode: typeof mode === 'string' ? mode : 'PARSE_PDF',
    };
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') {
    return body as Record<string, any>;
  }
  return {};
}

/**
 * Bộ định tuyến Backend giả lập (`handleMockRequest`)
 * Chứa toàn bộ logic tìm kiếm, lọc khóa học, kiểm tra thanh toán SePay,
 * chấm điểm trắc nghiệm, cập nhật `student_skill_states`, cấp chứng chỉ,
 * cộng `interview_credits` và thẩm định CV & JD ở Vòng 1 phỏng vấn.
 */
export async function handleMockRequest<T = any>(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<T> {
  const upperMethod = (method || 'GET').toUpperCase();
  const [rawPath, rawQuery = ''] = endpoint.split('?');
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const queryParams = new URLSearchParams(rawQuery);
  const payload = parseBodyRecord(body);

  // ==========================================================================
  // 1. AUTH ROUTES (`/auth/*`)
  // ==========================================================================
  if (upperMethod === 'POST' && path === '/auth/login') {
    const email = String(payload.email || mockUserProfile.email);
    const lowerEmail = email.toLowerCase();
    const matchedAccount = mockAdminAccounts.find(
      (a) => a.email.toLowerCase() === lowerEmail
    );

    const detectedRole = matchedAccount
      ? matchedAccount.roleCategory === 'Quản trị viên'
        ? 'ADMIN'
        : matchedAccount.roleCategory === 'Giảng viên'
        ? 'INSTRUCTOR'
        : 'STUDENT'
      : lowerEmail.includes('admin') || lowerEmail.includes('trang')
      ? 'ADMIN'
      : lowerEmail.includes('khoa') ||
        lowerEmail.includes('teach') ||
        lowerEmail.includes('instructor') ||
        lowerEmail.includes('ha.le')
      ? 'INSTRUCTOR'
      : mockUserProfile.role || 'STUDENT';

    const detectedName = matchedAccount?.fullName || mockUserProfile.fullName;

    mockUserProfile = {
      ...mockUserProfile,
      fullName: detectedName,
      email,
      role: detectedRole,
    };
    return {
      accessToken: `mock-jwt-${Date.now()}`,
      user: {
        id: matchedAccount?.id || mockUserProfile.userId,
        fullName: detectedName,
        email,
        role: detectedRole,
        avatarUrl: mockUserProfile.avatarUrl,
        phone: mockUserProfile.phone || mockUserProfile.cvParsedData?.phone,
        bio: mockUserProfile.bio,
        careerGoal: mockUserProfile.careerGoal,
      },
      isNewUser: false,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/auth/register') {
    const fullName = String(payload.fullName || 'Học viên mới').trim();
    const email = String(payload.email || 'hocvien@3tacademy.vn').trim();
    mockUserProfile = {
      userId: `usr-${Date.now()}`,
      fullName,
      email,
      role: 'STUDENT',
      avatarUrl: '',
      phone: '',
      bio: '',
      careerGoal: '',
      interviewCredits: 2,
      cvParsedData: {
        fullName,
        email,
        phone: '',
        headline: '',
        careerObjective: '',
        projects: [],
        externalSkills: [],
      },
    };
    return {
      accessToken: `mock-jwt-${Date.now()}`,
      user: {
        id: mockUserProfile.userId,
        fullName,
        email,
        role: 'STUDENT',
        avatarUrl: '',
        phone: '',
        bio: '',
        careerGoal: '',
      },
      isNewUser: true,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/auth/google') {
    const isProfileIncomplete = !mockUserProfile.bio || !mockUserProfile.careerGoal;
    mockUserProfile = {
      ...mockUserProfile,
      role: 'STUDENT',
    };
    return {
      accessToken: `mock-google-jwt-${Date.now()}`,
      user: {
        id: mockUserProfile.userId,
        fullName: mockUserProfile.fullName,
        email: mockUserProfile.email,
        role: mockUserProfile.role,
        avatarUrl: mockUserProfile.avatarUrl,
        phone: mockUserProfile.phone || mockUserProfile.cvParsedData?.phone,
        bio: mockUserProfile.bio,
        careerGoal: mockUserProfile.careerGoal,
      },
      isNewUser: isProfileIncomplete,
    } as T;
  }

  if (upperMethod === 'GET' && path === '/auth/me') {
    return {
      id: mockUserProfile.userId,
      fullName: mockUserProfile.fullName,
      email: mockUserProfile.email,
      role: mockUserProfile.role,
      avatarUrl: mockUserProfile.avatarUrl,
      phone: mockUserProfile.phone || mockUserProfile.cvParsedData?.phone,
      bio: mockUserProfile.bio,
      careerGoal: mockUserProfile.careerGoal,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/auth/logout') {
    return { success: true, loggedOutAt: new Date().toISOString() } as T;
  }

  // ==========================================================================
  // 2. CATALOG ROUTES (`/categories`, `/skills`, `/courses`, `/cohorts`, `/faqs`, `/advisor`, `/certificates`)
  // ==========================================================================
  if (upperMethod === 'GET' && path === '/categories') {
    return [
      {
        id: 'cat-ai',
        name: 'AI & Dữ liệu',
        slug: 'ai-du-lieu',
        description: 'Kỹ thuật Hệ thống RAG, Đa tác tử & Mô hình ngôn ngữ lớn',
        parentId: null,
        courseCount: 2,
        count: 2,
        iconName: null,
      },
      {
        id: 'cat-swe',
        name: 'Kỹ thuật Phần mềm & Cloud',
        slug: 'ky-thuat-phan-mem-cloud',
        description: 'Kiến trúc Backend, Microservices & Hạ tầng Đám mây',
        parentId: null,
        courseCount: 1,
        count: 1,
        iconName: null,
      },
      {
        id: 'cat-data',
        name: 'Phân tích Dữ liệu',
        slug: 'phan-tich-du-lieu',
        description: 'Kho dữ liệu PostgreSQL, SQL chuyên sâu & BI Analytics',
        parentId: null,
        courseCount: 1,
        count: 1,
        iconName: null,
      },
    ] as T;
  }

  if (upperMethod === 'GET' && path === '/skills') {
    return mockCourses.flatMap((c) => c.skills) as T;
  }

  if (upperMethod === 'GET' && path === '/cohorts') {
    return mockCohorts as T;
  }

  if (upperMethod === 'GET' && path === '/faqs') {
    return ACADEMY_FAQS as T;
  }

  if (upperMethod === 'GET' && path === '/certificates') {
    const ownCertificates: Record<string, CertificateRecord> = {};
    const currentName = (mockUserProfile.fullName || 'nguyễn văn an').trim().toLowerCase();
    const currentEmailPrefix = (mockUserProfile.email || 'an.nguyen')
      .trim()
      .toLowerCase()
      .split('@')[0];
    for (const [key, cert] of Object.entries(mockCertificates)) {
      const certName = cert.studentName.trim().toLowerCase();
      const certEmail = cert.studentEmail.trim().toLowerCase();
      const isOwner =
        certName === currentName ||
        certName === 'nguyễn văn an' ||
        certEmail.startsWith(currentEmailPrefix) ||
        certEmail.startsWith('an.nguyen');
      if (isOwner) {
        ownCertificates[key] = cert;
      }
    }
    return ownCertificates as T;
  }

  if (upperMethod === 'GET' && path === '/courses') {
    const category = queryParams.get('category') || '';
    const level = queryParams.get('level') || '';
    const q = (queryParams.get('q') || '').toLowerCase().trim();

    const filtered = mockCourses.filter((c) => {
      const matchCat = !category || category === 'ALL' || c.category === category;
      const matchLevel = !level || String(c.difficultyLevel) === level;
      const matchQuery =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.shortDescription.toLowerCase().includes(q) ||
        c.skills.some((sk) => sk.name.toLowerCase().includes(q) || sk.code.toLowerCase().includes(q));
      return matchCat && matchLevel && matchQuery;
    });
    return filtered as T;
  }

  if (upperMethod === 'GET' && path.startsWith('/courses/')) {
    const slug = decodeURIComponent(path.replace('/courses/', ''));
    const course =
      mockCourses.find((c) => c.slug === slug || c.id === slug) ??
      mockCourses[0];
    const cohorts = mockCohorts.filter((ch) => ch.courseId === course.id);
    return {
      course,
      cohorts,
      syllabusTemplate: {
        version: cohorts[0]?.curriculumVersion || 'v2.4',
        totalWeeks: Math.max(4, course.syllabusTemplate.length),
        sessionsPerWeek: 2,
        modules: course.syllabusTemplate,
      },
    } as T;
  }

  if (upperMethod === 'POST' && path === '/advisor/ask') {
    const goal = String(payload.goal || payload.message || '').trim();
    const background = String(payload.background || '').trim();
    const lowerGoal = `${goal} ${background}`.toLowerCase();

    let recommendedCourse = mockCourses[0];
    if (lowerGoal.includes('sql') || lowerGoal.includes('báo cáo') || lowerGoal.includes('bi') || lowerGoal.includes('data')) {
      recommendedCourse = mockCourses[1] ?? mockCourses[0];
    } else if (lowerGoal.includes('cloud') || lowerGoal.includes('docker') || lowerGoal.includes('fastapi') || lowerGoal.includes('backend')) {
      recommendedCourse = mockCourses[2] ?? mockCourses[0];
    } else if (lowerGoal.includes('agent') || lowerGoal.includes('langgraph')) {
      recommendedCourse = mockCourses[3] ?? mockCourses[0];
    }

    const recommendedCohort =
      mockCohorts.find((c) => c.courseId === recommendedCourse.id) ?? mockCohorts[0];
    const secondaryCohort =
      mockCohorts.find((c) => c.id !== recommendedCohort.id && c.status === 'OPENING') ??
      mockCohorts.find((c) => c.id !== recommendedCohort.id) ??
      recommendedCohort;

    return {
      replyText: `Dựa trên mục tiêu "${goal || 'phát triển sự nghiệp công nghệ'}" của bạn, lộ trình phù hợp nhất là khóa "${recommendedCourse.title}" (${recommendedCohort.code}, lịch học ${formatScheduleSlots(recommendedCohort.scheduleSlots)}). Khóa học giúp bạn xây dựng đồ án thực tế sẵn sàng đưa vào CV ứng tuyển.`,
      recommendedCourseSlug: recommendedCourse.slug,
      recommendedCohortId: recommendedCohort.id,
      recommendedCohortCodes: Array.from(new Set([recommendedCohort.code, secondaryCohort.code])),
    } as T;
  }

  if (upperMethod === 'GET' && path.startsWith('/certificates/verify/')) {
    const code = decodeURIComponent(path.replace('/certificates/verify/', '')).toUpperCase().trim();
    const matched =
      mockCertificates[code] ??
      Object.values(mockCertificates).find((c) => c.certificateCode.toUpperCase() === code) ??
      null;

    if (!matched) {
      return {
        found: false,
        accessDenied: false,
        isOwner: false,
        errorCode: 'NOT_FOUND',
        message: 'Không tìm thấy mã chứng chỉ này trong danh sách chứng chỉ tốt nghiệp của bạn.',
        certificate: null,
      } as T;
    }

    const isOwner =
      matched.studentName.trim().toLowerCase() === 'nguyễn văn an' ||
      matched.studentEmail.trim().toLowerCase().startsWith('an.nguyen');

    if (!isOwner) {
      return {
        found: false,
        accessDenied: true,
        isOwner: false,
        errorCode: 'FORBIDDEN_OTHER_STUDENT',
        message:
          'Bảo mật thông tin cá nhân: Bạn chỉ được phép tra cứu chứng chỉ tốt nghiệp của chính bản thân mình. Hệ thống từ chối truy cập chứng chỉ của học viên khác để tránh lộ thông tin cá nhân.',
        certificate: null,
      } as T;
    }

    return {
      found: true,
      accessDenied: false,
      isOwner: true,
      certificate: matched,
    } as T;
  }

  // ==========================================================================
  // 3. ORDER & SEPAY ROUTES (`/orders`, `/webhooks/sepay/simulate`)
  // ==========================================================================
  if (upperMethod === 'POST' && path === '/orders') {
    const cohortId = String(payload.cohortId || 'cohort-ai-k01');
    const cohort =
      mockCohorts.find(
        (c) => c.id === cohortId || c.code.toLowerCase() === cohortId.toLowerCase()
      ) ?? mockCohorts[0];
    const orderCode = 'ET20268891';
    mockPendingOrderCohortMap.set(orderCode, cohort.id);
    return {
      orderCode,
      cohortId: cohort.id,
      cohortCode: cohort.code,
      amountVnd: cohort.tuitionVnd,
      status: 'PENDING',
      bankName: 'MBBank (Ngân hàng Quân Đội)',
      accountNumber: '098877665544',
      accountHolder: 'CONG TY CO PHAN CONG NGHE GIAO DUC 3T ACADEMY',
      transferContent: orderCode,
      qrImageUrl: `https://img.vietqr.io/image/MB-098877665544-compact2.png?amount=${cohort.tuitionVnd}&addInfo=${orderCode}`,
    } as T;
  }

  if (upperMethod === 'GET' && path === '/orders/my-history') {
    return mockReceipts as T;
  }

  if (upperMethod === 'GET' && path.startsWith('/orders/')) {
    const orderCode = decodeURIComponent(path.replace('/orders/', ''));
    const matchedTx = mockPaymentTransactions.find(
      (tx) => tx.orderCode === orderCode && tx.matchStatus === 'MATCHED'
    );
    return {
      orderCode,
      status: matchedTx ? 'PAID' : 'PENDING',
      paidAt: matchedTx?.processedAt,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/webhooks/sepay/simulate') {
    const orderCode = String(payload.orderCode || 'ET20268891');
    const transactionRef = `MB-SEPAY-${Date.now().toString().slice(-6)}`;
    const paidAt = 'Vừa xong · Đối soát tự động qua SePay Webhook';
    const targetCohortId = mockPendingOrderCohortMap.get(orderCode) || 'cohort-ai-k01';
    const targetCohort =
      mockCohorts.find((c) => c.id === targetCohortId) ?? mockCohorts[0];
    const course =
      mockCourses.find((cr) => cr.id === targetCohort.courseId) ?? mockCourses[0];

    if (!mockEnrolledCohortIds.includes(targetCohort.id)) {
      mockEnrolledCohortIds = [...mockEnrolledCohortIds, targetCohort.id];
      mockCohorts = mockCohorts.map((c) =>
        c.id === targetCohort.id ? { ...c, enrolledCount: c.enrolledCount + 1 } : c
      );
    }

    const newReceipt: OrderReceipt = {
      orderCode,
      cohortCode: targetCohort.code,
      courseTitle: course.title,
      amountVnd: targetCohort.tuitionVnd,
      paidAt,
      bankName: 'MBBank — Ngân hàng Quân Đội (Chuyển khoản QR 24/7)',
      transactionRef,
    };
    mockReceipts = [newReceipt, ...mockReceipts.filter((r) => r.orderCode !== orderCode)];

    const existingTxIdx = mockPaymentTransactions.findIndex((tx) => tx.orderCode === orderCode);
    if (existingTxIdx >= 0) {
      mockPaymentTransactions[existingTxIdx] = {
        ...mockPaymentTransactions[existingTxIdx],
        matchStatus: 'MATCHED',
        processedAt: paidAt,
      };
    } else {
      mockPaymentTransactions.unshift({
        id: `tx-${Date.now()}`,
        orderId: `ord-${Date.now()}`,
        orderCode,
        gateway: 'SEPAY_VIETQR',
        amountVnd: targetCohort.tuitionVnd,
        transferContent: `${orderCode} ${targetCohort.code}`,
        referenceNumber: transactionRef,
        matchStatus: 'MATCHED',
        processedAt: paidAt,
      });
    }

    return {
      orderCode,
      status: 'PAID',
      gateway: 'SEPAY_VIETQR',
      matchStatus: 'MATCHED',
      transactionRef,
      paidAt,
    } as T;
  }

  // ==========================================================================
  // 4. LEARNING ROUTES (`/me/dashboard`, `/me/enrollments`, `/cohorts/*`, `/sessions/*`)
  // ==========================================================================
  if (upperMethod === 'GET' && path === '/me/dashboard') {
    const attemptTrend = mockSessions.slice(0, 6).map((s) => ({
      label: `Buổi ${s.sessionOrder}`,
      value: typeof s.quizScore === 'number' ? s.quizScore : s.isCompleted ? 88 : 0,
    }));
    return {
      liveSession:
        mockSessions.find((s) => s.status === 'LIVE') ??
        mockSessions[4],
      resumeSession:
        mockSessions.find((s) => s.sessionOrder === 4) ??
        mockSessions[3],
      upcomingTasks: mockUpcomingTasks,
      streakDays: 7,
      attemptTrend,
    } as T;
  }

  if (upperMethod === 'GET' && path === '/me/enrollments') {
    return {
      enrolledCohortIds: mockEnrolledCohortIds,
      cohorts: mockCohorts.filter((c) => mockEnrolledCohortIds.includes(c.id)),
      receipts: mockReceipts,
    } as T;
  }

  const cohortWorkspaceMatch = path.match(/^\/cohorts\/([^/]+)\/workspace$/);
  if (upperMethod === 'GET' && cohortWorkspaceMatch) {
    const cohortId = decodeURIComponent(cohortWorkspaceMatch[1]);
    const cohort =
      mockCohorts.find(
        (c) => c.id === cohortId || c.code.toLowerCase() === cohortId.toLowerCase()
      ) ?? mockCohorts[0];
    const course =
      mockCourses.find((cr) => cr.id === cohort.courseId) ??
      mockCourses[0];
    const sessions = mockSessions.filter((s) => s.cohortId === cohort.id);
    const activeSessions = (sessions.length > 0 ? sessions : mockSessions).map((s) => ({
      ...s,
      assessmentId: s.assessmentId || `quiz-${s.id}`,
    }));
    const materials = mockMaterials.filter((m) => m.cohortId === cohort.id);
    const finalExamId = `final-exam-${cohort.id}`;
    const finalExamPassed =
      Boolean(mockStoredResultsMap.get('final-exam-cohort-ai-k01')?.passed) ||
      Boolean(mockStoredResultsMap.get(finalExamId)?.passed) ||
      hasStudentPassedFinalExam();
    const eligibleForFinalExam =
      activeSessions.length > 0 && activeSessions.every((s) => s.isCompleted);
    return {
      cohort,
      course,
      sessions: activeSessions,
      materials,
      finalExamId,
      finalExamPassed,
      eligibleForFinalExam,
    } as T;
  }

  const sessionDetailMatch = path.match(/^\/cohorts\/([^/]+)\/sessions\/([^/]+)$/);
  if (upperMethod === 'GET' && sessionDetailMatch) {
    const sessionId = decodeURIComponent(sessionDetailMatch[2]);
    const session =
      mockSessions.find((s) => s.id === sessionId) ??
      mockSessions[3];
    return {
      session,
      videoUrl:
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      chapters: [
        {
          sec: 5,
          timeLabel: '00:05',
          title: 'Phần 1: Bài toán bóc tách báo cáo tài chính PDF nhiều cột',
          slideRange: 'Slide 1 – 6',
        },
        {
          sec: 10,
          timeLabel: '00:10',
          title: 'Phần 2: Giữ nguyên cấu trúc bảng biểu Markdown & Metadata trang gốc',
          slideRange: 'Slide 7 – 11',
        },
        {
          sec: 25,
          timeLabel: '00:25',
          title: 'Phần 3: Kết hợp Tìm kiếm Từ khóa (BM25) và Ngữ nghĩa (pgvector)',
          slideRange: 'Slide 12 – 17',
        },
        {
          sec: 45,
          timeLabel: '00:45',
          title: 'Phần 4: Chạy song song bất đồng bộ với Promise.all giảm độ trễ',
          slideRange: 'Slide 18 – 24',
        },
      ],
      aiChatHistory: [
        {
          id: 'ai-welcome',
          role: 'AI',
          content: `Xin chào! Tôi là Trợ giảng AI đồng hành cùng bạn trong **${session.title}** (${session.hostInstructorName}). Bạn chưa rõ đoạn code hay công thức nào trong video? Hãy đặt câu hỏi, tôi sẽ giải thích và dẫn bạn đến đúng giây video thầy giảng nhé!`,
          citations: [
            { label: '[00:10]', jumpSec: 10, slideLabel: 'Slide Trang 8' },
            { label: '[00:25]', jumpSec: 25, slideLabel: 'Slide Trang 12' },
          ],
        },
      ],
      transcript: [
        {
          sec: 5,
          timeLabel: '00:05',
          speaker: session.hostInstructorName || 'TS. Trần Minh Khoa',
          text: 'Chào cả lớp! Hôm nay chúng mình cùng thực hành xử lý báo cáo PDF dài hàng trăm trang mà không làm đứt gãy bảng biểu tài chính.',
          slidePage: 4,
        },
        {
          sec: 10,
          timeLabel: '00:10',
          speaker: session.hostInstructorName || 'TS. Trần Minh Khoa',
          text: 'Để giữ nguyên ý nghĩa, mình nhận diện các dòng tiêu đề mục lớn và đóng gói toàn bộ bảng số liệu thành một khối nguyên vẹn kèm theo số trang gốc.',
          slidePage: 8,
        },
        {
          sec: 25,
          timeLabel: '00:25',
          speaker: session.hostInstructorName || 'TS. Trần Minh Khoa',
          text: 'Tại sao chỗ này phải kết hợp cả tìm kiếm từ khóa lẫn tìm kiếm theo ý nghĩa câu hỏi? Vì tìm kiếm từ khóa bắt trúng mã hợp đồng, còn tìm kiếm ngữ nghĩa hiểu câu hỏi tự nhiên của nhân viên.',
          slidePage: 12,
        },
        {
          sec: 45,
          timeLabel: '00:45',
          speaker: session.hostInstructorName || 'TS. Trần Minh Khoa',
          text: 'Lưu ý rất quan trọng về xử lý bất đồng bộ: Chúng ta dùng Promise.all để chạy song song hai bộ tìm kiếm, giúp tốc độ phản hồi luôn dưới 1 giây.',
          slidePage: 18,
        },
        {
          sec: 75,
          timeLabel: '01:15',
          speaker: session.hostInstructorName || 'TS. Trần Minh Khoa',
          text: 'Các bạn nhớ hoàn thành 10 câu hỏi trắc nghiệm (A, B, C, D) ngay bên dưới video để hệ thống chấm điểm tức thì và mở khóa hoàn thành buổi học hôm nay nhé!',
          slidePage: 22,
        },
      ],
      attachments: mockMaterials,
      quizSummary: {
        assessmentId: `quiz-${session.id}`,
        questionCount: SESSION_4_MCQ_QUESTIONS.length,
        passingScoreOutOf10: 7.0,
        isCompleted: session.isCompleted,
        bestScorePercent: session.quizScore,
      },
      discussions: mockDiscussions.filter(
        (d) => d.sessionOrder === session.sessionOrder
      ),
    } as T;
  }

  const progressMatch = path.match(/^\/sessions\/([^/]+)\/progress$/);
  if (upperMethod === 'PUT' && progressMatch) {
    const sessionId = decodeURIComponent(progressMatch[1]);
    const lastPositionSec = Number(payload.lastPositionSec || 0);
    let updatedSession = mockSessions.find((s) => s.id === sessionId);
    if (updatedSession) {
      updatedSession = updateSessionWatchPosition(updatedSession, lastPositionSec);
      mockSessions = mockSessions.map((s) =>
        s.id === sessionId ? updatedSession! : s
      );
    }
    return {
      sessionId,
      lastPositionSec,
      savedAt: new Date().toISOString(),
      updatedSession,
    } as T;
  }

  const sessionQuizSubmitMatch = path.match(/^\/sessions\/([^/]+)\/quiz-submit$/);
  if (upperMethod === 'POST' && sessionQuizSubmitMatch) {
    const sessionId = decodeURIComponent(sessionQuizSubmitMatch[1]);
    const answers = Array.isArray(payload.answers) ? (payload.answers as number[]) : [];
    const target = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];
    const evaluation = evaluateSessionQuizAndUnlock(target, answers);
    mockSessions = mockSessions.map((s) =>
      s.id === sessionId ? evaluation.updatedSession : s
    );
    if (evaluation.passed) {
      mockUpcomingTasks = mockUpcomingTasks.map((t) =>
        t.sessionId === sessionId
          ? {
              ...t,
              urgency: 'SAFE',
              dueText: 'Đã hoàn thành',
              score: evaluation.scorePercent,
              statusLabel: `Đã làm xong bài tập (${evaluation.scorePercent}/100) · Hoàn thành buổi học`,
            }
          : t
      );
    }
    return evaluation as T;
  }

  if (upperMethod === 'POST' && path === '/ai/tutor/ask') {
    const question = String(payload.question || '');
    const detectedTopic = question.toLowerCase().includes('sql')
      ? 'PostgreSQL & SQL'
      : question.toLowerCase().includes('fastapi')
      ? 'FastAPI'
      : 'RAG & Vector Search';
    mockChatMessages.push({
      id: `chat-msg-${Date.now()}`,
      sessionId: String(payload.sessionId || 'sess-k01-04'),
      cohortId: 'cohort-ai-k01',
      userId: mockUserProfile.userId,
      studentName: mockUserProfile.fullName,
      senderRole: 'STUDENT',
      content: question,
      tokensUsed: 180,
      latencyMs: 480,
      detectedTopic,
      createdAt: new Date().toISOString(),
    });
    return {
      answerMd: `Với câu hỏi "${question}", thầy Trần Minh Khoa đã minh họa trực tiếp cách tách bảng biểu an toàn ở giây [00:10], cách kết hợp tìm kiếm từ khóa & ngữ nghĩa ở [00:25] và xử lý bất đồng bộ bằng Promise.all ở [00:45]. Bạn bấm vào nút mốc thời gian bên dưới để trình phát video nhảy thẳng tới đúng giây đó nhé!`,
      detectedTopic,
      citations: [
        { label: '[00:10]', jumpSec: 10, slideLabel: 'Slide Trang 8' },
        { label: '[00:25]', jumpSec: 25, slideLabel: 'Slide Trang 12' },
        { label: '[00:45]', jumpSec: 45, slideLabel: 'Slide Trang 18' },
      ],
    } as T;
  }

  const sessionDiscussionsMatch = path.match(/^\/sessions\/([^/]+)\/discussions$/);
  if (sessionDiscussionsMatch) {
    const sessionId = decodeURIComponent(sessionDiscussionsMatch[1]);
    if (upperMethod === 'GET') {
      const session = mockSessions.find((s) => s.id === sessionId);
      return mockDiscussions.filter(
        (d) => !session || d.sessionOrder === session.sessionOrder
      ) as T;
    }
    if (upperMethod === 'POST') {
      const session = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[3];
      const videoTimestampSec = Number(payload.videoTimestampSec || 0);
      const mins = Math.floor(videoTimestampSec / 60)
        .toString()
        .padStart(2, '0');
      const secs = Math.floor(videoTimestampSec % 60)
        .toString()
        .padStart(2, '0');
      const timestampLabel = `${mins}:${secs}`;
      const title = String(payload.title || payload.contentMd || 'Thắc mắc trong buổi học');
      const bodyText = String(payload.contentMd || title);

      const newThread: DiscussionThread = {
        id: `disc-${Date.now()}`,
        cohortId: session.cohortId,
        sessionOrder: session.sessionOrder,
        sessionTitle: session.title,
        timestampLabel,
        authorName: mockUserProfile.fullName,
        createdAt: 'Vừa xong',
        questionTitle: title,
        questionBody: bodyText,
        isResolved: true,
        verifiedByStaff: false,
        hasAiSuggestion: true,
        replies: [
          {
            id: `rep-ai-${Date.now()}`,
            authorName: 'Trợ giảng AI 3T (Hỗ trợ 24/7)',
            authorRole: 'AI_TUTOR',
            createdAt: 'Tức thì',
            aiCitationSec: timestampLabel,
            content: `Trợ giảng AI đã tìm thấy nội dung liên quan tại phút ${timestampLabel} (Trang 8 tài liệu Buổi ${session.sessionOrder}): Với câu hỏi "${title}", bạn nên kết hợp lọc theo lớp học trước rồi mới sắp xếp độ liên quan. Giảng viên phụ trách lớp cũng đã nhận được thông báo để vào giải đáp thêm cùng bạn nhé!`,
          },
        ],
      };
      mockDiscussions = [newThread, ...mockDiscussions];
      return {
        threadId: newThread.id,
        status: 'CREATED',
        videoTimestampSec,
        thread: newThread,
      } as T;
    }
  }

  const sessionChatMatch = path.match(/^\/sessions\/([^/]+)\/chat-messages$/);
  if (sessionChatMatch) {
    const sessionId = decodeURIComponent(sessionChatMatch[1]);
    if (upperMethod === 'GET') {
      const existing = mockChatMessages
        .filter((m) => m.sessionId === sessionId || m.cohortId === 'cohort-ai-k01')
        .map((m) => ({
          id: m.id,
          sessionId,
          senderName: m.studentName || mockUserProfile.fullName,
          senderRole: m.senderRole === 'AI_TUTOR' ? 'Trợ giảng AI' : 'Học viên',
          timeLabel: '20:14',
          text: m.content,
          isStaff: m.senderRole === 'AI_TUTOR',
        }));
      return [
        {
          id: 'live-msg-staff-1',
          sessionId,
          senderName: 'TS. Trần Minh Khoa',
          senderRole: 'Giảng viên chính',
          timeLabel: '20:10',
          text: 'Chào cả lớp! Notebook thực hành Buổi 5 đã được gắn trong mục Tài liệu lớp học, các bạn mở sẵn để cùng live-code nhé.',
          isStaff: true,
        },
        ...existing,
      ] as T;
    }
    if (upperMethod === 'POST') {
      const text = String(payload.text || '').trim();
      const now = new Date();
      const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      const isInstructor = mockUserProfile.role === 'INSTRUCTOR';
      const createdMsg = {
        id: `live-msg-${Date.now()}`,
        sessionId,
        senderName: mockUserProfile.fullName,
        senderRole: isInstructor ? 'Giảng viên chính' : 'Học viên',
        timeLabel,
        text,
        isStaff: isInstructor,
      };
      mockChatMessages.push({
        id: createdMsg.id,
        sessionId,
        cohortId: 'cohort-ai-k01',
        userId: mockUserProfile.userId,
        studentName: mockUserProfile.fullName,
        senderRole: 'STUDENT',
        content: text,
        tokensUsed: 0,
        latencyMs: 0,
        detectedTopic: 'Trao đổi trực tiếp trên lớp',
        createdAt: now.toISOString(),
      });
      return createdMsg as T;
    }
  }

  if (upperMethod === 'POST' && path === '/live/guest/verify') {
    const token = String(payload.token || '').trim();
    const sessionId = String(payload.sessionId || 'sess-k01-05');
    const liveSess =
      mockSessions.find((s) => s.id === sessionId || s.status === 'LIVE') ?? mockSessions[4];
    const valid = token.length >= 4 && !token.toUpperCase().includes('EXPIRED');
    return {
      valid,
      sessionId: liveSess.id,
      sessionTitle: liveSess.title,
      hostInstructorName: liveSess.hostInstructorName,
      guestRoleLabel: 'Diễn giả khách mời (Guest Speaker · WebRTC Token 1 lần)',
    } as T;
  }

  // ==========================================================================
  // 5. ASSESSMENT ROUTES (`/assessments/*`)
  // ==========================================================================
  const submitAssessmentMatch = path.match(/^\/assessments\/([^/]+)\/submit$/);
  if (upperMethod === 'POST' && submitAssessmentMatch) {
    const assessmentId = decodeURIComponent(submitAssessmentMatch[1]);
    const answers = (payload.answers || {}) as Record<number, number>;
    const isFinalExam =
      assessmentId.toLowerCase().includes('final') ||
      assessmentId.toLowerCase().includes('exam');
    const sourceQuestions =
      mockAssessmentQuestionsMap.get(assessmentId) ??
      (isFinalExam ? FINAL_EXAM_25_MCQ_QUESTIONS : SESSION_4_MCQ_QUESTIONS);

    const evaluation = evaluateMcqSubmission(
      assessmentId,
      isFinalExam,
      sourceQuestions,
      answers
    );
    mockStoredResultsMap.set(assessmentId, evaluation);

    // Cập nhật điểm `student_skill_states`
    if (evaluation.passed) {
      mockStudentSkillStates = mockStudentSkillStates.map((sk) =>
        sk.code === 'HYBRID-RAG'
          ? { ...sk, score: Math.min(100, sk.score + 4) }
          : sk
      );
    }

    // Nếu thi Đạt bài thi cuối khóa -> cộng 4 Credits phỏng vấn & tự động cấp chứng chỉ phía Server
    let bonusInterviewCreditsAdded = 0;
    let issuedCertificateCode: string | undefined;
    if (isFinalExam && evaluation.passed) {
      bonusInterviewCreditsAdded = 4;
      mockUserProfile.interviewCredits = Math.max(4, mockUserProfile.interviewCredits);
      const existingCert = Object.values(mockCertificates).find(
        (c) => c.studentEmail.toLowerCase() === mockUserProfile.email.toLowerCase()
      );
      if (existingCert) {
        issuedCertificateCode = existingCert.certificateCode;
      } else {
        issuedCertificateCode = `CERT-3T-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        mockCertificates[issuedCertificateCode] = {
          certificateCode: issuedCertificateCode,
          studentName: mockUserProfile.fullName,
          studentEmail: mockUserProfile.email,
          courseTitle:
            mockCourses[0]?.title ||
            'Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp',
          cohortCode: mockCohorts[0]?.code || 'AI-ENG-K01',
          issuedAt: 'Hôm nay · Cấp tự động khi vượt qua kỳ thi tốt nghiệp',
          verificationSignature: `SHA256-3T-${Date.now()}`,
          finalScore: Math.round(evaluation.scoreOutOf10 * 10),
          proctoringIntegrity: 'Đã xác thực Camera AI Proctoring hợp lệ',
          isRevoked: false,
          skillsMastered: [
            { code: 'HYBRID-RAG', name: 'Tìm Kiếm Kết Hợp (Từ Khóa & Ngữ Nghĩa)', score: 92 },
            { code: 'DOC-PARSE', name: 'Bóc Tách Tài Liệu PDF & Bảng Biểu', score: 89 },
          ],
        };
      }
    }

    return {
      ...evaluation,
      bonusInterviewCreditsAdded,
      updatedInterviewCredits: mockUserProfile.interviewCredits,
      issuedCertificateCode,
    } as T;
  }

  const resultAssessmentMatch = path.match(/^\/assessments\/([^/]+)\/result$/);
  if (upperMethod === 'GET' && resultAssessmentMatch) {
    const assessmentId = decodeURIComponent(resultAssessmentMatch[1]);
    const isFinalExam =
      assessmentId.toLowerCase().includes('final') ||
      assessmentId.toLowerCase().includes('exam');
    const sourceQuestions =
      mockAssessmentQuestionsMap.get(assessmentId) ??
      (isFinalExam ? FINAL_EXAM_25_MCQ_QUESTIONS : SESSION_4_MCQ_QUESTIONS);
    const matchedSession =
      mockSessions.find((s) => assessmentId === `quiz-${s.id}` || assessmentId.includes(s.id)) ??
      mockSessions[3];
    const resolvedCohortId = matchedSession?.cohortId || 'cohort-ai-k01';
    const resolvedFinalExamId = `final-exam-${resolvedCohortId}`;

    const storedInMem = mockStoredResultsMap.get(assessmentId);
    const storedInLocal = loadStoredMcqResult(assessmentId);
    const stored = storedInMem ?? storedInLocal;
    if (stored) {
      return {
        ...stored,
        cohortId: resolvedCohortId,
        sessionId: matchedSession?.id,
        finalExamId: resolvedFinalExamId,
        hasStoredAttempt: true,
        hasPassedFinalExam: hasStudentPassedFinalExam(),
        questionsWithExplanations: sourceQuestions,
        submission: stored,
      } as T;
    }

    // Fallback default result when viewing result screen directly without prior stored submission
    const defaultAnswers: Record<number, number> = {};
    sourceQuestions.forEach((q, idx) => {
      defaultAnswers[q.number] = idx === 2 ? (q.correctIndex + 1) % 4 : q.correctIndex;
    });
    const fallbackResult = evaluateMcqSubmission(
      assessmentId,
      isFinalExam,
      sourceQuestions,
      defaultAnswers
    );
    return {
      ...fallbackResult,
      cohortId: resolvedCohortId,
      sessionId: matchedSession?.id,
      finalExamId: resolvedFinalExamId,
      hasStoredAttempt: false,
      hasPassedFinalExam: hasStudentPassedFinalExam(),
      questionsWithExplanations: sourceQuestions,
      submission: fallbackResult,
    } as T;
  }

  const proctoringEventMatch = path.match(/^\/assessments\/([^/]+)\/proctoring-events$/);
  if (upperMethod === 'POST' && proctoringEventMatch) {
    const assessmentId = decodeURIComponent(proctoringEventMatch[1]);
    return {
      assessmentId,
      recorded: true,
      eventType: String(payload.eventType || 'HEARTBEAT'),
      timestamp: new Date().toISOString(),
    } as T;
  }

  const getAssessmentMatch = path.match(/^\/assessments\/([^/]+)$/);
  if (upperMethod === 'GET' && getAssessmentMatch) {
    const assessmentId = decodeURIComponent(getAssessmentMatch[1]);
    const isFinalExam =
      assessmentId.toLowerCase().includes('final') ||
      assessmentId.toLowerCase().includes('exam');
    const sourceQuestions =
      mockAssessmentQuestionsMap.get(assessmentId) ??
      (isFinalExam ? FINAL_EXAM_25_MCQ_QUESTIONS : SESSION_4_MCQ_QUESTIONS);
    const meta = mockAssessments.find((a) => a.id === assessmentId);
    const passedFinal =
      Boolean(mockStoredResultsMap.get('final-exam-cohort-ai-k01')?.passed) ||
      Boolean(mockStoredResultsMap.get(assessmentId)?.passed) ||
      hasStudentPassedFinalExam();

    const matchedSession =
      mockSessions.find((s) => assessmentId === `quiz-${s.id}` || assessmentId.includes(s.id)) ??
      mockSessions[3];
    const resolvedCohortId = matchedSession?.cohortId || 'cohort-ai-k01';

    return {
      assessmentId,
      cohortId: resolvedCohortId,
      sessionId: matchedSession?.id,
      isFinalExam,
      status: meta?.status ?? 'PUBLISHED',
      title:
        meta?.title ??
        (isFinalExam
          ? 'Bài Thi Tốt Nghiệp Cuối Khóa Kỹ Sư AI Thực Chiến — Khóa K01 (25 câu A, B, C, D)'
          : 'Bài Kiểm Tra Mở Khóa Cuối Buổi Học (10 câu Trắc nghiệm A, B, C, D)'),
      questionCount: sourceQuestions.length,
      timeLimitMinutes: isFinalExam ? 45 : 15,
      isRetakeLocked: isFinalExam && passedFinal,
      hasPassedFinalExam: passedFinal,
      promptConfig: toStudentSafePromptConfig(sourceQuestions),
    } as T;
  }

  // ==========================================================================
  // 6. PROFILE & INTERVIEW ROUTES (`/me/profile-skills`, `/me/cv/upload`, `/interviews/*`)
  // ==========================================================================
  if (upperMethod === 'GET' && path === '/me/profile-skills') {
    const cv = mockUserProfile.cvParsedData || { projects: [], externalSkills: [] };
    return {
      userProfile: {
        userId: mockUserProfile.userId,
        fullName: mockUserProfile.fullName || cv.fullName || '',
        avatarUrl: mockUserProfile.avatarUrl || cv.avatarUrl || '',
        headline: mockUserProfile.bio || cv.headline || '',
        bio: mockUserProfile.bio || cv.headline || '',
        email: mockUserProfile.email || cv.email || '',
        phone: mockUserProfile.phone || cv.phone || '',
        githubUrl: cv.githubUrl || '',
        linkedinUrl: cv.linkedinUrl || '',
        careerObjective: mockUserProfile.careerGoal || cv.careerObjective || '',
        careerGoal: mockUserProfile.careerGoal || cv.careerObjective || '',
        latestCvFileName: cv.fileName || 'Chưa tải lên file CV',
        latestCvUpdatedAt: cv.updatedAt || 'Chưa cập nhật',
        interviewCredits: mockUserProfile.interviewCredits,
        cvParsedData: cv,
      },
      studentSkillStates: mockStudentSkillStates,
      externalCvSkills: cv.externalSkills || [],
    } as T;
  }

  if ((upperMethod === 'PUT' || upperMethod === 'PATCH') && path === '/me/profile') {
    const nextFullName = String(payload.fullName ?? mockUserProfile.fullName).trim();
    const nextAvatarUrl =
      payload.avatarUrl !== undefined
        ? String(payload.avatarUrl)
        : mockUserProfile.avatarUrl || '';
    const nextPhone =
      payload.phone !== undefined
        ? String(payload.phone).trim()
        : mockUserProfile.phone || mockUserProfile.cvParsedData?.phone || '';
    const nextBio =
      payload.bio !== undefined
        ? String(payload.bio).trim()
        : mockUserProfile.bio || '';
    const nextCareerGoal =
      payload.careerGoal !== undefined
        ? String(payload.careerGoal).trim()
        : mockUserProfile.careerGoal || '';

    const prevCv = mockUserProfile.cvParsedData || {
      projects: [],
      externalSkills: [],
    };

    const updatedCv = {
      ...prevCv,
      fullName: nextFullName || prevCv.fullName,
      avatarUrl: nextAvatarUrl || prevCv.avatarUrl,
      phone: nextPhone || prevCv.phone,
      headline: nextBio || prevCv.headline,
      careerObjective: nextCareerGoal || prevCv.careerObjective,
    };

    mockUserProfile = {
      ...mockUserProfile,
      fullName: nextFullName || mockUserProfile.fullName,
      avatarUrl: nextAvatarUrl,
      phone: nextPhone,
      bio: nextBio,
      careerGoal: nextCareerGoal,
      cvParsedData: updatedCv,
    };

    return {
      success: true,
      userProfile: {
        userId: mockUserProfile.userId,
        fullName: mockUserProfile.fullName,
        avatarUrl: mockUserProfile.avatarUrl || '',
        headline: mockUserProfile.bio || updatedCv.headline || '',
        bio: mockUserProfile.bio || '',
        email: mockUserProfile.email,
        phone: mockUserProfile.phone || updatedCv.phone || '',
        githubUrl: updatedCv.githubUrl || '',
        linkedinUrl: updatedCv.linkedinUrl || '',
        careerObjective: mockUserProfile.careerGoal || updatedCv.careerObjective || '',
        careerGoal: mockUserProfile.careerGoal || '',
        latestCvFileName: updatedCv.fileName || 'Chưa tải lên file CV',
        latestCvUpdatedAt: updatedCv.updatedAt || 'Vừa cập nhật',
        interviewCredits: mockUserProfile.interviewCredits,
        cvParsedData: updatedCv,
      },
    } as T;
  }

  if (upperMethod === 'POST' && path === '/me/cv/upload') {
    const uploadedName = String(
      payload.fileName || mockUserProfile.cvParsedData?.fileName || 'CV_Nguyen_Van_An_Updated.pdf'
    );
    const updatedAt = 'Hôm nay · Vừa cập nhật';

    if (payload.mode === 'SAVE_RESUME' && payload.resumeData && typeof payload.resumeData === 'object') {
      const r = payload.resumeData as Record<string, any>;
      const normalizedProjects = Array.isArray(r.projects)
        ? r.projects.map((p: any, idx: number) => ({
            id: String(p.id || `proj-saved-${idx + 1}`),
            name: String(p.name || ''),
            role: String(p.role || ''),
            period: String(p.period || ''),
            techStack: String(p.techStack || ''),
            bullets: Array.isArray(p.bullets)
              ? p.bullets.map(String)
              : Array.isArray(p.highlights)
              ? p.highlights.map(String)
              : [],
            highlights: Array.isArray(p.bullets)
              ? p.bullets.map(String)
              : Array.isArray(p.highlights)
              ? p.highlights.map(String)
              : [],
          }))
        : mockUserProfile.cvParsedData.projects;

      const normalizedSkills = Array.isArray(r.skills)
        ? r.skills.map(String)
        : mockUserProfile.cvParsedData.skills || [];

      const updatedCvParsedData = {
        ...mockUserProfile.cvParsedData,
        fileName: uploadedName,
        updatedAt,
        fullName: String(r.fullName ?? mockUserProfile.fullName),
        headline: String(r.headline ?? mockUserProfile.cvParsedData.headline ?? ''),
        email: String(r.email ?? mockUserProfile.email),
        phone: String(r.phone ?? mockUserProfile.cvParsedData.phone ?? ''),
        githubUrl: String(r.githubUrl ?? mockUserProfile.cvParsedData.githubUrl ?? ''),
        linkedinUrl: String(r.linkedinUrl ?? mockUserProfile.cvParsedData.linkedinUrl ?? ''),
        careerObjective: String(
          r.careerObjective ?? mockUserProfile.cvParsedData.careerObjective ?? ''
        ),
        skills: normalizedSkills,
        projects: normalizedProjects,
        workExperience: Array.isArray(r.workExperience)
          ? r.workExperience
          : mockUserProfile.cvParsedData.workExperience || [],
        education: Array.isArray(r.education)
          ? r.education
          : mockUserProfile.cvParsedData.education || [],
        awardsAndCerts: Array.isArray(r.awardsAndCerts)
          ? r.awardsAndCerts
          : mockUserProfile.cvParsedData.awardsAndCerts || [],
        externalSkills: normalizedSkills.map((sk: string) => ({
          name: sk,
          note: 'Cập nhật từ Hồ sơ năng lực cá nhân',
        })),
      };

      mockUserProfile = {
        ...mockUserProfile,
        fullName: updatedCvParsedData.fullName || mockUserProfile.fullName,
        email: updatedCvParsedData.email || mockUserProfile.email,
        bio: updatedCvParsedData.headline || mockUserProfile.bio,
        careerGoal: updatedCvParsedData.careerObjective || mockUserProfile.careerGoal,
        cvParsedData: updatedCvParsedData,
      };

      return {
        fileName: uploadedName,
        updatedAt,
        cvParsedData: mockUserProfile.cvParsedData,
      } as T;
    }

    // Mode PARSE_PDF: Trả về dữ liệu AI trích xuất từ file PDF để hiển thị trong Smart Sync Modal
    // (Chưa ghi đè mù quáng vào hồ sơ hiện tại của học viên)
    const currentFullName = mockUserProfile.fullName || 'Nguyễn Văn An';
    const extractedCvData = {
      fileName: uploadedName,
      updatedAt,
      fullName: `${currentFullName} (Bản CV Tiếng Anh: An Nguyen)`,
      headline: 'Kỹ Sư AI Thực Chiến (AI & RAG Engineer) · Chuyên gia Backend Python',
      email: mockUserProfile.email || 'an.nguyen.dev@gmail.com',
      phone: mockUserProfile.cvParsedData?.phone || '0908 123 456',
      githubUrl: mockUserProfile.cvParsedData?.githubUrl || 'github.com/nguyenvanan-dev',
      linkedinUrl: mockUserProfile.cvParsedData?.linkedinUrl || 'linkedin.com/in/nguyenvanan',
      careerObjective:
        'Kỹ sư AI & Backend Python chuyên sâu về xây dựng kiến trúc Hybrid RAG (PostgreSQL pgvector + BM25), thiết kế hệ thống Đa tác tử (Multi-Agent với LangGraph) và tối ưu hóa độ trễ API FastAPI dưới 500ms cho doanh nghiệp.',
      skills: [
        'Python',
        'FastAPI',
        'PostgreSQL & SQL',
        'RAG & Vector Search (pgvector)',
        'LangGraph & Multi-Agent',
        'Semantic Caching (Redis)',
        'Docker & Kubernetes',
        'CI/CD GitHub Actions',
        'PyTest',
      ],
      projects: [
        {
          id: `proj-parsed-${Date.now()}-1`,
          name: 'Hệ thống Đa tác tử AI Phân tích Báo cáo Tài chính & Cảnh báo Rủi ro',
          period: '10/2026 – 11/2026',
          role: 'Lead AI Engineer',
          techStack: 'Python, FastAPI, LangGraph, PostgreSQL (pgvector), Redis, Docker',
          bullets: [
            'Thiết kế luồng phối hợp 3 AI Agents tự động bóc tách bảng cân đối kế toán từ PDF và đối chiếu số liệu bất thường.',
            'Tích hợp Semantic Cache bằng Redis giúp giảm 45% chi phí gọi LLM API và duy trì tốc độ phản hồi trung bình 620ms.',
          ],
          highlights: [
            'Thiết kế luồng phối hợp 3 AI Agents tự động bóc tách bảng cân đối kế toán từ PDF và đối chiếu số liệu bất thường.',
            'Tích hợp Semantic Cache bằng Redis giúp giảm 45% chi phí gọi LLM API và duy trì tốc độ phản hồi trung bình 620ms.',
          ],
        },
        ...(mockUserProfile.cvParsedData?.projects || []),
      ],
      workExperience: [
        {
          id: `exp-parsed-${Date.now()}-1`,
          company: 'Công ty Giải pháp AI & Dữ liệu CloudViet',
          position: 'AI & Backend Python Engineer',
          period: '09/2026 – Hiện tại',
          summary:
            'Xây dựng đường ống xử lý tài liệu doanh nghiệp và API tra cứu Hybrid Search trên PostgreSQL pgvector, phục vụ hơn 1.500 nhân sự tra cứu quy trình nội bộ với độ chính xác trích dẫn đạt 94%.',
        },
        ...(mockUserProfile.cvParsedData?.workExperience || []),
      ],
      education: [
        {
          id: `edu-parsed-${Date.now()}-1`,
          school: 'Trường Đại học Bách Khoa',
          degree: 'Cử nhân Kỹ thuật Phần mềm — Chuyên ngành Trí tuệ Nhân tạo',
          period: '2020 – 2024',
          gpaOrHonors: 'GPA: 3.45 / 4.0 · Đồ án tốt nghiệp loại Xuất sắc (9.5/10)',
        },
      ],
      awardsAndCerts: [
        {
          id: `cert-parsed-${Date.now()}-1`,
          title: 'Giải Nhì Cuộc thi Sáng tạo Ứng dụng AI Doanh nghiệp (AI Hackathon 2026)',
          issuer: 'Hiệp hội Phần mềm & CNTT Việt Nam',
          dateOrCode: '10/2026 · Mã giải thưởng: AIH-2026-02',
          detail: 'Xây dựng giải pháp Trợ lý AI kiểm tra hợp đồng thông minh trong 24 giờ.',
        },
        ...(mockUserProfile.cvParsedData?.awardsAndCerts || []),
      ],
      externalSkills: [
        { name: 'LangGraph & Multi-Agent', note: 'Phát hiện mới từ file CV PDF tải lên' },
        { name: 'Semantic Caching (Redis)', note: 'Phát hiện mới từ file CV PDF tải lên' },
        { name: 'Docker & Kubernetes', note: 'Phát hiện mới từ file CV PDF tải lên' },
        { name: 'CI/CD GitHub Actions', note: 'Phát hiện mới từ file CV PDF tải lên' },
      ],
    };

    return {
      fileName: uploadedName,
      updatedAt,
      cvParsedData: extractedCvData,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/interviews/screen-cv') {
    const rawLevel = String(payload.targetLevel || 'FRESHER');
    const targetLevel: InterviewTargetLevel =
      rawLevel === 'INTERN' || rawLevel === 'FRESHER' || rawLevel === 'JUNIOR'
        ? rawLevel
        : 'SENIOR';
    const targetRole = String(payload.targetRole || 'Kỹ Sư AI (AI Engineer)');
    const jdRawText = String(payload.jdRawText || '');
    const scenarioMode =
      payload.scenarioMode === 'MISSING_COURSE_45' ? 'MISSING_COURSE_45' : 'READY_78';

    const matchPercent = scenarioMode === 'READY_78' ? 78 : 45;
    const passedGate = matchPercent >= 65;

    const cvScreeningResult: CvScreeningResult = passedGate
      ? {
          matchPercent: 78,
          passedGate: true,
          layoutAndPresentationFeedback:
            'Bố cục CV 1 trang A4 gọn gàng, phân tách rõ Mục tiêu nghề nghiệp, Dự án thực tế và Kỹ năng công nghệ. Các ý trong phần dự án được triển khai mạch lạc theo cấu trúc Bài toán – Giải pháp kỹ thuật – Kết quả định lượng (< 800ms, 100+ trang PDF).',
          jdMatchEvaluation: `Hồ sơ CV hiện tại (${mockUserProfile.cvParsedData.fileName}) đạt độ khớp 78% với vị trí ${targetRole} (${targetLevel}). CV đã chứng minh được năng lực thực hành Python, FastAPI, PostgreSQL (pgvector) và xây dựng hệ thống tìm kiếm kết hợp (Hybrid Search) sát với yêu cầu trong JD.`,
          missingKeywordsOrGaps: [
            'Nên làm rõ hơn cơ chế kiểm soát phân quyền truy cập tài liệu ở tầng truy vấn SQL.',
            'Bổ sung thêm con số đo lường độ chính xác trích dẫn nguồn trong dự án đầu tiên.',
          ],
        }
      : {
          matchPercent: 45,
          passedGate: false,
          layoutAndPresentationFeedback:
            'Bố cục CV dễ nhìn nhưng cách triển khai ý trong mục Dự án còn liệt kê công nghệ chung chung, thiếu các gạch đầu dòng mô tả độ sâu kỹ thuật và kết quả đo lường cụ thể.',
          jdMatchEvaluation: `Hồ sơ CV hiện tại (${mockUserProfile.cvParsedData.fileName}) mới đạt độ khớp 45% với tờ JD vị trí ${targetRole}. Bản CV mới nêu kinh nghiệm lập trình Python/SQL cơ bản, chưa làm nổi bật được dự án và kỹ năng xử lý tài liệu RAG / Vector Search mà JD đang yêu cầu.`,
          missingKeywordsOrGaps: [
            'Thiếu mô tả dự án xây dựng hệ thống tìm kiếm ngữ nghĩa & từ khóa (Hybrid Search / pgvector).',
            'Thiếu kỹ năng bóc tách tài liệu PDF/Word giữ nguyên cấu trúc bảng biểu.',
          ],
        };

    const interviewId = `intv-draft-${Date.now()}`;
    const draftRecord: MockInterviewRecord = {
      id: interviewId,
      userId: mockUserProfile.userId,
      targetLevel,
      targetRole,
      jdRawText,
      cvScreeningResult,
      transcriptLog: [],
      evaluationReport: null,
      status: 'CV_SCREENING',
      createdAt: new Date().toISOString(),
    };
    mockInterviewsMap.set(interviewId, draftRecord);

    return {
      interviewId,
      status: 'CV_SCREENING',
      creditDeducted: 0,
      availableCredits: mockUserProfile.interviewCredits,
      cvScreeningResult,
    } as T;
  }

  const startInterviewMatch = path.match(/^\/interviews\/([^/]+)\/start$/);
  if (upperMethod === 'POST' && startInterviewMatch) {
    const interviewId = decodeURIComponent(startInterviewMatch[1]);
    const existing = mockInterviewsMap.get(interviewId);
    if (existing) {
      existing.status = 'IN_PROGRESS';
    }
    const targetRole = existing?.targetRole || 'Kỹ Sư AI (AI Engineer)';
    return {
      interviewId,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      interviewerName: 'Hội đồng Phỏng vấn AI 3T',
      interviewerTitle: `Phỏng vấn viên Kỹ thuật · ${targetRole}`,
      stageTag: 'Câu 1/3 · Khởi động & Làm quen (Warm-up & Giới thiệu)',
      questionText: `Chào ${mockUserProfile.fullName}! Rất vui được trao đổi với bạn trong buổi phỏng vấn vị trí ${targetRole} hôm nay. Để bắt đầu nhẹ nhàng, bạn hãy giới thiệu ngắn gọn về bản thân, định hướng công việc hiện tại và lý do bạn ứng tuyển vị trí này nhé?`,
    } as T;
  }

  const turnInterviewMatch = path.match(/^\/interviews\/([^/]+)\/turn$/);
  if (upperMethod === 'POST' && turnInterviewMatch) {
    const interviewId = decodeURIComponent(turnInterviewMatch[1]);
    const transcriptText = String(payload.transcript || '');
    const existing = mockInterviewsMap.get(interviewId);
    const turnCountAfter = (existing?.transcriptLog.filter((t) => t.speaker === 'STUDENT').length ?? 0) + 1;

    if (existing) {
      existing.transcriptLog.push({
        speaker: 'STUDENT',
        speakerLabel: `${mockUserProfile.fullName} (Trả lời bằng giọng nói)`,
        text: transcriptText,
        createdAt: new Date().toISOString(),
      });
    }

    const followUpPrompts = [
      {
        turnEvaluation:
          'Phần giới thiệu mạch lạc, nêu rõ nền tảng kỹ thuật và mục tiêu nghề nghiệp gắn liền với vị trí ứng tuyển.',
        betterAnswerTip:
          'Có thể nhấn mạnh thêm 1 con số ấn tượng nhất từ dự án gần đây ngay câu kết phần giới thiệu.',
        nextStageTag: 'Câu 2/3 · Đào sâu Dự án trong CV (Deep-dive Dự án)',
        nextQuestionText:
          'Cảm ơn phần giới thiệu của bạn! Nhìn vào mục Dự án trong CV, bạn có nêu việc bóc tách báo cáo PDF dài trên 100 trang và tìm kiếm kết hợp (Hybrid Search). Bạn hãy chia sẻ chi tiết cách giữ nguyên cấu trúc bảng biểu không bị đứt gãy và cách tính điểm xếp hạng kết quả nhé?',
        isCompleted: false,
      },
      {
        turnEvaluation:
          'Giải thích chính xác cơ chế đóng gói bảng biểu Markdown kèm tiêu đề mục cha và công thức kết hợp điểm RRF giữa từ khóa và vector.',
        betterAnswerTip:
          'Nên đề cập thêm cách kiểm soát phân quyền truy cập tài liệu theo phòng ban ngay tại câu lệnh truy vấn SQL.',
        nextStageTag: 'Câu 3/3 · Xử lý tình huống kỹ thuật theo JD (Tình huống thực tế)',
        nextQuestionText:
          'Giải pháp xử lý bảng biểu của bạn rất thực tế! Câu hỏi cuối cùng theo đúng yêu cầu trong tờ JD: Nếu hệ thống có 500 nhân viên tra cứu cùng lúc và yêu cầu thời gian phản hồi dưới 1 giây, bạn sẽ thiết kế xử lý bất đồng bộ và bộ nhớ đệm (caching) trong FastAPI như thế nào?',
        isCompleted: false,
      },
      {
        turnEvaluation:
          'Trình bày tốt giải pháp bất đồng bộ với Promise.all/asyncio.gather kết hợp Semantic Caching trên Redis giúp giảm chi phí gọi LLM và giữ độ trễ dưới 800ms.',
        betterAnswerTip:
          'Nêu thêm cơ chế xóa cache (cache invalidation) khi tài liệu gốc được cập nhật phiên bản mới.',
        nextStageTag: 'Hoàn tất 3/3 câu hỏi · Sẵn sàng chấm điểm tổng kết',
        nextQuestionText:
          'Bạn đã hoàn thành toàn bộ các câu hỏi phỏng vấn! Hãy nhấn nút "Nộp bài & Nhận Báo Cáo Đánh Giá" để hệ thống tổng hợp kết quả.',
        isCompleted: true,
      },
    ];

    const stepIdx = Math.min(followUpPrompts.length - 1, Math.max(0, turnCountAfter - 1));
    const matchedStep = followUpPrompts[stepIdx];

    return {
      interviewId,
      recordedTranscript: transcriptText,
      acknowledged: true,
      ...matchedStep,
    } as T;
  }

  const completeInterviewMatch = path.match(/^\/interviews\/([^/]+)\/complete$/);
  if (upperMethod === 'POST' && completeInterviewMatch) {
    const interviewId = decodeURIComponent(completeInterviewMatch[1]);
    mockUserProfile.interviewCredits = Math.max(0, mockUserProfile.interviewCredits - 1);
    const evaluationReport = {
      overallScore: 89,
      projectDepthScore: 92,
      communicationScore: 88,
      strengths: [
        'Nắm vững kiến trúc kỹ thuật của dự án trong CV, giải thích rõ cách giữ nguyên bảng biểu PDF.',
        'Trình bày mạch lạc, trả lời đúng trọng tâm câu hỏi tình huống của JD.',
      ],
      improvements: [
        'Nên nêu rõ hơn thông số độ trễ (latency) khi chạy song song hai nhánh tìm kiếm.',
      ],
    };
    const existing = mockInterviewsMap.get(interviewId);
    if (existing) {
      existing.status = 'COMPLETED';
      existing.evaluationReport = evaluationReport;
    }
    return {
      interviewId,
      status: 'COMPLETED',
      creditDeducted: 1,
      remainingCredits: mockUserProfile.interviewCredits,
      evaluationReport,
    } as T;
  }

  const deleteInterviewMatch = path.match(/^\/interviews\/([^/]+)$/);
  if (upperMethod === 'DELETE' && deleteInterviewMatch) {
    const interviewId = decodeURIComponent(deleteInterviewMatch[1]);
    mockInterviewsMap.delete(interviewId);
    return {
      interviewId,
      deleted: true,
      creditDeducted: 0,
    } as T;
  }

  // ==========================================================================
  // 7. TEACH ROUTES (`/teach/*`)
  // ==========================================================================
  if (upperMethod === 'GET' && path === '/teach/schedule') {
    return {
      liveSession:
        mockSessions.find((s) => s.status === 'LIVE') ??
        mockSessions[4],
      upcomingSessions: mockSessions.filter((s) => s.status !== 'REPLAY_READY'),
      allSessions: mockSessions,
      examReviews: mockExamReviews,
      enrollments: mockEnrollments,
      chatMessages: mockChatMessages,
      notifications: mockNotifications,
      discussions: mockDiscussions,
      materials: mockMaterials,
    } as T;
  }

  if (upperMethod === 'GET' && path === '/teach/cohorts') {
    return mockCohorts as T;
  }

  const teachSessionDetailMatch = path.match(
    /^\/teach\/cohorts\/([^/]+)\/sessions\/([^/]+)$/
  );
  if (upperMethod === 'GET' && teachSessionDetailMatch) {
    const cohortId = decodeURIComponent(teachSessionDetailMatch[1]);
    const sessionId = decodeURIComponent(teachSessionDetailMatch[2]);
    const session =
      mockSessions.find((s) => s.id === sessionId) ??
      mockSessions[3];
    const assessmentId = `quiz-${session.id}`;
    const meta = mockAssessments.find((a) => a.id === assessmentId);
    return {
      session,
      assessmentId,
      questions:
        mockAssessmentQuestionsMap.get(assessmentId) ??
        structuredClone(SESSION_4_MCQ_QUESTIONS),
      publishStatus: (meta?.status ?? 'PUBLISHED') as AssessmentPublishStatus,
      materials: mockMaterials.filter(
        (m) => m.cohortId === cohortId && m.sessionOrder === session.sessionOrder
      ),
      discussions: mockDiscussions.filter(
        (d) => d.cohortId === cohortId && d.sessionOrder === session.sessionOrder
      ),
    } as T;
  }

  const teachCohortDetailMatch = path.match(/^\/teach\/cohorts\/([^/]+)$/);
  if (upperMethod === 'GET' && teachCohortDetailMatch) {
    const cohortId = decodeURIComponent(teachCohortDetailMatch[1]);
    const cohort =
      mockCohorts.find((c) => c.id === cohortId) ?? mockCohorts[0];
    const sessions = mockSessions.filter((s) => s.cohortId === cohort.id);
    const finalExamId = `final-exam-${cohort.id}`;
    const finalExamMeta = mockAssessments.find((a) => a.id === finalExamId);
    return {
      cohort,
      sessions: sessions.length > 0 ? sessions : mockSessions,
      finalExamAssessmentId: finalExamId,
      finalExamQuestions:
        mockAssessmentQuestionsMap.get(finalExamId) ??
        mockAssessmentQuestionsMap.get('final-exam-cohort-ai-k01') ??
        structuredClone(FINAL_EXAM_25_MCQ_QUESTIONS),
      finalExamPublishStatus: (finalExamMeta?.status ?? 'PUBLISHED') as AssessmentPublishStatus,
      enrollments: mockEnrollments.filter((e) => e.cohortId === cohort.id),
      discussions: mockDiscussions.filter((d) => d.cohortId === cohort.id),
      materials: mockMaterials.filter((m) => m.cohortId === cohort.id),
    } as T;
  }

  const updateMaterialsMatch = path.match(/^\/teach\/sessions\/([^/]+)\/materials$/);
  if (upperMethod === 'PUT' && updateMaterialsMatch) {
    const sessionId = decodeURIComponent(updateMaterialsMatch[1]);
    let updatedSession: any;
    mockSessions = mockSessions.map((s) => {
      if (s.id !== sessionId) return s;
      updatedSession = {
        ...s,
        ...(payload.title !== undefined ? { title: String(payload.title) } : {}),
        ...(payload.aiSummaryMd !== undefined
          ? { aiSummaryMd: String(payload.aiSummaryMd) }
          : {}),
        ...(payload.scheduledStart !== undefined
          ? {
              scheduledStart: String(payload.scheduledStart),
              scheduledEnd: String(payload.scheduledStart).replace('19:30', '21:30'),
            }
          : {}),
      };
      return updatedSession;
    });

    let addedMaterial: CohortMaterial | undefined;
    if (payload.materialTitle) {
      const targetSess =
        updatedSession ?? mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];
      addedMaterial = {
        id: `mat-${Date.now()}`,
        cohortId: String(payload.cohortId || targetSess.cohortId),
        sessionOrder: Number(payload.sessionOrder || targetSess.sessionOrder),
        title: String(payload.materialTitle),
        fileType: (payload.fileType as CohortMaterial['fileType']) || 'SLIDE',
        fileSize: '3.2 MB',
        updatedAt: 'Vừa tải lên hôm nay',
        downloadUrl: '#tai-lieu-moi',
      };
      mockMaterials = [addedMaterial, ...mockMaterials];
    }

    return {
      sessionId,
      updated: true,
      updatedAt: new Date().toISOString(),
      session: updatedSession,
      material: addedMaterial,
    } as T;
  }

  const generateQuizMatch = path.match(/^\/teach\/sessions\/([^/]+)\/generate-quiz$/);
  if (upperMethod === 'POST' && generateQuizMatch) {
    const sessionId = decodeURIComponent(generateQuizMatch[1]);
    const assessmentId = `quiz-${sessionId}`;
    const generatedItems = structuredClone(SESSION_4_MCQ_QUESTIONS);
    mockAssessmentQuestionsMap.set(assessmentId, generatedItems);
    const found = mockAssessments.find((a) => a.id === assessmentId);
    if (found) {
      found.status = 'DRAFT';
    }
    return {
      assessmentId,
      sessionId,
      status: 'DRAFT',
      items: generatedItems,
    } as T;
  }

  const publishAssessmentMatch = path.match(/^\/teach\/assessments\/([^/]+)\/publish$/);
  if (upperMethod === 'PUT' && publishAssessmentMatch) {
    const assessmentId = decodeURIComponent(publishAssessmentMatch[1]);
    const items = Array.isArray(payload.items)
      ? (payload.items as McqQuestionItem[])
      : SESSION_4_MCQ_QUESTIONS;
    const nextStatus: AssessmentPublishStatus =
      payload.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    mockAssessmentQuestionsMap.set(assessmentId, items);
    const found = mockAssessments.find((a) => a.id === assessmentId);
    if (found) {
      found.status = nextStatus;
    }
    return {
      assessmentId,
      status: nextStatus,
      publishedCount: items.length,
      publishedAt:
        nextStatus === 'PUBLISHED'
          ? 'Vừa duyệt & xuất bản chính thức cho học viên'
          : 'Đã lưu bản nháp câu hỏi trên hệ thống',
    } as T;
  }

  const guestLinkMatch = path.match(/^\/teach\/sessions\/([^/]+)\/guest-link$/);
  if (upperMethod === 'POST' && guestLinkMatch) {
    const sessionId = decodeURIComponent(guestLinkMatch[1]);
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return {
      sessionId,
      oneTimeGuestUrl: `${origin}/live/guest?token=K01-GUEST-${Math.floor(
        1000 + Math.random() * 9000
      )}`,
      expiresInHours: 4,
    } as T;
  }

  const replyDiscussionMatch = path.match(/^\/teach\/discussions\/([^/]+)\/reply$/);
  if (upperMethod === 'POST' && replyDiscussionMatch) {
    const threadId = decodeURIComponent(replyDiscussionMatch[1]);
    const content = String(payload.content || '').trim();
    let updatedThread: DiscussionThread | undefined;
    mockDiscussions = mockDiscussions.map((th) => {
      if (th.id !== threadId) return th;
      updatedThread = {
        ...th,
        isResolved: true,
        verifiedByStaff: true,
        replies: content
          ? [
              ...th.replies,
              {
                id: `rep-staff-${Date.now()}`,
                authorName: 'TS. Trần Minh Khoa (Giảng viên)',
                authorRole: 'INSTRUCTOR',
                createdAt: 'Vừa xong',
                isVerifiedByStaff: true,
                content,
              },
            ]
          : th.replies,
      };
      return updatedThread;
    });
    return {
      threadId,
      verifiedByStaff: true,
      repliedAt: 'Vừa xong',
      thread: updatedThread,
    } as T;
  }

  const reviewProctoringMatch = path.match(/^\/teach\/exam-reviews\/([^/]+)$/);
  if (upperMethod === 'PUT' && reviewProctoringMatch) {
    const reviewId = decodeURIComponent(reviewProctoringMatch[1]);
    const decision =
      payload.decision === 'RETAKE_REQUIRED' ? 'RETAKE_REQUIRED' : 'APPROVED';
    mockExamReviews = mockExamReviews.map((r) =>
      r.id === reviewId ? { ...r, decision } : r
    );
    return {
      reviewId,
      decision,
      updatedAt: new Date().toISOString(),
    } as T;
  }

  const aiReminderMatch = path.match(/^\/teach\/enrollments\/([^/]+)\/ai-reminder$/);
  if (upperMethod === 'POST' && aiReminderMatch) {
    const enrollmentId = decodeURIComponent(aiReminderMatch[1]);
    const targetEnrollment =
      mockEnrollments.find((e) => e.id === enrollmentId) ?? mockEnrollments[0];
    const notificationId = `notif-ai-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const title = `Nhắc nhở học tập cá nhân hóa cho ${targetEnrollment.studentName} (${targetEnrollment.cohortCode})`;
    mockNotifications.unshift({
      id: notificationId,
      userId: targetEnrollment.userId,
      studentName: targetEnrollment.studentName,
      cohortId: targetEnrollment.cohortId,
      cohortCode: targetEnrollment.cohortCode,
      type: 'AI_STUDY_REMINDER',
      title,
      message: `Lộ trình ôn tập 15 phút được cá nhân hóa cho ${targetEnrollment.studentName}: Xem lại mốc video trọng tâm và hoàn thành ${targetEnrollment.missingQuizzesCount} bài trắc nghiệm mở khóa còn thiếu.`,
      isRead: false,
      sentAt: createdAt,
      readAt: null,
      actedAt: null,
    });
    return {
      notificationId,
      enrollmentId: targetEnrollment.id,
      type: 'AI_STUDY_REMINDER',
      title,
      createdAt,
    } as T;
  }

  // ==========================================================================
  // 8. ADMIN ROUTES (`/admin/*`)
  // ==========================================================================
  if (upperMethod === 'GET' && path === '/admin/overview') {
    const totalRevenueVnd = mockReceipts.reduce((sum, r) => sum + r.amountVnd, 0);
    return {
      totalRevenueVnd: Math.max(468000000, totalRevenueVnd),
      activeCohortsCount: mockCohorts.length,
      totalStudentsCount: mockCohorts.reduce((acc, c) => acc + c.enrolledCount, 0),
      issuedCertificatesCount: Object.keys(mockCertificates).length,
      cohorts: mockCohorts,
      certificates: mockCertificates,
      enrollments: mockEnrollments,
      chatMessages: mockChatMessages,
      notifications: mockNotifications,
      accounts: mockAdminAccounts,
      eligibleGraduates: mockEligibleGraduates,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/admin/courses') {
    const courseId = String(payload.id || `course-${Date.now()}`);
    const existingIdx = mockCourses.findIndex((c) => c.id === courseId);
    let savedCourse: Course;
    if (existingIdx >= 0) {
      savedCourse = {
        ...mockCourses[existingIdx],
        ...payload,
      } as Course;
      mockCourses[existingIdx] = savedCourse;
    } else {
      savedCourse = {
        id: courseId,
        slug: String(payload.slug || `khoa-hoc-${Date.now()}`),
        title: String(payload.title || 'Chương trình đào tạo mới'),
        category: (payload.category as Course['category']) || 'AI & Dữ liệu',
        shortDescription: String(payload.shortDescription || ''),
        descriptionMd: String(payload.descriptionMd || ''),
        difficultyLevel: (payload.difficultyLevel as Course['difficultyLevel']) || 3,
        ratingAvg: Number(payload.ratingAvg || 4.9),
        reviewCount: Number(payload.reviewCount || 1),
        skills: Array.isArray(payload.skills) ? payload.skills : [],
        syllabusTemplate: Array.isArray(payload.syllabusTemplate)
          ? payload.syllabusTemplate
          : [],
      };
      mockCourses = [savedCourse, ...mockCourses];
    }
    return {
      courseId,
      status: 'SAVED',
      course: savedCourse,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/admin/cohorts') {
    const scheduleSlots = Array.isArray(payload.scheduleSlots)
      ? payload.scheduleSlots
      : [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
        ];
    const isUpdate = Boolean(payload.cohortId);
    const cohortId = String(payload.cohortId || `cohort-${Date.now()}`);

    let targetCohort: Cohort | undefined;
    if (isUpdate) {
      mockCohorts = mockCohorts.map((c) => {
        if (c.id !== cohortId) return c;
        targetCohort = {
          ...c,
          courseId: String(payload.courseId || c.courseId),
          instructorId: String(payload.instructorId || c.instructorId),
          curriculumVersion: String(payload.curriculumVersion || c.curriculumVersion).slice(0, 120),
          code: String(payload.code || c.code),
          name: String(payload.name || c.name),
          tuitionVnd: Number(payload.tuitionVnd || c.tuitionVnd),
          startDate: String(payload.startDate || c.startDate),
          scheduleSlots,
        };
        return targetCohort;
      });
    } else {
      targetCohort = {
        id: cohortId,
        courseId: String(payload.courseId || mockCourses[0].id),
        instructorId: String(payload.instructorId || 'usr-inst-khoa'),
        code: String(payload.code || 'AI-ENG-K03'),
        name: String(payload.name || 'Khóa Mới'),
        curriculumVersion: String(payload.curriculumVersion || 'v2.5').slice(0, 120),
        tuitionVnd: Number(payload.tuitionVnd || 5900000),
        enrolledCount: 1,
        enrollmentOpenAt: 'Hôm nay',
        startDate: String(payload.startDate || '15/12/2026'),
        endDate: '28/02/2027',
        scheduleSlots,
        status: 'OPENING',
        staff: [
          {
            id: `st-inst-${Date.now()}`,
            role: 'INSTRUCTOR',
            fullName: String(payload.instructorName || 'TS. Trần Minh Khoa'),
            headline: 'Giảng viên chính phụ trách lớp',
            avatarUrl: AVATAR_MINH_KHOA,
            organization: '3T Academy',
          },
        ],
      };
      mockCohorts = [targetCohort, ...mockCohorts];
    }

    return {
      cohortId,
      status: isUpdate ? 'UPDATED' : 'CREATED',
      instructorId: String(payload.instructorId || 'usr-inst-khoa'),
      curriculumVersion: String(payload.curriculumVersion || 'v2.5'),
      scheduleSlots,
      cohort: targetCohort,
      payload,
    } as T;
  }

  if (upperMethod === 'PUT' && path === '/admin/users') {
    const userId = String(payload.userId || `acc-${Date.now()}`);
    const existing = mockAdminAccounts.find((a) => a.id === userId);
    let updatedAccount: AdminUserAccountItem;

    if (existing) {
      updatedAccount = {
        ...existing,
        locked: payload.isActive !== undefined ? !payload.isActive : !existing.locked,
      };
      mockAdminAccounts = mockAdminAccounts.map((a) =>
        a.id === userId ? updatedAccount : a
      );
    } else {
      updatedAccount = {
        id: userId,
        fullName: String(payload.fullName || 'Giảng viên mới'),
        email: String(payload.email || 'staff@3tacademy.vn'),
        roleCategory:
          payload.role === 'ADMIN'
            ? 'Quản trị viên'
            : payload.role === 'INSTRUCTOR'
            ? 'Giảng viên'
            : 'Học viên',
        roleDetail: String(payload.roleDetail || 'Giảng viên chính'),
        cohortAssigned: String(payload.cohortAssigned || 'AI-ENG-K02'),
        locked: payload.isActive === false,
      };
      mockAdminAccounts = [updatedAccount, ...mockAdminAccounts];
    }

    return {
      userId,
      role: payload.role || 'STUDENT',
      isActive: !updatedAccount.locked,
      updated: true,
      account: updatedAccount,
    } as T;
  }

  if (upperMethod === 'POST' && path === '/admin/accounts') {
    const email = String(payload.email || '').trim();
    const password = String(payload.password || '').trim();
    const role = (payload.role as 'STUDENT' | 'INSTRUCTOR' | 'ADMIN') || 'STUDENT';
    const fullName = String(payload.fullName || '').trim();

    if (!email) {
      throw new Error('Email tài khoản không được để trống (accounts.email NOT NULL).');
    }
    if (!password) {
      throw new Error('Mật khẩu không được để trống (accounts.password_hash NOT NULL).');
    }
    if (!fullName) {
      throw new Error('Họ và tên không được để trống (user_profiles.full_name NOT NULL).');
    }
    if (role === 'INSTRUCTOR' && !String(payload.instructorHeadline || '').trim()) {
      throw new Error('Tiêu đề chuyên môn của Giảng viên không được để trống (instructor_profiles.headline NOT NULL).');
    }

    const newId = `acc-${Date.now()}`;
    const newAccount: AdminUserAccountItem = {
      id: newId,
      fullName,
      email,
      roleCategory:
        role === 'ADMIN'
          ? 'Quản trị viên'
          : role === 'INSTRUCTOR'
          ? 'Giảng viên'
          : 'Học viên',
      roleDetail:
        role === 'ADMIN'
          ? 'Quản trị viên'
          : role === 'INSTRUCTOR'
          ? (String(payload.instructorHeadline || 'Giảng viên chuyên môn').trim())
          : 'Học viên',
      cohortAssigned: role === 'ADMIN' ? 'Toàn hệ thống' : 'Chưa phân công lớp',
      locked: false,
      avatarUrl: payload.avatarUrl ? String(payload.avatarUrl).trim() : undefined,
      bio: payload.bio ? String(payload.bio).trim() : undefined,
      careerGoal: payload.careerGoal ? String(payload.careerGoal).trim() : undefined,
      interviewCredits:
        typeof payload.interviewCredits === 'number'
          ? payload.interviewCredits
          : role === 'STUDENT'
          ? 2
          : 99,
      instructorHeadline:
        role === 'INSTRUCTOR' ? String(payload.instructorHeadline || '').trim() : undefined,
      instructorOrganization:
        role === 'INSTRUCTOR' && payload.instructorOrganization
          ? String(payload.instructorOrganization).trim()
          : undefined,
      instructorYearsOfExperience:
        role === 'INSTRUCTOR' && payload.instructorYearsOfExperience
          ? Number(payload.instructorYearsOfExperience)
          : undefined,
      instructorExpertiseSummaryMd:
        role === 'INSTRUCTOR' && payload.instructorExpertiseSummaryMd
          ? String(payload.instructorExpertiseSummaryMd).trim()
          : undefined,
    };

    mockAdminAccounts = [newAccount, ...mockAdminAccounts];

    return {
      success: true,
      account: newAccount,
    } as T;
  }

  if (upperMethod === 'GET' && path === '/admin/sepay-transactions') {
    return mockPaymentTransactions as T;
  }

  if (upperMethod === 'POST' && path === '/admin/certificates/issue') {
    const enrollmentIds = Array.isArray(payload.enrollmentIds)
      ? payload.enrollmentIds.map(String)
      : ['enr-01'];
    mockUserProfile.interviewCredits += 4;

    const certificateCodes: string[] = [];
    const issuedCertificates: Record<string, CertificateRecord> = {};

    enrollmentIds.forEach((enrId, idx) => {
      const code = `CERT-3T-2026-${Math.floor(1000 + Math.random() * 9000) + idx}`;
      certificateCodes.push(code);

      const matchedGrad = mockEligibleGraduates.find(
        (g) => g.id === enrId || g.studentEmail === enrId || !g.issuedCertCode
      );
      const studentName = matchedGrad?.studentName || 'Trần Bảo Ngọc';
      const studentEmail = matchedGrad?.studentEmail || 'ngoc.tran.ai@gmail.com';
      const cohortCode = matchedGrad?.cohortCode || 'AI-ENG-K01';
      const finalScore = matchedGrad?.finalExamScore || 91;
      const targetCohort =
        mockCohorts.find((c) => c.code === cohortCode) ?? mockCohorts[0];
      const course =
        mockCourses.find((cr) => cr.id === targetCohort.courseId) ?? mockCourses[0];

      const record: CertificateRecord = {
        certificateCode: code,
        studentName,
        studentEmail,
        courseTitle: course.title,
        cohortCode: targetCohort.code,
        issuedAt: 'Hôm nay · Cấp bởi Ban Đào Tạo 3T Academy',
        verificationSignature: `3T-VERIFIED-${code}`,
        finalScore,
        proctoringIntegrity:
          'Đã hoàn thành đầy đủ các buổi học, dự án thực tế và vượt qua kỳ thi tốt nghiệp cuối khóa',
        isRevoked: false,
        skillsMastered: course.skills.map((sk) => ({
          code: sk.code,
          name: sk.name,
          score: finalScore,
        })),
      };

      mockCertificates[code] = record;
      issuedCertificates[code] = record;

      if (matchedGrad) {
        mockEligibleGraduates = mockEligibleGraduates.map((g) =>
          g.id === matchedGrad.id ? { ...g, issuedCertCode: code } : g
        );
      }
    });

    return {
      issuedCount: enrollmentIds.length,
      certificateCodes,
      issuedCertificates,
      bonusInterviewCreditsAdded: 4,
    } as T;
  }

  const revokeCertMatch = path.match(/^\/admin\/certificates\/([^/]+)\/revoke$/);
  if (upperMethod === 'PUT' && revokeCertMatch) {
    const certCode = decodeURIComponent(revokeCertMatch[1]);
    const existing =
      mockCertificates[certCode] ?? Object.values(mockCertificates)[0];
    const nextRevoked = !existing.isRevoked;
    const updated: CertificateRecord = {
      ...existing,
      isRevoked: nextRevoked,
      revokedReason: nextRevoked
        ? 'Đang tạm khóa hiển thị theo yêu cầu kiểm tra từ Ban Tổ Chức.'
        : undefined,
    };
    mockCertificates[certCode] = updated;
    return {
      certificateCode: certCode,
      isRevoked: nextRevoked,
      certificate: updated,
    } as T;
  }

  throw new Error(`Unmatched mock route: [${upperMethod}] ${path}`);
}
