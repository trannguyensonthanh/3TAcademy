export type CourseCategory =
  | 'AI & Dữ liệu'
  | 'Kỹ thuật Phần mềm & Cloud'
  | 'Phân tích Dữ liệu'
  | 'Trí tuệ nhân tạo & AI'
  | 'Lập trình Backend & Hệ thống'
  | 'Kỹ thuật Dữ liệu'
  | 'Lập trình Nền tảng'
  | (string & {});

export interface CourseCategoryItem {
  id: string | number;
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | number | null;
  courseCount?: number;
  count?: number;
  iconName?: string | null;
}

export type ActivityTag =
  | 'THEORY'
  | 'LIVE_CODING'
  | 'EXERCISE_REVIEW'
  | 'WORKSHOP';

export type SkillRelationType = 'PREREQUISITE' | 'LEARNING_OUTCOME';

export type ThemeMode = 'LIGHT' | 'DARK' | 'light' | 'dark';

export interface CourseSkill {
  id?: string;
  type: SkillRelationType;
  code: string;
  name: string;
}

export type SkillTag = CourseSkill;

export interface SyllabusTemplateItem {
  order: number;
  moduleTitle?: string;
  duration?: string;
  title: string;
  summary: string;
  topics?: string[];
  deliverable?: string;
  activityTags: ActivityTag[];
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  descriptionMd: string;
  category: CourseCategory;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  level?: string;
  durationWeeks?: number;
  totalHours?: number;
  highlights?: string[];
  targetAudience?: string[];
  skills: CourseSkill[];
  syllabusTemplate: SyllabusTemplateItem[];
  ratingAvg: number;
  rating?: number;
  reviewCount: number;
  reviewsCount?: number;
}

export type CohortStatus = 'OPENING' | 'ONGOING' | 'COMPLETED' | 'CLOSED';

// Chỉ có vai trò INSTRUCTOR cho giảng viên phụ trách lớp (Đã bỏ hoàn toàn vai trò TA)
export type StaffRole = 'INSTRUCTOR';

export interface CohortStaffMember {
  id: string;
  role: StaffRole;
  fullName: string;
  headline: string;
  title?: string;
  bio?: string;
  avatarUrl: string;
  organization: string;
}

export interface CohortScheduleSlot {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7
  startTime: string; // Định dạng 'HH:mm', ví dụ: '19:30'
  endTime: string; // Định dạng 'HH:mm', ví dụ: '21:30'
}

export interface Cohort {
  id: string;
  courseId: string;
  instructorId: string;
  code: string;
  name: string;
  curriculumVersion: string;
  tuitionVnd: number;
  enrolledCount: number;
  maxSeats?: number;
  enrollmentOpenAt: string;
  startDate: string;
  endDate: string;
  scheduleSlots: CohortScheduleSlot[];
  status: CohortStatus;
  staff: CohortStaffMember[];
}


export type SessionStatus = 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
export type QuizStatus = 'PASSED' | 'PENDING' | 'NOT_STARTED';
export type VideoProviderType = 'R2_HLS_AES128' | 'BUNNY_STREAM';

export interface SessionQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AiTimestampCitation {
  timestampSec: number;
  timestampLabel: string;
  topic: string;
  snippet: string;
}

export interface ClassSession {
  id: string;
  cohortId: string;
  sessionOrder: number;
  title: string;
  activityTags: ActivityTag[];
  hostInstructorName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: SessionStatus;
  videoR2Key: string;
  videoProvider: VideoProviderType;
  durationSeconds: number;
  isCompleted: boolean;
  lastPositionSec: number;
  maxWatchedSec?: number;
  aiSummaryMd: string;
  attachmentsCount: number;
  assessmentId?: string;
  quizStatus: QuizStatus;
  quizScore: number | null;
  quizQuestions: SessionQuizQuestion[];
  aiCitations: AiTimestampCitation[];
}

// 3 vai trò người dùng chuẩn trong DB: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' (cùng 'GUEST' cho phiên chưa đăng nhập trên UI)
export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type AppRole = 'GUEST' | UserRole;

