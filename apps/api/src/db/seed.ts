import path from 'node:path';
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { db as defaultDb, pool } from './index.js';
import { logger } from '../config/logger.js';
import {
  accounts,
  accountIdentities,
  userProfiles,
  instructorProfiles,
  categories,
  skills,
  courses,
  courseSkills,
  cohorts,
  classSessions,
  sessionAttachments,
  sessionSubtitles,
   assessments,
  assessmentItems,
  knowledgeChunks,
  systemSettings,
} from './schema/index.js';
import {
  buildSessionQuizItems,
  computeSemanticEmbedding1024,
  findSeedConsistencyViolations,
  makeDeterministicVector,
} from './seedHelpers.js';

export { makeDeterministicVector, computeSemanticEmbedding1024 };

export async function runSeed(db: typeof defaultDb = defaultDb) {
  logger.info('Starting minimal, clean 3T Academy database seed (10,000 VND tuition, zero pre-seeded enrollments/orders/certificates)...');

  // Clean existing tables using TRUNCATE RESTART IDENTITY CASCADE
  await db.execute(sql`
    TRUNCATE TABLE
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
      session_progress,
      enrollments,
      payment_transactions,
      orders,
      session_subtitles,
      session_attachments,
      class_sessions,
      cohorts,
      course_skills,
      courses,
      skills,
      categories,
      instructor_profiles,
      user_profiles,
      account_identities,
      accounts,
      system_settings
    RESTART IDENTITY CASCADE
  `);

  const defaultPasswordHash = await argon2.hash('123456');

  // =========================================================================
  // 1. SYSTEM SETTINGS
  // =========================================================================
  await db.insert(systemSettings).values([
    {
      key: 'platform_name',
      value: JSON.stringify({
        name: 'Học viện Công nghệ 3T Academy',
        hotline: '1900 636 809',
        supportEmail: 'academic@3t.edu.vn',
      }),
      description: 'Thông tin thương hiệu Học viện Công nghệ 3T',
      isPublic: true,
    },
    {
      key: 'sepay_bank_name',
      value: 'MBBank',
      description: 'Ngân hàng thụ hưởng cổng thanh toán VietQR SePay',
      isPublic: true,
    },
    {
      key: 'sepay_account_number',
      value: '0389998888',
      description: 'Số tài khoản nhận học phí tự động qua SePay Webhook',
      isPublic: true,
    },
    {
      key: 'proctoring_max_strikes',
      value: '3',
      description: 'Số lần cảnh báo vi phạm tối đa trước khi tự động đình chỉ bài thi cuối khóa',
      isPublic: false,
    },
    {
      key: 'ACADEMY_FAQS',
      value: JSON.stringify([
        {
          id: 'faq-1',
          question: 'Hình thức học tại 3T Academy là học trực tiếp cùng giảng viên hay xem video thu sẵn?',
          answer:
            'Tại 3T Academy, bạn học trực tuyến tương tác trực tiếp (Live) cùng giảng viên vào các buổi tối cố định trong tuần (2 buổi/tuần). Sau mỗi buổi học, bản ghi hình chất lượng cao kèm phụ đề và tài liệu sẽ được cập nhật trên hệ thống để bạn chủ động ôn tập lại bất cứ lúc nào.',
        },
        {
          id: 'faq-2',
          question: 'Nếu hôm đó mình bận việc đột xuất không vào lớp kịp thì có bị mất bài không?',
          answer:
            'Hoàn toàn không. Ngay sau khi ca học kết thúc, bạn có thể xem lại toàn bộ video bài giảng, tải slide và mã nguồn thực hành. Trong lúc tự ôn bài, nếu có đoạn nào chưa rõ, bạn có thể hỏi trực tiếp Trợ giảng AI ngay cạnh khung video để được giải thích cặn kẽ theo đúng mốc thời gian giảng viên đã giảng.',
        },
        {
          id: 'faq-3',
          question: 'Mình mới bắt đầu hoặc trái ngành thì nên chọn khóa học nào trước?',
          answer:
            'Nếu bạn mới làm quen với lập trình hoặc muốn củng cố lại nền tảng, bạn nên bắt đầu từ khóa Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI. Sau khi nắm vững tư duy viết code Python và truy vấn cơ sở dữ liệu PostgreSQL, bạn có thể học tiếp lên các khóa chuyên sâu về Kỹ sư AI Thực chiến, Kiến trúc Backend Chuyên sâu hoặc Kỹ sư Dữ liệu Hiện đại.',
        },
        {
          id: 'faq-4',
          question: 'Điều kiện để hoàn thành mỗi buổi học và nhận chứng chỉ tốt nghiệp là gì?',
          answer:
            'Để đảm bảo chất lượng đầu ra thực chất, mỗi buổi học yêu cầu bạn theo dõi tối thiểu 80% thời lượng bài giảng và làm đạt từ 7.0/10 trở lên bài kiểm tra ngắn (10 câu trắc nghiệm) cuối buổi. Khi hoàn thành đầy đủ các buổi học và vượt qua kỳ thi sát hạch cuối khóa (25 câu), hệ thống sẽ cấp Chứng chỉ tốt nghiệp có mã định danh xác thực trực tuyến.',
        },
        {
          id: 'faq-5',
          question: 'Tính năng Hồ sơ của tôi (CV) và Luyện phỏng vấn 1-1 hoạt động như thế nào?',
          answer:
            'Khi bạn thiết lập hồ sơ ban đầu và hoàn thành các khóa học, toàn bộ thông tin cá nhân, mục tiêu nghề nghiệp, kỹ năng chuyên môn và đồ án bạn đã làm sẽ được đồng bộ vào mục Hồ sơ của tôi để tạo bản CV chuẩn kỹ sư công nghệ. Bạn cũng có thể sử dụng lượt Luyện phỏng vấn 1-1 bằng giọng nói để rà soát độ khớp của CV với vị trí ứng tuyển và tập trả lời phỏng vấn sát thực tế.',
        },
        {
          id: 'faq-6',
          question: 'Mình đăng ký lớp học và thanh toán học phí như thế nào?',
          answer:
            'Bạn chỉ cần chọn đợt học phù hợp với lịch cá nhân và bấm Đăng ký đợt học. Hệ thống sẽ hiển thị mã QR chuyển khoản ngân hàng (VietQR) với nội dung tự động. Ngay sau khi hoàn tất chuyển khoản trên ứng dụng ngân hàng, lớp học sẽ được mở khóa tự động chỉ sau vài giây mà không cần chờ duyệt thủ công.',
        },
      ]),
      description: 'Danh sách câu hỏi thường gặp công khai tại trang Về học viện',
      isPublic: true,
    },
  ]);

  // =========================================================================
  // 2. CATEGORIES & SKILLS TAXONOMY
  // =========================================================================
  const [catAi, catSwe, catData, catProg] = await db
    .insert(categories)
    .values([
      {
        name: 'Trí tuệ nhân tạo & AI',
        slug: 'ai-llm-engineering',
        description:
          'Xây dựng hệ thống RAG thực chiến, Multi-Agent Workflows, Function Calling và triển khai mô hình ngôn ngữ lớn (LLMOps) lên môi trường Production.',
      },
      {
        name: 'Lập trình Backend & Hệ thống',
        slug: 'software-system-architecture',
        description:
          'Thiết kế kiến trúc Backend phân tán, Microservices, tối ưu hóa cơ sở dữ liệu PostgreSQL/Redis và vận hành hệ thống chịu tải cao.',
      },
      {
        name: 'Kỹ thuật Dữ liệu',
        slug: 'data-engineering-analytics',
        description:
          'Xây dựng đường ống dữ liệu lớn (Data Pipeline) với Python, SQL nâng cao, Apache Spark, Kafka và kiến trúc Data Lakehouse.',
      },
      {
        name: 'Lập trình Nền tảng',
        slug: 'core-programming-sql',
        description:
          'Nền tảng lập trình Python hiện đại, cấu trúc dữ liệu, xử lý bất đồng bộ (AsyncIO) và truy vấn SQL phân tích chuyên sâu.',
      },
    ])
    .returning();

  const insertedSkills = await db
    .insert(skills)
    .values([
      {
        categoryId: catProg!.id,
        code: 'PYTHON_ASYNC',
        name: 'Lập trình Python & AsyncIO',
        description:
          'Làm chủ Python 3.11+, Type Hints, cấu trúc dữ liệu, Generator và lập trình bất đồng bộ với asyncio/httpx.',
      },
      {
        categoryId: catAi!.id,
        code: 'HYBRID_RAG',
        name: 'Kiến trúc Hybrid RAG & Vector DB',
        description:
          'Thiết kế pipeline băm tài liệu (Chunking), nhúng vector (Embedding), kết hợp Dense Vector (pgvector HNSW) + BM25 RRF và Cross-Encoder Reranking.',
      },
      {
        categoryId: catAi!.id,
        code: 'TOOL_CALLING',
        name: 'Function Calling & Agentic Workflows',
        description:
          'Xây dựng AI Agent có khả năng gọi công cụ bên ngoài (Tool Use), kiểm soát đầu ra có cấu trúc với Pydantic v2 và vòng lặp suy luận ReAct.',
      },
      {
        categoryId: catSwe!.id,
        code: 'NODE_TS',
        name: 'Backend TypeScript & Clean Architecture',
        description:
          'Xây dựng RESTful API chuẩn công nghiệp với Node.js, TypeScript, Express, Zod validation và phân tầng dịch vụ rõ ràng.',
      },
      {
        categoryId: catSwe!.id,
        code: 'DOCKER_CI',
        name: 'Docker, CI/CD & Triển khai Production',
        description:
          'Đóng gói ứng dụng với Multi-stage Dockerfile, Docker Compose, kiểm tra sức khỏe dịch vụ (Healthcheck) và tự động hóa kiểm thử.',
      },
      {
        categoryId: catData!.id,
        code: 'SQL_VECTOR',
        name: 'Tối ưu PostgreSQL & pgvector',
        description:
          'Thiết kế lược đồ quan hệ chuẩn hóa, giao dịch ACID, CTE, Window Functions, chỉ mục B-Tree/GIN và chỉ mục láng giềng gần đúng HNSW.',
      },
      {
        categoryId: catAi!.id,
        code: 'FASTAPI_ARCH',
        name: 'Kiến trúc FastAPI & Pydantic v2',
        description:
          'Xây dựng cổng dịch vụ AI tốc độ cao với FastAPI, Dependency Injection, Server-Sent Events (SSE) streaming và kiểm tra dữ liệu nghiêm ngặt.',
      },
      {
        categoryId: catAi!.id,
        code: 'LANGGRAPH_AGENT',
        name: 'Multi-Agent Orchestration & Memory',
        description:
          'Điều phối hệ thống đa tác tử (Supervisor/Worker Agents), quản lý trạng thái hội thoại dài hạn và cơ chế tự sửa lỗi (Self-Reflection).',
      },
      {
        categoryId: catSwe!.id,
        code: 'SYSTEM_DESIGN',
        name: 'Thiết kế Hệ thống Phân tán & Caching',
        description:
          'Áp dụng Redis Caching, Rate Limiting, Idempotent Webhook, Message Queue và xử lý đồng thời quy mô lớn.',
      },
      {
        categoryId: catData!.id,
        code: 'SPARK_KAFKA',
        name: 'Xử lý Dữ liệu Lớn với Spark & Kafka',
        description:
          'Xây dựng luồng xử lý dữ liệu thời gian thực (Streaming) và xử lý theo lô (Batch) với Apache Kafka và PySpark.',
      },
      {
        categoryId: catData!.id,
        code: 'DBT_WAREHOUSE',
        name: 'Data Modeling & Analytics với dbt',
        description:
          'Thiết kế mô hình dữ liệu Star Schema, chuẩn hóa tầng Bronze-Silver-Gold và kiểm định chất lượng dữ liệu tự động.',
      },
      {
        categoryId: catAi!.id,
        code: 'EVAL_GUARDRAILS',
        name: 'LLMOps, Ragas Evaluation & Guardrails',
        description:
          'Đo lường chất lượng hệ thống RAG (Faithfulness, Answer Relevancy, Context Precision), phòng chống Prompt Injection và tối ưu chi phí token.',
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
  // 3. ACCOUNTS (5 Minimal Accounts: 1 Admin, 2 Instructors, 2 Students)
  // =========================================================================
  const insertedAccounts = await db
    .insert(accounts)
    .values([
      {
        email: 'admin@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-04-06T07:30:00Z'),
      },
      {
        email: 'khoa.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-04-06T08:15:00Z'),
      },
      {
        email: 'ha.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-04-06T06:45:00Z'),
      },
      {
        email: 'an.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-15T08:00:00Z'),
        createdAt: new Date('2026-02-15T08:00:00Z'),
        lastLoginAt: new Date('2026-04-06T09:00:00Z'),
      },
      {
        email: 'mai.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-02-16T08:00:00Z'),
        createdAt: new Date('2026-02-16T08:00:00Z'),
        lastLoginAt: new Date('2026-04-06T08:40:00Z'),
      },
    ])
    .returning();

  const [adminAcc, instKhoaAcc, instHaAcc, stuAnAcc, stuMaiAcc] = insertedAccounts;

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
  ]);

  const anCvParsedData = {
    fileName: '',
    updatedAt: '',
    extractedAt: '',
    fullName: 'Nguyễn Văn An',
    candidateName: 'Nguyễn Văn An',
    headline: 'Học viên Kỹ thuật Phần mềm & Trí tuệ nhân tạo',
    targetRole: 'Fresher AI & Backend Engineer',
    email: 'an.student@3t.edu.vn',
    phone: '0908 234 567',
    location: 'Quận Cầu Giấy, Hà Nội',
    avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_nguyen_van_an.jpg',
    githubUrl: 'https://github.com/nguyenvanan-ai',
    linkedinUrl: 'https://linkedin.com/in/nguyenvanan-ai',
    careerObjective:
      'Xây dựng nền tảng vững chắc về Python, Backend và hệ thống AI thực chiến thông qua các dự án thực tế.',
    summaryBio:
      'Học viên định hướng phát triển phần mềm và hệ thống Trí tuệ nhân tạo ứng dụng.',
    skills: [],
    externalSkills: [],
    projects: [],
    workExperience: [],
    education: [],
    awardsAndCerts: [],
  };

  const maiCvParsedData = {
    fileName: '',
    updatedAt: '',
    extractedAt: '',
    fullName: 'Lê Hoàng Mai',
    candidateName: 'Lê Hoàng Mai',
    headline: 'Học viên Phát triển Phần mềm & Kỹ thuật Dữ liệu',
    targetRole: 'Junior AI & Data Engineer',
    email: 'mai.student@3t.edu.vn',
    phone: '0912 345 678',
    location: 'Quận 1, TP. Hồ Chí Minh',
    avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_le_hoang_mai.jpg',
    githubUrl: 'https://github.com/lehoangmai-dev',
    linkedinUrl: 'https://linkedin.com/in/lehoangmai-dev',
    careerObjective:
      'Phát triển kỹ năng thiết kế hệ thống Backend, cơ sở dữ liệu và ứng dụng AI thực tế.',
    summaryBio:
      'Học viên công nghệ tại 3T Academy.',
    skills: [],
    externalSkills: [],
    projects: [],
    workExperience: [],
    education: [],
    awardsAndCerts: [],
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
        accountId: stuAnAcc!.id,
        fullName: 'Nguyễn Văn An',
        avatarUrl: 'https://cdn.3t.edu.vn/avatars/student_nguyen_van_an.jpg',
        bio: 'Fresher AI Engineer · Đam mê xây dựng hệ thống Hybrid RAG, Function Calling và ứng dụng LLM vào bài toán doanh nghiệp.',
        careerGoal: 'Trở thành Junior AI Engineer tại các công ty sản phẩm công nghệ hàng đầu.',
        goalEmbedding: makeDeterministicVector(401, 1024),
        cvParsedData: anCvParsedData,
        interviewCredits: 2,
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
        interviewCredits: 2,
        faceReferenceR2Key: 'kyc/2026/stu-mai-face-ref-v1.jpg',
        faceEmbedding: makeDeterministicVector(102, 512),
      },
    ])
    .returning();

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
  // 7. COHORTS (4 Cohorts — 1 per course, 10,000 VND tuition, 0 enrolled)
  // =========================================================================
  const [cohortAiK01, cohortSweK01, cohortDataK01, cohortPyK01] = await db
    .insert(cohorts)
    .values([
      {
        courseId: courseAi!.id,
        instructorId: instKhoaAcc!.id,
        code: 'AI-ENG-2026-K01',
        name: 'Đợt K01 — Kỹ sư AI Thực chiến (Tối Thứ 3 & Thứ 5)',
        status: 'OPENING',
        curriculumVersion: 'v2.4-2026',
        techStackNotes:
          'Python 3.11 · FastAPI · PostgreSQL 16 (pgvector 0.7) · OpenAI / Gemini SDK · Redis 7 · Docker',
        tuitionVnd: 10000,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-02-01T00:00:00Z'),
        startDate: '2026-03-03',
        endDate: '2026-05-14',
        scheduleSlots: [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        courseId: courseSwe!.id,
        instructorId: instHaAcc!.id,
        code: 'SWE-ARCH-2026-K01',
        name: 'Đợt K01 — Kiến trúc Backend Chuyên sâu (Tối Thứ 4 & Chủ Nhật)',
        status: 'OPENING',
        curriculumVersion: 'v1.8-2026',
        techStackNotes: 'Node.js 22 · TypeScript 5.8 · Express · Drizzle ORM · PostgreSQL 16 · Redis · Docker',
        tuitionVnd: 10000,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-03-01T00:00:00Z'),
        startDate: '2026-03-25',
        endDate: '2026-05-26',
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
        status: 'OPENING',
        curriculumVersion: 'v1.2-2026',
        techStackNotes: 'Python 3.11 · Apache Spark 3.5 · Apache Kafka · dbt Core · PostgreSQL · Docker',
        tuitionVnd: 10000,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-04-01T00:00:00Z'),
        startDate: '2026-06-13',
        endDate: '2026-08-02',
        scheduleSlots: [
          { dayOfWeek: 6, startTime: '14:00', endTime: '16:30' },
          { dayOfWeek: 0, startTime: '14:00', endTime: '16:30' },
        ],
      },
      {
        courseId: coursePython!.id,
        instructorId: instKhoaAcc!.id,
        code: 'PY-SQL-2026-K01',
        name: 'Đợt K01 — Lập trình Python & SQL Thực chiến (Tối Thứ 2 & Thứ 5)',
        status: 'OPENING',
        curriculumVersion: 'v3.0-2026',
        techStackNotes: 'Python 3.11 · AsyncIO · Pytest · PostgreSQL 16 · CTE & Window Functions',
        tuitionVnd: 10000,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-01-01T00:00:00Z'),
        startDate: '2026-01-05',
        endDate: '2026-05-25',
        scheduleSlots: [
          { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
    ])
    .returning();

  // =========================================================================
  // 8. CLASS SESSIONS (24 Sessions: Complete 6-session schedules for 4 cohorts)
  // =========================================================================
  const insertedSessions = await db
    .insert(classSessions)
    .values([
      // --- AI-ENG-2026-K01 (Sessions 1-5 REPLAY_READY, Session 6 SCHEDULED for testing Live/Exam) ---
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

      // --- PY-SQL-2026-K01 (Sessions 1-6 REPLAY_READY so user can test full course or live) ---
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 1,
        title: 'Tư duy Python Hiện đại: Cấu trúc Dữ liệu, Type Hints & Quản lý Bộ nhớ',
        descriptionMd:
          'Làm chủ Python 3.11, List/Dict Comprehension, Generator, Decorator và chuẩn kiểm tra kiểu tĩnh.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-05T12:30:00Z'),
        scheduledEnd: new Date('2026-01-05T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s01/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt cấu trúc dữ liệu Python, Generator (yield) và Type Hints chuẩn 3.11.',
      },
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 2,
        title: 'Lập trình Hướng đối tượng (OOP), Xử lý Ngoại lệ & Kiểm thử với Pytest',
        descriptionMd:
          'Thiết kế module tái sử dụng, kiểm tra dữ liệu với Pydantic cơ bản và viết Unit Test bằng pytest.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-08T12:30:00Z'),
        scheduledEnd: new Date('2026-01-08T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s02/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt OOP, `@pytest.mark.parametrize` và kiểm thử trường hợp biên.',
      },
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 3,
        title: 'Lập trình Bất đồng bộ (AsyncIO) & Thu thập Dữ liệu qua HTTP API',
        descriptionMd:
          'Hiểu rõ Event Loop, `async with` quản lý Connection Pool và httpx bất đồng bộ.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-01-12T12:30:00Z'),
        scheduledEnd: new Date('2026-01-12T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s03/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt `asyncio.gather`, `async with` và kiểm soát đồng thời.',
      },
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 4,
        title: 'Thiết kế Cơ sở Dữ liệu Quan hệ & Truy vấn SQL Cốt lõi trên PostgreSQL',
        descriptionMd:
          'Chuẩn hóa bảng dữ liệu, ràng buộc khóa ngoại, JOIN và tối ưu chỉ mục B-Tree.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-01-15T12:30:00Z'),
        scheduledEnd: new Date('2026-01-15T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s04/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt thiết kế 3NF, phân tích `EXPLAIN ANALYZE` và chỉ mục B-Tree.',
      },
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 5,
        title: 'SQL Phân tích Nâng cao: CTE, Window Functions & Truy vấn JSONB',
        descriptionMd:
          'Giải quyết các bài toán xếp hạng, tính tổng lũy kế, phân tích cohort và toán tử `@>` trên JSONB + GIN.',
        activityTags: ['LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-01-19T12:30:00Z'),
        scheduledEnd: new Date('2026-01-19T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s05/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt CTE, `RANK()`, `DENSE_RANK()`, `LAG()` và truy vấn JSONB.',
      },
      {
        cohortId: cohortPyK01!.id,
        instructorId: instKhoaAcc!.id,
        sessionOrder: 6,
        title: 'Xây dựng Ứng dụng Tổng hợp Python + PostgreSQL & Chuẩn bị Thi Cuối khóa',
        descriptionMd:
          'Kết nối Python AsyncPG với PostgreSQL qua Keyset Pagination, tổng kết kiến thức trước kỳ thi tốt nghiệp.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-01-22T12:30:00Z'),
        scheduledEnd: new Date('2026-01-22T14:30:00Z'),
        status: 'REPLAY_READY',
        livekitRoomName: 'room-py-k01-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: 'recordings/py-k01/s06/master.m3u8',
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt Keyset Pagination và tổng duyệt dự án Python + PostgreSQL.',
      },

      // --- SWE-ARCH-2026-K01 (s01-s03 REPLAY_READY, s04-s06 SCHEDULED) ---
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
        aiSummaryMd: 'Tóm tắt cách đọc `EXPLAIN (ANALYZE, BUFFERS)` và thiết kế Composite / Partial Index.',
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
        durationSeconds: 5400,
        aiSummaryMd: 'Tóm tắt `SELECT ... FOR UPDATE`, Idempotency Key và xử lý SePay Webhook an toàn.',
      },
      {
        cohortId: cohortSweK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 4,
        title: 'Chiến lược Caching Đa tầng với Redis & Hàng đợi Bất đồng bộ (BullMQ)',
        descriptionMd:
          'Triển khai mẫu Cache-Aside, Write-Through, xử lý bài toán Cache Stampede và điều phối tác vụ nặng qua Worker.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-04-05T12:30:00Z'),
        scheduledEnd: new Date('2026-04-05T14:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-swe-k01-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Tài liệu chuẩn bị cho Buổi 4: Chiến lược Redis TTL Jitter và BullMQ Worker.',
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
        aiSummaryMd: 'Tài liệu chuẩn bị cho Buổi 5: Refresh Token Rotation và Multi-stage Dockerfile.',
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

      // --- DATA-PIPE-2026-K01 (All 6 sessions SCHEDULED on Sat/Sun) ---
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 1,
        title: 'Kiến trúc Data Lakehouse & Thiết kế Đường ống Dữ liệu Bền vững',
        descriptionMd: 'Phân biệt kiến trúc Medallion (Bronze, Silver, Gold) và tiêu chuẩn chất lượng dữ liệu.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-06-13T07:00:00Z'),
        scheduledEnd: new Date('2026-06-13T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s01',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Tài liệu chuẩn bị cho buổi khai giảng đợt DATA-PIPE-2026-K01.',
      },
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 2,
        title: 'Xử lý Dữ liệu Phân tán Quy mô lớn với Apache Spark & PySpark',
        descriptionMd: 'Tối ưu Spark DAG, quản lý bộ nhớ Executor, Partitioning và phòng tránh Data Skew.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-06-14T07:00:00Z'),
        scheduledEnd: new Date('2026-06-14T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s02',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 2.',
      },
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 3,
        title: 'Thu thập & Xử lý Luồng Sự kiện Thời gian thực với Apache Kafka',
        descriptionMd: 'Thiết kế Kafka Topic, Consumer Group và tích hợp Spark Structured Streaming.',
        activityTags: ['LIVE_CODING', 'WORKSHOP'],
        scheduledStart: new Date('2026-06-20T07:00:00Z'),
        scheduledEnd: new Date('2026-06-20T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s03',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 3.',
      },
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 4,
        title: 'Analytics Engineering: Chuẩn hóa Kho Dữ liệu với dbt (Data Build Tool)',
        descriptionMd: 'Xây dựng mô hình Star Schema, viết kiểm thử dữ liệu tự động và sinh tài liệu Data Lineage.',
        activityTags: ['THEORY', 'LIVE_CODING'],
        scheduledStart: new Date('2026-06-21T07:00:00Z'),
        scheduledEnd: new Date('2026-06-21T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s04',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 4.',
      },
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 5,
        title: 'Tích hợp Vector Store & Feature Store cho Hệ thống AI/ML',
        descriptionMd: 'Đồng bộ dữ liệu từ tầng Gold sang PostgreSQL pgvector để cấp ngữ cảnh cho ứng dụng RAG.',
        activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-06-27T07:00:00Z'),
        scheduledEnd: new Date('2026-06-27T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s05',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 5.',
      },
      {
        cohortId: cohortDataK01!.id,
        instructorId: instHaAcc!.id,
        sessionOrder: 6,
        title: 'Bảo vệ Đồ án Data Pipeline & Sát hạch Cuối khóa',
        descriptionMd: 'Đánh giá kiến trúc đường ống dữ liệu End-to-End và kiểm tra năng lực kỹ thuật.',
        activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
        scheduledStart: new Date('2026-06-28T07:00:00Z'),
        scheduledEnd: new Date('2026-06-28T09:30:00Z'),
        status: 'SCHEDULED',
        livekitRoomName: 'room-data-k01-s06',
        videoProvider: 'R2_HLS_AES128',
        videoR2Key: null,
        durationSeconds: 5400,
        aiSummaryMd: 'Nội dung dự kiến cho Buổi 6.',
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
    sessSwe5,
    sessSwe6,
  ] = insertedSessions;

  // =========================================================================
  // 9. SESSION ATTACHMENTS & SUBTITLES
  // =========================================================================
  const insertedAttachments = await db
    .insert(sessionAttachments)
    .values([
      {
        sessionId: sess1!.id,
        fileName: 'Slide_Buoi_01_FastAPI_AsyncIO_LLM_Gateway.pdf',
        r2ObjectKey: 'materials/ai-k01/s01/Slide_Buoi_01_FastAPI_AsyncIO_LLM_Gateway.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4280000,
        uploadedBy: instKhoaAcc!.id,
      },
      {
        sessionId: sess2!.id,
        fileName: 'Slide_Buoi_02_Semantic_Chunking_pgvector_HNSW.pdf',
        r2ObjectKey: 'materials/ai-k01/s02/Slide_Buoi_02_Semantic_Chunking_pgvector_HNSW.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 5120000,
        uploadedBy: instKhoaAcc!.id,
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
        sessionId: sess4!.id,
        fileName: 'Slide_Buoi_04_Function_Calling_Pydantic_ReAct_Agent.pdf',
        r2ObjectKey: 'materials/ai-k01/s04/Slide_Buoi_04_Function_Calling_Pydantic_ReAct_Agent.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 5800000,
        uploadedBy: instKhoaAcc!.id,
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
        r2ObjectKey: 'materials/py-k01/s01/Slide_Py01_Python_Data_Structures_Type_Hints.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3500000,
        uploadedBy: instKhoaAcc!.id,
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
    ])
    .returning();

  const [
    attS1Slide,
    attS2Slide,
    attS3Slide,
    attS4Slide,
    attS5Slide,
    attS6Slide,
    attPy1Slide,
    attSwe1Slide,
    attSwe2Slide,
    attSwe3Slide,
  ] = insertedAttachments;

  // Subtitles strictly for REPLAY_READY sessions
  await db.insert(sessionSubtitles).values([
    { sessionId: sess1!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sess2!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sess3!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s03/vi.vtt', isAutoGenerated: true },
    { sessionId: sess4!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s04/vi.vtt', isAutoGenerated: true },
    { sessionId: sess5!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s05/vi.vtt', isAutoGenerated: true },
    { sessionId: sess6!.id, languageCode: 'vi', vttR2Key: 'subtitles/ai-k01/s06/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy1!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy2!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy3!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s03/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy4!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s04/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy5!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s05/vi.vtt', isAutoGenerated: true },
    { sessionId: sessPy6!.id, languageCode: 'vi', vttR2Key: 'subtitles/py-k01/s06/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe1!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s01/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe2!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s02/vi.vtt', isAutoGenerated: true },
    { sessionId: sessSwe3!.id, languageCode: 'vi', vttR2Key: 'subtitles/swe-k01/s03/vi.vtt', isAutoGenerated: true },
  ]);

  // =========================================================================
  // 10. ASSESSMENTS & ASSESSMENT ITEMS (Session Quizzes + Final Exams)
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
    finalExamPyK01,
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
        dueAt: new Date('2026-05-08T16:59:59Z'),
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
        dueAt: new Date('2026-05-10T16:59:59Z'),
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
        dueAt: new Date('2026-05-15T16:59:59Z'),
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
        dueAt: new Date('2026-05-17T16:59:59Z'),
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
        dueAt: new Date('2026-05-22T16:59:59Z'),
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
        dueAt: new Date('2026-05-24T16:59:59Z'),
      },
      {
        cohortId: cohortAiK01!.id,
        sessionId: null,
        title: 'Kỳ thi Sát hạch Tốt nghiệp: Kỹ sư AI Thực chiến (Giám sát AI)',
        purpose: 'FINAL_EXAM',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 45,
        maxAttempts: 3,
        passScorePct: 70,
        proctoringConfig: { enabled: true, maxViolations: 3, snapshotIntervalSec: 30 },
        dueAt: new Date('2026-06-14T16:59:59Z'),
      },

      // --- PY-SQL-2026-K01 ---
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy1!.id,
        title: 'Trắc nghiệm Python Buổi 1: Cấu trúc Dữ liệu & Type Hints',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-10T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy2!.id,
        title: 'Trắc nghiệm Python Buổi 2: OOP, Pydantic & Kiểm thử Pytest',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-13T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy3!.id,
        title: 'Trắc nghiệm Python Buổi 3: AsyncIO & HTTP Connection Pool',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-17T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy4!.id,
        title: 'Trắc nghiệm Python Buổi 4: Thiết kế Quan hệ & Chỉ mục B-Tree',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-20T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy5!.id,
        title: 'Trắc nghiệm Python Buổi 5: CTE, Window Functions & JSONB',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-24T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: sessPy6!.id,
        title: 'Trắc nghiệm Python Buổi 6: Keyset Pagination & Tích hợp Hệ thống',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 10,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-05-27T16:59:59Z'),
      },
      {
        cohortId: cohortPyK01!.id,
        sessionId: null,
        title: 'Kỳ thi Tốt nghiệp: Lập trình Python & SQL Phân tích Thực chiến',
        purpose: 'FINAL_EXAM',
        gradingMode: 'AUTO',
        status: 'PUBLISHED',
        durationMinutes: 30,
        maxAttempts: 3,
        passScorePct: 70,
        proctoringConfig: { enabled: true, maxViolations: 3 },
        dueAt: new Date('2026-06-25T16:59:59Z'),
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
        dueAt: new Date('2026-05-30T16:59:59Z'),
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
        dueAt: new Date('2026-06-03T16:59:59Z'),
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
        dueAt: new Date('2026-06-06T16:59:59Z'),
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
        dueAt: new Date('2026-06-10T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe5!.id,
        title: 'Trắc nghiệm Backend Buổi 5: Bảo mật JWT RBAC & Docker Production',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'DRAFT',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-06-13T16:59:59Z'),
      },
      {
        cohortId: cohortSweK01!.id,
        sessionId: sessSwe6!.id,
        title: 'Trắc nghiệm Backend Buổi 6: Kiểm thử Chịu tải k6 & Kiến trúc Phân tán',
        purpose: 'SESSION_ASSIGNMENT',
        gradingMode: 'AUTO',
        status: 'DRAFT',
        durationMinutes: 12,
        maxAttempts: 5,
        passScorePct: 70,
        proctoringConfig: { enabled: false },
        dueAt: new Date('2026-06-17T16:59:59Z'),
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
        dueAt: new Date('2026-06-26T16:59:59Z'),
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
          'Streaming qua SSE giúp hiển thị từng cụm từ ngay khi sinh ra, giảm cảm giác chờ đợi xuống dưới 400ms cho token đầu tiên.',
      },
      {
        prompt:
          'Hàm nào trong thư viện `asyncio` cho phép chạy đồng thời nhiều coroutine và thu thập toàn bộ kết quả?',
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
          'Tại sao tìm kiếm thuần Dense Vector thường thất bại khi người dùng tra cứu các mã định danh chính xác như `"ERR_429_QUOTA"` hoặc tên hàm `"resolveCohort"`?',
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
          'Vì điểm Cosine Similarity nằm trong đoạn $[-1, 1]$ còn điểm BM25 không có chặn trên cố định; dùng thứ hạng giúp hợp nhất công bằng mà không cần chuẩn hóa phân phối điểm',
          'Vì ngôn ngữ SQL không hỗ trợ phép cộng số thực',
          'Để làm cho câu lệnh truy vấn chạy chậm hơn 10 lần',
          'Vì hằng số $k$ luôn bằng 0',
        ],
        correctIndex: 0,
        explanationMd:
          'RRF dựa trên thứ hạng tương đối của từng bộ truy xuất, giúp chống lại sự lệch thang đo giữa các thuật toán khác bản chất.',
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
          'Để đảm bảo an toàn phân quyền dữ liệu trong hệ thống RAG (ngăn khách vãng lai đọc được nội dung bài giảng nội bộ `ENROLLED_ONLY`), bộ lọc quyền truy cập phải được đặt ở đâu?',
        options: [
          'Đặt trực tiếp trong mệnh đề `WHERE` của câu truy vấn SQL (Pre-filtering) trước khi lấy các đoạn văn đưa vào ngữ cảnh của LLM',
          'Lấy toàn bộ dữ liệu mật đưa vào LLM rồi dặn LLM trong System Prompt là "Đừng tiết lộ cho người dùng"',
          'Chỉ ẩn bằng CSS `display: none` ở phía trình duyệt Frontend',
          'Không cần kiểm tra vì người dùng không biết tên bảng',
        ],
        correctIndex: 0,
        explanationMd:
          'Tuyệt đối không dựa vào Prompt để phân quyền dữ liệu; phải lọc cứng ở tầng cơ sở dữ liệu.',
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
          'Mô hình LLM tự mình mở kết nối trực tiếp vào cơ sở dữ liệu nội bộ để chạy lệnh SQL',
          'Mô hình LLM phân tích yêu cầu và sinh ra cấu trúc JSON chứa tên hàm cùng các tham số cần gọi; phần thực thi hàm thực tế do mã nguồn Backend kiểm soát và chạy',
          'Mô hình LLM tự động biên dịch lại hệ điều hành Linux của máy chủ',
          'Mô hình LLM thay thế hoàn toàn trình duyệt web của người dùng',
        ],
        correctIndex: 1,
        explanationMd:
          'LLM chỉ đóng vai trò quyết định gọi tool nào với đối số JSON gì; ứng dụng Backend mới là nơi kiểm tra quyền hạn, thực thi hàm và gửi kết quả trả về lại cho LLM.',
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
          'Luôn phải có điều kiện dừng cứng (`max_iterations`) trong vòng lặp của bộ điều phối Agent.',
      },
      {
        prompt:
          'Tính năng `Structured Outputs` (với `strict: true` trên JSON Schema) khắc phục triệt để hạn chế nào của việc nhắc LLM trả về JSON thông qua văn bản thông thường?',
        options: [
          'Đảm bảo 100% đầu ra tuân thủ đúng cấu trúc schema và kiểu dữ liệu đã khai báo nhờ cơ chế giới hạn token hợp lệ (Constrained Decoding)',
          'Giúp mô hình chạy không cần điện năng',
          'Tự động thiết kế giao diện CSS cho trang web',
          'Thay thế hoàn toàn ngôn ngữ lập trình Python',
        ],
        correctIndex: 0,
        explanationMd:
          'Constrained Decoding loại bỏ khả năng mô hình sinh thiếu dấu ngoặc hoặc sai tên trường JSON.',
      },
    ]
  );

  const sess5Items = buildSessionQuizItems(
    quizSess5!.id,
    5,
    'LLMOps, Ragas & Semantic Cache',
    skEval!.id,
    skRag!.id,
    [
      {
        prompt:
          'Trong bộ chỉ số đánh giá Ragas, chỉ số `Faithfulness` (Độ trung thực) đo lường khía cạnh nào của hệ thống RAG?',
        options: [
          'Mức độ mà các khẳng định trong câu trả lời của LLM được suy ra hoàn toàn từ các đoạn ngữ cảnh truy xuất được, không bịa đặt thêm thông tin ngoài nguồn (chống Hallucination)',
          'Tốc độ gõ phím của người dùng cuối',
          'Dung lượng bộ nhớ RAM của container Redis',
          'Số lượng ảnh đại diện trong cơ sở dữ liệu',
        ],
        correctIndex: 0,
        explanationMd:
          '`Faithfulness` tách câu trả lời thành từng mệnh đề nhỏ và kiểm tra xem mỗi mệnh đề có bằng chứng trong `retrieved_contexts` hay không.',
      },
      {
        prompt:
          'Nếu hệ thống RAG có điểm `Context Recall` rất thấp (dưới 0.45) nhưng `Faithfulness` vẫn cao, nguyên nhân gốc rễ nằm ở tầng nào?',
        options: [
          'Tầng Retrieval (bộ truy xuất hoặc chiến lược Chunking) đã bỏ sót các đoạn tài liệu chứa thông tin cần thiết để trả lời câu hỏi',
          'Do trình duyệt web dùng phông chữ không phù hợp',
          'Do cổng thanh toán ngân hàng bảo trì',
          'Do màn hình máy tính có độ phân giải thấp',
        ],
        correctIndex: 0,
        explanationMd:
          '`Context Recall` phản ánh khả năng tìm ra đầy đủ các thông tin chuẩn (ground truth) ở tầng Retrieval.',
      },
      {
        prompt:
          'Cơ chế `Semantic Caching` trên Redis khác với bộ nhớ đệm khóa-giá trị (Exact-match Key-Value Cache) truyền thống ở điểm nào?',
        options: [
          'So khớp độ tương đồng vector của câu hỏi mới với các câu hỏi đã lưu trước đó (ví dụ Cosine Similarity >= 0.94), giúp trả về ngay câu trả lời dù người dùng diễn đạt khác từ ngữ nhưng cùng ý nghĩa',
          'Chỉ lưu trữ được các con số nguyên nhỏ hơn 10',
          'Tự động xóa toàn bộ cơ sở dữ liệu sau mỗi 5 giây',
          'Bắt buộc người dùng phải gõ đúng từng dấu cách và chữ hoa chữ thường mới trúng cache',
        ],
        correctIndex: 0,
        explanationMd:
          'Semantic Cache phát hiện các câu hỏi tương đồng ngữ nghĩa để tái sử dụng kết quả, giảm 35%–50% chi phí gọi LLM.',
      },
      {
        prompt:
          'Khi thiết kế hàng rào bảo vệ (Guardrails) chống tấn công `Direct Prompt Injection`, giải pháp nào hiệu quả và thực tế nhất?',
        options: [
          'Kết hợp phân tách rõ System Instruction với dữ liệu đầu vào bằng thẻ đánh dấu, dùng bộ phân loại phát hiện ý định bẻ khóa ở đầu vào và kiểm tra tính hợp lệ đầu ra',
          'Tin tưởng tuyệt đối mọi văn bản do người dùng gửi lên',
          'Gửi kèm khóa bí mật `JWT_ACCESS_SECRET` vào trong mọi câu trả lời của chatbot',
          'Tắt toàn bộ tường lửa của máy chủ',
        ],
        correctIndex: 0,
        explanationMd:
          'Defense-in-Depth (Input Guardrail + Delimiter Isolation + Least-Privilege Tooling + Output Guardrail) là kiến trúc bảo mật chuẩn cho ứng dụng LLM.',
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
          'Trong kiến trúc triển khai hệ thống EdTech + AI của 3T Academy, tại sao cổng giao dịch chính (Node.js/TypeScript) và cụm dịch vụ AI (Python FastAPI) được tách thành hai dịch vụ độc lập giao tiếp qua REST/HTTP nội bộ?',
        options: [
          'Để cô lập tải tính toán nặng của AI/ML khỏi luồng giao dịch học vụ - thanh toán ACID, đồng thời tận dụng hệ sinh thái thư viện ML mạnh nhất của Python cùng độ an toàn kiểu của TypeScript',
          'Vì một máy chủ không thể cài đặt cả Node.js và Python cùng lúc',
          'Để bắt người dùng phải đăng nhập hai lần liên tiếp',
          'Để làm tăng độ trễ mạng lên tối đa',
        ],
        correctIndex: 0,
        explanationMd:
          'Kiến trúc tách biệt Core Transactional API và AI Microservice giúp từng tầng mở rộng quy mô độc lập.',
      },
      {
        prompt:
          'Khi đóng gói dịch vụ bằng `Multi-stage Dockerfile`, lợi ích quan trọng nhất của việc tách giai đoạn `builder` và giai đoạn `runner` (production image) là gì?',
        options: [
          'Loại bỏ trình biên dịch, công cụ build và devDependencies khỏi image chạy thực tế, giúp giảm kích thước image và thu hẹp bề mặt tấn công bảo mật',
          'Làm cho dung lượng image tăng lên gấp 5 lần',
          'Để lưu mật khẩu cơ sở dữ liệu trực tiếp vào lịch sử commit Git',
          'Để bỏ qua bước kiểm tra kiểu dữ liệu TypeScript',
        ],
        correctIndex: 0,
        explanationMd:
          'Multi-stage build giữ cho image Production gọn nhẹ, khởi động nhanh và an toàn.',
      },
      {
        prompt:
          'Quy trình cấp chứng chỉ tốt nghiệp tự động tại 3T Academy yêu cầu những điều kiện tiên quyết nào?',
        options: [
          'Hoàn thành 100% số buổi học (xem >= 80% thời lượng video VÀ đạt >= 70% bài kiểm tra mỗi buổi) VÀ vượt qua kỳ thi sát hạch cuối khóa (>= 70%) với trạng thái giám sát hợp lệ',
          'Chỉ cần đăng ký tài khoản miễn phí là nhận được chứng chỉ ngay',
          'Chỉ cần xem 1 phút của Buổi 1 mà không cần làm bất kỳ bài kiểm tra nào',
          'Chỉ cần bình luận 1 câu trong diễn đàn thảo luận',
        ],
        correctIndex: 0,
        explanationMd:
          'Chứng chỉ số kèm chữ ký xác thực HMAC-SHA256 chỉ được cấp khi học viên hoàn thành trọn vẹn lộ trình học tập và kỳ thi sát hạch.',
      },
      {
        prompt:
          'Sau khi học viên vượt qua kỳ thi sát hạch cuối khóa và được cấp chứng chỉ tốt nghiệp, hệ thống tự động cộng thêm quyền lợi gì vào hồ sơ năng lực của học viên?',
        options: [
          'Cộng thêm +4 lượt Phỏng vấn thử AI (Mock Interview Credits) để học viên luyện tập bảo vệ CV và phỏng vấn kỹ thuật trực tiếp với Hội đồng AI',
          'Xóa toàn bộ điểm kỹ năng đã tích lũy trước đó',
          'Khóa quyền truy cập vào video bài giảng của lớp học',
          'Đổi vai trò của học viên thành Quản trị viên hệ thống (ADMIN)',
        ],
        correctIndex: 0,
        explanationMd:
          'Mỗi chứng chỉ tốt nghiệp mở khóa +4 lượt phỏng vấn thử AI giúp học viên sẵn sàng ứng tuyển thực tế.',
      },
    ]
  );

  const finalExamAiItems = buildSessionQuizItems(
    finalExamAiK01!.id,
    6,
    'Sát hạch Tốt nghiệp Kỹ sư AI',
    skRag!.id,
    skTool!.id,
    [
      {
        skillId: skPython!.id,
        prompt:
          'Trong Python AsyncIO, vì sao việc sử dụng `asyncio.Semaphore(limit)` lại quan trọng khi chạy tác vụ tạo vector embedding hàng loạt (batch ingestion) cho 10.000 đoạn tài liệu?',
        options: [
          'Kiểm soát số lượng request gọi API đồng thời ở mức an toàn, tránh làm tràn hạn mức Rate Limit (HTTP 429) hoặc làm cạn kiệt socket mạng của hệ thống',
          'Tự động nén 10.000 đoạn tài liệu thành 1 ký tự duy nhất',
          'Biến mã nguồn Python thành câu lệnh SQL',
          'Tắt hoàn toàn cơ chế kiểm tra lỗi của trình thông dịch',
        ],
        correctIndex: 0,
        explanationMd: 'Semaphore giới hạn mức độ song song vừa khít với năng lực chịu tải của cổng API đích.',
      },
      {
        skillId: skFastApi!.id,
        prompt:
          'Khi thiết kế endpoint truyền phát phản hồi AI theo thời gian thực bằng FastAPI `StreamingResponse`, định dạng gói tin chuẩn của giao thức Server-Sent Events (SSE) yêu cầu mỗi sự kiện kết thúc bằng ký tự gì?',
        options: [
          'Bắt đầu bằng tiền tố `data: ` và kết thúc bằng hai ký tự xuống dòng liên tiếp `\\n\\n`',
          'Kết thúc bằng chuỗi `</html_end>`',
          'Bắt buộc phải mã hóa nhị phân MP4',
          'Không được phép chứa bất kỳ ký tự chữ cái nào',
        ],
        correctIndex: 0,
        explanationMd: 'Chuẩn SSE quy định mỗi khung sự kiện văn bản có dạng `data: <json_payload>\\n\\n`.',
      },
      {
        skillId: skSqlVec!.id,
        prompt:
          'Trong PostgreSQL `pgvector`, biểu thức nào tính điểm tương đồng Cosine (Cosine Similarity trong khoảng `[-1, 1]`, càng lớn càng giống nhau) từ toán tử khoảng cách Cosine `<=>`?',
        options: [
          '`1 - (embedding <=> query_vector)`',
          '`(embedding <=> query_vector) * 1000`',
          '`embedding <+> query_vector`',
          '`ABS(embedding)`',
        ],
        correctIndex: 0,
        explanationMd:
          'Vì `pgvector` định nghĩa `cosine_distance = 1 - cosine_similarity`, nên `cosine_similarity = 1 - (a <=> b)`.',
      },
      {
        skillId: skRag!.id,
        prompt:
          'Tại sao kiến trúc Two-Stage Retrieval (Bi-Encoder + BM25 RRF ở bước 1, Cross-Encoder Reranker ở bước 2) lại đạt được cả tốc độ lẫn độ chính xác cao?',
        options: [
          'Bước 1 dùng chỉ mục HNSW và GIN lọc nhanh hàng triệu bản ghi xuống Top 30 trong vài mili-giây; Bước 2 dùng Cross-Encoder chú ý chéo sâu trên Top 30 đó để chọn ra Top 5 chuẩn xác nhất',
          'Vì bước 1 xóa hết dữ liệu của bước 2',
          'Vì Cross-Encoder không cần sử dụng CPU hay GPU',
          'Vì hai bước chạy trên hai trình duyệt khác nhau',
        ],
        correctIndex: 0,
        explanationMd:
          'Sự kết hợp này tận dụng tốc độ $O(\\log N)$ của ANN/Inverted Index và độ chính xác Full Cross-Attention trên tập ứng viên nhỏ.',
      },
      {
        skillId: skTool!.id,
        prompt:
          'Khi định nghĩa công cụ (Tool) cho LLM bằng Pydantic v2, làm thế nào để giới hạn một tham số chỉ được nhận một trong các giá trị cố định như `"OPENING"`, `"ONGOING"`, `"COMPLETED"`?',
        options: [
          'Sử dụng kiểu `Literal["OPENING", "ONGOING", "COMPLETED"]` hoặc `Enum` để JSON Schema sinh ra trường `enum` chặt chẽ',
          'Dùng kiểu `Any` và hy vọng LLM tự đoán đúng',
          'Dùng kiểu `float`',
          'Không khai báo tham số đó trong model',
        ],
        correctIndex: 0,
        explanationMd:
          '`Literal` hoặc `Enum` tạo ràng buộc `enum` trong JSON Schema, buộc bộ giải mã chỉ chọn trong tập giá trị hợp lệ.',
      },
      {
        skillId: skLangGraph!.id,
        prompt:
          'Trong kiến trúc Multi-Agent kiểu Supervisor (Điều phối viên trung tâm), tác tử Supervisor có nhiệm vụ chính là gì?',
        options: [
          'Phân tích yêu cầu tổng thể, phân rã bài toán, quyết định giao việc cho tác tử chuyên trách phù hợp và tổng hợp kết quả cuối cùng',
          'Thay thế cơ sở dữ liệu PostgreSQL để lưu trữ file video MP4',
          'Tự động tắt máy tính của người dùng',
          'Chỉ làm nhiệm vụ đổi màu nền giao diện web',
        ],
        correctIndex: 0,
        explanationMd:
          'Supervisor đóng vai trò bộ định tuyến thông minh và kiểm soát luồng công việc giữa các Worker Agents.',
      },
      {
        skillId: skEval!.id,
        prompt:
          'Trong bộ khung đánh giá Ragas, sự khác biệt cốt lõi giữa `Context Precision` và `Answer Relevancy` là gì?',
        options: [
          '`Context Precision` đánh giá xem các đoạn tài liệu liên quan có được xếp ở những vị trí đầu tiên trong danh sách truy xuất hay không, còn `Answer Relevancy` đánh giá mức độ câu trả lời cuối cùng bám sát trọng tâm câu hỏi',
          'Hai chỉ số này có công thức giống hệt nhau 100%',
          '`Context Precision` đo tốc độ quạt tản nhiệt, còn `Answer Relevancy` đo dung lượng ổ cứng',
          'Cả hai chỉ dùng để chấm điểm giao diện đồ họa',
        ],
        correctIndex: 0,
        explanationMd:
          '`Context Precision` đo chất lượng xếp hạng của tầng Retrieval, trong khi `Answer Relevancy` đo chất lượng phản hồi của tầng Generation.',
      },
    ]
  );

  // --- PY-SQL-2026-K01 Session Quizzes (4 items each) ---
  const py1Items = buildSessionQuizItems(quizPy1!.id, 1, 'Python Data Structures & Type Hints', skPython!.id, skFastApi!.id, [
    {
      prompt: 'Sự khác biệt chính giữa `list` comprehension `[x*2 for x in range(1000000)]` và `generator` expression `(x*2 for x in range(1000000))` là gì?',
      options: ['Generator tính toán lười (lazy evaluation) từng phần tử khi lặp qua nên tiết kiệm bộ nhớ RAM vượt trội', 'List comprehension không thể chứa số nguyên', 'Generator tự động lưu dữ liệu vào ổ cứng', 'Hai biểu thức hoàn toàn giống hệt nhau về bộ nhớ'],
      correctIndex: 0,
      explanationMd: 'Generator sinh từng giá trị theo yêu cầu (`yield`) thay vì cấp phát toàn bộ mảng trong RAM.',
    },
    {
      prompt: 'Khai báo Type Hints `def fetch_user(user_id: int) -> dict[str, Any] | None:` trong Python 3.11+ mang lại lợi ích gì?',
      options: ['Giúp công cụ kiểm tra kiểu tĩnh (mypy/pyright), IDE và Pydantic hiểu rõ hợp đồng dữ liệu đầu vào/đầu ra', 'Làm cho hàm chạy nhanh gấp 100 lần trên GPU', 'Tự động tạo bảng trong PostgreSQL', 'Mã hóa biến `user_id`'],
      correctIndex: 0,
      explanationMd: 'Type Hints là nền tảng để phát hiện lỗi sớm và tích hợp với FastAPI/Pydantic.',
    },
    {
      prompt: 'Cấu trúc dữ liệu nào trong Python cho thời gian tra cứu phần tử `x in collection` trung bình đạt $O(1)$?',
      options: ['`set` và `dict` (dựa trên bảng băm Hash Table)', '`list` chưa sắp xếp', '`tuple`', '`str`'],
      correctIndex: 0,
      explanationMd: 'Bảng băm của `set` và `dict` giúp kiểm tra sự tồn tại của khóa trong thời gian hằng số $O(1)$.',
    },
    {
      prompt: 'Tại sao không nên dùng một danh sách khả biến làm giá trị mặc định trong định nghĩa hàm như `def add_item(item, bucket=[])`?',
      options: ['Vì đối tượng `bucket=[]` chỉ được khởi tạo 1 lần duy nhất lúc định nghĩa hàm và bị dùng chung xuyên suốt các lần gọi hàm sau đó', 'Vì Python báo lỗi cú pháp ngay lập tức', 'Vì danh sách không thể chứa chuỗi ký tự', 'Vì làm giảm độ sáng màn hình'],
      correctIndex: 0,
      explanationMd: 'Luôn dùng `bucket: list | None = None` rồi khởi tạo `if bucket is None: bucket = []` bên trong thân hàm.',
    },
  ]);

  const py2Items = buildSessionQuizItems(quizPy2!.id, 2, 'OOP, Pydantic & Pytest', skPython!.id, skFastApi!.id, [
    {
      prompt: 'Khi viết kiểm thử đơn vị với `pytest`, decorator nào giúp chạy cùng một hàm test với nhiều bộ dữ liệu đầu vào và kết quả kỳ vọng khác nhau?',
      options: ['`@pytest.mark.parametrize("input,expected", [...])`', '`@pytest.delete_all()`', '`@staticmethod`', '`@property`'],
      correctIndex: 0,
      explanationMd: '`@pytest.mark.parametrize` giúp kiểm thử bao phủ nhiều trường hợp biên mà không phải lặp lại mã nguồn.',
    },
    {
      prompt: 'Trong Pydantic `BaseModel`, điều gì xảy ra khi khởi tạo đối tượng với dữ liệu không thể ép kiểu hợp lệ?',
      options: ['Pydantic ném ra ngoại lệ `ValidationError` kèm danh sách chi tiết từng trường bị lỗi', 'Chương trình âm thầm bỏ qua và gán giá trị 0', 'Máy tính tự động khởi động lại', 'Pydantic xóa file mã nguồn'],
      correctIndex: 0,
      explanationMd: 'Kiểm tra dữ liệu đầu vào nghiêm ngặt ngay tại biên hệ thống giúp ngăn lỗi lan truyền sâu vào logic nghiệp vụ.',
    },
    {
      prompt: 'Mục đích của khối lệnh `try ... except ... finally` trong phần `finally` là gì?',
      options: ['Đảm bảo các tác vụ giải phóng tài nguyên luôn được thực thi bất kể có ngoại lệ xảy ra hay không', 'Chỉ chạy khi không có lỗi nào xảy ra', 'Để bỏ qua mọi lỗi cú pháp trong file', 'Để tăng tốc vòng lặp'],
      correctIndex: 0,
      explanationMd: 'Khối `finally` hoặc Context Manager (`with`) đảm bảo tài nguyên luôn được dọn dẹp an toàn.',
    },
    {
      prompt: 'Tại sao nên ưu tiên sử dụng Context Manager (`with open(...) as f:`) thay vì gọi `f.close()` thủ công?',
      options: ['Tự động đóng tài nguyên ngay khi thoát khỏi khối lệnh kể cả khi bên trong khối xảy ra ngoại lệ', 'Giúp file có dung lượng bằng 0 byte', 'Tự động dịch nội dung file sang tiếng Anh', 'Không cần quyền đọc file'],
      correctIndex: 0,
      explanationMd: 'Giao thức `__enter__` / `__exit__` bảo vệ hệ thống khỏi rò rỉ file descriptor và kết nối mạng.',
    },
  ]);

  const py3Items = buildSessionQuizItems(quizPy3!.id, 3, 'AsyncIO & HTTP API', skPython!.id, skFastApi!.id, [
    {
      prompt: 'Từ khóa `await` trong Python chỉ được phép đặt ở đâu?',
      options: ['Bên trong một hàm bất đồng bộ được khai báo bằng `async def`', 'Ở dòng đầu tiên của file `.env`', 'Bên trong câu lệnh SQL `SELECT`', 'Trong file cấu hình CSS'],
      correctIndex: 0,
      explanationMd: '`await` tạm dừng coroutine hiện tại để nhường quyền điều khiển cho Event Loop xử lý tác vụ khác trong lúc chờ I/O.',
    },
    {
      prompt: 'Khi gọi một hàm `async def fetch_data():` mà quên từ khóa `await`, giá trị trả về thực chất là gì?',
      options: ['Một đối tượng `coroutine` chưa được thực thi (kèm cảnh báo `RuntimeWarning: coroutine was never awaited`)', 'Kết quả JSON đã tải xong từ máy chủ', 'Một số nguyên ngẫu nhiên', 'Một kết nối PostgreSQL'],
      correctIndex: 0,
      explanationMd: 'Gọi hàm `async def` chỉ tạo ra đối tượng coroutine; phải `await` hoặc đưa vào `asyncio.gather` thì coroutine mới chạy.',
    },
    {
      prompt: 'Trong thư viện `httpx`, cách chuẩn xác để quản lý vòng đời `AsyncClient` khi tải dữ liệu từ nhiều trang API là gì?',
      options: ['Sử dụng `async with httpx.AsyncClient() as client:` và truyền `client` vào các tác vụ con chạy qua `asyncio.gather`', 'Tạo mới 1.000 `AsyncClient` không bao giờ đóng', 'Dùng `urllib` đồng bộ trong vòng lặp', 'Tắt card mạng'],
      correctIndex: 0,
      explanationMd: '`async with httpx.AsyncClient()` tái sử dụng Connection Pool và đóng toàn bộ socket sạch sẽ khi kết thúc khối.',
    },
    {
      prompt: 'Phương thức `response.raise_for_status()` của `httpx` có tác dụng gì?',
      options: ['Ném ngoại lệ `HTTPStatusError` ngay lập tức nếu mã trạng thái phản hồi là 4xx hoặc 5xx', 'Đổi mã lỗi 500 thành 200 OK', 'Xóa nội dung JSON trả về', 'Tự động nạp tiền vào tài khoản'],
      correctIndex: 0,
      explanationMd: 'Giúp phát hiện sớm các phản hồi lỗi HTTP thay vì cố gắng parse JSON từ trang báo lỗi.',
    },
  ]);

  const py4Items = buildSessionQuizItems(quizPy4!.id, 4, 'PostgreSQL Schema & Indexing', skSqlVec!.id, skPython!.id, [
    {
      prompt: 'Ràng buộc `FOREIGN KEY ... ON DELETE RESTRICT` trong PostgreSQL bảo vệ toàn vẹn dữ liệu như thế nào?',
      options: ['Ngăn không cho xóa bản ghi cha (ví dụ `courses`) nếu vẫn còn bản ghi con (ví dụ `cohorts`) đang tham chiếu tới nó', 'Tự động xóa toàn bộ các bảng trong database', 'Cho phép lưu các khóa ngoại trỏ tới ID không tồn tại', 'Tắt tính năng kiểm tra khóa chính'],
      correctIndex: 0,
      explanationMd: '`ON DELETE RESTRICT` bảo vệ dữ liệu nghiệp vụ quan trọng khỏi thao tác xóa nhầm.',
    },
    {
      prompt: 'Sự khác biệt giữa `INNER JOIN` và `LEFT JOIN` trong SQL là gì?',
      options: ['`INNER JOIN` chỉ giữ lại các dòng khớp ở cả hai bảng, còn `LEFT JOIN` giữ lại toàn bộ dòng của bảng bên trái và điền `NULL` cho các cột bảng phải nếu không có dòng khớp', 'Hai phép kết nối trả về kết quả giống hệt nhau trong mọi trường hợp', '`LEFT JOIN` xóa dữ liệu của bảng bên trái', '`INNER JOIN` chỉ dùng được cho kiểu chuỗi'],
      correctIndex: 0,
      explanationMd: '`LEFT JOIN` rất quan trọng khi thống kê danh sách học viên kể cả những học viên chưa có bài nộp nào (`COUNT(attempt.id) = 0`).',
    },
    {
      prompt: 'Khi nào PostgreSQL chọn thực hiện `Seq Scan` (quét tuần tự toàn bảng) thay vì dùng chỉ mục `B-Tree`?',
      options: ['Khi bảng rất nhỏ hoặc điều kiện lọc lấy ra tỷ lệ lớn số dòng trong bảng khiến đọc tuần tự nhanh hơn nhảy ngẫu nhiên qua chỉ mục', 'Vì PostgreSQL không bao giờ hỗ trợ chỉ mục B-Tree', 'Chỉ khi máy chủ bị mất điện', 'Khi câu lệnh có từ khóa `LIMIT 1`'],
      correctIndex: 0,
      explanationMd: 'Cost-based Optimizer của PostgreSQL luôn ước lượng chi phí I/O để chọn phương án thực thi tối ưu nhất.',
    },
    {
      prompt: 'Tại sao trong mệnh đề `GROUP BY`, mọi cột xuất hiện ở `SELECT` (ngoài các hàm tổng hợp `COUNT`, `SUM`, `AVG`) đều phải nằm trong `GROUP BY` hoặc phụ thuộc hàm vào khóa chính?',
      options: ['Để đảm bảo mỗi nhóm trả về một giá trị duy nhất, xác định rõ ràng cho từng cột hiển thị', 'Để làm câu lệnh dài hơn', 'Vì SQL không cho phép dùng hàm `COUNT`', 'Để tự động sắp xếp giảm dần'],
      correctIndex: 0,
      explanationMd: 'Nếu một cột không được gom nhóm và cũng không nằm trong hàm tổng hợp, hệ thống sẽ không biết chọn giá trị của dòng nào trong nhóm.',
    },
  ]);

  const py5Items = buildSessionQuizItems(quizPy5!.id, 5, 'CTE, Window Functions & JSONB', skSqlVec!.id, skPython!.id, [
    {
      prompt: 'Điểm khác biệt cốt lõi giữa hàm cửa sổ (`SUM(...) OVER (PARTITION BY ...)` - Window Function) và mệnh đề `GROUP BY` truyền thống là gì?',
      options: ['Window Function tính toán giá trị tổng hợp/xếp hạng trên tập dòng liên quan nhưng VẪN GIỮ NGUYÊN từng dòng chi tiết thay vì gộp thu gọn thành 1 dòng như `GROUP BY`', 'Window Function xóa toàn bộ các dòng trùng lặp', 'Window Function không thể dùng với kiểu số', '`GROUP BY` chạy trên trình duyệt còn Window Function chạy trên GPU'],
      correctIndex: 0,
      explanationMd: 'Window Functions cho phép vừa hiển thị chi tiết từng giao dịch vừa hiển thị tổng lũy kế hoặc thứ hạng ngay trên cùng một dòng.',
    },
    {
      prompt: 'Sự khác nhau giữa hai hàm xếp hạng `RANK()` và `DENSE_RANK()` khi có 2 học viên đồng hạng 1 là gì?',
      options: ['`RANK()` nhảy số thứ tự tiếp theo sang hạng 3 (1, 1, 3), trong khi `DENSE_RANK()` xếp hạng liên tục không bị khuyết bậc (1, 1, 2)', '`RANK()` báo lỗi nếu có điểm bằng nhau', '`DENSE_RANK()` luôn trả về số 0', 'Hai hàm hoàn toàn giống nhau'],
      correctIndex: 0,
      explanationMd: '`DENSE_RANK()` giữ cho dãy thứ hạng liền mạch không có khoảng trống sau các vị trí đồng hạng.',
    },
    {
      prompt: 'Để truy vấn hiệu năng cao các trường bên trong cột kiểu `JSONB` trên PostgreSQL (ví dụ toán tử chứa `@>`), loại chỉ mục nào phù hợp nhất?',
      options: ['Chỉ mục `GIN` (Generalized Inverted Index) trên cột `JSONB`', 'Không thể đánh chỉ mục cho cột JSONB', 'Chỉ mục `BRIN` trên cột văn bản', 'Lưu JSON dưới dạng ảnh PNG'],
      correctIndex: 0,
      explanationMd: 'Kiểu `JSONB` lưu trữ ở dạng nhị phân đã phân tách khóa-giá trị và hỗ trợ chỉ mục `GIN` giúp tra cứu cực nhanh.',
    },
    {
      prompt: 'Hàm cửa sổ `LAG(score_pct, 1) OVER (PARTITION BY account_id ORDER BY submitted_at)` dùng để giải quyết bài toán nào?',
      options: ['Lấy điểm số của lần làm bài liền trước đó của cùng một học viên để tính mức độ tiến bộ (`score_pct - prev_score`)', 'Xóa lần làm bài đầu tiên của học viên', 'Cộng điểm cho tất cả học viên trong lớp', 'Đổi tên tài khoản học viên'],
      correctIndex: 0,
      explanationMd: '`LAG` và `LEAD` cho phép truy cập trực tiếp dòng đứng trước hoặc đứng sau trong cửa sổ thời gian mà không cần Self-Join tốn kém.',
    },
  ]);

  const py6Items = buildSessionQuizItems(quizPy6!.id, 6, 'Python + PostgreSQL Integration', skPython!.id, skSqlVec!.id, [
    {
      prompt: 'Tại sao bắt buộc phải truyền tham số truy vấn qua Parameterized Query thay vì nối chuỗi f-string trực tiếp vào câu lệnh SQL?',
      options: ['Để ngăn chặn triệt để lỗ hổng bảo mật SQL Injection và giúp PostgreSQL tái sử dụng kế hoạch thực thi (Prepared Statement Plan)', 'Vì Python không hỗ trợ nối chuỗi', 'Để làm câu lệnh SQL chạy chậm hơn', 'Để tự động dịch tiếng Việt sang tiếng Anh'],
      correctIndex: 0,
      explanationMd: 'Parameterized Query tách biệt hoàn toàn cấu trúc lệnh SQL và dữ liệu đầu vào.',
    },
    {
      prompt: 'Lợi ích của việc sử dụng Connection Pool (như `pg.Pool` hoặc `asyncpg.create_pool`) trong ứng dụng Web là gì?',
      options: ['Duy trì sẵn một tập kết nối cơ sở dữ liệu để cấp phát tức thì cho các request, tránh chi phí mở/đóng tiến trình backend PostgreSQL mới cho mỗi truy vấn', 'Tự động tăng dung lượng ổ cứng máy chủ', 'Cho phép chạy SQL mà không cần mật khẩu', 'Xóa các bảng không dùng đến'],
      correctIndex: 0,
      explanationMd: 'Mỗi kết nối mới tới PostgreSQL cần cấp phát tiến trình riêng và bắt tay xác thực; Connection Pool giữ độ trễ ở mức vài mili-giây.',
    },
    {
      prompt: 'Trong giao dịch cơ sở dữ liệu (Transaction), nếu bước 1 trừ tiền thành công nhưng bước 2 ghi lịch sử gặp lỗi ngoại lệ, hệ thống cần thực hiện lệnh gì?',
      options: ['Thực hiện `ROLLBACK` để hoàn tác toàn bộ các thay đổi trong giao dịch đó về trạng thái nhất quán ban đầu', 'Thực hiện `COMMIT` một nửa và bỏ qua lỗi', 'Xóa bảng người dùng', 'Tắt máy chủ'],
      correctIndex: 0,
      explanationMd: 'Tính nguyên tử (Atomicity) trong ACID đảm bảo giao dịch chỉ thành công trọn vẹn hoặc không có gì thay đổi.',
    },
    {
      prompt: 'Khi phân trang danh sách hàng triệu bản ghi lịch sử giao dịch theo thời gian, tại sao Keyset Pagination (`WHERE id < $last_id ORDER BY id DESC LIMIT 20`) nhanh hơn `OFFSET 500000 LIMIT 20`?',
      options: ['Vì `OFFSET` lớn buộc cơ sở dữ liệu phải quét và đếm bỏ qua 500.000 dòng đầu tiên, còn Keyset Pagination nhảy thẳng tới vị trí cần lấy qua chỉ mục B-Tree', 'Vì `OFFSET` không phải là từ khóa hợp lệ trong SQL', 'Vì Keyset Pagination không cần chỉ mục', 'Vì `LIMIT` chỉ nhận số nhỏ hơn 5'],
      correctIndex: 0,
      explanationMd: 'Keyset (Cursor-based) Pagination giữ thời gian phản hồi ổn định $O(\\log N)$ ở mọi trang sâu.',
    },
  ]);

  const finalExamPyItems = buildSessionQuizItems(
    finalExamPyK01!.id,
    6,
    'Sát hạch Python & SQL Thực chiến',
    skPython!.id,
    skSqlVec!.id,
    [
      {
        skillId: skPython!.id,
        prompt: 'Trong Python, biểu thức nào sau đây tạo ra một từ điển (`dict`) ánh xạ mã kỹ năng sang tên kỹ năng từ danh sách `items`?',
        options: ['`{item.code: item.name for item in items}`', '`[item.code, item.name for item in items]`', '`set(items)`', '`tuple(items)`'],
        correctIndex: 0,
        explanationMd: 'Dict comprehension `{k: v for ...}` là cách ngắn gọn và hiệu quả nhất để xây dựng từ điển tra cứu nhanh.',
      },
      {
        skillId: skPython!.id,
        prompt: 'Khi chạy đồng thời 5 tác vụ mạng với `await asyncio.gather(*tasks, return_exceptions=True)`, tham số `return_exceptions=True` có tác dụng gì?',
        options: ['Nếu 1 tác vụ gặp ngoại lệ, đối tượng ngoại lệ đó được trả về trong danh sách kết quả thay vì làm hủy bỏ ngay lập tức 4 tác vụ đang chạy bình thường còn lại', 'Bỏ qua mọi kết quả thành công', 'Tự động sửa mọi lỗi mạng', 'Chuyển chương trình sang chạy đồng bộ'],
        correctIndex: 0,
        explanationMd: 'Giúp thu thập kết quả từng phần an toàn (Partial Success) khi gọi nhiều nguồn dữ liệu song song.',
      },
      {
        skillId: skSqlVec!.id,
        prompt: 'Trong PostgreSQL, câu lệnh nào dùng để xem chi tiết kế hoạch thực thi thực tế kèm thời gian chạy và số lượng khối bộ nhớ (buffers) đã đọc của một truy vấn?',
        options: ['`EXPLAIN (ANALYZE, BUFFERS) SELECT ...`', '`SHOW TABLES`', '`DESCRIBE DATABASE`', '`PRINT QUERY`'],
        correctIndex: 0,
        explanationMd: '`EXPLAIN (ANALYZE, BUFFERS)` thực thi câu lệnh và báo cáo chính xác thời gian thực tế tại từng nút.',
      },
      {
        skillId: skSqlVec!.id,
        prompt: 'Để tìm Top 3 học viên có điểm thi cao nhất trong TỪNG lớp học (`cohort_id`), cấu trúc truy vấn SQL nào chuẩn xác nhất?',
        options: ['Dùng CTE tính `DENSE_RANK() OVER (PARTITION BY cohort_id ORDER BY score_pct DESC) AS rk` rồi lọc `WHERE rk <= 3` ở truy vấn ngoài', 'Dùng `LIMIT 3` ở cuối câu lệnh không có `PARTITION BY`', 'Dùng `COUNT(*)`', 'Dùng `DELETE FROM enrollments`'],
        correctIndex: 0,
        explanationMd: 'Bài toán Top-N per Group kinh điển trong SQL được giải quyết gọn gàng bằng Window Function kết hợp CTE.',
      },
      {
        skillId: skFastApi!.id,
        prompt: 'Trong FastAPI, cơ chế `Depends(...)` (Dependency Injection) thường được dùng vào việc gì?',
        options: ['Tái sử dụng logic lấy phiên kết nối DB, xác thực người dùng từ JWT token và kiểm tra quyền hạn trước khi vào hàm xử lý chính', 'Để biên dịch code sang Java', 'Để xóa file log', 'Để thay thế HTML'],
        correctIndex: 0,
        explanationMd: 'Dependency Injection trong FastAPI giúp tách biệt logic xác thực/kết nối và dễ dàng override khi viết kiểm thử tự động.',
      },
    ]
  );

  // --- SWE-ARCH-2026-K01 Session Quizzes & Final Exam ---
  const swe1Items = buildSessionQuizItems(quizSwe1!.id, 1, 'Clean Layered Architecture & Zod', skNode!.id, skSysDesign!.id, [
    {
      prompt: 'Trong kiến trúc phân tầng Clean Layered Architecture (`Routes -> Services -> Repositories`), tầng `Service` chịu trách nhiệm chính về việc gì?',
      options: ['Thực thi quy tắc nghiệp vụ cốt lõi (Business Logic), điều phối giao dịch (Transaction) và gọi các Repository cần thiết mà không phụ thuộc trực tiếp vào đối tượng HTTP `req/res`', 'Chỉ viết mã CSS cho nút bấm', 'Quản lý cáp mạng vật lý', 'Lưu mật khẩu dạng văn bản thuần'],
      correctIndex: 0,
      explanationMd: 'Tách biệt Business Logic vào Service giúp dễ dàng kiểm thử độc lập và tái sử dụng ở cả HTTP API lẫn Background Worker.',
    },
    {
      prompt: 'Tại sao cần kiểm tra dữ liệu đầu vào bằng lược đồ `Zod` ngay tại tầng Middleware/Controller trước khi truyền xuống Service?',
      options: ['Đảm bảo nguyên tắc Fail-Fast: từ chối ngay các payload sai định dạng với thông báo lỗi HTTP 400 rõ ràng và cung cấp kiểu dữ liệu TypeScript an toàn cho các tầng bên dưới', 'Để làm tăng kích thước gói tin mạng', 'Vì TypeScript tự động kiểm tra kiểu dữ liệu lúc chạy (runtime) mà không cần thư viện', 'Để tắt tính năng xác thực'],
      correctIndex: 0,
      explanationMd: 'Kiểu của TypeScript bị xóa sau khi biên dịch sang JavaScript; Zod bổ sung lớp kiểm tra kiểu thực tế lúc runtime.',
    },
    {
      prompt: 'Mục đích của Global Error Handling Middleware (hàm 4 tham số `(err, req, res, next)`) trong Express là gì?',
      options: ['Tập trung toàn bộ việc bắt lỗi, ghi nhật ký kèm `correlationId` và chuẩn hóa cấu trúc phản hồi JSON đồng nhất trên toàn hệ thống', 'Để ẩn mọi lỗi và luôn trả về `200 OK` rỗng', 'Để khởi động lại máy chủ sau mỗi request', 'Để xóa cơ sở dữ liệu khi người dùng nhập sai mật khẩu'],
      correctIndex: 0,
      explanationMd: 'Chuẩn hóa phản hồi lỗi giúp Frontend xử lý nhất quán và không làm lộ stack trace nhạy cảm ra môi trường Production.',
    },
    {
      prompt: 'Khi ghi nhật ký hệ thống (Structured Logging với Pino), tại sao định dạng JSON một dòng lại được ưu tiên hơn nối chuỗi văn bản tự do?',
      options: ['Giúp các hệ thống thu thập log phân tích, đánh chỉ mục và lọc nhanh theo các trường `level`, `correlationId`, `accountId`, `latencyMs`', 'Vì JSON tốn ít ký tự hơn 1 chữ cái', 'Vì con người không đọc được chữ thường', 'Để làm đầy ổ cứng nhanh hơn'],
      correctIndex: 0,
      explanationMd: 'Structured JSON logs là tiêu chuẩn bắt buộc để giám sát và cảnh báo tự động trong hệ thống phân tán.',
    },
  ]);

  const swe2Items = buildSessionQuizItems(quizSwe2!.id, 2, 'EXPLAIN ANALYZE & PostgreSQL Tuning', skSqlVec!.id, skNode!.id, [
    {
      prompt: 'Lỗi hiệu năng `N+1 Query Problem` xảy ra trong tình huống nào?',
      options: ['Ứng dụng chạy 1 câu truy vấn lấy danh sách $N$ khóa học, sau đó đặt một vòng lặp `for` chạy thêm $N$ câu truy vấn riêng lẻ tới DB để lấy đợt học của từng khóa', 'Khi bảng có đúng 1 dòng dữ liệu', 'Khi sử dụng câu lệnh `JOIN` hoặc `WHERE ... IN (...)`', 'Khi đặt tên biến có chữ N'],
      correctIndex: 0,
      explanationMd: 'Khắc phục N+1 Query bằng cách gộp thành 1 truy vấn `JOIN` hoặc `WHERE course_id = ANY($1)` giúp giảm hàng trăm round-trips mạng xuống chỉ còn 1–2 lượt.',
    },
    {
      prompt: 'Chỉ mục một phần (`Partial Index` - ví dụ `CREATE INDEX ON orders (account_id) WHERE status = \'PENDING\'`) mang lại lợi ích gì?',
      options: ['Chỉ đánh chỉ mục trên tập con các dòng thỏa mãn điều kiện `WHERE`, giúp giảm đáng kể kích thước chỉ mục và tăng tốc độ ghi/cập nhật trên các dòng đã hoàn tất', 'Xóa các dòng có trạng thái `PAID`', 'Làm cho truy vấn chậm hơn', 'Không cho phép cập nhật cột `status`'],
      correctIndex: 0,
      explanationMd: 'Khi 95% đơn hàng trong lịch sử đã `PAID`/`EXPIRED` và ứng dụng thường xuyên tìm các đơn `PENDING`, Partial Index cực kỳ nhỏ gọn và nhanh.',
    },
    {
      prompt: 'Trong chỉ mục phức hợp `CREATE INDEX idx_enroll_acc_status ON enrollments (account_id, status)`, truy vấn nào sau đây tận dụng hiệu quả nhất chỉ mục này?',
      options: ['Truy vấn lọc theo `WHERE account_id = $1 AND status = $2` hoặc lọc theo cột đứng đầu `WHERE account_id = $1` (Leftmost Prefix Rule)', 'Truy vấn chỉ lọc theo `WHERE dropout_risk_score > 0.5`', 'Truy vấn bảng `categories`', 'Truy vấn không có mệnh đề `WHERE` và `ORDER BY`'],
      correctIndex: 0,
      explanationMd: 'Chỉ mục B-Tree nhiều cột tuân theo nguyên tắc tiền tố trái (Leftmost Prefix): cột có độ chọn lọc cao và hay tra cứu nhất nên đặt đứng đầu.',
    },
    {
      prompt: 'Thông số `Buffers: shared hit=120 read=0` trong kết quả `EXPLAIN (ANALYZE, BUFFERS)` cho biết điều gì?',
      options: ['Toàn bộ 120 trang dữ liệu (mỗi trang 8KB) đều được đọc trực tiếp từ bộ nhớ đệm RAM (`shared_buffers`) mà không phải đọc từ ổ cứng vật lý', 'Cơ sở dữ liệu không tìm thấy dòng nào', 'Ổ cứng bị hỏng hoàn toàn', 'Câu lệnh bị lỗi cú pháp'],
      correctIndex: 0,
      explanationMd: '`shared hit` cao và `read` (đọc đĩa) thấp chứng tỏ tập dữ liệu nóng (working set) và chỉ mục đã nằm gọn trong RAM.',
    },
  ]);

  const swe3Items = buildSessionQuizItems(quizSwe3!.id, 3, 'ACID, Locking & Idempotent Webhook', skSysDesign!.id, skSqlVec!.id, [
    {
      prompt: 'Tại sao cổng nhận thông báo thanh toán tự động (`POST /api/v1/webhooks/sepay`) bắt buộc phải thiết kế đảm bảo tính **Idempotency** (bất biến khi gọi lặp lại)?',
      options: ['Vì cổng thanh toán ngân hàng có cơ chế Retry gửi lại cùng một thông báo giao dịch khi mạng chập chờn; hệ thống phải đảm bảo không kích hoạt ghi danh kép hoặc cộng trùng doanh thu', 'Để cho phép một biên lai chuyển khoản mua được 100 khóa học khác nhau', 'Để bỏ qua bước kiểm tra số tiền chuyển khoản', 'Để xóa đơn hàng ngay khi nhận tiền'],
      correctIndex: 0,
      explanationMd: 'Sử dụng khóa duy nhất `gateway_txn_id` kết hợp kiểm tra trạng thái đơn hàng bên trong giao dịch ACID giúp xử lý an toàn mọi bản tin webhook gửi trùng.',
    },
    {
      prompt: 'Câu lệnh `SELECT * FROM orders WHERE id = $1 FOR UPDATE` bên trong một giao dịch SQL có tác dụng gì?',
      options: ['Đặt khóa bi quan cấp độ dòng (Row-level Exclusive Lock), buộc các giao dịch đồng thời khác muốn sửa dòng đơn hàng này phải chờ tới khi giao dịch hiện tại `COMMIT` hoặc `ROLLBACK`', 'Xóa dòng đơn hàng đó ngay lập tức', 'Cho phép mọi người sửa dòng đó cùng lúc mà không kiểm tra', 'Đổi mật khẩu cơ sở dữ liệu'],
      correctIndex: 0,
      explanationMd: '`SELECT ... FOR UPDATE` ngăn chặn triệt để lỗi Race Condition khi hai tiến trình cùng xử lý một đơn hàng tại cùng một mili-giây.',
    },
    {
      prompt: 'Nếu khách hàng chuyển khoản số tiền `6.000.000 đ` cho đơn hàng có học phí `6.800.000 đ`, hệ thống đối soát Webhook của 3T Academy xử lý như thế nào?',
      options: ['Ghi nhận bản ghi giao dịch vào bảng `payment_transactions` với trạng thái `AMOUNT_MISMATCH` để lưu bằng chứng kiểm toán và giữ nguyên trạng thái đơn hàng `PENDING` chờ xử lý', 'Vẫn tự động kích hoạt khóa học như bình thường', 'Xóa tài khoản của học viên', 'Làm sập máy chủ API'],
      correctIndex: 0,
      explanationMd: 'Mọi biến động tiền tệ đều phải được ghi log bất biến vào `payment_transactions` kèm `match_status` rõ ràng để đối soát tài chính.',
    },
    {
      prompt: 'Khi giao dịch thanh toán khớp thành công 100% số tiền và mã đơn, những thao tác nào cần được thực hiện nguyên tử (Atomic) trong cùng một `db.transaction`?',
      options: ['Lưu `payment_transactions (MATCHED)` -> Cập nhật `orders (PAID)` -> Tạo bản ghi `enrollments (ACTIVE)` -> Tăng `cohorts.enrolled_count + 1` -> Tạo thông báo cho học viên', 'Chỉ gửi email rồi tắt máy', 'Chỉ đổi màu giao diện mà không lưu vào database', 'Xóa lớp học'],
      correctIndex: 0,
      explanationMd: 'Gói toàn bộ chuỗi cập nhật trạng thái đơn hàng, ghi danh và sĩ số lớp vào 1 giao dịch ACID đảm bảo dữ liệu không bao giờ bị lệch.',
    },
  ]);

  const swe4Items = buildSessionQuizItems(quizSwe4!.id, 4, 'Redis Caching & BullMQ', skSysDesign!.id, skNode!.id, [
    {
      prompt: 'Trong mẫu thiết kế `Cache-Aside` với Redis, trình tự xử lý khi có yêu cầu đọc dữ liệu diễn ra như thế nào?',
      options: ['Kiểm tra Redis trước; nếu trúng (Cache Hit) thì trả về ngay, nếu trượt (Cache Miss) thì đọc từ PostgreSQL rồi lưu bản sao vào Redis kèm TTL trước khi trả kết quả', 'Luôn xóa toàn bộ Redis trước mỗi lần đọc', 'Chỉ ghi vào Redis mà không bao giờ lưu vào PostgreSQL', 'Đọc đồng thời từ 10 cơ sở dữ liệu khác nhau'],
      correctIndex: 0,
      explanationMd: 'Cache-Aside là mô hình phổ biến và an toàn nhất để giảm tải đọc cho PostgreSQL.',
    },
    {
      prompt: 'Hiện tượng `Cache Stampede` (Thundering Herd) xảy ra khi nào và cách phòng tránh đơn giản là gì?',
      options: ['Khi một khóa cache rất nóng vừa hết hạn khiến hàng nghìn request đồng thời cùng bị Cache Miss và ập xuống đánh sập DB; phòng tránh bằng cách cộng thêm độ lệch ngẫu nhiên vào TTL (TTL Jitter) hoặc dùng khóa Singleflight/Mutex', 'Khi ổ cứng còn trống quá nhiều', 'Khi chỉ có 1 người dùng truy cập trang web', 'Khi đặt mật khẩu Redis dài hơn 8 ký tự'],
      correctIndex: 0,
      explanationMd: 'TTL Jitter và khóa tái tạo cache giúp bảo vệ cơ sở dữ liệu khi lưu lượng tăng đột biến.',
    },
    {
      prompt: 'Tại sao các tác vụ nặng như trích xuất văn bản PDF, băm nhỏ tài liệu và gọi API tạo vector embedding nên được đẩy vào hàng đợi bất đồng bộ (Background Queue) thay vì chạy trực tiếp trong luồng HTTP upload?',
      options: ['Để trả phản hồi nhanh cho người dùng, tránh lỗi HTTP Request Timeout và cho phép Worker tự động thử lại (Retry) khi dịch vụ bên ngoài gặp sự cố tạm thời', 'Để làm mất dữ liệu của người dùng', 'Vì giao thức HTTP không truyền được file PDF', 'Để bắt người dùng chờ 2 tiếng trên trình duyệt'],
      correctIndex: 0,
      explanationMd: 'Tách các tác vụ I/O hoặc tính toán kéo dài sang Background Worker giữ cho cổng API luôn phản hồi mượt mà.',
    },
    {
      prompt: 'Khi giảng viên hoặc quản trị viên cập nhật thông tin khóa học trong PostgreSQL, bước nào cần thực hiện đối với Redis Cache?',
      options: ['Chủ động xóa (Invalidate / `DEL`) các khóa cache danh mục liên quan để người dùng không đọc phải dữ liệu cũ (Stale Data)', 'Tắt dịch vụ PostgreSQL', 'Đổi cổng mạng của máy chủ', 'Không làm gì cả và chờ 10 năm sau cache tự hết hạn'],
      correctIndex: 0,
      explanationMd: 'Explicit Cache Invalidation ngay sau khi cập nhật DB kết hợp TTL hợp lý giúp cân bằng giữa hiệu năng và tính tươi mới của dữ liệu.',
    },
  ]);

  const swe5Items = buildSessionQuizItems(quizSwe5!.id, 5, 'JWT RBAC & Docker Production', skNode!.id, skDocker!.id, [
    {
      prompt: 'Tại sao hệ thống xác thực hiện đại thường kết hợp `Access Token` có thời hạn ngắn (15 phút) với `Refresh Token` có thời hạn dài hơn (7 ngày)?',
      options: ['Giới hạn cửa sổ rủi ro nếu Access Token bị lộ, đồng thời cho phép thu hồi phiên đăng nhập (Revoke) hoặc xoay vòng (Rotation) thông qua kiểm soát Refresh Token', 'Để bắt người dùng gõ lại mật khẩu sau mỗi 30 giây', 'Vì thư viện JWT không tạo được token dài hơn 15 phút', 'Để làm tăng dung lượng bảng khóa học'],
      correctIndex: 0,
      explanationMd: 'Kiến trúc Dual-Token cân bằng giữa hiệu năng xác thực Stateless và khả năng thu hồi quyền truy cập kịp thời.',
    },
    {
      prompt: 'Middleware phân quyền `requireRole("INSTRUCTOR", "ADMIN")` phải được đặt ở vị trí nào trong chuỗi xử lý route của Express?',
      options: ['Đặt ngay sau middleware xác thực JWT (`requireAuth`) và trước hàm Controller xử lý nghiệp vụ', 'Đặt sau khi đã xóa xong dữ liệu trong DB', 'Chỉ đặt ở file HTML tĩnh', 'Không cần gắn vào route nào cả'],
      correctIndex: 0,
      explanationMd: '`requireAuth` giải mã danh tính `req.user`, sau đó `requireRole` kiểm tra `req.user.role` trước khi cho phép đi vào Controller.',
    },
    {
      prompt: 'Tại sao trong Dockerfile Production cho ứng dụng Node.js/Python nên chuyển sang chạy bằng tài khoản không có quyền root (`USER node` hoặc `USER appuser`)?',
      options: ['Tuân thủ nguyên tắc Đặc quyền tối thiểu (Least Privilege), ngăn kẻ tấn công chiếm quyền điều khiển toàn bộ hệ thống tệp của container nếu ứng dụng có lỗ hổng', 'Để ứng dụng chạy tốn nhiều RAM hơn', 'Vì Docker cấm tài khoản root', 'Để xóa mã nguồn'],
      correctIndex: 0,
      explanationMd: 'Chạy tiến trình với non-root user là tiêu chuẩn bảo mật bắt buộc trong vận hành container.',
    },
    {
      prompt: 'Cơ chế `Rate Limiting` (giới hạn tốc độ gọi API theo IP hoặc theo User ID) trên các endpoint nhạy cảm như `/auth/login` giúp ngăn chặn cuộc tấn công nào?',
      options: ['Tấn công dò mật khẩu vét cạn (Brute-force / Credential Stuffing) và tấn công làm cạn kiệt tài nguyên (DoS)', 'Lỗi sai màu sắc nút bấm', 'Lỗi thiếu dấu chấm phẩy trong TypeScript', 'Lỗi tràn ổ cứng của màn hình'],
      correctIndex: 0,
      explanationMd: 'Rate Limiting chặn đứng các kịch bản tự động thử hàng nghìn mật khẩu mỗi phút.',
    },
  ]);

  const swe6Items = buildSessionQuizItems(quizSwe6!.id, 6, 'Load Testing & Distributed Systems', skSysDesign!.id, skDocker!.id, [
    {
      prompt: 'Khi đánh giá kết quả kiểm thử chịu tải (Load Testing với k6), tại sao chỉ số độ trễ phân vị thứ 95 và 99 (`p95`, `p99` latency) lại quan trọng hơn độ trễ trung bình cộng (`average`)?',
      options: ['Vì giá trị trung bình dễ bị che mờ bởi các request nhanh, trong khi `p95`/`p99` cho biết trải nghiệm thực tế của nhóm 1%–5% yêu cầu chậm nhất đang gặp nghẽn cổ chai', 'Vì phép tính trung bình cộng không tồn tại trong toán học', 'Vì `p95` luôn bằng 0ms', 'Vì k6 không tính được số trung bình'],
      correctIndex: 0,
      explanationMd: 'Trong hệ thống lớn, việc kiểm soát Tail Latency (`p95`, `p99`) quyết định sự ổn định của toàn chuỗi dịch vụ.',
    },
    {
      prompt: 'Khi tiến trình máy chủ nhận tín hiệu dừng (`SIGTERM`) từ Docker/Kubernetes trong lúc triển khai phiên bản mới, quy trình **Graceful Shutdown** chuẩn cần làm gì?',
      options: ['Ngừng nhận kết nối HTTP mới, chờ các request đang xử lý dở hoàn tất (trong khoảng timeout), đóng sạch Connection Pool của PostgreSQL và Redis rồi mới thoát tiến trình', 'Ngắt nguồn điện ngay lập tức làm đứt toàn bộ giao dịch đang chạy', 'Xóa toàn bộ bảng dữ liệu trước khi tắt', 'Tạo thêm 100 tiến trình con'],
      correctIndex: 0,
      explanationMd: 'Graceful Shutdown đảm bảo triển khai Zero-Downtime mà không làm rơi bất kỳ giao dịch nào của người dùng.',
    },
    {
      prompt: 'Mẫu thiết kế `Circuit Breaker` (Cầu dao tự ngắt) khi gọi dịch vụ bên thứ ba có tác dụng gì?',
      options: ['Khi tỷ lệ lỗi từ dịch vụ đích vượt ngưỡng, cầu dao mở ra để trả về phản hồi dự phòng ngay lập tức mà không tiếp tục gửi request chờ timeout gây hiệu ứng sập dây chuyền (Cascading Failure)', 'Tự động sửa phần cứng máy chủ đối tác', 'Tăng gấp đôi hóa đơn tiền điện', 'Xóa khóa API'],
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

  // =========================================================================
  // 11. KNOWLEDGE CHUNKS (Public FAQ + Course-Scoped Enrolled Lecture Chunks)
  // =========================================================================
  const rawKnowledgeChunks = [
    // --- PUBLIC CHUNKS (Used ONLY by Career/Course Advisor — NO deep lecture secrets) ---
    {
      visibility: 'PUBLIC' as const,
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: 1,
      contentHash: 'hash-pub-ai-overview-01',
      startSec: null,
      endSec: null,
      pageNumber: null,
      content:
        'Khóa học "Kỹ sư AI Thực chiến: RAG, Agents & LLMOps" (mã đợt đang mở: AI-ENG-2026-K01) gồm 6 buổi chuyên sâu. Lịch học tối Thứ 3 và Thứ 5 (19:30 - 21:30), do TS. Lê Minh Khoa trực tiếp giảng dạy. Phù hợp cho lập trình viên đã biết Python và SQL cơ bản muốn chuyển sang làm AI Engineer.',
    },
    {
      visibility: 'PUBLIC' as const,
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: 2,
      contentHash: 'hash-pub-ai-syllabus-02',
      startSec: null,
      endSec: null,
      pageNumber: null,
      content:
        'Lộ trình 6 buổi của khóa Kỹ sư AI Thực chiến (AI-ENG-2026-K01): Buổi 1 (FastAPI & Python AsyncIO), Buổi 2 (Chunking & Vector DB pgvector), Buổi 3 (Hybrid Search & Reranking), Buổi 4 (Function Calling & ReAct Agent), Buổi 5 (Đánh giá Ragas & LLMOps), Buổi 6 (Bảo vệ đồ án & Thi sát hạch).',
    },
    {
      visibility: 'PUBLIC' as const,
      courseId: courseSwe!.id,
      cohortId: cohortSweK01!.id,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: 1,
      contentHash: 'hash-pub-swe-overview-01',
      startSec: null,
      endSec: null,
      pageNumber: null,
      content:
        'Khóa học "Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems" (mã đợt đang mở: SWE-ARCH-2026-K01) do ThS. Nguyễn Thu Hà giảng dạy vào tối Thứ 4 và Chủ Nhật (19:30 - 21:30). Trọng tâm lộ trình: Clean Layered Architecture, tối ưu truy vấn PostgreSQL, giao dịch ACID & Webhook thanh toán, Redis Caching, bảo mật JWT/Docker và kiểm thử chịu tải.',
    },
    {
      visibility: 'PUBLIC' as const,
      courseId: courseData!.id,
      cohortId: cohortDataK01!.id,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: 1,
      contentHash: 'hash-pub-data-overview-01',
      startSec: null,
      endSec: null,
      pageNumber: null,
      content:
        'Khóa học "Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse" (mã đợt đang mở: DATA-PIPE-2026-K01) học chiều Thứ 7 và Chủ Nhật (14:00 - 16:30) cùng ThS. Nguyễn Thu Hà. Dành cho học viên muốn làm chủ đường ống dữ liệu lớn với Apache Spark, Kafka, dbt Lakehouse và đồng bộ dữ liệu cho AI.',
    },
    {
      visibility: 'PUBLIC' as const,
      courseId: coursePython!.id,
      cohortId: cohortPyK01!.id,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: 1,
      contentHash: 'hash-pub-py-overview-01',
      startSec: null,
      endSec: null,
      pageNumber: null,
      content:
        'Khóa học nền tảng "Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI" (mã đợt đang mở: PY-SQL-2026-K01) học tối Thứ 2 và Thứ 5 (19:30 - 21:30) do TS. Lê Minh Khoa phụ trách. Rất phù hợp cho người mới bắt đầu hoặc trái ngành muốn xây nền tảng Python 3.11, OOP, Pytest, AsyncIO và truy vấn SQL phân tích trên PostgreSQL trước khi lên các khóa AI hoặc Data chuyên sâu.',
    },

    // --- ENROLLED_ONLY CHUNKS: Course 1 (AI-ENG-2026-K01) ---
    {
      visibility: 'ENROLLED_ONLY' as const,
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
        'Trong môi trường Production, cổng AI Gateway viết bằng FastAPI bắt buộc phải sử dụng cơ chế bất đồng bộ hoàn toàn với httpx.AsyncClient và asyncio.Semaphore. Nếu gọi hàm đồng bộ như time.sleep hoặc requests.post bên trong async def, toàn bộ Event Loop của tiến trình worker sẽ bị nghẽn. Để truyền phát câu trả lời theo thời gian thực qua Server-Sent Events (SSE), dùng StreamingResponse với media_type="text/event-stream" giúp giảm Time To First Token (TTFT) xuống dưới 400ms.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
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
        'Chiến lược băm tài liệu hai tầng kết hợp MarkdownHeaderTextSplitter và RecursiveCharacterTextSplitter với độ chồng lấp chunk_overlap từ 10% đến 15% giúp bảo toàn ngữ cảnh tiêu đề chương mục. Trên PostgreSQL pgvector, chỉ mục HNSW được tạo với vector_cosine_ops (m = 16, ef_construction = 64) và truy vấn bằng toán tử khoảng cách Cosine (<=>).',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      sessionId: sess3!.id,
      attachmentId: attS3Slide!.id,
      sourceType: 'ATTACHMENT_DOC',
      chunkIndex: 1,
      contentHash: 'hash-s3-chunk-02',
      startSec: 1420,
      endSec: 2100,
      pageNumber: 14,
      content:
        'Thuật toán Hybrid Search kết hợp Dense Vector (pgvector) và tìm kiếm từ khóa BM25 (tsvector/GIN) thông qua công thức Reciprocal Rank Fusion: RRF_Score(d) = 1 / (k + rank_dense(d)) + 1 / (k + rank_bm25(d)) với hằng số làm mượt k = 60. Sau khi lấy Top 30 ứng viên từ RRF, mô hình Cross-Encoder Reranker chấm điểm lại cặp (câu hỏi, đoạn văn) để chọn ra Top 5 chính xác nhất. Luôn áp dụng Pre-filtering RBAC ngay trong mệnh đề WHERE của SQL.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
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
        'Trong cơ chế Function Calling và vòng lặp ReAct Agent (Thought -> Action -> Observation), mô hình LLM sinh cấu trúc JSON tuân theo lược đồ Pydantic v2. Nếu bắt được ngoại lệ ValidationError, hãy đóng gói lỗi gửi trả lại vào tool message để mô hình tự sửa tham số (Self-Correction), đồng thời giới hạn cứng max_iterations = 4 bước.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
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
        'Bộ khung đánh giá Ragas đo lường chất lượng hệ thống RAG qua 4 chỉ số: Context Precision và Context Recall (đánh giá tầng Retrieval), Faithfulness (độ trung thực chống ảo giác) và Answer Relevancy (đánh giá tầng Generation). Kết hợp Semantic Cache trên Redis với ngưỡng tương đồng Cosine >= 0.94 giúp tiết kiệm 35%–50% chi phí token.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: courseAi!.id,
      cohortId: cohortAiK01!.id,
      sessionId: sess6!.id,
      attachmentId: attS6Slide!.id,
      sourceType: 'ATTACHMENT_DOC',
      chunkIndex: 1,
      contentHash: 'hash-s6-chunk-02',
      startSec: 1600,
      endSec: 2300,
      pageNumber: 16,
      content:
        'Tổng duyệt kiến trúc Production AI và quy chế thi sát hạch cuối khóa: tách biệt dịch vụ giao dịch Node.js/TypeScript và AI Microservice FastAPI, đóng gói bằng Multi-stage Dockerfile. Học viên hoàn thành 6/6 buổi học và vượt qua kỳ thi >= 70% sẽ nhận chứng chỉ số ký xác thực HMAC-SHA256 kèm +4 lượt phỏng vấn thử AI.',
    },

    // --- ENROLLED_ONLY CHUNKS: Course 2 (SWE-ARCH-2026-K01) ---
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: courseSwe!.id,
      cohortId: cohortSweK01!.id,
      sessionId: sessSwe1!.id,
      attachmentId: attSwe1Slide!.id,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-swe-s1-chunk-01',
      startSec: 240,
      endSec: 900,
      pageNumber: 8,
      content:
        'Trong kiến trúc Clean Layered Architecture (Routes -> Services -> Repositories), tầng Controller chỉ điều phối HTTP và kiểm tra dữ liệu đầu vào bằng lược đồ Zod (Fail-Fast), tầng Service chứa toàn bộ quy tắc nghiệp vụ cốt lõi và điều phối Transaction, còn tầng Repository đóng gói truy vấn Drizzle ORM. Mọi request đều gắn X-Correlation-ID và ghi log JSON qua Pino.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: courseSwe!.id,
      cohortId: cohortSweK01!.id,
      sessionId: sessSwe2!.id,
      attachmentId: attSwe2Slide!.id,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-swe-s2-chunk-01',
      startSec: 360,
      endSec: 1080,
      pageNumber: 12,
      content:
        'Khi tối ưu PostgreSQL với EXPLAIN (ANALYZE, BUFFERS), cần chú ý chỉ số shared hit (đọc từ RAM) và read (đọc từ đĩa). Khắc phục triệt để lỗi N+1 Query bằng JOIN hoặc WHERE IN, áp dụng Leftmost Prefix Rule cho Composite B-Tree Index và dùng Partial Index (ví dụ WHERE status = PENDING) để thu nhỏ kích thước chỉ mục.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: courseSwe!.id,
      cohortId: cohortSweK01!.id,
      sessionId: sessSwe3!.id,
      attachmentId: attSwe3Slide!.id,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-swe-s3-chunk-01',
      startSec: 420,
      endSec: 1200,
      pageNumber: 15,
      content:
        'Khi tích hợp cổng thanh toán SePay VietQR Webhook, bắt buộc sử dụng giao dịch ACID kết hợp khóa bi quan SELECT ... FOR UPDATE trên dòng đơn hàng và ràng buộc UNIQUE(gateway_txn_id) trên bảng payment_transactions để đảm bảo tính Idempotency tuyệt đối, chống cộng tiền kép hoặc kích hoạt ghi danh trùng lặp khi ngân hàng gửi lại webhook.',
    },

    // --- ENROLLED_ONLY CHUNKS: Course 4 (PY-SQL-2026-K01) ---
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: coursePython!.id,
      cohortId: cohortPyK01!.id,
      sessionId: sessPy1!.id,
      attachmentId: attPy1Slide!.id,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-py-s1-chunk-01',
      startSec: 180,
      endSec: 780,
      pageNumber: 7,
      content:
        'Trong Python 3.11+, Generator expression (x*2 for x in items) sử dụng cơ chế tính toán lười (lazy evaluation qua từ khóa yield) giúp tiết kiệm bộ nhớ RAM vượt trội so với List comprehension khi xử lý tập dữ liệu lớn. Cấu trúc dict và set dựa trên bảng băm (Hash Table) cho tốc độ tra cứu phần tử trung bình đạt O(1).',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: coursePython!.id,
      cohortId: cohortPyK01!.id,
      sessionId: sessPy2!.id,
      attachmentId: null,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-py-s2-chunk-01',
      startSec: 300,
      endSec: 920,
      pageNumber: 10,
      content:
        'Khi lập trình hướng đối tượng và kiểm thử với Pytest, sử dụng Context Manager (with open(...) as f) để đảm bảo tài nguyên luôn được giải phóng an toàn, và dùng decorator @pytest.mark.parametrize để chạy kiểm thử tự động qua nhiều bộ dữ liệu biên mà không lặp lại code.',
    },
    {
      visibility: 'ENROLLED_ONLY' as const,
      courseId: coursePython!.id,
      cohortId: cohortPyK01!.id,
      sessionId: sessPy3!.id,
      attachmentId: null,
      sourceType: 'VIDEO_TRANSCRIPT',
      chunkIndex: 1,
      contentHash: 'hash-py-s3-chunk-01',
      startSec: 400,
      endSec: 1100,
      pageNumber: 14,
      content:
        'Trong truy vấn SQL phân tích trên PostgreSQL, các hàm cửa sổ (Window Functions như RANK, DENSE_RANK, LAG, SUM OVER PARTITION BY) tính toán giá trị xếp hạng hoặc tổng lũy kế nhưng vẫn giữ nguyên từng dòng chi tiết thay vì gom gộp như GROUP BY. Kết hợp CTE (WITH ...) và Keyset Pagination (WHERE id < last_id) giúp truy vấn dữ liệu lớn nhanh và rõ ràng.',
    },
  ];

  const insertedKnowledgeChunks = await db
    .insert(knowledgeChunks)
    .values(
      rawKnowledgeChunks.map((ch) => ({
        ...ch,
        embedding: computeSemanticEmbedding1024(ch.content),
      }))
    )
    .returning();

  // =========================================================================
  // 12. CROSS-TABLE SEED CONSISTENCY SELF-AUDIT
  // =========================================================================
  const insertedSubtitles = await db.select().from(sessionSubtitles);
  const insertedCohorts = await db.select().from(cohorts);
  const insertedAssessments = await db.select().from(assessments);

  const consistencyViolations = findSeedConsistencyViolations({
    cohorts: insertedCohorts.map((c) => ({
      id: c.id,
      code: c.code,
      enrolledCount: c.enrolledCount,
      scheduleSlots: c.scheduleSlots as Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
    })),
    enrollments: [],
    certificates: [],
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
    progress: [],
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
    attempts: [],
    answers: [],
    proctoringEvents: [],
    knowledgeChunks: insertedKnowledgeChunks.map((ch) => ({
      sessionId: ch.sessionId,
      sourceType: ch.sourceType,
    })),
    profiles: insertedProfiles.map((p) => ({
      accountId: p.accountId,
      interviewCredits: p.interviewCredits,
      cvParsedData: (p.cvParsedData ?? {}) as Record<string, unknown>,
    })),
    mockInterviews: [],
    skillStates: [], 
  });

  if (consistencyViolations.length > 0) {
    logger.error({ violations: consistencyViolations }, 'Seed consistency check failed');
    throw new Error(`Seed consistency check failed:\n- ${consistencyViolations.join('\n- ')}`);
  }

  logger.info(
    'Minimal 3T Academy database seed completed & verified (5 accounts, 4 courses, 4 cohorts @ 10,000 VND, 24 sessions, 0 enrollments/orders/certificates)!'
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
