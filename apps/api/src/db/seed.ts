import path from 'node:path';
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { db as defaultDb, pool } from './index.js';
import {
  categories,
  skills,
  accounts,
  accountIdentities,
  userProfiles,
  instructorProfiles,
  courses,
  courseSkills,
  cohorts,
  orders,
  paymentTransactions,
  enrollments,
  classSessions,
  sessionProgress,
  sessionAttachments,
  sessionSubtitles,
  courseReviews,
  certificates,
  assessments,
  assessmentItems,
  assessmentAttempts,
  submissionAnswers,
  proctoringEvents,
  discussionThreads,
  discussionPosts,
  notifications,
  knowledgeChunks,
  studentSkillStates,
  chatSessions,
  chatMessages,
  mockInterviews,
  systemSettings,
} from './schema/index.js';
import {
  makeDeterministicVector,
  buildSessionQuizItems,
  buildAttemptDraftAndAnswerBuilders,
  findSeedConsistencyViolations,
} from './seedHelpers.js';
import { logger } from '../config/logger.js';

export async function runSeed(targetDb: typeof defaultDb = defaultDb) {
  const db = targetDb;
  logger.info('Starting full A-to-Z 3T Academy database seed (all 26 schema tables)...');

  const defaultPasswordHash = await argon2.hash('123456');

  await db.execute(sql`
    TRUNCATE TABLE
      system_settings,
      mock_interviews,
      chat_messages,
      chat_sessions,
      student_skill_states,
      knowledge_chunks,
      notifications,
      discussion_posts,
      discussion_threads,
      proctoring_events,
      submission_answers,
      assessment_attempts,
      assessment_items,
      assessments,
      certificates,
      course_reviews,
      session_subtitles,
      session_attachments,
      session_progress,
      class_sessions,
      enrollments,
      payment_transactions,
      orders,
      cohorts,
      course_skills,
      courses,
      instructor_profiles,
      user_profiles,
      account_identities,
      accounts,
      skills,
      categories
    RESTART IDENTITY CASCADE;
  `);

  // =========================================================================
  // 0. SYSTEM SETTINGS
  // =========================================================================
  await db.insert(systemSettings).values([
    {
      key: 'platform_name',
      value: 'Học viện Công nghệ 3T Academy',
      description: 'Tên hiển thị chính thức của học viện',
      isPublic: true,
    },
    {
      key: 'sepay_bank_name',
      value: 'MBBank',
      description: 'Ngân hàng thụ hưởng VietQR SePay',
      isPublic: true,
    },
    {
      key: 'sepay_account_number',
      value: '0389998888',
      description: 'Số tài khoản nhận học phí tự động',
      isPublic: true,
    },
    {
      key: 'proctoring_max_strikes',
      value: '3',
      description: 'Số lần vi phạm webcam tối đa trước khi tự động khóa bài thi cuối khóa',
      isPublic: false,
    },
  ]);

  // =========================================================================
  // 1. CATEGORIES (4 Categories)
  // =========================================================================
  const [catAi, catSwe, catData, catProg] = await db
    .insert(categories)
    .values([
      {
        name: 'Trí tuệ nhân tạo & AI',
        slug: 'ai-llm-engineering',
        description:
          'Xây dựng hệ thống RAG, Multi-Agent, LLMOps và tích hợp mô hình ngôn ngữ lớn vào sản phẩm thực tế.',
      },
      {
        name: 'Lập trình Backend & Hệ thống',
        slug: 'backend-system-architecture',
        description:
          'Thiết kế hệ thống phân tán, bất đồng bộ, Microservices, bảo mật API và tối ưu cơ sở dữ liệu.',
      },
      {
        name: 'Kỹ thuật Dữ liệu',
        slug: 'data-engineering-analytics',
        description:
          'Xây dựng Data Pipeline, Lakehouse, Streaming Kafka/Spark và kho dữ liệu phân tích doanh nghiệp.',
      },
      {
        name: 'Lập trình Nền tảng',
        slug: 'foundational-programming',
        description:
          'Nền tảng lập trình Python, TypeScript, Cấu trúc dữ liệu & Giải thuật và SQL chuẩn kỹ sư.',
      },
    ])
    .returning();

  // =========================================================================
  // 2. SKILLS (12 Competency Skills)
  // =========================================================================
  const insertedSkills = await db
    .insert(skills)
    .values([
      {
        categoryId: catProg!.id,
        code: 'PYTHON_ASYNC',
        name: 'Lập trình Python & AsyncIO',
        description:
          'Xử lý bất đồng bộ với asyncio, quản lý event loop, coroutines và tối ưu I/O-bound workloads.',
      },
      {
        categoryId: catAi!.id,
        code: 'HYBRID_RAG',
        name: 'Kiến trúc Hybrid RAG & Vector DB',
        description:
          'Kết hợp Dense Vector (pgvector HNSW) và BM25 Full-Text Search cùng thuật toán Reciprocal Rank Fusion (RRF).',
      },
      {
        categoryId: catAi!.id,
        code: 'TOOL_CALLING',
        name: 'Function Calling & Agentic Workflows',
        description:
          'Thiết kế JSON Schema chặt chẽ với Pydantic, điều phối Tool Calling và kiểm soát vòng lặp ReAct Agent.',
      },
      {
        categoryId: catSwe!.id,
        code: 'NODE_TS',
        name: 'Kiến trúc Backend TypeScript & Express',
        description:
          'Thiết kế RESTful API phân tầng, Zod validation, JWT RBAC và Drizzle ORM trên Node.js.',
      },
      {
        categoryId: catSwe!.id,
        code: 'DOCKER_CI',
        name: 'Triển khai Docker & CI/CD Production',
        description:
          'Đóng gói container đa tầng (multi-stage Dockerfile), quản lý biến môi trường và giám sát dịch vụ.',
      },
      {
        categoryId: catData!.id,
        code: 'SQL_VECTOR',
        name: 'Tối ưu PostgreSQL & pgvector',
        description:
          'Thiết kế lược đồ quan hệ chuẩn 3NF, đánh chỉ mục B-Tree/GIN/HNSW và tối ưu truy vấn lai.',
      },
      {
        categoryId: catAi!.id,
        code: 'FASTAPI_ARCH',
        name: 'Kiến trúc FastAPI & Pydantic v2',
        description:
          'Xây dựng cổng AI Gateway hiệu năng cao, streaming SSE, kiểm thử tải và xử lý hàng đợi Celery/Redis.',
      },
      {
        categoryId: catAi!.id,
        code: 'LANGGRAPH_AGENT',
        name: 'Multi-Agent Orchestration & Memory',
        description:
          'Thiết kế đồ thị trạng thái cho hệ thống đa tác tử (Multi-Agent), bộ nhớ ngắn hạn/dài hạn và Human-in-the-loop.',
      },
      {
        categoryId: catSwe!.id,
        code: 'SYSTEM_DESIGN',
        name: 'Thiết kế Hệ thống Phân tán & Caching',
        description:
          'Thiết kế kiến trúc chịu tải cao với Redis Caching, Rate Limiting, Idempotency Webhook và Message Queue.',
      },
      {
        categoryId: catData!.id,
        code: 'SPARK_KAFKA',
        name: 'Real-time Streaming với Kafka & PySpark',
        description:
          'Xử lý luồng sự kiện thời gian thực, phân vùng Kafka topic và tính toán phân tán với Apache Spark.',
      },
      {
        categoryId: catData!.id,
        code: 'DBT_WAREHOUSE',
        name: 'Data Modeling & dbt Analytics Engineering',
        description:
          'Chuẩn hóa mô hình Star Schema, viết kiểm thử chất lượng dữ liệu tự động và quản trị dòng chảy dữ liệu.',
      },
      {
        categoryId: catAi!.id,
        code: 'EVAL_GUARDRAILS',
        name: 'LLMOps, Ragas Evaluation & Guardrails',
        description:
          'Đo lường chất lượng RAG (Faithfulness, Context Precision), chống Prompt Injection và kiểm soát chi phí Token.',
      },
    ])
    .returning();

  const [
    skPython,
    skRag,
    skTool,
    skNode,
    skDocker,
    skSqlVec,
    skFastApi,
    skLangGraph,
    skSysDesign,
    skSparkKafka,
    skDbt,
    skEval,
  ] = insertedSkills;

  // =========================================================================
  // 3. ACCOUNTS & ACCOUNT IDENTITIES (12 Accounts)
  // =========================================================================
  const insertedAccounts = await db
    .insert(accounts)
    .values([
      {
        email: 'admin@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastLoginAt: new Date('2026-04-05T08:00:00Z'),
      },
      {
        email: 'khoa.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastLoginAt: new Date('2026-04-05T08:30:00Z'),
      },
      {
        email: 'ha.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastLoginAt: new Date('2026-04-05T11:30:00Z'),
      },
      {
        email: 'nam.ta@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastLoginAt: new Date('2026-04-04T10:00:00Z'),
      },
      {
        email: 'an.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-15T08:00:00Z'),
        createdAt: new Date('2026-02-15T08:00:00Z'),
        lastLoginAt: new Date('2026-04-05T12:00:00Z'),
      },
      {
        email: 'mai.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-04-04T09:10:00Z'),
      },
      {
        email: 'ha.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-16T08:00:00Z'),
        createdAt: new Date('2026-02-16T08:00:00Z'),
        lastLoginAt: new Date('2026-03-29T10:00:00Z'),
      },
      {
        email: 'quan.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-17T08:00:00Z'),
        createdAt: new Date('2026-02-17T08:00:00Z'),
        lastLoginAt: new Date('2026-04-01T14:25:00Z'),
      },
      {
        email: 'anh.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-18T08:00:00Z'),
        createdAt: new Date('2026-02-18T08:00:00Z'),
        lastLoginAt: new Date('2026-03-15T09:30:00Z'),
      },
      {
        email: 'khanh.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-03-10T08:00:00Z'),
        createdAt: new Date('2026-03-10T08:00:00Z'),
        lastLoginAt: new Date('2026-03-20T15:10:00Z'),
      },
      {
        email: 'bao.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-03-12T08:00:00Z'),
        createdAt: new Date('2026-03-12T08:00:00Z'),
        lastLoginAt: new Date('2026-04-05T12:15:00Z'),
      },
      {
        email: 'khoi.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-03-20T10:15:00Z'),
      },
    ])
    .returning();

  const [
    adminAcc,
    instKhoaAcc,
    instHaAcc,
    taNamAcc,
    stuAnAcc,
    stuMaiAcc,
    stuHaAcc,
    stuQuanAcc,
    stuAnhAcc,
    stuKhanhAcc,
    stuBaoAcc,
    stuKhoiAcc,
  ] = insertedAccounts;

  await db.insert(accountIdentities).values(
    insertedAccounts.map((acc) => ({
      accountId: acc.id,
      provider: 'LOCAL' as const,
      providerUid: `local-${acc.email}`,
      providerEmail: acc.email,
    }))
  );

  // =========================================================================
  // 4. INSTRUCTOR PROFILES & USER PROFILES
  // =========================================================================
  await db.insert(instructorProfiles).values([
    {
      accountId: instKhoaAcc!.id,
      headline: 'Principal AI Architect · Tiến sĩ Khoa học Máy tính',
      organization: 'Học viện Công nghệ 3T Academy',
      yearsOfExperience: 11,
      expertiseSummaryMd:
        'Chuyên gia thiết kế kiến trúc hệ thống Hybrid RAG, Multi-Agent Orchestration và LLMOps quy mô doanh nghiệp.',
      socialLinks: {
        github: 'https://github.com/leminhkhoa-ai',
        linkedin: 'https://linkedin.com/in/leminhkhoa-ai',
      },
    },
    {
      accountId: instHaAcc!.id,
      headline: 'Staff Data & Backend Architect · Thạc sĩ Kỹ thuật Phần mềm',
      organization: 'Học viện Công nghệ 3T Academy',
      yearsOfExperience: 9,
      expertiseSummaryMd:
        'Chuyên gia tối ưu cơ sở dữ liệu PostgreSQL, thiết kế hệ thống phân tán chịu tải cao và đường ống dữ liệu thời gian thực.',
      socialLinks: {
        github: 'https://github.com/nguyenthuha-arch',
        linkedin: 'https://linkedin.com/in/nguyenthuha-arch',
      },
    },
    {
      accountId: taNamAcc!.id,
      headline: 'Senior AI & Backend Teaching Assistant',
      organization: 'Học viện Công nghệ 3T Academy',
      yearsOfExperience: 5,
      expertiseSummaryMd:
        'Phụ trách hướng dẫn thực hành Live Coding, đánh giá đồ án và tối ưu hiệu năng truy vấn pgvector.',
      socialLinks: {
        github: 'https://github.com/hoangnam-ta',
      },
    },
  ]);

  const anCvParsedData = {
    fileName: 'NguyenVanAn_Fresher_AIEngineer_CV_2026.pdf',
    updatedAt: '2026-04-03T13:30:00.000Z',
    extractedAt: '2026-04-03T13:30:00.000Z',
    fullName: 'Nguyễn Văn An',
    candidateName: 'Nguyễn Văn An',
    headline: 'Fresher AI Engineer · RAG, LangChain & FastAPI Backend',
    targetRole: 'Fresher AI Engineer (RAG & Agentic Workflows)',
    email: 'an.student@3t.edu.vn',
    phone: '0908 234 567',
    location: 'Quận Cầu Giấy, Hà Nội',
    avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_nguyen_van_an.jpg',
    githubUrl: 'https://github.com/nguyenvanan-ai',
    linkedinUrl: 'https://linkedin.com/in/nguyenvanan-ai',
    careerObjective:
      'Kỹ sư phần mềm định hướng AI Engineering với nền tảng vững chắc về Python AsyncIO, FastAPI, PostgreSQL/pgvector và hệ thống Hybrid RAG. Mong muốn đóng góp xây dựng các sản phẩm GenAI có độ trễ thấp, kiểm soát chặt chẽ chi phí token và đạt độ chính xác truy xuất cao trong môi trường doanh nghiệp.',
    summaryBio:
      'Kỹ sư phần mềm định hướng AI Engineering với nền tảng vững chắc về Python AsyncIO, FastAPI, PostgreSQL/pgvector và hệ thống Hybrid RAG.',
    skills: [
      'Python 3.11 & AsyncIO',
      'FastAPI & Pydantic v2',
      'Hybrid RAG (pgvector + BM25 RRF)',
      'OpenAI & Gemini Function Calling',
      'PostgreSQL & SQL Optimization',
      'Docker & GitHub Actions CI/CD',
      'React & TypeScript',
      'Redis & Celery Worker',
    ],
    externalSkills: [
      {
        name: 'Docker & GitHub Actions CI/CD',
        note: 'Đóng gói multi-stage container và tự động hóa kiểm thử pytest trên CI',
      },
      {
        name: 'FastAPI & RESTful Microservices',
        note: 'Thiết kế cổng API bất đồng bộ phục vụ 300+ req/s với độ trễ p95 < 120ms',
      },
      {
        name: 'React & TypeScript Frontend',
        note: 'Xây dựng giao diện streaming SSE cho ứng dụng trợ lý tri thức nội bộ',
      },
    ],
    projects: [
      {
        id: 'proj-an-1',
        name: '3T SmartDocs — Hệ thống Trợ lý Tài liệu Kỹ thuật Nội bộ (Hybrid RAG)',
        title: '3T SmartDocs — Hệ thống Trợ lý Tài liệu Kỹ thuật Nội bộ (Hybrid RAG)',
        role: 'AI & Backend Developer',
        period: '01/2026 - 04/2026',
        techStack: ['Python', 'FastAPI', 'PostgreSQL', 'pgvector', 'BM25', 'OpenAI API', 'Docker'],
        highlights: [
          'Thiết kế pipeline băm tài liệu thông minh theo cấu trúc Markdown Header kết hợp chồng lấp ngữ cảnh 15% cho hơn 2.500 trang tài liệu kỹ thuật.',
          'Triển khai thuật toán tìm kiếm lai (Hybrid Search) kết hợp pgvector HNSW (cosine distance) và PostgreSQL tsvector BM25 thông qua công thức Reciprocal Rank Fusion (RRF, k=60).',
          'Giảm tỷ lệ ảo giác (hallucination) từ 28% xuống dưới 4.5% và rút ngắn thời gian phản hồi trung bình xuống 1.1 giây nhờ cơ chế Semantic Cache trên Redis.',
        ],
      },
      {
        id: 'proj-an-2',
        name: 'AutoOrder Agent — Trợ lý Tra cứu Đơn hàng & CSKH Đa Tác tử',
        title: 'AutoOrder Agent — Trợ lý Tra cứu Đơn hàng & CSKH Đa Tác tử',
        role: 'Full-stack AI Developer',
        period: '10/2025 - 01/2026',
        techStack: ['Python', 'Pydantic v2', 'Function Calling', 'Node.js', 'TypeScript', 'Redis'],
        highlights: [
          'Xây dựng bộ công cụ Function Calling có kiểm tra kiểu dữ liệu nghiêm ngặt bằng Pydantic để kết nối LLM với hệ thống ERP và tra cứu trạng thái vận đơn.',
          'Thiết lập cơ chế chống lặp vô hạn (max 4 vòng suy luận ReAct) và lọc quyền truy cập dữ liệu theo từng khách hàng đăng nhập.',
          'Tự động hóa xử lý 72% yêu cầu tra cứu trạng thái đơn hàng mà không cần nhân viên trực tổng đài can thiệp.',
        ],
      },
    ],
    workExperience: [
      {
        id: 'work-an-1',
        company: 'FPT Software — Khối Giải pháp Doanh nghiệp',
        position: 'Thực tập sinh Kỹ thuật Phần mềm & AI (AI Backend Intern)',
        role: 'Thực tập sinh Kỹ thuật Phần mềm & AI (AI Backend Intern)',
        period: '06/2025 - 12/2025',
        summary:
          'Tham gia phát triển các dịch vụ RESTful API bằng FastAPI, viết script chuẩn hóa dữ liệu huấn luyện và kiểm thử tích hợp cho hệ thống chatbot nội bộ.',
        highlights: [
          'Phát triển 12 endpoint FastAPI bất đồng bộ tích hợp cơ sở dữ liệu PostgreSQL và Redis.',
          'Xây dựng bộ kiểm thử tự động với Pytest đạt độ phủ code 84% trước khi đưa lên môi trường Staging.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-an-1',
        school: 'Đại học Bách Khoa Hà Nội (HUST)',
        institution: 'Đại học Bách Khoa Hà Nội (HUST)',
        degree: 'Kỹ sư Khoa học Máy tính (Computer Science)',
        period: '2022 - 2026',
        graduationYear: '2026',
        gpaOrHonors: 'GPA: 3.45 / 4.0 · Học bổng Khuyến khích Học tập kỳ 2024.2',
      },
    ],
    awardsAndCerts: [
      {
        id: 'cert-an-1',
        title: 'Chứng chỉ Kỹ sư AI Thực chiến: RAG, Agents & LLMOps (Loại Xuất sắc)',
        issuer: 'Học viện Công nghệ 3T Academy',
        dateOrCode: '04/2026 · Mã xác thực: CERT-3T-2026-8891',
      },
      {
        id: 'cert-an-2',
        title: 'Giải Nhì Cuộc thi Sinh viên Nghiên cứu Khoa học & Ứng dụng GenAI',
        issuer: 'Trường Công nghệ Thông tin & Truyền thông - ĐHBK Hà Nội',
        dateOrCode: '11/2025',
      },
    ],
  };

  const maiCvParsedData = {
    fileName: 'LeHoangMai_Junior_AIEngineer_CV_2026.pdf',
    updatedAt: '2026-04-03T14:20:00.000Z',
    extractedAt: '2026-04-03T14:20:00.000Z',
    fullName: 'Lê Hoàng Mai',
    candidateName: 'Lê Hoàng Mai',
    headline: 'Junior Backend & AI Engineer · Python, FastAPI & Vector Search',
    targetRole: 'Junior AI Engineer',
    email: 'mai.student@3t.edu.vn',
    phone: '0912 345 678',
    location: 'Quận 1, TP. Hồ Chí Minh',
    avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_le_hoang_mai.jpg',
    githubUrl: 'https://github.com/lehoangmai-dev',
    linkedinUrl: 'https://linkedin.com/in/lehoangmai-dev',
    careerObjective:
      'Kỹ sư Backend 1 năm kinh nghiệm chuyển dịch sang mảng AI Engineering. Thành thạo thiết kế hệ thống phân tán, tối ưu truy vấn PostgreSQL/pgvector và triển khai dịch vụ RAG thực chiến.',
    summaryBio:
      'Kỹ sư Backend 1 năm kinh nghiệm chuyên sâu về Python, FastAPI, PostgreSQL và hệ thống truy xuất tri thức RAG.',
    skills: [
      'Python & FastAPI',
      'PostgreSQL & pgvector',
      'Hybrid RAG & Reranking',
      'Node.js & TypeScript',
      'Docker & Kubernetes cơ bản',
      'Redis & BullMQ',
    ],
    externalSkills: [
      {
        name: 'PostgreSQL Tuning & Indexing',
        note: 'Tối ưu truy vấn báo cáo phân tích từ 4.5s xuống 180ms với composite index',
      },
      {
        name: 'Docker & CI/CD Pipelines',
        note: 'Vận hành hệ thống microservices trên môi trường AWS ECS',
      },
    ],
    projects: [
      {
        id: 'proj-mai-1',
        name: 'FinRAG — Hệ thống Phân tích Báo cáo Tài chính Tự động bằng LLM',
        title: 'FinRAG — Hệ thống Phân tích Báo cáo Tài chính Tự động bằng LLM',
        role: 'Lead Backend & AI Engineer',
        period: '12/2025 - 04/2026',
        techStack: ['Python', 'FastAPI', 'pgvector', 'Cross-Encoder Reranker', 'Redis'],
        highlights: [
          'Xây dựng bộ trích xuất bảng biểu từ báo cáo tài chính PDF và lưu trữ vector 1024 chiều trên PostgreSQL.',
          'Tích hợp mô hình Cross-Encoder Reranker giúp độ chính xác trích xuất số liệu tài chính đạt 94.2%.',
        ],
      },
    ],
    workExperience: [
      {
        id: 'work-mai-1',
        company: 'Tiki Corporation',
        position: 'Fresher Backend Engineer',
        role: 'Fresher Backend Engineer',
        period: '03/2025 - 03/2026',
        summary: 'Phát triển dịch vụ quản lý danh mục sản phẩm và tối ưu bộ nhớ đệm Redis.',
        highlights: ['Xây dựng API đồng bộ tồn kho thời gian thực phục vụ hơn 50.000 SKU.'],
      },
    ],
    education: [
      {
        id: 'edu-mai-1',
        school: 'Trường Đại học Công nghệ Thông tin — ĐHQG TP.HCM (UIT)',
        institution: 'Trường Đại học Công nghệ Thông tin — ĐHQG TP.HCM (UIT)',
        degree: 'Cử nhân Kỹ thuật Phần mềm',
        period: '2021 - 2025',
        graduationYear: '2025',
        gpaOrHonors: 'GPA: 3.62 / 4.0 · Sinh viên 5 Tốt cấp Đại học Quốc gia',
      },
    ],
    awardsAndCerts: [
      {
        id: 'cert-mai-1',
        title: 'Chứng chỉ Lập trình Python & SQL Phân tích Dữ liệu Thực chiến',
        issuer: 'Học viện Công nghệ 3T Academy',
        dateOrCode: '02/2026 · Mã xác thực: CERT-3T-2026-8892',
      },
    ],
  };

  const khoiCvParsedData = {
    fileName: 'VuDinhKhoi_Data_AI_Engineer_CV_2026.pdf',
    updatedAt: '2026-03-20T10:00:00.000Z',
    extractedAt: '2026-03-20T10:00:00.000Z',
    fullName: 'Vũ Đình Khôi',
    candidateName: 'Vũ Đình Khôi',
    headline: 'Data & AI Engineer · Python, SQL, PySpark & Vector Pipelines',
    targetRole: 'Data & AI Engineer',
    email: 'khoi.student@3t.edu.vn',
    phone: '0987 654 321',
    location: 'Quận Hải Châu, Đà Nẵng',
    avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_vu_dinh_khoi.jpg',
    githubUrl: 'https://github.com/vudinhkhoi-data',
    linkedinUrl: 'https://linkedin.com/in/vudinhkhoi-data',
    careerObjective:
      'Kỹ sư dữ liệu hướng tới xây dựng hạ tầng dữ liệu sạch và Vector Lakehouse phục vụ các ứng dụng AI quy mô lớn.',
    summaryBio: 'Kỹ sư dữ liệu thành thạo Python, PostgreSQL, dbt và tự động hóa ETL pipeline.',
    skills: ['Python', 'PostgreSQL & Window Functions', 'Apache Spark', 'Kafka', 'dbt', 'Docker'],
    externalSkills: [
      { name: 'Apache Spark & Kafka', note: 'Xử lý luồng sự kiện log hệ thống thương mại điện tử' },
    ],
    projects: [
      {
        id: 'proj-khoi-1',
        name: 'Real-time E-Commerce Analytics & Feature Store',
        title: 'Real-time E-Commerce Analytics & Feature Store',
        role: 'Data Engineer',
        period: '09/2025 - 02/2026',
        techStack: ['Python', 'PostgreSQL', 'Kafka', 'dbt', 'Docker'],
        highlights: [
          'Thiết kế luồng thu thập dữ liệu hành vi người dùng thời gian thực và chuẩn hóa mô hình Star Schema.',
        ],
      },
    ],
    workExperience: [],
    education: [
      {
        id: 'edu-khoi-1',
        school: 'Trường Đại học Bách Khoa — Đại học Đà Nẵng (DUT)',
        institution: 'Trường Đại học Bách Khoa — Đại học Đà Nẵng (DUT)',
        degree: 'Kỹ sư Công nghệ Thông tin',
        period: '2021 - 2025',
        graduationYear: '2025',
        gpaOrHonors: 'GPA: 3.40 / 4.0',
      },
    ],
    awardsAndCerts: [
      {
        id: 'cert-khoi-1',
        title: 'Chứng chỉ Lập trình Python & SQL Phân tích Dữ liệu Thực chiến',
        issuer: 'Học viện Công nghệ 3T Academy',
        dateOrCode: '02/2026 · Mã xác thực: CERT-3T-2026-8893',
      },
    ],
  };

  const insertedProfiles = await db
    .insert(userProfiles)
    .values([
    {
      accountId: adminAcc!.id,
      fullName: 'Trần Quản Trị (Admin 3T)',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/admin_tran_quan_tri.jpg',
      bio: 'Giám đốc Vận hành & Quản trị Học vụ tại Học viện Công nghệ 3T Academy.',
      careerGoal: 'Chuẩn hóa chất lượng đào tạo công nghệ thực chiến theo chuẩn doanh nghiệp.',
      cvParsedData: {
        fullName: 'Trần Quản Trị (Admin 3T)',
        headline: 'Head of Academic Operations @ 3T Academy',
        phone: '0901 000 111',
        location: 'Hà Nội, Việt Nam',
      },
      interviewCredits: 10,
    },
    {
      accountId: instKhoaAcc!.id,
      fullName: 'TS. Lê Minh Khoa',
      avatarUrl: '/assets/aistudio/image_49d8b1b9.png',
      bio: 'Principal AI Architect · 10+ năm kinh nghiệm xây dựng hệ thống NLP, Hybrid RAG và Multi-Agent tại Singapore & Việt Nam.',
      careerGoal: 'Đào tạo thế hệ Kỹ sư AI thực chiến làm chủ kiến trúc hệ thống Production.',
      cvParsedData: {
        fullName: 'TS. Lê Minh Khoa',
        headline: 'Principal AI Architect · Giảng viên Trưởng khối AI Engineering',
        phone: '0902 111 222',
        location: 'TP. Hồ Chí Minh & Hà Nội',
        skills: ['Hybrid RAG', 'Multi-Agent Systems', 'LLMOps', 'Distributed Systems', 'PyTorch'],
      },
      interviewCredits: 10,
    },
    {
      accountId: instHaAcc!.id,
      fullName: 'ThS. Nguyễn Thu Hà',
      avatarUrl: '/assets/aistudio/image_aa8c5a52.png',
      bio: 'Staff Data & Backend Architect · Chuyên gia tối ưu cơ sở dữ liệu phân tán, Data Lakehouse và kiến trúc Microservices.',
      careerGoal: 'Đồng hành cùng học viên xây dựng tư duy thiết kế hệ thống bền vững.',
      cvParsedData: {
        fullName: 'ThS. Nguyễn Thu Hà',
        headline: 'Staff Data & Backend Architect · Giảng viên Trưởng khối Backend & Data',
        phone: '0903 222 333',
        location: 'Hà Nội, Việt Nam',
        skills: ['PostgreSQL', 'System Design', 'TypeScript', 'Apache Spark', 'Kafka', 'dbt'],
      },
      interviewCredits: 10,
    },
    {
      accountId: taNamAcc!.id,
      fullName: 'KS. Hoàng Nam',
      avatarUrl: '/assets/aistudio/image_ac1132bf.png',
      bio: 'Senior AI & Backend Teaching Assistant · Chuyên phụ trách Live Coding, Code Review và hướng dẫn đồ án RAG/Agent.',
      careerGoal: 'Hỗ trợ học viên gỡ lỗi kiến trúc và tối ưu hiệu năng code thực tế.',
      cvParsedData: {
        fullName: 'KS. Hoàng Nam',
        headline: 'Senior Teaching Assistant @ 3T Academy',
        phone: '0904 333 444',
        location: 'Hà Nội, Việt Nam',
        skills: ['FastAPI', 'pgvector', 'Docker', 'LangChain', 'TypeScript'],
      },
      interviewCredits: 10,
    },
    {
      accountId: stuAnAcc!.id,
      fullName: 'Nguyễn Văn An',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_nguyen_van_an.jpg',
      bio: 'Fresher AI Engineer · Đam mê xây dựng hệ thống Hybrid RAG, Function Calling và ứng dụng LLM vào bài toán doanh nghiệp.',
      careerGoal: 'Trở thành Junior AI Engineer tại các công ty sản phẩm công nghệ hàng đầu.',
      goalEmbedding: makeDeterministicVector(401, 1024),
      cvParsedData: anCvParsedData,
      interviewCredits: 5,
      faceReferenceR2Key: 'kyc/2026/stu-an-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(101, 512),
    },
    {
      accountId: stuMaiAcc!.id,
      fullName: 'Lê Hoàng Mai',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_le_hoang_mai.jpg',
      bio: 'Junior Backend Developer chuyển dịch sang AI Engineering · Yêu thích tối ưu Vector DB và hệ thống độ trễ thấp.',
      careerGoal: 'Trở thành AI Platform Engineer chuyên thiết kế hạ tầng suy luận mô hình lớn.',
      goalEmbedding: makeDeterministicVector(402, 1024),
      cvParsedData: maiCvParsedData,
      interviewCredits: 5,
      faceReferenceR2Key: 'kyc/2026/stu-mai-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(102, 512),
    },
    {
      accountId: stuHaAcc!.id,
      fullName: 'Trần Thu Hà',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_tran_thu_ha.jpg',
      bio: 'Sinh viên năm cuối ngành Khoa học Dữ liệu · Tập trung nghiên cứu NLP và ứng dụng RAG tiếng Việt.',
      careerGoal: 'Ứng tuyển vị trí Fresher AI / NLP Engineer sau khi tốt nghiệp.',
      goalEmbedding: makeDeterministicVector(403, 1024),
      cvParsedData: {
        fileName: 'TranThuHa_NLP_Engineer_CV_2026.pdf',
        updatedAt: '2026-03-28T08:15:00.000Z',
        fullName: 'Trần Thu Hà',
        headline: 'Fresher NLP & AI Engineer',
        email: 'ha.student@3t.edu.vn',
        phone: '0934 567 890',
        location: 'Quận Đống Đa, Hà Nội',
        githubUrl: 'https://github.com/tranthuha-nlp',
        linkedinUrl: 'https://linkedin.com/in/tranthuha-nlp',
        careerObjective:
          'Phát triển các mô hình xử lý ngôn ngữ tự nhiên và hệ thống hỏi đáp tiếng Việt chính xác cao.',
        skills: ['Python', 'PyTorch', 'HuggingFace', 'FastAPI', 'pgvector'],
        externalSkills: [
          { name: 'HuggingFace Transformers', note: 'Tinh chỉnh mô hình PhoBERT cho phân loại văn bản' },
        ],
        projects: [
          {
            id: 'proj-ha-1',
            name: 'VietLegal QA — Hệ thống Hỏi đáp Văn bản Pháp luật Tiếng Việt',
            title: 'VietLegal QA — Hệ thống Hỏi đáp Văn bản Pháp luật Tiếng Việt',
            role: 'NLP Researcher',
            period: '10/2025 - 03/2026',
            techStack: ['Python', 'PhoBERT', 'FastAPI', 'pgvector'],
            highlights: ['Đạt độ chính xác Top-3 Retrieval 88.5% trên tập 10.000 điều khoản pháp luật.'],
          },
        ],
        workExperience: [],
        education: [
          {
            id: 'edu-ha-1',
            school: 'Trường Đại học Công nghệ — ĐHQG Hà Nội (UET-VNU)',
            institution: 'Trường Đại học Công nghệ — ĐHQG Hà Nội (UET-VNU)',
            degree: 'Cử nhân Khoa học Máy tính',
            period: '2022 - 2026',
            graduationYear: '2026',
            gpaOrHonors: 'GPA: 3.38 / 4.0',
          },
        ],
        awardsAndCerts: [],
      },
      interviewCredits: 2,
      faceReferenceR2Key: 'kyc/2026/stu-ha-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(103, 512),
    },
    {
      accountId: stuQuanAcc!.id,
      fullName: 'Phạm Minh Quân',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_pham_minh_quan.jpg',
      bio: 'Full-stack Developer (Node.js/React) đang nâng cấp kỹ năng tích hợp AI Agent vào SaaS.',
      careerGoal: 'Trở thành Senior Full-stack AI Engineer.',
      cvParsedData: {
        fileName: 'PhamMinhQuan_Fullstack_AI_CV_2026.pdf',
        updatedAt: '2026-03-25T11:00:00.000Z',
        fullName: 'Phạm Minh Quân',
        headline: 'Full-stack Developer (TypeScript, Node.js, Python AI)',
        email: 'quan.student@3t.edu.vn',
        phone: '0945 678 901',
        location: 'Quận Cầu Giấy, Hà Nội',
        skills: ['TypeScript', 'Node.js', 'React', 'Python', 'PostgreSQL', 'Docker'],
        externalSkills: [{ name: 'Next.js & TypeScript', note: 'Xây dựng ứng dụng SaaS B2B' }],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
      },
      interviewCredits: 2,
      faceReferenceR2Key: 'kyc/2026/stu-quan-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(104, 512),
    },
    {
      accountId: stuAnhAcc!.id,
      fullName: 'Đỗ Tuấn Anh',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_do_tuan_anh.jpg',
      bio: 'Backend Developer quan tâm đến kiến trúc hệ thống lớn và tự động hóa quy trình bằng LLM.',
      careerGoal: 'Nắm vững kiến trúc Hybrid RAG và vượt qua kỳ thi cuối khóa.',
      cvParsedData: {
        fileName: 'DoTuanAnh_Backend_CV_2026.pdf',
        updatedAt: '2026-03-15T09:00:00.000Z',
        fullName: 'Đỗ Tuấn Anh',
        headline: 'Backend Developer · Python & Go',
        email: 'anh.student@3t.edu.vn',
        phone: '0956 789 012',
        location: 'Quận Thanh Xuân, Hà Nội',
        skills: ['Python', 'SQL', 'Docker'],
        externalSkills: [],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
      },
      interviewCredits: 2,
      faceReferenceR2Key: 'kyc/2026/stu-anh-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(105, 512),
    },
    {
      accountId: stuKhanhAcc!.id,
      fullName: 'Ngô Quốc Khánh',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_ngo_quoc_khanh.jpg',
      bio: 'Kỹ sư kiểm thử tự động (QA Automation) chuyển hướng sang phát triển hệ thống AI & LLMOps.',
      careerGoal: 'Làm chủ quy trình đánh giá chất lượng mô hình AI với Ragas và Pytest.',
      cvParsedData: {
        fileName: 'NgoQuocKhanh_QA_AIEngineer_CV_2026.pdf',
        updatedAt: '2026-03-18T15:00:00.000Z',
        fullName: 'Ngô Quốc Khánh',
        headline: 'QA Automation & AI Evaluation Engineer',
        email: 'khanh.student@3t.edu.vn',
        phone: '0967 890 123',
        location: 'Quận Tân Bình, TP. Hồ Chí Minh',
        skills: ['Python', 'Pytest', 'Playwright', 'FastAPI', 'SQL'],
        externalSkills: [],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
      },
      interviewCredits: 2,
    },
    {
      accountId: stuBaoAcc!.id,
      fullName: 'Hoàng Gia Bảo',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_hoang_gia_bao.jpg',
      bio: 'Kỹ sư phần mềm yêu thích lập trình hệ thống, Microservices và cơ sở dữ liệu hiệu năng cao.',
      careerGoal: 'Xây dựng nền tảng Backend vững chắc phục vụ hàng triệu người dùng.',
      cvParsedData: {
        fileName: 'HoangGiaBao_SWE_CV_2026.pdf',
        updatedAt: '2026-03-22T10:00:00.000Z',
        fullName: 'Hoàng Gia Bảo',
        headline: 'Software Engineer · TypeScript & PostgreSQL',
        email: 'bao.student@3t.edu.vn',
        phone: '0978 901 234',
        location: 'Quận 3, TP. Hồ Chí Minh',
        skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Docker'],
        externalSkills: [],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
      },
      interviewCredits: 2,
    },
    {
      accountId: stuKhoiAcc!.id,
      fullName: 'Vũ Đình Khôi',
      avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_vu_dinh_khoi.jpg',
      bio: 'Data Engineer chuyên sâu về Python, SQL phân tích, Apache Spark và kiến trúc Lakehouse.',
      careerGoal: 'Trở thành Senior Data & AI Infrastructure Engineer.',
      goalEmbedding: makeDeterministicVector(408, 1024),
      cvParsedData: khoiCvParsedData,
      interviewCredits: 6,
      faceReferenceR2Key: 'kyc/2026/stu-khoi-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(108, 512),
    },
  ]).returning();

  // =========================================================================
  // 5. COURSES (4 Published Courses with complete 6-session Syllabus Templates)
  // =========================================================================
  const [courseAi, courseSwe, courseData, coursePython] = await db
    .insert(courses)
    .values([
      {
        categoryId: catAi!.id,
        title: 'Kỹ sư AI Thực chiến: RAG, Agents & LLMOps',
        slug: 'ky-su-ai-thuc-chien-rag-agents-llmops',
        shortDescription:
          'Làm chủ kiến trúc Hybrid RAG (pgvector + BM25 RRF), Multi-Agent Orchestration, Function Calling và triển khai hệ thống AI Production chuẩn doanh nghiệp.',
        descriptionMd: `### Mục tiêu chương trình đào tạo
Khóa học **Kỹ sư AI Thực chiến: RAG, Agents & LLMOps** được thiết kế dành riêng cho các lập trình viên muốn vượt qua giai đoạn viết kịch bản thử nghiệm trên Notebook để làm chủ toàn diện kiến trúc **Production AI System**.

- **Kiến trúc Hybrid RAG chuyên sâu**: Kết hợp tìm kiếm ngữ nghĩa Dense Vector (\`pgvector\` HNSW) và tìm kiếm từ khóa chính xác BM25 (\`tsvector\`) với thuật toán **Reciprocal Rank Fusion (RRF)** và **Cross-Encoder Reranker**.
- **Agentic Workflows & Function Calling**: Kiểm soát chặt chẽ đầu ra có cấu trúc bằng **Pydantic v2**, điều phối đa tác tử (Multi-Agent) và thiết lập hàng rào bảo mật chống Prompt Injection.
- **LLMOps & Giám sát chất lượng**: Đánh giá tự động bằng bộ chỉ số **Ragas** (Faithfulness, Context Precision), tối ưu độ trễ bằng Semantic Cache trên Redis và đóng gói dịch vụ với Docker/FastAPI.`,
        thumbnailUrl: '/assets/aistudio/image_087a245c.png',
        difficultyLevel: 2,
        status: 'PUBLISHED',
        embedding: makeDeterministicVector(501, 1024),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Kiến trúc Hệ thống AI Production & Xử lý Bất đồng bộ với Python AsyncIO',
            description:
              'Thiết kế cổng LLM Gateway chịu tải cao với FastAPI, quản lý vòng đời kết nối bất đồng bộ, cơ chế Retry/Exponential Backoff và streaming phản hồi thời gian thực qua Server-Sent Events (SSE).',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Chiến lược Chunking Đa tầng & Lưu trữ Vector trên PostgreSQL pgvector',
            description:
              'Phân tích ưu nhược điểm của Fixed-size, Recursive Markdown và Semantic Chunking. Cấu hình chỉ mục HNSW trên pgvector (m, ef_construction) và thiết kế lược đồ phân quyền tài liệu.',
            activityTags: ['THEORY', 'LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 3,
            title: 'Thuật toán Hybrid Search (Dense + BM25) & Reciprocal Rank Fusion (RRF)',
            description:
              'Khắc phục điểm mù của Vector Search đối với mã định danh, tên riêng và thuật ngữ chuyên ngành bằng kết hợp Full-Text Search (tsvector) cùng thuật toán hợp nhất hạng RRF và Reranking.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 4,
            title: 'Function Calling, Structured Outputs & Điều phối ReAct Agent',
            description:
              'Xây dựng công cụ (Tools) an toàn với Pydantic v2 JSON Schema, xử lý vòng lặp suy luận - hành động (Reasoning + Acting) và kiểm soát giới hạn bước chạy của Agent.',
            activityTags: ['THEORY', 'LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 5,
            title: 'LLMOps: Đánh giá Hệ thống RAG với Ragas, Guardrails & Tối ưu Chi phí',
            description:
              'Thiết lập bộ kiểm thử tự động đo lường Faithfulness, Answer Relevancy, Context Recall; tích hợp Semantic Caching trên Redis và bảo vệ hệ thống trước tấn công Prompt Injection.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Bảo vệ Đồ án Tốt nghiệp & Đánh giá Kiến trúc AI Toàn diện',
            description:
              'Tổng kết kiến trúc End-to-End, rà soát hiệu năng truy xuất và thực hiện bài thi sát hạch chứng chỉ kỹ sư AI dưới sự giám sát trực tuyến.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catSwe!.id,
        title: 'Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems',
        slug: 'kien-truc-backend-chuyen-sau-typescript-postgresql-distributed-systems',
        shortDescription:
          'Xây dựng hệ thống Backend chịu tải cao với Node.js/TypeScript, Drizzle ORM, thiết kế giao dịch ACID, Idempotent Webhook và kiến trúc bất đồng bộ Redis/BullMQ.',
        descriptionMd: `### Làm chủ Kiến trúc Backend Hiện đại
Chương trình tập trung giải quyết các bài toán thực tế trong hệ thống tài chính, thương mại điện tử và nền tảng giáo dục trực tuyến:
- Thiết kế lược đồ cơ sở dữ liệu chuẩn hóa, khóa bi quan/lạc quan (Pessimistic/Optimistic Locking) và tối ưu chỉ mục PostgreSQL.
- Xây dựng luồng thanh toán tự động qua Webhook có đảm bảo tính **Idempotency** (bất biến khi nhận thông báo trùng lặp).
- Quản lý hàng đợi công việc nền với Redis, giám sát nhật ký chuẩn JSON cùng Correlation ID xuyên suốt các tầng dịch vụ.`,
        thumbnailUrl: '/assets/aistudio/image_2a72f9f9.png',
        difficultyLevel: 2,
        status: 'PUBLISHED',
        embedding: makeDeterministicVector(502, 1024),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Kiến trúc Phân tầng (Clean Layered Architecture) & Kiểm soát Kiểu với TypeScript/Zod',
            description:
              'Tổ chức mã nguồn module hóa, chuẩn hóa hợp đồng dữ liệu DTO, xử lý lỗi tập trung và theo dõi truy vết với Correlation ID.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Thiết kế Cơ sở dữ liệu Quan hệ Nâng cao & Tối ưu Truy vấn PostgreSQL',
            description:
              'Phân tích Execution Plan với EXPLAIN ANALYZE, lựa chọn chỉ mục B-Tree/GIN/Partial Index và phòng chống lỗi N+1 Query.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Giao dịch ACID, Khóa Đồng thời (Concurrency Control) & Tích hợp Cổng Thanh toán',
            description:
              'Xử lý đối soát biên lai ngân hàng tự động qua Webhook, thiết kế bảng giao dịch bất biến và ngăn chặn lỗi cộng tiền kép.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 4,
            title: 'Chiến lược Caching Đa tầng với Redis & Hàng đợi Bất đồng bộ',
            description:
              'Triển khai mẫu Cache-Aside, Write-Through, xử lý bài toán Cache Stampede và điều phối tác vụ nặng qua Worker.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'Bảo mật API (JWT, RBAC, Rate Limiting) & Đóng gói Docker Production',
            description:
              'Thiết kế cơ chế phân quyền theo vai trò, bảo vệ hệ thống trước tấn công brute-force và thiết lập quy trình CI/CD tự động.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Kiểm thử Chịu tải (Load Testing) & Tổng kết Kiến trúc Hệ thống',
            description:
              'Đo kiểm hiệu năng thực tế với k6, phân tích điểm nghẽn cổ chai và hoàn thiện đồ án tốt nghiệp.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catData!.id,
        title: 'Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse',
        slug: 'ky-su-du-lieu-hien-dai-streaming-kafka-pyspark-lakehouse',
        shortDescription:
          'Thiết kế hạ tầng Data Pipeline thời gian thực và xử lý dữ liệu lớn với Apache Kafka, PySpark, dbt và kiến trúc Data Lakehouse chuẩn doanh nghiệp.',
        descriptionMd: `### Kiến tạo Hạ tầng Dữ liệu Doanh nghiệp
Khóa học trang bị kỹ năng toàn diện để xây dựng đường ống dữ liệu (Data Pipeline) tin cậy, phục vụ cả nhu cầu báo cáo BI lẫn huấn luyện/truy xuất cho hệ thống AI.`,
        thumbnailUrl: '/assets/aistudio/image_cae9b584.png',
        difficultyLevel: 3,
        status: 'PUBLISHED',
        embedding: makeDeterministicVector(503, 1024),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Kiến trúc Data Lakehouse & Thiết kế Đường ống Dữ liệu Bền vững',
            description: 'Phân biệt kiến trúc Medallion (Bronze, Silver, Gold) và tiêu chuẩn chất lượng dữ liệu.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Xử lý Dữ liệu Phân tán Quy mô lớn với Apache Spark & PySpark',
            description: 'Tối ưu Spark DAG, quản lý bộ nhớ Executor, Partitioning và phòng tránh Data Skew.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Thu thập & Xử lý Luồng Sự kiện Thời gian thực với Apache Kafka',
            description:
              'Thiết kế Kafka Topic, Consumer Group, đảm bảo ngữ nghĩa Exactly-once và tích hợp Spark Structured Streaming.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 4,
            title: 'Analytics Engineering: Chuẩn hóa Kho Dữ liệu với dbt (Data Build Tool)',
            description: 'Xây dựng mô hình Star Schema, viết kiểm thử dữ liệu tự động và sinh tài liệu Data Lineage.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'Tích hợp Vector Store & Feature Store cho Hệ thống AI/ML',
            description:
              'Đồng bộ dữ liệu từ tầng Gold sang PostgreSQL pgvector để cấp ngữ cảnh tươi mới cho ứng dụng RAG.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Bảo vệ Đồ án Data Pipeline & Sát hạch Cuối khóa',
            description: 'Đánh giá kiến trúc đường ống dữ liệu End-to-End và kiểm tra năng lực kỹ thuật.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catProg!.id,
        title: 'Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI',
        slug: 'lap-trinh-python-sql-thuc-chien-cho-ky-su-du-lieu-ai',
        shortDescription:
          'Xây dựng nền tảng cốt lõi vững chắc về Python hiện đại (Type Hints, OOP, AsyncIO) và truy vấn SQL phân tích chuyên sâu trên PostgreSQL.',
        descriptionMd: `### Nền tảng Vững chắc cho Lộ trình AI & Data
Khóa học giúp học viên rèn luyện tư duy lập trình sạch, làm chủ cấu trúc dữ liệu, xử lý bất đồng bộ trong Python và viết các truy vấn SQL phân tích phức tạp (CTE, Window Functions, JSONB) trên PostgreSQL.`,
        thumbnailUrl: '/assets/aistudio/image_d79fa6f8.png',
        difficultyLevel: 1,
        status: 'PUBLISHED',
        embedding: makeDeterministicVector(504, 1024),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Tư duy Python Hiện đại: Cấu trúc Dữ liệu, Type Hints & Quản lý Bộ nhớ',
            description: 'Làm chủ List/Dict Comprehension, Generator, Decorator và chuẩn kiểm tra kiểu tĩnh.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Lập trình Hướng đối tượng (OOP), Xử lý Ngoại lệ & Kiểm thử với Pytest',
            description: 'Thiết kế module tái sử dụng, sử dụng Pydantic cơ bản và viết Unit Test chuẩn kỹ sư.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Lập trình Bất đồng bộ (AsyncIO) & Thu thập Dữ liệu qua HTTP API',
            description: 'Hiểu rõ Event Loop, sử dụng httpx bất đồng bộ và xử lý đồng thời hàng trăm yêu cầu mạng.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 4,
            title: 'Thiết kế Cơ sở Dữ liệu Quan hệ & Truy vấn SQL Cốt lõi trên PostgreSQL',
            description: 'Chuẩn hóa bảng, ràng buộc khóa ngoại, các phép kết nối JOIN và gom nhóm dữ liệu.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'SQL Phân tích Nâng cao: CTE, Window Functions & Truy vấn JSONB',
            description:
              'Giải quyết các bài toán xếp hạng, tính tổng lũy kế, phân tích cohort và trích xuất dữ liệu bán cấu trúc.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 6,
            title: 'Xây dựng Ứng dụng Tổng hợp Python + PostgreSQL & Thi Cuối khóa',
            description:
              'Kết nối Python với PostgreSQL qua connection pool, hoàn thiện dự án thực tế và làm bài thi sát hạch.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
    ])
    .returning();

  // =========================================================================
  // 6. COURSE SKILLS (Prerequisite & Learning Outcome Mappings)
  // =========================================================================
  await db.insert(courseSkills).values([
    { courseId: courseAi!.id, skillId: skPython!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skRag!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseAi!.id, skillId: skTool!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseAi!.id, skillId: skFastApi!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skLangGraph!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skEval!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: courseSwe!.id, skillId: skNode!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseSwe!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseSwe!.id, skillId: skSysDesign!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseSwe!.id, skillId: skDocker!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: courseData!.id, skillId: skPython!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
    { courseId: courseData!.id, skillId: skSqlVec!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
    { courseId: courseData!.id, skillId: skSparkKafka!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseData!.id, skillId: skDbt!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseData!.id, skillId: skDocker!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: coursePython!.id, skillId: skPython!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: coursePython!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: coursePython!.id, skillId: skFastApi!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 0.8 },
  ]);

  // =========================================================================
  // 7. COHORTS (5 Cohorts across ONGOING, OPENING, DRAFT, COMPLETED)
  // =========================================================================
  const [cohortAiK01, cohortAiK02, cohortSweK01, cohortDataK01, cohortPyK04] = await db
    .insert(cohorts)
    .values([
      {
        courseId: courseAi!.id,
        instructorId: instKhoaAcc!.id,
        code: 'AI-ENG-2026-K01',
        name: 'Đợt K01 — Mùa Xuân 2026 (Tối Thứ 3 & Thứ 5)',
        status: 'ONGOING',
        curriculumVersion: 'v2.4-2026',
        techStackNotes:
          'Python 3.11 · FastAPI · PostgreSQL 16 (pgvector 0.7) · OpenAI / Gemini SDK · Redis 7 · Docker',
        tuitionVnd: 6800000,
        enrolledCount: 5,
        enrollmentOpenAt: new Date('2026-02-01T00:00:00Z'),
        startDate: '2026-03-03',
        endDate: '2026-04-14',
        scheduleSlots: [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        courseId: courseAi!.id,
        instructorId: instKhoaAcc!.id,
        code: 'AI-ENG-2026-K02',
        name: 'Đợt K02 — Mùa Hè 2026 (Tối Thứ 2 & Thứ 6)',
        status: 'OPENING',
        curriculumVersion: 'v2.5-2026',
        techStackNotes: 'Python 3.12 · FastAPI · pgvector HNSW · LangGraph · Ragas Evaluation · Docker',
        tuitionVnd: 6800000,
        enrolledCount: 1,
        enrollmentOpenAt: new Date('2026-03-15T00:00:00Z'),
        startDate: '2026-05-11',
        endDate: '2026-06-29',
        scheduleSlots: [
          { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 5, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        courseId: courseSwe!.id,
        instructorId: instHaAcc!.id,
        code: 'SWE-ARCH-2026-K01',
        name: 'Đợt K01 — Kiến trúc Backend Chuyên sâu (Tối Thứ 4 & Chủ Nhật)',
        status: 'ONGOING',
        curriculumVersion: 'v1.8-2026',
        techStackNotes: 'Node.js 22 · TypeScript 5.8 · Express · Drizzle ORM · PostgreSQL 16 · Redis · Docker',
        tuitionVnd: 5900000,
        enrolledCount: 2,
        enrollmentOpenAt: new Date('2026-03-01T00:00:00Z'),
        startDate: '2026-03-25',
        endDate: '2026-04-26',
        scheduleSlots: [
          { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 0, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        courseId: courseData!.id,
        instructorId: instHaAcc!.id,
        code: 'DATA-PIPE-2026-K01',
        name: 'Đợt K01 — Kỹ sư Data Streaming & Lakehouse (Thứ 7 & Chủ Nhật)',
        status: 'DRAFT',
        curriculumVersion: 'v1.2-2026',
        techStackNotes: 'Python 3.11 · Apache Spark 3.5 · Apache Kafka · dbt Core · PostgreSQL · Docker',
        tuitionVnd: 7200000,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-05-20T00:00:00Z'),
        startDate: '2026-06-13',
        endDate: '2026-08-02',
        scheduleSlots: [
          { dayOfWeek: 6, startTime: '14:00', endTime: '16:30' },
          { dayOfWeek: 0, startTime: '14:00', endTime: '16:30' },
        ],
      },
      {
        courseId: coursePython!.id,
        instructorId: instHaAcc!.id,
        code: 'PY-SQL-2026-K04',
        name: 'Đợt K04 — Lập trình Python & SQL Thực chiến (Đã tốt nghiệp)',
        status: 'COMPLETED',
        curriculumVersion: 'v3.0-2026',
        techStackNotes: 'Python 3.11 · AsyncIO · Pytest · PostgreSQL 16 · CTE & Window Functions',
        tuitionVnd: 4200000,
        enrolledCount: 2,
        enrollmentOpenAt: new Date('2025-12-01T00:00:00Z'),
        startDate: '2026-01-05',
        endDate: '2026-02-25',
        scheduleSlots: [
          { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
    ])
    .returning();

  // =========================================================================
  // 8. ORDERS (11 Orders across PAID, PENDING)
  // =========================================================================
  const insertedOrders = await db
    .insert(orders)
    .values([
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        orderCode: 'ORD3T260220',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260220',
        expiresAt: new Date('2026-02-20T10:15:00Z'),
        paidAt: new Date('2026-02-20T10:04:12Z'),
        createdAt: new Date('2026-02-20T10:00:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        cohortId: cohortAiK01!.id,
        orderCode: 'ORD3T260221',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260221',
        expiresAt: new Date('2026-02-21T14:15:00Z'),
        paidAt: new Date('2026-02-21T14:05:30Z'),
        createdAt: new Date('2026-02-21T14:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        cohortId: cohortAiK01!.id,
        orderCode: 'ORD3T260222',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260222',
        expiresAt: new Date('2026-02-22T09:15:00Z'),
        paidAt: new Date('2026-02-22T09:06:45Z'),
        createdAt: new Date('2026-02-22T09:00:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        cohortId: cohortAiK01!.id,
        orderCode: 'ORD3T260223',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260223',
        expiresAt: new Date('2026-02-23T16:15:00Z'),
        paidAt: new Date('2026-02-23T16:08:10Z'),
        createdAt: new Date('2026-02-23T16:00:00Z'),
      },
      {
        accountId: stuAnhAcc!.id,
        cohortId: cohortAiK01!.id,
        orderCode: 'ORD3T260224',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260224',
        expiresAt: new Date('2026-02-24T11:15:00Z'),
        paidAt: new Date('2026-02-24T11:03:22Z'),
        createdAt: new Date('2026-02-24T11:00:00Z'),
      },
      {
        accountId: stuKhanhAcc!.id,
        cohortId: cohortAiK02!.id,
        orderCode: 'ORD3T260320',
        amountVnd: 6800000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260320',
        expiresAt: new Date('2026-03-20T15:15:00Z'),
        paidAt: new Date('2026-03-20T15:02:50Z'),
        createdAt: new Date('2026-03-20T15:00:00Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        cohortId: cohortSweK01!.id,
        orderCode: 'ORD3T260322',
        amountVnd: 5900000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260322',
        expiresAt: new Date('2026-03-22T20:15:00Z'),
        paidAt: new Date('2026-03-22T20:05:18Z'),
        createdAt: new Date('2026-03-22T20:00:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortSweK01!.id,
        orderCode: 'ORD3T260324',
        amountVnd: 5900000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260324',
        expiresAt: new Date('2026-03-24T10:15:00Z'),
        paidAt: new Date('2026-03-24T10:04:00Z'),
        createdAt: new Date('2026-03-24T10:00:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        cohortId: cohortPyK04!.id,
        orderCode: 'ORD3T260102',
        amountVnd: 4200000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260102',
        expiresAt: new Date('2026-01-02T09:15:00Z'),
        paidAt: new Date('2026-01-02T09:05:00Z'),
        createdAt: new Date('2026-01-02T09:00:00Z'),
      },
      {
        accountId: stuKhoiAcc!.id,
        cohortId: cohortPyK04!.id,
        orderCode: 'ORD3T260103',
        amountVnd: 4200000,
        status: 'PAID',
        idempotencyKey: 'idem-ord-260103',
        expiresAt: new Date('2026-01-03T11:15:00Z'),
        paidAt: new Date('2026-01-03T11:04:00Z'),
        createdAt: new Date('2026-01-03T11:00:00Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        cohortId: cohortAiK02!.id,
        orderCode: 'ORD3T260405',
        amountVnd: 6800000,
        status: 'PENDING',
        idempotencyKey: 'idem-ord-260405',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        paidAt: null,
        createdAt: new Date('2026-04-05T08:30:00Z'),
      },
    ])
    .returning();

  const [
    ordAnAi,
    ordMaiAi,
    ordHaAi,
    ordQuanAi,
    ordAnhAi,
    ordKhanhAi2,
    ordBaoSwe,
    ordAnSwe,
    ordMaiPy,
    ordKhoiPy,
    ordBaoPending,
  ] = insertedOrders;

  // =========================================================================
  // 9. PAYMENT TRANSACTIONS (SePay VietQR Webhook Logs)
  // =========================================================================
  await db.insert(paymentTransactions).values([
    {
      orderId: ordAnAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990101',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'MBVCB.990101.NGUYEN VAN AN chuyen khoan ORD3T260220',
        referenceCode: 'FT26051990101',
      },
      createdAt: new Date('2026-02-20T10:04:12Z'),
    },
    {
      orderId: ordMaiAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990102',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'LE HOANG MAI thanh toan hoc phi ORD3T260221',
        referenceCode: 'FT26052990102',
      },
      createdAt: new Date('2026-02-21T14:05:30Z'),
    },
    {
      orderId: ordHaAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990103',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'TRAN THU HA CK ORD3T260222',
        referenceCode: 'FT26053990103',
      },
      createdAt: new Date('2026-02-22T09:06:45Z'),
    },
    {
      orderId: ordQuanAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990104',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'PHAM MINH QUAN TT ORD3T260223',
        referenceCode: 'FT26054990104',
      },
      createdAt: new Date('2026-02-23T16:08:10Z'),
    },
    {
      orderId: ordAnhAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990105',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'DO TUAN ANH CK ORD3T260224',
        referenceCode: 'FT26055990105',
      },
      createdAt: new Date('2026-02-24T11:03:22Z'),
    },
    {
      orderId: ordKhanhAi2!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990120',
      amountVnd: 6800000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'NGO QUOC KHANH CK ORD3T260320',
        referenceCode: 'FT26079990120',
      },
      createdAt: new Date('2026-03-20T15:02:50Z'),
    },
    {
      orderId: ordBaoSwe!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990122',
      amountVnd: 5900000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 5900000,
        content: 'HOANG GIA BAO CK ORD3T260322',
        referenceCode: 'FT26081990122',
      },
      createdAt: new Date('2026-03-22T20:05:18Z'),
    },
    {
      orderId: ordAnSwe!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990124',
      amountVnd: 5900000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 5900000,
        content: 'NGUYEN VAN AN CK ORD3T260324',
        referenceCode: 'FT26083990124',
      },
      createdAt: new Date('2026-03-24T10:04:00Z'),
    },
    {
      orderId: ordMaiPy!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-880102',
      amountVnd: 4200000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 4200000,
        content: 'LE HOANG MAI CK ORD3T260102',
        referenceCode: 'FT26002880102',
      },
      createdAt: new Date('2026-01-02T09:05:00Z'),
    },
    {
      orderId: ordKhoiPy!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-880103',
      amountVnd: 4200000,
      responseCode: '00',
      matchStatus: 'MATCHED',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 4200000,
        content: 'VU DINH KHOI CK ORD3T260103',
        referenceCode: 'FT26003880103',
      },
      createdAt: new Date('2026-01-03T11:04:00Z'),
    },
    {
      orderId: ordBaoPending!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990405-ERR',
      amountVnd: 6000000,
      responseCode: '02',
      matchStatus: 'AMOUNT_MISMATCH',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6000000,
        expectedAmount: 6800000,
        content: 'HOANG GIA BAO CK TAM UNG ORD3T260405',
        referenceCode: 'FT26095990405',
      },
      createdAt: new Date('2026-04-05T08:42:00Z'),
    },
    {
      orderId: null,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-MB-990406-UNM',
      amountVnd: 6800000,
      responseCode: '01',
      matchStatus: 'UNMATCHED_ORDER',
      rawPayload: {
        gateway: 'MBBank',
        accountNumber: '0389998888',
        transferAmount: 6800000,
        content: 'NGUYEN MINH DUC chuyen khoan hoc phi lop AI K02',
        referenceCode: 'FT26096990406',
      },
      createdAt: new Date('2026-04-05T10:15:00Z'),
    },
  ]);

  // =========================================================================
  // 10. ENROLLMENTS (10 Enrollments across ACTIVE, COMPLETED)
  // =========================================================================
  const insertedEnrollments = await db
    .insert(enrollments)
    .values([
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordAnAi!.id,
        status: 'COMPLETED',
        finalExamPassed: true,
        dropoutRiskScore: 0.04,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-02-20T10:04:15Z'),
        completedAt: new Date('2026-04-03T12:00:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordMaiAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.14,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-02-21T14:05:35Z'),
      },
      {
        accountId: stuHaAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordHaAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.42,
        riskLevel: 'MEDIUM',
        enrolledAt: new Date('2026-02-22T09:06:50Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordQuanAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.78,
        riskLevel: 'HIGH',
        enrolledAt: new Date('2026-02-23T16:08:15Z'),
      },
      {
        accountId: stuAnhAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordAnhAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.86,
        riskLevel: 'HIGH',
        enrolledAt: new Date('2026-02-24T11:03:25Z'),
      },
      {
        accountId: stuKhanhAcc!.id,
        cohortId: cohortAiK02!.id,
        orderId: ordKhanhAi2!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.1,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-03-20T15:02:55Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        cohortId: cohortSweK01!.id,
        orderId: ordBaoSwe!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.12,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-03-22T20:05:20Z'),
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortSweK01!.id,
        orderId: ordAnSwe!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.1,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-03-24T10:04:05Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        cohortId: cohortPyK04!.id,
        orderId: ordMaiPy!.id,
        status: 'COMPLETED',
        finalExamPassed: true,
        dropoutRiskScore: 0.04,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-01-02T09:05:05Z'),
        completedAt: new Date('2026-02-26T09:00:00Z'),
      },
      {
        accountId: stuKhoiAcc!.id,
        cohortId: cohortPyK04!.id,
        orderId: ordKhoiPy!.id,
        status: 'COMPLETED',
        finalExamPassed: true,
        dropoutRiskScore: 0.05,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-01-03T11:04:05Z'),
        completedAt: new Date('2026-02-26T09:30:00Z'),
      },
    ])
    .returning();

  const [enrAnAi, , , , , , , , enrMaiPy, enrKhoiPy] = insertedEnrollments;

  // =========================================================================
  // 11. CLASS SESSIONS (24 Sessions: Complete 6-session schedules for 4 cohorts)
  // =========================================================================
  const insertedSessions = await db
    .insert(classSessions)
    .values([
      // --- AI-ENG-2026-K01 (All 6 sessions finished & REPLAY_READY) ---
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 1,
        title: 'Kiến trúc Hệ thống AI Production & Xử lý Bất đồng bộ với Python AsyncIO',
        descriptionMd:
          'Xây dựng nền tảng dịch vụ AI Gateway bằng FastAPI + AsyncIO, quản lý Connection Pool, cơ chế Exponential Backoff khi gọi LLM API và truyền phát câu trả lời theo thời gian thực qua Server-Sent Events (SSE).',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-03-03T12:30:00Z'),
        scheduledEnd: new Date('2026-03-03T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s01/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 1
1. **Sự khác biệt giữa Notebook Prototype và Production AI**: Hệ thống thực tế đòi hỏi kiểm soát độ trễ (p95 latency), giới hạn tốc độ (Rate Limit) và khả năng chịu lỗi khi nhà cung cấp LLM gặp sự cố.
2. **AsyncIO & FastAPI**: Tuyệt đối không gọi SDK đồng bộ (\`requests\`, \`time.sleep\`) bên trong hàm \`async def\` vì sẽ làm nghẽn toàn bộ Event Loop.
3. **Streaming SSE**: Giúp giảm thời gian phản hồi token đầu tiên (TTFT - Time To First Token) xuống dưới 400ms.`,
      },
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 2,
        title: 'Chiến lược Chunking Đa tầng & Lưu trữ Vector trên PostgreSQL pgvector',
        descriptionMd:
          'Thiết kế quy trình bóc tách tài liệu PDF/Markdown theo cấu trúc ngữ nghĩa, lựa chọn mô hình Embedding 1024 chiều và cấu hình chỉ mục HNSW trên PostgreSQL pgvector.',
        activityTags: ['THEORY', 'LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-03-05T12:30:00Z'),
        scheduledEnd: new Date('2026-03-05T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s02/master.m3u8',
        durationSeconds: 5700,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 2
1. **Markdown Header + Recursive Chunking**: Giữ nguyên ngữ cảnh tiêu đề cha-con và thiết lập \`chunk_overlap\` từ 10%–15% để không cắt đứt ý nghĩa giữa hai đoạn liên tiếp.
2. **Chỉ mục HNSW trên pgvector**: Sử dụng toán tử \`vector_cosine_ops\` (\`<=>\`) với tham số \`m = 16, ef_construction = 64\` để cân bằng giữa tốc độ truy vấn ANN và dung lượng RAM.`,
      },
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 3,
        title: 'Thuật toán Hybrid Search (Dense + BM25) & Reciprocal Rank Fusion (RRF)',
        descriptionMd:
          'Kết hợp tìm kiếm ngữ nghĩa pgvector với tìm kiếm từ khóa PostgreSQL Full-Text Search (tsvector/GIN), hợp nhất bảng xếp hạng bằng RRF (k=60) và tinh chỉnh kết quả với Cross-Encoder Reranker.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-03-10T12:30:00Z'),
        scheduledEnd: new Date('2026-03-10T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s03/master.m3u8',
        durationSeconds: 6000,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 3
1. **Tại sao cần Hybrid Search**: Dense Vector hiểu ngữ nghĩa tổng quát nhưng thường bỏ sót mã sản phẩm, mã lỗi kỹ thuật hoặc điều khoản chính xác.
2. **Công thức RRF**: $RRF\\_Score(d) = \\frac{1}{k + rank_{dense}(d)} + \\frac{1}{k + rank_{bm25}(d)}$ với $k = 60$ giúp hợp nhất hai danh sách mà không cần chuẩn hóa thang điểm khác biệt.
3. **Pre-filtering RBAC**: Luôn lọc quyền truy cập (\`WHERE visibility = ...\`) ở tầng SQL trước khi đưa ngữ cảnh vào LLM.`,
      },
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 4,
        title: 'Function Calling, Structured Outputs & Điều phối ReAct Agent',
        descriptionMd:
          'Xây dựng các công cụ (Tools) có kiểm tra kiểu dữ liệu nghiêm ngặt bằng Pydantic v2, xử lý vòng lặp suy luận ReAct và kết nối Agent với hệ thống cơ sở dữ liệu nghiệp vụ.',
        activityTags: ['THEORY', 'LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-03-12T12:30:00Z'),
        scheduledEnd: new Date('2026-03-12T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s04/master.m3u8',
        durationSeconds: 5850,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 4
1. **Pydantic v2 Schema**: Dùng \`Field(description=...)\` rõ ràng để LLM hiểu chính xác ngữ nghĩa từng tham số khi sinh lời gọi hàm.
2. **Kiểm soát vòng lặp Agent**: Luôn đặt \`max_iterations\` (thường từ 3–5 bước) và bắt lỗi \`ValidationError\` để phản hồi ngược cho mô hình tự sửa tham số.`,
      },
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 5,
        title: 'LLMOps: Đánh giá Hệ thống RAG với Ragas, Guardrails & Tối ưu Chi phí',
        descriptionMd:
          'Thực hành đo lường định lượng chất lượng hệ thống RAG (Faithfulness, Answer Relevancy, Context Precision), thiết lập Semantic Cache trên Redis và bảo vệ hệ thống trước Prompt Injection.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-03-17T12:30:00Z'),
        scheduledEnd: new Date('2026-03-17T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s05/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 5
1. **Bộ tứ chỉ số Ragas**: Context Precision, Context Recall (đánh giá tầng Retrieval) và Faithfulness, Answer Relevancy (đánh giá tầng Generation).
2. **Semantic Caching**: Lưu trữ cặp vector câu hỏi - câu trả lời trên Redis giúp tiết kiệm 35%–50% chi phí gọi API cho các câu hỏi lặp lại.`,
      },
      {
        cohortId: cohortAiK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 6,
        title: 'Bảo vệ Đồ án Tốt nghiệp & Đánh giá Kiến trúc AI Toàn diện',
        descriptionMd:
          'Tổng duyệt kiến trúc dự án cuối khóa, kiểm tra hiệu năng truy xuất thực tế và hướng dẫn quy chế phòng thi sát hạch chứng chỉ có giám sát AI Proctoring.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-03-19T12:30:00Z'),
        scheduledEnd: new Date('2026-03-19T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-ai-k01-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/ai-k01/s06/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: `### Tóm tắt trọng tâm Buổi 6
1. **Danh mục nghiệm thu đồ án Production AI**: Đảm bảo đầy đủ Docker Compose, migration pgvector, kiểm thử Ragas đạt Faithfulness >= 0.85 và xử lý lỗi an toàn.
2. **Quy chế phòng thi sát hạch**: Mở khóa sau khi hoàn tất 6/6 buổi học và bài kiểm tra củng cố.`,
      },

      // --- PY-SQL-2026-K04 (All 6 sessions finished & REPLAY_READY) ---
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 1,
        title: 'Tư duy Python Hiện đại: Cấu trúc Dữ liệu, Type Hints & Quản lý Bộ nhớ',
        descriptionMd:
          'Làm chủ Python 3.11, List/Dict Comprehension, Generator, Decorator và chuẩn kiểm tra kiểu tĩnh.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-05T12:30:00Z'),
        scheduledEnd: new Date('2026-01-05T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s01/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt cấu trúc dữ liệu Python, Generator (yield) và Type Hints chuẩn 3.11.',
      },
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 2,
        title: 'Lập trình Hướng đối tượng (OOP), Xử lý Ngoại lệ & Kiểm thử với Pytest',
        descriptionMd:
          'Thiết kế module tái sử dụng, kiểm tra dữ liệu với Pydantic cơ bản và viết Unit Test bằng pytest.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-08T12:30:00Z'),
        scheduledEnd: new Date('2026-01-08T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s02/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt OOP, `@pytest.mark.parametrize` và kiểm thử trường hợp biên.',
      },
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 3,
        title: 'Lập trình Bất đồng bộ (AsyncIO) & Thu thập Dữ liệu qua HTTP API',
        descriptionMd:
          'Hiểu rõ Event Loop, `async with` quản lý Connection Pool và httpx bất đồng bộ.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-01-12T12:30:00Z'),
        scheduledEnd: new Date('2026-01-12T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s03/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt `asyncio.gather`, `async with` và kiểm soát đồng thời.',
      },
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 4,
        title: 'Thiết kế Cơ sở Dữ liệu Quan hệ & Truy vấn SQL Cốt lõi trên PostgreSQL',
        descriptionMd:
          'Chuẩn hóa bảng dữ liệu, ràng buộc khóa ngoại, JOIN và tối ưu chỉ mục B-Tree.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-15T12:30:00Z'),
        scheduledEnd: new Date('2026-01-15T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s04/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt thiết kế 3NF, phân tích `EXPLAIN ANALYZE` và chỉ mục B-Tree.',
      },
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 5,
        title: 'SQL Phân tích Nâng cao: CTE, Window Functions & Truy vấn JSONB',
        descriptionMd:
          'Giải quyết các bài toán xếp hạng, tính tổng lũy kế, phân tích cohort và toán tử `@>` trên JSONB + GIN.',
        activityTags: ['LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-01-19T12:30:00Z'),
        scheduledEnd: new Date('2026-01-19T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s05/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt CTE, `RANK()`, `DENSE_RANK()`, `LAG()` và truy vấn JSONB.',
      },
      {
        cohortId: cohortPyK04!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 6,
        title: 'Xây dựng Ứng dụng Tổng hợp Python + PostgreSQL & Chuẩn bị Thi Cuối khóa',
        descriptionMd:
          'Kết nối Python AsyncPG với PostgreSQL qua Keyset Pagination, tổng kết kiến thức trước kỳ thi tốt nghiệp.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-01-22T12:30:00Z'),
        scheduledEnd: new Date('2026-01-22T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k04-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k04/s06/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt Keyset Pagination và tổng duyệt dự án Python + PostgreSQL.',
      },

      // --- SWE-ARCH-2026-K01 (ONGOING: s01-s03 REPLAY_READY, s04 LIVE, s05-s06 SCHEDULED) ---
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 1,
        title: 'Kiến trúc Phân tầng (Clean Layered Architecture) & Kiểm soát Kiểu với TypeScript/Zod',
        descriptionMd:
          'Tổ chức mã nguồn module hóa, chuẩn hóa hợp đồng dữ liệu DTO, xử lý lỗi tập trung và theo dõi truy vết với Correlation ID.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-03-25T12:30:00Z'),
        scheduledEnd: new Date('2026-03-25T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-swe-k01-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/swe-k01/s01/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt kiến trúc 3 tầng Routes -> Services -> Repositories, Zod validation và Correlation ID.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 2,
        title: 'Thiết kế Cơ sở dữ liệu Quan hệ Nâng cao & Tối ưu Truy vấn PostgreSQL',
        descriptionMd:
          'Phân tích Execution Plan với EXPLAIN ANALYZE, lựa chọn chỉ mục B-Tree/GIN/Partial Index và phòng chống lỗi N+1 Query.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-03-29T12:30:00Z'),
        scheduledEnd: new Date('2026-03-29T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-swe-k01-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/swe-k01/s02/master.m3u8',
        durationSeconds: 5550,
        aiSummaryMd: 'Tóm tắt đọc `EXPLAIN ANALYZE`, composite index và loại bỏ N+1 Query với Drizzle ORM.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 3,
        title: 'Giao dịch ACID, Khóa Đồng thời (Concurrency Control) & Tích hợp Cổng Thanh toán',
        descriptionMd:
          'Xử lý đối soát biên lai ngân hàng tự động qua Webhook, thiết kế bảng giao dịch bất biến và ngăn chặn lỗi cộng tiền kép.',
        activityTags: ['LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-04-01T12:30:00Z'),
        scheduledEnd: new Date('2026-04-01T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-swe-k01-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/swe-k01/s03/master.m3u8',
        durationSeconds: 5700,
        aiSummaryMd: 'Tóm tắt Pessimistic Locking (`FOR UPDATE`), Unique Idempotency Key và xử lý SePay Webhook.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 4,
        title: 'Chiến lược Caching Đa tầng với Redis & Hàng đợi Bất đồng bộ',
        descriptionMd:
          'Triển khai mẫu Cache-Aside, Write-Through, xử lý bài toán Cache Stampede và điều phối tác vụ nặng qua Worker.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-04-05T12:30:00Z'),
        scheduledEnd: new Date('2026-04-05T14:30:00Z'),
        status: 'LIVE',
        livekitRoomName: 'room-swe-k01-s04-live',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Buổi học đang phát trực tiếp cùng ThS. Nguyễn Thu Hà về Redis Cache-Aside và BullMQ Worker.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 5,
        title: 'Bảo mật API (JWT, RBAC, Rate Limiting) & Đóng gói Docker Production',
        descriptionMd:
          'Thiết kế cơ chế phân quyền theo vai trò, bảo vệ hệ thống trước tấn công brute-force và thiết lập quy trình CI/CD tự động.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-04-08T12:30:00Z'),
        scheduledEnd: new Date('2026-04-08T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-swe-k01-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Tài liệu chuẩn bị cho Buổi 5: JWT Rotation, Rate Limit Redis và Multi-stage Dockerfile.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 6,
        title: 'Kiểm thử Chịu tải (Load Testing) & Tổng kết Kiến trúc Hệ thống',
        descriptionMd:
          'Đo kiểm hiệu năng thực tế với k6, phân tích điểm nghẽn cổ chai và hoàn thiện đồ án tốt nghiệp.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-04-12T12:30:00Z'),
        scheduledEnd: new Date('2026-04-12T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-swe-k01-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Tài liệu chuẩn bị cho Buổi 6: Kịch bản k6 Load Testing và tổng duyệt đồ án cuối khóa.',
      },

      // --- AI-ENG-2026-K02 (OPENING: All 6 sessions SCHEDULED, no recordings yet) ---
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 1,
        title: 'Buổi 1 (Đợt K02): Kiến trúc Hệ thống AI Production & Python AsyncIO',
        descriptionMd:
          'Buổi khai giảng đợt học K02: Thiết lập môi trường Docker + pgvector và xây dựng dịch vụ FastAPI bất đồng bộ đầu tiên.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-05-11T12:30:00Z'),
        scheduledEnd: new Date('2026-05-11T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Tài liệu chuẩn bị cho buổi khai giảng đợt K02.',
      },
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 2,
        title: 'Buổi 2 (Đợt K02): Chiến lược Chunking Đa tầng & Vector pgvector',
        descriptionMd: 'Chuẩn bị kiến thức Chunking theo Markdown Header và chỉ mục HNSW.',
        activityTags: ['THEORY', 'LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-05-15T12:30:00Z'),
        scheduledEnd: new Date('2026-05-15T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 2 đợt K02.',
      },
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 3,
        title: 'Buổi 3 (Đợt K02): Hybrid Search (Dense + BM25) & RRF',
        descriptionMd: 'Kết hợp pgvector với PostgreSQL Full-Text Search và Cross-Encoder Reranker.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-05-18T12:30:00Z'),
        scheduledEnd: new Date('2026-05-18T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 3 đợt K02.',
      },
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 4,
        title: 'Buổi 4 (Đợt K02): Function Calling & Multi-Agent LangGraph',
        descriptionMd: 'Thiết kế Tool Calling với Pydantic v2 và điều phối đồ thị trạng thái LangGraph.',
        activityTags: ['THEORY', 'LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-05-22T12:30:00Z'),
        scheduledEnd: new Date('2026-05-22T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 4 đợt K02.',
      },
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 5,
        title: 'Buổi 5 (Đợt K02): LLMOps, Đánh giá Ragas & Guardrails',
        descriptionMd: 'Đo lường Faithfulness, Context Recall và triển khai Semantic Cache Redis.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-05-25T12:30:00Z'),
        scheduledEnd: new Date('2026-05-25T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 5 đợt K02.',
      },
      {
        cohortId: cohortAiK02!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 6,
        title: 'Buổi 6 (Đợt K02): Bảo vệ Đồ án Tốt nghiệp & Sát hạch',
        descriptionMd: 'Nghiệm thu dự án Production AI và phổ biến quy chế thi trực tuyến.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-05-29T12:30:00Z'),
        scheduledEnd: new Date('2026-05-29T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-ai-k02-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 6 đợt K02.',
      },
    ])
    .returning();

  const [
    sess1,
    sess2,
    sess3,
    sess4,
    sess5,
    sess6,
    sessPy1,
    sessPy2,
    sessPy3,
    sessPy4,
    sessPy5,
    sessPy6,
    sessSwe1,
    sessSwe2,
    sessSwe3,
    sessSwe4,
  ] = insertedSessions;

  // =========================================================================
  // 12. SESSION PROGRESS (Strictly on REPLAY_READY sessions)
  // =========================================================================
  await db.insert(sessionProgress).values([
    // --- Nguyễn Văn An: AI-ENG-2026-K01 (6/6 completed before 2026-04-03 final exam) ---
    {
      accountId: stuAnAcc!.id,
      sessionId: sess1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-03T15:00:00Z'),
      lastActivityAt: new Date('2026-03-03T15:00:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sess2!.id,
      lastPositionSec: 5700,
      isCompleted: true,
      completedAt: new Date('2026-03-05T15:10:00Z'),
      lastActivityAt: new Date('2026-03-05T15:10:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sess3!.id,
      lastPositionSec: 6000,
      isCompleted: true,
      completedAt: new Date('2026-03-10T15:20:00Z'),
      lastActivityAt: new Date('2026-03-10T15:20:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sess4!.id,
      lastPositionSec: 5850,
      isCompleted: true,
      completedAt: new Date('2026-03-12T15:15:00Z'),
      lastActivityAt: new Date('2026-03-12T15:15:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sess5!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-17T14:50:00Z'),
      lastActivityAt: new Date('2026-03-17T14:50:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sess6!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-19T15:00:00Z'),
      lastActivityAt: new Date('2026-03-19T15:00:00Z'),
    },

    // --- Nguyễn Văn An: SWE-ARCH-2026-K01 (Buổi 1-2 completed, Buổi 3 in progress) ---
    {
      accountId: stuAnAcc!.id,
      sessionId: sessSwe1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-25T15:05:00Z'),
      lastActivityAt: new Date('2026-03-25T15:05:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sessSwe2!.id,
      lastPositionSec: 5550,
      isCompleted: true,
      completedAt: new Date('2026-03-29T15:15:00Z'),
      lastActivityAt: new Date('2026-03-29T15:15:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      sessionId: sessSwe3!.id,
      lastPositionSec: 2400,
      isCompleted: false,
      completedAt: null,
      lastActivityAt: new Date('2026-04-04T19:00:00Z'),
    },

    // --- Lê Hoàng Mai: AI-ENG-2026-K01 (Buổi 1-5 completed, Buổi 6 in progress) ---
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-03T15:30:00Z'),
      lastActivityAt: new Date('2026-03-03T15:30:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess2!.id,
      lastPositionSec: 5700,
      isCompleted: true,
      completedAt: new Date('2026-03-05T16:00:00Z'),
      lastActivityAt: new Date('2026-03-05T16:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess3!.id,
      lastPositionSec: 6000,
      isCompleted: true,
      completedAt: new Date('2026-03-10T16:00:00Z'),
      lastActivityAt: new Date('2026-03-10T16:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess4!.id,
      lastPositionSec: 5850,
      isCompleted: true,
      completedAt: new Date('2026-03-12T16:00:00Z'),
      lastActivityAt: new Date('2026-03-12T16:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess5!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-17T16:00:00Z'),
      lastActivityAt: new Date('2026-03-17T16:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sess6!.id,
      lastPositionSec: 3600,
      isCompleted: false,
      completedAt: null,
      lastActivityAt: new Date('2026-03-21T15:10:00Z'),
    },

    // --- Lê Hoàng Mai: PY-SQL-2026-K04 (6/6 completed) ---
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-05T15:00:00Z'),
      lastActivityAt: new Date('2026-01-05T15:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy2!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-08T15:00:00Z'),
      lastActivityAt: new Date('2026-01-08T15:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy3!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-12T15:00:00Z'),
      lastActivityAt: new Date('2026-01-12T15:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy4!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-15T15:00:00Z'),
      lastActivityAt: new Date('2026-01-15T15:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy5!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-19T15:00:00Z'),
      lastActivityAt: new Date('2026-01-19T15:00:00Z'),
    },
    {
      accountId: stuMaiAcc!.id,
      sessionId: sessPy6!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-22T15:00:00Z'),
      lastActivityAt: new Date('2026-01-22T15:00:00Z'),
    },

    // --- Trần Thu Hà: AI-ENG-2026-K01 (Buổi 1-3 completed, Buổi 4 in progress) ---
    {
      accountId: stuHaAcc!.id,
      sessionId: sess1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-04T09:00:00Z'),
      lastActivityAt: new Date('2026-03-04T09:00:00Z'),
    },
    {
      accountId: stuHaAcc!.id,
      sessionId: sess2!.id,
      lastPositionSec: 5700,
      isCompleted: true,
      completedAt: new Date('2026-03-06T10:00:00Z'),
      lastActivityAt: new Date('2026-03-06T10:00:00Z'),
    },
    {
      accountId: stuHaAcc!.id,
      sessionId: sess3!.id,
      lastPositionSec: 6000,
      isCompleted: true,
      completedAt: new Date('2026-03-11T11:00:00Z'),
      lastActivityAt: new Date('2026-03-11T11:00:00Z'),
    },
    {
      accountId: stuHaAcc!.id,
      sessionId: sess4!.id,
      lastPositionSec: 2100,
      isCompleted: false,
      completedAt: null,
      lastActivityAt: new Date('2026-03-26T14:00:00Z'),
    },

    // --- Phạm Minh Quân: AI-ENG-2026-K01 (6/6 completed before 2026-04-01 final exam) ---
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-04T14:00:00Z'),
      lastActivityAt: new Date('2026-03-04T14:00:00Z'),
    },
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess2!.id,
      lastPositionSec: 5700,
      isCompleted: true,
      completedAt: new Date('2026-03-07T08:30:00Z'),
      lastActivityAt: new Date('2026-03-07T08:30:00Z'),
    },
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess3!.id,
      lastPositionSec: 6000,
      isCompleted: true,
      completedAt: new Date('2026-03-12T09:00:00Z'),
      lastActivityAt: new Date('2026-03-12T09:00:00Z'),
    },
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess4!.id,
      lastPositionSec: 5850,
      isCompleted: true,
      completedAt: new Date('2026-03-15T11:00:00Z'),
      lastActivityAt: new Date('2026-03-15T11:00:00Z'),
    },
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess5!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-20T14:00:00Z'),
      lastActivityAt: new Date('2026-03-20T14:00:00Z'),
    },
    {
      accountId: stuQuanAcc!.id,
      sessionId: sess6!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-26T16:00:00Z'),
      lastActivityAt: new Date('2026-03-26T16:00:00Z'),
    },

    // --- Vũ Đình Khôi: PY-SQL-2026-K04 (6/6 completed) ---
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-05T16:00:00Z'),
      lastActivityAt: new Date('2026-01-05T16:00:00Z'),
    },
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy2!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-08T16:00:00Z'),
      lastActivityAt: new Date('2026-01-08T16:00:00Z'),
    },
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy3!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-12T16:00:00Z'),
      lastActivityAt: new Date('2026-01-12T16:00:00Z'),
    },
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy4!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-15T16:00:00Z'),
      lastActivityAt: new Date('2026-01-15T16:00:00Z'),
    },
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy5!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-19T16:00:00Z'),
      lastActivityAt: new Date('2026-01-19T16:00:00Z'),
    },
    {
      accountId: stuKhoiAcc!.id,
      sessionId: sessPy6!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-01-22T16:00:00Z'),
      lastActivityAt: new Date('2026-01-22T16:00:00Z'),
    },

    // --- Hoàng Gia Bảo: SWE-ARCH-2026-K01 (Buổi 1-3 completed) ---
    {
      accountId: stuBaoAcc!.id,
      sessionId: sessSwe1!.id,
      lastPositionSec: 5400,
      isCompleted: true,
      completedAt: new Date('2026-03-25T15:30:00Z'),
      lastActivityAt: new Date('2026-03-25T15:30:00Z'),
    },
    {
      accountId: stuBaoAcc!.id,
      sessionId: sessSwe2!.id,
      lastPositionSec: 5550,
      isCompleted: true,
      completedAt: new Date('2026-03-29T16:00:00Z'),
      lastActivityAt: new Date('2026-03-29T16:00:00Z'),
    },
    {
      accountId: stuBaoAcc!.id,
      sessionId: sessSwe3!.id,
      lastPositionSec: 5700,
      isCompleted: true,
      completedAt: new Date('2026-04-01T15:40:00Z'),
      lastActivityAt: new Date('2026-04-01T15:40:00Z'),
    },
  ]);

  // =========================================================================
  // 13. SESSION ATTACHMENTS & SUBTITLES (Dummy R2 Keys)
  // =========================================================================
  const insertedAttachments = await db
    .insert(sessionAttachments)
    .values([
      {
        sessionId: sess1!.id,
        fileName: 'Slide_Buoi_01_Kien_Truc_AI_Gateway_AsyncIO.pdf',
        r2ObjectKey: 'materials/ai-k01/s01/Slide_Buoi_01_Kien_Truc_AI_Gateway_AsyncIO.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4250000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess1!.id,
        fileName: 'Lab_01_FastAPI_SSE_Streaming_Notebook.ipynb',
        r2ObjectKey: 'materials/ai-k01/s01/Lab_01_FastAPI_SSE_Streaming_Notebook.ipynb',
        mimeType: 'application/x-ipynb+json',
        fileSizeBytes: 1850000,
        uploadedBy: taNamAcc!.id,
      },
      {
        sessionId: sess2!.id,
        fileName: 'Slide_Buoi_02_Chunking_Strategies_pgvector_HNSW.pdf',
        r2ObjectKey: 'materials/ai-k01/s02/Slide_Buoi_02_Chunking_Strategies_pgvector_HNSW.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 5120000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess2!.id,
        fileName: 'Repo_Mau_Chunker_Markdown_pgvector.zip',
        r2ObjectKey: 'materials/ai-k01/s02/Repo_Mau_Chunker_Markdown_pgvector.zip',
        mimeType: 'application/zip',
        fileSizeBytes: 3400000,
        uploadedBy: taNamAcc!.id,
      },
      {
        sessionId: sess3!.id,
        fileName: 'Slide_Buoi_03_Hybrid_Search_BM25_RRF_Reranker.pdf',
        r2ObjectKey: 'materials/ai-k01/s03/Slide_Buoi_03_Hybrid_Search_BM25_RRF_Reranker.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 6300000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess3!.id,
        fileName: 'Lab_03_Reciprocal_Rank_Fusion_SQL_Notebook.ipynb',
        r2ObjectKey: 'materials/ai-k01/s03/Lab_03_Reciprocal_Rank_Fusion_SQL_Notebook.ipynb',
        mimeType: 'application/x-ipynb+json',
        fileSizeBytes: 2450000,
        uploadedBy: taNamAcc!.id,
      },
      {
        sessionId: sess4!.id,
        fileName: 'Slide_Buoi_04_Function_Calling_Pydantic_ReAct_Agent.pdf',
        r2ObjectKey: 'materials/ai-k01/s04/Slide_Buoi_04_Function_Calling_Pydantic_ReAct_Agent.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 5800000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess4!.id,
        fileName: 'Repo_Starter_Multi_Tool_Order_Agent.zip',
        r2ObjectKey: 'materials/ai-k01/s04/Repo_Starter_Multi_Tool_Order_Agent.zip',
        mimeType: 'application/zip',
        fileSizeBytes: 4100000,
        uploadedBy: taNamAcc!.id,
      },
      {
        sessionId: sess5!.id,
        fileName: 'Slide_Buoi_05_LLMOps_Ragas_Evaluation_Guardrails.pdf',
        r2ObjectKey: 'materials/ai-k01/s05/Slide_Buoi_05_LLMOps_Ragas_Evaluation_Guardrails.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4950000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess5!.id,
        fileName: 'Lab_05_Ragas_Test_Suite_Semantic_Cache.ipynb',
        r2ObjectKey: 'materials/ai-k01/s05/Lab_05_Ragas_Test_Suite_Semantic_Cache.ipynb',
        mimeType: 'application/x-ipynb+json',
        fileSizeBytes: 2200000,
        uploadedBy: taNamAcc!.id,
      },
      {
        sessionId: sess6!.id,
        fileName: 'Slide_Buoi_06_Checklist_Nghiem_Thu_Do_An_AI_Production.pdf',
        r2ObjectKey: 'materials/ai-k01/s06/Slide_Buoi_06_Checklist_Nghiem_Thu_Do_An_AI_Production.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3600000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sessPy1!.id,
        fileName: 'Slide_Py01_Python_Data_Structures_Type_Hints.pdf',
        r2ObjectKey: 'materials/py-k04/s01/Slide_Py01_Python_Data_Structures_Type_Hints.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3500000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessPy4!.id,
        fileName: 'Slide_Py04_PostgreSQL_Schema_Indexing.pdf',
        r2ObjectKey: 'materials/py-k04/s04/Slide_Py04_PostgreSQL_Schema_Indexing.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4100000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessPy5!.id,
        fileName: 'Slide_Py05_PostgreSQL_CTE_Window_Functions.pdf',
        r2ObjectKey: 'materials/py-k04/s05/Slide_Py05_PostgreSQL_CTE_Window_Functions.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4400000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessSwe1!.id,
        fileName: 'Slide_SWE01_Clean_Layered_Architecture_Zod.pdf',
        r2ObjectKey: 'materials/swe-k01/s01/Slide_SWE01_Clean_Layered_Architecture_Zod.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3900000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessSwe2!.id,
        fileName: 'Slide_SWE02_PostgreSQL_EXPLAIN_ANALYZE_Indexing.pdf',
        r2ObjectKey: 'materials/swe-k01/s02/Slide_SWE02_PostgreSQL_EXPLAIN_ANALYZE_Indexing.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4500000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessSwe3!.id,
        fileName: 'Slide_SWE03_ACID_Locking_Idempotent_Webhook.pdf',
        r2ObjectKey: 'materials/swe-k01/s03/Slide_SWE03_ACID_Locking_Idempotent_Webhook.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4700000,
        uploadedBy: instHaAcc!.id,
      },
      {
        sessionId: sessSwe4!.id,
        fileName: 'Slide_SWE04_Redis_Caching_BullMQ_PreClass.pdf',
        r2ObjectKey: 'materials/swe-k01/s04/Slide_SWE04_Redis_Caching_BullMQ_PreClass.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3750000,
        uploadedBy: instHaAcc!.id,
      },
    ])
    .returning();

  const [attS1Slide, , attS2Slide, , attS3Slide, , attS4Slide, , attS5Slide, , attS6Slide] =
    insertedAttachments;

  // Subtitles strictly for REPLAY_READY sessions
  await db.insert(sessionSubtitles).values([
    { sessionId: sess1!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sess2!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sess3!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s03/vi.vtt', isAutoGenerated: true },
    { sessionId: sess4!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s04/vi.vtt', isAutoGenerated: true },
    { sessionId: sess5!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s05/vi.vtt', isAutoGenerated: true },
    { sessionId: sess6!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s06/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy1!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy2!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy3!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s03/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy4!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s04/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy5!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s05/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy6!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k04/s06/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe1!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe2!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe3!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s03/vi.vtt', isAutoGenerated: true },
  ]);

  // =========================================================================
  // 14. COURSE REVIEWS & CERTIFICATES
  // =========================================================================
  await db.insert(courseReviews).values([
    {
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      accountId: stuAnAcc!.id,
      rating: 5,
      comment:
        'Kiến thức về Hybrid Search (pgvector + BM25 RRF) và cách tổ chức FastAPI bất đồng bộ thực sự sát với bài toán thực tế tại doanh nghiệp. Nhờ đồ án trong khóa học mà mình đã tự tin bảo vệ thành công vòng phỏng vấn kỹ thuật.',
      isPublic: true,
      createdAt: new Date('2026-04-03T12:15:00Z'),
    },
    {
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      accountId: stuMaiAcc!.id,
      rating: 5,
      comment:
        'TS. Lê Minh Khoa và trợ giảng Hoàng Nam giải thích rất kỹ từng dòng truy vấn SQL kết hợp vector. Phần đánh giá chất lượng RAG bằng Ragas giúp mình biết cách đo lường thay vì chỉ đoán mò bằng mắt thường.',
      isPublic: true,
      createdAt: new Date('2026-04-02T18:20:00Z'),
    },
    {
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      accountId: stuHaAcc!.id,
      rating: 5,
      comment:
        'Hệ thống học tập có tích hợp Trợ giảng AI trích dẫn đúng từng giây trên video bài giảng và trang slide nên lúc ôn tập lại các công thức RRF cực kỳ nhanh.',
      isPublic: true,
      createdAt: new Date('2026-03-29T09:45:00Z'),
    },
    {
      courseId: coursePython!.id,
      cohortId: cohortPyK04!.id,
      accountId: stuMaiAcc!.id,
      rating: 5,
      comment:
        'Khóa nền tảng Python & SQL của cô Thu Hà rất bài bản, đặc biệt là phần Window Functions và tối ưu chỉ mục PostgreSQL giúp mình tăng tốc độ xử lý báo cáo lên gấp nhiều lần.',
      isPublic: true,
      createdAt: new Date('2026-02-26T10:00:00Z'),
    },
    {
      courseId: coursePython!.id,
      cohortId: cohortPyK04!.id,
      accountId: stuKhoiAcc!.id,
      rating: 5,
      comment:
        'Bài tập thực hành sát thực tế, code review chi tiết từng phần Type Hints và Pytest. Rất đáng giá cho bất kỳ ai muốn bước vào mảng Data/AI.',
      isPublic: true,
      createdAt: new Date('2026-02-27T14:15:00Z'),
    },
    {
      courseId: courseSwe!.id,
      cohortId: cohortSweK01!.id,
      accountId: stuBaoAcc!.id,
      rating: 5,
      comment:
        'Hai buổi đầu về Clean Layered Architecture và tối ưu EXPLAIN ANALYZE rất sắc bén, giải thích cực rõ về giao dịch ACID và chống cộng tiền kép khi xử lý Webhook ngân hàng.',
      isPublic: true,
      createdAt: new Date('2026-03-30T20:00:00Z'),
    },
  ]);

  await db.insert(certificates).values([
    {
      enrollmentId: enrAnAi!.id,
      accountId: stuAnAcc!.id,
      certificateCode: 'CERT-3T-2026-8891',
      hmacSignature: 'hmac-sha256-3t-academy-verified-signature-8891-an-2026',
      issuedAt: new Date('2026-04-03T12:00:00Z'),
    },
    {
      enrollmentId: enrMaiPy!.id,
      accountId: stuMaiAcc!.id,
      certificateCode: 'CERT-3T-2026-8892',
      hmacSignature: 'hmac-sha256-3t-academy-verified-signature-8892-mai-2026',
      issuedAt: new Date('2026-02-26T09:00:00Z'),
    },
    {
      enrollmentId: enrKhoiPy!.id,
      accountId: stuKhoiAcc!.id,
      certificateCode: 'CERT-3T-2026-8893',
      hmacSignature: 'hmac-sha256-3t-academy-verified-signature-8893-khoi-2026',
      issuedAt: new Date('2026-02-26T09:30:00Z'),
    },
  ]);

  // =========================================================================
  // 15. ASSESSMENTS & ASSESSMENT ITEMS (All Session Quizzes + 3 Final Exams)
  // =========================================================================
  const [
    quizSess1,
    quizSess2,
    quizSess3,
    quizSess4,
    quizSess5,
    quizSess6,
    finalExamAiK01,
    quizPy1,
    quizPy2,
    quizPy3,
    quizPy4,
    quizPy5,
    quizPy6,
    finalExamPyK04,
    quizSwe1,
    quizSwe2,
    quizSwe3,
    quizSwe4,
    quizSwe5,
    quizSwe6,
    finalExamSweK01,
  ] = await db
    .insert(assessments)
    .values([
      // --- AI-ENG-2026-K01 ---
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess1!.id,
        title: 'Trắc nghiệm Buổi 1: Kiến trúc AI Gateway, FastAPI & Python AsyncIO',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-08T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess2!.id,
        title: 'Trắc nghiệm Buổi 2: Chiến lược Chunking & Chỉ mục HNSW trên pgvector',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-10T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess3!.id,
        title: 'Trắc nghiệm Buổi 3: Thuật toán Hybrid Search (BM25 + Dense) & RRF',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-15T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess4!.id,
        title: 'Trắc nghiệm Buổi 4: Function Calling, Pydantic Schema & ReAct Agent',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-17T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess5!.id,
        title: 'Trắc nghiệm Buổi 5: Đánh giá Hệ thống RAG với Ragas & Semantic Cache',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-22T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: sess6!.id,
        title: 'Trắc nghiệm Buổi 6: Tổng duyệt Kiến trúc Production AI & Bảo mật Hệ thống',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 15,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-24T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: null,
        title: 'Kỳ thi Sát hạch Tốt nghiệp: Kỹ sư AI Thực chiến (25 Câu Trắc nghiệm · Giám sát AI)',
        purpose: 'FINAL_EXAM',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 45,
        maxAttempts: 3,
        passScorePct: 70,
        proctoringConfig: { enabled: true, maxViolations: 3, snapshotIntervalSec: 30 },
        dueAt: new Date('2026-04-14T16:59:59Z'),
      },

      // --- PY-SQL-2026-K04 ---
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy1!.id,
        title: 'Trắc nghiệm Python Buổi 1: Cấu trúc Dữ liệu & Type Hints',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-10T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy2!.id,
        title: 'Trắc nghiệm Python Buổi 2: OOP, Pydantic & Kiểm thử Pytest',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-13T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy3!.id,
        title: 'Trắc nghiệm Python Buổi 3: AsyncIO & HTTP Connection Pool',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-17T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy4!.id,
        title: 'Trắc nghiệm Python Buổi 4: Thiết kế Quan hệ & Chỉ mục B-Tree',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-20T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy5!.id,
        title: 'Trắc nghiệm Python Buổi 5: CTE, Window Functions & JSONB',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-24T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: sessPy6!.id,
        title: 'Trắc nghiệm Python Buổi 6: Keyset Pagination & Tích hợp Hệ thống',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-01-27T16:59:59Z'),
      },
      {
        cohortId: cohortPyK04!.id,
        sessionId: null,
        title: 'Kỳ thi Tốt nghiệp: Lập trình Python & SQL Phân tích Thực chiến',
        purpose: 'FINAL_EXAM',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 30,
        maxAttempts: 3,
        passScorePct: 70,
        proctoringConfig: { enabled: true, maxViolations: 3 },
        dueAt: new Date('2026-02-25T16:59:59Z'),
      },

      // --- SWE-ARCH-2026-K01 ---
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe1!.id,
        title: 'Trắc nghiệm Backend Buổi 1: Clean Layered Architecture & Zod',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-03-30T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe2!.id,
        title: 'Trắc nghiệm Backend Buổi 2: EXPLAIN ANALYZE & Tối ưu PostgreSQL',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-04-03T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe3!.id,
        title: 'Trắc nghiệm Backend Buổi 3: Giao dịch ACID & Idempotent Webhook',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-04-06T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe4!.id,
        title: 'Trắc nghiệm Backend Buổi 4: Redis Cache-Aside & Hàng đợi BullMQ',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'DRAFT',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-04-10T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: insertedSessions[16]!.id,
        title: 'Trắc nghiệm Backend Buổi 5: Bảo mật JWT RBAC & Docker Production',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'DRAFT',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-04-13T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: insertedSessions[17]!.id,
        title: 'Trắc nghiệm Backend Buổi 6: Kiểm thử Chịu tải k6 & Kiến trúc Phân tán',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'DRAFT',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-04-17T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: null,
        title: 'Kỳ thi Sát hạch Tốt nghiệp: Kiến trúc Backend Chuyên sâu',
        purpose: 'FINAL_EXAM',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 30,
        maxAttempts: 3,
        passScorePct: 70,
        proctoringConfig: { enabled: true, maxViolations: 3 },
        dueAt: new Date('2026-04-26T16:59:59Z'),
      },
    ])
    .returning();

  const sess1Items = buildSessionQuizItems(
    quizSess1!.id,
    1,
    'AsyncIO & FastAPI Gateway',
    skPython!.id,
    skFastApi!.id,
    [
      {
        prompt:
          'Điều gì xảy ra khi gọi hàm đồng bộ `time.sleep(5)` hoặc `requests.post()` trực tiếp bên trong một endpoint `async def` của FastAPI?',
        options: [
          'FastAPI tự động chuyển hàm đó sang tiến trình GPU riêng biệt',
          'Event Loop chính bị chặn (block), khiến toàn bộ các request đồng thời khác trên cùng worker phải chờ đợi',
          'Trình biên dịch Python báo lỗi cú pháp SyntaxError ngay lúc khởi động',
          'Request đó bị hủy tự động sau 100ms',
        ],
        correctIndex: 1,
        explanationMd:
          'Trong `async def`, các tác vụ đồng bộ chặn I/O sẽ làm đứng toàn bộ Event Loop của worker đó. Cần dùng `asyncio.sleep()` và `httpx.AsyncClient()`.',
      },
      {
        prompt:
          'Khi gọi API của nhà cung cấp LLM gặp lỗi HTTP 429 (Rate Limit Exceeded), chiến lược xử lý nào chuẩn xác nhất trong môi trường Production?',
        options: [
          'Gửi lại request liên tục trong vòng lặp `while True` không có độ trễ',
          'Áp dụng cơ chế Exponential Backoff kèm Jitter ngẫu nhiên và giới hạn số lần thử lại tối đa',
          'Khởi động lại toàn bộ container cơ sở dữ liệu PostgreSQL',
          'Tắt tính năng xác thực JWT của người dùng',
        ],
        correctIndex: 1,
        explanationMd:
          'Exponential Backoff with Jitter giúp phân tán thời điểm thử lại, tránh hiện tượng Thundering Herd tiếp tục đánh sập cổng API.',
      },
      {
        prompt:
          'Cơ chế Server-Sent Events (SSE) trong giao diện chat AI cải thiện chỉ số trải nghiệm người dùng nào rõ rệt nhất?',
        options: [
          'Giảm dung lượng ổ cứng lưu trữ mô hình ngôn ngữ',
          'Giảm thời gian phản hồi token đầu tiên (TTFT - Time To First Token) giúp người dùng đọc được kết quả ngay khi mô hình đang sinh văn bản',
          'Tăng số chiều của vector embedding từ 1024 lên 4096',
          'Thay thế hoàn toàn cơ sở dữ liệu PostgreSQL',
        ],
        correctIndex: 1,
        explanationMd:
          'Streaming qua SSE giúp hiển thị từng cụm từ ngay khi sinh ra, giảm cảm giác chờ đợi từ 10 giây xuống dưới 400ms cho token đầu tiên.',
      },
      {
        prompt:
          'Hàm nào trong thư viện `asyncio` cho phép chạy đồng thời nhiều coroutine (ví dụ gọi song song 3 truy vấn embedding) và thu thập toàn bộ kết quả?',
        options: [
          '`asyncio.gather(*tasks)`',
          '`asyncio.sleep_all(tasks)`',
          '`asyncio.block_forever()`',
          '`threading.lock_all()`',
        ],
        correctIndex: 0,
        explanationMd:
          '`asyncio.gather()` lên lịch thực thi đồng thời các coroutine trên Event Loop và trả về danh sách kết quả theo đúng thứ tự đầu vào.',
      },
      {
        prompt:
          'Tại sao nên khởi tạo một đối tượng `httpx.AsyncClient` dùng chung theo vòng đời ứng dụng (lifespan) thay vì tạo mới trong mỗi request?',
        options: [
          'Để tái sử dụng kết nối TCP/TLS (Connection Pooling), giảm chi phí bắt tay mạng lặp đi lặp lại',
          'Vì Python chỉ cho phép tạo duy nhất 1 biến trong toàn bộ chương trình',
          'Để tự động dịch mã nguồn Python sang ngôn ngữ C++',
          'Để không cần sử dụng khóa API Key khi gọi mô hình',
        ],
        correctIndex: 0,
        explanationMd:
          'Tái sử dụng Connection Pool qua `lifespan` giúp tiết kiệm hàng chục đến hàng trăm mili-giây bắt tay TCP/TLS cho mỗi lượt gọi LLM.',
      },
      {
        prompt:
          'Trong Pydantic v2, phương thức nào được sử dụng để chuyển đổi một đối tượng model sang từ điển (dict) chuẩn bị lưu vào JSONB?',
        options: [
          '`model.model_dump()`',
          '`model.to_sql_table()`',
          '`model.compile_binary()`',
          '`model.delete_fields()`',
        ],
        correctIndex: 0,
        explanationMd:
          'Pydantic v2 chuẩn hóa phương thức `.model_dump()` với tốc độ thực thi nhanh hơn nhờ lõi Rust (`pydantic-core`).',
      },
      {
        prompt:
          'Mục đích chính của việc gắn mã `X-Correlation-ID` vào mỗi request đi từ cổng Node.js sang dịch vụ Python AI là gì?',
        options: [
          'Để truy vết xuyên suốt (Distributed Tracing) toàn bộ nhật ký xử lý của cùng một yêu cầu qua nhiều dịch vụ',
          'Để tăng kích thước gói tin HTTP lên gấp 10 lần',
          'Để mã hóa mật khẩu người dùng thay cho thuật toán bcrypt',
          'Để thay thế khóa chính của bảng tài khoản',
        ],
        correctIndex: 0,
        explanationMd:
          'Correlation ID giúp đội ngũ vận hành lọc chính xác toàn bộ log liên quan đến một giao dịch hoặc một lượt hỏi AI qua nhiều microservice.',
      },
      {
        prompt:
          'Khi thiết lập timeout cho `httpx.AsyncClient` gọi dịch vụ LLM, tại sao nên tách biệt `connect` timeout ngắn (5s) và `read` timeout dài hơn (60s)?',
        options: [
          'Vì quá trình thiết lập kết nối mạng cần phát hiện lỗi nhanh, trong khi quá trình LLM suy luận sinh câu trả lời dài cần nhiều thời gian hơn',
          'Vì giao thức HTTP không cho phép đặt hai giá trị bằng nhau',
          'Để giảm số lượng câu hỏi trong cơ sở dữ liệu',
          'Để tắt cơ chế kiểm tra chứng chỉ SSL',
        ],
        correctIndex: 0,
        explanationMd:
          'Nếu máy chủ đích không phản hồi kết nối TCP trong 5s thì nên báo lỗi ngay, nhưng khi đã kết nối thành công thì cần chờ mô hình hoàn tất sinh token.',
      },
      {
        prompt:
          'Kiểu trả về nào trong FastAPI được sử dụng để truyền phát luồng dữ liệu Server-Sent Events (SSE) từ một hàm async generator?',
        options: [
          '`StreamingResponse(generator(), media_type="text/event-stream")`',
          '`StaticFileResponse("index.html")`',
          '`RedirectResponse("/login")`',
          '`PlainTextResponse("OK")`',
        ],
        correctIndex: 0,
        explanationMd:
          '`StreamingResponse` kết hợp với `media_type="text/event-stream"` giữ kết nối HTTP mở để đẩy từng sự kiện `data: ...\n\n` về trình duyệt.',
      },
      {
        prompt:
          'Để giới hạn tối đa 20 yêu cầu gọi LLM đồng thời trong một tiến trình Python bất đồng bộ nhằm tránh vượt hạn mức tài khoản, công cụ nào phù hợp nhất?',
        options: ['`asyncio.Semaphore(20)`', '`time.sleep(20)`', '`os.exit(20)`', '`math.sqrt(20)`'],
        correctIndex: 0,
        explanationMd:
          '`asyncio.Semaphore(20)` kiểm soát số lượng coroutine được phép đi vào vùng gọi API cùng một thời điểm mà không làm nghẽn Event Loop.',
      },
    ]
  );

  const sess2Items = buildSessionQuizItems(
    quizSess2!.id,
    2,
    'Chunking & pgvector HNSW',
    skSqlVec!.id,
    skRag!.id,
    [
      {
        prompt:
          'Tại sao cần thiết lập độ chồng lấp (`chunk_overlap` khoảng 10%–15%) khi cắt nhỏ tài liệu phục vụ hệ thống RAG?',
        options: [
          'Để bảo toàn ngữ cảnh ở ranh giới giữa hai đoạn liên tiếp, tránh việc một câu hoặc một mệnh đề quan trọng bị cắt đôi làm mất ý nghĩa',
          'Để làm tăng gấp đôi hóa đơn lưu trữ đám mây',
          'Để xóa toàn bộ dấu câu trong văn bản tiếng Việt',
          'Vì PostgreSQL không cho phép lưu các đoạn văn có độ dài khác nhau',
        ],
        correctIndex: 0,
        explanationMd:
          'Overlap giữ lại một phần câu cuối của đoạn trước ở đầu đoạn sau, giúp vector embedding của cả hai đoạn không bị đứt gãy ngữ nghĩa.',
      },
      {
        prompt:
          'Trong PostgreSQL `pgvector`, toán tử nào dùng để tính khoảng cách Cosine (Cosine Distance) khi truy vấn tìm kiếm tương đồng?',
        options: ['`<=>`', '`<->`', '`<#>`', '`===`'],
        correctIndex: 0,
        explanationMd:
          'Trong `pgvector`, `<=>` là Cosine Distance (`vector_cosine_ops`), `<->` là khoảng cách Euclid L2, và `<#>` là tích vô hướng âm.',
      },
      {
        prompt:
          'Ưu điểm lớn nhất của phương pháp băm tài liệu theo cấu trúc tiêu đề Markdown (`MarkdownHeaderTextSplitter`) so với cắt cứng theo số ký tự là gì?',
        options: [
          'Giữ nguyên các mục nội dung cùng chủ đề trong một khối thống nhất và đính kèm đường dẫn tiêu đề cha vào metadata của từng chunk',
          'Loại bỏ hoàn toàn nhu cầu sử dụng mô hình Embedding',
          'Tự động dịch tài liệu tiếng Việt sang tiếng Pháp',
          'Giảm số chiều của vector từ 1024 xuống 2 chiều',
        ],
        correctIndex: 0,
        explanationMd:
          'Chia theo cấu trúc tiêu đề giúp mỗi chunk mang trọn vẹn một khái niệm và biết rõ nó thuộc chương/mục nào của tài liệu gốc.',
      },
      {
        prompt:
          'Khi khởi tạo chỉ mục HNSW trên bảng `knowledge_chunks`, tham số `m` và `ef_construction` có ý nghĩa gì?',
        options: [
          '`m` là số liên kết hai chiều tối đa trên mỗi nút đồ thị, còn `ef_construction` là kích thước danh sách ứng viên động trong lúc xây dựng chỉ mục',
          '`m` là số lượng bảng trong database, còn `ef_construction` là dung lượng ổ cứng tối đa',
          '`m` là mật khẩu quản trị, còn `ef_construction` là cổng kết nối TCP',
          'Cả hai tham số chỉ dùng để trang trí câu lệnh SQL',
        ],
        correctIndex: 0,
        explanationMd:
          'Giá trị `m` và `ef_construction` càng cao thì độ chính xác (Recall) của đồ thị HNSW càng tốt nhưng tốn thêm RAM và thời gian tạo index.',
      },
      {
        prompt:
          'Điều gì xảy ra nếu bạn thay đổi mô hình Embedding từ 1024 chiều sang 1536 chiều nhưng chỉ cập nhật một nửa số dòng trong bảng `knowledge_chunks`?',
        options: [
          'Không gian vector bị lệch hoàn toàn và cột `vector(1024)` sẽ từ chối lưu vector 1536 chiều; cần phải re-index toàn bộ kho tri thức với cùng một mô hình đồng nhất',
          'PostgreSQL tự động cộng thêm 512 số 0 vào các dòng cũ mà vẫn giữ nguyên độ chính xác ngữ nghĩa',
          'Hệ thống tự động chuyển sang tìm kiếm bằng hình ảnh',
          'Không có bất kỳ ảnh hưởng nào đến kết quả truy xuất',
        ],
        correctIndex: 0,
        explanationMd:
          'Các vector từ hai mô hình khác nhau nằm trong hai không gian toán học hoàn toàn khác nhau, không thể tính khoảng cách Cosine chung.',
      },
      {
        prompt:
          'Tại sao trong bảng `knowledge_chunks` của 3T Academy lại lưu thêm các cột `start_sec`, `end_sec` và `page_number`?',
        options: [
          'Để khi Trợ giảng AI trả lời học viên có thể đính kèm trích dẫn chính xác mốc thời gian video và số trang slide giúp học viên bấm vào xem lại ngay',
          'Để tính học phí của từng buổi học',
          'Để thay thế nội dung văn bản của cột `content`',
          'Để khóa tài khoản học viên nếu xem quá 10 trang slide',
        ],
        correctIndex: 0,
        explanationMd:
          'Lưu metadata vị trí nguồn (timestamp video, số trang PDF) là chìa khóa để xây dựng trải nghiệm Grounded Citations minh bạch.',
      },
      {
        prompt:
          'Nếu đặt kích thước `chunk_size` quá lớn (ví dụ 8.000 token cho mỗi chunk), hệ thống RAG sẽ gặp rủi ro gì?',
        options: [
          'Vector biểu diễn bị loãng ngữ nghĩa (chứa quá nhiều chủ đề pha trộn) làm giảm độ chính xác truy xuất và gây tốn kém chi phí token đầu vào cho LLM',
          'PostgreSQL sẽ tự động xóa bảng dữ liệu',
          'Mô hình LLM không thể đọc được chữ tiếng Việt',
          'Tốc độ mạng Internet của người dùng bị giảm xuống 0',
        ],
        correctIndex: 0,
        explanationMd:
          'Một vector duy nhất phải nén quá nhiều ý tưởng khác nhau sẽ mất khả năng phân biệt chi tiết cụ thể khi so khớp với câu hỏi ngắn.',
      },
      {
        prompt:
          'Chỉ mục HNSW (`Hierarchical Navigable Small World`) vượt trội hơn chỉ mục IVFFlat ở điểm nào trong vận hành thực tế?',
        options: [
          'Không yêu cầu bước huấn luyện tâm cụm (training centroids) trước nên có thể tạo chỉ mục ngay cả khi bảng mới có ít dữ liệu và cho đường cong Recall/Latency ổn định hơn',
          'Không sử dụng bất kỳ byte bộ nhớ RAM nào',
          'Chỉ hoạt động trên hệ điều hành Windows XP',
          'Tự động sửa lỗi chính tả trong mã nguồn TypeScript',
        ],
        correctIndex: 0,
        explanationMd:
          'HNSW xây dựng đồ thị phân tầng trực tiếp khi thêm bản ghi mới mà không sợ suy giảm chất lượng phân cụm như IVFFlat.',
      },
      {
        prompt:
          'Khi chuẩn bị văn bản trước khi đưa vào mô hình Embedding, bước tiền xử lý nào sau đây là HỢP LÝ nhất?',
        options: [
          'Chuẩn hóa bảng mã Unicode (NFC), loại bỏ các ký tự điều khiển rác lặp lại do lỗi OCR PDF nhưng giữ nguyên cấu trúc câu và thuật ngữ chuyên môn',
          'Xóa toàn bộ các con số và tên biến lập trình trong tài liệu',
          'Đảo ngược thứ tự tất cả các từ trong câu',
          'Mã hóa văn bản bằng thuật toán băm một chiều SHA-256 trước khi tạo embedding',
        ],
        correctIndex: 0,
        explanationMd:
          'Tiếng Việt từ file PDF rất dễ bị lỗi tổ hợp dấu (NFD vs NFC); chuẩn hóa NFC giúp tokenizer của mô hình nhận diện từ vựng chính xác.',
      },
      {
        prompt:
          'Trong câu lệnh SQL tạo chỉ mục `CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)`, truy vấn `ORDER BY` phải dùng toán tử nào để tận dụng được chỉ mục?',
        options: [
          '`ORDER BY embedding <=> $1 LIMIT k`',
          '`ORDER BY embedding + $1 LIMIT k`',
          '`ORDER BY id DESC`',
          '`ORDER BY length(content)`',
        ],
        correctIndex: 0,
        explanationMd:
          'PostgreSQL planner chỉ kích hoạt HNSW index scan khi toán tử trong `ORDER BY` khớp với operator class lúc tạo index (`<=>` cho `vector_cosine_ops`).',
      },
    ]
  );

  const sess3Items = buildSessionQuizItems(
    quizSess3!.id,
    3,
    'Hybrid Search & RRF',
    skRag!.id,
    skSqlVec!.id,
    [
      {
        prompt:
          'Tại sao tìm kiếm thuần Dense Vector thường thất bại khi người dùng tra cứu các mã định danh chính xác như `"ORD3T260301"`, `"ERR_429_QUOTA"` hoặc tên hàm `"resolveCohort"`?',
        options: [
          'Vì mô hình Embedding nén văn bản thành biểu diễn ngữ nghĩa liên tục nên các chuỗi ký tự định danh hiếm gặp dễ bị tách thành nhiều sub-token rời rạc, mất khả năng khớp chính xác từng ký tự',
          'Vì cơ sở dữ liệu PostgreSQL không lưu được chữ hoa',
          'Vì toán tử Cosine chỉ hoạt động vào ban đêm',
          'Vì Dense Vector chỉ tìm được các từ tiếng Anh',
        ],
        correctIndex: 0,
        explanationMd:
          'Đó chính là lý do phải kết hợp thêm nhánh tìm kiếm từ khóa BM25 / Full-Text Search để bắt chính xác các chuỗi định danh kỹ thuật.',
      },
      {
        prompt:
          'Trong công thức Reciprocal Rank Fusion $RRF(d) = \\sum \\frac{1}{k + rank_i(d)}$, tại sao người ta dùng thứ hạng ($rank$) thay vì cộng trực tiếp điểm số Cosine Similarity với điểm số BM25?',
        options: [
          'Vì điểm Cosine Similarity nằm trong đoạn $[-1, 1]$ còn điểm BM25 không có chặn trên cố định và phụ thuộc độ dài tài liệu; dùng thứ hạng giúp hợp nhất công bằng mà không cần chuẩn hóa phân phối điểm',
          'Vì ngôn ngữ SQL không hỗ trợ phép cộng số thực',
          'Để làm cho câu lệnh truy vấn chạy chậm hơn 10 lần',
          'Vì hằng số $k$ luôn bằng 0',
        ],
        correctIndex: 0,
        explanationMd:
          'RRF dựa trên thứ hạng tương đối của từng bộ truy xuất, giúp chống lại sự lệch thang đo giữa các thuật toán khác bản chất.',
      },
      {
        prompt: 'Vai trò của hằng số làm mượt $k$ (thường chọn $k = 60$) trong công thức RRF là gì?',
        options: [
          'Giảm sự thống trị quá mức của một tài liệu đứng hạng 1 ở một nhánh đơn lẻ và đề cao các tài liệu xuất hiện đồng thời ở nhóm đầu của cả hai nhánh Dense và BM25',
          'Giới hạn số lượng ký tự tối đa của câu trả lời là 60 ký tự',
          'Tự động xóa các tài liệu cũ hơn 60 ngày',
          'Quy định số lượng kết nối tối đa tới PostgreSQL',
        ],
        correctIndex: 0,
        explanationMd:
          'Với $k=60$, chênh lệch giữa hạng 1 ($1/61$) và hạng 2 ($1/62$) trở nên mềm mại hơn, ưu tiên mạnh cho tài liệu đạt điểm tốt ở cả hai phương pháp.',
      },
      {
        prompt:
          'Tại sao mô hình Cross-Encoder Reranker chỉ được áp dụng ở bước tái xếp hạng Top 20–50 ứng viên sau RRF chứ không dùng để quét trực tiếp toàn bộ 1 triệu chunks trong cơ sở dữ liệu?',
        options: [
          'Vì Cross-Encoder phải đưa đồng thời cặp `(câu hỏi, đoạn văn)` qua toàn bộ các tầng Self-Attention nên không thể tính sẵn vector trước, chi phí tính toán rất lớn nếu chạy trên hàng triệu bản ghi',
          'Vì Cross-Encoder không hiểu được ngôn ngữ tự nhiên',
          'Vì PostgreSQL cấm lưu kết quả của Cross-Encoder',
          'Vì Cross-Encoder chỉ nhận đầu vào tối đa 5 ký tự',
        ],
        correctIndex: 0,
        explanationMd:
          'Kiến trúc chuẩn là Two-Stage Retrieval: dùng Bi-Encoder + BM25 (RRF) cực nhanh để lọc ra Top 30, sau đó dùng Cross-Encoder chính xác cao chấm điểm lại Top 30 để lấy Top 5.',
      },
      {
        prompt:
          'Trong PostgreSQL, kiểu dữ liệu và loại chỉ mục nào được dùng để tăng tốc độ tìm kiếm toàn văn (Full-Text Search) cho nhánh từ khóa?',
        options: [
          'Kiểu `tsvector` kết hợp với chỉ mục `GIN` (Generalized Inverted Index)',
          'Kiểu `boolean` kết hợp với chỉ mục `HASH`',
          'Kiểu `timestamp` kết hợp với chỉ mục `BRIN`',
          'Kiểu `bytea` không có chỉ mục',
        ],
        correctIndex: 0,
        explanationMd:
          'Chỉ mục đảo `GIN` trên cột hoặc biểu thức `to_tsvector` cho phép tra cứu danh sách tài liệu chứa từ khóa trong vài mili-giây.',
      },
      {
        prompt:
          'Để đảm bảo an toàn phân quyền dữ liệu trong hệ thống RAG của 3T Academy (ngăn khách vãng lai đọc được nội dung bài giảng nội bộ `ENROLLED_ONLY`), bộ lọc quyền truy cập phải được đặt ở đâu?',
        options: [
          'Đặt trực tiếp trong mệnh đề `WHERE` của câu truy vấn SQL (Pre-filtering) trước khi lấy các đoạn văn đưa vào ngữ cảnh của LLM',
          'Lấy toàn bộ dữ liệu mật đưa vào LLM rồi dặn LLM trong System Prompt là "Đừng tiết lộ cho người dùng"',
          'Chỉ ẩn bằng CSS `display: none` ở phía trình duyệt Frontend',
          'Không cần kiểm tra vì người dùng không biết tên bảng',
        ],
        correctIndex: 0,
        explanationMd:
          'Tuyệt đối không dựa vào Prompt để phân quyền dữ liệu; phải lọc cứng ở tầng cơ sở dữ liệu (`visibility = PUBLIC` hoặc kiểm tra bảng `enrollments`).',
      },
      {
        prompt:
          'Khi câu hỏi của học viên trong cuộc hội thoại nhiều lượt chứa đại từ thay thế (ví dụ: *"Còn tham số ef_construction trong thuật toán đó thì sao?"*), bước nào cần thực hiện trước khi đem đi tìm kiếm Hybrid Search?',
        options: [
          'Dùng bước Query Rewriting (Contextualize Query) kết hợp lịch sử hội thoại để viết lại thành câu hỏi độc lập đầy đủ chủ ngữ và thuật ngữ',
          'Báo lỗi bắt học viên phải đăng xuất và đăng nhập lại',
          'Xóa toàn bộ lịch sử trò chuyện trước đó',
          'Chỉ tìm kiếm duy nhất từ "đó" trong cơ sở dữ liệu',
        ],
        correctIndex: 0,
        explanationMd:
          'Query Rewriting biến câu hỏi phụ thuộc ngữ cảnh thành câu truy vấn độc lập, giúp bộ truy xuất tìm đúng tài liệu.',
      },
      {
        prompt:
          'Nếu một đoạn tài liệu có thứ hạng `rank_dense = 2` ở nhánh Vector và `rank_bm25 = 5` ở nhánh từ khóa, với hằng số $k = 60$, điểm số RRF của đoạn tài liệu này được tính bằng biểu thức nào?',
        options: [
          '`1 / (60 + 2) + 1 / (60 + 5)`',
          '`(2 + 5) / 60`',
          '`60 * 2 + 60 * 5`',
          '`1 / (2 * 5 * 60)`',
        ],
        correctIndex: 0,
        explanationMd:
          'Áp dụng trực tiếp công thức RRF: $\\frac{1}{60 + 2} + \\frac{1}{60 + 5} = \\frac{1}{62} + \\frac{1}{65} \\approx 0.03151$.',
      },
      {
        prompt:
          'Kỹ thuật kết hợp hai nhánh truy vấn `dense_results` và `bm25_results` ngay trong một câu lệnh SQL duy nhất trên PostgreSQL thường được viết bằng cấu trúc nào?',
        options: [
          'Sử dụng hai Common Table Expressions (`WITH dense AS (...), bm25 AS (...)`) sau đó `FULL OUTER JOIN` theo `chunk_id` để cộng điểm RRF',
          'Sử dụng câu lệnh `DROP TABLE` kết hợp `TRUNCATE`',
          'Tạo 100 bảng tạm thời bằng tay cho mỗi người dùng',
          'Không thể thực hiện trong SQL mà bắt buộc phải xuất toàn bộ bảng ra file Excel',
        ],
        correctIndex: 0,
        explanationMd:
          'Sử dụng CTE (`WITH ...`) cùng `FULL OUTER JOIN` và `COALESCE(1.0 / (60 + d.rk), 0) + COALESCE(1.0 / (60 + b.rk), 0)` cho phép tính RRF trọn gói trong 1 round-trip tới DB.',
      },
      {
        prompt:
          'Khi một tài liệu chỉ xuất hiện trong Top 20 của nhánh Dense Vector nhưng KHÔNG xuất hiện trong Top 20 của nhánh BM25, hàm `COALESCE` trong câu truy vấn RRF xử lý phần điểm BM25 của tài liệu đó như thế nào?',
        options: [
          'Gán phần đóng góp của nhánh BM25 bằng `0.0` và giữ nguyên phần điểm `1 / (k + rank_dense)` từ nhánh Vector',
          'Hủy bỏ toàn bộ tài liệu đó không cho xuất hiện trong kết quả',
          'Nhân điểm của nhánh Vector với âm vô cùng',
          'Gây lỗi chia cho 0 làm sập câu lệnh SQL',
        ],
        correctIndex: 0,
        explanationMd:
          '`COALESCE(1.0 / (60 + b.rank), 0.0)` đảm bảo tài liệu chỉ khớp ở 1 nhánh vẫn nhận được điểm từ nhánh đó thay vì bị biến thành `NULL`.',
      },
    ]
  );

  const sess4Items = buildSessionQuizItems(
    quizSess4!.id,
    4,
    'Function Calling & ReAct Agent',
    skTool!.id,
    skLangGraph!.id,
    [
      {
        prompt:
          'Bản chất của cơ chế Function Calling (Tool Calling) trong các mô hình ngôn ngữ lớn hiện đại là gì?',
        options: [
          'Mô hình LLM tự mình mở kết nối trực tiếp từ máy chủ của OpenAI/Google vào cơ sở dữ liệu nội bộ của công ty bạn để chạy lệnh SQL',
          'Mô hình LLM phân tích yêu cầu và sinh ra cấu trúc JSON chứa tên hàm cùng các tham số cần gọi; phần thực thi hàm thực tế do mã nguồn Backend của bạn kiểm soát và chạy',
          'Mô hình LLM tự động biên dịch lại hệ điều hành Linux của máy chủ',
          'Mô hình LLM thay thế hoàn toàn trình duyệt web của người dùng',
        ],
        correctIndex: 1,
        explanationMd:
          'LLM chỉ đóng vai trò quyết định gọi tool nào với đối số JSON gì; ứng dụng Backend mới là nơi kiểm tra quyền hạn, thực thi hàm và gửi kết quả trả về lại cho LLM.',
      },
      {
        prompt:
          'Tại sao việc viết chuỗi mô tả chi tiết trong `Field(..., description="...")` của Pydantic model lại ảnh hưởng trực tiếp đến độ chính xác khi LLM gọi Tool?',
        options: [
          'Vì chuỗi `description` được trích xuất vào JSON Schema gửi trong prompt hệ thống, giúp LLM hiểu rõ ngữ nghĩa, định dạng và ràng buộc của từng tham số',
          'Vì Python dùng `description` để cấp phát bộ nhớ RAM cho biến',
          'Vì nếu không có `description` thì PostgreSQL sẽ xóa bảng dữ liệu',
          'Vì `description` dùng để hiển thị quảng cáo trên giao diện người dùng',
        ],
        correctIndex: 0,
        explanationMd:
          'LLM dựa hoàn toàn vào tên hàm, tên trường và `description` trong JSON Schema để suy luận giá trị tham số hợp lệ.',
      },
      {
        prompt:
          'Trong kiến trúc vòng lặp ReAct (Reasoning + Acting), thứ tự các bước diễn ra như thế nào?',
        options: [
          'Suy luận (Thought) -> Chọn hành động & gọi công cụ (Action/Tool Call) -> Nhận kết quả quan sát từ môi trường (Observation) -> Tiếp tục suy luận hoặc đưa ra câu trả lời cuối cùng',
          'Đưa ra câu trả lời cuối cùng trước -> Xóa câu hỏi của người dùng -> Tắt máy chủ',
          'Gọi đồng thời tất cả các hàm xóa dữ liệu trong hệ thống mà không cần đọc câu hỏi',
          'Chỉ lặp lại câu hỏi của người dùng 10 lần liên tiếp',
        ],
        correctIndex: 0,
        explanationMd:
          'ReAct kết hợp chặt chẽ giữa bước lập luận nội tại (Thought) và bước tương tác với thế giới bên ngoài qua công cụ (Action -> Observation).',
      },
      {
        prompt:
          'Khi LLM sinh ra đối số JSON gọi Tool nhưng bị sai kiểu dữ liệu (bắt được ngoại lệ `pydantic.ValidationError`), cách xử lý tốt nhất trong vòng lặp Agent là gì?',
        options: [
          'Đóng gói thông báo lỗi chi tiết của `ValidationError` thành một bản tin `tool` message gửi trả lại cho LLM trong lượt tiếp theo để mô hình tự hiệu chỉnh đối số và gọi lại',
          'Làm sập ngay lập tức tiến trình máy chủ với mã lỗi HTTP 500',
          'Xoá tài khoản của người dùng đang đặt câu hỏi',
          'Bỏ qua lỗi và truyền giá trị `None` vào tất cả các tham số bắt buộc của hàm SQL',
        ],
        correctIndex: 0,
        explanationMd:
          'Cơ chế Self-Correction cho phép LLM đọc thông báo lỗi của Pydantic để biết trường nào sai định dạng và tự sinh lại lời gọi hàm đúng ở bước kế tiếp.',
      },
      {
        prompt:
          'Để ngăn chặn rủi ro một ReAct Agent rơi vào vòng lặp gọi Tool vô tận gây cạn kiệt ngân sách token, biện pháp kỹ thuật nào là bắt buộc?',
        options: [
          'Thiết lập giới hạn số bước lặp tối đa (`max_iterations`, ví dụ 4–6 bước) kết hợp ngân sách thời gian (`timeout`) và trả về phản hồi an toàn khi chạm ngưỡng',
          'Mua thêm 100 máy chủ vật lý mới mỗi ngày',
          'Cấm người dùng đặt câu hỏi dài quá 3 từ',
          'Xóa toàn bộ các công cụ khỏi hệ thống',
        ],
        correctIndex: 0,
        explanationMd:
          'Luôn phải có điều kiện dừng cứng (`max_iterations`) trong vòng lặp `for step in range(MAX_STEPS):` của bộ điều phối Agent.',
      },
      {
        prompt:
          'Khi xây dựng công cụ `cancel_order(order_code: str)` cho phép AI hỗ trợ khách hàng hủy đơn hàng, thông tin định danh người dùng (`account_id`) nên được lấy từ đâu?',
        options: [
          'Lấy trực tiếp từ phiên xác thực JWT (`req.user.id`) ở tầng Backend và tiêm (inject) vào hàm thực thi, tuyệt đối không để LLM tự điền `account_id` thông qua lời nhắc của người dùng',
          'Để người dùng tự gõ `account_id` của bất kỳ ai vào khung chat cho LLM truyền vào hàm',
          'Lấy ngẫu nhiên một `account_id` trong cơ sở dữ liệu',
          'Không cần kiểm tra chủ sở hữu đơn hàng',
        ],
        correctIndex: 0,
        explanationMd:
          'Nếu để `account_id` trong schema cho LLM tự điền, kẻ tấn công có thể dùng Prompt Injection bảo AI hủy đơn hàng của người dùng khác.',
      },
      {
        prompt:
          'Tính năng `Structured Outputs` (với `strict: true` trên JSON Schema) khắc phục triệt để hạn chế nào của việc nhắc LLM trả về JSON thông qua văn bản thông thường?',
        options: [
          'Đảm bảo 100% đầu ra tuân thủ đúng cấu trúc schema và kiểu dữ liệu đã khai báo nhờ cơ chế giới hạn token hợp lệ (Constrained Decoding) ngay trong quá trình lấy mẫu',
          'Giúp mô hình chạy không cần điện năng',
          'Tự động thiết kế giao diện CSS cho trang web',
          'Thay thế hoàn toàn ngôn ngữ lập trình Python',
        ],
        correctIndex: 0,
        explanationMd:
          'Constrained Decoding sử dụng máy trạng thái hữu hạn (FSM) để triệt tiêu xác suất sinh ra các token vi phạm cú pháp JSON Schema.',
      },
      {
        prompt:
          'Đối với các hành động nhạy cảm có tác động thay đổi dữ liệu quan trọng (ví dụ: hoàn tiền đơn hàng, gửi email hàng loạt), mẫu thiết kế Agent nào nên được áp dụng?',
        options: [
          'Human-in-the-Loop (HITL): Agent chuẩn bị sẵn bản nháp tham số và tạm dừng trạng thái chờ quản trị viên hoặc người dùng bấm xác nhận trước khi thực thi',
          'Cho phép Agent tự ý thực thi ngầm mà không ghi lại bất kỳ nhật ký nào',
          'Xóa cơ sở dữ liệu trước khi thực hiện hành động',
          'Tắt toàn bộ hệ thống xác thực',
        ],
        correctIndex: 0,
        explanationMd:
          'Human-in-the-Loop đảm bảo an toàn nghiệp vụ cho các thao tác ghi/xóa hoặc giao dịch tài chính.',
      },
      {
        prompt:
          'Khi người dùng hỏi một câu chào hỏi xã giao thông thường (*"Chào bạn, chúc một ngày tốt lành!"*), cấu hình `tool_choice="auto"` sẽ dẫn đến hành vi nào?',
        options: [
          'Mô hình tự nhận biết không cần tra cứu công cụ và sinh trực tiếp câu trả lời văn bản cho người dùng',
          'Mô hình bắt buộc phải gọi ngẫu nhiên ít nhất 1 công cụ trong danh sách',
          'Hệ thống trả về lỗi HTTP 400 Bad Request',
          'Hệ thống tự động đăng xuất người dùng',
        ],
        correctIndex: 0,
        explanationMd:
          'Với `tool_choice="auto"`, mô hình có quyền quyết định giữa việc sinh văn bản trực tiếp hoặc phát sinh `tool_calls` tùy theo ngữ cảnh câu hỏi.',
      },
      {
        prompt:
          'Nếu bạn cung cấp đồng thời 80 công cụ (Tools) có mô tả chồng chéo nhau vào cùng một lượt gọi LLM, hiện tượng gì thường xảy ra?',
        options: [
          'Ngữ cảnh đầu vào bị phình to gây tốn token, đồng thời độ chính xác lựa chọn đúng công cụ của mô hình bị suy giảm rõ rệt; nên tách theo nhóm Agent chuyên trách hoặc lọc động công cụ liên quan',
          'Mô hình chạy nhanh hơn gấp 80 lần',
          'Chi phí gọi API giảm về 0 đồng',
          'Cơ sở dữ liệu tự động nâng cấp dung lượng ổ cứng',
        ],
        correctIndex: 0,
        explanationMd:
          'Giới hạn số lượng công cụ ở mức tinh gọn (thường dưới 10–15 tools mỗi Agent) giúp mô hình định tuyến chính xác và tiết kiệm token.',
      },
    ]
  );

  const sess5Items = buildSessionQuizItems(
    quizSess5!.id,
    5,
    'LLMOps, Ragas & Guardrails',
    skEval!.id,
    skRag!.id,
    [
      {
        prompt:
          'Trong bộ khung đánh giá Ragas, chỉ số **Faithfulness** (Độ trung thực) đo lường điều gì?',
        options: [
          'Tỷ lệ các mệnh đề khẳng định trong câu trả lời của AI có thể suy ra trực tiếp từ các đoạn ngữ cảnh (`retrieved_contexts`) đã truy xuất được, nhằm phát hiện hiện tượng ảo giác (hallucination)',
          'Tốc độ gõ phím của học viên khi đặt câu hỏi',
          'Dung lượng bộ nhớ RAM của máy chủ Redis',
          'Số lượng hình ảnh có trong giao diện trang chủ',
        ],
        correctIndex: 0,
        explanationMd:
          'Faithfulness kiểm tra xem AI có tự bịa thêm thông tin nằm ngoài ngữ cảnh được cung cấp hay không.',
      },
      {
        prompt:
          'Nếu kết quả đánh giá Ragas cho thấy **Context Recall** đạt rất thấp (0.35) nhưng **Faithfulness** lại cao (0.95), nguyên nhân gốc rễ nằm ở tầng nào của hệ thống RAG?',
        options: [
          'Tầng Retrieval (Chunking hoặc Hybrid Search) đang bỏ sót các đoạn tài liệu chứa thông tin cần thiết; mô hình LLM trả lời trung thực rằng "không tìm thấy thông tin" nên Faithfulness vẫn cao',
          'Do giao diện Frontend dùng sai phông chữ',
          'Do cổng thanh toán ngân hàng bị bảo trì',
          'Do mật khẩu quản trị viên quá ngắn',
        ],
        correctIndex: 0,
        explanationMd:
          'Context Recall thấp chứng tỏ bộ truy xuất chưa lấy lên được đoạn văn chứa đáp án chuẩn (ground truth).',
      },
      {
        prompt:
          'Cơ chế **Semantic Cache** trên Redis khác với bộ nhớ đệm khớp chuỗi chính xác (`Exact Key-Value Cache`) như thế nào?',
        options: [
          'Semantic Cache so sánh độ tương đồng vector của câu hỏi mới với các câu hỏi đã lưu; nếu độ tương đồng vượt ngưỡng cao (ví dụ `>= 0.94`) thì trả về ngay câu trả lời đã duyệt dù cách diễn đạt từ ngữ có hơi khác nhau',
          'Semantic Cache chỉ lưu được các con số nguyên dương',
          'Semantic Cache tự động xóa toàn bộ dữ liệu sau mỗi 1 mili-giây',
          'Semantic Cache không cần lưu câu trả lời',
        ],
        correctIndex: 0,
        explanationMd:
          'Hai câu hỏi có cùng ý nghĩa ngữ nghĩa có thể tận dụng chung kết quả từ Semantic Cache.',
      },
      {
        prompt:
          'Tấn công **Indirect Prompt Injection** trong hệ thống RAG diễn ra theo kịch bản nào?',
        options: [
          'Kẻ tấn công cài cắm các chỉ dẫn độc hại ẩn bên trong tài liệu bên ngoài (CV tải lên, trang web, PDF); khi hệ thống RAG trích xuất đoạn văn đó đưa vào prompt, mô hình bị đánh lừa thực thi lệnh của kẻ tấn công',
          'Kẻ tấn công rút dây nguồn của máy chủ vật lý',
          'Người dùng quên mật khẩu đăng nhập quá 3 lần',
          'Trình duyệt web cập nhật phiên bản mới',
        ],
        correctIndex: 0,
        explanationMd:
          'Cần tách biệt rõ ranh giới dữ liệu tài liệu bằng thẻ đánh dấu (delimiters) và kiểm soát chặt quyền hạn của các công cụ mà LLM được phép gọi.',
      },
      {
        prompt:
          'Chỉ số **Answer Relevancy** trong Ragas sẽ bị điểm thấp trong trường hợp nào sau đây?',
        options: [
          'Câu trả lời của AI tuy đúng với tài liệu nhưng dài dòng, lạc đề hoặc không giải quyết trực tiếp câu hỏi trọng tâm của người dùng',
          'Câu trả lời ngắn gọn, súc tích và trả lời đúng trọng tâm câu hỏi',
          'Thời gian phản hồi của API nhanh hơn 500ms',
          'Người dùng bấm nút thích câu trả lời',
        ],
        correctIndex: 0,
        explanationMd:
          'Answer Relevancy đánh giá mức độ câu trả lời đi thẳng vào câu hỏi của người dùng thay vì trả lời lan man.',
      },
      {
        prompt:
          'Tại sao cần xây dựng bước lọc thông tin định danh cá nhân (PII Redaction) trước khi gửi văn bản người dùng tới các API LLM bên thứ ba?',
        options: [
          'Để che giấu các dữ liệu nhạy cảm như số CCCD, số thẻ ngân hàng, mật khẩu hoặc số điện thoại cá nhân, đảm bảo tuân thủ quy định bảo mật dữ liệu',
          'Để làm cho câu văn dài gấp 5 lần',
          'Để đổi ngôn ngữ câu hỏi sang tiếng La-tinh',
          'Để tăng hóa đơn thanh toán hàng tháng',
        ],
        correctIndex: 0,
        explanationMd:
          'PII Masking/Redaction là lớp Guardrail đầu vào quan trọng nhằm ngăn rò rỉ dữ liệu nhạy cảm ra khỏi biên giới hệ thống.',
      },
      {
        prompt:
          'Chiến lược **Model Routing (Tiered LLM Gateway)** giúp tối ưu chi phí vận hành tại 3T Academy như thế nào?',
        options: [
          'Định tuyến các tác vụ phân loại ý định đơn giản hoặc tóm tắt ngắn sang mô hình nhỏ chi phí thấp (Flash/Mini), và chỉ dùng mô hình suy luận lớn cho các bài toán chấm điểm tự luận hoặc phỏng vấn chuyên sâu',
          'Chỉ sử dụng mô hình đắt nhất cho mọi yêu cầu kể cả kiểm tra trạng thái sức khỏe máy chủ',
          'Tắt hoàn toàn dịch vụ AI vào các ngày trong tuần',
          'Bắt người dùng tự viết câu trả lời cho chính mình',
        ],
        correctIndex: 0,
        explanationMd:
          'Phân tầng mô hình theo độ phức tạp tác vụ giúp giảm 60%–75% chi phí token mà vẫn giữ nguyên chất lượng ở các luồng nghiệp vụ khó.',
      },
      {
        prompt:
          'Khi thiết lập ngưỡng tương đồng Cosine Similarity cho Semantic Cache, điều gì xảy ra nếu bạn đặt ngưỡng quá thấp (ví dụ `0.65`)?',
        options: [
          'Xảy ra hiện tượng dương tính giả (Cache Poisoning/False Hit): hai câu hỏi khác hẳn nhau về chi tiết kỹ thuật lại nhận chung một câu trả lời cũ sai lệch',
          'Bộ nhớ đệm không bao giờ khớp được câu hỏi nào',
          'Cơ sở dữ liệu Redis tự động khởi động lại',
          'Mô hình Embedding ngừng hoạt động',
        ],
        correctIndex: 0,
        explanationMd:
          'Ngưỡng Semantic Cache phải được đặt rất chặt (thường `0.92` – `0.96`) để tránh trả nhầm câu trả lời của câu hỏi tương tự nhưng khác ý chính.',
      },
      {
        prompt:
          'Mục đích của việc tích hợp bộ kiểm thử Ragas với tập dữ liệu chuẩn (`Golden Dataset` gồm 50–100 cặp câu hỏi và đáp án mẫu) vào quy trình CI/CD là gì?',
        options: [
          'Tự động phát hiện sự suy giảm chất lượng truy xuất hoặc ảo giác (Regression Testing) mỗi khi đội ngũ kỹ sư thay đổi chiến lược chunking, prompt hệ thống hoặc nâng cấp phiên bản mô hình',
          'Để thay thế hoàn toàn việc biên dịch mã nguồn TypeScript',
          'Để xóa toàn bộ dữ liệu học viên sau mỗi lần git push',
          'Để tự động tăng giá học phí của khóa học',
        ],
        correctIndex: 0,
        explanationMd:
          'Evaluation-driven Development giúp mọi thay đổi về prompt hay tham số RAG đều được kiểm chứng bằng con số định lượng trước khi lên Production.',
      },
      {
        prompt:
          'Khi ghi nhận nhật ký quan sát (Observability) cho mỗi lượt gọi LLM, những thông số nào cần được lưu lại để phục vụ kiểm toán chi phí và tối ưu hiệu năng?',
        options: [
          'Tên mô hình (`llm_model`), số lượng `prompt_tokens`, `completion_tokens`, độ trễ (`latency_ms`), trạng thái cache hit/miss và mã truy vết `langfuse_trace_id`',
          'Mật khẩu tài khoản ngân hàng của người dùng',
          'Danh sách toàn bộ các tệp tin trên ổ cứng cá nhân của học viên',
          'Chỉ lưu duy nhất chữ "OK"',
        ],
        correctIndex: 0,
        explanationMd:
          'Theo dõi token usage và latency theo từng route/feature giúp phát hiện ngay các prompt tiêu tốn bất thường.',
      },
    ]
  );

  const sess6Items = buildSessionQuizItems(
    quizSess6!.id,
    6,
    'Tổng duyệt Kiến trúc Production AI',
    skFastApi!.id,
    skEval!.id,
    [
      {
        prompt:
          'Trong kiến trúc tổng thể của nền tảng 3T Academy, tại sao cổng API chính (`apps/api` - Node.js/TypeScript) và dịch vụ AI (`apps/ai-service` - Python/FastAPI) được tách thành hai dịch vụ độc lập?',
        options: [
          'Để tách biệt luồng nghiệp vụ giao dịch/quản lý học vụ (Node.js) với luồng tính toán AI/Vector/OCR nặng về CPU/GPU (Python), giúp mỗi dịch vụ mở rộng quy mô (scale) độc lập và tận dụng hệ sinh thái thư viện mạnh nhất của từng ngôn ngữ',
          'Vì một máy tính không thể cài đặt cùng lúc hai ngôn ngữ lập trình',
          'Để bắt người dùng phải đăng nhập hai lần liên tiếp',
          'Vì PostgreSQL chỉ cho phép kết nối từ các cổng chẵn',
        ],
        correctIndex: 0,
        explanationMd:
          'Kiến trúc Hybrid Modular Monolith + AI Microservice kết hợp sự chặt chẽ của TypeScript ở tầng cổng giao dịch với sức mạnh AI/Data của Python.',
      },
      {
        prompt:
          'Khi dịch vụ Python AI xử lý tác vụ bóc tách file PDF bài giảng dài 200 trang và tạo hàng trăm vector embeddings, tại sao nên đẩy tác vụ này vào hàng đợi worker (Celery/Redis) thay vì xử lý đồng bộ trong HTTP request?',
        options: [
          'Tránh làm treo kết nối HTTP của giảng viên (timeout), cho phép trả về trạng thái `202 Accepted` ngay lập tức và xử lý nền an toàn có cơ chế thử lại khi lỗi',
          'Vì giao thức HTTP chỉ truyền được tối đa 10 byte dữ liệu',
          'Để không cần lưu kết quả vào cơ sở dữ liệu',
          'Vì Celery giúp xóa file PDF nhanh hơn',
        ],
        correctIndex: 0,
        explanationMd:
          'Các tác vụ ingestion nặng kéo dài nhiều giây đến vài phút luôn phải được thực thi bất đồng bộ qua Background Worker.',
      },
      {
        prompt:
          'Trong quy trình phòng thi trực tuyến có giám sát AI (`AI Proctoring`), ảnh chụp định kỳ từ webcam được đối chiếu với ảnh gốc của học viên bằng phương pháp kỹ thuật nào?',
        options: [
          'Trích xuất vector đặc trưng khuôn mặt 512 chiều (`ArcFace / InsightFace`) và tính khoảng cách Cosine với vector khuôn mặt chuẩn đã đăng ký (`face_embedding`)',
          'So sánh tên file ảnh xem có trùng nhau hay không',
          'Đếm số lượng điểm ảnh màu xanh lá cây trong bức ảnh',
          'Gửi ảnh qua bưu điện cho giảng viên chấm bằng tay sau 1 tháng',
        ],
        correctIndex: 0,
        explanationMd:
          'So khớp vector 512 chiều cho phép xác thực danh tính khuôn mặt chính xác và phát hiện ngay các vi phạm như không có mặt, nhiều người trong khung hình hoặc sai khuôn mặt.',
      },
      {
        prompt:
          'Theo quy chế thi sát hạch của 3T Academy, điều gì xảy ra khi hệ thống ghi nhận một học viên vi phạm quy chế giám sát webcam chạm ngưỡng 3 lần trong cùng một lượt làm bài?',
        options: [
          'Hệ thống tự động khóa bài thi, chuyển trạng thái tính toàn vẹn sang `FLAGGED` với điểm 0 và gửi cảnh báo tới hội đồng giảng viên để hậu kiểm ảnh bằng chứng',
          'Hệ thống tự động cộng thêm 20 điểm thưởng cho học viên',
          'Hệ thống cấp ngay chứng chỉ tốt nghiệp loại Xuất sắc',
          'Hệ thống xóa toàn bộ khóa học khỏi trang chủ',
        ],
        correctIndex: 0,
        explanationMd:
          'Quy tắc 3-Strike Auto-Suspension bảo vệ tính minh bạch của chứng chỉ đồng thời lưu lại bằng chứng snapshot để giảng viên có thể xét duyệt minh oan nếu cảnh báo nhầm.',
      },
      {
        prompt:
          'Khi học viên vượt qua kỳ thi sát hạch cuối khóa (`FINAL_EXAM` đạt từ 70% trở lên), những quyền lợi tự động nào được hệ thống kích hoạt trong cùng một giao dịch?',
        options: [
          'Cập nhật trạng thái vượt qua kỳ thi cuối khóa, cấp chứng chỉ số có mã xác thực định danh (`CERT-3T-...`) và cộng thưởng +4 lượt phỏng vấn thử AI (`interview_credits`) vào hồ sơ học viên',
          'Tự động trừ hết số dư ngân hàng của học viên',
          'Khóa quyền truy cập vào tất cả các buổi học đã mua',
          'Đổi vai trò của học viên thành Quản trị viên hệ thống',
        ],
        correctIndex: 0,
        explanationMd:
          'Hoàn thành kỳ thi tốt nghiệp mở khóa trọn bộ chứng chỉ xác thực công khai và +4 lượt luyện phỏng vấn giọng nói với AI.',
      },
      {
        prompt:
          'Tại sao chứng chỉ tốt nghiệp của 3T Academy (`certificates.hmac_signature`) lại lưu kèm chữ ký số HMAC-SHA256?',
        options: [
          'Để chống giả mạo chứng chỉ và cho phép nhà tuyển dụng xác thực tính toàn vẹn của mã chứng chỉ công khai',
          'Vì PostgreSQL không hỗ trợ câu lệnh JOIN giữa quá 2 bảng',
          'Để làm cho dung lượng bảng chứng chỉ lớn hơn 100GB',
          'Để không ai có thể tra cứu được mã chứng chỉ',
        ],
        correctIndex: 0,
        explanationMd:
          'Chữ ký HMAC-SHA256 bảo toàn tính xác thực và chống làm giả mã chứng chỉ.',
      },
      {
        prompt:
          'Khi triển khai dịch vụ bằng Docker Compose lên môi trường Production, việc cấu hình `healthcheck` cho container PostgreSQL và Redis mang lại lợi ích gì?',
        options: [
          'Đảm bảo các dịch vụ phụ thuộc (`api`, `ai-service`) chỉ khởi chạy sau khi cơ sở dữ liệu đã thực sự sẵn sàng nhận kết nối (`service_healthy`), tránh lỗi sập ứng dụng lúc mới khởi động',
          'Giúp tăng dung lượng ổ cứng vật lý của máy chủ lên gấp đôi',
          'Tự động viết thêm các trang giao diện React mới',
          'Thay thế hoàn toàn tường lửa mạng',
        ],
        correctIndex: 0,
        explanationMd:
          '`depends_on: condition: service_healthy` ngăn chặn tình trạng race condition khi container ứng dụng khởi động nhanh hơn tiến trình nạp dữ liệu của Postgres.',
      },
      {
        prompt:
          'Trong luồng luyện phỏng vấn thử AI 2 giai đoạn của 3T Academy, tại sao giai đoạn 1 (Sàng lọc CV & JD - `POST /interviews/screen-cv`) được miễn phí và chỉ trừ 1 `interview_credit` khi hoàn tất giai đoạn 2 (`POST /interviews/:id/complete`)?',
        options: [
          'Để khuyến khích học viên chủ động rà soát, cải thiện chất lượng CV cho đạt ngưỡng khớp >= 60% trước khi bước vào phòng phỏng vấn giọng nói chuyên sâu, và không làm mất lượt nếu mạng bị gián đoạn giữa chừng',
          'Vì giai đoạn 1 không sử dụng máy chủ',
          'Vì hệ thống không lưu được số nguyên',
          'Để bắt học viên phải tải lên 100 bản CV khác nhau',
        ],
        correctIndex: 0,
        explanationMd:
          'Cơ chế Fair-Play Credit Protection bảo vệ quyền lợi học viên: chỉ trừ lượt khi buổi phỏng vấn 3 vòng hoàn tất và xuất báo cáo đánh giá đầy đủ.',
      },
      {
        prompt:
          'Khi thiết kế API nhận thông báo thanh toán tự động từ cổng SePay VietQR (`POST /webhooks/sepay`), tại sao phải kiểm tra trùng lặp mã giao dịch ngân hàng (`gateway_txn_id`) trước khi kích hoạt khóa học?',
        options: [
          'Đảm bảo tính Idempotency: nếu cổng thanh toán gửi lại webhook lần thứ 2 do mạng trễ, hệ thống chỉ ghi nhận 1 lần duy nhất và không tạo bản ghi ghi danh hoặc biên lai trùng lặp',
          'Để từ chối tất cả các giao dịch chuyển khoản hợp lệ của học viên',
          'Để xóa đơn hàng ngay khi học viên vừa chuyển tiền',
          'Vì ngân hàng chỉ hoạt động 1 giờ mỗi tuần',
        ],
        correctIndex: 0,
        explanationMd:
          'Cổng webhook luôn có cơ chế retry ít nhất 1 lần (At-least-once delivery), vì vậy endpoint nhận webhook bắt buộc phải Idempotent.',
      },
      {
        prompt:
          'Tiêu chí nào sau đây phản ánh đúng nhất một hệ thống RAG đã sẵn sàng đưa vào vận hành thực tế (Production-Ready)?',
        options: [
          'Có kiểm soát phân quyền dữ liệu ở tầng DB, kết hợp tìm kiếm lai Hybrid Search + Reranker, có trích dẫn nguồn minh bạch, bộ kiểm thử tự động Ragas đạt ngưỡng chuẩn và cơ chế giám sát chi phí/độ trễ đầy đủ',
          'Chỉ chạy được trên máy tính cá nhân của một lập trình viên duy nhất thông qua Jupyter Notebook',
          'Trả lời nhanh nhưng tự bịa ra số liệu tài chính và điều khoản hợp đồng không có trong tài liệu',
          'Lưu toàn bộ khóa API Key công khai trong mã nguồn giao diện Frontend',
        ],
        correctIndex: 0,
        explanationMd:
          'Một hệ thống Production AI phải đáp ứng đồng bộ cả 4 trụ cột: Độ chính xác (Accuracy), Bảo mật phân quyền (Security), Hiệu năng (Latency/Cost) và Khả năng quan sát (Observability).',
      },
    ]
  );

  const finalExamAiSources = [
    ...sess1Items.slice(0, 4),
    ...sess2Items.slice(0, 4),
    ...sess3Items.slice(0, 5),
    ...sess4Items.slice(0, 4),
    ...sess5Items.slice(0, 4),
    ...sess6Items.slice(0, 4),
  ];

  const finalExamAiItems = finalExamAiSources.map((item, idx) => ({
    assessmentId: finalExamAiK01!.id,
    skillId: item.skillId,
    itemOrder: idx + 1,
    itemType: 'SINGLE_CHOICE' as const,
    points: '4.00',
    promptConfig: {
      ...item.promptConfig,
      number: idx + 1,
      prompt: `Câu ${idx + 1}/25 (Sát hạch Kỹ sư AI): ${item.promptConfig.prompt.replace(/^Câu \d+ \([^)]+\): /, '')}`,
    },
    gradingConfig: item.gradingConfig,
    explanationMd: item.explanationMd,
    itemEmbedding: makeDeterministicVector(9000 + idx, 1024),
  }));

  const finalExamPyItems = buildSessionQuizItems(
    finalExamPyK04!.id,
    6,
    'Sát hạch Python & SQL',
    skPython!.id,
    skSqlVec!.id,
    [
      {
        prompt:
          'Trong PostgreSQL, mệnh đề `WITH regional_sales AS (...)` được gọi là gì và giúp ích gì cho truy vấn phức tạp?',
        options: [
          'Common Table Expression (CTE), giúp tách nhỏ truy vấn phân tích phức tạp thành các bước logic dễ đọc, dễ bảo trì và tái sử dụng',
          'Một thủ tục xóa toàn bộ bảng dữ liệu',
          'Một kiểu dữ liệu dùng để lưu tệp âm thanh',
          'Lệnh tắt máy chủ cơ sở dữ liệu',
        ],
        correctIndex: 0,
        explanationMd: 'CTE giúp cấu trúc hóa truy vấn SQL nhiều tầng rõ ràng như các hàm con.',
      },
      {
        prompt:
          'Sự khác biệt giữa hàm cửa sổ `RANK()` và `DENSE_RANK()` trong SQL khi có hai bản ghi đồng hạng 1 là gì?',
        options: [
          '`RANK()` sẽ xếp bản ghi tiếp theo ở hạng 3 (nhảy cóc), trong khi `DENSE_RANK()` xếp bản ghi tiếp theo ở hạng 2 (liên tục không nhảy bậc)',
          'Cả hai hàm đều xóa các bản ghi đồng hạng',
          '`RANK()` chỉ dùng cho kiểu chuỗi còn `DENSE_RANK()` chỉ dùng cho kiểu ngày tháng',
          'Không có bất kỳ sự khác biệt nào',
        ],
        correctIndex: 0,
        explanationMd: '`DENSE_RANK()` giữ nguyên chuỗi thứ hạng liên tiếp sau các vị trí đồng hạng.',
      },
      {
        prompt:
          'Hàm cửa sổ nào trong PostgreSQL cho phép lấy giá trị doanh thu của tháng liền trước ngay trên cùng một dòng kết quả mà không cần Self-Join?',
        options: [
          '`LAG(revenue, 1) OVER (ORDER BY month)`',
          '`SUM(revenue)`',
          '`COUNT(*)`',
          '`RANDOM()`',
        ],
        correctIndex: 0,
        explanationMd:
          '`LAG()` truy cập trực tiếp dòng phía trước trong phân vùng cửa sổ với hiệu năng vượt trội so với Self-Join.',
      },
      {
        prompt:
          'Trong Python, từ khóa `yield` bên trong một hàm dùng để tạo ra đối tượng gì và có lợi ích gì khi đọc tệp nhật ký (log file) nặng 20GB?',
        options: [
          'Tạo ra một Generator giúp xử lý từng dòng dữ liệu theo cơ chế Lazy Evaluation mà không nạp toàn bộ 20GB vào bộ nhớ RAM cùng lúc',
          'Tự động xóa tệp 20GB khỏi ổ cứng',
          'Chuyển đổi mã Python sang mã HTML',
          'Tăng dung lượng RAM vật lý của máy tính',
        ],
        correctIndex: 0,
        explanationMd:
          'Generator chỉ giữ trạng thái của phần tử hiện tại trong bộ nhớ, tránh lỗi `MemoryError`.',
      },
      {
        prompt:
          'Khi sử dụng câu lệnh `EXPLAIN ANALYZE SELECT ...` trong PostgreSQL, thông tin nào cho biết truy vấn đã thực sự chạy và đo được thời gian thực thi thật?',
        options: [
          '`ANALYZE` thực sự thực thi câu lệnh và hiển thị `actual time=... rows=...` cùng tổng `Execution Time`',
          'Câu lệnh chỉ kiểm tra chính tả mà không chạm vào dữ liệu',
          'Câu lệnh tự động tạo thêm 10 chỉ mục mới',
          'Câu lệnh gửi email báo cáo cho quản trị viên',
        ],
        correctIndex: 0,
        explanationMd:
          '`EXPLAIN` chỉ ước lượng chi phí qua bộ thống kê, còn `EXPLAIN ANALYZE` chạy thật câu lệnh để đối chiếu ước lượng với thực tế.',
      },
      {
        prompt:
          'Trong Python `asyncio`, tại sao cần dùng `async with pool.acquire() as conn:` khi làm việc với cơ sở dữ liệu?',
        options: [
          'Đảm bảo kết nối luôn được trả về Connection Pool an toàn ngay cả khi có ngoại lệ phát sinh bên trong khối lệnh',
          'Để khóa vĩnh viễn kết nối không cho request khác sử dụng',
          'Để xóa toàn bộ dữ liệu trong bảng sau khi truy vấn xong',
          'Vì Python không có câu lệnh `try...finally`',
        ],
        correctIndex: 0,
        explanationMd:
          'Asynchronous Context Manager (`async with`) tự động giải phóng tài nguyên kết nối trong phương thức `__aexit__`.',
      },
      {
        prompt:
          'Toán tử nào trong PostgreSQL dùng để kiểm tra một cột kiểu `JSONB` có chứa một cặp khóa-giá trị con và tận dụng được chỉ mục GIN?',
        options: ['Toán tử chứa `@>`', 'Toán tử cộng `+`', 'Toán tử chia `/`', 'Toán tử nối chuỗi `||`'],
        correctIndex: 0,
        explanationMd:
          'Toán tử `@>` (containment) trên kiểu `JSONB` được hỗ trợ trực tiếp bởi chỉ mục `GIN`.',
      },
      {
        prompt:
          'Trong kiểm thử tự động với `pytest`, decorator `@pytest.mark.parametrize` giải quyết bài toán gì?',
        options: [
          'Cho phép chạy cùng một hàm kiểm thử qua nhiều bộ dữ liệu đầu vào và kết quả kỳ vọng khác nhau mà không phải viết lặp lại mã nguồn',
          'Tự động triển khai ứng dụng lên máy chủ đám mây',
          'Xóa các bài kiểm thử bị lỗi để báo cáo luôn xanh',
          'Tắt tính năng kiểm tra kiểu dữ liệu',
        ],
        correctIndex: 0,
        explanationMd:
          'Parametrized testing giúp kiểm tra toàn diện các trường hợp biên (edge cases) với mã nguồn ngắn gọn.',
      },
      {
        prompt:
          'Sự khác biệt quan trọng nhất giữa kiểu dữ liệu `JSON` và `JSONB` trong PostgreSQL là gì?',
        options: [
          '`JSONB` lưu trữ dưới dạng nhị phân đã phân tách (decomposed binary format), hỗ trợ đánh chỉ mục GIN và truy xuất trường con nhanh hơn rất nhiều so với `JSON` thuần văn bản',
          '`JSONB` chỉ lưu được tối đa 10 ký tự',
          '`JSON` hỗ trợ chỉ mục GIN còn `JSONB` thì không',
          '`JSONB` không cho phép lưu mảng (array)',
        ],
        correctIndex: 0,
        explanationMd:
          'Trong hầu hết các thiết kế hệ thống trên PostgreSQL, luôn ưu tiên dùng `JSONB` để hỗ trợ đánh chỉ mục và truy vấn hiệu năng cao.',
      },
      {
        prompt:
          'Khi viết truy vấn phân trang trên bảng có 10 triệu bản ghi, tại sao kỹ thuật `Keyset Pagination` (`WHERE id < last_seen_id ORDER BY id DESC LIMIT 20`) lại nhanh hơn rất nhiều so với `OFFSET 5000000 LIMIT 20`?',
        options: [
          'Vì `OFFSET` buộc cơ sở dữ liệu phải quét và đếm bỏ qua 5 triệu dòng đầu tiên, trong khi `Keyset Pagination` nhảy trực tiếp tới vị trí cần lấy thông qua chỉ mục B-Tree',
          'Vì từ khóa `OFFSET` đã bị xóa khỏi chuẩn SQL',
          'Vì `LIMIT 20` trả về 20 triệu dòng',
          'Vì `Keyset Pagination` không cần sử dụng chỉ mục',
        ],
        correctIndex: 0,
        explanationMd:
          'Keyset (Cursor) Pagination giữ độ phức tạp truy vấn ổn định $O(\\log N)$ bất kể người dùng đang lật tới trang thứ bao nhiêu.',
      },
    ]
  );

  // --- PY-SQL-2026-K04 Session Quizzes (4 items each) ---
  const py1Items = buildSessionQuizItems(quizPy1!.id, 1, 'Python Hiện đại & Type Hints', skPython!.id, skPython!.id, [
    {
      prompt: 'Ưu điểm bộ nhớ khi dùng Generator (`yield`) so với `list` thông thường khi duyệt tệp log hàng triệu dòng là gì?',
      options: ['Sinh từng phần tử theo nhu cầu (Lazy Evaluation) nên chỉ tốn bộ nhớ O(1)', 'Tự động lưu toàn bộ dữ liệu lên Redis', 'Biên dịch Python sang Assembly', 'Không thể dùng trong vòng lặp for'],
      correctIndex: 0,
      explanationMd: 'Generator không nạp toàn bộ tập dữ liệu vào RAM cùng lúc.',
    },
    {
      prompt: 'Type Hint `dict[str, int]` trong Python 3.11 biểu thị kiểu dữ liệu nào?',
      options: ['Từ điển có khóa chuỗi và giá trị số nguyên', 'Danh sách các số thực', 'Hàm bất đồng bộ không trả về giá trị', 'Bảng cơ sở dữ liệu PostgreSQL'],
      correctIndex: 0,
      explanationMd: 'Built-in generic `dict[K, V]` giúp kiểm tra kiểu tĩnh với mypy/pyright.',
    },
    {
      prompt: 'Vì sao Dictionary trong Python có độ phức tạp tra cứu khóa trung bình $O(1)$?',
      options: ['Nhờ cấu trúc Bảng băm (Hash Table)', 'Vì luôn sắp xếp mảng theo bảng chữ cái', 'Vì lưu dữ liệu trên ổ đĩa cứng SSD', 'Vì tự động chạy đa luồng'],
      correctIndex: 0,
      explanationMd: 'Python dict sử dụng hàm băm để tính trực tiếp vị trí bucket trong bộ nhớ.',
    },
    {
      prompt: 'Cấu trúc `collections.Counter` dùng để giải quyết bài toán nào nhanh nhất?',
      options: ['Đếm tần suất xuất hiện của các phần tử trong một chuỗi hoặc danh sách', 'Mã hóa mật khẩu bằng Argon2', 'Kết nối tới cổng PostgreSQL', 'Vẽ biểu đồ trên trình duyệt'],
      correctIndex: 0,
      explanationMd: '`Counter` tối ưu cho việc thống kê tần suất và tìm Top-K phần tử phổ biến.',
    },
  ]);

  const py2Items = buildSessionQuizItems(quizPy2!.id, 2, 'OOP, Pydantic & Pytest', skPython!.id, skFastApi!.id, [
    {
      prompt: 'Decorator `@pytest.mark.parametrize` mang lại lợi ích gì trong kiểm thử tự động?',
      options: ['Chạy một hàm kiểm thử với nhiều bộ input/expected output khác nhau mà không lặp mã', 'Bỏ qua toàn bộ các test bị lỗi', 'Tự động đẩy code lên GitHub', 'Xóa bảng trong PostgreSQL'],
      correctIndex: 0,
      explanationMd: 'Parametrize giúp kiểm thử các trường hợp biên gọn gàng và đầy đủ.',
    },
    {
      prompt: 'Khi dùng Pydantic `BaseModel`, điều gì xảy ra nếu dữ liệu đầu vào thiếu một trường bắt buộc?',
      options: ['Ném ngoại lệ `ValidationError` kèm mô tả rõ trường và lỗi kiểu dữ liệu', 'Tự động gán giá trị rỗng im lặng', 'Tắt toàn bộ tiến trình Python', 'Bỏ qua không kiểm tra'],
      correctIndex: 0,
      explanationMd: 'Pydantic xác thực nghiêm ngặt cấu trúc dữ liệu ở ranh giới hệ thống.',
    },
    {
      prompt: 'Phương thức `fixture` trong `pytest` thường dùng để làm gì?',
      options: ['Chuẩn bị tài nguyên dùng chung (ví dụ DB session test, mock client) và dọn dẹp sau khi test xong', 'Tăng tốc độ card đồ họa GPU', 'Tạo mật khẩu người dùng', 'Thay thế hoàn toàn vòng lặp while'],
      correctIndex: 0,
      explanationMd: 'Fixture giúp tái sử dụng setup/teardown nhất quán giữa nhiều test case.',
    },
    {
      prompt: 'Nguyên lý Single Responsibility trong OOP khuyến nghị điều gì?',
      options: ['Mỗi lớp chỉ nên đảm nhận một trách nhiệm nghiệp vụ rõ ràng và tách biệt', 'Nhồi nhét toàn bộ logic API, SQL và UI vào một class duy nhất', 'Cấm sử dụng kế thừa hoặc composition', 'Không bao giờ viết hàm khởi tạo'],
      correctIndex: 0,
      explanationMd: 'Tách biệt trách nhiệm giúp mã nguồn dễ đọc, dễ viết unit test và bảo trì.',
    },
  ]);

  const py3Items = buildSessionQuizItems(quizPy3!.id, 3, 'AsyncIO & Connection Pool', skPython!.id, skFastApi!.id, [
    {
      prompt: 'Lợi ích chính của `async with pool.acquire() as conn:` là gì?',
      options: ['Đảm bảo kết nối DB luôn được trả lại Connection Pool ngay cả khi có exception', 'Khóa bảng dữ liệu vĩnh viễn', 'Chuyển đổi toàn bộ dữ liệu sang XML', 'Chạy tuần tự chậm hơn'],
      correctIndex: 0,
      explanationMd: 'Context manager bất đồng bộ tự động giải phóng tài nguyên an toàn.',
    },
    {
      prompt: 'Khi cần gửi 10 HTTP request độc lập cùng lúc bằng `httpx.AsyncClient`, ta dùng hàm nào?',
      options: ['`await asyncio.gather(*tasks)`', '`time.sleep(10)`', '`requests.get()` trong vòng lặp đồng bộ', '`sys.exit(0)`'],
      correctIndex: 0,
      explanationMd: '`asyncio.gather` chạy song song các tác vụ I/O-bound trên Event Loop.',
    },
    {
      prompt: 'Tại sao I/O-bound workloads (gọi API, truy vấn DB) hưởng lợi lớn từ `asyncio`?',
      options: ['Event Loop tận dụng thời gian chờ mạng để xử lý các coroutine khác thay vì đứng đợi', 'AsyncIO tăng xung nhịp phần cứng CPU lên gấp đôi', 'AsyncIO bỏ qua giao thức TCP', 'AsyncIO không cần RAM'],
      correctIndex: 0,
      explanationMd: 'Chuyển ngữ cảnh hợp tác (cooperative multitasking) tối ưu thông lượng tác vụ I/O.',
    },
    {
      prompt: 'Nếu gặp tác vụ CPU-bound nặng (như nén ảnh lớn) bên trong `async def`, cần xử lý ra sao?',
      options: ['Đẩy sang ProcessPoolExecutor / Worker nền thay vì chạy trực tiếp trên Event Loop', 'Dùng `time.sleep(0)`', 'Tắt kiểm tra TLS', 'Lưu vào localStorage trình duyệt'],
      correctIndex: 0,
      explanationMd: 'Tác vụ CPU-bound nặng trên Event Loop sẽ chặn toàn bộ request đồng thời khác.',
    },
  ]);

  const py4Items = buildSessionQuizItems(quizPy4!.id, 4, 'SQL Quan hệ & Chỉ mục B-Tree', skSqlVec!.id, skPython!.id, [
    {
      prompt: 'Lệnh `EXPLAIN ANALYZE` khác gì so với `EXPLAIN` thông thường trên PostgreSQL?',
      options: ['`EXPLAIN ANALYZE` thực sự thực thi truy vấn để đo thời gian và số dòng thực tế', '`EXPLAIN ANALYZE` tự động xóa chỉ mục cũ', '`EXPLAIN` luôn chạy lâu hơn', 'Không có sự khác biệt'],
      correctIndex: 0,
      explanationMd: 'So sánh ước lượng của planner với `actual time` và `rows` thực tế.',
    },
    {
      prompt: 'Khi tạo Composite B-Tree Index trên `(cohort_id, status)`, điều kiện lọc nào tận dụng chỉ mục tốt nhất?',
      options: ['`WHERE cohort_id = 1 AND status = \'ACTIVE\'` (khớp tiền tố cột đầu)', '`WHERE status LIKE \'%TIVE\'`', '`ORDER BY random()`', '`WHERE notes IS NOT NULL`'],
      correctIndex: 0,
      explanationMd: 'B-Tree composite index tuân theo quy tắc tiền tố ngoài cùng bên trái (leftmost prefix).',
    },
    {
      prompt: 'Ràng buộc `FOREIGN KEY` đảm bảo tính chất nào của cơ sở dữ liệu quan hệ?',
      options: ['Tính toàn vẹn tham chiếu (Referential Integrity) giữa bảng con và bảng cha', 'Mã hóa dữ liệu dạng vector', 'Tăng kích thước file ảnh', 'Tự động sao lưu sang Amazon S3'],
      correctIndex: 0,
      explanationMd: 'Không cho phép tồn tại bản ghi con trỏ tới khóa chính không tồn tại.',
    },
    {
      prompt: 'Khi bảng đã đạt chuẩn 3NF, lợi ích chính là gì?',
      options: ['Giảm trùng lặp dữ liệu và tránh dị thường khi cập nhật (update anomaly)', 'Không cần dùng câu lệnh JOIN nữa', 'Tăng tốc độ gõ phím', 'Loại bỏ khóa chính'],
      correctIndex: 0,
      explanationMd: 'Chuẩn hóa 3NF loại bỏ phụ thuộc bắc cầu giữa các thuộc tính không khóa.',
    },
  ]);

  const py5Items = buildSessionQuizItems(quizPy5!.id, 5, 'CTE, Window Functions & JSONB', skSqlVec!.id, skSqlVec!.id, [
    {
      prompt: 'Hàm cửa sổ `DENSE_RANK()` khác `RANK()` ở điểm nào khi có giá trị đồng hạng?',
      options: ['`DENSE_RANK()` không nhảy bậc (1, 1, 2) còn `RANK()` nhảy bậc (1, 1, 3)', '`DENSE_RANK()` chỉ chạy trên bảng tạm', '`RANK()` luôn trả về chuỗi văn bản', 'Cả hai giống hệt nhau'],
      correctIndex: 0,
      explanationMd: 'Dùng `DENSE_RANK()` khi cần thứ hạng liên tục không có khoảng trống.',
    },
    {
      prompt: 'Để lấy giá trị doanh thu tháng trước trên cùng một dòng mà không dùng Self-Join, ta dùng hàm nào?',
      options: ['`LAG(revenue, 1) OVER (ORDER BY month)`', '`COUNT(*) OVER ()`', '`COALESCE(revenue, 0)`', '`MAX(revenue)`'],
      correctIndex: 0,
      explanationMd: '`LAG()` truy cập trực tiếp dòng liền trước trong phân vùng cửa sổ.',
    },
    {
      prompt: 'Kiểu `JSONB` với chỉ mục `GIN` dùng toán tử nào để kiểm tra chứa cặp khóa-giá trị con?',
      options: ['`@>`', '`LIKE`', '`+`', '`%`'],
      correctIndex: 0,
      explanationMd: 'Toán tử `@>` khai thác trực tiếp chỉ mục GIN trên cột `JSONB`.',
    },
    {
      prompt: 'Common Table Expression (`WITH cte AS (...)`) mang lại lợi ích gì?',
      options: ['Chia nhỏ logic truy vấn phức tạp thành từng bước dễ đọc và bảo trì', 'Xóa dữ liệu cũ tự động', 'Tắt toàn bộ transaction', 'Thay thế kiểu số nguyên'],
      correctIndex: 0,
      explanationMd: 'CTE giúp tổ chức truy vấn phân tích nhiều bước rõ ràng.',
    },
  ]);

  const py6Items = buildSessionQuizItems(quizPy6!.id, 6, 'Keyset Pagination & Tích hợp', skSqlVec!.id, skPython!.id, [
    {
      prompt: 'Vì sao Keyset Pagination (`WHERE id < cursor ORDER BY id DESC LIMIT 20`) nhanh hơn `OFFSET 1000000`?',
      options: ['Nhảy trực tiếp qua chỉ mục B-Tree mà không phải quét bỏ 1 triệu dòng đầu', 'Vì `OFFSET` không hỗ trợ câu lệnh SELECT', 'Vì Keyset bỏ qua điều kiện WHERE', 'Vì nó không dùng mạng'],
      correctIndex: 0,
      explanationMd: 'Độ phức tạp của Keyset Pagination giữ ổn định $O(\\log N)$ ở mọi trang sâu.',
    },
    {
      prompt: 'Tại sao nên dùng Parameterized Queries (`$1, $2`) thay vì nối chuỗi f-string khi gọi SQL từ Python?',
      options: ['Ngăn chặn triệt để lỗ hổng SQL Injection và tận dụng query plan cache', 'Để câu lệnh SQL dài hơn', 'Để không cần đặt tên bảng', 'Để tắt log hệ thống'],
      correctIndex: 0,
      explanationMd: 'Tham số hóa tách biệt mã lệnh SQL và dữ liệu người dùng nhập vào.',
    },
    {
      prompt: 'Trong một giao dịch chuyển tiền gồm 2 bước trừ và cộng số dư, đặc tính ACID đảm bảo điều gì?',
      options: ['Hoặc cả 2 bước cùng thành công, hoặc cùng rollback khi có lỗi (Atomicity)', 'Luôn bỏ qua bước kiểm tra số dư', 'Chỉ lưu bước thứ nhất', 'Tự động xóa tài khoản'],
      correctIndex: 0,
      explanationMd: 'Tính nguyên tử đảm bảo không bao giờ xảy ra trạng thái dở dang mất cân đối.',
    },
    {
      prompt: 'Lệnh nào trong PostgreSQL giúp cập nhật thống kê phân phối dữ liệu cho Query Planner?',
      options: ['`ANALYZE table_name;`', '`DROP INDEX;`', '`TRUNCATE;`', '`SLEEP 5;`'],
      correctIndex: 0,
      explanationMd: '`ANALYZE` giúp trình tối ưu ước lượng chính xác số dòng và chọn đúng index.',
    },
  ]);

  // --- SWE-ARCH-2026-K01 Quizzes (4 items each) ---
  const swe1Items = buildSessionQuizItems(quizSwe1!.id, 1, 'Clean Layered Architecture & Zod', skNode!.id, skSysDesign!.id, [
    {
      prompt: 'Trong kiến trúc phân tầng `Routes -> Services -> Repositories`, tầng nào chịu trách nhiệm validate DTO đầu vào bằng Zod?',
      options: ['Tầng Middleware / Route Boundary trước khi truyền vào Service', 'Tầng Database Driver', 'Tầng Docker Container', 'Tầng Trình duyệt CSS'],
      correctIndex: 0,
      explanationMd: 'Validate ở ranh giới HTTP giúp Service luôn nhận được dữ liệu đúng kiểu và an toàn.',
    },
    {
      prompt: 'Tại sao nên tránh viết câu lệnh SQL trực tiếp bên trong React Component hoặc Route Handler phình to?',
      options: ['Để tách biệt nghiệp vụ và truy cập dữ liệu, giúp tái sử dụng logic và dễ kiểm thử đơn vị', 'Vì Express không hỗ trợ gọi hàm bất đồng bộ', 'Vì TypeScript cấm gọi hàm trong Route', 'Để làm ứng dụng chậm hơn'],
      correctIndex: 0,
      explanationMd: 'Phân tách rõ ranh giới tầng giúp bảo trì và kiểm thử độc lập từng thành phần.',
    },
    {
      prompt: 'Middleware gắn `X-Correlation-ID` vào mọi request nhằm phục vụ mục đích gì?',
      options: ['Truy vết xuyên suốt nhật ký của cùng một yêu cầu qua API, Redis và AI Service', 'Tăng giá trị học phí', 'Mã hóa token JWT', 'Nén tệp hình ảnh'],
      correctIndex: 0,
      explanationMd: 'Correlation ID là xương sống của khả năng quan sát (Observability) trong hệ thống phân tán.',
    },
    {
      prompt: 'Lớp lỗi tùy chỉnh `AppError(statusCode, code, message)` kết hợp Error Handler tập trung giúp gì?',
      options: ['Chuẩn hóa cấu trúc JSON lỗi trả về Client và tránh rò rỉ stack trace nội bộ ở Production', 'Tắt toàn bộ thông báo lỗi thành HTTP 200', 'Xóa dữ liệu khi gặp lỗi 404', 'Bỏ qua xác thực JWT'],
      correctIndex: 0,
      explanationMd: 'Error Handler tập trung đảm bảo hợp đồng API đồng nhất cho Frontend.',
    },
  ]);

  const swe2Items = buildSessionQuizItems(quizSwe2!.id, 2, 'EXPLAIN ANALYZE & Tối ưu PostgreSQL', skSqlVec!.id, skNode!.id, [
    {
      prompt: 'Lỗi `N+1 Query` trong ORM thường xảy ra khi nào và cách khắc phục chuẩn là gì?',
      options: ['Khi lặp qua N bản ghi cha và gọi 1 truy vấn con cho mỗi bản ghi; khắc phục bằng JOIN hoặc `inArray` batching', 'Khi bảng có quá 1 cột khóa chính', 'Khi sử dụng Connection Pool', 'Khi bật HTTPS'],
      correctIndex: 0,
      explanationMd: 'Gom truy vấn bằng `inArray` hoặc `LEFT JOIN` giảm từ N+1 round-trip xuống còn 1-2 truy vấn.',
    },
    {
      prompt: 'Partial Index (`CREATE INDEX ... ON orders(account_id) WHERE status = \'PENDING\'`) mang lại ưu điểm gì?',
      options: ['Giảm đáng kể kích thước chỉ mục và tăng tốc truy vấn trên tập bản ghi trạng thái nóng', 'Tự động xóa các đơn hàng đã thanh toán', 'Không cần lưu trong bộ nhớ', 'Thay thế khóa chính'],
      correctIndex: 0,
      explanationMd: 'Partial Index chỉ đánh chỉ mục những dòng thỏa điều kiện WHERE thường xuyên truy vấn.',
    },
    {
      prompt: 'Khi xem kế hoạch thực thi `EXPLAIN ANALYZE`, dấu hiệu nào cảnh báo truy vấn bảng lớn đang thiếu chỉ mục?',
      options: ['Xuất hiện `Seq Scan` với chi phí và số dòng `rows removed by filter` rất lớn', 'Xuất hiện `Index Only Scan` dưới 1ms', 'Xuất hiện `Bitmap Index Scan` rất nhanh', 'Có từ khóa `Hash` nhỏ'],
      correctIndex: 0,
      explanationMd: '`Seq Scan` quét toàn bộ bảng khi lọc điều kiện chọn lọc cao là dấu hiệu cần bổ sung index.',
    },
    {
      prompt: 'Drizzle ORM `eq()` và parameterized query bảo vệ hệ thống khỏi rủi ro bảo mật nào?',
      options: ['SQL Injection', 'Cross-Site Scripting trên CSS', 'Hết dung lượng pin laptop', 'Mất kết nối Wi-Fi'],
      correctIndex: 0,
      explanationMd: 'Mọi giá trị biến đều được bind tách biệt khỏi cú pháp câu lệnh SQL.',
    },
  ]);

  const swe3Items = buildSessionQuizItems(quizSwe3!.id, 3, 'ACID & Idempotent Webhook', skSysDesign!.id, skSqlVec!.id, [
    {
      prompt: 'Để đảm bảo Webhook SePay không kích hoạt ghi danh 2 lần khi nhận thông báo trùng lặp, cột nào cần ràng buộc `UNIQUE`?',
      options: ['`gateway_txn_id` (mã giao dịch duy nhất từ phía ngân hàng/cổng thanh toán)', '`amount_vnd`', '`created_at`', '`status`'],
      correctIndex: 0,
      explanationMd: 'UNIQUE constraint trên `gateway_txn_id` chặn trùng lặp ở tầng cơ sở dữ liệu kể cả khi có race condition.',
    },
    {
      prompt: 'Mệnh đề `SELECT ... FOR UPDATE` trong transaction PostgreSQL có tác dụng gì?',
      options: ['Khóa bi quan (Pessimistic Lock) các dòng được chọn tới khi transaction COMMIT/ROLLBACK để tránh cập nhật đè', 'Xóa bảng ngay lập tức', 'Tắt cơ chế kiểm tra khóa ngoại', 'Tăng gấp đôi số lượng bản ghi'],
      correctIndex: 0,
      explanationMd: 'Pessimistic Lock đảm bảo hai request đồng thời không thể cùng xử lý một đơn hàng ở trạng thái PENDING.',
    },
    {
      prompt: 'Tại sao bảng `payment_transactions` nên thiết kế theo mô hình chỉ ghi thêm (append-only / immutable ledger)?',
      options: ['Để lưu giữ trọn vẹn dấu vết kiểm toán (audit trail) đối soát mọi giao dịch hợp lệ lẫn sai lệch', 'Để tiết kiệm không cần dùng khóa chính', 'Để cho phép người dùng tự sửa số tiền', 'Để xóa lịch sử sau 5 phút'],
      correctIndex: 0,
      explanationMd: 'Nhật ký giao dịch bất biến giúp dễ dàng truy vết và đối soát tài chính.',
    },
    {
      prompt: 'Khi nhận Webhook có số tiền chuyển khoản nhỏ hơn số tiền đơn hàng (`AMOUNT_MISMATCH`), hệ thống nên xử lý thế nào?',
      options: ['Ghi nhận transaction `AMOUNT_MISMATCH`, giữ đơn hàng ở trạng thái chờ và gửi cảnh báo cho Admin đối soát', 'Tự động cấp chứng chỉ cho học viên', 'Xóa đơn hàng ngay lập tức', 'Trả về HTTP 500 để ngân hàng gọi lại vô hạn'],
      correctIndex: 0,
      explanationMd: 'Trả về HTTP 200/202 đã ghi nhận log đối soát nhưng không kích hoạt `enrollments` sai quy chuẩn.',
    },
  ]);

  const swe4Items = buildSessionQuizItems(quizSwe4!.id, 4, 'Redis Cache-Aside & BullMQ', skSysDesign!.id, skDocker!.id, [
    {
      prompt: 'Trong mẫu Cache-Aside, luồng đọc dữ liệu diễn ra theo thứ tự nào?',
      options: ['Kiểm tra Redis trước -> Nếu Cache Miss thì đọc PostgreSQL -> Ghi vào Redis kèm TTL -> Trả về Client', 'Ghi vào PostgreSQL rồi xóa Redis ngay', 'Chỉ đọc từ Redis và không bao giờ dùng DB', 'Xóa bộ nhớ mỗi giây'],
      correctIndex: 0,
      explanationMd: 'Cache-Aside giúp ứng dụng chủ động kiểm soát TTL và fallback an toàn khi Redis miss.',
    },
    {
      prompt: 'Hiện tượng Cache Stampede (Thundering Herd) xảy ra khi nào?',
      options: ['Khi một khóa cache nóng hết hạn và hàng nghìn request đồng thời cùng đâm thẳng xuống Database', 'Khi Redis có quá ít khóa', 'Khi người dùng đổi mật khẩu', 'Khi PostgreSQL bật WAL'],
      correctIndex: 0,
      explanationMd: 'Có thể phòng tránh bằng distributed lock (singleflight) hoặc làm mới sớm trước khi hết TTL.',
    },
    {
      prompt: 'Vì sao các tác vụ gửi email hoặc bóc tách PDF nên đẩy sang hàng đợi BullMQ thay vì chạy đồng bộ trong API?',
      options: ['Giữ độ trễ phản hồi API dưới vài chục mili-giây và có cơ chế tự retry có backoff khi tác vụ lỗi', 'Để tiêu tốn nhiều RAM hơn', 'Vì Node.js không có giao thức HTTP', 'Để mất dữ liệu khi restart'],
      correctIndex: 0,
      explanationMd: 'Tách biệt I/O chậm sang Worker giúp API chính luôn ổn định dưới tải cao.',
    },
    {
      prompt: 'Khi cập nhật dữ liệu khóa học ở Admin, làm sao tránh để Redis trả về dữ liệu cũ quá lâu?',
      options: ['Chủ động vô hiệu hóa (invalidate/delete) các key cache liên quan trong luồng cập nhật và luôn đặt TTL hợp lý', 'Khởi động lại máy chủ vật lý', 'Cấm Admin sửa nội dung', 'Đặt TTL bằng vô cực'],
      correctIndex: 0,
      explanationMd: 'Explicit invalidation kết hợp TTL hữu hạn cân bằng giữa hiệu năng và độ tươi mới dữ liệu.',
    },
  ]);

  const swe5Items = buildSessionQuizItems(quizSwe5!.id, 5, 'JWT RBAC & Docker Production', skNode!.id, skDocker!.id, [
    {
      prompt: 'Kiểm soát truy cập dựa trên vai trò (RBAC) ở Backend cần kiểm tra điều gì ngoài chữ ký JWT hợp lệ?',
      options: ['Kiểm tra đúng vai trò (`ADMIN`/`INSTRUCTOR`/`STUDENT`) và quyền sở hữu tài nguyên cụ thể (Ownership/Enrollment)', 'Chỉ kiểm tra tên trình duyệt', 'Chỉ kiểm tra màu nền giao diện', 'Tin tưởng mọi tham số `userId` từ query string'],
      correctIndex: 0,
      explanationMd: 'Xác thực (Authentication) chỉ biết bạn là ai; phân quyền (Authorization) mới quyết định bạn được làm gì.',
    },
    {
      prompt: 'Lợi ích của Multi-stage Dockerfile cho ứng dụng Node.js/TypeScript là gì?',
      options: ['Loại bỏ devDependencies và công cụ biên dịch khỏi image cuối, giảm kích thước image và bề mặt tấn công', 'Làm kích thước Docker image lớn hơn gấp 10 lần', 'Chạy thêm trình duyệt Chrome bên trong API container', 'Không cần file package.json'],
      correctIndex: 0,
      explanationMd: 'Image gọn nhẹ giúp deploy nhanh hơn và an toàn hơn trong Production.',
    },
    {
      prompt: 'Rate Limiting theo IP/Account trên Redis bảo vệ API đăng nhập khỏi hình thức tấn công nào?',
      options: ['Tấn công dò mật khẩu tự động (Brute-force / Credential Stuffing)', 'Lỗi chính tả HTML', 'Tấn công rút dây mạng vật lý', 'Lỗi tràn bộ nhớ CSS'],
      correctIndex: 0,
      explanationMd: 'Giới hạn tần suất gọi API ngăn chặn lạm dụng tài nguyên và dò quét thông tin đăng nhập.',
    },
    {
      prompt: 'Nguyên tắc Least Privilege khi chạy container Docker trong Production là gì?',
      options: ['Chạy tiến trình ứng dụng bằng user không có quyền root (`USER node`)', 'Luôn chạy mọi container với quyền `root` và `--privileged`', 'Lưu mật khẩu database trực tiếp trong Dockerfile', 'Mở toàn bộ port 1-65535 ra Internet'],
      correctIndex: 0,
      explanationMd: 'Giảm thiểu thiệt hại nếu tiến trình ứng dụng bị khai thác lỗ hổng.',
    },
  ]);

  const swe6Items = buildSessionQuizItems(quizSwe6!.id, 6, 'Load Testing & Kiến trúc Phân tán', skDocker!.id, skSysDesign!.id, [
    {
      prompt: 'Trong kiểm thử chịu tải bằng k6, chỉ số `p95 latency = 180ms` có ý nghĩa gì?',
      options: ['95% tổng số request được phục vụ hoàn tất trong thời gian <= 180ms', 'Chỉ có 95 người dùng được truy cập', '5% request bị lỗi HTTP 500', 'Độ trễ trung bình là 180 giây'],
      correctIndex: 0,
      explanationMd: 'Percentile (p95, p99) phản ánh chính xác trải nghiệm ở đuôi phân phối mà giá trị trung bình hay che khuất.',
    },
    {
      prompt: 'Graceful Shutdown khi nhận tín hiệu `SIGTERM` giúp Backend tránh vấn đề gì khi rolling deploy?',
      options: ['Ngừng nhận kết nối mới và chờ các request đang chạy hoàn tất rồi mới đóng DB pool, tránh lỗi rớt giao dịch giữa chừng', 'Xóa sạch toàn bộ dữ liệu trước khi tắt', 'Tăng tốc độ quạt tản nhiệt', 'Tự động đổi tên miền'],
      correctIndex: 0,
      explanationMd: 'Zero-downtime deployment đòi hỏi ứng dụng xử lý dứt điểm các giao dịch in-flight.',
    },
    {
      prompt: 'Circuit Breaker bảo vệ hệ thống thế nào khi một microservice phụ thuộc (ví dụ AI Service) bị treo kéo dài?',
      options: ['Ngắt mạch nhanh (fail-fast) sang cơ chế dự phòng thay vì giữ kết nối chờ timeout gây sập dây chuyền toàn hệ thống', 'Tự động gửi thêm 1000 request mỗi giây tới dịch vụ đang lỗi', 'Xóa cơ sở dữ liệu chính', 'Tắt tường lửa'],
      correctIndex: 0,
      explanationMd: 'Circuit Breaker cô lập lỗi cục bộ để bảo vệ tính sẵn sàng chung.',
    },
    {
      prompt: 'Healthcheck endpoint `/health` trả về trạng thái `200 OK` khi kiểm tra kết nối DB thành công dùng để làm gì?',
      options: ['Cho Load Balancer / Docker / Kubernetes biết container đã sẵn sàng nhận lưu lượng thật', 'Để hiển thị quảng cáo', 'Để reset mật khẩu Admin', 'Để tải video bài giảng'],
      correctIndex: 0,
      explanationMd: 'Readiness/Liveness probe đảm bảo traffic chỉ điều hướng tới các instance khỏe mạnh.',
    },
  ]);

  const finalExamSweItems = buildSessionQuizItems(
    finalExamSweK01!.id,
    6,
    'Sát hạch Kiến trúc Backend',
    skSysDesign!.id,
    skNode!.id,
    [
      {
        skillId: skNode!.id,
        prompt: 'Trong kiến trúc Clean Layered, tầng Service nên giao tiếp với tầng Repository thông qua điều gì để dễ kiểm thử?',
        options: ['Hợp đồng kiểu dữ liệu rõ ràng và tiêm phụ thuộc (Dependency Injection)', 'Biến toàn cục `window`', 'Đọc trực tiếp biến môi trường trong React', 'Lệnh `eval()`'],
        correctIndex: 0,
        explanationMd: 'Tách biệt giao diện tầng giúp thay thế hoặc mock Repository sạch sẽ khi viết test.',
      },
      {
        skillId: skSqlVec!.id,
        prompt: 'Kết hợp `SELECT ... FOR UPDATE` cùng `UNIQUE(gateway_txn_id)` giải quyết vấn đề gì khi 2 webhook đến cùng một mili-giây?',
        options: ['Đảm bảo chỉ có duy nhất 1 giao dịch kích hoạt ghi danh, giao dịch còn lại bị từ chối an toàn (Idempotency)', 'Làm tăng gấp đôi số học viên', 'Gây treo toàn bộ cơ sở dữ liệu vĩnh viễn', 'Bỏ qua bước kiểm tra chữ ký'],
        correctIndex: 0,
        explanationMd: 'Phòng chống Race Condition và Double-Spend ở mức ACID tuyệt đối.',
      },
      {
        skillId: skSysDesign!.id,
        prompt: 'Khi Redis gặp sự cố tạm thời không thể kết nối trong luồng đọc danh mục công khai (Cache-Aside), hệ thống nên hành xử thế nào?',
        options: ['Ghi log cảnh báo và fallback đọc trực tiếp từ PostgreSQL (Graceful Degradation)', 'Sập toàn bộ trang chủ với HTTP 500', 'Xóa toàn bộ bảng courses', 'Đăng xuất tất cả người dùng'],
        correctIndex: 0,
        explanationMd: 'Cache là lớp tăng tốc chứ không phải nguồn chân lý duy nhất của dữ liệu.',
      },
      {
        skillId: skDocker!.id,
        prompt: 'Tại sao cần tách `healthcheck` cho PostgreSQL và Redis với `condition: service_healthy` trong Docker Compose?',
        options: ['Ngăn API container khởi chạy và crash khi DB chưa mở cổng hoặc chưa khởi tạo xong', 'Để làm file docker-compose.yml dài hơn', 'Để tắt log JSON', 'Để bỏ qua biến môi trường'],
        correctIndex: 0,
        explanationMd: 'Kiểm soát đúng thứ tự sẵn sàng dịch vụ khi khởi động cụm container.',
      },
      {
        skillId: skNode!.id,
        prompt: 'Tại sao Refresh Token hoặc Access Token không nên lộ trong URL query string ở các API REST thông thường?',
        options: ['Vì URL dễ bị lưu lại trong lịch sử trình duyệt, log proxy và header Referer', 'Vì URL không chứa được chữ cái Latinh', 'Vì Express cấm đọc `req.query`', 'Vì trình duyệt tự động mã hóa query string thành PDF'],
        correctIndex: 0,
        explanationMd: 'Luôn truyền token qua `Authorization: Bearer` header hoặc cookie `HttpOnly`.',
      },
    ]
  );

  const allInsertedItems = await db
    .insert(assessmentItems)
    .values([
      ...sess1Items,
      ...sess2Items,
      ...sess3Items,
      ...sess4Items,
      ...sess5Items,
      ...sess6Items,
      ...finalExamAiItems,
      ...py1Items,
      ...py2Items,
      ...py3Items,
      ...py4Items,
      ...py5Items,
      ...py6Items,
      ...finalExamPyItems,
      ...swe1Items,
      ...swe2Items,
      ...swe3Items,
      ...swe4Items,
      ...swe5Items,
      ...swe6Items,
      ...finalExamSweItems,
    ])
    .returning();

  const itemsByAssessmentId = new Map<number, typeof allInsertedItems>();
  for (const item of allInsertedItems) {
    const bucket = itemsByAssessmentId.get(item.assessmentId) ?? [];
    bucket.push(item);
    itemsByAssessmentId.set(item.assessmentId, bucket);
  }
  const getItems = (assessmentId: number) => itemsByAssessmentId.get(assessmentId) ?? [];

  const skillNamesById = new Map<number, string>(insertedSkills.map((s) => [s.id, s.name]));

  // =========================================================================
  // 16. ASSESSMENT ATTEMPTS & SUBMISSION ANSWERS (100% Complete!) & PROCTORING
  // =========================================================================
  const attemptSpecs = [
    // --- Nguyễn Văn An: AI-ENG-2026-K01 (6/6 Quizzes + Final Exam) ---
    {
      key: 'attAnS1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess1!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess1!.id),
        wrongIndices: [7],
        startedAt: new Date('2026-03-03T15:05:00Z'),
        submittedAt: new Date('2026-03-03T15:16:00Z'),
        gradingCompletedAt: new Date('2026-03-03T15:16:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnS2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess2!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess2!.id),
        wrongIndices: [3, 8],
        startedAt: new Date('2026-03-05T15:15:00Z'),
        submittedAt: new Date('2026-03-05T15:27:00Z'),
        gradingCompletedAt: new Date('2026-03-05T15:27:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnS3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess3!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess3!.id),
        wrongIndices: [9],
        startedAt: new Date('2026-03-10T15:25:00Z'),
        submittedAt: new Date('2026-03-10T15:36:00Z'),
        gradingCompletedAt: new Date('2026-03-10T15:36:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnS4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess4!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess4!.id),
        wrongIndices: [5],
        startedAt: new Date('2026-03-12T15:20:00Z'),
        submittedAt: new Date('2026-03-12T15:32:00Z'),
        gradingCompletedAt: new Date('2026-03-12T15:32:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnS5',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess5!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess5!.id),
        wrongIndices: [],
        startedAt: new Date('2026-03-17T14:55:00Z'),
        submittedAt: new Date('2026-03-17T15:06:00Z'),
        gradingCompletedAt: new Date('2026-03-17T15:06:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnS6',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess6!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSess6!.id),
        wrongIndices: [8],
        startedAt: new Date('2026-03-19T15:05:00Z'),
        submittedAt: new Date('2026-03-19T15:15:00Z'),
        gradingCompletedAt: new Date('2026-03-19T15:15:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnFinalAi',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: finalExamAiK01!.id,
        accountId: stuAnAcc!.id,
        items: getItems(finalExamAiK01!.id),
        wrongIndices: [11, 21],
        totalRiskScore: '20.00',
        integrityStatus: 'CLEARED_BY_INSTRUCTOR',
        verdictNote: 'Chỉ chuyển tab thoáng qua 1 giây do thông báo hệ điều hành, xác nhận hợp lệ.',
        verdictBy: instKhoaAcc!.id,
        verdictAt: new Date('2026-04-03T11:50:00Z'),
        startedAt: new Date('2026-04-03T11:00:00Z'),
        submittedAt: new Date('2026-04-03T11:38:00Z'),
        gradingCompletedAt: new Date('2026-04-03T11:38:02Z'),
        skillNamesById,
      }),
    },

    // --- Nguyễn Văn An: SWE-ARCH-2026-K01 (Buổi 1-2 passed) ---
    {
      key: 'attAnSwe1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSwe1!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSwe1!.id),
        wrongIndices: [],
        startedAt: new Date('2026-03-25T15:10:00Z'),
        submittedAt: new Date('2026-03-25T15:20:00Z'),
        gradingCompletedAt: new Date('2026-03-25T15:20:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attAnSwe2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSwe2!.id,
        accountId: stuAnAcc!.id,
        items: getItems(quizSwe2!.id),
        wrongIndices: [2],
        startedAt: new Date('2026-03-29T15:20:00Z'),
        submittedAt: new Date('2026-03-29T15:30:00Z'),
        gradingCompletedAt: new Date('2026-03-29T15:30:01Z'),
        skillNamesById,
      }),
    },

    // --- Lê Hoàng Mai: PY-SQL-2026-K04 (6/6 Quizzes + Final Exam) + AI-K01 (Buổi 1-5) ---
    {
      key: 'attMaiPy1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy1!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy1!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-05T15:05:00Z'),
        submittedAt: new Date('2026-01-05T15:13:00Z'),
        gradingCompletedAt: new Date('2026-01-05T15:13:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiPy2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy2!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy2!.id),
        wrongIndices: [3],
        startedAt: new Date('2026-01-08T15:05:00Z'),
        submittedAt: new Date('2026-01-08T15:14:00Z'),
        gradingCompletedAt: new Date('2026-01-08T15:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiPy3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy3!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy3!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-12T15:05:00Z'),
        submittedAt: new Date('2026-01-12T15:13:00Z'),
        gradingCompletedAt: new Date('2026-01-12T15:13:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiPy4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy4!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy4!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-15T15:05:00Z'),
        submittedAt: new Date('2026-01-15T15:13:00Z'),
        gradingCompletedAt: new Date('2026-01-15T15:13:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiPy5',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy5!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy5!.id),
        wrongIndices: [2],
        startedAt: new Date('2026-01-19T15:05:00Z'),
        submittedAt: new Date('2026-01-19T15:14:00Z'),
        gradingCompletedAt: new Date('2026-01-19T15:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiPy6',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy6!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizPy6!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-22T15:05:00Z'),
        submittedAt: new Date('2026-01-22T15:13:00Z'),
        gradingCompletedAt: new Date('2026-01-22T15:13:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiFinalPy',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: finalExamPyK04!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(finalExamPyK04!.id),
        wrongIndices: [4],
        startedAt: new Date('2026-02-25T13:00:00Z'),
        submittedAt: new Date('2026-02-25T13:24:00Z'),
        gradingCompletedAt: new Date('2026-02-25T13:24:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiAi1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess1!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizSess1!.id),
        wrongIndices: [2],
        startedAt: new Date('2026-03-03T16:00:00Z'),
        submittedAt: new Date('2026-03-03T16:12:00Z'),
        gradingCompletedAt: new Date('2026-03-03T16:12:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiAi2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess2!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizSess2!.id),
        wrongIndices: [6],
        startedAt: new Date('2026-03-05T16:15:00Z'),
        submittedAt: new Date('2026-03-05T16:28:00Z'),
        gradingCompletedAt: new Date('2026-03-05T16:28:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiAi3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess3!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizSess3!.id),
        wrongIndices: [1, 4],
        startedAt: new Date('2026-03-10T16:10:00Z'),
        submittedAt: new Date('2026-03-10T16:22:00Z'),
        gradingCompletedAt: new Date('2026-03-10T16:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiAi4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess4!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizSess4!.id),
        wrongIndices: [3, 7],
        startedAt: new Date('2026-03-12T16:10:00Z'),
        submittedAt: new Date('2026-03-12T16:23:00Z'),
        gradingCompletedAt: new Date('2026-03-12T16:23:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attMaiAi5',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess5!.id,
        accountId: stuMaiAcc!.id,
        items: getItems(quizSess5!.id),
        wrongIndices: [0],
        startedAt: new Date('2026-03-17T16:10:00Z'),
        submittedAt: new Date('2026-03-17T16:22:00Z'),
        gradingCompletedAt: new Date('2026-03-17T16:22:01Z'),
        skillNamesById,
      }),
    },

    // --- Trần Thu Hà: AI-ENG-2026-K01 (Buổi 1-3 passed, Buổi 4 failed 60%) ---
    {
      key: 'attHaAi1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess1!.id,
        accountId: stuHaAcc!.id,
        items: getItems(quizSess1!.id),
        wrongIndices: [1, 8],
        startedAt: new Date('2026-03-04T09:10:00Z'),
        submittedAt: new Date('2026-03-04T09:22:00Z'),
        gradingCompletedAt: new Date('2026-03-04T09:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attHaAi2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess2!.id,
        accountId: stuHaAcc!.id,
        items: getItems(quizSess2!.id),
        wrongIndices: [0, 5],
        startedAt: new Date('2026-03-06T10:10:00Z'),
        submittedAt: new Date('2026-03-06T10:22:00Z'),
        gradingCompletedAt: new Date('2026-03-06T10:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attHaAi3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess3!.id,
        accountId: stuHaAcc!.id,
        items: getItems(quizSess3!.id),
        wrongIndices: [4, 9],
        startedAt: new Date('2026-03-11T11:10:00Z'),
        submittedAt: new Date('2026-03-11T11:22:00Z'),
        gradingCompletedAt: new Date('2026-03-11T11:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attHaAi4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess4!.id,
        accountId: stuHaAcc!.id,
        items: getItems(quizSess4!.id),
        wrongIndices: [1, 3, 5, 7],
        startedAt: new Date('2026-03-26T14:20:00Z'),
        submittedAt: new Date('2026-03-26T14:33:00Z'),
        gradingCompletedAt: new Date('2026-03-26T14:33:01Z'),
        skillNamesById,
      }),
    },

    // --- Phạm Minh Quân: AI-ENG-2026-K01 (6/6 Quizzes passed before 2026-04-01 Final Exam FLAGGED) ---
    {
      key: 'attQuanAi1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess1!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess1!.id),
        wrongIndices: [2, 6],
        startedAt: new Date('2026-03-04T14:10:00Z'),
        submittedAt: new Date('2026-03-04T14:22:00Z'),
        gradingCompletedAt: new Date('2026-03-04T14:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanAi2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess2!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess2!.id),
        wrongIndices: [1, 7],
        startedAt: new Date('2026-03-07T08:40:00Z'),
        submittedAt: new Date('2026-03-07T08:52:00Z'),
        gradingCompletedAt: new Date('2026-03-07T08:52:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanAi3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess3!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess3!.id),
        wrongIndices: [3, 8],
        startedAt: new Date('2026-03-12T09:10:00Z'),
        submittedAt: new Date('2026-03-12T09:22:00Z'),
        gradingCompletedAt: new Date('2026-03-12T09:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanAi4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess4!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess4!.id),
        wrongIndices: [0, 5],
        startedAt: new Date('2026-03-15T11:10:00Z'),
        submittedAt: new Date('2026-03-15T11:22:00Z'),
        gradingCompletedAt: new Date('2026-03-15T11:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanAi5',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess5!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess5!.id),
        wrongIndices: [4, 9],
        startedAt: new Date('2026-03-20T14:10:00Z'),
        submittedAt: new Date('2026-03-20T14:22:00Z'),
        gradingCompletedAt: new Date('2026-03-20T14:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanAi6',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSess6!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(quizSess6!.id),
        wrongIndices: [2, 5],
        startedAt: new Date('2026-03-26T16:10:00Z'),
        submittedAt: new Date('2026-03-26T16:22:00Z'),
        gradingCompletedAt: new Date('2026-03-26T16:22:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attQuanSuspended',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: finalExamAiK01!.id,
        accountId: stuQuanAcc!.id,
        items: getItems(finalExamAiK01!.id),
        wrongIndices: [],
        forceZeroScore: true,
        totalRiskScore: '105.00',
        integrityStatus: 'FLAGGED',
        verdictNote:
          'Hệ thống phát hiện 3 lần vi phạm liên tiếp (vắng mặt, nhiều người trong khung hình, sai khuôn mặt).',
        startedAt: new Date('2026-04-01T14:00:00Z'),
        submittedAt: new Date('2026-04-01T14:18:00Z'),
        gradingCompletedAt: new Date('2026-04-01T14:18:01Z'),
        skillNamesById,
      }),
    },

    // --- Vũ Đình Khôi: PY-SQL-2026-K04 (6/6 Quizzes + Final Exam) ---
    {
      key: 'attKhoiPy1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy1!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy1!.id),
        wrongIndices: [1],
        startedAt: new Date('2026-01-05T16:05:00Z'),
        submittedAt: new Date('2026-01-05T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-05T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiPy2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy2!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy2!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-08T16:05:00Z'),
        submittedAt: new Date('2026-01-08T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-08T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiPy3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy3!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy3!.id),
        wrongIndices: [2],
        startedAt: new Date('2026-01-12T16:05:00Z'),
        submittedAt: new Date('2026-01-12T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-12T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiPy4',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy4!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy4!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-15T16:05:00Z'),
        submittedAt: new Date('2026-01-15T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-15T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiPy5',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy5!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy5!.id),
        wrongIndices: [],
        startedAt: new Date('2026-01-19T16:05:00Z'),
        submittedAt: new Date('2026-01-19T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-19T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiPy6',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizPy6!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(quizPy6!.id),
        wrongIndices: [3],
        startedAt: new Date('2026-01-22T16:05:00Z'),
        submittedAt: new Date('2026-01-22T16:14:00Z'),
        gradingCompletedAt: new Date('2026-01-22T16:14:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attKhoiFinalPy',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: finalExamPyK04!.id,
        accountId: stuKhoiAcc!.id,
        items: getItems(finalExamPyK04!.id),
        wrongIndices: [2, 7],
        startedAt: new Date('2026-02-25T14:00:00Z'),
        submittedAt: new Date('2026-02-25T14:26:00Z'),
        gradingCompletedAt: new Date('2026-02-25T14:26:01Z'),
        skillNamesById,
      }),
    },

    // --- Hoàng Gia Bảo: SWE-ARCH-2026-K01 (Buổi 1-3 passed) ---
    {
      key: 'attBaoSwe1',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSwe1!.id,
        accountId: stuBaoAcc!.id,
        items: getItems(quizSwe1!.id),
        wrongIndices: [],
        startedAt: new Date('2026-03-25T15:35:00Z'),
        submittedAt: new Date('2026-03-25T15:45:00Z'),
        gradingCompletedAt: new Date('2026-03-25T15:45:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attBaoSwe2',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSwe2!.id,
        accountId: stuBaoAcc!.id,
        items: getItems(quizSwe2!.id),
        wrongIndices: [1],
        startedAt: new Date('2026-03-29T16:05:00Z'),
        submittedAt: new Date('2026-03-29T16:15:00Z'),
        gradingCompletedAt: new Date('2026-03-29T16:15:01Z'),
        skillNamesById,
      }),
    },
    {
      key: 'attBaoSwe3',
      builder: buildAttemptDraftAndAnswerBuilders({
        assessmentId: quizSwe3!.id,
        accountId: stuBaoAcc!.id,
        items: getItems(quizSwe3!.id),
        wrongIndices: [],
        startedAt: new Date('2026-04-01T15:45:00Z'),
        submittedAt: new Date('2026-04-01T15:55:00Z'),
        gradingCompletedAt: new Date('2026-04-01T15:55:01Z'),
        skillNamesById,
      }),
    },
  ];

  const insertedAttempts = await db
    .insert(assessmentAttempts)
    .values(attemptSpecs.map((spec) => spec.builder.attemptRow))
    .returning();

  const attemptByKey = new Map(attemptSpecs.map((spec, idx) => [spec.key, insertedAttempts[idx]!]));
  const attAnFinalAi = attemptByKey.get('attAnFinalAi')!;
  const attQuanSuspended = attemptByKey.get('attQuanSuspended')!;

  const allSubmissionAnswers = insertedAttempts.flatMap((att, idx) =>
    attemptSpecs[idx]!.builder.buildAnswersForAttemptId(att.id)
  );
  await db.insert(submissionAnswers).values(allSubmissionAnswers);

  const insertedProctoringEvents = await db
    .insert(proctoringEvents)
    .values([
      {
        attemptId: attAnFinalAi.id,
        occurredAt: new Date('2026-04-03T11:14:20Z'),
        videoOffsetSec: 860,
        tier: 'EDGE',
        eventType: 'TAB_HIDDEN',
        confidence: 0.92,
        riskDelta: '20.00',
        snapshotR2Key: 'proctoring/2026/att-an-final-tab-hidden-01.jpg',
        details: {
          cosineDistance: 0.14,
          reviewStatus: 'DISMISSED_FALSE_POSITIVE',
          reviewedBy: instKhoaAcc!.id,
        },
      },
      {
        attemptId: attQuanSuspended.id,
        occurredAt: new Date('2026-04-01T14:05:10Z'),
        videoOffsetSec: 310,
        tier: 'EDGE',
        eventType: 'NO_FACE',
        confidence: 0.96,
        riskDelta: '15.00',
        snapshotR2Key: 'proctoring/2026/att-quan-final-no-face-01.jpg',
        details: {
          reviewStatus: 'CONFIRMED_CHEATING',
          reviewedBy: instKhoaAcc!.id,
        },
      },
      {
        attemptId: attQuanSuspended.id,
        occurredAt: new Date('2026-04-01T14:11:45Z'),
        videoOffsetSec: 705,
        tier: 'SERVER',
        eventType: 'MULTI_FACE',
        confidence: 0.94,
        riskDelta: '40.00',
        snapshotR2Key: 'proctoring/2026/att-quan-final-multi-face-02.jpg',
        details: {
          cosineDistance: 0.48,
          reviewStatus: 'CONFIRMED_CHEATING',
          reviewedBy: instKhoaAcc!.id,
        },
      },
      {
        attemptId: attQuanSuspended.id,
        occurredAt: new Date('2026-04-01T14:17:55Z'),
        videoOffsetSec: 1075,
        tier: 'SERVER',
        eventType: 'FACE_MISMATCH',
        confidence: 0.91,
        riskDelta: '50.00',
        snapshotR2Key: 'proctoring/2026/att-quan-final-mismatch-03.jpg',
        details: {
          cosineDistance: 0.67,
          reviewStatus: 'FLAGGED_PENDING_REVIEW',
        },
      },
    ])
    .returning();

  // =========================================================================
  // 17. DISCUSSION THREADS, POSTS & NOTIFICATIONS
  // =========================================================================
  const [thread1, thread2, thread3, thread4] = await db
    .insert(discussionThreads)
    .values([
      {
        sessionId: sess3!.id,
        authorId: stuAnAcc!.id,
        title: 'Cách chọn hằng số làm mượt k trong công thức Reciprocal Rank Fusion (RRF)?',
        videoTimestampSec: 1420,
        isResolved: true,
        createdAt: new Date('2026-03-10T15:40:00Z'),
      },
      {
        sessionId: sess3!.id,
        authorId: stuMaiAcc!.id,
        title:
          'Làm sao kết hợp bộ lọc quyền truy cập (Pre-filtering RBAC) với chỉ mục HNSW mà không bị giảm Recall?',
        videoTimestampSec: 2680,
        isResolved: true,
        createdAt: new Date('2026-03-11T09:15:00Z'),
      },
      {
        sessionId: sess4!.id,
        authorId: stuHaAcc!.id,
        title: 'Xử lý ngoại lệ ValidationError khi LLM truyền sai kiểu dữ liệu vào Pydantic Tool?',
        videoTimestampSec: 1890,
        isResolved: true,
        createdAt: new Date('2026-03-13T10:20:00Z'),
      },
      {
        sessionId: sess5!.id,
        authorId: stuAnAcc!.id,
        title: 'Ngưỡng Cosine Similarity bao nhiêu là an toàn cho Semantic Cache trên Redis?',
        videoTimestampSec: 2150,
        isResolved: false,
        createdAt: new Date('2026-03-17T15:30:00Z'),
      },
    ])
    .returning();

  await db.insert(discussionPosts).values([
    {
      threadId: thread1!.id,
      authorId: stuAnAcc!.id,
      contentMd:
        'Thầy Khoa và anh Nam cho em hỏi: Trong bài giảng ở phút `23:40`, mình đặt hằng số `k = 60` trong công thức RRF. Nếu kho tài liệu của doanh nghiệp có rất nhiều mã lỗi kỹ thuật ngắn thì mình giảm `k` xuống `20` hay giữ nguyên `60` sẽ tốt hơn ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
      createdAt: new Date('2026-03-10T15:40:00Z'),
    },
    {
      threadId: thread1!.id,
      authorId: null,
      contentMd:
        'Dựa trên nội dung **Buổi 3 (mốc 23:40 · Slide Trang 14)**: Hằng số $k = 60$ là giá trị thực nghiệm chuẩn giúp cân bằng đóng góp giữa nhánh Dense Vector và nhánh BM25. Nếu bạn giảm $k$ xuống nhỏ (ví dụ $k = 10$ hoặc $20$), khoảng cách điểm giữa hạng 1 và hạng 3 sẽ tăng mạnh, làm các kết quả đứng đầu ở một nhánh đơn lẻ dễ lấn át các kết quả xuất hiện đồng thời ở cả hai nhánh.',
      isAiGenerated: true,
      isInstructorVerified: true,
      verifiedBy: instKhoaAcc!.id,
      createdAt: new Date('2026-03-10T15:40:08Z'),
    },
    {
      threadId: thread1!.id,
      authorId: instKhoaAcc!.id,
      contentMd:
        'Câu trả lời của Trợ giảng AI hoàn toàn chính xác nhé An! Trong thực tế, thay vì giảm `k`, nếu bài toán nặng về tra cứu mã lỗi chính xác thì em có thể nhân trọng số điều chỉnh: `0.4 * rrf_dense + 0.6 * rrf_bm25` trước khi đưa Top 30 qua Cross-Encoder Reranker.',
      isAiGenerated: false,
      isInstructorVerified: true,
      verifiedBy: instKhoaAcc!.id,
      createdAt: new Date('2026-03-10T16:05:00Z'),
    },
    {
      threadId: thread2!.id,
      authorId: stuMaiAcc!.id,
      contentMd:
        'Khi em thêm điều kiện `WHERE cohort_id = 1 AND visibility = \'ENROLLED_ONLY\'` vào truy vấn `ORDER BY embedding <=> $1 LIMIT 5`, có trường hợp pgvector quét đồ thị HNSW bị thiếu ứng viên không ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
      createdAt: new Date('2026-03-11T09:15:00Z'),
    },
    {
      threadId: thread2!.id,
      authorId: taNamAcc!.id,
      contentMd:
        'Câu hỏi rất sắc bén Mai ơi! Từ phiên bản `pgvector 0.7+` kết hợp cấu hình `SET hnsw.ef_search = 100`, bộ lập kế hoạch truy vấn xử lý lọc kết hợp rất tốt. Ngoài ra em nên tạo thêm B-Tree index trên `(cohort_id, visibility)` hoặc phân vùng bảng nếu số lượng đợt học lớn.',
      isAiGenerated: false,
      isInstructorVerified: true,
      verifiedBy: taNamAcc!.id,
      createdAt: new Date('2026-03-11T09:42:00Z'),
    },
    {
      threadId: thread3!.id,
      authorId: stuHaAcc!.id,
      contentMd:
        'Em thử truyền ngày tháng dạng `"25/03/2026"` vào công cụ yêu cầu chuẩn ISO `"2026-03-25"` thì Pydantic báo lỗi `ValidationError`. Làm sao để Agent tự sửa lại mà không làm gián đoạn cuộc hội thoại của người dùng ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
      createdAt: new Date('2026-03-13T10:20:00Z'),
    },
    {
      threadId: thread3!.id,
      authorId: null,
      contentMd:
        'Theo **Buổi 4 (mốc 31:30 · Slide Trang 18)**: Bạn hãy bắt ngoại lệ `except ValidationError as exc:` trong hàm điều phối Tool, sau đó trả chuỗi `f"Tool argument validation failed: {exc.errors()}. Please re-format parameters to ISO-8601 and retry."` vào bản tin `role="tool"`. Ở lượt suy luận kế tiếp, LLM sẽ đọc lỗi này và tự chuyển `"25/03/2026"` thành `"2026-03-25"`.',
      isAiGenerated: true,
      isInstructorVerified: true,
      verifiedBy: instKhoaAcc!.id,
      createdAt: new Date('2026-03-13T10:20:06Z'),
    },
    {
      threadId: thread4!.id,
      authorId: stuAnAcc!.id,
      contentMd:
        'Ở Buổi 5 mình dùng Redis làm Semantic Cache cho các câu hỏi thường gặp của học viên. Nếu hai câu hỏi chỉ khác nhau ở tên buổi học (ví dụ *"Tóm tắt Buổi 2"* và *"Tóm tắt Buổi 3"*) thì vector của chúng rất gần nhau (`~0.93`). Làm sao tránh trả nhầm cache của Buổi 2 cho người hỏi Buổi 3 ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
      createdAt: new Date('2026-03-17T15:30:00Z'),
    },
    {
      threadId: thread4!.id,
      authorId: null,
      contentMd:
        'Dựa trên **Buổi 5 (mốc 35:50 · Slide Trang 20)**: Khi lưu Semantic Cache cho Trợ giảng Buổi học (`SESSION_TUTOR`), bạn luôn phải ghép khóa phân vùng ngữ cảnh (`namespace = f"session:{session_id}"`) làm bộ lọc bắt buộc trước khi so khớp độ tương đồng vector `>= 0.94`. Nhờ đó câu hỏi ở Buổi 3 sẽ chỉ tìm trong không gian cache của Buổi 3.',
      isAiGenerated: true,
      isInstructorVerified: false,
      createdAt: new Date('2026-03-17T15:30:05Z'),
    },
  ]);

  await db.insert(notifications).values([
    {
      recipientId: stuAnAcc!.id,
      type: 'CERTIFICATE_ISSUED',
      title: 'Chúc mừng bạn đã nhận Chứng chỉ Kỹ sư AI Thực chiến!',
      body: 'Bạn đã vượt qua kỳ thi sát hạch cuối khóa với số điểm 92/100 (Loại Xuất sắc). Mã chứng chỉ của bạn là CERT-3T-2026-8891 kèm +4 lượt phỏng vấn thử AI miễn phí.',
      metadata: { certificateCode: 'CERT-3T-2026-8891', cohortCode: 'AI-ENG-2026-K01' },
      isRead: false,
      createdAt: new Date('2026-04-03T12:01:00Z'),
    },
    {
      recipientId: stuAnAcc!.id,
      type: 'DISCUSSION_REPLY',
      title: 'TS. Lê Minh Khoa đã xác nhận câu trả lời trong thảo luận của bạn',
      body: 'Câu hỏi "Cách chọn hằng số làm mượt k trong công thức RRF" tại Buổi 3 đã được giảng viên giải đáp chi tiết.',
      metadata: { sessionId: sess3!.id, threadId: thread1!.id },
      isRead: true,
      readAt: new Date('2026-03-10T18:00:00Z'),
      createdAt: new Date('2026-03-10T16:06:00Z'),
    },
    {
      recipientId: stuAnAcc!.id,
      type: 'LIVE_SESSION_REMINDER',
      title: 'Buổi 4 đang diễn ra trực tiếp (LIVE): Redis Cache-Aside & Hàng đợi BullMQ',
      body: 'Phòng học trực tuyến Buổi 4 của lớp SWE-ARCH-2026-K01 đã mở. Hãy tham gia cùng ThS. Nguyễn Thu Hà.',
      metadata: { sessionId: sessSwe4!.id, cohortCode: 'SWE-ARCH-2026-K01' },
      isRead: false,
      createdAt: new Date('2026-04-05T12:25:00Z'),
    },
    {
      recipientId: stuBaoAcc!.id,
      type: 'LIVE_SESSION_REMINDER',
      title: 'Buổi 4 đang diễn ra trực tiếp (LIVE): Redis Cache-Aside & Hàng đợi BullMQ',
      body: 'Phòng học trực tuyến Buổi 4 của lớp SWE-ARCH-2026-K01 đã mở. Hãy tham gia thực hành trực tiếp cùng ThS. Nguyễn Thu Hà.',
      metadata: { sessionId: sessSwe4!.id, cohortCode: 'SWE-ARCH-2026-K01' },
      isRead: false,
      createdAt: new Date('2026-04-05T12:25:00Z'),
    },
    {
      recipientId: stuHaAcc!.id,
      type: 'INSTRUCTOR_REMINDER',
      title: 'Gợi ý ôn tập Trắc nghiệm Buổi 4: Function Calling & ReAct Agent',
      body: 'Chào Thu Hà, trợ giảng Hoàng Nam nhận thấy bạn đạt 60% ở lượt làm bài đầu tiên của Buổi 4. Bạn hãy xem lại Slide Trang 18 về xử lý ValidationError và làm lại để đạt chuẩn >= 70% nhé!',
      metadata: { sessionId: sess4!.id, senderId: taNamAcc!.id },
      isRead: false,
      createdAt: new Date('2026-03-27T09:00:00Z'),
    },
    {
      recipientId: stuQuanAcc!.id,
      type: 'PROCTORING_ALERT',
      title: 'Cảnh báo: Bài thi sát hạch của bạn bị tạm đình chỉ do vi phạm quy chế webcam',
      body: 'Hệ thống giám sát AI ghi nhận 3 lần vi phạm liên tiếp trong lượt thi ngày 01/04/2026. Hội đồng học vụ đang tiến hành hậu kiểm ảnh chụp bằng chứng.',
      metadata: { attemptId: attQuanSuspended.id },
      isRead: false,
      createdAt: new Date('2026-04-01T14:19:00Z'),
    },
    {
      recipientId: instKhoaAcc!.id,
      type: 'PROCTORING_REVIEW_NEEDED',
      title: 'Cần hậu kiểm 1 biên bản vi phạm quy chế thi cuối khóa (AI-ENG-2026-K01)',
      body: 'Học viên Phạm Minh Quân có 1 sự kiện FACE_MISMATCH đang chờ giảng viên xác nhận tại bảng điều khiển Giám sát Thi cử.',
      metadata: { attemptId: attQuanSuspended.id },
      isRead: false,
      createdAt: new Date('2026-04-01T14:20:00Z'),
    },
    {
      recipientId: adminAcc!.id,
      type: 'PAYMENT_RECONCILIATION_ALERT',
      title: 'Phát hiện 2 giao dịch SePay VietQR lệch số tiền / thiếu mã đơn hàng',
      body: 'Có 1 giao dịch lệch số tiền (ORD3T260405 - 6.000.000đ / 6.800.000đ) và 1 giao dịch thiếu mã đơn cần quản trị viên đối soát thủ công.',
      metadata: { orderCode: 'ORD3T260405' },
      isRead: false,
      createdAt: new Date('2026-04-05T10:16:00Z'),
    },
  ]);

  // =========================================================================
  // 18. KNOWLEDGE CHUNKS, STUDENT SKILL STATES, CHAT & MOCK INTERVIEWS
  // =========================================================================
  const insertedKnowledgeChunks = await db
    .insert(knowledgeChunks)
    .values([
      {
        visibility: 'PUBLIC',
        courseId: courseAi!.id,
        cohortId: cohortAiK02!.id,
        sessionId: null,
        attachmentId: null,
        sourceType: 'FAQ',
        chunkIndex: 1,
        contentHash: 'hash-pub-ai-overview-01',
        content:
          'Khóa học "Kỹ sư AI Thực chiến: RAG, Agents & LLMOps" (mã đợt đang mở: AI-ENG-2026-K02, học phí 6.800.000 VNĐ) kéo dài 6 buổi chuyên sâu (tương đương 18 giờ thực hành Live Coding). Lịch học tối Thứ 2 và Thứ 6 (19:30 - 21:30), do TS. Lê Minh Khoa trực tiếp giảng dạy cùng trợ giảng KS. Hoàng Nam.',
        embedding: makeDeterministicVector(201, 1024),
      },
      {
        visibility: 'PUBLIC',
        courseId: courseAi!.id,
        cohortId: cohortAiK02!.id,
        sessionId: null,
        attachmentId: null,
        sourceType: 'FAQ',
        chunkIndex: 2,
        contentHash: 'hash-pub-ai-syllabus-02',
        content:
          'Điều kiện đầu vào của khóa Kỹ sư AI Thực chiến: Học viên cần nắm vững lập trình Python cơ bản và câu lệnh SQL căn bản. Đầu ra khóa học cam kết học viên tự tay xây dựng được hệ thống Hybrid RAG (pgvector HNSW + BM25 Reciprocal Rank Fusion), Function Calling với Pydantic v2, đánh giá chất lượng bằng Ragas và nhận chứng chỉ số xác thực kèm +4 lượt phỏng vấn thử AI.',
        embedding: makeDeterministicVector(202, 1024),
      },
      {
        visibility: 'PUBLIC',
        courseId: courseSwe!.id,
        cohortId: cohortSweK01!.id,
        sessionId: null,
        attachmentId: null,
        sourceType: 'FAQ',
        chunkIndex: 1,
        contentHash: 'hash-pub-swe-overview-01',
        content:
          'Khóa học "Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems" (mã đợt đang mở: SWE-ARCH-2026-K01, học phí 5.900.000 VNĐ) do ThS. Nguyễn Thu Hà giảng dạy vào tối Thứ 4 và Chủ Nhật (19:30 - 21:30). Trọng tâm: Clean Layered Architecture, Drizzle ORM, tối ưu chỉ mục PostgreSQL, xử lý Webhook thanh toán Idempotent và Redis Caching.',
        embedding: makeDeterministicVector(203, 1024),
      },
      {
        visibility: 'PUBLIC',
        courseId: courseData!.id,
        cohortId: cohortDataK01!.id,
        sessionId: null,
        attachmentId: null,
        sourceType: 'FAQ',
        chunkIndex: 1,
        contentHash: 'hash-pub-data-overview-01',
        content:
          'Khóa học "Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse" (mã đợt sắp khai giảng: DATA-PIPE-2026-K01, học phí 7.200.000 VNĐ) dành cho kỹ sư muốn làm chủ xử lý dữ liệu lớn thời gian thực với Apache Spark, Kafka, chuẩn hóa kho dữ liệu với dbt và đồng bộ Vector Store.',
        embedding: makeDeterministicVector(204, 1024),
      },
      {
        visibility: 'PUBLIC',
        courseId: coursePython!.id,
        cohortId: cohortPyK04!.id,
        sessionId: null,
        attachmentId: null,
        sourceType: 'FAQ',
        chunkIndex: 1,
        contentHash: 'hash-pub-py-overview-01',
        content:
          'Khóa học nền tảng "Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI" (học phí 4.200.000 VNĐ) phù hợp cho người mới bắt đầu hoặc lập trình viên trái ngành. Chương trình trang bị Python 3.11, Type Hints, OOP, Pytest, lập trình bất đồng bộ AsyncIO và truy vấn SQL phân tích nâng cao (CTE, Window Functions) trên PostgreSQL.',
        embedding: makeDeterministicVector(205, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess1!.id,
        attachmentId: attS1Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s1-chunk-01',
        startSec: 120,
        endSec: 480,
        pageNumber: 6,
        content:
          'Trong môi trường Production, cổng AI Gateway viết bằng FastAPI bắt buộc phải sử dụng cơ chế bất đồng bộ hoàn toàn với httpx.AsyncClient. Nếu bạn gọi hàm đồng bộ bên trong async def, toàn bộ Event Loop của tiến trình worker sẽ bị nghẽn, làm tăng độ trễ p95 lên hàng chục giây.',
        embedding: makeDeterministicVector(301, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess1!.id,
        attachmentId: attS1Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s1-chunk-02',
        startSec: 960,
        endSec: 1450,
        pageNumber: 14,
        content:
          'Để truyền phát câu trả lời theo thời gian thực về trình duyệt, chúng ta sử dụng StreamingResponse với media_type="text/event-stream". Kỹ thuật Server-Sent Events (SSE) giúp giảm chỉ số Time To First Token (TTFT) xuống dưới 400ms, đồng thời kết hợp Exponential Backoff khi gặp lỗi HTTP 429.',
        embedding: makeDeterministicVector(302, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess2!.id,
        attachmentId: attS2Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s2-chunk-01',
        startSec: 300,
        endSec: 840,
        pageNumber: 9,
        content:
          'Chiến lược băm tài liệu hai tầng kết hợp MarkdownHeaderTextSplitter và RecursiveCharacterTextSplitter với độ chồng lấp chunk_overlap từ 10% đến 15% giúp bảo toàn trọn vẹn ngữ cảnh tiêu đề chương mục và ngăn chặn việc cắt đứt mệnh đề quan trọng ở ranh giới giữa hai đoạn văn.',
        embedding: makeDeterministicVector(303, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess2!.id,
        attachmentId: attS2Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s2-chunk-02',
        startSec: 1620,
        endSec: 2340,
        pageNumber: 18,
        content:
          'Trên PostgreSQL pgvector, chỉ mục HNSW được tạo bằng câu lệnh CREATE INDEX USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64). Toán tử khoảng cách Cosine (<=>) cho phép tìm kiếm láng giềng gần đúng (ANN) chỉ trong vài mili-giây mà không cần bước huấn luyện tâm cụm như IVFFlat.',
        embedding: makeDeterministicVector(304, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess3!.id,
        attachmentId: attS3Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s3-chunk-01',
        startSec: 420,
        endSec: 1120,
        pageNumber: 10,
        content:
          'Tìm kiếm thuần Dense Vector thường gặp điểm mù khi người dùng tra cứu các mã định danh chính xác như mã đơn hàng ORD3T260301, mã lỗi kỹ thuật hoặc tên hàm lập trình. Vì vậy hệ thống RAG thực chiến phải kết hợp thêm nhánh tìm kiếm từ khóa BM25 thông qua kiểu tsvector và chỉ mục đảo GIN trên PostgreSQL.',
        embedding: makeDeterministicVector(305, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess3!.id,
        attachmentId: attS3Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s3-chunk-02',
        startSec: 1420,
        endSec: 2100,
        pageNumber: 14,
        content:
          'Thuật toán Reciprocal Rank Fusion (RRF) hợp nhất bảng xếp hạng từ nhánh Dense Vector và nhánh BM25 theo công thức: RRF_Score(d) = 1 / (k + rank_dense(d)) + 1 / (k + rank_bm25(d)) với hằng số làm mượt k = 60. Sau khi lấy Top 30 ứng viên từ RRF, mô hình Cross-Encoder Reranker sẽ chấm điểm cặp (câu hỏi, đoạn văn) để chọn ra Top 5 chính xác nhất.',
        embedding: makeDeterministicVector(306, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess3!.id,
        attachmentId: attS3Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 3,
        contentHash: 'hash-s3-chunk-03',
        startSec: 2680,
        endSec: 3400,
        pageNumber: 22,
        content:
          'Nguyên tắc bảo mật cốt lõi trong RAG doanh nghiệp là Pre-filtering RBAC: Bộ lọc kiểm soát quyền truy cập (visibility = PUBLIC hoặc kiểm tra quyền ghi danh khóa học) bắt buộc phải thực thi trực tiếp trong mệnh đề WHERE của câu lệnh SQL trước khi đưa văn bản vào ngữ cảnh của mô hình ngôn ngữ lớn.',
        embedding: makeDeterministicVector(307, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess4!.id,
        attachmentId: attS4Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s4-chunk-01',
        startSec: 540,
        endSec: 1260,
        pageNumber: 11,
        content:
          'Trong cơ chế Function Calling, mô hình LLM không trực tiếp chạy câu lệnh SQL mà chỉ sinh ra cấu trúc JSON chứa tên hàm và các đối số tuân theo lược đồ Pydantic v2. Mã nguồn Backend của bạn chịu trách nhiệm xác thực quyền hạn từ JWT (req.user.id), thực thi hàm và gửi kết quả quan sát (Observation) trở lại cho mô hình.',
        embedding: makeDeterministicVector(308, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess4!.id,
        attachmentId: attS4Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s4-chunk-02',
        startSec: 1890,
        endSec: 2520,
        pageNumber: 18,
        content:
          'Khi điều phối vòng lặp ReAct Agent và đồ thị trạng thái LangGraph, luôn phải đặt giới hạn số bước lặp tối đa (max_iterations = 4) để chống lặp vô tận. Nếu đối số do LLM sinh ra vi phạm kiểu dữ liệu Pydantic (ValidationError), hãy đóng gói chi tiết lỗi gửi trả lại vào bản tin tool message để mô hình tự sửa tham số (Self-Correction).',
        embedding: makeDeterministicVector(309, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess5!.id,
        attachmentId: attS5Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s5-chunk-01',
        startSec: 480,
        endSec: 1320,
        pageNumber: 12,
        content:
          'Bộ khung đánh giá Ragas đo lường chất lượng hệ thống RAG qua 4 chỉ số định lượng: Context Precision và Context Recall đánh giá chất lượng tầng truy xuất (Retrieval), trong khi Faithfulness (độ trung thực chống ảo giác) và Answer Relevancy đánh giá chất lượng tầng sinh câu trả lời (Generation).',
        embedding: makeDeterministicVector(310, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess5!.id,
        attachmentId: attS5Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s5-chunk-02',
        startSec: 2150,
        endSec: 2940,
        pageNumber: 20,
        content:
          'Khi triển khai Semantic Cache trên Redis, cần kết hợp khóa phân vùng ngữ cảnh (ví dụ namespace theo session_id hoặc course_id) cùng ngưỡng tương đồng Cosine chặt chẽ (>= 0.94) để tiết kiệm 40% chi phí token mà không gặp hiện tượng dương tính giả (False Cache Hit).',
        embedding: makeDeterministicVector(311, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess6!.id,
        attachmentId: attS6Slide!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        contentHash: 'hash-s6-chunk-01',
        startSec: 360,
        endSec: 1080,
        pageNumber: 8,
        content:
          'Tổng duyệt kiến trúc Production AI: Tách biệt cổng giao dịch Node.js/TypeScript và AI Microservice FastAPI, đưa tác vụ bóc tách PDF nặng vào Celery/Redis và luôn kiểm tra healthcheck `service_healthy` trước khi mở lưu lượng người dùng.',
        embedding: makeDeterministicVector(312, 1024),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAi!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess6!.id,
        attachmentId: attS6Slide!.id,
        sourceType: 'ATTACHMENT_DOC',
        chunkIndex: 2,
        contentHash: 'hash-s6-chunk-02',
        startSec: 1600,
        endSec: 2300,
        pageNumber: 16,
        content:
          'Quy chế thi sát hạch cuối khóa và cấp chứng chỉ số HMAC-SHA256: Học viên cần hoàn thành 6/6 buổi học, vượt qua kỳ thi >= 70% mà không vi phạm quy chế webcam (3-Strike Auto-Suspension) để nhận chứng chỉ xác thực và +4 lượt phỏng vấn thử AI.',
        embedding: makeDeterministicVector(313, 1024),
      },
    ])
    .returning();

  const insertedSkillStates = await db
    .insert(studentSkillStates)
    .values([
      // --- Nguyễn Văn An (Tất cả 7 kỹ năng AI gồm cả LANGGRAPH_AGENT + 3 kỹ năng SWE đã học) ---
      {
        accountId: stuAnAcc!.id,
        skillId: skPython!.id,
        masteryScore: 0.92,
        evidenceCount: 14,
        trend: 0.12,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skRag!.id,
        masteryScore: 0.94,
        evidenceCount: 16,
        trend: 0.18,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skTool!.id,
        masteryScore: 0.89,
        evidenceCount: 12,
        trend: 0.15,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skLangGraph!.id,
        masteryScore: 0.87,
        evidenceCount: 8,
        trend: 0.19,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.91,
        evidenceCount: 15,
        trend: 0.14,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skFastApi!.id,
        masteryScore: 0.9,
        evidenceCount: 11,
        trend: 0.1,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skEval!.id,
        masteryScore: 0.88,
        evidenceCount: 9,
        trend: 0.21,
        updatedAt: new Date('2026-04-03T11:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skNode!.id,
        masteryScore: 0.86,
        evidenceCount: 6,
        trend: 0.14,
        updatedAt: new Date('2026-03-29T15:32:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skSysDesign!.id,
        masteryScore: 0.82,
        evidenceCount: 4,
        trend: 0.11,
        updatedAt: new Date('2026-03-29T15:32:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        skillId: skDocker!.id,
        masteryScore: 0.78,
        evidenceCount: 3,
        trend: 0.08,
        updatedAt: new Date('2026-03-29T15:32:00Z'),
      },

      // --- Lê Hoàng Mai (AI K01 + PY K04) ---
      {
        accountId: stuMaiAcc!.id,
        skillId: skPython!.id,
        masteryScore: 0.9,
        evidenceCount: 15,
        trend: 0.11,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.93,
        evidenceCount: 18,
        trend: 0.16,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skFastApi!.id,
        masteryScore: 0.86,
        evidenceCount: 10,
        trend: 0.12,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skRag!.id,
        masteryScore: 0.85,
        evidenceCount: 10,
        trend: 0.14,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skTool!.id,
        masteryScore: 0.82,
        evidenceCount: 8,
        trend: 0.09,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skLangGraph!.id,
        masteryScore: 0.8,
        evidenceCount: 5,
        trend: 0.11,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        skillId: skEval!.id,
        masteryScore: 0.84,
        evidenceCount: 6,
        trend: 0.13,
        updatedAt: new Date('2026-03-17T16:25:00Z'),
      },

      // --- Trần Thu Hà (AI K01 Buổi 1-4) ---
      {
        accountId: stuHaAcc!.id,
        skillId: skPython!.id,
        masteryScore: 0.78,
        evidenceCount: 8,
        trend: 0.08,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        skillId: skFastApi!.id,
        masteryScore: 0.76,
        evidenceCount: 5,
        trend: 0.07,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.74,
        evidenceCount: 6,
        trend: 0.06,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        skillId: skRag!.id,
        masteryScore: 0.75,
        evidenceCount: 7,
        trend: 0.1,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        skillId: skTool!.id,
        masteryScore: 0.62,
        evidenceCount: 5,
        trend: -0.04,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },
      {
        accountId: stuHaAcc!.id,
        skillId: skLangGraph!.id,
        masteryScore: 0.58,
        evidenceCount: 4,
        trend: -0.05,
        updatedAt: new Date('2026-03-26T15:00:00Z'),
      },

      // --- Phạm Minh Quân (AI K01 Buổi 1-6 + Final Exam bị đình chỉ) ---
      {
        accountId: stuQuanAcc!.id,
        skillId: skPython!.id,
        masteryScore: 0.72,
        evidenceCount: 7,
        trend: 0.04,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skFastApi!.id,
        masteryScore: 0.7,
        evidenceCount: 6,
        trend: 0.03,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.71,
        evidenceCount: 7,
        trend: 0.04,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skRag!.id,
        masteryScore: 0.69,
        evidenceCount: 6,
        trend: 0.02,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skTool!.id,
        masteryScore: 0.68,
        evidenceCount: 5,
        trend: 0.01,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skLangGraph!.id,
        masteryScore: 0.66,
        evidenceCount: 4,
        trend: 0.0,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },
      {
        accountId: stuQuanAcc!.id,
        skillId: skEval!.id,
        masteryScore: 0.65,
        evidenceCount: 4,
        trend: -0.02,
        updatedAt: new Date('2026-04-01T14:20:00Z'),
      },

      // --- Vũ Đình Khôi (PY K04) ---
      {
        accountId: stuKhoiAcc!.id,
        skillId: skPython!.id,
        masteryScore: 0.87,
        evidenceCount: 12,
        trend: 0.13,
        updatedAt: new Date('2026-02-26T10:00:00Z'),
      },
      {
        accountId: stuKhoiAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.89,
        evidenceCount: 14,
        trend: 0.15,
        updatedAt: new Date('2026-02-26T10:00:00Z'),
      },
      {
        accountId: stuKhoiAcc!.id,
        skillId: skFastApi!.id,
        masteryScore: 0.82,
        evidenceCount: 6,
        trend: 0.1,
        updatedAt: new Date('2026-02-26T10:00:00Z'),
      },

      // --- Hoàng Gia Bảo (SWE K01 Buổi 1-3) ---
      {
        accountId: stuBaoAcc!.id,
        skillId: skNode!.id,
        masteryScore: 0.91,
        evidenceCount: 8,
        trend: 0.16,
        updatedAt: new Date('2026-04-01T16:00:00Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        skillId: skSqlVec!.id,
        masteryScore: 0.88,
        evidenceCount: 6,
        trend: 0.12,
        updatedAt: new Date('2026-04-01T16:00:00Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        skillId: skSysDesign!.id,
        masteryScore: 0.9,
        evidenceCount: 7,
        trend: 0.15,
        updatedAt: new Date('2026-04-01T16:00:00Z'),
      },
      {
        accountId: stuBaoAcc!.id,
        skillId: skDocker!.id,
        masteryScore: 0.8,
        evidenceCount: 3,
        trend: 0.08,
        updatedAt: new Date('2026-04-01T16:00:00Z'),
      },
    ])
    .returning();

  const [chatTutorS3, chatTutorS5, chatAdvisorAn] = await db
    .insert(chatSessions)
    .values([
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess3!.id,
        scope: 'SESSION_TUTOR',
        title: 'Hỏi đáp Buổi 3: Công thức RRF & Pre-filtering RBAC',
        createdAt: new Date('2026-03-10T15:30:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        sessionId: sess5!.id,
        scope: 'SESSION_TUTOR',
        title: 'Hỏi đáp Buổi 5: Các chỉ số Ragas & Semantic Cache',
        createdAt: new Date('2026-03-17T14:40:00Z'),
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: null,
        sessionId: null,
        scope: 'ADVISOR_GLOBAL',
        title: 'Tư vấn lộ trình nâng cấp từ AI Engineer lên Kiến trúc Backend Chuyên sâu',
        createdAt: new Date('2026-03-23T20:00:00Z'),
      },
    ])
    .returning();

  await db.insert(chatMessages).values([
    {
      chatSessionId: chatTutorS3!.id,
      role: 'user',
      content:
        'Giải thích giúp mình tại sao công thức RRF lại dùng hằng số k = 60 mà không cộng trực tiếp điểm Cosine với BM25?',
      detectedTopic: 'HYBRID_SEARCH_RRF',
      citations: [],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 42,
      completionTokens: 0,
      latencyMs: 12,
      createdAt: new Date('2026-03-10T15:30:10Z'),
    },
    {
      chatSessionId: chatTutorS3!.id,
      role: 'assistant',
      content:
        'Chào An! Trong **Buổi 3: Thuật toán Hybrid Search & Reciprocal Rank Fusion**, lý do không cộng trực tiếp điểm số là vì điểm **Cosine Similarity** nằm trong đoạn $[-1, 1]$ trong khi điểm **BM25** không có chặn trên cố định và phụ thuộc vào độ dài tài liệu.\n\nCông thức $RRF(d) = \\frac{1}{60 + rank_{dense}(d)} + \\frac{1}{60 + rank_{bm25}(d)}$ chuyển đổi điểm số sang **thứ hạng tương đối**, giúp hợp nhất hai nhánh công bằng và đề cao những đoạn tài liệu xuất hiện đồng thời ở nhóm đầu của cả hai phương pháp.',
      detectedTopic: 'HYBRID_SEARCH_RRF',
      citations: [
        {
          label: '23:40 · Công thức RRF (k=60)',
          jumpSec: 1420,
          slideLabel: 'Slide Trang 14',
        },
        {
          label: '07:00 · Điểm mù của Dense Vector',
          jumpSec: 420,
          slideLabel: 'Slide Trang 10',
        },
      ],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 380,
      completionTokens: 165,
      latencyMs: 640,
      createdAt: new Date('2026-03-10T15:30:12Z'),
    },
    {
      chatSessionId: chatTutorS5!.id,
      role: 'user',
      content: 'Nếu điểm Context Recall trong Ragas bị thấp thì mình cần tối ưu ở bước nào?',
      detectedTopic: 'RAGAS_EVALUATION',
      citations: [],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 35,
      completionTokens: 0,
      latencyMs: 10,
      createdAt: new Date('2026-03-17T14:40:15Z'),
    },
    {
      chatSessionId: chatTutorS5!.id,
      role: 'assistant',
      content:
        'Chỉ số **Context Recall** đo lường khả năng bộ truy xuất tìm ra đầy đủ các thông tin chuẩn (ground truth). Khi chỉ số này thấp, bạn cần kiểm tra và tối ưu ở **tầng Retrieval**:\n1. Rà soát lại chiến lược **Chunking** (đảm bảo `chunk_overlap` 10%–15% để không cắt đứt câu).\n2. Mở rộng số lượng ứng viên lấy từ **Hybrid Search (Dense + BM25 RRF)** lên Top 30 trước khi đưa qua **Cross-Encoder Reranker**.',
      detectedTopic: 'RAGAS_EVALUATION',
      citations: [
        {
          label: '08:00 · Bộ tứ chỉ số Ragas',
          jumpSec: 480,
          slideLabel: 'Slide Trang 12',
        },
      ],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 340,
      completionTokens: 140,
      latencyMs: 590,
      createdAt: new Date('2026-03-17T14:40:17Z'),
    },
    {
      chatSessionId: chatAdvisorAn!.id,
      role: 'user',
      content:
        'Mình đang học khóa Kỹ sư AI Thực chiến K01 và muốn học thêm về thiết kế hệ thống phân tán, xử lý Webhook thanh toán và tối ưu PostgreSQL thì nên đăng ký khóa nào tiếp theo?',
      detectedTopic: 'COURSE_ADVISOR',
      citations: [],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 48,
      completionTokens: 0,
      latencyMs: 15,
      createdAt: new Date('2026-03-23T20:00:10Z'),
    },
    {
      chatSessionId: chatAdvisorAn!.id,
      role: 'assistant',
      content:
        'Chào An! Với nền tảng AI Engineering hiện tại của bạn, mảnh ghép hoàn hảo tiếp theo là khóa **Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems** (Mã đợt đang mở: **SWE-ARCH-2026-K01**, học phí **5.900.000 VNĐ**).\n\nKhóa học này do **ThS. Nguyễn Thu Hà** trực tiếp hướng dẫn vào tối Thứ 4 & Chủ Nhật (19:30 - 21:30), giúp bạn làm chủ giao dịch ACID, đối soát cổng thanh toán tự động qua Webhook có đảm bảo Idempotency và chiến lược Redis Caching đa tầng.',
      detectedTopic: 'COURSE_ADVISOR',
      citations: [],
      llmProvider: 'OPENAI',
      llmModel: 'gpt-4o-mini',
      promptTokens: 410,
      completionTokens: 155,
      latencyMs: 620,
      createdAt: new Date('2026-03-23T20:00:12Z'),
    },
  ]);

  const insertedMockInterviews = await db
    .insert(mockInterviews)
    .values([
      {
        accountId: stuAnAcc!.id,
        targetLevel: 'FRESHER',
        targetRole: 'Fresher AI Engineer (RAG & Agentic Workflows)',
        jdRawText:
          'Tuyển dụng Fresher AI Engineer phát triển hệ thống trợ lý tri thức doanh nghiệp. Yêu cầu: Thành thạo Python AsyncIO, FastAPI, thiết kế hệ thống Hybrid RAG với PostgreSQL pgvector + BM25, hiểu rõ cơ chế Function Calling với Pydantic và biết đo lường chất lượng bằng Ragas.',
        cvScreeningResult: {
          matchPercent: 88,
          passedGate: true,
          layoutAndPresentationFeedback:
            'Bố cục CV chuẩn kỹ sư, nêu bật rõ 2 dự án thực tế (3T SmartDocs và AutoOrder Agent) kèm các chỉ số đo lường độ trễ và tỷ lệ giảm ảo giác rất thuyết phục.',
          jdMatchEvaluation:
            'Hồ sơ đạt độ khớp 88% so với JD vị trí Fresher AI Engineer. Ứng viên đáp ứng đầy đủ các từ khóa cốt lõi: Python AsyncIO, FastAPI, pgvector HNSW, BM25 RRF và Function Calling.',
          missingKeywordsOrGaps: [
            'Có thể bổ sung thêm số liệu cụ thể về kích thước tập dữ liệu Golden Dataset khi chạy kiểm thử Ragas trong dự án SmartDocs.',
          ],
        },
        transcriptLog: [
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 1/3 · Xác thực dự án trong CV',
            text: 'Chào An! Trong CV bạn có nêu dự án 3T SmartDocs giúp giảm tỷ lệ ảo giác từ 28% xuống dưới 4.5%. Bạn hãy trình bày chi tiết cách bạn thiết kế chiến lược Chunking và kết hợp Hybrid Search trong dự án này?',
            createdAt: '2026-04-03T14:00:00.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Nguyễn Văn An',
            stageTag: 'Trả lời câu 1/3',
            questionPrompt:
              'Chào An! Trong CV bạn có nêu dự án 3T SmartDocs giúp giảm tỷ lệ ảo giác từ 28% xuống dưới 4.5%. Bạn hãy trình bày chi tiết cách bạn thiết kế chiến lược Chunking và kết hợp Hybrid Search trong dự án này?',
            text: 'Dạ chào hội đồng! Trong dự án 3T SmartDocs, em áp dụng chiến lược chunking 2 tầng: đầu tiên tách theo cấu trúc tiêu đề Markdown để giữ ngữ cảnh chương mục, sau đó dùng RecursiveCharacterTextSplitter với kích thước 600 tokens và độ chồng lấp 15%. Về truy xuất, em kết hợp nhánh Dense Vector 1024 chiều trên pgvector HNSW với nhánh từ khóa PostgreSQL tsvector BM25 thông qua công thức Reciprocal Rank Fusion với hằng số k=60 để lấy Top 30, rồi đưa qua Cross-Encoder Reranker chọn ra Top 5 đoạn chính xác nhất trước khi đưa vào LLM.',
            durationSec: 52,
            createdAt: '2026-04-03T14:01:00.000Z',
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 2/3 · Xử lý tình huống kỹ thuật chuyên sâu',
            text: 'Rất rõ ràng! Vậy ở dự án thứ hai là AutoOrder Agent, khi mô hình LLM sinh lời gọi hàm (Function Calling) nhưng truyền sai định dạng tham số khiến Pydantic báo lỗi ValidationError, bạn xử lý vòng lặp ReAct như thế nào để hệ thống tự phục hồi mà không bị treo?',
            createdAt: '2026-04-03T14:01:05.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Nguyễn Văn An',
            stageTag: 'Trả lời câu 2/3',
            questionPrompt:
              'Rất rõ ràng! Vậy ở dự án thứ hai là AutoOrder Agent, khi mô hình LLM sinh lời gọi hàm (Function Calling) nhưng truyền sai định dạng tham số khiến Pydantic báo lỗi ValidationError, bạn xử lý vòng lặp ReAct như thế nào để hệ thống tự phục hồi mà không bị treo?',
            text: 'Trong bộ điều phối ReAct Agent của em, em luôn đặt giới hạn cứng max_iterations bằng 4 bước. Khi thực thi công cụ mà bắt được ngoại lệ ValidationError từ Pydantic v2, em không ném lỗi 500 ra ngoài mà đóng gói danh sách lỗi chi tiết của trường bị sai vào một bản tin có role là tool gửi trả ngược lại cho LLM. Nhờ đó ở bước suy luận kế tiếp, mô hình đọc được lỗi định dạng và tự động hiệu chỉnh lại tham số chuẩn xác.',
            durationSec: 48,
            createdAt: '2026-04-03T14:02:00.000Z',
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 3/3 · Bảo mật dữ liệu & Phân quyền doanh nghiệp',
            text: 'Câu hỏi cuối cùng: Nếu hệ thống SmartDocs lưu trữ cả tài liệu công khai lẫn tài liệu mật của từng phòng ban, bạn đặt cơ chế kiểm soát truy cập ở đâu để đảm bảo người dùng không thể dùng Prompt Injection khai thác trái phép tài liệu mật?',
            createdAt: '2026-04-03T14:02:05.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Nguyễn Văn An',
            stageTag: 'Trả lời câu 3/3',
            questionPrompt:
              'Câu hỏi cuối cùng: Nếu hệ thống SmartDocs lưu trữ cả tài liệu công khai lẫn tài liệu mật của từng phòng ban, bạn đặt cơ chế kiểm soát truy cập ở đâu để đảm bảo người dùng không thể dùng Prompt Injection khai thác trái phép tài liệu mật?',
            text: 'Em áp dụng nguyên tắc Pre-filtering RBAC ngay tại tầng cơ sở dữ liệu PostgreSQL. Cụ thể, danh tính và quyền hạn của người dùng được lấy trực tiếp từ JWT token ở tầng Backend để truyền vào mệnh đề WHERE của câu truy vấn Hybrid Search. Như vậy các đoạn tài liệu không thuộc quyền truy cập của người dùng bị loại bỏ hoàn toàn ngay từ tầng SQL và không bao giờ được nạp vào ngữ cảnh của mô hình LLM.',
            durationSec: 46,
            createdAt: '2026-04-03T14:03:00.000Z',
          },
        ],
        evaluationReport: {
          overallScore: 89,
          projectDepthScore: 92,
          communicationScore: 87,
          technicalAccuracy: 90,
          strengths: [
            'Hiểu rất sâu kiến trúc thực tế của các dự án đã liệt kê trong CV (Markdown + Recursive Chunking, RRF k=60, Cross-Encoder Reranker).',
            'Nắm vững cơ chế tự phục hồi lỗi ValidationError trong vòng lặp ReAct Agent và nguyên tắc bảo mật Pre-filtering RBAC ở tầng SQL.',
          ],
          improvements: [
            'Có thể nêu thêm cách thiết lập Semantic Cache theo từng phân vùng quyền hạn để câu trả lời đạt mức hoàn hảo.',
          ],
        },
        status: 'COMPLETED',
        createdAt: new Date('2026-04-03T13:58:00Z'),
        completedAt: new Date('2026-04-03T14:03:30Z'),
      },
      {
        accountId: stuMaiAcc!.id,
        targetLevel: 'JUNIOR',
        targetRole: 'Junior AI & Backend Engineer',
        jdRawText:
          'Tuyển dụng Junior AI & Backend Engineer xây dựng dịch vụ phân tích tài liệu tài chính bằng LLM và tối ưu cơ sở dữ liệu PostgreSQL/pgvector.',
        cvScreeningResult: {
          matchPercent: 91,
          passedGate: true,
          layoutAndPresentationFeedback:
            'CV trình bày rõ kinh nghiệm thực tế tại Tiki và dự án FinRAG với con số đo lường độ chính xác 94.2%.',
          jdMatchEvaluation: 'Hồ sơ khớp 91% với yêu cầu vị trí Junior AI & Backend Engineer.',
          missingKeywordsOrGaps: [
            'Bổ sung thêm chi tiết về chiến lược giám sát độ trễ p95 trên môi trường container.',
          ],
        },
        transcriptLog: [
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 1/3 · Xác thực dự án trong CV',
            text: 'Chào Mai! Hãy chia sẻ cách bạn xử lý bảng biểu trong báo cáo tài chính PDF ở dự án FinRAG để mô hình không đọc sai các con số theo cột?',
            createdAt: '2026-04-04T09:00:00.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Lê Hoàng Mai',
            stageTag: 'Trả lời câu 1/3',
            text: 'Em chuyển toàn bộ bảng biểu tài chính sang định dạng bảng Markdown chuẩn kèm tiêu đề kỳ kế toán và đơn vị tiền tệ trên từng chunk trước khi tạo vector embedding và lưu song song vào tsvector.',
            durationSec: 45,
            createdAt: '2026-04-04T09:01:00.000Z',
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 2/3 · Xử lý tình huống kỹ thuật chuyên sâu',
            text: 'Khi kết hợp tìm kiếm từ khóa và vector trên dữ liệu lớn, bạn tối ưu truy vấn PostgreSQL như thế nào?',
            createdAt: '2026-04-04T09:01:05.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Lê Hoàng Mai',
            stageTag: 'Trả lời câu 2/3',
            text: 'Em dùng CTE tách riêng nhánh HNSW index scan và nhánh GIN index scan trên tsvector, giới hạn mỗi nhánh lấy Top 30 rồi mới FULL OUTER JOIN tính điểm RRF.',
            durationSec: 42,
            createdAt: '2026-04-04T09:02:00.000Z',
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'Hội đồng Phỏng vấn Kỹ thuật AI',
            stageTag: 'Câu 3/3 · Bảo mật dữ liệu & Phân quyền doanh nghiệp',
            text: 'Làm sao bạn bảo vệ các API xử lý thanh toán hoặc báo cáo tài chính trước lỗi xử lý trùng lặp?',
            createdAt: '2026-04-04T09:02:05.000Z',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Lê Hoàng Mai',
            stageTag: 'Trả lời câu 3/3',
            text: 'Em sử dụng khóa duy nhất (UNIQUE constraint) trên mã giao dịch đối tác kết hợp giao dịch ACID để đảm bảo tính Idempotency tuyệt đối.',
            durationSec: 40,
            createdAt: '2026-04-04T09:03:00.000Z',
          },
        ],
        evaluationReport: {
          overallScore: 91,
          projectDepthScore: 94,
          communicationScore: 89,
          technicalAccuracy: 92,
          strengths: [
            'Tư duy tối ưu cơ sở dữ liệu PostgreSQL và thiết kế truy vấn lai rất vững vàng.',
            'Giải quyết bài toán trích xuất bảng biểu tài chính thực tế và mạch lạc.',
          ],
          improvements: [
            'Có thể mở rộng thêm về cách đánh giá tự động bằng bộ chỉ số Ragas sau mỗi lần cập nhật parser.',
          ],
        },
        status: 'COMPLETED',
        createdAt: new Date('2026-04-04T08:58:00Z'),
        completedAt: new Date('2026-04-04T09:03:30Z'),
      },
    ])
    .returning();

  // =========================================================================
  // 19. CROSS-TABLE SEED CONSISTENCY SELF-AUDIT
  // =========================================================================
  const insertedSubtitles = await db.select().from(sessionSubtitles);
  const insertedProgress = await db.select().from(sessionProgress);
  const insertedCerts = await db.select().from(certificates);
  const insertedCohorts = await db.select().from(cohorts);
  const insertedAssessments = await db.select().from(assessments);

  const consistencyViolations = findSeedConsistencyViolations({
    cohorts: insertedCohorts.map((c) => ({
      id: c.id,
      code: c.code,
      enrolledCount: c.enrolledCount,
      scheduleSlots: c.scheduleSlots as Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
    })),
    enrollments: insertedEnrollments.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      cohortId: e.cohortId,
      status: e.status,
      finalExamPassed: e.finalExamPassed,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
    })),
    certificates: insertedCerts.map((c) => ({
      enrollmentId: c.enrollmentId,
      accountId: c.accountId,
      certificateCode: c.certificateCode,
      issuedAt: c.issuedAt,
    })),
    sessions: insertedSessions.map((s) => ({
      id: s.id,
      cohortId: s.cohortId,
      sessionOrder: s.sessionOrder,
      status: s.status,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      videoR2Key: s.videoR2Key,
    })),
    subtitles: insertedSubtitles.map((sub) => ({ sessionId: sub.sessionId })),
    progress: insertedProgress.map((p) => ({
      accountId: p.accountId,
      sessionId: p.sessionId,
      isCompleted: p.isCompleted,
      completedAt: p.completedAt,
      lastActivityAt: p.lastActivityAt,
    })),
    assessments: insertedAssessments.map((a) => ({
      id: a.id,
      cohortId: a.cohortId,
      sessionId: a.sessionId,
      purpose: a.purpose,
      passScorePct: a.passScorePct,
    })),
    assessmentItems: allInsertedItems.map((i) => ({
      id: i.id,
      assessmentId: i.assessmentId,
      skillId: i.skillId,
      points: i.points,
    })),
    attempts: insertedAttempts.map((att) => ({
      id: att.id,
      assessmentId: att.assessmentId,
      accountId: att.accountId,
      totalScore: att.totalScore,
      scorePct: att.scorePct,
      isPassed: att.isPassed,
      integrityStatus: att.integrityStatus,
      totalRiskScore: att.totalRiskScore,
      startedAt: att.startedAt,
      gradingCompletedAt: att.gradingCompletedAt,
    })),
    answers: allSubmissionAnswers.map((ans) => ({
      attemptId: ans.attemptId,
      itemId: ans.itemId,
      finalScore: ans.finalScore,
      gradedAt: ans.gradedAt,
    })),
    proctoringEvents: insertedProctoringEvents.map((ev) => ({
      attemptId: ev.attemptId,
      eventType: ev.eventType,
      riskDelta: ev.riskDelta,
      occurredAt: ev.occurredAt,
    })),
    knowledgeChunks: insertedKnowledgeChunks.map((ch) => ({
      sessionId: ch.sessionId,
      sourceType: ch.sourceType,
    })),
    profiles: insertedProfiles.map((p) => ({
      accountId: p.accountId,
      interviewCredits: p.interviewCredits,
      cvParsedData: (p.cvParsedData ?? {}) as Record<string, unknown>,
    })),
    mockInterviews: insertedMockInterviews.map((m) => ({
      accountId: m.accountId,
      status: m.status,
      createdAt: m.createdAt,
      completedAt: m.completedAt,
    })),
    skillStates: insertedSkillStates.map((s) => ({
      accountId: s.accountId,
      skillId: s.skillId,
    })),
  });

  if (consistencyViolations.length > 0) {
    logger.error({ violations: consistencyViolations }, 'Seed consistency check failed');
    throw new Error(`Seed consistency check failed:\n- ${consistencyViolations.join('\n- ')}`);
  }

  logger.info(
    'Full A-to-Z 3T Academy database seed completed & verified across all 26 schema tables!'
  );
}

const entryArg = typeof process !== 'undefined' ? process.argv[1] : undefined;
const isDirectRun =
  typeof entryArg === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(entryArg)).href;

if (isDirectRun) {
  runSeed(defaultDb)
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'Database seed failed');
      process.exit(1);
    });
}