export interface UpcomingTaskItem {
  id: string;
  sessionId: string;
  cohortId: string;
  cohortCode: string;
  title: string;
  type: 'SESSION_ASSIGNMENT' | 'PROJECT_MILESTONE';
  dueText: string;
  urgency: 'SAFE' | 'WARNING' | 'URGENT';
  score?: number | null;
  statusLabel: string;
}

export type UpcomingTask = UpcomingTaskItem;

export interface DiscussionReply {
  id: string;
  authorName: string;
  authorRole: 'STUDENT' | 'INSTRUCTOR' | 'AI_TUTOR';
  createdAt: string;
  content: string;
  isVerifiedByStaff?: boolean;
  isOfficialVerify?: boolean;
  aiCitationSec?: string;
}

export interface DiscussionThread {
  id: string;
  cohortId: string;
  sessionId?: string;
  sessionOrder: number;
  sessionTitle: string;
  timestampLabel: string;
  timestampSec?: number;
  videoTimestampSec?: number;
  authorName: string;
  authorRole?: string;
  createdAt: string;
  questionTitle: string;
  questionBody: string;
  contentMd?: string;
  isResolved: boolean;
  verifiedByStaff: boolean;
  hasAiSuggestion: boolean;
  replies: DiscussionReply[];
}

export interface CohortMaterial {
  id: string;
  cohortId: string;
  sessionOrder: number;
  title: string;
  fileType: 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK' | 'CODE' | 'READING';
  type?: 'PDF' | 'SLIDE' | 'REPO' | 'NOTEBOOK' | 'CODE' | 'READING';
  fileSize: string;
  sizeLabel?: string;
  updatedAt: string;
  downloadUrl: string;
}

export interface CertificateRecord {
  certificateCode: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  cohortCode: string;
  issuedAt: string;
  verificationSignature: string;
  finalScore: number;
  proctoringIntegrity: string;
  isRevoked: boolean;
  revokedReason?: string;
  skillsMastered: {
    code: string;
    name: string;
    score: number;
  }[];
  skillsVerified?: (string | {
    code: string;
    name: string;
    score: number;
  })[];
}

export interface OrderReceipt {
  orderCode: string;
  cohortCode: string;
  courseTitle: string;
  amountVnd: number;
  paidAt: string;
  bankName: string;
  transactionRef: string;
}

export type PaymentReceipt = OrderReceipt;

// ============================================================================
// CÁC BẢNG ĐỒNG BỘ 100% VỚI LƯỢC ĐỒ POSTGRESQL MỚI NHẤT
// ============================================================================

export interface ResumeProjectItem {
  id: string;
  name: string;
  period: string; // VD: "08/2026 – 11/2026"
  role: string; // VD: "Lead Developer"
  techStack: string; // VD: "Python, FastAPI, pgvector, React"
  bullets: string[]; // Các thành tựu đạt được
  highlights?: string[];
}

export interface ResumeWorkExperienceItem {
  id: string;
  company: string; // Tên công ty
  position: string; // Vị trí (VD: Backend Developer)
  period: string; // Thời gian làm việc
  summary: string; // Mô tả đóng góp & kết quả công việc
}

export interface ResumeEducationItem {
  id: string;
  school: string; // Tên trường ĐH / CĐ
  degree: string; // Bằng cấp / Chuyên ngành
  period: string; // Niên khóa (VD: 2021 – 2025)
  gpaOrHonors?: string; // GPA hoặc Xếp loại
}

export interface ResumeAwardCertItem {
  id: string;
  title: string; // Tên Chứng chỉ hoặc Giải thưởng
  issuer: string; // Tổ chức cấp (VD: 3T Academy, IIG)
  dateOrCode: string; // Ngày cấp hoặc Mã định danh chứng chỉ
  detail?: string;
}

export interface StudentResumeData {
  fullName: string;
  avatarUrl?: string;
  headline: string;
  email: string;
  phone: string;
  githubUrl: string;
  linkedinUrl: string;
  careerObjective: string;
  skills: string[];
  projects: ResumeProjectItem[];
  workExperience: ResumeWorkExperienceItem[];
  education: ResumeEducationItem[];
  awardsAndCerts: ResumeAwardCertItem[];
}

