# Bộ Prompt Xây Dựng Frontend Hoàn Chỉnh Cho Google AI Studio (Gemini)

Tài liệu gồm **1 Master Prompt** (bối cảnh, design system, kiến trúc, hợp đồng dữ liệu) và **9 Phase Prompt** gửi lần lượt. Nội dung tổng hợp toàn bộ các quyết định đã chốt: mô hình Học viện tổ chức (Course → Cohort → Class Session), vai trò `STUDENT / INSTRUCTOR / ADMIN`, vai trò trong lớp `INSTRUCTOR / TA` (diễn giả khách mời tham gia qua **LiveKit Guest Invite Link** `/live/guest?token=...` không cần tạo tài khoản DB), video quay sẵn là học liệu của buổi học, hoàn thành buổi học dựa trên việc vượt qua bài kiểm tra ngắn của buổi học (`SESSION_ASSIGNMENT`), khảo thí 6 dạng câu hỏi (Trắc nghiệm + Tự luận/Code/Link GitHub/Nộp File) có **AI Co-Grader (`LLM-as-a-Judge`)** chấm nháp, bỏ Giỏ hàng, bỏ Facebook/GitHub Login, Google + Email/Password, VNPay VND, Hybrid RAG, RecSys theo kỹ năng, Live Copilot, AI Scheduler, Proctoring CV 2 tầng.

---

## 0. Cách dùng (đọc trước khi dán)

1. **Vì sao chia nhiều phase?** AI Studio (chế độ Build) có giới hạn độ dài đầu ra cho mỗi lượt. Một prompt duy nhất đòi "toàn bộ hệ thống" gần như chắc chắn sẽ bị cắt giữa chừng hoặc làm nông mọi trang. Chia phase giúp mỗi lượt làm sâu một phân hệ trên cùng một nền móng.
2. **Thứ tự:** Dán **Master Prompt** ở lượt đầu (hoặc vào *System Instructions* nếu dùng chế độ Chat), sau đó gửi **Phase 0 → Phase 8** từng lượt. Chỉ gửi phase tiếp theo khi phase trước chạy được và qua checklist.
3. **Giữ nguyên phần `Data Contracts`:** Các kiểu TypeScript trong Master Prompt được đặt tên và giá trị khớp với lược đồ PostgreSQL v2.1. Khi nối Backend thật, chỉ cần tắt mock (`VITE_USE_MOCKS=false`).
4. **Không để AI Studio gọi Gemini trực tiếp từ trình duyệt.** Mọi tính năng AI đi qua API Backend (giai đoạn này là mock). Prompt đã khóa điều này.

---

## 1. MASTER PROMPT (dán ở lượt đầu tiên)

````text
You are a senior product designer and staff frontend engineer. You will design and build, across several turns, the COMPLETE production-grade frontend of an education platform. This first message defines the product, the design system, the architecture and the data contracts. Do NOT build pages yet — reply only with a short confirmation and a list of questions if anything is ambiguous. Subsequent messages ("PHASE N") will ask you to implement specific modules on top of this foundation. Every phase must stay consistent with this document.

==================================================================
1. PRODUCT CONTEXT
==================================================================
Product name: "3T Academy" (keep the name in a single config constant so it can be renamed).
Language of ALL UI copy: Vietnamese (natural, concise, professional — no machine-translated tone). Code identifiers in English.
Locale: vi-VN. Currency: VND only, formatted with Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }). Timezone: Asia/Ho_Chi_Minh. Dates via date-fns with vi locale.

Business model (critical — do not drift):
- This is a FIRST-PARTY ACADEMY, not a marketplace. The organization (Admin) owns all courses, hires instructors and opens cohorts. There is NO instructor self-registration, NO instructor wallet/payout, NO revenue sharing, NO shopping cart, NO multi-currency, NO coupons marketplace.
- Course = the permanent subject (e.g. "AI Engineering Production"). It owns skills (prerequisites + learning outcomes) and is the unit used by recommendations.
- Cohort = one run/edition of a course (e.g. "AI-ENG-2026-K01") with its own curriculum version, tuition, seat limit, enrollment window, staff and sessions. Students buy a COHORT directly (direct checkout via VNPay).
- Class Session = the single learning unit inside a cohort. A session can be: a scheduled LIVE class (LiveKit) whose recording becomes a replay, OR a session whose main material is a PRE-RECORDED VIDEO (treated like any other session material). Each session may have attachments (PDF, slides, exercise files), subtitles, an AI summary, discussions and an optional practice assignment. Activity tags are optional labels: THEORY, EXERCISE_REVIEW, LIVE_CODING, WORKSHOP (a session can have several or none).
- Multi-domain: courses are not only programming (also English/IELTS, UI/UX design, soft skills). Never hardcode programming-only assumptions in layouts or copy; the code editor only appears where an assessment item is of type CODING or in Code Lab.
- Content is edited IN PLACE (no draft copies, no versioning UI). Statuses are simple: course DRAFT/PUBLISHED/ARCHIVED; cohort DRAFT/OPENING/ONGOING/COMPLETED/ARCHIVED.
- Substitute teaching: no request/approval workflow. Admin (or staff) simply changes the session host; the UI shows "Dạy thay cho <original host>" when original_host_id is set, and students get a notification.
- Uploaded content shows "Tải lên bởi <name> · <time>" and "Cập nhật lần cuối bởi <name>" for traceability. No moderation workflow beyond: replay of a live session must be approved ("Duyệt xuất bản & Nạp AI") or discarded; live recordings shorter than 5 minutes are auto-discarded as tests (show this as an informational state).

Roles:
- Account role: STUDENT | INSTRUCTOR | ADMIN.
- Instructor tier: STAFF | GUEST (guest = invited industry speaker).
- Role inside a cohort (cohort staff): INSTRUCTOR | TA | GUEST. INSTRUCTOR and TA can host sessions, upload materials, grade and see the whole class. GUEST sees only the sessions they host.
- ADMIN represents the organization: manages courses, skills taxonomy, cohorts, staff, schedules, users, orders, certificates, knowledge base, AI observability, system settings, and is the authority that issues/revokes certificates.

Authentication: Email + password (with email verification, forgot/reset password) AND "Tiếp tục với Google". No Facebook, no GitHub. Instructors/admins are created by Admin (invitation email), never via public sign-up.