export interface CvParsedData {
  fileName?: string;
  updatedAt?: string;
  fullName?: string;
  avatarUrl?: string;
  candidateName?: string;
  headline?: string;
  targetRole?: string;
  yearsOfExperience?: number;
  summaryBio?: string;
  email?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  careerObjective?: string;
  skills?: string[];
  projects: {
    id: string;
    name: string;
    role: string;
    period: string;
    techStack: string;
    highlights: string[];
    bullets?: string[];
  }[];
  workExperience?: ResumeWorkExperienceItem[];
  workExperiences?: ResumeWorkExperienceItem[];
  education?: ResumeEducationItem[];
  awardsAndCerts?: ResumeAwardCertItem[];
  certificationsAndAwards?: ResumeAwardCertItem[];
  externalSkills: {
    name: string;
    note: string;
  }[];
}

/**
 * Bảng `user_profiles`: Chỉ chứa `cvParsedData` và `interviewCredits`
 * (Tuyệt đối không có `cvReviewFeedback`)
 */
export interface UserProfileRecord {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  careerGoal?: string;
  cvParsedData: CvParsedData;
  interviewCredits: number;
}

export type UserProfile = UserProfileRecord;

/**
 * Bảng `student_skill_states`: Điểm kỹ năng 0-100 của các khóa học đã đăng ký
 */
export interface StudentSkillStateRecord {
  userId: string;
  code: string;
  name: string;
  score: number;
  masteryScore?: number;
  evidenceCount?: number;
  cohortId: string;
  cohortCode: string;
  courseTitle: string;
  sourceLabel: string;
  updatedAt: string;
}

export type StudentSkillState = StudentSkillStateRecord;

/**
 * Bảng `payment_transactions`: Có `orderId` (nullable), `gateway: 'SEPAY_VIETQR'`,
 * `matchStatus` ('MATCHED' | 'UNMATCHED_ORDER' | 'AMOUNT_MISMATCH')
 */
export type PaymentMatchStatus = 'MATCHED' | 'UNMATCHED_ORDER' | 'AMOUNT_MISMATCH';

export interface PaymentTransactionRecord {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  gateway: 'SEPAY_VIETQR';
  amountVnd: number;
  transferContent: string;
  referenceNumber: string;
  matchStatus: PaymentMatchStatus;
  processedAt: string;
}

/**
 * Bảng `assessments`: Có trường `status` ('DRAFT' | 'PUBLISHED')
 */
export type AssessmentStatus = 'DRAFT' | 'PUBLISHED';

export interface AssessmentRecord {
  id: string;
  cohortId: string;
  sessionId: string | null;
  type: 'SESSION_QUIZ' | 'FINAL_EXAM';
  title: string;
  status: AssessmentStatus;
  timeLimitMinutes: number;
  passingScoreOutOf10: number;
}

/**
 * Bảng `mock_interviews`:
 * Có `targetLevel`, `targetRole`, `jdRawText`, `cvScreeningResult`,
 * `transcriptLog`, `evaluationReport`, `status` ('CV_SCREENING' | 'IN_PROGRESS' | 'COMPLETED')
 */
export type InterviewTargetLevel = 'INTERN' | 'FRESHER' | 'JUNIOR' | 'SENIOR';
export type MockInterviewStatus = 'CV_SCREENING' | 'IN_PROGRESS' | 'COMPLETED';

export interface CvScreeningResult {
  matchPercent: number;
  passedGate: boolean;
  /** (1) Đánh giá bố cục, trình bày & cách triển khai ý trong CV */
  layoutAndPresentationFeedback: string;
  /** (2) Đánh giá độ khớp trực tiếp giữa CV (cvParsedData) và tờ JD mục tiêu (jdRawText) */
  jdMatchEvaluation: string;
  missingKeywordsOrGaps: string[];
}

export interface InterviewTranscriptTurn {
  speaker: 'SENIOR_AI' | 'STUDENT';
  speakerLabel: string;
  stageTag?: string;
  text: string;
  createdAt?: string;
}

export interface InterviewEvaluationReport {
  overallScore: number;
  projectDepthScore: number;
  communicationScore: number;
  strengths: string[];
  improvements: string[];
}