AI capabilities (all served by backend endpoints; the frontend only renders them):
1. Course Advisor (public): answers about programs, uses PUBLIC knowledge + live data (price, seats, schedule) from backend.
2. Session Tutor (enrolled students): Hybrid RAG scoped to the student's cohort; answers include citations that are clickable: video citations seek the player to the exact second, document citations open the PDF at the page.
3. Live Copilot: rolling live transcript, "Tóm tắt 10 phút vừa qua" (catch-me-up) for latecomers, "Câu hỏi nổi bật" clusters for the host; post-session AI summary + 5 review questions.
4. Discussion AI draft answers: posts labeled "Gợi ý từ trợ giảng AI" until an INSTRUCTOR/TA marks "Đã xác nhận".
5. Knowledge-aware recommendations: (a) macro: next course with an explanation based on skill mastery ("Vì bạn đã vững Python & SQL (85%)…"); (b) micro/remedial: after an assessment, list the exact sessions + time ranges (mm:ss–mm:ss) and document pages to review per weak skill.
6. Skill mastery per student (0–1) displayed as radar, list with trend, and a prerequisite skill graph.
7. AI grading assistance: suggested score + feedback for ESSAY / CODING answers, always shown as a draft requiring human confirmation.
8. AI question generation from a session transcript (draft items, must be reviewed before saving).
9. AI Scheduler (admin): natural-language constraints → structured constraints → solver proposal (no instructor double-booking) → review → apply. Infeasible results show human-readable conflict reasons.
10. Proctoring (final exams): browser-side face/gaze/tab monitoring (MediaPipe) + server-side verification; instructor reviews an event timeline and sets a verdict.
11. Pedagogical analytics for staff: confusion heatmap along the video timeline (rewinds, pauses, timestamped questions), hardest items, weakest skills, at-risk students.
12. AI observability (admin): token usage, latency, cost, provider fallback rate, RAG evaluation runs (faithfulness, answer relevancy, context recall), trace IDs.

==================================================================
2. TECH STACK (mandatory)
==================================================================
- React 18 + TypeScript (strict, no `any`) + Vite.
- Tailwind CSS + shadcn/ui (Radix primitives). Build a small set of composed components on top; do not install another UI kit.
- React Router v6 with route-level code splitting (React.lazy + Suspense) for EVERY page.
- TanStack Query v5 for all server state (query keys factory per feature, staleTime defaults, optimistic updates where it improves UX). Zustand only for small client state (theme, sidebar, player prefs).
- react-hook-form + zod for every form; zod schemas double as runtime validation of API responses in the mock layer.
- lucide-react icons (stroke 1.75). Recharts for charts. @monaco-editor/react for code. hls.js for video. @livekit/components-react for the live room UI (wired to a mock room in this phase). react-markdown + rehype-sanitize (and DOMPurify for any HTML) for user content. date-fns. sonner for toasts. framer-motion ONLY for small, purposeful transitions.
- FORBIDDEN: three.js or any 3D, Lottie mascots, particle backgrounds, calling Gemini/any LLM directly from the browser, storing access tokens in localStorage.