export interface MockInterviewRecord {
  id: string;
  userId: string;
  targetLevel: InterviewTargetLevel;
  targetRole: string;
  jdRawText: string;
  cvScreeningResult: CvScreeningResult;
  transcriptLog: InterviewTranscriptTurn[];
  evaluationReport: InterviewEvaluationReport | null;
  status: MockInterviewStatus;
  createdAt: string;
}

/**
 * Bảng `enrollments` (`Enrollment`):
 * - `dropoutRiskScore`: giá trị thực từ `0.0` đến `1.0` đánh giá mức độ nguy cơ không hoàn thành khóa học
 * - `riskLevel`: `'LOW' | 'MEDIUM' | 'HIGH'` dựa trên `lastActivityAt`, số bài kiểm tra chưa làm và điểm số giảm sút
 */
export type DropoutRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'REVOKED';

export interface Enrollment {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  cohortId: string;
  cohortCode: string;
  status: EnrollmentStatus;
  completedSessionsCount: number;
  totalSessionsCount: number;
  missingQuizzesCount: number;
  avgScorePct: number;
  lastActivityAt: string;
  dropoutRiskScore: number;
  riskLevel: DropoutRiskLevel;
}

export type EnrollmentRecord = Enrollment;

/**
 * Bảng `chat_messages` (`ChatMessage`):
 * - `detectedTopic`: chủ đề kỹ thuật mà AI tự động gắn nhãn cho câu hỏi của học viên
 *   (ví dụ: `'RAG & Vector Search'`, `'Python'`, `'FastAPI'`, `'PostgreSQL & SQL'`, `'Docker'`, `'Redis'`)
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  cohortId: string;
  userId: string;
  studentName: string;
  senderRole: 'STUDENT' | 'AI_TUTOR';
  content: string;
  detectedTopic: string | null;
  latencyMs: number | null;
  tokensUsed: number | null;
  createdAt: string;
}

export type ChatMessageRecord = ChatMessage;

/**
 * Bảng `notifications` (`Notification`):
 * - `actedAt`: thời điểm ISO timestamp khi học viên thực sự bấm vào thông báo nhắc nhở học tập của AI
 *   và quay lại hoàn thành bài học (dùng để tính tỷ lệ hiệu quả của cảnh báo/nhắc nhở AI)
 */
export interface Notification {
  id: string;
  userId: string;
  studentName: string;
  cohortId: string;
  cohortCode: string;
  type: 'AI_STUDY_REMINDER' | 'QUIZ_DEADLINE' | 'SYSTEM';
  title: string;
  message: string;
  isRead: boolean;
  sentAt: string;
  readAt: string | null;
  actedAt: string | null;
}

export type NotificationRecord = Notification;

export type AssessmentPublishStatus = 'DRAFT' | 'PUBLISHED';

export interface McqQuestionItem {
  id?: string;
  number: number;
  scenarioTag: string;
  prompt: string;
  options: [string, string, string, string] | string[];
  correctIndex: number;
  explanation: string;
  skillCode: string;
  skillName: string;
  reviewTimestampLabel: string;
  reviewJumpSec: number;
  reviewSegmentRangeSec?: [number, number];
  slideLabel: string;
}

export interface StudentSafePromptConfigItem {
  id?: string;
  number: number;
  scenarioTag: string;
  prompt: string;
  options: [string, string, string, string] | string[];
  skillCode: string;
  skillName: string;
  slideLabel: string;
}

export type StudentSafeMcqPromptItem = StudentSafePromptConfigItem;

export interface StoredMcqAttemptResult {
  assessmentId: string;
  title?: string;
  isFinalExam: boolean;
  totalQuestions: number;
  correctCount: number;
  scoreOutOf10: number;
  scorePercent?: number;
  passed: boolean;
  submittedAt: string;
  selectedAnswers: Record<number, number>;
  selectedIndices?: number[];
  updatedSkills: {
    code: string;
    name: string;
    previousScore: number;
    newScore: number;
    delta: string;
  }[];
  wrongItems: {
    number: number;
    prompt: string;
    chosenIndex: number;
    correctIndex: number;
    options: [string, string, string, string] | string[];
    explanation: string;
    reviewTimestampLabel: string;
    reviewJumpSec: number;
    reviewSegmentRangeSec: [number, number];
    slideLabel: string;
  }[];
}