==================================================================
3. ARCHITECTURE
==================================================================
Folder structure (feature-sliced):
src/
  app/            router.tsx, providers.tsx, guards (RequireAuth, RequireRole, RequireCohortStaff), ErrorBoundary, layouts
  shared/
    ui/           design-system components (Button, Input, Badge, Card, DataTable, EmptyState, ErrorState, Skeletons, PageHeader, StatCard, Stepper, Timeline, KeyValue, Kbd, etc.)
    lib/          apiClient.ts, sse.ts, format.ts (money, dates, durations mm:ss), sanitize.ts, cn.ts
    config/       env, product constants
    types/        contracts.ts (data contracts below)
  mocks/          fixtures/*.ts, handlers/*.ts, mockServer.ts (in-memory DB, latency 250–900ms, 5% random error toggle via ?chaos=1)
  features/
    auth, onboarding, catalog, checkout, student-dashboard, cohort-workspace, session, live-room,
    assessments, code-lab, code-review, proctoring, progress, recommendations, chat, certificates,
    notifications, settings, teach, admin
  pages/          thin route components composing feature modules

API layer:
- apiClient(baseURL = '/api/v1') with typed methods, X-Request-ID header (uuid) on every request, 401 → silent refresh (POST /auth/refresh with httpOnly cookie) → retry once → logout.
- Access token kept in memory only. Simulate this in mocks.
- A single switch VITE_USE_MOCKS=true routes every call to mockServer. Feature code must not know whether it talks to mocks.
- Streaming (AI chat, live transcript): implement sse.ts that consumes text/event-stream via fetch + ReadableStream; mocks emit tokens with realistic delays (20–60ms per token) and a final event with citations.
- Errors: normalize to { status, code, message, requestId }. ErrorState shows the requestId (copy button) for support.

Security rules in UI:
- Route guards by account role and by cohort staff role.
- Student-facing assessment views must NEVER receive or render grading_config (answer keys, rubrics, test cases); type the student DTO without it.
- Secure video player overlays a dynamic watermark (email + short user id) that moves to a random position every ~12s, stays in fullscreen, and is re-inserted if removed from the DOM (MutationObserver).
- Disable right-click on the player area only (not globally).

==================================================================
4. DESIGN SYSTEM & VISUAL IDENTITY
==================================================================
Direction: calm, precise, editorial, engineering-grade. A real product people use for hours every day. Information first, decoration last. The interface should feel like a carefully crafted SaaS tool built by a design-literate team — NOT like an AI-generated template.

ANTI-"AI LOOK" RULES (strict):
- No purple/indigo-to-blue gradients, no gradient text, no glowing blobs, no glassmorphism panels, no aurora backgrounds.
- No sparkle/✨ icons or "AI-powered" badges sprinkled everywhere. AI features are identified by a single consistent, subtle marker: a small monochrome label "AI" in a rounded-sm outline badge, used only where content is machine-generated.
- No emoji in UI copy. No generic hero with a laptop mockup and floating cards. No centered-everything landing pages.
- No excessive shadows; prefer 1px borders and tonal surfaces. Shadows only for overlays (popover, dialog, dropdown).
- No stock illustration packs. Empty states use a simple line icon + precise copy + one primary action.

Color tokens (CSS variables, shadcn HSL format; provide light and dark themes):
- Neutrals: warm stone scale. Light background #FAFAF9, surface #FFFFFF, subtle surface #F5F5F4, border #E7E5E4, text #1C1917, muted text #78716C. Dark background #0E0F10, surface #151617, border #26282A, text #ECECEA, muted #9A9A96.
- Primary (brand): deep teal #0D7C72 (hover #0A6A61; dark theme #3DB4A6). Used for primary actions, active nav, focus rings, links.
- Live/recording accent: #E5484D (only for LIVE states, recording dot, live badges).
- Semantic: success #2F855A, warning #B7791F, danger #C53030, info #2B6CB0 (with 10% tint backgrounds for badges/alerts).
- Chart palette (ordered): #0D7C72, #2B6CB0, #B7791F, #8B5E3C, #64748B. Never rely on color alone; add labels/patterns.
- Contrast must meet WCAG AA in both themes.

Typography:
- UI font: "Be Vietnam Pro" (excellent Vietnamese diacritics), weights 400/500/600. Monospace: "JetBrains Mono" for code, IDs, timestamps, numbers in tables (use tabular-nums).
- Scale (px): 12, 13, 14 (default app body), 16 (reading/public body), 18, 20, 24, 30, 36. Line-height 1.5 body, 1.25 headings. Letter-spacing -0.01em for headings ≥24px.
- Long-form reading (session description, AI summary, markdown): max-width 70ch, 16px, comfortable paragraph spacing.

Spacing, radius, layout:
- 4px base grid. Common gaps 8/12/16/24/32. Radius: 6px controls, 8px cards, 12px dialogs. Hairline borders.
- App shell: left sidebar 248px (collapsible to 64px icon rail, state persisted), top bar 56px with breadcrumbs, global search (⌘K / Ctrl+K command palette), "Đang LIVE" pill when a session the user can join is live, notifications bell (realtime via SSE mock), user menu with theme switch.
- Content widths: dashboards fluid up to 1440px with 12-column grid; forms up to 720px; reading 70ch.
- Density: comfortable by default; tables offer a compact toggle.

Motion & micro-interactions:
- Durations 120ms (hover/press), 180ms (popover, tabs), 240ms (dialog, drawer). Easing cubic-bezier(0.2, 0, 0, 1). No bouncy springs except tiny scale on drag handles.
- Meaningful only: optimistic check animation on "mark complete", number count-up on stat cards (once), progress bar fills, skeleton shimmer (subtle), toast slide-in, live dot pulse.
- Respect prefers-reduced-motion (disable non-essential motion).

Component states (every interactive/data component must implement):
- Loading: layout-matching skeletons (never a lone spinner on full pages; spinners only inside buttons).
- Empty: icon + one-sentence explanation + primary action (e.g. "Chưa có bài tập nào cần chấm").
- Error: inline ErrorState with retry and requestId; field-level form errors in Vietnamese.
- Success: toast + inline confirmation where relevant.
- Hover/focus/active/disabled states; visible 2px focus ring (primary color, offset 2px).
- Destructive actions use a confirm dialog naming the object ("Xóa tài liệu 'Bai_tap_buoi_1.pdf'?").

Accessibility: semantic landmarks, keyboard navigation for all flows (including assessment taking and grading with shortcuts), aria-live for streaming AI responses and proctoring warnings, alt text, focus trap in dialogs, skip-to-content link.

Responsive: breakpoints sm 640, md 768, lg 1024, xl 1280, 2xl 1536. Sidebar becomes a sheet on <lg. Session page: player stacks above tabs on mobile; tutor panel becomes a bottom sheet. Tables become card lists on <md. Live room has a dedicated mobile layout (stage + bottom tab bar for chat/Q&A/copilot). Monaco editor is usable on tablet; on phones show read-only code with a notice.

==================================================================
5. DATA CONTRACTS (src/shared/types/contracts.ts) — keep names exactly
==================================================================
type ID = number;
type ISODate = string;

type AccountRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
type AccountStatus = 'ACTIVE' | 'LOCKED';
type CohortStaffRole = 'INSTRUCTOR' | 'TA';
type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type CohortStatus = 'DRAFT' | 'OPENING' | 'ONGOING' | 'COMPLETED' | 'ARCHIVED';
type SessionStatus = 'SCHEDULED' | 'LIVE' | 'PROCESSING_REPLAY' | 'REPLAY_READY';
type ActivityTag = 'THEORY' | 'EXERCISE_REVIEW' | 'LIVE_CODING' | 'WORKSHOP';
type VideoProvider = 'R2_HLS_AES128' | 'YOUTUBE_PUBLIC' | 'BUNNY_STREAM';
type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELED';
type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'REVOKED';
type AssessmentPurpose = 'SESSION_ASSIGNMENT' | 'FINAL_EXAM';
type GradingMode = 'AUTO' | 'MANUAL' | 'HYBRID';
type ItemType = 'SINGLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY' | 'FILE_SUBMISSION';
type AnswerGradingStatus = 'AUTO_GRADED' | 'PENDING_MANUAL' | 'MANUALLY_GRADED';
type IntegrityVerdict = 'CLEAN' | 'FLAGGED' | 'CONFIRMED_CHEAT' | 'CLEARED_BY_INSTRUCTOR';
type ChunkVisibility = 'PUBLIC' | 'ENROLLED_ONLY';
type ChatScope = 'ADVISOR_GLOBAL' | 'SESSION_TUTOR' | 'LIVE_COPILOT';
type SkillRelationRole = 'PREREQUISITE' | 'LEARNING_OUTCOME';

interface Account { id: ID; email: string; role: AccountRole; status: AccountStatus; emailVerifiedAt: ISODate | null; hasPassword: boolean; googleLinked: boolean; profile: UserProfile; instructorProfile?: InstructorProfile; }
interface UserProfile { fullName: string; avatarUrl: string | null; bio: string | null; careerGoal: string | null; hasFaceReference: boolean; }
interface InstructorProfile { headline: string; organization: string | null; yearsOfExperience: number | null; expertiseSummaryMd: string | null; socialLinks: Record<string, string>; }
interface Category { id: ID; name: string; slug: string; parentId: ID | null; }
interface Skill { id: ID; code: string; name: string; categoryId: ID | null; description: string | null; }
interface CourseSkill { skill: Skill; role: SkillRelationRole; targetWeight: number; }
interface Course { id: ID; slug: string; title: string; shortDescription: string; descriptionMd: string; thumbnailUrl: string | null; previewYoutubeUrl: string | null; difficultyLevel: 1|2|3|4|5; category: Category; skills: CourseSkill[]; syllabusTemplate: { order: number; title: string; activityTags: ActivityTag[] }[]; status: CourseStatus; ratingAvg: number | null; reviewCount: number; }
interface CohortStaff { account: Pick<Account,'id'|'email'> & { profile: UserProfile; instructorProfile?: InstructorProfile }; role: CohortStaffRole; scopeNote: string | null; }
interface Cohort { id: ID; courseId: ID; code: string; name: string; curriculumVersion: string; techStackNotes: string | null; tuitionVnd: number; enrolledCount: number; enrollmentOpenAt: ISODate; startDate: string; endDate: string; replayExpiresAt: ISODate | null; status: CohortStatus; staff: CohortStaff[]; }
interface SessionAttachment { id: ID; fileName: string; mimeType: string; fileSizeBytes: number; uploadedBy: { id: ID; fullName: string }; createdAt: ISODate; }
interface SessionSubtitle { id: ID; languageCode: string; isAutoGenerated: boolean; vttUrl: string; }
interface ClassSession { id: ID; cohortId: ID; sessionOrder: number; title: string; descriptionMd: string | null; activityTags: ActivityTag[]; isFreePreview: boolean; host: { id: ID; fullName: string; avatarUrl: string | null }; scheduledStart: ISODate | null; scheduledEnd: ISODate | null; status: SessionStatus; videoProvider: VideoProvider | null; durationSeconds: number | null; aiSummaryMd: string | null; attachments: SessionAttachment[]; subtitles: SessionSubtitle[]; lastUpdatedBy: { id: ID; fullName: string } | null; updatedAt: ISODate; }
interface PlaybackSession { manifestUrl: string; provider: VideoProvider; expiresAt: ISODate; watermark: { email: string; shortId: string }; }
interface TranscriptSegment { startSec: number; endSec: number; text: string; }
interface Order { id: ID; orderCode: string; cohort: Pick<Cohort,'id'|'code'|'name'>; courseTitle: string; amountVnd: number; status: OrderStatus; paidAt: ISODate | null; expiresAt: ISODate; createdAt: ISODate; }
interface PaymentTransaction { id: ID; gateway: 'VNPAY'; gatewayTxnId: string; amountVnd: number; responseCode: string; rawPayload: Record<string, unknown>; createdAt: ISODate; }
interface Enrollment { id: ID; cohort: Cohort; course: Pick<Course,'id'|'slug'|'title'|'thumbnailUrl'>; status: EnrollmentStatus; finalExamPassed: boolean; enrolledAt: ISODate; completedAt: ISODate | null; progressPct: number; completedSessions: number; totalSessions: number; }
interface SessionProgress { sessionId: ID; lastPositionSec: number; isCompleted: boolean; completedAt: ISODate | null; lastActivityAt: ISODate; }
interface Assessment { id: ID; cohortId: ID; sessionId: ID | null; purpose: AssessmentPurpose; gradingMode: GradingMode; title: string; instructionsMd: string | null; durationMinutes: number | null; passScorePct: number; maxAttempts: number | null; dueAt: ISODate | null; proctoringConfig: { enabled: boolean; requireFaceMatch: boolean; requireFullscreen: boolean; maxRiskScore: number }; itemCount: number; totalPoints: number; }
// Student-safe item (NO grading config)
interface AssessmentItemStudent { id: ID; itemOrder: number; itemType: ItemType; points: number; skill: Pick<Skill,'id'|'name'>; prompt: ItemPrompt; }
type ItemPrompt =
  | { type: 'SINGLE_CHOICE' | 'MULTI_SELECT'; stemMd: string; options: { id: string; text: string }[] }
  | { type: 'TRUE_FALSE'; stemMd: string }
  | { type: 'SHORT_ANSWER'; stemMd: string; maxLength: number }
  | { type: 'ESSAY'; stemMd: string; minWords?: number; maxWords?: number; allowGithubUrl?: boolean }
  | { type: 'FILE_SUBMISSION'; stemMd: string; acceptedMimeTypes: string[]; maxSizeMb: number };
// Staff-only item
interface AssessmentItemStaff extends AssessmentItemStudent { grading: ItemGrading; explanationMd: string | null; }
type ItemGrading =
  | { type: 'SINGLE_CHOICE' | 'TRUE_FALSE'; correct: string }
  | { type: 'MULTI_SELECT'; correct: string[]; partialCredit: boolean }
  | { type: 'SHORT_ANSWER'; acceptedAnswers: string[]; caseSensitive: boolean }
  | { type: 'ESSAY' | 'FILE_SUBMISSION'; rubric: RubricCriterion[] };
interface RubricCriterion { id: string; title: string; description: string; maxPoints: number; }
interface SubmissionAnswer { id: ID; itemId: ID; responseData: unknown; gradingStatus: AnswerGradingStatus; autoScore: number | null; manualScore: number | null; finalScore: number | null; isCorrect: boolean | null; feedbackMd: string | null; aiSuggestion?: { score: number; feedbackMd: string; rubricScores: Record<string, number> } | null; gradedBy: { id: ID; fullName: string } | null; gradedAt: ISODate | null; }
interface AssessmentAttempt { id: ID; assessmentId: ID; attemptNumber: number; startedAt: ISODate; expiresAt: ISODate | null; submittedAt: ISODate | null; gradingCompletedAt: ISODate | null; totalScore: number | null; maxPossibleScore: number | null; scorePct: number | null; isPassed: boolean | null; totalRiskScore: number; integrityStatus: IntegrityVerdict; answers: SubmissionAnswer[]; remedial: RemedialItem[] | null; }
interface RemedialItem { skill: Pick<Skill,'id'|'name'>; masteryBefore: number; masteryAfter: number; resources: ({ kind: 'VIDEO'; sessionId: ID; sessionTitle: string; startSec: number; endSec: number } | { kind: 'DOCUMENT'; sessionId: ID; attachmentId: ID; fileName: string; page: number })[]; }
interface ProctoringEvent { id: ID; occurredAt: ISODate; videoOffsetSec: number | null; tier: 'EDGE' | 'SERVER'; eventType: 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURNED' | 'TAB_HIDDEN' | 'FULLSCREEN_EXIT' | 'PHONE_DETECTED' | 'FACE_MISMATCH'; confidence: number; riskDelta: number; snapshotUrl: string | null; }
interface StudentSkillState { skill: Skill; masteryScore: number; evidenceCount: number; trend: number; updatedAt: ISODate; }
interface CourseRecommendation { course: Course; nextCohort: Cohort | null; score: number; reasons: string[]; }
interface DiscussionThread { id: ID; sessionId: ID; title: string; author: { id: ID; fullName: string; avatarUrl: string | null }; videoTimestampSec: number | null; isResolved: boolean; postCount: number; hasVerifiedAnswer: boolean; createdAt: ISODate; }
interface DiscussionPost { id: ID; threadId: ID; parentPostId: ID | null; author: { id: ID; fullName: string; avatarUrl: string | null; cohortRole?: CohortStaffRole } | null; contentMd: string; isAiGenerated: boolean; isInstructorVerified: boolean; verifiedBy: { id: ID; fullName: string } | null; createdAt: ISODate; updatedAt: ISODate; }
interface Citation { kind: 'VIDEO' | 'DOCUMENT' | 'FAQ'; label: string; sessionId?: ID; startSec?: number; endSec?: number; attachmentId?: ID; page?: number; snippet: string; }
interface ChatSession { publicId: string; scope: ChatScope; cohortId: ID | null; sessionId: ID | null; title: string | null; updatedAt: ISODate; }
interface ChatMessage { id: ID; role: 'user' | 'assistant'; content: string; citations: Citation[]; createdAt: ISODate; }
interface Notification { id: ID; type: string; title: string; body: string; metadata: Record<string, unknown>; isRead: boolean; createdAt: ISODate; }
interface Certificate { id: ID; certificateCode: string; courseTitle: string; cohortCode: string; studentName: string; issuedAt: ISODate; revokedAt: ISODate | null; revokeReason: string | null; verifyUrl: string; }
interface CourseReview { id: ID; rating: 1|2|3|4|5; comment: string | null; author: { fullName: string; avatarUrl: string | null }; cohortCode: string; createdAt: ISODate; }
interface AvailabilitySlot { id: ID; dayOfWeek: 0|1|2|3|4|5|6; startMinute: number; endMinute: number; }
interface SystemSetting { key: string; value: string; description: string | null; isPublic: boolean; updatedAt: ISODate; }
interface Paginated<T> { items: T[]; page: number; pageSize: number; total: number; }

Mock data must be realistic and Vietnamese: at least 6 courses across domains (AI Engineering Production, Backend Node.js & PostgreSQL, Frontend React thực chiến, Data Analysis với SQL & Python, IELTS Speaking thực chiến, UI/UX Design với Figma), 2–3 cohorts per course in different statuses, 12+ sessions per ongoing cohort mixing live replays and pre-recorded videos, 8 staff (STAFF + GUEST, INSTRUCTOR/TA roles), 40 students, assessments of every item type, proctoring events, orders in every status, notifications, discussions with AI drafts and verified answers. Use a public sample HLS stream for video in mocks.

==================================================================
6. GLOBAL QUALITY BAR (applies to every phase)
==================================================================
- Every page: loading skeleton, empty state, error state with retry, success feedback, responsive layout, keyboard accessible, Vietnamese copy, page <title> set.
- No dead buttons: every visible action works against the mock API or opens a clear "sắp ra mắt" disabled tooltip (use sparingly).
- Reuse shared components; no one-off styles. No inline magic colors — tokens only.
- Keep components under ~250 lines; extract hooks (useXxxQuery, useXxxMutation) per feature.
- Each phase ends with: list of files created/changed, routes added, and a manual test checklist.

Reply now with: (1) a one-paragraph confirmation of the product and design direction in your own words, (2) any blocking questions. Do not write code yet.
````

---

## 2. PHASE PROMPTS (gửi lần lượt sau Master Prompt)

### Phase 0 — Nền móng: Design System, App Shell, Router, Mock API, Auth

````text
PHASE 0 — Foundation. Implement:
1. Project setup with the mandated stack, Tailwind + shadcn theme using the exact tokens (light/dark), fonts Be Vietnam Pro + JetBrains Mono, global CSS, reduced-motion handling.
2. shared/ui design-system components with all states: Button (variants primary/secondary/ghost/outline/destructive/link; sizes; loading), Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, DatePicker, FileDropzone (progress, validation errors), Badge (status variants incl. LIVE with pulsing dot, AI outline badge), Card, StatCard (count-up once), PageHeader (title, description, actions, breadcrumbs), Tabs, DataTable (sorting, filtering, pagination, column visibility, row selection, compact density, card fallback on mobile), EmptyState, ErrorState (requestId copy), Skeleton presets (card, table, list, page), Timeline, Stepper, KeyValueList, Avatar/AvatarGroup, Tooltip, Dialog, ConfirmDialog, Sheet/Drawer, DropdownMenu, CommandPalette (⌘K), Toast (sonner), ProgressBar, CircularProgress, Kbd, MarkdownRenderer (sanitized), MoneyText, DateText, DurationText.
3. Layouts: PublicLayout (top nav, footer), AuthLayout (split: form + calm product panel with real UI snippets, not illustrations), AppLayout with role-aware sidebar (Student /app, Teach /teach, Admin /admin), top bar (breadcrumbs, ⌘K search, LIVE pill, notifications bell with realtime mock SSE + popover list, user menu with theme toggle and role-portal switch when applicable), LiveLayout (full-screen, no shell).
4. Router with React.lazy for every page, guards (RequireAuth, RequireRole, RequireCohortStaff), 404, 403, 500 pages designed like the rest of the product, global ErrorBoundary.
5. apiClient, sse.ts, mockServer with in-memory DB, latency, ?chaos=1 error injection, X-Request-ID, silent refresh simulation; query key factories.
6. Auth feature: /login, /register, /forgot-password, /reset-password/:token, /verify-email (pending + success + expired states), "Tiếp tục với Google" (mock OAuth popup flow → account linking message if the email already exists), password strength meter, rate-limit error state ("Thử lại sau 60 giây"), demo account quick-switch panel visible only in mock mode (Student, Instructor STAFF, TA, Guest speaker, Admin).
7. /onboarding (students after first login, skippable but resumable): Step 1 career goal (free text + suggested goals chips), Step 2 diagnostic quiz of 5 questions (adaptive look, no score shame), Step 3 optional face reference capture (camera permission handling, guidelines, retake, privacy notice; explain it is required only before proctored final exams), Step 4 result: initial skill profile + 3 recommended courses with reasons.
Deliver a style guide page at /_design (dev only) showcasing every component and state in both themes.
````

### Phase 1 — Website công khai, Danh mục, Chi tiết khóa học, Thanh toán

````text
PHASE 1 — Public site & checkout. Implement:
1. "/" Home: editorial layout (not a generic SaaS hero). Sections: headline + concise value proposition + search; "Lớp sắp khai giảng" (cohort cards: course, cohort code, start date, schedule summary, seats left bar, price, enrollment closes in X days); programs by category (multi-domain); "Cách học tại 3T Academy" as a real timeline of a cohort (Live → Replay & tài liệu → Bài tập → Thi cuối khóa có giám sát → Chứng chỉ xác thực); instructors strip (STAFF and GUEST distinguished subtly); verified reviews; FAQ accordion; entry to AI Advisor.
2. "/courses" Catalog: search (debounced, shows matched skills), filters (category tree, difficulty, skills multi-select, "Đang mở đăng ký", price range, start month), sort, result count, URL-synced filters, grid/list toggle, skeletons, empty state with "Xóa bộ lọc".
3. "/courses/:slug" Course detail: header (title, category, difficulty, rating), tabs or anchored sections: Tổng quan (markdown), Kỹ năng đầu ra & Kỹ năng cần có (chips with tooltips; if logged in show the student's mastery vs prerequisite with a readiness indicator), Lộ trình (syllabus template with activity tags), Các đợt khai giảng (cohort table/cards: status, enrollment window, dates, weekly schedule, staff with roles, seats, price; disabled states: "Đã đóng đăng ký", "Hết chỗ", "Sắp mở"), Giảng viên, Đánh giá (rating distribution + list + filter by cohort), FAQ, free preview session player (YouTube). Sticky enroll card (desktop) / bottom bar (mobile). If logged in and the chosen cohort conflicts with an ongoing cohort schedule, show a soft amber warning listing the conflicting sessions; user can still proceed.
4. "/instructors" and "/instructors/:id": profile (headline, organization, experience, expertise, links, cohorts taught, GUEST label "Chuyên gia khách mời").
5. "/advisor": public AI Course Advisor chat (streaming, suggested questions, course cards rendered inline from structured responses, live data like price/seats labeled "Dữ liệu thời gian thực"), login prompt to keep history.
6. "/verify/:certificateCode": public certificate verification (valid, revoked with reason, not found) with QR, student name, course, cohort, issue date, signature status.
7. Checkout "/checkout/:cohortCode": requires login; order summary; enrollment window validation; terms checkbox; "Thanh toán qua VNPay" → mock redirect page → "/checkout/result?order=…" with states PAID (confetti NOT allowed; use a calm success panel with next steps and calendar add), PENDING (polling with backoff, explanation), FAILED/EXPIRED/CANCELED (retry creates a new attempt, idempotency key per click to prevent duplicate orders), already enrolled guard.
````

### Phase 2 — Không gian học của học viên: Dashboard, Workspace đợt học, Trang buổi học

````text
PHASE 2 — Student learning experience. Implement:
1. "/app" Student dashboard: "Hôm nay" (sessions today; prominent LIVE banner with Join when a session is live; countdown when starting within 60 min), Continue learning (last session with resume position), Deadlines (assignments due, overdue in danger tone), Skill snapshot (mini radar + 3 weakest skills with "Ôn tập ngay" linking to remedial resources), Streak & weekly activity, Recommendations (next best action + course recommendation with reasons, labeled AI), recent notifications.
2. "/app/learning": enrolled cohorts (progress ring, next session, status), filters active/completed.
3. "/app/cohorts/:cohortId" Cohort workspace with header (course, cohort code, curriculum version, progress, staff avatars) and tabs:
   - Buổi học: vertical timeline grouped by week; each item shows order, title, activity tags, host (and "Dạy thay cho …" if applicable), status (SCHEDULED with date/time, LIVE, PROCESSING_REPLAY "Đang xử lý bản ghi", REPLAY_READY with duration, pre-recorded video badge), completion check, attachments count, assignment badge.
   - Lịch: week/month calendar of sessions with .ics export per session.
   - Bài tập: list with status (chưa làm, đang làm, đã nộp – chờ chấm, đã chấm, quá hạn), due dates, scores.
   - Thảo luận: all threads across sessions with filters (chưa giải quyết, có câu trả lời xác nhận, của tôi).
   - Điểm số: gradebook for the student.
   - Tài liệu: all attachments across sessions, searchable.
4. "/app/cohorts/:cohortId/sessions/:sessionId" Session page, state-driven:
   - SCHEDULED: countdown, preparation materials, description, add to calendar, notify toggle.
   - LIVE: big "Vào lớp học trực tiếp" CTA → /live/:sessionId, live attendees count.
   - PROCESSING_REPLAY: informative state with pipeline steps (Lưu bản ghi → Chuyển mã HLS → Tạo phụ đề → Tạo tóm tắt AI) and ETA.
   - REPLAY_READY / pre-recorded: layout = SecureHlsPlayer (left/top) + right panel tabs on desktop.
   SecureHlsPlayer: hls.js, quality selector, speed 0.5–2x, subtitles toggle/language, keyboard shortcuts (space, j/k/l, ←/→ 5s, f, c, m), resume from last position, chapter markers derived from AI summary headings, dynamic watermark (as specified), progress heartbeat every 15s (debounced), auto mark complete at 90% watched with optimistic UI, confusion markers hidden for students.
   Right panel tabs: "Bản ghi lời giảng" (transcript synced with playback, auto-scroll toggle, click line to seek, search within transcript), "Tóm tắt AI" (markdown, AI badge, "Nội dung do AI tạo, có thể chưa chính xác"), "Tài liệu" (attachments with type icon, size, uploaded by & time, preview PDF in a side sheet, download), "Thảo luận" (threads for this session; create thread with optional "Gắn mốc thời gian hiện tại mm:ss"; posts tree with replies; AI draft answers labeled; verified answers highlighted with verifier name; mark resolved by author), "Trợ giảng AI" (Session Tutor chat: streaming, citations as chips — video citation seeks player, document citation opens PDF page; conversation persists; new conversation; out-of-scope refusal state).
   Below player: title, tags, host, description (markdown), practice assignment card, prev/next session navigation.
````

### Phase 3 — Phòng học trực tiếp (Live Room) & AI Live Copilot

````text
PHASE 3 — Live room "/live/:sessionId" (LiveLayout). Use @livekit/components-react UI with a mock room (fake participants, simulated video tiles with avatars, simulated audio levels). Implement:
1. Pre-join lobby: camera/mic preview and device selectors, mic level meter, permission denied/blocked states with how-to-fix, network check, display name, role-aware copy (host vs student), "Vào lớp".
2. Main layout: stage (screen share or host camera large; speaker view / grid toggle), participant strip with speaking indicators, top bar (session title, LIVE badge with elapsed time, recording indicator, connection quality, participant count, leave), bottom control bar (mic, camera, share screen [host/TA], raise hand, reactions, chat/Q&A/copilot toggles, settings, leave with confirm).
3. Right side panel tabs: Chat (messages, mentions, links), Hỏi đáp (questions with upvotes, sort by votes/time, host can mark answered/pin), AI Copilot: rolling live transcript (aria-live polite), "Tóm tắt 10 phút vừa qua" button producing a streamed summary for latecomers, and for host/TA a "Câu hỏi nổi bật" panel clustering similar questions with counts.
4. Host controls (INSTRUCTOR/TA hosting): start session (sets actualStartedAt), end session dialog (warns that recordings < 5 minutes are discarded automatically as tests), mute participant, spotlight, remove participant (confirm), lower all hands, attendance panel (join time, duration).
5. Post-session screen: for students "Buổi học đã kết thúc" with what happens next (replay processing, AI summary, review questions); for host a summary (duration, attendance, questions count) and link to approve the replay in the teaching portal.
6. Mobile layout: stage + bottom tab bar (Chat / Hỏi đáp / Copilot / Người tham gia).
7. Reconnecting overlay, host-left state, session-not-started waiting room with countdown, not-enrolled 403 state.
````

### Phase 4 — Bài tập & Thi: 6 dạng câu hỏi, AI Co-Grader, Phòng thi giám sát

````text
PHASE 4 — Assessments, AI Co-Grader review and proctored exam. Implement:
1. "/app/assessments/:assessmentId" Intro: purpose (Bài tập buổi học / Thi cuối khóa), rules, duration, attempts used/max, due date, pass score, skills covered, previous attempts list. Start button (confirm if timed).
2. Taking view "/app/assessments/:assessmentId/attempts/:attemptId": header with timer (warning at 5 and 1 minute, aria-live), autosave indicator ("Đã lưu lúc 20:14"), question palette (answered / flagged / current), flag for review, keyboard navigation, submit with summary of unanswered/flagged. Renderers for EVERY ItemType:
   - SINGLE_CHOICE (radio cards), MULTI_SELECT (checkbox cards, "Chọn tất cả đáp án đúng"), TRUE_FALSE, SHORT_ANSWER (with char counter), ESSAY (markdown editor with preview, code snippet formatting, optional GitHub Repo URL field, word count vs min/max), FILE_SUBMISSION (dropzone, accepted types .zip/.pdf/audio, size limit, upload progress, replace/remove; works for audio files too e.g. IELTS speaking recordings with an inline audio player and a "Ghi âm" option using MediaRecorder).
   Network loss: queue answers locally and sync when back online; banner.
3. Result page: score and pass/fail (if fully auto graded) or "Đang chờ chấm thủ công N câu"; passing a SESSION_ASSIGNMENT automatically marks the session as completed (`isCompleted = true`); per-item review (student's answer, correctness, explanation when allowed, feedback, rubric scores, AI Co-Grader suggestion); "Kỹ năng thay đổi" (mastery before→after per skill); Remedial plan (AI badge) listing sessions with time ranges (click → session page seeking to startSec) and document pages; retake button if attempts remain.
4. Submission review view for students "/app/submissions/:answerId": read-only student submission (Markdown, formatted code blocks, GitHub repository link, or attached file), overall feedback, AI Co-Grader evaluation & rubric breakdown.
5. Proctored final exam flow "/app/exams/:assessmentId":
   - Pre-check stepper: (1) system check: camera, fullscreen support, browser compatibility, stable connection; (2) identity verification: live face capture compared to reference (mock result: matched / retry / mismatch → contact support), missing reference → link to settings; (3) rules & privacy consent (what is monitored, what is stored: only event snapshots, retention period); (4) start.
   - Exam taking: same item renderers + fullscreen enforced (exit → warning modal + event), small draggable webcam preview tile, proctoring status chip (Ổn định / Cảnh báo / Nghiêm trọng) driven by mock events (NO_FACE, MULTI_FACE, HEAD_TURNED, TAB_HIDDEN), non-blocking warning toasts with aria-live assertive, counter of warnings, never accuse — neutral wording ("Không phát hiện khuôn mặt trong khung hình. Vui lòng ngồi đối diện camera.").
   - Submission screen: submitted, grading status, integrity review notice if flagged ("Bài thi đang được giảng viên xem lại").
````

### Phase 5 — Tiến độ, Năng lực, Lộ trình, Chat AI, Chứng chỉ, Hóa đơn, Cài đặt

````text
PHASE 5 — Student insight & account. Implement:
1. "/app/progress" Learning report: overview stat cards (enrolled cohorts, completed sessions, total learning time, average completion), weekly activity heatmap (GitHub-style but in brand teal), streak calendar, quiz/assessment performance over time (line chart), skill mastery radar (top 8 skills) + full skill table (mastery bar, evidence count, trend arrow, last updated, "Ôn tập" action), AI learning report card (overall assessment, strengths, areas to improve, recommendations; AI badge; regenerate with cooldown).
2. "/app/path" Learning path: prerequisite skill graph (DAG) rendered with a lightweight layout (e.g. dagre + SVG), nodes colored by mastery (vững / đang học / chưa đủ điều kiện), click node → side panel with related sessions and courses; "Khóa học nên học tiếp" list with readiness score and explicit reasons (Zone of Proximal Development explanation in plain Vietnamese).
3. "/app/chats": conversation list grouped by scope (Tư vấn chung / Trợ giảng theo buổi), search, rename, delete with confirm; conversation view with streaming, citations, copy, regenerate last answer, feedback thumbs (sends to backend for evaluation), empty state with suggested prompts relevant to the student's current sessions.
4. "/app/certificates": list (issued, revoked), certificate view (clean printable layout with QR and verification URL), download PDF (print stylesheet), copy share link; eligibility hints for in-progress cohorts (completion % and final exam requirement).
5. "/app/notifications": full list with filters (tất cả, chưa đọc, lớp học, bài tập, hệ thống), mark all read, deep links, realtime insert animation.
6. "/app/billing": orders with status badges, detail drawer (cohort, amount, payment attempts, timestamps), retry payment for PENDING/FAILED if enrollment window still open.
7. "/app/settings": Hồ sơ (avatar upload with crop, name, bio, career goal), Bảo mật (change/set password — handle Google-only accounts with hasPassword=false, link/unlink Google with safety rule: cannot unlink if no password), Khuôn mặt tham chiếu (view status, re-capture, delete with consequences explained), Thông báo (email/in-app toggles per category), Giao diện (theme light/dark/system, density, reduced motion), Phiên đăng nhập (active sessions list with revoke — mock).
````

### Phase 6 — Cổng Giảng dạy (Instructor / TA / Guest)

````text
PHASE 6 — Teaching portal "/teach" for INSTRUCTOR accounts; capabilities depend on cohort staff role (INSTRUCTOR/TA full cohort access; GUEST only hosted sessions). Implement:
1. "/teach" dashboard: today's sessions to host (start live CTA within 15 minutes of start), grading queue count by cohort, at-risk students (signals: missed sessions, low scores, inactivity) with reasons, replays awaiting approval, upcoming week calendar.
2. "/teach/schedule": calendar of hosted sessions across cohorts (week/month/agenda), shows substitutions ("Dạy thay cho …").
3. "/teach/availability": weekly availability grid (drag to create/resize slots in 15-min steps, copy day, clear), shows that GUEST tier is not auto-scheduled.
4. "/teach/cohorts" list and "/teach/cohorts/:cohortId" management with tabs:
   - Tổng quan: roster (search, progress, attendance %, last activity, risk flag), cohort health charts.
   - Buổi học: sessions table; session editor drawer (title, description markdown with preview, activity tags multi-select, free preview toggle, host shown read-only for TA/INSTRUCTOR unless admin), Materials: upload attachments (multi-file, progress, uploaded-by), upload or replace pre-recorded video with a visible processing pipeline (Đang tải lên → Chuyển mã HLS → Tạo phụ đề → Lập chỉ mục AI → Sẵn sàng; failure state with retry), replacing a video warns that AI knowledge for this session will be rebuilt; subtitles manager (auto-generated vs uploaded .vtt, edit language, download); Replay approval for finished live sessions ("Duyệt xuất bản & Nạp AI" or "Hủy bản ghi" with confirm); AI summary edit; "Last updated by" footer.
   - Bài tập: assessments list per session and final exam.
   - Sổ điểm: gradebook matrix (students × assessments), cell states, export CSV.
   - Thảo luận: moderation queue (unanswered first), verify/edit AI draft answers, answer as staff (role badge shown), mark resolved.
   - Phân tích: confusion heatmap along each session's video timeline (rewind/pause density + timestamped questions; click a hotspot → see transcript excerpt and questions), hardest items table (p-value, discrimination), weakest skills of the class, attendance trend.
5. Assessment builder "/teach/assessments/:id/edit": settings (purpose, grading mode, duration, pass score, attempts, due date, proctoring config for final exams), item list with drag reorder, item editor per type with prompt config AND grading config (answer key / partial credit / accepted answers / rubric criteria / coding: languages, starter code per language, public tests, hidden tests with weights, limits), mandatory skill tag per item (searchable skill picker from taxonomy), points, explanation, "Tạo câu hỏi bằng AI từ bản ghi buổi học" (select session + item types + count → streamed draft items with AI badge → accept/edit/discard each), preview as student, validation summary before publish.
6. Grading "/teach/grading": queue table (filters by cohort/assessment/item type, age), grading workspace: student answer (essay markdown, file preview incl. audio player, or code with Monaco read-only), rubric scoring panel, AI suggestion panel (draft score + feedback + per-criterion scores; "Áp dụng gợi ý" fills fields, never auto-saves), inline line comments on code (add/edit/delete, AI draft comments to accept or dismiss), overall feedback, save & next (keyboard: J/K next/prev, Ctrl+Enter save), progress indicator.
7. Proctoring review "/teach/proctoring/:attemptId": attempt header (student, exam, risk score vs threshold), event timeline (time, type, tier, confidence, risk delta, snapshot thumbnail opening a lightbox), risk score over time chart, filter by event type, verdict actions (CLEAN, CONFIRMED_CHEAT with required note, CLEARED_BY_INSTRUCTOR) with confirm, audit line "Đánh giá bởi … lúc …".
8. "/teach/profile": instructor profile editor (headline, organization, experience, expertise markdown, links) with public preview.
````

### Phase 7 — Cổng Quản trị (Admin)

````text
PHASE 7 — Admin portal "/admin". Implement:
1. "/admin" dashboard: KPI cards (học viên đang học, doanh thu tháng VND, đợt học đang diễn ra, tỷ lệ hoàn thành, tỷ lệ đậu thi cuối khóa, chi phí AI tháng), charts (revenue by month, enrollments by course, completion funnel: enrolled → active → finished sessions → passed final → certified), "Đang LIVE" list, sessions starting in next 3 hours without a confirmed host start, flagged exam attempts, recent orders.
2. Courses "/admin/courses" + editor: basics (title, slug auto with edit, category, difficulty, short & long description markdown, thumbnail upload, preview YouTube URL), skills mapping (prerequisites and learning outcomes with weights via skill picker), syllabus template builder (ordered rows with title and activity tags, drag reorder), status control (DRAFT/PUBLISHED/ARCHIVED with consequences explained), cohorts of this course.
3. Taxonomy "/admin/skills": categories tree (create, rename, move) and skill dictionary (code, name, category, description, usage counts in courses/items), merge duplicate skills dialog, guard against deleting skills in use.
4. Cohorts "/admin/cohorts" + editor: create from a course (generates sessions from the syllabus template), code, name, curriculum version, tech stack notes, tuition, seats, enrollment window, dates, replay expiry, status transitions; Staff tab (assign accounts with role INSTRUCTOR/TA/GUEST and scope note); Sessions tab (bulk schedule editing; change host with optional reason — sets originalHost and notifies students; the UI must show a clear inline message if the backend rejects due to an instructor time conflict); Enrollments tab (list, manual enrollment with reason, revoke with confirm).
5. AI Scheduler "/admin/scheduler": step 1 select cohorts and date range; step 2 constraints — natural-language box ("Không xếp tối Chủ nhật, mỗi giảng viên tối đa 3 buổi/tuần…") converted by AI into editable structured constraint chips, plus hard constraints shown read-only (no instructor overlap, availability respected, GUEST fixed slots); step 3 run solver with progress; step 4 proposal on a calendar + table, per-instructor load chart, infeasible state listing human-readable conflicts with suggestions; step 5 apply (confirm, shows how many sessions will change) with success summary.
6. Staff "/admin/instructors": list (tier STAFF/GUEST, cohorts, hosted hours this month, schedulable flag), create staff account (invitation email), profile edit, availability view, deactivate.
7. Users "/admin/users": search/filter by role/status, detail page (profile, enrollments, orders, progress summary, certificates), lock/unlock with reason, role change guarded by confirm and typed confirmation for ADMIN.
8. Orders "/admin/orders": filters (status, date range, cohort, amount), detail with payment transactions and raw IPN payload JSON viewer (collapsible, copy), status timeline; no manual "mark paid" button (explain reconciliation happens via gateway).
9. Certificates "/admin/certificates": issued list, eligibility queue (completed + passed final + clean integrity) with bulk issue, revoke with reason, verification link.
10. Knowledge base "/admin/knowledge": sources grouped by course/cohort/session/public FAQ with visibility PUBLIC/ENROLLED_ONLY, chunk counts, last indexed, status; upload public FAQ/policy documents; reindex/delete source with confirm; Retrieval playground (query, scope selectors: course/cohort/visibility; results with hybrid score breakdown vector/keyword/rerank, snippet, source link, time range).
11. AI observability "/admin/ai": usage over time (requests, tokens in/out, cost VND), latency p50/p95 by feature, provider split and fallback rate (Gemini vs self-hosted Qwen), error rate, top features by cost, RAG evaluation runs table (date, dataset size, faithfulness, answer relevancy, context recall, delta vs previous run) with run detail, trace ID copy with link placeholder to Langfuse.
12. Proctoring overview "/admin/proctoring": flagged attempts across cohorts, filters, open review.
13. Reviews "/admin/reviews": list with rating filter, hide/unhide with reason.
14. Announcements "/admin/announcements": compose (audience: all students / cohort / staff), preview, schedule send, history.
15. System settings "/admin/settings": key-value editor for system_settings (maintenance mode toggle with banner preview, support email, default seat limit, replay retention days), public vs private flag, change confirmation.
````

### Phase 8 — Hoàn thiện: Kiểm toán UX, Responsive, Accessibility, Hiệu năng

````text
PHASE 8 — Polish & audit. Do a full pass over every route and fix gaps:
1. State audit: produce a table route × (loading, empty, error, success, permission-denied) and implement anything missing.
2. Responsive audit at 375, 768, 1024, 1280, 1536 widths; fix overflow, tap targets ≥ 44px on touch, sticky elements, tables→cards.
3. Accessibility audit: keyboard-only walkthrough of login → session replay → assessment taking → grading; focus order, focus return after dialogs, aria-live regions, color contrast in both themes, reduced motion.
4. Consistency audit: spacing scale, typography scale, button hierarchy (one primary action per view), badge semantics (status colors consistent everywhere), date/money formatting, Vietnamese copy tone (concise, polite, no exclamation overload), terminology glossary used consistently: Khóa học, Đợt học, Buổi học, Bài tập, Thi cuối khóa, Tài liệu, Bản ghi, Trợ giảng AI, Giảng viên, Trợ giảng, Khách mời, Kỹ năng, Mức thành thạo.
5. Performance: verify all pages are lazy-loaded, Monaco and hls.js and LiveKit loaded only on routes that need them, images lazy with explicit sizes, list virtualization for long tables/transcripts, memoization where profiling shows need.
6. Security UX: confirm student DTOs never contain grading data, markdown sanitized everywhere, watermark present on all paid video playback, tokens never in localStorage.
7. Deliver: a README section "Kiến trúc Frontend" (folder map, data flow, how to switch mocks off, how to add a feature), and the final route map grouped by portal.
````

---

## 3. Checklist nghiệm thu sau mỗi phase

| Hạng mục | Cách kiểm tra nhanh |
| :--- | :--- |
| Trạng thái giao diện | Thêm `?chaos=1` vào URL để ép lỗi ngẫu nhiên; xem có ErrorState + nút thử lại + `requestId` không |
| Không "mùi AI" | Không gradient tím/xanh, không ✨, không glassmorphism, không emoji trong chữ |
| Hợp đồng dữ liệu | Tên kiểu và giá trị enum trong `contracts.ts` không bị AI đổi tên |
| Bảo mật UI | Trang làm bài của học viên không hề có `grading`/đáp án trong dữ liệu mock trả về |
| Responsive | DevTools ở 375px và 1280px cho mỗi trang mới |
| Bàn phím | Đi hết luồng chính chỉ bằng `Tab` / `Enter` / phím tắt |
| Lazy loading | Tab Network: Monaco/hls.js/LiveKit chỉ tải khi vào đúng trang |

> [!TIP]
> Nếu một phase ra kết quả nông hoặc bị cắt, gửi tiếp: *"Continue PHASE N from where you stopped. Do not rewrite finished files. Remaining items: …"* và liệt kê đúng mục còn thiếu. Điều này hiệu quả hơn nhiều so với gửi lại cả phase.
