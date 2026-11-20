import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { db as defaultDb, pool } from './index.js';
import { runMigrations } from './migrate.js';
import { env } from '../config/env.js';
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
  orders,
  paymentTransactions,
  enrollments,
  sessionProgress,
  courseReviews,
  certificates,
  discussionThreads,
  discussionPosts,
  notifications,
  assessments,
  assessmentItems,
  assessmentAttempts,
  submissionAnswers,
  proctoringEvents,
  knowledgeChunks,
  studentSkillStates,
  chatSessions,
  chatMessages,
  mockInterviews,
  systemSettings,
} from './schema/index.js';
import {
  buildAttemptDraftAndAnswerBuilders,
  buildSessionQuizItems,
  computeSemanticEmbedding1024,
  findSeedConsistencyViolations,
  makeDeterministicVector,
  sha256Hex,
  type SeedQuestionBase,
} from './seedHelpers.js';
import { computeProgressiveSkillMastery } from '../modules/assessment/skillMasteryModel.js';

export { makeDeterministicVector, computeSemanticEmbedding1024 };

interface CourseTopicQuestionSeed {
  sessionOrder: number;
  topic: string;
  primarySkillId: number;
  secondarySkillId: number;
  questions: SeedQuestionBase[];
  chunkContent: string;
  attachmentFileName: string;
}

export async function runSeed(db: typeof defaultDb = defaultDb) {
  logger.info(
    'Starting clean, deterministic 32-table 3T Academy seed (10,000 VND tuition, end-to-end flow consistent)...'
  );

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
  // 1. SYSTEM SETTINGS (Table 1/32)
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
      description: 'Số lần cảnh báo vi phạm tối đa trước khi đánh dấu hậu kiểm bài thi cuối khóa',
      isPublic: false,
    },
    {
      key: 'ACADEMY_FAQS',
      value: JSON.stringify([
        {
          id: 'faq-1',
          question: 'Hình thức học tại 3T Academy là học trực tiếp cùng giảng viên hay xem video thu sẵn?',
          answer:
            'Tại 3T Academy, bạn học trực tuyến tương tác trực tiếp (Live) cùng giảng viên vào các khung giờ cố định (2 buổi/tuần). Sau mỗi buổi học, bản ghi MP4 chất lượng cao kèm phụ đề và slide sẽ được cập nhật để bạn chủ động ôn tập bất cứ lúc nào.',
        },
        {
          id: 'faq-2',
          question: 'Nếu hôm đó mình bận việc đột xuất không vào lớp kịp thì có bị mất bài không?',
          answer:
            'Hoàn toàn không. Ngay sau khi ca học kết thúc, bạn có thể xem lại toàn bộ video bài giảng, tải tài liệu và hỏi trực tiếp Trợ giảng AI ngay cạnh khung video để được giải thích theo đúng mốc thời gian giảng viên đã giảng.',
        },
        {
          id: 'faq-3',
          question: 'Mình mới bắt đầu hoặc trái ngành thì nên chọn khóa học nào trước?',
          answer:
            'Nếu bạn mới làm quen với lập trình hoặc muốn củng cố nền tảng, bạn nên bắt đầu từ khóa Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI, sau đó tiến lên các khóa chuyên sâu Kỹ sư AI Thực chiến, Kiến trúc Backend Chuyên sâu hoặc Kỹ sư Dữ liệu Hiện đại.',
        },
        {
          id: 'faq-4',
          question: 'Điều kiện để hoàn thành mỗi buổi học và nhận chứng chỉ tốt nghiệp là gì?',
          answer:
            'Mỗi buổi học được đánh dấu hoàn thành khi bạn làm đạt tối thiểu 70% bài Quiz kiểm tra năng lực cuối buổi. Khi hoàn thành trọn vẹn 6/6 buổi học của đợt học và vượt qua Kỳ thi sát hạch cuối khóa (đạt từ 70% trở lên, không vi phạm quy chế giám sát AI Proctoring), hệ thống tự động cấp Chứng chỉ tốt nghiệp xác thực chữ ký số HMAC và QR trực tuyến.',
        },
        {
          id: 'faq-5',
          question: 'Tính năng Hồ sơ năng lực (CV) và Luyện phỏng vấn 1-1 cùng AI hoạt động như thế nào?',
          answer:
            'Tài khoản mới đăng ký có mặc định 0 lượt phỏng vấn AI. Ngay khi bạn đăng ký thành công một đợt học chính thức, hệ thống cấp ngay 4 lượt Luyện phỏng vấn giọng nói 1-1 hai vòng (Vòng 1 rà soát CV theo JD, Vòng 2 phỏng vấn chuyên môn cùng AI) và đồng bộ kỹ năng/chứng chỉ đạt được vào Hồ sơ năng lực.',
        },
        {
          id: 'faq-6',
          question: 'Mình đăng ký lớp học và thanh toán học phí như thế nào?',
          answer:
            'Bạn chọn đợt học đang mở tuyển sinh và quét mã VietQR trên ứng dụng ngân hàng để hoàn tất học phí. Ngay khi SePay xác nhận giao dịch khớp mã đơn, phòng học và 4 lượt phỏng vấn AI được mở khóa tự động.',
        },
      ]),
      description: 'Danh sách câu hỏi thường gặp công khai tại trang Về học viện',
      isPublic: true,
    },
  ]);

  // =========================================================================
  // 2. CATEGORIES & SKILLS TAXONOMY (Tables 2–3/32)
  // =========================================================================
  const [catAi, catSwe, catData, catProg] = await db
    .insert(categories)
    .values([
      {
        name: 'Trí tuệ nhân tạo & AI',
        slug: 'ai-llm-engineering',
        description:
          'Xây dựng hệ thống RAG thực chiến, Multi-Agent Workflows, Function Calling và triển khai LLMOps lên Production.',
      },
      {
        name: 'Lập trình Backend & Hệ thống',
        slug: 'software-system-architecture',
        description:
          'Thiết kế kiến trúc Backend phân tán, tối ưu PostgreSQL/Redis, Idempotent Webhook và vận hành hệ thống chịu tải cao.',
      },
      {
        name: 'Kỹ thuật Dữ liệu',
        slug: 'data-engineering-analytics',
        description:
          'Xây dựng Data Pipeline thời gian thực và xử lý dữ liệu lớn với Python, SQL nâng cao, Apache Spark, Kafka và dbt Lakehouse.',
      },
      {
        name: 'Lập trình Nền tảng',
        slug: 'core-programming-sql',
        description:
          'Nền tảng lập trình Python hiện đại, Type Hints, OOP, xử lý bất đồng bộ (AsyncIO) và truy vấn SQL phân tích chuyên sâu.',
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
          'Làm chủ Python 3.11+, Type Hints, Generator, Pytest và lập trình bất đồng bộ với asyncio/httpx.',
      },
      {
        categoryId: catAi!.id,
        code: 'HYBRID_RAG',
        name: 'Kiến trúc Hybrid RAG & Vector DB',
        description:
          'Thiết kế pipeline Chunking, Embedding, kết hợp Dense Vector (pgvector HNSW) + BM25 RRF và Reranking.',
      },
      {
        categoryId: catAi!.id,
        code: 'TOOL_CALLING',
        name: 'Function Calling & Agentic Workflows',
        description:
          'Xây dựng AI Agent gọi công cụ an toàn với JSON Schema, Pydantic v2 và vòng lặp suy luận ReAct.',
      },
      {
        categoryId: catSwe!.id,
        code: 'NODE_TS',
        name: 'Backend TypeScript & Clean Architecture',
        description:
          'Xây dựng RESTful API chuẩn công nghiệp với Node.js, TypeScript, Express, Drizzle ORM và Zod.',
      },
      {
        categoryId: catSwe!.id,
        code: 'DOCKER_CI',
        name: 'Docker, CI/CD & Triển khai Production',
        description:
          'Đóng gói Multi-stage Dockerfile, Docker Compose, Healthcheck, bảo mật JWT/RBAC và kiểm thử tự động.',
      },
      {
        categoryId: catData!.id,
        code: 'SQL_VECTOR',
        name: 'Tối ưu PostgreSQL & pgvector',
        description:
          'Thiết kế lược đồ chuẩn hóa, giao dịch ACID, CTE, Window Functions, chỉ mục B-Tree/GIN và HNSW.',
      },
      {
        categoryId: catAi!.id,
        code: 'FASTAPI_ARCH',
        name: 'Kiến trúc FastAPI & Pydantic v2',
        description:
          'Xây dựng cổng dịch vụ AI tốc độ cao với FastAPI, Dependency Injection và SSE streaming.',
      },
      {
        categoryId: catAi!.id,
        code: 'LANGGRAPH_AGENT',
        name: 'Multi-Agent Orchestration & Memory',
        description:
          'Điều phối hệ thống đa tác tử, quản lý bộ nhớ hội thoại dài hạn và cơ chế tự kiểm chứng.',
      },
      {
        categoryId: catSwe!.id,
        code: 'SYSTEM_DESIGN',
        name: 'Thiết kế Hệ thống Phân tán & Caching',
        description:
          'Áp dụng Redis Caching, Rate Limiting, Idempotent Webhook, Pessimistic Locking và Message Queue.',
      },
      {
        categoryId: catData!.id,
        code: 'SPARK_KAFKA',
        name: 'Xử lý Dữ liệu Lớn với Spark & Kafka',
        description:
          'Xây dựng luồng xử lý Streaming và Batch với Apache Kafka Consumer Group và PySpark Structured Streaming.',
      },
      {
        categoryId: catData!.id,
        code: 'DBT_WAREHOUSE',
        name: 'Data Modeling & Analytics với dbt',
        description:
          'Thiết kế Star Schema, kiến trúc Medallion Bronze-Silver-Gold và kiểm định chất lượng dữ liệu tự động.',
      },
      {
        categoryId: catAi!.id,
        code: 'EVAL_GUARDRAILS',
        name: 'LLMOps, Ragas Evaluation & Guardrails',
        description:
          'Đo lường Faithfulness, Answer Relevancy, Context Precision với Ragas và phòng chống Prompt Injection.',
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

  const skillNamesById = new Map(insertedSkills.map((s) => [s.id, s.name]));

  // =========================================================================
  // 3. ACCOUNTS & IDENTITIES (Tables 4–5/32) — 6 Canonical Personas
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
        lastLoginAt: new Date('2026-11-18T02:00:00Z'),
      },
      {
        email: 'khoa.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-11-18T02:15:00Z'),
      },
      {
        email: 'ha.instructor@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
        lastLoginAt: new Date('2026-11-18T02:20:00Z'),
      },
      {
        email: 'an.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-02T08:00:00Z'),
        createdAt: new Date('2026-01-02T08:00:00Z'),
        lastLoginAt: new Date('2026-11-18T02:30:00Z'),
      },
      {
        email: 'mai.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-10-20T08:00:00Z'),
        createdAt: new Date('2026-10-20T08:00:00Z'),
        lastLoginAt: new Date('2026-11-17T14:00:00Z'),
      },
      {
        email: 'nam.student@3t.edu.vn',
        passwordHash: defaultPasswordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-11-15T09:00:00Z'),
        createdAt: new Date('2026-11-15T09:00:00Z'),
        lastLoginAt: new Date('2026-11-18T01:45:00Z'),
      },
    ])
    .returning();

  const [adminAcc, instKhoaAcc, instHaAcc, stuAnAcc, stuMaiAcc, stuNamAcc] = insertedAccounts;

  await db.insert(accountIdentities).values([
    ...insertedAccounts.map((acc) => ({
      accountId: acc.id,
      provider: 'LOCAL' as const,
      providerUid: `local-${acc.email}`,
      providerEmail: acc.email,
    })),
    {
      accountId: stuAnAcc!.id,
      provider: 'GOOGLE' as const,
      providerUid: 'google-oauth2-an-student-3t',
      providerEmail: stuAnAcc!.email,
    },
  ]);

  // =========================================================================
  // 4. INSTRUCTOR PROFILES (Table 6/32)
  // =========================================================================
  await db.insert(instructorProfiles).values([
    {
      accountId: instKhoaAcc!.id,
      headline: 'Principal AI Architect · Tiến sĩ Khoa học Máy tính',
      organization: 'Học viện Công nghệ 3T Academy',
      yearsOfExperience: 11,
      expertiseSummaryMd:
        'Chuyên gia thiết kế kiến trúc Hybrid RAG, Multi-Agent Orchestration, Python AsyncIO và LLMOps quy mô doanh nghiệp.',
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
        'Chuyên gia tối ưu cơ sở dữ liệu PostgreSQL, thiết kế hệ thống phân tán chịu tải cao và Data Lakehouse với Spark/Kafka/dbt.',
      socialLinks: {
        github: 'https://github.com/nguyenthuha-arch',
        linkedin: 'https://linkedin.com/in/nguyenthuha-arch',
      },
    },
  ]);

  // =========================================================================
  // 5. COURSES & COURSE SKILLS (Tables 8–9/32)
  // =========================================================================
  const [courseAi, courseSwe, courseData, coursePython] = await db
    .insert(courses)
    .values([
      {
        categoryId: catAi!.id,
        title: 'Kỹ sư AI Thực chiến: RAG, Agents & LLMOps',
        slug: 'ky-su-ai-thuc-chien-rag-agents-llmops',
        shortDescription:
          'Làm chủ kiến trúc Hybrid RAG (pgvector + BM25 RRF), Multi-Agent Orchestration, Function Calling và triển khai AI Production.',
        descriptionMd:
          'Chương trình đào tạo chuyên sâu thiết kế hệ thống Production AI: từ FastAPI SSE Gateway, Hybrid RAG kết hợp pgvector HNSW và tsvector RRF, Function Calling với Pydantic v2 đến đánh giá tự động bằng Ragas và bảo mật Guardrails.',
        thumbnailUrl: '/assets/aistudio/image_087a245c.png',
        difficultyLevel: 2,
        status: 'PUBLISHED',
        embedding: computeSemanticEmbedding1024(
          'Kỹ sư AI Thực chiến Hybrid RAG pgvector BM25 RRF Multi-Agent Function Calling FastAPI Ragas LLMOps'
        ),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Kiến trúc AI Production & Xử lý Bất đồng bộ với FastAPI / SSE',
            description: 'Thiết kế cổng LLM Gateway chịu tải cao, quản lý timeout/retry và streaming SSE.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Chiến lược Chunking Đa tầng & Chỉ mục Vector HNSW trên pgvector',
            description: 'Thiết kế lược đồ tài liệu phân quyền và cấu hình chỉ mục HNSW m, ef_construction.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Thuật toán Hybrid Search (Dense + BM25) & Reciprocal Rank Fusion (RRF)',
            description: 'Kết hợp pgvector cosine và PostgreSQL tsvector với RRF k=60 và Cross-Encoder Rerank.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 4,
            title: 'Function Calling, Structured Outputs & Điều phối ReAct Agent',
            description: 'Kiểm soát đầu ra JSON Schema bằng Pydantic v2 và giới hạn vòng lặp suy luận Agent.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 5,
            title: 'LLMOps: Đánh giá Hệ thống RAG với Ragas, Guardrails & Semantic Cache',
            description: 'Đo lường Faithfulness, Context Precision và phòng chống Prompt Injection.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Bảo vệ Đồ án Hệ thống AI & Tổng ôn Kiến trúc Cuối khóa',
            description: 'Rà soát kiến trúc End-to-End, tối ưu chi phí suy luận và chuẩn bị thi sát hạch.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catSwe!.id,
        title: 'Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems',
        slug: 'kien-truc-backend-chuyen-sau-typescript-postgresql-distributed-systems',
        shortDescription:
          'Xây dựng Backend chịu tải cao với Node.js/TypeScript, Drizzle ORM, giao dịch ACID, Idempotent Webhook và Redis/BullMQ.',
        descriptionMd:
          'Làm chủ kiến trúc phân tầng Clean Architecture, tối ưu Execution Plan PostgreSQL, khóa đồng thời Pessimistic/Optimistic Locking cho cổng thanh toán SePay Webhook và hệ thống hàng đợi Redis.',
        thumbnailUrl: '/assets/aistudio/image_2a72f9f9.png',
        difficultyLevel: 2,
        status: 'PUBLISHED',
        embedding: computeSemanticEmbedding1024(
          'Kiến trúc Backend Chuyên sâu TypeScript Node.js Express Drizzle ORM PostgreSQL ACID Idempotent Webhook Redis BullMQ Docker'
        ),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Clean Layered Architecture & Kiểm soát Hợp đồng API với TypeScript / Zod',
            description: 'Tổ chức module tách biệt Controller-Service-Repository và chuẩn hóa xử lý lỗi.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Tối ưu Truy vấn PostgreSQL với EXPLAIN ANALYZE & Partial / GIN Index',
            description: 'Phân tích kế hoạch thực thi, loại bỏ N+1 Query và thiết kế chỉ mục thực chiến.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Giao dịch ACID, Khóa SELECT FOR UPDATE & Idempotent Payment Webhook',
            description: 'Đảm bảo đối soát giao dịch ngân hàng bất biến, chống cộng tiền kép khi nhận webhook lặp.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 4,
            title: 'Chiến lược Caching Đa tầng với Redis & Hàng đợi Bất đồng bộ',
            description: 'Triển khai Cache-Aside, chống Cache Stampede và xử lý tác vụ nền an toàn.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'Bảo mật API (JWT, RBAC, Rate Limiting) & Đóng gói Docker Production',
            description: 'Phân quyền chặt chẽ theo vai trò/sở hữu tài nguyên và đóng gói Multi-stage Docker.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Kiểm thử Chịu tải (Load Testing) & Tổng kết Kiến trúc Phân tán',
            description: 'Đo kiểm độ trễ p95/p99, xử lý điểm nghẽn cổ chai và tổng kết đồ án.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catData!.id,
        title: 'Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse',
        slug: 'ky-su-du-lieu-hien-dai-streaming-kafka-pyspark-lakehouse',
        shortDescription:
          'Thiết kế hạ tầng Data Pipeline thời gian thực và xử lý dữ liệu lớn với Apache Kafka, PySpark, dbt và Data Lakehouse.',
        descriptionMd:
          'Trang bị năng lực xây dựng đường ống dữ liệu doanh nghiệp theo kiến trúc Medallion (Bronze-Silver-Gold), xử lý luồng sự kiện Kafka, tối ưu PySpark chống Data Skew và mô hình hóa kho dữ liệu với dbt.',
        thumbnailUrl: '/assets/aistudio/image_cae9b584.png',
        difficultyLevel: 3,
        status: 'PUBLISHED',
        embedding: computeSemanticEmbedding1024(
          'Kỹ sư Dữ liệu Hiện đại Data Engineering Streaming Apache Kafka PySpark dbt Medallion Lakehouse Star Schema'
        ),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Kiến trúc Data Lakehouse & Mô hình Medallion (Bronze, Silver, Gold)',
            description: 'Thiết kế đường ống dữ liệu bền vững, Idempotent Ingestion và Data Governance.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Xử lý Dữ liệu Phân tán Quy mô lớn với Apache Spark & PySpark',
            description: 'Hiểu sâu Spark DAG, Narrow vs Wide Transformation, Partitioning và xử lý Data Skew.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Thu thập & Xử lý Luồng Sự kiện Thời gian thực với Apache Kafka',
            description: 'Thiết kế Topic Partition, Consumer Group, Offset Commit và Spark Structured Streaming.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 4,
            title: 'Analytics Engineering: Chuẩn hóa Kho Dữ liệu Star Schema với dbt',
            description: 'Xây dựng Fact/Dimension models, Incremental Materialization và Data Quality Tests.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'Đồng bộ Feature Store & Vector Store từ tầng Gold cho Hệ thống AI',
            description: 'Kết nối đường ống Lakehouse cấp dữ liệu sạch theo lịch cho PostgreSQL pgvector.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 6,
            title: 'Bảo vệ Đồ án Data Pipeline End-to-End & Tổng ôn Cuối khóa',
            description: 'Giám sát SLA đường ống dữ liệu, xử lý Backfill và chuẩn bị thi sát hạch.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
      {
        categoryId: catProg!.id,
        title: 'Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI',
        slug: 'lap-trinh-python-sql-thuc-chien-cho-ky-su-du-lieu-ai',
        shortDescription:
          'Xây dựng nền tảng cốt lõi vững chắc về Python hiện đại (Type Hints, OOP, Pytest, AsyncIO) và SQL phân tích trên PostgreSQL.',
        descriptionMd:
          'Khóa học nền tảng chuẩn kỹ sư: rèn luyện Python sạch với Type Hints, Generator, kiểm thử tự động Pytest, lập trình bất đồng bộ AsyncIO/httpx và truy vấn SQL phân tích chuyên sâu (JOIN, CTE, Window Functions, JSONB).',
        thumbnailUrl: '/assets/aistudio/image_d79fa6f8.png',
        difficultyLevel: 1,
        status: 'PUBLISHED',
        embedding: computeSemanticEmbedding1024(
          'Lập trình Python SQL Thực chiến nền tảng Type Hints Generator OOP Pytest AsyncIO PostgreSQL CTE Window Functions'
        ),
        syllabusTemplate: [
          {
            order: 1,
            title: 'Tư duy Python Hiện đại: Cấu trúc Dữ liệu, Type Hints & Generator',
            description: 'Tối ưu bộ nhớ với Generator/Iterator, Comprehension và kiểm tra kiểu tĩnh.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 2,
            title: 'Lập trình Hướng đối tượng (OOP), Xử lý Ngoại lệ & Kiểm thử với Pytest',
            description: 'Thiết kế module sạch, chuẩn hóa dữ liệu đầu vào và viết Unit Test với Pytest fixture.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 3,
            title: 'Lập trình Bất đồng bộ (AsyncIO) & Thu thập Dữ liệu qua HTTP API',
            description: 'Làm chủ Event Loop, asyncio.gather, Semaphore giới hạn tải và httpx.AsyncClient.',
            activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          },
          {
            order: 4,
            title: 'Thiết kế CSDL Quan hệ, Ràng buộc Toàn vẹn & Truy vấn JOIN trên PostgreSQL',
            description: 'Chuẩn hóa 3NF, khóa ngoại, giao dịch cơ bản và gom nhóm GROUP BY / HAVING.',
            activityTags: ['THEORY', 'LIVE_CODING'],
          },
          {
            order: 5,
            title: 'SQL Phân tích Nâng cao: CTE, Window Functions & Truy vấn JSONB',
            description: 'Ứng dụng ROW_NUMBER, DENSE_RANK, LAG/LEAD và Keyset Pagination hiệu năng cao.',
            activityTags: ['LIVE_CODING', 'WORKSHOP'],
          },
          {
            order: 6,
            title: 'Ứng dụng Tổng hợp Python + PostgreSQL Connection Pool & Tổng kết',
            description: 'Kết nối Python bất đồng bộ với PostgreSQL, chống SQL Injection và hoàn thiện dự án.',
            activityTags: ['WORKSHOP', 'EXERCISE_REVIEW'],
          },
        ],
      },
    ])
    .returning();

  await db.insert(courseSkills).values([
    { courseId: courseAi!.id, skillId: skPython!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skRag!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseAi!.id, skillId: skTool!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseAi!.id, skillId: skFastApi!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skLangGraph!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    { courseId: courseAi!.id, skillId: skEval!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: courseSwe!.id, skillId: skNode!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseSwe!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.1 },
    { courseId: courseSwe!.id, skillId: skSysDesign!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseSwe!.id, skillId: skDocker!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: courseData!.id, skillId: skPython!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
    { courseId: courseData!.id, skillId: skSparkKafka!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseData!.id, skillId: skDbt!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: courseData!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },

    { courseId: coursePython!.id, skillId: skPython!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
    { courseId: coursePython!.id, skillId: skSqlVec!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
  ]);

  // =========================================================================
  // 6. COHORTS (Table 10/32) — All 10,000 VND for real VietQR SePay testing
  // =========================================================================
  const [cohortPyK01, cohortAiK01, cohortAiK02, cohortSweK01, cohortDataK01] = await db
    .insert(cohorts)
    .values([
      {
        courseId: coursePython!.id,
        code: 'PY-SQL-2026-K01',
        name: 'Khóa K01 · Python & SQL Thực chiến (Đã tốt nghiệp)',
        instructorId: instKhoaAcc!.id,
        curriculumVersion: 'v2026.1',
        techStackNotes: 'Python 3.12 · AsyncIO · httpx · Pytest · PostgreSQL 16',
        tuitionVnd: 10000,
        maxSeats: 35,
        enrolledCount: 1, // An (COMPLETED)
        enrollmentOpenAt: new Date('2025-12-15T00:00:00Z'),
        startDate: '2026-01-05',
        endDate: '2026-01-25',
        scheduleSlots: [
          { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
        replayExpiresAt: new Date('2027-06-30T23:59:59Z'),
        status: 'COMPLETED',
      },
      {
        courseId: courseAi!.id,
        code: 'AI-ENG-2026-K01',
        name: 'Khóa K01 · Kỹ sư AI Thực chiến (Đang học T3 & T6)',
        instructorId: instKhoaAcc!.id,
        curriculumVersion: 'v2026.1',
        techStackNotes: 'Python 3.12 · FastAPI · PostgreSQL pgvector · Pydantic v2 · Ragas',
        tuitionVnd: 10000,
        maxSeats: 35,
        enrolledCount: 2, // An (ACTIVE) + Mai (ACTIVE)
        enrollmentOpenAt: new Date('2026-10-10T00:00:00Z'),
        startDate: '2026-11-03',
        endDate: '2026-11-28',
        scheduleSlots: [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 5, startTime: '19:30', endTime: '21:30' },
        ],
        replayExpiresAt: new Date('2027-11-30T23:59:59Z'),
        status: 'ONGOING',
      },
      {
        courseId: courseAi!.id,
        code: 'AI-ENG-2026-K02',
        name: 'Khóa K02 · Kỹ sư AI Thực chiến (Mở tuyển sinh T12/2026)',
        instructorId: instKhoaAcc!.id,
        curriculumVersion: 'v2026.2',
        techStackNotes: 'Python 3.12 · FastAPI · Hybrid RAG RRF · Multi-Agent LangGraph · Guardrails',
        tuitionVnd: 10000,
        maxSeats: 30,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-11-01T00:00:00Z'),
        startDate: '2026-12-02',
        endDate: '2026-12-22',
        scheduleSlots: [
          { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
        ],
        replayExpiresAt: new Date('2027-12-31T23:59:59Z'),
        status: 'OPENING',
      },
      {
        courseId: courseSwe!.id,
        code: 'SWE-ARCH-2026-K01',
        name: 'Khóa K01 · Kiến trúc Backend Chuyên sâu (Đang học T4 & CN)',
        instructorId: instHaAcc!.id,
        curriculumVersion: 'v2026.1',
        techStackNotes: 'Node.js 22 · TypeScript 5 · Drizzle ORM · PostgreSQL 16 · Redis 7 · Docker',
        tuitionVnd: 10000,
        maxSeats: 35,
        enrolledCount: 1, // An (ACTIVE)
        enrollmentOpenAt: new Date('2026-10-12T00:00:00Z'),
        startDate: '2026-11-04',
        endDate: '2026-11-29',
        scheduleSlots: [
          { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 0, startTime: '19:30', endTime: '21:30' },
        ],
        replayExpiresAt: new Date('2027-11-30T23:59:59Z'),
        status: 'ONGOING',
      },
      {
        courseId: courseData!.id,
        code: 'DATA-PIPE-2026-K01',
        name: 'Khóa K01 · Kỹ sư Dữ liệu Hiện đại (Mở tuyển sinh T12/2026)',
        instructorId: instHaAcc!.id,
        curriculumVersion: 'v2026.1',
        techStackNotes: 'Apache Kafka · PySpark 3.5 · dbt Core · Medallion Lakehouse · PostgreSQL',
        tuitionVnd: 10000,
        maxSeats: 30,
        enrolledCount: 0,
        enrollmentOpenAt: new Date('2026-11-05T00:00:00Z'),
        startDate: '2026-12-05',
        endDate: '2026-12-21',
        scheduleSlots: [
          { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
          { dayOfWeek: 0, startTime: '14:00', endTime: '16:00' },
        ],
        replayExpiresAt: new Date('2027-12-31T23:59:59Z'),
        status: 'OPENING',
      },
    ])
    .returning();

  // =========================================================================
  // 7. CURRICULUM CONTENT DEFINITIONS FOR ALL 4 COURSES (Balanced A/B/C/D!)
  // =========================================================================
  const pyModules: CourseTopicQuestionSeed[] = [
    {
      sessionOrder: 1,
      topic: 'Python Hiện đại, Type Hints & Generator',
      primarySkillId: skPython!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'PY_S01_Python_TypeHints_Generators.pdf',
      chunkContent:
        'Trong Python 3.12, Generator sử dụng từ khóa yield để sinh từng phần tử theo cơ chế lazy evaluation, giúp đọc tệp log hàng chục GB với mức tiêu thụ RAM cố định O(1) thay vì nạp toàn bộ danh sách vào bộ nhớ như list comprehension.',
      questions: [
        {
          prompt: 'Lợi ích lớn nhất của Generator (`yield`) khi đọc tệp dữ liệu 20GB so với `list` là gì?',
          options: [
            'Tự động nén tệp trên ổ cứng trước khi đọc',
            'Sinh dữ liệu từng phần theo nhu cầu (lazy evaluation) giúp RAM giữ ở mức O(1)',
            'Tự động chạy song song trên tất cả nhân CPU',
            'Bỏ qua bước kiểm tra cú pháp của Python interpreter',
          ],
          correctIndex: 1,
          explanationMd: 'Generator chỉ giữ trạng thái phần tử hiện tại trong bộ nhớ thay vì cấp phát toàn bộ danh sách.',
          reviewJumpSec: 210,
        },
        {
          prompt: 'Khai báo Type Hints nào diễn tả hàm nhận danh sách số nguyên và có thể trả về chuỗi hoặc `None`?',
          options: [
            'def parse(items: list[int]) -> str | None:',
            'def parse(items: int[]) -> Optional[int]:',
            'def parse(items: dict[int, str]) -> None:',
            'def parse(items: set[str]) -> list[None]:',
          ],
          correctIndex: 0,
          explanationMd: 'Cú pháp `list[int]` và union `str | None` là chuẩn PEP 604 từ Python 3.10+.',
          reviewJumpSec: 450,
        },
        {
          prompt: 'Độ phức tạp trung bình khi kiểm tra phần tử tồn tại (`x in collection`) trên `set` hoặc `dict` là bao nhiêu?',
          options: ['O(n log n)', 'O(n)', 'O(1)', 'O(n^2)'],
          correctIndex: 2,
          explanationMd: '`set` và `dict` dùng bảng băm (hash table) nên phép tra cứu trung bình đạt O(1).',
          reviewJumpSec: 720,
        },
        {
          prompt: 'Vì sao không nên dùng giá trị mặc định khả biến như `def append_item(x, bucket=[])` trong Python?',
          options: [
            'Vì Python báo lỗi SyntaxError ngay khi chạy file',
            'Vì `bucket` bị xóa trắng sau mỗi dòng lệnh trong hàm',
            'Vì Type Hints không hỗ trợ kiểu danh sách rỗng',
            'Vì đối tượng `list` mặc định chỉ khởi tạo một lần duy nhất và bị dùng chung giữa mọi lần gọi hàm',
          ],
          correctIndex: 3,
          explanationMd: 'Default argument được đánh giá tại thời điểm định nghĩa hàm (`def`), nên cần dùng `bucket: list | None = None`.',
          reviewJumpSec: 980,
        },
      ],
    },
    {
      sessionOrder: 2,
      topic: 'OOP, Quản lý Ngoại lệ & Kiểm thử với Pytest',
      primarySkillId: skPython!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'PY_S02_OOP_Exceptions_Pytest.pdf',
      chunkContent:
        'Trong Pytest, cơ chế fixture cho phép khởi tạo tài nguyên dùng chung (như kết nối DB giả lập hoặc dữ liệu mẫu) và tự động dọn dẹp sau khi bài kiểm thử chạy xong thông qua câu lệnh yield trong hàm @pytest.fixture.',
      questions: [
        {
          prompt: 'Trong `pytest`, công dụng chính của `@pytest.fixture` có sử dụng `yield` là gì?',
          options: [
            'Biên dịch mã Python sang mã máy C++',
            'Tự động đẩy code lên GitHub sau khi test xong',
            'Thiết lập tài nguyên trước khi chạy test (setup) và giải phóng an toàn ngay sau khi test kết thúc (teardown)',
            'Tắt toàn bộ cảnh báo ngoại lệ trong chương trình chính',
          ],
          correctIndex: 2,
          explanationMd: 'Phần trước `yield` là bước chuẩn bị dữ liệu và phần sau `yield` luôn chạy để dọn dẹp tài nguyên.',
          reviewJumpSec: 240,
        },
        {
          prompt: 'Decorator `@dataclass(slots=True)` mang lại ưu điểm gì cho lớp dữ liệu trong Python?',
          options: [
            'Tự động sinh `__init__`, `__repr__`, `__eq__` và giảm bộ nhớ nhờ cố định thuộc tính qua `__slots__`',
            'Biến lớp Python thành bảng cơ sở dữ liệu PostgreSQL tự động',
            'Cho phép thêm thuộc tính động tùy ý vào đối tượng lúc runtime',
            'Tự động mã hóa toàn bộ trường văn bản bằng SHA-256',
          ],
          correctIndex: 0,
          explanationMd: '`slots=True` loại bỏ `__dict__` trên từng thực thể, tiết kiệm đáng kể RAM và tăng tốc truy cập thuộc tính.',
          reviewJumpSec: 510,
        },
        {
          prompt: 'Nguyên tắc bắt ngoại lệ (Exception Handling) chuẩn kỹ sư trong tầng dịch vụ là gì?',
          options: [
            'Luôn dùng `except:` trần để nuốt mọi lỗi không cho ghi log',
            'Bắt cụ thể nhóm ngoại lệ dự kiến, giữ nguyên ngữ cảnh gốc bằng `raise ... from err` và ghi log có cấu trúc',
            'Đặt toàn bộ chương trình trong một khối `try` duy nhất ở hàm `main`',
            'Dùng `assert` để kiểm tra dữ liệu đầu vào của người dùng trên môi trường production',
          ],
          correctIndex: 1,
          explanationMd: 'Bắt đúng loại ngoại lệ và nối chuỗi `from err` giúp bảo toàn stack trace gốc khi điều tra sự cố.',
          reviewJumpSec: 790,
        },
        {
          prompt: 'Tính năng `@pytest.mark.parametrize` giải quyết bài toán nào khi viết Unit Test?',
          options: [
            'Chạy cùng một hàm kiểm thử qua nhiều bộ dữ liệu đầu vào và kết quả kỳ vọng mà không phải copy-paste hàm test',
            'Giới hạn dung lượng RAM tối đa của tiến trình Python',
            'Tự động sinh tài liệu API OpenAPI từ hàm test',
            'Thay thế hoàn toàn nhu cầu kiểm thử tích hợp cơ sở dữ liệu',
          ],
          correctIndex: 0,
          explanationMd: 'Parametrize giúp bao phủ các ca biên (edge cases) rõ ràng và ngắn gọn.',
          reviewJumpSec: 1050,
        },
      ],
    },
    {
      sessionOrder: 3,
      topic: 'Lập trình Bất đồng bộ AsyncIO & httpx API',
      primarySkillId: skPython!.id,
      secondarySkillId: skFastApi!.id,
      attachmentFileName: 'PY_S03_AsyncIO_EventLoop_Httpx.pdf',
      chunkContent:
        'Trong Python AsyncIO, tuyệt đối không gọi thư viện đồng bộ gây nghẽn như time.sleep() hay requests.get() bên trong hàm async def vì nó khóa cứng toàn bộ Event Loop. Thay vào đó phải dùng await asyncio.sleep(), httpx.AsyncClient và dùng asyncio.Semaphore để giới hạn số kết nối đồng thời.',
      questions: [
        {
          prompt: 'Điều gì xảy ra nếu gọi trực tiếp `requests.get()` hoặc `time.sleep(5)` bên trong một coroutine `async def`?',
          options: [
            'Python tự động chuyển lệnh đó sang tiến trình khác mà không ảnh hưởng gì',
            'Toàn bộ Event Loop trên luồng hiện tại bị chặn cứng (block) suốt thời gian chờ, làm đứng mọi tác vụ đồng thời khác',
            'Hàm tự động trả về kết quả rỗng ngay lập tức',
            'Trình thông dịch báo lỗi biên dịch và từ chối khởi động ứng dụng',
          ],
          correctIndex: 1,
          explanationMd: 'Các lời gọi I/O đồng bộ không nhường quyền điều khiển (`await`) về lại cho Event Loop.',
          reviewJumpSec: 195,
        },
        {
          prompt: 'Khi cần gọi 500 URL qua `httpx.AsyncClient` nhưng máy chủ đích chỉ cho phép tối đa 20 kết nối cùng lúc, công cụ nào trong `asyncio` phù hợp nhất?',
          options: [
            'asyncio.Semaphore(20) kết hợp `async with sem:`',
            'Vòng lặp `while True` không có `await`',
            'Tạo mới 500 đối tượng `httpx.Client` đồng bộ',
            'Tăng biến môi trường `PYTHONHASHSEED` lên 20',
          ],
          correctIndex: 0,
          explanationMd: '`asyncio.Semaphore(20)` kiểm soát chính xác tối đa 20 coroutine đi vào vùng gọi mạng tại một thời điểm.',
          reviewJumpSec: 480,
        },
        {
          prompt: 'Vì sao nên khởi tạo một `httpx.AsyncClient` dùng chung theo vòng đời tác vụ thay vì tạo mới trong từng vòng lặp?',
          options: [
            'Vì Python chỉ cho phép tạo tối đa một đối tượng `AsyncClient`',
            'Vì `AsyncClient` tự động lưu toàn bộ dữ liệu vào PostgreSQL',
            'Để tái sử dụng Connection Pool và phiên bắt tay TLS/TCP, giảm mạnh độ trễ mạng',
            'Để bỏ qua bước kiểm tra chứng chỉ bảo mật HTTPS',
          ],
          correctIndex: 2,
          explanationMd: 'Tái sử dụng TCP/TLS connection pool giúp giảm chi phí bắt tay mạng lặp đi lặp lại.',
          reviewJumpSec: 810,
        },
        {
          prompt: 'Trong `asyncio.gather(*tasks, return_exceptions=True)`, tham số `return_exceptions=True` có tác dụng gì?',
          options: [
            'Tự động thử lại các tác vụ lỗi vô hạn lần',
            'Xóa toàn bộ kết quả của các tác vụ thành công nếu có 1 tác vụ lỗi',
            'Chuyển các coroutine thành luồng hệ điều hành riêng biệt',
            'Giúp các tác vụ còn lại tiếp tục hoàn tất và trả đối tượng Exception trong danh sách kết quả thay vì hủy ngang toàn nhóm',
          ],
          correctIndex: 3,
          explanationMd: 'Nhờ `return_exceptions=True`, một URL lỗi không làm mất kết quả của hàng trăm URL thành công khác.',
          reviewJumpSec: 1090,
        },
      ],
    },
    {
      sessionOrder: 4,
      topic: 'Thiết kế CSDL Quan hệ, Khóa ngoại & JOIN PostgreSQL',
      primarySkillId: skSqlVec!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'PY_S04_PostgreSQL_Relational_Joins.pdf',
      chunkContent:
        'Trên PostgreSQL, mệnh đề WHERE lọc các dòng trước khi gom nhóm GROUP BY, trong khi mệnh đề HAVING lọc các nhóm sau khi hàm tổng hợp COUNT, SUM, AVG đã được tính toán. Khóa ngoại (FOREIGN KEY) đảm bảo toàn vẹn tham chiếu ngay tại tầng lưu trữ.',
      questions: [
        {
          prompt: 'Sự khác biệt cốt lõi giữa `WHERE` và `HAVING` trong câu lệnh SQL có `GROUP BY` là gì?',
          options: [
            '`WHERE` lọc từng dòng dữ liệu gốc trước khi gom nhóm, còn `HAVING` lọc kết quả sau khi đã gom nhóm và tính hàm tổng hợp',
            '`HAVING` chạy nhanh hơn `WHERE` và dùng được mà không cần bảng dữ liệu',
            '`WHERE` chỉ dùng cho kiểu số còn `HAVING` chỉ dùng cho kiểu chuỗi',
            'Hai mệnh đề hoàn toàn giống nhau và có thể đổi chỗ tùy ý trong mọi trường hợp',
          ],
          correctIndex: 0,
          explanationMd: 'Đưa điều kiện lọc cột thường vào `WHERE` giúp giảm số dòng phải gom nhóm và tận dụng chỉ mục B-Tree.',
          reviewJumpSec: 220,
        },
        {
          prompt: 'Khi muốn lấy đầy đủ danh sách tất cả các lớp học (`cohorts`) kể cả những lớp chưa có học viên nào ghi danh (`enrollments`), phép nối nào là chính xác?',
          options: [
            'INNER JOIN enrollments ON ...',
            'CROSS JOIN enrollments',
            'LEFT JOIN enrollments ON cohorts.id = enrollments.cohort_id',
            'RIGHT JOIN cohorts ON cohorts.id = enrollments.id',
          ],
          correctIndex: 2,
          explanationMd: '`LEFT JOIN` giữ toàn bộ bản ghi từ bảng bên trái (`cohorts`) và điền `NULL` khi chưa có dòng khớp ở `enrollments`.',
          reviewJumpSec: 530,
        },
        {
          prompt: 'Ràng buộc `UNIQUE (account_id, cohort_id)` trên bảng `enrollments` bảo vệ quy tắc nghiệp vụ nào?',
          options: [
            'Một lớp học chỉ có tối đa một học viên duy nhất',
            'Một học viên chỉ có thể có tối đa một bản ghi ghi danh trong cùng một đợt học, chống tạo trùng khi xử lý đồng thời',
            'Một học viên không được phép mua khóa học thứ hai trên hệ thống',
            'Tự động xóa tài khoản học viên khi khóa học kết thúc',
          ],
          correctIndex: 1,
          explanationMd: 'Composite Unique Constraint ngăn chặn triệt để lỗi ghi danh trùng lặp ở mức cơ sở dữ liệu.',
          reviewJumpSec: 840,
        },
        {
          prompt: 'Biểu thức `COUNT(column_name)` khác `COUNT(*)` ở điểm nào trong SQL?',
          options: [
            '`COUNT(*)` bỏ qua mọi dòng có ít nhất một cột NULL',
            '`COUNT(column_name)` nhân đôi các giá trị trùng lặp',
            '`COUNT(*)` chỉ đếm khóa chính kiểu chuỗi',
            '`COUNT(column_name)` chỉ đếm các dòng mà `column_name IS NOT NULL`, còn `COUNT(*)` đếm tổng số dòng trong nhóm',
          ],
          correctIndex: 3,
          explanationMd: 'Kết hợp `LEFT JOIN` với `COUNT(enrollments.id)` sẽ trả về `0` chuẩn xác cho lớp chưa có học viên.',
          reviewJumpSec: 1120,
        },
      ],
    },
    {
      sessionOrder: 5,
      topic: 'SQL Phân tích Nâng cao: CTE, Window Functions & JSONB',
      primarySkillId: skSqlVec!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'PY_S05_Window_Functions_CTE_JSONB.pdf',
      chunkContent:
        'Hàm cửa sổ Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, SUM OVER) tính toán thứ hạng và tổng lũy kế trên tập cửa sổ PARTITION BY mà không làm gộp mất chi tiết từng dòng như GROUP BY. Với bảng lớn, Keyset Pagination (WHERE created_at < cursor) tránh quét bỏ dữ liệu như OFFSET lớn.',
      questions: [
        {
          prompt: 'Khác biệt quan trọng nhất giữa Window Function (`OVER (PARTITION BY ...)`) và `GROUP BY` là gì?',
          options: [
            'Window Function xóa các dòng trùng lặp khỏi bảng vật lý',
            'Window Function giữ nguyên từng dòng chi tiết đồng thời gắn thêm giá trị tổng hợp/xếp hạng theo phân vùng cửa sổ',
            'Window Function không thể sắp xếp theo `ORDER BY`',
            '`GROUP BY` luôn trả về nhiều dòng hơn Window Function',
          ],
          correctIndex: 1,
          explanationMd: 'Window Function cho phép vừa xem chi tiết từng giao dịch vừa biết thứ hạng hoặc tổng lũy kế trong nhóm.',
          reviewJumpSec: 260,
        },
        {
          prompt: 'Nếu 2 học viên đồng hạng Nhất (95 điểm), hàm xếp hạng nào cho học viên tiếp theo (90 điểm) đứng hạng Nhì (`2`) thay vì nhảy sang hạng Ba (`3`)?',
          options: ['ROW_NUMBER()', 'RANK()', 'NTILE(4)', 'DENSE_RANK()'],
          correctIndex: 3,
          explanationMd: '`DENSE_RANK()` xếp hạng liên tục không tạo khoảng trống thứ bậc sau các vị trí đồng điểm.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Vì sao phân trang bằng `Keyset Pagination` (`WHERE id < last_seen_id ORDER BY id DESC LIMIT 20`) vượt trội hơn `OFFSET 100000 LIMIT 20`?',
          options: [
            'Nhảy thẳng tới vị trí con trỏ trên chỉ mục B-Tree thay vì phải đọc và vứt bỏ 100.000 dòng đầu tiên',
            'Không cần tạo bất kỳ chỉ mục nào trên bảng',
            'Tự động nén cột JSONB sang văn bản thuần',
            'Cho phép bỏ qua mệnh đề `ORDER BY` mà thứ tự vẫn cố định',
          ],
          correctIndex: 0,
          explanationMd: '`OFFSET` lớn buộc PostgreSQL quét qua toàn bộ các dòng bị bỏ qua, gây suy giảm hiệu năng tuyến tính.',
          reviewJumpSec: 860,
        },
        {
          prompt: 'Để tăng tốc truy vấn kiểm tra sự tồn tại khóa/cặp giá trị bên trong cột `JSONB` (toán tử `@>`) trên PostgreSQL, loại chỉ mục nào phù hợp nhất?',
          options: ['Chỉ mục Hash đơn cột', 'Chỉ mục BRIN theo ngày tạo', 'Chỉ mục GIN trên cột JSONB', 'Không có chỉ mục nào hỗ trợ JSONB'],
          correctIndex: 2,
          explanationMd: 'GIN (Generalized Inverted Index) lập chỉ mục từng khóa/phần tử bên trong cấu trúc `JSONB`.',
          reviewJumpSec: 1150,
        },
      ],
    },
    {
      sessionOrder: 6,
      topic: 'Ứng dụng Tổng hợp Python + PostgreSQL Pool & Bảo mật SQL',
      primarySkillId: skSqlVec!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'PY_S06_ConnectionPool_Parameterized_SQL.pdf',
      chunkContent:
        'Khi kết nối Python với PostgreSQL trong ứng dụng thực tế, bắt buộc truyền tham số tách rời (parameterized query) thay vì nối chuỗi f-string để triệt tiêu hoàn toàn lỗi SQL Injection, đồng thời sử dụng Connection Pool và khối giao dịch transaction nguyên tử.',
      questions: [
        {
          prompt: 'Cách truyền dữ liệu người dùng nào vào câu lệnh SQL trong Python chống được tấn công SQL Injection?',
          options: [
            'Dùng f-string nối trực tiếp biến vào chuỗi SQL: `f"SELECT * FROM accounts WHERE email = \'{email}\'"`',
            'Dùng phép cộng chuỗi `+` kết hợp hàm `.strip()`',
            'Sử dụng Parameterized Query truyền tham số tách biệt khỏi câu lệnh SQL (ví dụ placeholder `$1` hoặc `%s` của driver)',
            'Mã hóa câu lệnh SQL bằng Base64 trước khi nối chuỗi',
          ],
          correctIndex: 2,
          explanationMd: 'Parameterized Query tách bạch hoàn toàn cấu trúc lệnh SQL và giá trị dữ liệu tại tầng giao thức PostgreSQL.',
          reviewJumpSec: 200,
        },
        {
          prompt: 'Vai trò chính của Connection Pool khi dịch vụ Python giao tiếp với PostgreSQL dưới tải cao là gì?',
          options: [
            'Tái sử dụng tập kết nối sẵn có và giới hạn trần kết nối mở đồng thời, tránh làm cạn kiệt tiến trình backend của PostgreSQL',
            'Tự động sao lưu dữ liệu sang đám mây mỗi giây',
            'Thay thế hoàn toàn nhu cầu dùng giao dịch ACID',
            'Biến PostgreSQL thành cơ sở dữ liệu lưu trên RAM thuần túy',
          ],
          correctIndex: 0,
          explanationMd: 'Mỗi kết nối vật lý tới PostgreSQL tốn tiến trình và bộ nhớ riêng; Connection Pool giữ số kết nối ổn định.',
          reviewJumpSec: 520,
        },
        {
          prompt: 'Khi thực hiện chuỗi thao tác trừ tiền và kích hoạt khóa học trong một khối `transaction`, nếu bước thứ hai phát sinh lỗi thì PostgreSQL đảm bảo điều gì?',
          options: [
            'Giữ nguyên bước trừ tiền và bỏ qua bước kích hoạt',
            'Tự động `ROLLBACK` toàn bộ thay đổi trong giao dịch về trạng thái nhất quán ban đầu (Atomicity)',
            'Xóa toàn bộ bảng `orders` để bảo vệ dữ liệu',
            'Tự động commit một nửa dữ liệu đã ghi',
          ],
          correctIndex: 1,
          explanationMd: 'Tính nguyên tử (Atomicity) trong ACID đảm bảo giao dịch hoặc thành công trọn vẹn hoặc hoàn tác toàn bộ.',
          reviewJumpSec: 830,
        },
        {
          prompt: 'Khi đọc 1 triệu dòng kết quả từ PostgreSQL để xuất báo cáo mà không muốn tràn RAM ứng dụng Python, kỹ thuật nào nên áp dụng?',
          options: [
            'Gọi `fetchall()` nạp toàn bộ 1 triệu dòng vào một biến toàn cục',
            'Nhân bản bảng dữ liệu ra 10 bảng tạm trước khi đọc',
            'Tắt kiểm tra kiểu dữ liệu của trình điều khiển cơ sở dữ liệu',
            'Sử dụng Server-side Cursor / streaming theo từng lô (`fetchmany` / async iterator)',
          ],
          correctIndex: 3,
          explanationMd: 'Đọc theo lô qua cursor giúp xử lý tuần tự từng phần nhỏ với bộ nhớ ổn định.',
          reviewJumpSec: 1140,
        },
      ],
    },
  ];

  const aiModules: CourseTopicQuestionSeed[] = [
    {
      sessionOrder: 1,
      topic: 'Kiến trúc AI Production, FastAPI Gateway & SSE Streaming',
      primarySkillId: skFastApi!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'AI_S01_FastAPI_LLM_Gateway_SSE.pdf',
      chunkContent:
        'Cổng LLM Gateway trong môi trường Production sử dụng FastAPI bất đồng bộ kết hợp Server-Sent Events (SSE) để trả từng token ngay khi mô hình sinh ra, giảm Time-To-First-Token (TTFT) xuống dưới 500ms, đồng thời áp dụng timeout và Exponential Backoff có Jitter khi gặp lỗi quá tải 429.',
      questions: [
        {
          prompt: 'Sử dụng Server-Sent Events (SSE) trong cổng LLM Gateway giúp cải thiện trực tiếp chỉ số trải nghiệm nào của người dùng?',
          options: [
            'Giảm dung lượng ổ cứng lưu trữ trọng số mô hình',
            'Giảm Time-To-First-Token (TTFT), hiển thị phản hồi tức thì ngay khi những token đầu tiên được sinh ra',
            'Loại bỏ hoàn toàn chi phí token đầu vào của nhà cung cấp LLM',
            'Thay thế hoàn toàn bước xác thực JWT ở tầng API',
          ],
          correctIndex: 1,
          explanationMd: 'Streaming SSE giúp người dùng đọc câu trả lời ngay lập tức thay vì nhìn màn hình chờ hàng chục giây.',
          reviewJumpSec: 210,
        },
        {
          prompt: 'Vì sao chiến lược thử lại khi gặp lỗi `429 Rate Limit` từ LLM API cần kết hợp **Exponential Backoff + Random Jitter**?',
          options: [
            'Để tránh hiện tượng hàng trăm yêu cầu bị lỗi đồng loạt đập lại vào máy chủ cùng một mili-giây (Thundering Herd)',
            'Để tự động rút ngắn độ dài câu hỏi của người dùng xuống một nửa',
            'Để bỏ qua kiểm tra khóa API của nhà cung cấp',
            'Để ép mô hình luôn trả về cùng một câu trả lời cố định',
          ],
          correctIndex: 0,
          explanationMd: 'Jitter phân tán ngẫu nhiên thời điểm thử lại, giúp hệ thống đích phục hồi mượt mà.',
          reviewJumpSec: 490,
        },
        {
          prompt: 'Trong FastAPI, nếu endpoint khai báo `async def` nhưng bên trong lại gọi SDK đồng bộ chặn luồng mạng thì hậu quả là gì?',
          options: [
            'FastAPI tự động nâng cấp SDK đó thành bất đồng bộ',
            'Chỉ riêng request đó chạy chậm còn các request khác vẫn bình thường',
            'Event Loop chính bị nghẽn, làm tăng vọt độ trễ của toàn bộ request đồng thời khác trên cùng worker',
            'Ứng dụng tự động nhân đôi số lượng container Docker',
          ],
          correctIndex: 2,
          explanationMd: 'Trong `async def`, mọi tác vụ I/O phải dùng client bất đồng bộ (`await`) hoặc đẩy sang threadpool.',
          reviewJumpSec: 780,
        },
        {
          prompt: 'Lớp kiểm tra dữ liệu nào của **Pydantic v2** đảm bảo cấu hình và request đầu vào của dịch vụ AI được xác thực chặt chẽ với hiệu năng cao?',
          options: ['unittest.mock', 'pickle.loads', 'eval()', 'BaseModel viết lõi bằng Rust (`pydantic-core`)'],
          correctIndex: 3,
          explanationMd: 'Pydantic v2 dùng `pydantic-core` thực thi bằng Rust giúp kiểm tra schema JSON cực nhanh và an toàn.',
          reviewJumpSec: 1060,
        },
      ],
    },
    {
      sessionOrder: 2,
      topic: 'Chiến lược Chunking Đa tầng & Chỉ mục HNSW trên pgvector',
      primarySkillId: skRag!.id,
      secondarySkillId: skSqlVec!.id,
      attachmentFileName: 'AI_S02_Chunking_Pgvector_HNSW.pdf',
      chunkContent:
        'Khi băm tài liệu cho hệ thống RAG, sử dụng Recursive Markdown Chunking có phần gối nhau (chunk overlap 10%–15%) giúp không làm đứt gãy ngữ nghĩa giữa hai đoạn liên tiếp. Trên PostgreSQL pgvector, chỉ mục HNSW với toán tử khoảng cách cosine (<=>) giúp tìm kiếm láng giềng gần đúng tốc độ mili-giây kèm bộ lọc phân quyền visibility/course_id.',
      questions: [
        {
          prompt: 'Mục đích chính của tham số `chunk_overlap` (ví dụ gối nhau 15% số token giữa hai chunk liên tiếp) là gì?',
          options: [
            'Tăng gấp đôi kích thước cơ sở dữ liệu để kiểm thử ổ cứng',
            'Giữ liền mạch ngữ cảnh cho các câu hoặc ý nằm ngay tại ranh giới cắt đoạn',
            'Mã hóa nội dung tài liệu không cho quản trị viên đọc được',
            'Thay thế hoàn toàn bước sinh vector embedding',
          ],
          correctIndex: 1,
          explanationMd: 'Overlap ngăn việc chủ ngữ nằm ở cuối chunk trước còn vị ngữ/công thức nằm ở đầu chunk sau bị mất liên kết.',
          reviewJumpSec: 230,
        },
        {
          prompt: 'Trên `pgvector`, toán tử nào tính **khoảng cách Cosine** khớp với lớp chỉ mục `vector_cosine_ops` của HNSW?',
          options: ['<->', '<#>', '<=>', '@@'],
          correctIndex: 2,
          explanationMd: 'Trong `pgvector`, `<=>` là khoảng cách Cosine (`1 - cosine_similarity`), `<->` là L2 và `<#>` là tích vô hướng âm.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Lỗi truy vấn SQL nào khiến PostgreSQL **không thể sử dụng chỉ mục HNSW** mà phải quét tuần tự toàn bảng?',
          options: [
            'Sắp xếp trực tiếp `ORDER BY embedding <=> $1 LIMIT 10`',
            'Bọc biểu thức khoảng cách trong `CASE WHEN` hoặc sắp xếp giảm dần `DESC` thay vì `ORDER BY embedding <=> $1 ASC LIMIT k`',
            'Kết hợp mệnh đề `LIMIT` nhỏ',
            'Lưu vector đã chuẩn hóa độ dài đơn vị L2',
          ],
          correctIndex: 1,
          explanationMd: 'PostgreSQL planner chỉ kích hoạt HNSW index scan khi `ORDER BY column <=> vector ASC LIMIT k` ở dạng trực tiếp.',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Vì sao bảng `knowledge_chunks` cần lưu đồng thời `visibility`, `course_id`, `cohort_id` ngay trên từng chunk?',
          options: [
            'Để lọc quyền truy cập (Pre-filtering RBAC) ngay trong câu truy vấn SQL, đảm bảo Trợ giảng khóa A không bao giờ rò rỉ học liệu trả phí của khóa B',
            'Vì PostgreSQL bắt buộc mọi bảng phải có ít nhất 10 cột',
            'Để thay thế hoàn toàn bảng `courses` và `cohorts`',
            'Để tắt tính năng tìm kiếm toàn văn `tsvector`',
          ],
          correctIndex: 0,
          explanationMd: 'Kiểm soát quyền truy cập ở tầng truy xuất RAG ngăn chặn rò rỉ dữ liệu chéo khóa học.',
          reviewJumpSec: 1120,
        },
      ],
    },
    {
      sessionOrder: 3,
      topic: 'Hybrid Search (Dense + BM25) & Reciprocal Rank Fusion (RRF)',
      primarySkillId: skRag!.id,
      secondarySkillId: skSqlVec!.id,
      attachmentFileName: 'AI_S03_Hybrid_Search_RRF_Reranking.pdf',
      chunkContent:
        'Dense Vector Search nắm bắt tốt ngữ nghĩa tương đồng nhưng thường bỏ sót mã lỗi chính xác, tên hàm hoặc mã đơn hàng (như ET20260001). Kiến trúc Hybrid RAG kết hợp tìm kiếm vector pgvector với Full-Text Search tsvector và hợp nhất thứ hạng bằng công thức Reciprocal Rank Fusion RRF_Score(d) = 1/(k + rank_dense) + 1/(k + rank_fts) với hằng số làm mượt k = 60, sau đó tinh lọc Top-5 qua Cross-Encoder Reranker.',
      questions: [
        {
          prompt: 'Trong trường hợp nào tìm kiếm từ khóa (`tsvector` / BM25) phát huy thế mạnh vượt trội so với chỉ dùng Dense Vector?',
          options: [
            'Khi người dùng tìm chính xác mã lỗi, tên hàm cụ thể, mã học phần hoặc thuật ngữ viết tắt hiếm gặp',
            'Khi câu hỏi hoàn toàn không chứa từ khóa nào chung nhưng đồng nghĩa trừu tượng',
            'Khi cơ sở dữ liệu không lưu văn bản mà chỉ lưu ảnh nhị phân',
            'Khi muốn sinh văn bản ngẫu nhiên không cần tài liệu gốc',
          ],
          correctIndex: 0,
          explanationMd: 'Lexical search khớp chính xác token đặc thù mà mô hình nhúng ngữ nghĩa dễ làm mờ.',
          reviewJumpSec: 205,
        },
        {
          prompt: 'Ưu điểm lớn nhất của thuật toán **Reciprocal Rank Fusion (RRF)** khi gộp kết quả từ Vector Search và Full-Text Search là gì?',
          options: [
            'Yêu cầu phải huấn luyện lại mô hình ngôn ngữ lớn mỗi ngày',
            'Xóa bỏ hoàn toàn các tài liệu xuất hiện ở cả hai nhánh tìm kiếm',
            'Dựa trên thứ hạng (`rank`) thay vì điểm thô nên không bị lệch thang đo giữa Cosine Similarity (0..1) và điểm tần suất từ khóa không giới hạn',
            'Chỉ giữ lại kết quả có độ dài văn bản ngắn nhất',
          ],
          correctIndex: 2,
          explanationMd: 'Công thức `1 / (k + rank)` chuẩn hóa tự nhiên hai hệ thống chấm điểm khác bản chất về chung một thang hợp nhất.',
          reviewJumpSec: 530,
        },
        {
          prompt: 'Vì sao mô hình **Cross-Encoder Reranker** chỉ được đặt ở bước tinh lọc Top-20 xuống Top-5 thay vì quét trực tiếp 1 triệu chunk trong DB?',
          options: [
            'Vì Cross-Encoder cho độ chính xác thấp hơn BM25',
            'Vì Cross-Encoder chỉ đọc được tối đa 5 ký tự',
            'Vì PostgreSQL tự động chạy Cross-Encoder trong chỉ mục B-Tree',
            'Vì Cross-Encoder phải chấm cặp `(query, document)` trực tiếp qua mạng nơ-ron nên chi phí tính toán cao, không thể lập chỉ mục vector sẵn',
          ],
          correctIndex: 3,
          explanationMd: 'Kiến trúc hai tầng Bi-Encoder + FTS thu hồi nhanh ứng viên rồi dùng Cross-Encoder xếp hạng sâu đạt cân bằng tối ưu giữa tốc độ và độ chính xác.',
          reviewJumpSec: 860,
        },
        {
          prompt: 'Để giảm thiểu hiện tượng bịa đặt thông tin (Hallucination) ở bước sinh câu trả lời của Trợ giảng AI, thiết kế prompt nào hiệu quả nhất?',
          options: [
            'Tăng `temperature` lên mức cao nhất `2.0`',
            'Buộc mô hình chỉ dựa trên các đoạn ngữ cảnh truy xuất được, trích dẫn rõ mốc thời gian/trang slide và từ chối lịch sự khi ngữ cảnh không đủ dữ kiện',
            'Ẩn toàn bộ tài liệu bài giảng không truyền vào prompt',
            'Yêu cầu mô hình tự suy đoán mọi thông tin ngoài phạm vi khóa học',
          ],
          correctIndex: 1,
          explanationMd: 'Grounding chặt kèm trích dẫn nguồn (`citations`) giúp câu trả lời kiểm chứng được ngay trên video bài giảng.',
          reviewJumpSec: 1150,
        },
      ],
    },
    {
      sessionOrder: 4,
      topic: 'Function Calling, Structured Outputs & ReAct Agent',
      primarySkillId: skTool!.id,
      secondarySkillId: skLangGraph!.id,
      attachmentFileName: 'AI_S04_Function_Calling_ReAct_Agents.pdf',
      chunkContent:
        'Trong kiến trúc Function Calling, LLM không trực tiếp thực thi câu lệnh hệ thống hay truy vấn DB mà chỉ sinh ra cấu trúc JSON chỉ định tên công cụ và tham số theo JSON Schema. Tầng ứng dụng Backend chịu trách nhiệm kiểm tra quyền, xác thực tham số bằng Pydantic/Zod, thực thi công cụ an toàn và áp đặt max_iterations để chống vòng lặp vô hạn.',
      questions: [
        {
          prompt: 'Trong cơ chế **Function Calling**, ai là bên thực sự chạy hàm nghiệp vụ (ví dụ tra cứu đơn hàng trong DB)?',
          options: [
            'Máy chủ mô hình LLM tự mở kết nối thẳng vào cơ sở dữ liệu nội bộ của bạn',
            'Trình duyệt của người dùng tự sửa bảng dữ liệu',
            'Mô hình LLM chỉ đề xuất tên hàm + đối số JSON, còn tầng Backend ứng dụng kiểm tra phân quyền, xác thực đối số rồi mới thực thi hàm',
            'Hệ điều hành tự động chạy mọi chuỗi văn bản do LLM sinh ra bằng `sh -c`',
          ],
          correctIndex: 2,
          explanationMd: 'Giữ quyền thực thi và kiểm tra RBAC tại ứng dụng giúp đảm bảo an toàn tuyệt đối cho dữ liệu nội bộ.',
          reviewJumpSec: 240,
        },
        {
          prompt: 'Rủi ro nghiêm trọng nào xảy ra nếu vòng lặp suy luận **ReAct Agent** không cấu hình `max_iterations` và ngân sách token?',
          options: [
            'Agent có thể rơi vào vòng lặp gọi công cụ lỗi liên tục không điểm dừng, gây treo yêu cầu và tiêu tốn chi phí API đột biến',
            'Mô hình tự động giảm kích thước vector từ 1024 xuống 128 chiều',
            'Cơ sở dữ liệu tự động chuyển sang chế độ chỉ đọc',
            'Các câu trả lời luôn bị cắt còn 1 từ duy nhất',
          ],
          correctIndex: 0,
          explanationMd: 'Giới hạn số bước lặp (`max_iterations`) và timeout là chốt chặn bắt buộc khi vận hành Agent trên Production.',
          reviewJumpSec: 560,
        },
        {
          prompt: 'Kỹ thuật **Structured Outputs** với JSON Schema / Pydantic giải quyết triệt để lỗi nào khi tích hợp LLM vào giao diện phần mềm?',
          options: [
            'Lỗi mất kết nối cáp quang biển',
            'Lỗi tràn dung lượng ổ đĩa chứa video',
            'Lỗi người dùng quên mật khẩu đăng nhập',
            'Lỗi mô hình trả về văn bản tự do sai định dạng hoặc thiếu trường bắt buộc làm gãy bước `JSON.parse` ở Backend/Frontend',
          ],
          correctIndex: 3,
          explanationMd: 'Ràng buộc lược đồ đầu ra đảm bảo phản hồi của mô hình luôn tuân thủ đúng hợp đồng kiểu dữ liệu.',
          reviewJumpSec: 870,
        },
        {
          prompt: 'Với các công cụ có tác động thay đổi dữ liệu quan trọng (như hoàn tiền hay thu hồi chứng chỉ), mẫu thiết kế Agent nào an toàn nhất?',
          options: [
            'Cho phép Agent tự thực thi hàng loạt ngay khi nhận bất kỳ tin nhắn chat nào',
            'Áp dụng Human-in-the-Loop yêu cầu người có thẩm quyền xác nhận trước khi thực thi hành động ghi dữ liệu nhạy cảm',
            'Bỏ qua bước kiểm tra vai trò người dùng đang đăng nhập',
            'Lưu mật khẩu quản trị trực tiếp vào system prompt của Agent',
          ],
          correctIndex: 1,
          explanationMd: 'Human-in-the-Loop ngăn chặn thiệt hại do hiểu nhầm ngữ cảnh hoặc tấn công Prompt Injection.',
          reviewJumpSec: 1130,
        },
      ],
    },
    {
      sessionOrder: 5,
      topic: 'LLMOps: Ragas Evaluation, Guardrails & Semantic Cache',
      primarySkillId: skEval!.id,
      secondarySkillId: skRag!.id,
      attachmentFileName: 'AI_S05_Ragas_Guardrails_SemanticCache.pdf',
      chunkContent:
        'Bộ chỉ số Ragas đánh giá tách biệt chất lượng truy xuất (Context Precision, Context Recall) và chất lượng sinh câu trả lời (Faithfulness, Answer Relevancy). Hàng rào Guardrails chặn Prompt Injection và câu hỏi lạc đề ngoài phạm vi khóa học trước khi tốn chi phí gọi LLM.',
      questions: [
        {
          prompt: 'Trong bộ khung đánh giá **Ragas**, chỉ số **Faithfulness** đo lường yếu tố nào?',
          options: [
            'Tốc độ mạng giữa trình duyệt và máy chủ',
            'Mức độ trung thực của câu trả lời: các khẳng định đưa ra có được suy dẫn trực tiếp từ đoạn ngữ cảnh truy xuất hay bị mô hình tự bịa thêm',
            'Số lượng câu hỏi mà người dùng gửi trong một ngày',
            'Dung lượng RAM của container PostgreSQL',
          ],
          correctIndex: 1,
          explanationMd: 'Faithfulness thấp cảnh báo mô hình đang suy diễn vượt quá dữ kiện trong tài liệu gốc.',
          reviewJumpSec: 220,
        },
        {
          prompt: 'Đặt tầng **Input Guardrails / Intent Classifier** trước khi gọi mô hình LLM lớn mang lại lợi ích kép nào?',
          options: [
            'Vừa chặn sớm Prompt Injection / câu hỏi ngoài phạm vi học thuật, vừa tiết kiệm chi phí token và độ trễ cho hệ thống',
            'Tự động tăng gấp đôi số chiều vector trong cơ sở dữ liệu',
            'Thay thế hoàn toàn nhu cầu ghi log hệ thống',
            'Cho phép người chưa ghi danh đọc toàn bộ học liệu nội bộ',
          ],
          correctIndex: 0,
          explanationMd: 'Phân loại ý định nhẹ ngay đầu phễu giúp bảo vệ ranh giới kiến thức khóa học và tối ưu chi phí suy luận.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Khi triển khai **Semantic Cache** trên Redis cho Trợ giảng AI, khóa phân vùng (namespace) của cache bắt buộc phải gắn kèm thông tin nào?',
          options: [
            'Màu giao diện sáng/tối của trình duyệt',
            'Độ phân giải màn hình của học viên',
            '`course_id` / `cohort_id` và phạm vi quyền truy cập để không bao giờ trả nhầm câu trả lời nội bộ của khóa này cho người ngoài',
            'Địa chỉ MAC của card mạng máy khách',
          ],
          correctIndex: 2,
          explanationMd: 'Cache không gắn phạm vi khóa học/quyền truy cập sẽ gây rò rỉ nội dung giữa người dùng khác quyền.',
          reviewJumpSec: 840,
        },
        {
          prompt: 'Nếu điểm **Context Recall** thấp nhưng **Faithfulness** lại cao, nguyên nhân gốc nằm ở tầng nào của pipeline RAG?',
          options: [
            'Giao diện CSS hiển thị phông chữ chưa đẹp',
            'Cổng thanh toán VietQR phản hồi chậm',
            'Trình phát video thiếu phụ đề tiếng Anh',
            'Tầng truy xuất (Chunking / Embedding / Hybrid Search) chưa tìm đủ đoạn tài liệu chứa đáp án để đưa vào prompt',
          ],
          correctIndex: 3,
          explanationMd: 'Mô hình trả lời trung thực trên ngữ cảnh được cấp, nhưng bộ truy xuất đã bỏ sót đoạn kiến thức cần thiết.',
          reviewJumpSec: 1100,
        },
      ],
    },
    {
      sessionOrder: 6,
      topic: 'Bảo vệ Đồ án Hệ thống AI & Tổng ôn Kiến trúc Cuối khóa',
      primarySkillId: skEval!.id,
      secondarySkillId: skLangGraph!.id,
      attachmentFileName: 'AI_S06_Production_Readiness_Checklist.pdf',
      chunkContent:
        'Một hệ thống AI sẵn sàng cho Production cần kết hợp đầy đủ: kiểm soát truy cập theo khóa học trên kho vector, Hybrid Search + Reranking, Structured Outputs, giám sát độ trễ/token/trace (Langfuse) và cơ chế Fallback duyên dáng khi dịch vụ LLM bên ngoài gián đoạn.',
      questions: [
        {
          prompt: 'Khi dịch vụ suy luận AI bên ngoài gặp sự cố timeout tạm thời, cơ chế thiết kế chịu lỗi (Graceful Degradation) nào phù hợp nhất cho nền tảng học tập?',
          options: [
            'Làm sập toàn bộ tiến trình API chính với mã lỗi 500 không thông báo',
            'Xóa phiên đăng nhập của học viên bắt đăng nhập lại',
            'Áp dụng timeout ngắn kết hợp trả về kết quả truy xuất học liệu xác định (deterministic citations) hoặc hướng dẫn rõ ràng thay vì treo ứng dụng',
            'Hiển thị dữ liệu ngẫu nhiên của học viên khác',
          ],
          correctIndex: 2,
          explanationMd: 'Timeout rõ ràng và fallback an toàn giữ cho luồng học tập chính luôn phản hồi ổn định.',
          reviewJumpSec: 250,
        },
        {
          prompt: 'Lưu trữ `prompt_tokens`, `completion_tokens`, `latency_ms` và `citations` trên bảng `chat_messages` phục vụ mục tiêu vận hành nào?',
          options: [
            'Theo dõi chi phí suy luận thực tế, kiểm toán độ trễ p95 và đối chiếu chất lượng nguồn trích dẫn của Trợ giảng AI',
            'Tăng kích thước tệp ảnh đại diện của người dùng',
            'Thay thế bảng điểm bài thi cuối khóa',
            'Tắt chỉ mục tìm kiếm của PostgreSQL',
          ],
          correctIndex: 0,
          explanationMd: 'Observability đầy đủ ở mức từng tin nhắn là nền tảng của vận hành LLMOps chuyên nghiệp.',
          reviewJumpSec: 570,
        },
        {
          prompt: 'Điều kiện chuẩn trên hệ thống 3T Academy để mở khóa **Kỳ thi sát hạch cuối khóa** của một đợt học là gì?',
          options: [
            'Chỉ cần tạo tài khoản miễn phí không cần ghi danh',
            'Hoàn thành đầy đủ 6/6 buổi học của đợt học (đạt bài Quiz kiểm tra năng lực từng buổi từ 70% trở lên)',
            'Chỉ cần bình luận một câu bất kỳ trong mục thảo luận',
            'Đợi qua ngày kết thúc dự kiến mà không cần làm bài kiểm tra nào',
          ],
          correctIndex: 1,
          explanationMd: 'Hoàn thành trọn vẹn 6/6 buổi học đảm bảo học viên nắm vững toàn bộ lộ trình trước khi thi lấy chứng chỉ.',
          reviewJumpSec: 880,
        },
        {
          prompt: 'Chứng chỉ tốt nghiệp do 3T Academy cấp sử dụng cơ chế kỹ thuật nào để chống làm giả mã văn bằng?',
          options: [
            'Chỉ kiểm tra độ dài chuỗi tên học viên trên trình duyệt',
            'Lưu mật khẩu người dùng vào trong tên file ảnh chứng chỉ',
            'Cho phép sửa trực tiếp điểm thi qua tham số URL công khai',
            'Ký xác thực HMAC-SHA256 trên máy chủ kết hợp mã QR dẫn tới trang đối chiếu trực tuyến trên cơ sở dữ liệu gốc',
          ],
          correctIndex: 3,
          explanationMd: 'Chữ ký HMAC-SHA256 và đối chiếu trạng thái thu hồi trực tiếp trên DB đảm bảo tính toàn vẹn của văn bằng.',
          reviewJumpSec: 1140,
        },
      ],
    },
  ];

  const sweModules: CourseTopicQuestionSeed[] = [
    {
      sessionOrder: 1,
      topic: 'Clean Layered Architecture & Kiểm soát Hợp đồng với TypeScript / Zod',
      primarySkillId: skNode!.id,
      secondarySkillId: skSysDesign!.id,
      attachmentFileName: 'SWE_S01_Clean_Architecture_Zod.pdf',
      chunkContent:
        'Trong kiến trúc Backend phân tầng với TypeScript và Zod, kiểu tĩnh của TypeScript bị xóa lúc runtime nên mọi dữ liệu biên từ HTTP body, query, params và webhook bên ngoài bắt buộc phải đi qua schema Zod để xác thực thực thi trước khi chạm tới tầng nghiệp vụ.',
      questions: [
        {
          prompt: 'Vì sao dùng TypeScript vẫn bắt buộc phải kiểm tra dữ liệu đầu vào HTTP bằng **Zod** lúc runtime?',
          options: [
            'Vì kiểu tĩnh TypeScript bị xóa sạch sau khi biên dịch sang JavaScript nên không tự chặn được JSON sai cấu trúc gửi qua mạng lúc chạy thật',
            'Vì TypeScript không hỗ trợ khai báo `interface`',
            'Vì Zod tự động thay thế cơ sở dữ liệu PostgreSQL',
            'Vì trình duyệt không thể gửi định dạng JSON chuẩn',
          ],
          correctIndex: 0,
          explanationMd: 'Runtime validation tại biên hệ thống bảo vệ tầng nghiệp vụ khỏi payload độc hại hoặc sai kiểu.',
          reviewJumpSec: 210,
        },
        {
          prompt: 'Nguyên tắc tách tầng **Route/Controller -> Service -> Repository/DB** giúp ích lớn nhất ở điểm nào?',
          options: [
            'Làm mọi tệp mã nguồn dài gấp ba lần mà không đổi hành vi',
            'Cô lập quy tắc nghiệp vụ khỏi chi tiết HTTP Express, giúp tái sử dụng logic giữa API, Webhook, CLI Seed và kiểm thử đơn vị dễ dàng',
            'Cho phép truy vấn thẳng SQL từ giao diện React',
            'Bỏ qua hoàn toàn nhu cầu xử lý lỗi tập trung',
          ],
          correctIndex: 1,
          explanationMd: 'Khi logic nghiệp vụ nằm ở hàm dịch vụ thuần khiết, cả REST API lẫn Webhook đều dùng chung một chuẩn duy nhất.',
          reviewJumpSec: 520,
        },
        {
          prompt: 'Mục đích của việc gắn **Correlation ID / Request ID** xuyên suốt log của một HTTP request là gì?',
          options: [
            'Thay thế khóa chính của bảng người dùng',
            'Mã hóa mật khẩu thay cho thuật toán Argon2',
            'Truy vết toàn bộ chuỗi sự kiện, truy vấn và lỗi thuộc cùng một giao dịch của người dùng giữa hàng nghìn dòng log đồng thời',
            'Tự động nén dung lượng phản hồi hình ảnh',
          ],
          correctIndex: 2,
          explanationMd: 'Request ID giúp gom chính xác mọi bước xử lý của một yêu cầu khi chẩn đoán lỗi production.',
          reviewJumpSec: 810,
        },
        {
          prompt: 'Khi API trả lỗi nghiệp vụ cho Frontend, cấu trúc phản hồi nào giúp phía giao diện xử lý tin cậy nhất?',
          options: [
            'Trả trang HTML mặc định của máy chủ kèm stack trace nội bộ',
            'Luôn trả mã HTTP 200 cho cả trường hợp lỗi xác thực và lỗi máy chủ',
            'Trả chuỗi văn bản tự do thay đổi ngẫu nhiên mỗi lần gọi',
            'Trả mã HTTP chuẩn ngữ nghĩa (400/401/403/404/409) kèm JSON thống nhất `{ error: { code, message } }` và không lộ chi tiết nhạy cảm nội bộ',
          ],
          correctIndex: 3,
          explanationMd: 'Mã lỗi chuẩn định danh (`code`) giúp Frontend hiển thị thông báo chính xác và an toàn bảo mật.',
          reviewJumpSec: 1080,
        },
      ],
    },
    {
      sessionOrder: 2,
      topic: 'Tối ưu Truy vấn PostgreSQL, EXPLAIN ANALYZE & Partial Index',
      primarySkillId: skSqlVec!.id,
      secondarySkillId: skNode!.id,
      attachmentFileName: 'SWE_S02_Postgres_Explain_Partial_Index.pdf',
      chunkContent:
        'Lệnh EXPLAIN (ANALYZE, BUFFERS) cho biết kế hoạch thực thi thực tế và số trang bộ nhớ phải đọc của PostgreSQL. Với bảng thông báo có 95% bản ghi đã đọc, tạo Partial Index có điều kiện WHERE is_read = FALSE giúp kích thước chỉ mục nhỏ gọn và tăng tốc vọt truy vấn chuông thông báo chưa đọc.',
      questions: [
        {
          prompt: 'Khi chạy `EXPLAIN (ANALYZE, BUFFERS)` cho một câu lệnh `UPDATE` hoặc `DELETE` cần kiểm tra kế hoạch thực thi mà không muốn làm thay đổi dữ liệu thật, cần bọc trong cấu trúc nào?',
          options: [
            '`BEGIN; EXPLAIN (ANALYZE, BUFFERS) ...; ROLLBACK;`',
            'Chạy trực tiếp ngoài giao dịch rồi khởi động lại PostgreSQL',
            'Thêm từ khóa `FAKE_RUN` vào cuối câu lệnh SQL',
            'Xóa khóa ngoại của bảng trước khi chạy',
          ],
          correctIndex: 0,
          explanationMd: '`EXPLAIN ANALYZE` thực sự thực thi câu lệnh, nên với câu lệnh ghi dữ liệu phải đặt trong `BEGIN ... ROLLBACK`.',
          reviewJumpSec: 230,
        },
        {
          prompt: 'Lợi thế nổi bật của **Partial Index** `CREATE INDEX ... ON notifications (recipient_id, created_at DESC) WHERE is_read = FALSE` là gì?',
          options: [
            'Lưu bản sao toàn bộ văn bản thông báo đã đọc từ năm trước',
            'Chỉ lập chỉ mục cho tập con thông báo chưa đọc đang cần truy vấn thường xuyên, giảm mạnh dung lượng RAM chỉ mục và chi phí ghi',
            'Tự động xóa các thông báo cũ sau 24 giờ',
            'Thay thế hoàn toàn khóa chính của bảng `notifications`',
          ],
          correctIndex: 1,
          explanationMd: 'Partial Index giữ cây B-Tree cực nhỏ khi phần lớn dữ liệu lịch sử mang giá trị `is_read = TRUE`.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Lỗi **N+1 Query** trong tầng API xuất hiện khi nào?',
          options: [
            'Khi một bảng có nhiều hơn 1 cột khóa ngoại',
            'Khi đặt giới hạn `LIMIT 10` trong câu truy vấn danh sách',
            'Khi tải danh sách N lớp học bằng 1 câu truy vấn rồi chạy vòng lặp `for` gọi thêm N câu truy vấn lẻ tẻ để lấy giảng viên của từng lớp',
            'Khi gộp dữ liệu bằng `JOIN` hoặc `WHERE id = ANY(...)` trong một lượt truy vấn',
          ],
          correctIndex: 2,
          explanationMd: 'Gom truy vấn theo lô (`inArray` / `JOIN`) biến N+1 chuyến đi mạng về 1–2 truy vấn cố định.',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Trong chỉ mục phức hợp `INDEX (cohort_id, session_order)`, câu truy vấn nào tận dụng hiệu quả nhất thứ tự cột dẫn đầu (Leading Column)?',
          options: [
            'Truy vấn chỉ lọc theo `title LIKE \'%RAG%\'`',
            'Truy vấn chỉ lọc theo `duration_seconds > 1000`',
            'Truy vấn không có `WHERE` và không có `ORDER BY`',
            'Truy vấn lọc `WHERE cohort_id = $1 ORDER BY session_order ASC`',
          ],
          correctIndex: 3,
          explanationMd: 'B-Tree sắp xếp theo cột dẫn đầu `cohort_id` trước rồi đến `session_order`, khớp hoàn hảo cả lọc lẫn sắp xếp.',
          reviewJumpSec: 1120,
        },
      ],
    },
    {
      sessionOrder: 3,
      topic: 'Giao dịch ACID, Khóa SELECT FOR UPDATE & Idempotent Webhook',
      primarySkillId: skSysDesign!.id,
      secondarySkillId: skSqlVec!.id,
      attachmentFileName: 'SWE_S03_ACID_Locking_Idempotent_Webhook.pdf',
      chunkContent:
        'Cổng thanh toán SePay có thể gửi lại cùng một thông báo giao dịch nhiều lần khi mạng chập chờn (At-least-once delivery). Do đó xử lý Webhook bắt buộc phải thực thi trong một giao dịch DB sử dụng khóa dòng SELECT ... FOR UPDATE trên đơn hàng, kiểm tra số tiền chuyển thực tế >= học phí yêu cầu (chặn giao dịch 0đ hoặc thiếu tiền) và ràng buộc UNIQUE trên gateway_txn_id + enrollments(account_id, cohort_id).',
      questions: [
        {
          prompt: 'Vì sao endpoint nhận **Payment Webhook** từ cổng thanh toán bắt buộc phải thiết kế đảm bảo tính **Idempotency**?',
          options: [
            'Vì nhà cung cấp webhook áp dụng cơ chế gửi lại (retry) khi timeout mạng, nên cùng một biên lai có thể đến máy chủ 2–3 lần đồng thời',
            'Vì webhook chỉ hoạt động vào giờ hành chính',
            'Vì giao thức HTTP không hỗ trợ truyền số nguyên',
            'Để không cần lưu lịch sử giao dịch vào bảng `payment_transactions`',
          ],
          correctIndex: 0,
          explanationMd: 'Idempotency đảm bảo dù nhận lại biên lai bao nhiêu lần, đơn hàng chỉ kích hoạt đúng một lần và sĩ số lớp không bị cộng dồn sai.',
          reviewJumpSec: 225,
        },
        {
          prompt: 'Lỗ hổng logic nào xảy ra nếu hàm đối soát thanh toán viết `effectiveAmount = transferAmount > 0 ? transferAmount : order.amountVnd`?',
          options: [
            'Đơn hàng có học phí cao sẽ được giảm giá 50%',
            'Kẻ tấn công hoặc gói tin lỗi có `transferAmount = 0` lại được gán bằng đúng `order.amountVnd` và mở khóa học miễn phí!',
            'PostgreSQL tự động từ chối mọi giao dịch có số chẵn',
            'Hệ thống gửi thông báo email chậm hơn 5 giây',
          ],
          correctIndex: 1,
          explanationMd: 'Phải kiểm tra trực tiếp `transferAmount > 0 && transferAmount >= order.amountVnd` trên số tiền thực nhận.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Đặt `SELECT ... FROM orders WHERE id = $1 FOR UPDATE` bên trong `db.transaction` giải quyết lỗi đua tranh (Race Condition) nào?',
          options: [
            'Tự động tăng tốc độ dựng giao diện CSS',
            'Cho phép hai giao dịch đồng thời cùng thấy `status = PENDING` và cùng cộng `enrolled_count + 1` hai lần',
            'Tuần tự hóa các giao dịch chạm vào cùng một đơn hàng để giao dịch thứ hai thấy ngay trạng thái `PAID` đã cập nhật và không cộng trùng sĩ số/lượt phỏng vấn',
            'Xóa bỏ hoàn toàn nhu cầu dùng khóa chính trên bảng `orders`',
          ],
          correctIndex: 2,
          explanationMd: 'Row-level pessimistic lock (`FOR UPDATE`) ngăn hai tiến trình đọc cùng trạng thái cũ `PENDING` song song.',
          reviewJumpSec: 860,
        },
        {
          prompt: 'Khi khách hàng chuyển khoản thiếu (ví dụ đơn `10.000đ` nhưng chỉ chuyển `5.000đ`), hệ thống chuẩn phải xử lý ra sao?',
          options: [
            'Vẫn mở khóa lớp học bình thường rồi ghi chú nhắc sau',
            'Vứt bỏ gói tin webhook không lưu lại dấu vết nào',
            'Tự động khóa vĩnh viễn tài khoản của học viên',
            'Ghi nhận bản ghi `payment_transactions` với `match_status = AMOUNT_MISMATCH`, giữ đơn ở `PENDING` và không tạo `enrollment` để Admin đối soát',
          ],
          correctIndex: 3,
          explanationMd: 'Lưu biên lai `AMOUNT_MISMATCH` giúp kế toán/Admin có đầy đủ bằng chứng đối soát và hoàn/bù tiền minh bạch.',
          reviewJumpSec: 1140,
        },
      ],
    },
    {
      sessionOrder: 4,
      topic: 'Chiến lược Caching Đa tầng với Redis & Hàng đợi Bất đồng bộ',
      primarySkillId: skSysDesign!.id,
      secondarySkillId: skNode!.id,
      attachmentFileName: 'SWE_S04_Redis_Caching_Queues.pdf',
      chunkContent:
        'Mẫu Cache-Aside đọc dữ liệu từ Redis trước, nếu miss mới đọc PostgreSQL rồi nạp lại vào Redis kèm TTL hợp lý. Các tác vụ nặng như trích xuất phụ đề video hay băm tài liệu PDF cần đẩy vào hàng đợi bất đồng bộ để API phản hồi nhanh.',
      questions: [
        {
          prompt: 'Hiện tượng **Cache Stampede** xảy ra khi nào trên hệ thống có lưu lượng truy cập lớn?',
          options: [
            'Khi một khóa cache cực nóng vừa hết hạn TTL khiến hàng nghìn request đồng thời cùng trượt cache và ập thẳng xuống PostgreSQL',
            'Khi dung lượng Redis sử dụng dưới 1% bộ nhớ',
            'Khi chỉ có một người dùng duy nhất truy cập trang chủ',
            'Khi đặt mật khẩu xác thực cho máy chủ Redis',
          ],
          correctIndex: 0,
          explanationMd: 'Có thể khắc phục bằng khóa đơn (single-flight / mutex lock) hoặc làm mới sớm kèm jitter cho TTL.',
          reviewJumpSec: 240,
        },
        {
          prompt: 'Tác vụ nào sau đây phù hợp nhất để tách sang **Background Worker / Queue** thay vì bắt HTTP request chờ đồng bộ?',
          options: [
            'Kiểm tra mật khẩu đăng nhập của người dùng',
            'Trả thông tin hồ sơ cơ bản `GET /auth/me`',
            'Xử lý hậu kỳ bản ghi video bài giảng, sinh phụ đề VTT và băm vector tài liệu đưa vào kho RAG',
            'Kiểm tra quyền truy cập của middleware JWT',
          ],
          correctIndex: 2,
          explanationMd: 'Xử lý media/embedding kéo dài nhiều giây đến nhiều phút nên cần chạy nền và cập nhật trạng thái bất đồng bộ.',
          reviewJumpSec: 560,
        },
        {
          prompt: 'Khi dữ liệu gốc của khóa học trong PostgreSQL vừa được Admin chỉnh sửa, thao tác nào trên Redis giúp tránh hiển thị dữ liệu cũ (Stale Data)?',
          options: [
            'Tăng TTL của khóa cũ lên 30 ngày',
            'Chủ động xóa (invalidate) hoặc cập nhật khóa cache liên quan ngay sau khi giao dịch DB commit thành công',
            'Tắt kiểm tra chữ ký JWT của Admin',
            'Chặn không cho học viên tải lại trang',
          ],
          correctIndex: 1,
          explanationMd: 'Cache invalidation sau khi commit đảm bảo lần đọc kế tiếp lấy đúng dữ liệu mới nhất từ PostgreSQL.',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Trong cấu hình kết nối Redis cho môi trường dev/production, thiết lập nào tránh làm treo cứng API nếu Redis tạm thời chưa bật?',
          options: [
            'Đặt vòng lặp chờ vô tận trước khi khởi động HTTP server',
            'Gửi mật khẩu trống lên cổng PostgreSQL',
            'Xóa toàn bộ log lỗi của ứng dụng',
            'Sử dụng `lazyConnect: true` kết hợp giới hạn `maxRetriesPerRequest` và bắt sự kiện `error` an toàn',
          ],
          correctIndex: 3,
          explanationMd: 'Cấu hình kết nối mềm dẻo giúp các luồng cốt lõi trên PostgreSQL vẫn hoạt động khi Redis bảo trì.',
          reviewJumpSec: 1110,
        },
      ],
    },
    {
      sessionOrder: 5,
      topic: 'Bảo mật API (JWT, RBAC, Ownership Check) & Docker Production',
      primarySkillId: skDocker!.id,
      secondarySkillId: skNode!.id,
      attachmentFileName: 'SWE_S05_API_Security_RBAC_Docker.pdf',
      chunkContent:
        'Kiểm tra vai trò RBAC (như role === INSTRUCTOR hoặc STUDENT) là chưa đủ nếu thiếu kiểm tra quyền sở hữu tài nguyên (Object-level Authorization / chống lỗi IDOR): giảng viên chỉ được sửa đợt học do mình phụ trách, học viên chỉ được xem đơn hàng và phiên phỏng vấn của chính mình.',
      questions: [
        {
          prompt: 'Lỗ hổng **IDOR (Broken Object Level Authorization)** xuất hiện khi nào trong API?',
          options: [
            'Khi API xác thực người dùng đã đăng nhập nhưng quên kiểm tra `resource.accountId === req.user.id` (hoặc `cohort.instructorId === req.user.id`), cho phép xem/sửa dữ liệu của người khác chỉ bằng cách đổi ID trên URL',
            'Khi đặt thời hạn sống cho Access Token là 15 phút',
            'Khi mã hóa mật khẩu bằng thuật toán Argon2id',
            'Khi bật header bảo mật Helmet trên Express',
          ],
          correctIndex: 0,
          explanationMd: 'Luôn phải kết hợp cả kiểm tra vai trò (RBAC) lẫn kiểm tra quyền sở hữu/ghi danh trên từng đối tượng dữ liệu.',
          reviewJumpSec: 215,
        },
        {
          prompt: 'Tại sao giải mã Google ID Token chỉ bằng `Buffer.from(token.split(".")[1], "base64url")` mà không xác thực chữ ký là lỗ hổng nghiêm trọng?',
          options: [
            'Vì Base64 không đọc được ký tự tiếng Anh',
            'Vì bất kỳ ai cũng tự tạo được chuỗi JSON giả chứa email Admin rồi mã hóa Base64 để chiếm quyền tài khoản mà không cần mật khẩu',
            'Vì hàm `split` làm chậm CPU của máy chủ',
            'Vì Google Token không chứa trường `email`',
          ],
          correctIndex: 1,
          explanationMd: 'JWT bắt buộc phải được xác thực chữ ký mật mã (JWKS / Google token verification) cùng `aud`, `iss` và `exp`.',
          reviewJumpSec: 530,
        },
        {
          prompt: 'Lợi ích chính của **Multi-stage Dockerfile** khi đóng gói dịch vụ Node.js/TypeScript lên Production là gì?',
          options: [
            'Giữ nguyên toàn bộ trình biên dịch và thư mục tạm làm ảnh container nặng gấp 5 lần',
            'Bỏ qua bước cài đặt thư viện phụ thuộc của ứng dụng',
            'Tách giai đoạn build TypeScript khỏi ảnh chạy thực tế, chỉ giữ lại mã đã biên dịch và dependencies cần thiết giúp ảnh nhẹ và giảm bề mặt tấn công',
            'Cho phép ghi cứng khóa bí mật đám mây trực tiếp vào lịch sử Git',
          ],
          correctIndex: 2,
          explanationMd: 'Multi-stage build giúp container gọn nhẹ, khởi động nhanh và an toàn hơn.',
          reviewJumpSec: 840,
        },
        {
          prompt: 'Khi tải tệp video bản ghi buổi học dung lượng hàng trăm MB lên Cloudflare R2, phương án kiến trúc nào tránh làm nghẽn bộ nhớ Node.js/Nginx?',
          options: [
            'Mã hóa cả tệp video sang chuỗi Base64 nhét vào body JSON gửi qua Express',
            'Lưu tệp video vào cột `VARCHAR` trong bảng `accounts`',
            'Chia nhỏ video gửi qua tham số query string trên URL',
            'Backend cấp **Presigned PUT URL** có thời hạn ngắn để trình duyệt tải luồng nhị phân trực tiếp lên R2 rồi xác nhận metadata về API',
          ],
          correctIndex: 3,
          explanationMd: 'Presigned URL giải phóng hoàn toàn băng thông và bộ nhớ đệm của tầng máy chủ ứng dụng.',
          reviewJumpSec: 1120,
        },
      ],
    },
    {
      sessionOrder: 6,
      topic: 'Kiểm thử Chịu tải (Load Testing) & Tổng kết Kiến trúc Hệ thống',
      primarySkillId: skSysDesign!.id,
      secondarySkillId: skDocker!.id,
      attachmentFileName: 'SWE_S06_Load_Testing_Observability.pdf',
      chunkContent:
        'Khi đánh giá hiệu năng API bằng công cụ kiểm thử chịu tải, độ trễ phân vị p95 và p99 phản ánh trải nghiệm thực của nhóm yêu cầu chậm nhất chính xác hơn nhiều so với số trung bình cộng dễ bị che lấp. Endpoint /health/live và /health/ready tách biệt kiểm tra tiến trình sống với kiểm tra kết nối DB/Redis sẵn sàng nhận tải.',
      questions: [
        {
          prompt: 'Vì sao trong kỹ thuật hệ thống, chỉ số độ trễ **p95 / p99** quan trọng hơn độ trễ trung bình (`average`)?',
          options: [
            'Vì số trung bình dễ che giấu việc 5% yêu cầu quan trọng (như thanh toán, nộp bài thi) đang bị treo nhiều giây',
            'Vì p95 luôn nhỏ hơn độ trễ tối thiểu của mạng',
            'Vì PostgreSQL chỉ cho phép đo p99 mà không tính được trung bình',
            'Vì p95 không phụ thuộc vào truy vấn cơ sở dữ liệu',
          ],
          correctIndex: 0,
          explanationMd: 'Theo dõi phân vị đuôi (tail latency) giúp phát hiện sớm hiện tượng tranh chấp khóa và thiếu chỉ mục.',
          reviewJumpSec: 230,
        },
        {
          prompt: 'Sự khác biệt chuẩn giữa `/health/live` (Liveness) và `/health/ready` (Readiness) trong vận hành container là gì?',
          options: [
            'Hai đường dẫn bắt buộc trả kết quả ngẫu nhiên khác nhau',
            '`/health/live` cho biết tiến trình ứng dụng còn phản hồi, còn `/health/ready` kiểm tra các phụ thuộc cốt lõi (như PostgreSQL) đã sẵn sàng phục vụ lưu lượng thật chưa',
            '`/health/ready` dùng để xóa toàn bộ dữ liệu mẫu khi được gọi',
            '`/health/live` chỉ dành cho trình duyệt di động',
          ],
          correctIndex: 1,
          explanationMd: 'Tách biệt Liveness và Readiness tránh việc bộ điều phối khởi động lại container oan khi DB đang bảo trì ngắn.',
          reviewJumpSec: 550,
        },
        {
          prompt: 'Ràng buộc `EXCLUDE USING gist (instructor_id WITH =, tstzrange(scheduled_start, scheduled_end, \'[)\') WITH &&)` trên bảng `class_sessions` đảm bảo điều gì?',
          options: [
            'Một giảng viên chỉ được dạy tối đa 1 buổi trong cả năm',
            'Hai giảng viên khác nhau không được dạy cùng khung giờ tối',
            'Chặn tuyệt đối ngay tại tầng PostgreSQL việc xếp trùng hoặc chồng lấn khung giờ dạy của cùng một giảng viên giữa mọi đợt học',
            'Tự động đổi múi giờ của máy chủ sang giờ London',
          ],
          correctIndex: 2,
          explanationMd: 'GiST Exclusion Constraint bảo vệ tính bất khả xâm phạm của lịch giảng dạy ngay cả khi hai Admin thao tác cùng lúc.',
          reviewJumpSec: 860,
        },
        {
          prompt: 'Nguyên tắc an toàn nào cần tuân thủ tuyệt đối đối với khóa kết nối Cloud (R2, LiveKit, SePay, JWT, Gemini)?',
          options: [
            'Gán cứng khóa thật trực tiếp trong mã nguồn TypeScript và đẩy lên kho mã công khai',
            'Gửi toàn bộ khóa bí mật máy chủ xuống `localStorage` của trình duyệt',
            'In toàn bộ khóa bí mật ra giao diện trang chủ để tiện kiểm tra',
            'Đọc từ biến môi trường `.env` nằm trong `.gitignore`, chỉ giữ giá trị mẫu an toàn trong `.env.example`',
          ],
          correctIndex: 3,
          explanationMd: 'Tách biệt cấu hình bí mật khỏi mã nguồn là nguyên tắc cốt lõi của Twelve-Factor App.',
          reviewJumpSec: 1130,
        },
      ],
    },
  ];

  const dataModules: CourseTopicQuestionSeed[] = [
    {
      sessionOrder: 1,
      topic: 'Kiến trúc Data Lakehouse & Mô hình Medallion (Bronze, Silver, Gold)',
      primarySkillId: skDbt!.id,
      secondarySkillId: skSparkKafka!.id,
      attachmentFileName: 'DATA_S01_Medallion_Lakehouse_Architecture.pdf',
      chunkContent:
        'Kiến trúc Medallion trong Data Lakehouse chia dữ liệu thành 3 tầng rõ rệt: tầng Bronze lưu nguyên trạng dữ liệu thô bất biến để có thể phát lại (replay), tầng Silver làm sạch, khử trùng lặp và chuẩn hóa kiểu dữ liệu, còn tầng Gold tổng hợp các bảng chiều và sự kiện (Star Schema) phục vụ trực tiếp BI và AI Feature Store.',
      questions: [
        {
          prompt: 'Trong kiến trúc **Medallion Lakehouse**, vai trò cốt lõi của tầng **Bronze** là gì?',
          options: [
            'Lưu trữ nguyên bản dữ liệu thô thu thập từ nguồn kèm metadata thời gian nạp để luôn có thể chạy lại (replay/backfill) khi logic biến đổi thay đổi',
            'Chỉ lưu các biểu đồ tổng hợp doanh thu theo quý cho ban giám đốc',
            'Xóa sạch mọi trường JSON chưa qua chuẩn hóa ngay khi tiếp nhận',
            'Thay thế hoàn toàn hệ thống giao dịch OLTP của ứng dụng web',
          ],
          correctIndex: 0,
          explanationMd: 'Giữ nguyên dữ liệu thô ở tầng Bronze giúp không bao giờ mất dữ liệu gốc nếu code làm sạch ở tầng sau có lỗi.',
          reviewJumpSec: 210,
        },
        {
          prompt: 'Bước khử trùng lặp bản ghi (`deduplication`), chuẩn hóa múi giờ và kiểm tra kiểu dữ liệu diễn ra chủ yếu ở tầng nào?',
          options: ['Trước khi sự kiện sinh ra trên thiết bị người dùng', 'Tầng Silver (Cleaned & Conformed)', 'Trong trình duyệt CSS', 'Trên máy in văn phòng'],
          correctIndex: 1,
          explanationMd: 'Tầng Silver biến dữ liệu thô thành nguồn dữ liệu sạch, đồng nhất và đáng tin cậy cho toàn doanh nghiệp.',
          reviewJumpSec: 520,
        },
        {
          prompt: 'Định dạng lưu trữ cột (Columnar Storage) như **Apache Parquet** vượt trội hơn tệp **CSV** trong xử lý phân tích dữ liệu lớn nhờ đặc điểm nào?',
          options: [
            'Mở chỉnh sửa tay bằng Notepad dễ hơn CSV',
            'Không lưu kèm thông tin kiểu dữ liệu của từng cột',
            'Nén dữ liệu cực tốt theo từng cột và hỗ trợ Predicate/Projection Pushdown chỉ đọc đúng các cột và phân vùng cần thiết',
            'Tự động biến mọi cột số thành chuỗi văn bản không dấu',
          ],
          correctIndex: 2,
          explanationMd: 'Đọc theo cột giúp truy vấn phân tích giảm hàng chục lần lượng I/O đĩa so với quét toàn dòng CSV.',
          reviewJumpSec: 830,
        },
        {
          prompt: 'Tính chất **Idempotent Pipeline** khi nạp dữ liệu theo ngày (`partition_date`) đảm bảo điều gì khi job chạy lại lần thứ hai cho cùng ngày `2026-12-05`?',
          options: [
            'Số dòng báo cáo doanh thu ngày hôm đó tự động tăng gấp đôi',
            'Xóa sạch dữ liệu của tất cả các tháng trước đó',
            'Đổi ngẫu nhiên mã khách hàng trong kho dữ liệu',
            'Kết quả cuối cùng không bị nhân bản dữ liệu nhờ cơ chế ghi đè theo phân vùng hoặc `MERGE / UPSERT` theo khóa nghiệp vụ',
          ],
          correctIndex: 3,
          explanationMd: 'Idempotency là yêu cầu sống còn để vận hành backfill và retry tự động trong Data Engineering.',
          reviewJumpSec: 1110,
        },
      ],
    },
    {
      sessionOrder: 2,
      topic: 'Xử lý Dữ liệu Phân tán Quy mô lớn với Apache Spark & PySpark',
      primarySkillId: skSparkKafka!.id,
      secondarySkillId: skPython!.id,
      attachmentFileName: 'DATA_S02_PySpark_DAG_DataSkew.pdf',
      chunkContent:
        'Trong Apache Spark, các phép biến đổi hẹp (Narrow Transformation như filter, select, withColumn) xử lý ngay trên từng phân vùng cục bộ, trong khi phép biến đổi rộng (Wide Transformation như groupBy, join lớn) phát sinh Shuffle truyền dữ liệu qua mạng giữa các Executor. Khi nối một bảng sự kiện tỷ dòng với một bảng danh mục nhỏ vài chục MB, Broadcast Join giúp loại bỏ hoàn toàn bước Shuffle bảng lớn.',
      questions: [
        {
          prompt: 'Phép toán nào trong **PySpark** là **Wide Transformation** gây phát sinh chi phí truyền dữ liệu qua mạng (**Shuffle**) giữa các node?',
          options: ['`df.filter(...)`', '`df.select(...)`', '`df.groupBy("course_id").agg(...)`', '`df.withColumn(...)` đơn thuần'],
          correctIndex: 2,
          explanationMd: '`groupBy` cần gom các bản ghi cùng khóa từ nhiều phân vùng khác nhau về cùng Executor nên phát sinh Shuffle.',
          reviewJumpSec: 220,
        },
        {
          prompt: 'Khi nối bảng sự kiện lớn (500GB) với bảng danh mục khóa học nhỏ (5MB) trong PySpark, kỹ thuật tối ưu nào triệt tiêu Shuffle trên bảng 500GB?',
          options: [
            'Sử dụng `broadcast(small_df)` để thực hiện **Broadcast Hash Join**',
            'Chuyển toàn bộ bảng 500GB về máy Driver bằng `.toPandas()`',
            'Chia bảng 5MB thành 100.000 phân vùng nhỏ',
            'Dùng vòng lặp `for` của Python quét từng dòng',
          ],
          correctIndex: 0,
          explanationMd: 'Broadcast gửi bản sao bảng nhỏ tới mọi Executor để nối cục bộ ngay tại chỗ.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Hiện tượng **Data Skew** trong Spark biểu hiện rõ nhất qua dấu hiệu vận hành nào?',
          options: [
            'Tất cả các task hoàn thành nhanh đồng đều trong 1 giây',
            '99/100 task đã xong từ lâu nhưng toàn bộ job bị treo chờ 1 task cuối cùng xử lý một khóa có lượng dữ liệu lệch khổng lồ (ví dụ `user_id = NULL`)',
            'Spark UI không hiển thị tên ứng dụng',
            'Tệp cấu hình thiếu biến màu sắc giao diện',
          ],
          correctIndex: 1,
          explanationMd: 'Một khóa nóng gom quá nhiều bản ghi vào duy nhất một phân vùng làm nghẽn tiến trình và gây tràn bộ nhớ (OOM).',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Vì sao nên ưu tiên dùng các hàm dựng sẵn trong `pyspark.sql.functions` thay vì viết **Python UDF** thuần túy trên từng dòng?',
          options: [
            'Vì Python UDF không thể nhận tham số kiểu chuỗi',
            'Vì `pyspark.sql.functions` chỉ chạy được trên hệ điều hành Windows',
            'Vì Python UDF tự động xóa cột khóa chính của DataFrame',
            'Vì hàm gốc thực thi trực tiếp trên Catalyst Optimizer / JVM tốc độ cao, tránh chi phí tuần tự hóa dữ liệu qua lại giữa JVM và tiến trình Python',
          ],
          correctIndex: 3,
          explanationMd: 'Tránh serialization JVM <-> Python giúp job PySpark nhanh hơn gấp nhiều lần.',
          reviewJumpSec: 1130,
        },
      ],
    },
    {
      sessionOrder: 3,
      topic: 'Xử lý Luồng Sự kiện Thời gian thực với Apache Kafka',
      primarySkillId: skSparkKafka!.id,
      secondarySkillId: skSysDesign!.id,
      attachmentFileName: 'DATA_S03_Kafka_Streaming_Architecture.pdf',
      chunkContent:
        'Apache Kafka đảm bảo thứ tự sự kiện nghiêm ngặt trong phạm vi từng Partition dựa trên khóa thông điệp (message key). Trong một Consumer Group, mỗi Partition tại một thời điểm chỉ được gán cho tối đa một Consumer trong nhóm để mở rộng xử lý song song mà không bị đọc chồng chéo.',
      questions: [
        {
          prompt: 'Để mọi sự kiện hành vi học tập của cùng một `account_id` luôn được đọc đúng thứ tự thời gian trên **Apache Kafka**, cần cấu hình gì khi gửi message?',
          options: [
            'Đặt `account_id` làm **Message Key** để mọi sự kiện của học viên đó luôn đi vào cùng một Partition',
            'Gửi ngẫu nhiên không có key lên 50 topic khác nhau',
            'Xóa timestamp khỏi payload của sự kiện',
            'Chỉ cho phép hệ thống gửi 1 sự kiện mỗi giờ',
          ],
          correctIndex: 0,
          explanationMd: 'Kafka cam kết thứ tự bất biến bên trong từng Partition và băm `message key` cố định về đúng Partition đó.',
          reviewJumpSec: 215,
        },
        {
          prompt: 'Nếu một Kafka Topic có **6 Partitions** và một **Consumer Group** có **8 Consumer instances** cùng đăng ký đọc topic đó thì điều gì xảy ra?',
          options: [
            'Cả 8 Consumer cùng đọc trùng toàn bộ 6 Partitions',
            '6 Consumer được gán mỗi instance 1 Partition, còn 2 Consumer ở trạng thái chờ dự phòng (idle standby)',
            'Kafka tự động dừng hoạt động và xóa topic',
            '2 Consumer dư ra sẽ tự động đọc dữ liệu của topic khác',
          ],
          correctIndex: 1,
          explanationMd: 'Đơn vị song song tối đa trong một Consumer Group bằng số lượng Partition của topic.',
          reviewJumpSec: 530,
        },
        {
          prompt: 'Trong xử lý luồng thời gian thực (**Spark Structured Streaming**), cơ chế **Watermarking** dùng để giải quyết bài toán nào?',
          options: [
            'Đóng dấu bản quyền hình ảnh lên video bài giảng',
            'Nén tệp văn bản sang định dạng ZIP',
            'Xử lý các sự kiện đến trễ theo `event_time` trong một ngưỡng cho phép mà vẫn dọn dẹp được trạng thái cửa sổ cũ trên bộ nhớ',
            'Thay đổi cổng mạng mặc định của cụm Kafka',
          ],
          correctIndex: 2,
          explanationMd: 'Watermark cân bằng giữa việc chấp nhận dữ liệu đến muộn và giới hạn kích thước state trên RAM.',
          reviewJumpSec: 840,
        },
        {
          prompt: 'Sai lầm nào khi commit offset trong Kafka Consumer dễ dẫn đến **mất dữ liệu chưa kịp ghi xuống kho đích**?',
          options: [
            'Chỉ commit offset sau khi đã ghi lô dữ liệu xuống đích thành công',
            'Sử dụng checkpoint bền vững của Structured Streaming',
            'Thiết kế đích nhận dữ liệu có tính Idempotent',
            'Commit offset tự động ngay khi vừa nhận bản tin về RAM trước cả khi bước xử lý và ghi xuống cơ sở dữ liệu hoàn tất',
          ],
          correctIndex: 3,
          explanationMd: 'Nếu tiến trình gặp sự cố sau khi đã commit sớm, lần khởi động lại sẽ bỏ qua lô dữ liệu chưa kịp lưu.',
          reviewJumpSec: 1120,
        },
      ],
    },
    {
      sessionOrder: 4,
      topic: 'Analytics Engineering: Chuẩn hóa Kho Dữ liệu Star Schema với dbt',
      primarySkillId: skDbt!.id,
      secondarySkillId: skSqlVec!.id,
      attachmentFileName: 'DATA_S04_dbt_StarSchema_DataQuality.pdf',
      chunkContent:
        'Công cụ dbt (Data Build Tool) đưa quy trình kỹ thuật phần mềm vào kho dữ liệu: quản lý biến đổi SQL theo DAG qua hàm ref(), xây dựng mô hình Star Schema gồm bảng sự kiện Fact và bảng chiều Dimension, chạy Incremental models cho bảng lớn và kiểm định chất lượng dữ liệu tự động (not_null, unique, relationships, accepted_values).',
      questions: [
        {
          prompt: 'Hàm `{{ ref("stg_orders") }}` trong mô hình **dbt** mang lại giá trị cốt lõi nào so với việc viết cứng tên bảng vật lý?',
          options: [
            'Tự động xây dựng đồ thị phụ thuộc (Lineage DAG) để dbt chạy đúng thứ tự các bảng và tách biệt môi trường dev/prod linh hoạt',
            'Tự động gửi email quảng cáo cho khách hàng',
            'Tắt toàn bộ ràng buộc kiểm tra dữ liệu của kho dữ liệu',
            'Biến câu lệnh SQL thành mã giao diện HTML',
          ],
          correctIndex: 0,
          explanationMd: '`ref()` là nền tảng để dbt quản lý thứ tự thực thi DAG và sinh tài liệu Data Lineage trực quan.',
          reviewJumpSec: 230,
        },
        {
          prompt: 'Trong thiết kế **Star Schema** cho nền tảng giáo dục, bảng nào sau đây đóng vai trò là **Fact Table**?',
          options: [
            '`dim_categories` mô tả danh mục ngành học',
            '`fct_assessment_attempts` ghi nhận từng sự kiện nộp bài kiểm tra kèm điểm số, thời gian làm bài và khóa ngoại trỏ tới học viên/khóa học',
            '`dim_instructors` lưu tiểu sử giảng viên',
            'Bảng cấu hình giao diện màu sắc hệ thống',
          ],
          correctIndex: 1,
          explanationMd: 'Bảng Fact chứa các sự kiện đo lường định lượng phát sinh liên tục theo thời gian.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Khi bảng sự kiện có hàng trăm triệu dòng mỗi tháng, chế độ materialization nào trong **dbt** tránh phải dựng lại toàn bộ bảng từ đầu mỗi lần chạy?',
          options: ['`ephemeral` cho mọi bảng đích cuối cùng', '`view` không có chỉ mục', '`incremental` kết hợp điều kiện `is_incremental()`', 'Xóa bảng thủ công bằng tay mỗi giờ'],
          correctIndex: 2,
          explanationMd: '`incremental` chỉ biến đổi và hợp nhất các bản ghi mới/thay đổi kể từ mốc chạy gần nhất.',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Bộ 4 bài kiểm thử chất lượng dữ liệu dựng sẵn (generic schema tests) tiêu chuẩn trong tệp `.yml` của **dbt** bao gồm những gì?',
          options: [
            '`bold`, `italic`, `underline`, `color`',
            '`start`, `stop`, `restart`, `pause`',
            '`get`, `post`, `put`, `delete`',
            '`unique`, `not_null`, `accepted_values`, `relationships`',
          ],
          correctIndex: 3,
          explanationMd: '4 kiểm thử cốt lõi này phát hiện ngay dữ liệu rỗng, trùng khóa, sai danh mục và đứt khóa ngoại trên đường ống.',
          reviewJumpSec: 1110,
        },
      ],
    },
    {
      sessionOrder: 5,
      topic: 'Đồng bộ Feature Store & Vector Store từ tầng Gold cho Hệ thống AI',
      primarySkillId: skSqlVec!.id,
      secondarySkillId: skDbt!.id,
      attachmentFileName: 'DATA_S05_Gold_To_Pgvector_Sync.pdf',
      chunkContent:
        'Để tránh tính toán lại vector nhúng tốn kém cho hàng vạn tài liệu không thay đổi, đường ống đồng bộ từ kho dữ liệu sang PostgreSQL pgvector lưu mã băm SHA-256 content_hash của văn bản chuẩn hóa: chỉ những đoạn có content_hash mới hoặc thay đổi mới được đưa qua bước sinh embedding và cập nhật.',
      questions: [
        {
          prompt: 'Lưu cột `content_hash` (SHA-256 64 ký tự hex) trên bảng `knowledge_chunks` giúp tối ưu bước đồng bộ đường ống dữ liệu RAG như thế nào?',
          options: [
            'Chỉ tính lại vector embedding cho những đoạn nội dung thực sự mới hoặc vừa chỉnh sửa, bỏ qua các đoạn không đổi mã băm',
            'Thay thế hoàn toàn cột nội dung văn bản `content`',
            'Làm cho câu lệnh SQL không cần dùng điều kiện `WHERE`',
            'Tự động dịch tài liệu tiếng Việt sang tiếng Pháp',
          ],
          correctIndex: 0,
          explanationMd: 'Change Detection bằng SHA-256 giúp tiết kiệm hơn 90% chi phí gọi mô hình nhúng khi chạy đồng bộ định kỳ.',
          reviewJumpSec: 220,
        },
        {
          prompt: 'Hiện tượng **Training-Serving Skew** trong hệ thống AI/ML xuất hiện khi nào?',
          options: [
            'Khi mô hình được đóng gói bằng Docker',
            'Khi công thức tính đặc trưng (feature) lúc huấn luyện offline khác lệch với công thức tính đặc trưng lúc suy luận thời gian thực trên production',
            'Khi lưu kết quả kiểm định vào bảng PostgreSQL',
            'Khi đặt lịch chạy pipeline vào ban đêm',
          ],
          correctIndex: 1,
          explanationMd: 'Feature Store thống nhất một định nghĩa biến đổi duy nhất cho cả luồng huấn luyện lẫn phục vụ trực tuyến.',
          reviewJumpSec: 530,
        },
        {
          prompt: 'Vì sao kiểu cột `VARCHAR(64)` phù hợp hơn `CHAR(64)` khi lưu mã băm linh hoạt hoặc định danh kiểm toàn vẹn trên PostgreSQL?',
          options: [
            'Vì `VARCHAR(64)` chiếm gấp 10 lần dung lượng ổ cứng so với `CHAR(64)`',
            'Vì `CHAR(64)` không cho phép tạo chỉ mục B-Tree',
            'Vì `CHAR(64)` tự động đệm khoảng trắng cho đủ 64 ký tự gây sai lệch khi so khớp chuỗi nếu dữ liệu ngắn hơn 64 ký tự, trong khi `VARCHAR(64)` giữ nguyên chuỗi gốc',
            'Vì `VARCHAR(64)` chỉ lưu được chữ số từ 0 đến 9',
          ],
          correctIndex: 2,
          explanationMd: 'Trên PostgreSQL, `CHAR(n)` (`bpchar`) độn dấu cách ở cuối và không mang lại lợi thế hiệu năng nào so với `VARCHAR(n)`.',
          reviewJumpSec: 840,
        },
        {
          prompt: 'Khi cập nhật hàng loạt bản ghi từ đường ống dữ liệu vào PostgreSQL, câu lệnh nào đảm bảo vừa hiệu năng cao vừa không lỗi trùng khóa?',
          options: [
            'Chạy từng lệnh `INSERT` rời rạc không bắt lỗi cho từng dòng qua mạng',
            'Xóa toàn bộ cơ sở dữ liệu rồi khởi tạo lại từ đầu mỗi phút',
            'Tắt xác thực mật khẩu của PostgreSQL',
            'Ghi theo lô (Batch Insert) kết hợp `ON CONFLICT (...) DO UPDATE` nguyên tử',
          ],
          correctIndex: 3,
          explanationMd: 'Batch Upsert giảm số vòng lặp mạng và đảm bảo tính bất biến khi đồng bộ lại.',
          reviewJumpSec: 1100,
        },
      ],
    },
    {
      sessionOrder: 6,
      topic: 'Vận hành, Giám sát SLA Đường ống Dữ liệu & Tổng ôn Cuối khóa',
      primarySkillId: skSparkKafka!.id,
      secondarySkillId: skDbt!.id,
      attachmentFileName: 'DATA_S06_Data_Observability_SLA.pdf',
      chunkContent:
        'Giám sát đường ống dữ liệu Production (Data Observability) theo dõi 5 trụ cột: độ tươi mới dữ liệu (Freshness), lưu lượng bản ghi bất thường (Volume), phân phối giá trị (Distribution), thay đổi lược đồ (Schema Drift) và phả hệ dữ liệu (Lineage) để khoanh vùng sự cố trước khi báo cáo sai lệch.',
      questions: [
        {
          prompt: 'Kỹ thuật **Write-Audit-Publish (WAP)** trong vận hành đường ống dữ liệu giúp ngăn chặn sự cố nào?',
          options: [
            'Ngăn dữ liệu lỗi hoặc thiếu phân vùng lọt thẳng ra bảng Gold đang phục vụ người dùng bằng cách kiểm định tự động trên nhánh tạm trước khi công bố',
            'Ngăn giảng viên tải slide PDF lên buổi học',
            'Ngăn học viên xem lại video bài giảng quá 2 lần',
            'Tự động giảm độ phân giải màn hình của người quản trị',
          ],
          correctIndex: 0,
          explanationMd: 'WAP đảm bảo chỉ những lô dữ liệu vượt qua đầy đủ bài kiểm tra chất lượng mới được xuất bản ra tầng Gold.',
          reviewJumpSec: 230,
        },
        {
          prompt: 'Khi nguồn thượng nguồn bất ngờ đổi tên cột hoặc đổi kiểu dữ liệu làm ảnh hưởng báo cáo hạ nguồn, sự cố này được gọi là gì?',
          options: ['Cache Hit', 'Schema Drift (Trôi lệch lược đồ)', 'Zero Downtime Deployment', 'Connection Pooling'],
          correctIndex: 1,
          explanationMd: 'Hợp đồng dữ liệu (Data Contracts) và kiểm tra lược đồ đầu nguồn giúp chặn sớm Schema Drift.',
          reviewJumpSec: 540,
        },
        {
          prompt: 'Chỉ số **Data Freshness SLA** phản ánh điều gì trên hệ thống Data Platform?',
          options: [
            'Số lượng màu sắc sử dụng trên trang chủ',
            'Tổng số dòng code CSS của giao diện quản trị',
            'Độ trễ tối đa cho phép kể từ khi sự kiện phát sinh tới khi dữ liệu sạch sẵn sàng truy vấn tại bảng đích',
            'Tốc độ quay của quạt tản nhiệt máy trạm cá nhân',
          ],
          correctIndex: 2,
          explanationMd: 'Cảnh báo sớm khi vi phạm Freshness SLA giúp đội ngũ xử lý đường ống bị trễ trước khi ảnh hưởng người dùng cuối.',
          reviewJumpSec: 850,
        },
        {
          prompt: 'Khi cần chạy **Backfill** tính toán lại dữ liệu lịch sử 6 tháng cho một mô hình mới, nguyên tắc an toàn nào cần đặt lên hàng đầu?',
          options: [
            'Chạy dồn toàn bộ 6 tháng trong một giao dịch khổng lồ duy nhất trên máy chủ OLTP chính vào giờ cao điểm',
            'Ghi đè trực tiếp không sao lưu và tắt toàn bộ bài kiểm tra chất lượng',
            'Sửa tay từng con số trên giao diện trình duyệt',
            'Chia nhỏ theo khoảng thời gian (chunking theo ngày/tuần), cô lập tài nguyên tính toán khỏi luồng trực tuyến và xác minh tính Idempotent',
          ],
          correctIndex: 3,
          explanationMd: 'Backfill theo từng phân vùng thời gian có kiểm soát tài nguyên giúp hệ thống trực tuyến không bị ảnh hưởng.',
          reviewJumpSec: 1120,
        },
      ],
    },
  ];

  // =========================================================================
  // 8. HELPER TO SEED SESSIONS, ATTACHMENTS, SUBTITLES, ASSESSMENTS & ITEMS
  // =========================================================================
  interface CohortSessionSpec {
    dateIso: string; // YYYY-MM-DD
    startUtcTime: string; // HH:MM:SS
    endUtcTime: string; // HH:MM:SS
    status: 'REPLAY_READY' | 'SCHEDULED' | 'LIVE';
  }

  interface SeedLectureVideoAsset {
    videoPath: string;
    vttPath: string;
    durationSeconds: number;
    cues: Array<{ startSec: number; endSec: number; slidePage: number; text: string }>;
  }

  const LECTURE_VIDEO_CATALOG: Record<string, SeedLectureVideoAsset> = {
    'ai-s01': {
      videoPath: '/videos/lectures/ai-s01-rag-architecture.mp4',
      vttPath: '/videos/lectures/ai-s01-rag-architecture.vtt',
      durationSeconds: 89,
      cues: [
        {
          startSec: 0,
          endSec: 35,
          slidePage: 1,
          text: 'Vì sao Mô hình Ngôn ngữ Lớn bị Ảo giác? Kiến trúc Production RAG tách biệt kho tri thức động pgvector khỏi trọng số LLM và ép trích dẫn nguồn [chunk_id, timestamp_sec].',
        },
        {
          startSec: 35,
          endSec: 62,
          slidePage: 2,
          text: 'Phân tách quyền truy cập tài liệu Multi-Tenant Isolation ngay tại tầng SQL: lọc cứng điều kiện visibility và course_id trước khi quét chỉ mục vector HNSW.',
        },
        {
          startSec: 62,
          endSec: 89,
          slidePage: 3,
          text: 'Đo lường định lượng chất lượng hệ thống RAG bằng bộ chỉ số RAGAS: Faithfulness và Context Recall, tự động từ chối lịch sự các truy vấn dưới ngưỡng tin cậy.',
        },
      ],
    },
    'ai-s02': {
      videoPath: '/videos/lectures/ai-s02-chunking-hnsw.mp4',
      vttPath: '/videos/lectures/ai-s02-chunking-hnsw.vtt',
      durationSeconds: 63,
      cues: [
        {
          startSec: 0,
          endSec: 31,
          slidePage: 1,
          text: 'Băm tài liệu bảo toàn cấu trúc (Structure-Aware Chunking): giữ nguyên bảng Markdown kèm tiêu đề mục cha và độ gối chồng chunk overlap 15% bảo toàn ngữ nghĩa.',
        },
        {
          startSec: 31,
          endSec: 63,
          slidePage: 2,
          text: 'Đồ thị phân tầng HNSW trên PostgreSQL pgvector (m=16, ef_construction=64): dùng trực tiếp toán tử khoảng cách cosine (<=>) không bọc hàm để kích hoạt Index Scan tốc độ mili-giây.',
        },
      ],
    },
    'ai-s03': {
      videoPath: '/videos/lectures/ai-s03-hybrid-search-rrf.mp4',
      vttPath: '/videos/lectures/ai-s03-hybrid-search-rrf.vtt',
      durationSeconds: 58,
      cues: [
        {
          startSec: 0,
          endSec: 31,
          slidePage: 1,
          text: 'Kết hợp tìm kiếm ngữ nghĩa Dense Vector và từ khóa Full-Text Search (tsvector GIN) qua công thức Reciprocal Rank Fusion RRF_score(d) = 1/(60 + rank_dense) + 1/(60 + rank_bm25).',
        },
        {
          startSec: 31,
          endSec: 58,
          slidePage: 2,
          text: 'Tinh lọc Top-20 ứng viên RRF qua tầng thứ hai là mô hình Cross-Encoder Reranker chấm điểm tương tác chéo (Query, Chunk) để chọn ra Top-4 đoạn chuẩn xác nhất.',
        },
      ],
    },
    'swe-s01': {
      videoPath: '/videos/lectures/swe-s01-clean-arch-postgres.mp4',
      vttPath: '/videos/lectures/swe-s01-clean-arch-postgres.vtt',
      durationSeconds: 51,
      cues: [
        {
          startSec: 0,
          endSec: 26,
          slidePage: 1,
          text: 'Clean Architecture & Chống Race Condition thanh toán: kết hợp khóa duy nhất gateway_txn_id và khóa dòng bi quan SELECT FOR UPDATE đảm bảo giao dịch ACID nguyên tử.',
        },
        {
          startSec: 26,
          endSec: 51,
          slidePage: 2,
          text: 'Chẩn đoán truy vấn chậm với EXPLAIN (ANALYZE, BUFFERS): kiểm tra shared hit/read và thiết kế chỉ mục tổ hợp (Composite Index) giảm độ trễ p99 xuống dưới 15ms.',
        },
      ],
    },
    'data-s01': {
      videoPath: '/videos/lectures/data-s01-streaming-lakehouse.mp4',
      vttPath: '/videos/lectures/data-s01-streaming-lakehouse.vtt',
      durationSeconds: 52,
      cues: [
        {
          startSec: 0,
          endSec: 31,
          slidePage: 1,
          text: 'Kiến trúc Medallion Lakehouse 3 tầng Bronze -> Silver -> Gold: lưu bất biến sự kiện thô tại Bronze và khử trùng lặp Idempotent Deduplication tại Silver.',
        },
        {
          startSec: 31,
          endSec: 52,
          slidePage: 2,
          text: 'Kiểm soát chất lượng dữ liệu tự động (Data Quality Gate): chốt chặn miền giá trị, tỷ lệ rỗng và giám sát độ tươi dữ liệu Freshness SLA trước khi xuất bản tầng Gold.',
        },
      ],
    },
    'py-s01': {
      videoPath: '/videos/lectures/py-s01-python-sql-analytics.mp4',
      vttPath: '/videos/lectures/py-s01-python-sql-analytics.vtt',
      durationSeconds: 53,
      cues: [
        {
          startSec: 0,
          endSec: 28,
          slidePage: 1,
          text: 'Xử lý dữ liệu hiệu năng cao trong Python: kết hợp Generator đọc theo lô (Batching), phép toán vector hóa và kiểm định kiểu dữ liệu Pydantic.',
        },
        {
          startSec: 28,
          endSec: 53,
          slidePage: 2,
          text: 'Phân tích chuyên sâu với CTE & SQL Window Functions: ứng dụng ROW_NUMBER, DENSE_RANK và LAG so sánh chênh lệch giữa các lần thi liên tiếp không cần Self-Join.',
        },
      ],
    },
  };

  function resolveSeedLectureAsset(r2Prefix: string, sessionOrder: number): SeedLectureVideoAsset {
    if (r2Prefix.startsWith('ai-')) {
      if (sessionOrder === 1) return LECTURE_VIDEO_CATALOG['ai-s01']!;
      if (sessionOrder === 2) return LECTURE_VIDEO_CATALOG['ai-s02']!;
      if (sessionOrder === 3) return LECTURE_VIDEO_CATALOG['ai-s03']!;
      return LECTURE_VIDEO_CATALOG[`ai-s0${((sessionOrder - 1) % 3) + 1}`]!;
    }
    if (r2Prefix.startsWith('swe-')) return LECTURE_VIDEO_CATALOG['swe-s01']!;
    if (r2Prefix.startsWith('data-')) return LECTURE_VIDEO_CATALOG['data-s01']!;
    return LECTURE_VIDEO_CATALOG['py-s01']!;
  }

  async function populateCohortCurriculum(params: {
    cohort: typeof cohortPyK01;
    course: typeof coursePython;
    r2Prefix: string;
    modules: CourseTopicQuestionSeed[];
    sessionSpecs: CohortSessionSpec[];
    finalExamStatus: 'PUBLISHED' | 'DRAFT';
  }) {
    const { cohort, course, r2Prefix, modules, sessionSpecs, finalExamStatus } = params;
    const syllabusList = (course!.syllabusTemplate ?? []) as Array<{
      order: number;
      title: string;
      description: string;
      activityTags: string[];
    }>;

    const insertedSessions = await db
      .insert(classSessions)
      .values(
        modules.map((mod, idx) => {
          const spec = sessionSpecs[idx]!;
          const syl = syllabusList[idx];
          const isReplay = spec.status === 'REPLAY_READY';
          const ordPad = String(mod.sessionOrder).padStart(2, '0');
          const videoAsset = resolveSeedLectureAsset(r2Prefix, mod.sessionOrder);
          return {
            cohortId: cohort!.id,
            instructorId: cohort!.instructorId,
            sessionOrder: mod.sessionOrder,
            activityTags: syl?.activityTags ?? ['THEORY', 'LIVE_CODING'],
            title: syl?.title ?? mod.topic,
            descriptionMd: syl?.description ?? mod.chunkContent,
            scheduledStart: new Date(`${spec.dateIso}T${spec.startUtcTime}Z`),
            scheduledEnd: new Date(`${spec.dateIso}T${spec.endUtcTime}Z`),
            status: spec.status,
            livekitRoomName: `${cohort!.code.toLowerCase()}-s${ordPad}`,
            videoProvider: isReplay ? ('R2_MP4' as const) : null,
            videoR2Key: isReplay ? videoAsset.videoPath : null,
            durationSeconds: isReplay ? videoAsset.durationSeconds : null,
            aiSummaryMd: isReplay ? mod.chunkContent : null,
          };
        })
      )
      .returning();

    // Attachments for ALL sessions (slides/handouts available before & after class)
    const insertedAttachments = await db
      .insert(sessionAttachments)
      .values(
        insertedSessions.map((sess, idx) => {
          const mod = modules[idx]!;
          const ordPad = String(mod.sessionOrder).padStart(2, '0');
          return {
            sessionId: sess.id,
            fileName: mod.attachmentFileName,
            r2ObjectKey: `materials/${r2Prefix}/s${ordPad}/${mod.attachmentFileName}`,
            mimeType: 'application/pdf',
            fileSizeBytes: 1850000 + idx * 120000,
            uploadedBy: cohort!.instructorId,
          };
        })
      )
      .returning();

    // Subtitles ONLY for REPLAY_READY sessions (pointing directly to real generated WebVTT files!)
    const replaySessions = insertedSessions.filter((s) => s.status === 'REPLAY_READY');
    if (replaySessions.length > 0) {
      await db.insert(sessionSubtitles).values(
        replaySessions.map((sess) => {
          const videoAsset = resolveSeedLectureAsset(r2Prefix, sess.sessionOrder);
          return {
            sessionId: sess.id,
            languageCode: 'vi',
            vttR2Key: videoAsset.vttPath,
            isAutoGenerated: true,
          };
        })
      );
    }

    // Knowledge chunks:
    // - REPLAY_READY sessions get synchronized VIDEO_TRANSCRIPT chunks matching exact MP4 slide timestamps
    // - SCHEDULED/LIVE sessions get ATTACHMENT_DOC chunks so enrolled RAG still works cleanly!
    const chunkRowsToInsert: Array<typeof knowledgeChunks.$inferInsert> = [];
    insertedSessions.forEach((sess, idx) => {
      const mod = modules[idx]!;
      const att = insertedAttachments[idx]!;
      const isReplay = sess.status === 'REPLAY_READY';
      if (isReplay) {
        const videoAsset = resolveSeedLectureAsset(r2Prefix, mod.sessionOrder);
        videoAsset.cues.forEach((cue, cueIdx) => {
          const cueText =
            cueIdx === 0
              ? `${course!.title} - Buổi ${mod.sessionOrder} (${mod.topic}): ${cue.text} ${mod.chunkContent}`
              : `${course!.title} - Buổi ${mod.sessionOrder} (Slide ${cue.slidePage}): ${cue.text}`;
          chunkRowsToInsert.push({
            visibility: 'ENROLLED_ONLY' as const,
            courseId: course!.id,
            cohortId: cohort!.id,
            sessionId: sess.id,
            attachmentId: null,
            sourceType: 'VIDEO_TRANSCRIPT',
            chunkIndex: cueIdx + 1,
            content: cueText,
            contentHash: sha256Hex(`${cohort!.code}:s${mod.sessionOrder}:c${cueIdx + 1}:${cueText}`),
            startSec: cue.startSec,
            endSec: cue.endSec,
            pageNumber: cue.slidePage,
            embedding: computeSemanticEmbedding1024(cueText),
          });
        });
      } else {
        const fullText = `${course!.title} - Buổi ${mod.sessionOrder} (${mod.topic}): ${mod.chunkContent}`;
        chunkRowsToInsert.push({
          visibility: 'ENROLLED_ONLY' as const,
          courseId: course!.id,
          cohortId: cohort!.id,
          sessionId: sess.id,
          attachmentId: att.id,
          sourceType: 'ATTACHMENT_DOC',
          chunkIndex: 1,
          content: fullText,
          contentHash: sha256Hex(`${cohort!.code}:s${mod.sessionOrder}:${fullText}`),
          startSec: null,
          endSec: null,
          pageNumber: 6,
          embedding: computeSemanticEmbedding1024(fullText),
        });
      }
    });
    await db.insert(knowledgeChunks).values(chunkRowsToInsert);

    // Assessments: 6 session quizzes + 1 Final Exam
    const insertedSessionQuizzes = await db
      .insert(assessments)
      .values(
        insertedSessions.map((sess, idx) => {
          const mod = modules[idx]!;
          const isReplay = sess.status === 'REPLAY_READY';
          return {
            cohortId: cohort!.id,
            sessionId: sess.id,
            purpose: 'SESSION_ASSIGNMENT' as const,
            gradingMode: 'AUTO' as const,
            title: `Bài kiểm tra Buổi ${mod.sessionOrder}: ${mod.topic}`,
            instructionsMd:
              'Hoàn thành 4 câu hỏi trắc nghiệm trọng tâm của buổi học. Đạt tối thiểu 70% để mở khóa tiến độ buổi học.',
            durationMinutes: 15,
            passScorePct: 70,
            maxAttempts: 5,
            status: isReplay ? ('PUBLISHED' as const) : ('DRAFT' as const),
          };
        })
      )
      .returning();

    const [insertedFinalExam] = await db
      .insert(assessments)
      .values([
        {
          cohortId: cohort!.id,
          sessionId: null,
          purpose: 'FINAL_EXAM' as const,
          gradingMode: 'AUTO' as const,
          title: `Kỳ thi Sát hạch Tốt nghiệp: ${course!.title} (${cohort!.code})`,
          instructionsMd:
            'Bài thi sát hạch tổng hợp toàn khóa dưới sự giám sát AI Proctoring. Yêu cầu hoàn thành 6/6 buổi học, đạt từ 70% trở lên và tuân thủ quy chế phòng thi để nhận Chứng chỉ tốt nghiệp.',
          durationMinutes: 45,
          passScorePct: 70,
          maxAttempts: 3,
          proctoringConfig: {
            requireWebcam: true,
            detectTabSwitch: true,
            detectMultiFace: true,
            detectPhone: true,
            maxRiskScoreBeforeFlag: 60,
          },
          status: finalExamStatus,
        },
      ])
      .returning();

    // Build items for all 6 session quizzes + 8-item Final Exam (compiled from the 6 modules)
    const allItemDrafts = [
      ...insertedSessionQuizzes.flatMap((quiz, idx) => {
        const mod = modules[idx]!;
        return buildSessionQuizItems(
          quiz.id,
          mod.sessionOrder,
          mod.topic,
          mod.primarySkillId,
          mod.secondarySkillId,
          mod.questions
        );
      }),
      ...buildSessionQuizItems(
        insertedFinalExam!.id,
        0,
        `Sát hạch Cuối khóa ${cohort!.code}`,
        modules[0]!.primarySkillId,
        modules[2]!.primarySkillId,
        [
          modules[0]!.questions[0]!,
          modules[1]!.questions[0]!,
          modules[2]!.questions[0]!,
          modules[2]!.questions[3]!,
          modules[3]!.questions[0]!,
          modules[4]!.questions[1]!,
          modules[5]!.questions[0]!,
          modules[5]!.questions[3]!,
        ]
      ),
    ];

    const insertedItems = await db.insert(assessmentItems).values(allItemDrafts).returning();

    const itemsByAssessmentId = new Map<number, typeof insertedItems>();
    for (const item of insertedItems) {
      const arr = itemsByAssessmentId.get(item.assessmentId) ?? [];
      arr.push(item);
      itemsByAssessmentId.set(item.assessmentId, arr);
    }

    return {
      sessions: insertedSessions,
      sessionQuizzes: insertedSessionQuizzes,
      finalExam: insertedFinalExam!,
      itemsByAssessmentId,
    };
  }

  // Populate all 5 cohorts cleanly
  const pyData = await populateCohortCurriculum({
    cohort: cohortPyK01,
    course: coursePython,
    r2Prefix: 'py-k01',
    modules: pyModules,
    sessionSpecs: [
      { dateIso: '2026-01-05', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-01-08', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-01-12', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-01-15', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-01-19', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-01-22', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
    ],
    finalExamStatus: 'PUBLISHED',
  });

  const aiK01Data = await populateCohortCurriculum({
    cohort: cohortAiK01,
    course: courseAi,
    r2Prefix: 'ai-k01',
    modules: aiModules,
    sessionSpecs: [
      { dateIso: '2026-11-03', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-06', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-10', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-13', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-20', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-11-24', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
    ],
    finalExamStatus: 'PUBLISHED',
  });

  await populateCohortCurriculum({
    cohort: cohortAiK02,
    course: courseAi,
    r2Prefix: 'ai-k02',
    modules: aiModules,
    sessionSpecs: [
      { dateIso: '2026-12-02', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-05', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-09', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-12', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-16', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-19', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
    ],
    finalExamStatus: 'DRAFT',
  });

  const sweK01Data = await populateCohortCurriculum({
    cohort: cohortSweK01,
    course: courseSwe,
    r2Prefix: 'swe-k01',
    modules: sweModules,
    sessionSpecs: [
      { dateIso: '2026-11-04', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-08', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-11', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'REPLAY_READY' },
      { dateIso: '2026-11-18', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-11-22', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
      { dateIso: '2026-11-25', startUtcTime: '12:30:00', endUtcTime: '14:30:00', status: 'SCHEDULED' },
    ],
    finalExamStatus: 'PUBLISHED',
  });

  await populateCohortCurriculum({
    cohort: cohortDataK01,
    course: courseData,
    r2Prefix: 'data-k01',
    modules: dataModules,
    sessionSpecs: [
      { dateIso: '2026-12-05', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-06', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-12', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-13', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-19', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
      { dateIso: '2026-12-20', startUtcTime: '07:00:00', endUtcTime: '09:00:00', status: 'SCHEDULED' },
    ],
    finalExamStatus: 'DRAFT',
  });

  // Public Advisor RAG Knowledge Chunks (FAQ + Catalog overview)
  const publicChunks = [
    'Học viện Công nghệ 3T Academy đào tạo trực tuyến tương tác trực tiếp (Live Cohort) cùng giảng viên thực chiến qua 4 lộ trình chuẩn kỹ sư: Lập trình Python & SQL Thực chiến, Kỹ sư AI Thực chiến (Hybrid RAG, Agents, LLMOps), Kiến trúc Backend Chuyên sâu (TypeScript, PostgreSQL, Redis) và Kỹ sư Dữ liệu Hiện đại (Kafka, PySpark, dbt Lakehouse).',
    'Học viên mới bắt đầu hoặc trái ngành nên học khóa Lập trình Python & SQL Thực chiến trước để vững nền tảng Python 3.12, AsyncIO, Pytest và SQL phân tích trên PostgreSQL trước khi lên các khóa AI Engineering, Backend hoặc Data Engineering.',
    'Mỗi đợt học gồm 6 buổi chuyên sâu kèm bài kiểm tra năng lực cuối buổi (cần đạt tối thiểu 70%) và kỳ thi sát hạch cuối khóa có giám sát AI Proctoring. Đăng ký khóa học qua mã VietQR SePay sẽ mở khóa ngay phòng học và tặng 4 lượt Luyện phỏng vấn 1-1 cùng AI.',
  ];
  await db.insert(knowledgeChunks).values(
    publicChunks.map((text, idx) => ({
      visibility: 'PUBLIC' as const,
      courseId: null,
      cohortId: null,
      sessionId: null,
      attachmentId: null,
      sourceType: 'FAQ',
      chunkIndex: idx + 1,
      content: text,
      contentHash: sha256Hex(`public-faq-${idx + 1}:${text}`),
      startSec: null,
      endSec: null,
      pageNumber: null,
      embedding: computeSemanticEmbedding1024(text),
    }))
  );

  // =========================================================================
  // 9. ORDERS, SEPAY TRANSACTIONS, ENROLLMENTS & CERTIFICATES (Tables 14–19/32)
  // =========================================================================
  const [ordAnPy, ordAnAi, ordAnSwe, ordMaiAi, ordMaiDataMismatch] = await db
    .insert(orders)
    .values([
      {
        orderCode: 'ET20260001',
        accountId: stuAnAcc!.id,
        cohortId: cohortPyK01!.id,
        amountVnd: 10000,
        status: 'PAID',
        idempotencyKey: 'seed-ord-an-py-k01',
        paidAt: new Date('2026-01-03T09:15:00Z'),
        expiresAt: new Date('2026-01-03T09:45:00Z'),
        createdAt: new Date('2026-01-03T09:10:00Z'),
      },
      {
        orderCode: 'ET20260002',
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        amountVnd: 10000,
        status: 'PAID',
        idempotencyKey: 'seed-ord-an-ai-k01',
        paidAt: new Date('2026-10-28T10:05:00Z'),
        expiresAt: new Date('2026-10-28T10:35:00Z'),
        createdAt: new Date('2026-10-28T10:00:00Z'),
      },
      {
        orderCode: 'ET20260003',
        accountId: stuAnAcc!.id,
        cohortId: cohortSweK01!.id,
        amountVnd: 10000,
        status: 'PAID',
        idempotencyKey: 'seed-ord-an-swe-k01',
        paidAt: new Date('2026-10-29T11:20:00Z'),
        expiresAt: new Date('2026-10-29T11:50:00Z'),
        createdAt: new Date('2026-10-29T11:15:00Z'),
      },
      {
        orderCode: 'ET20260004',
        accountId: stuMaiAcc!.id,
        cohortId: cohortAiK01!.id,
        amountVnd: 10000,
        status: 'PAID',
        idempotencyKey: 'seed-ord-mai-ai-k01',
        paidAt: new Date('2026-10-30T14:10:00Z'),
        expiresAt: new Date('2026-10-30T14:40:00Z'),
        createdAt: new Date('2026-10-30T14:05:00Z'),
      },
      {
        orderCode: 'ET20260005',
        accountId: stuMaiAcc!.id,
        cohortId: cohortDataK01!.id,
        amountVnd: 10000,
        status: 'PENDING',
        idempotencyKey: 'seed-ord-mai-data-mismatch',
        paidAt: null,
        expiresAt: new Date('2026-12-01T10:30:00Z'),
        createdAt: new Date('2026-11-16T10:00:00Z'),
      },
    ])
    .returning();

  await db.insert(paymentTransactions).values([
    {
      orderId: ordAnPy!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260001',
      amountVnd: 10000,
      responseCode: '00',
      rawPayload: { gateway: 'MBBank', content: 'SEVQR ET20260001', transferAmount: 10000 },
      matchStatus: 'MATCHED',
      createdAt: new Date('2026-01-03T09:15:00Z'),
    },
    {
      orderId: ordAnAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260002',
      amountVnd: 10000,
      responseCode: '00',
      rawPayload: { gateway: 'MBBank', content: 'SEVQR ET20260002', transferAmount: 10000 },
      matchStatus: 'MATCHED',
      createdAt: new Date('2026-10-28T10:05:00Z'),
    },
    {
      orderId: ordAnSwe!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260003',
      amountVnd: 10000,
      responseCode: '00',
      rawPayload: { gateway: 'VCB', content: 'SEVQR ET20260003', transferAmount: 10000 },
      matchStatus: 'MATCHED',
      createdAt: new Date('2026-10-29T11:20:00Z'),
    },
    {
      orderId: ordMaiAi!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260004',
      amountVnd: 10000,
      responseCode: '00',
      rawPayload: { gateway: 'Techcombank', content: 'SEVQR ET20260004', transferAmount: 10000 },
      matchStatus: 'MATCHED',
      createdAt: new Date('2026-10-30T14:10:00Z'),
    },
    {
      orderId: ordMaiDataMismatch!.id,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260005-SHORT',
      amountVnd: 5000,
      responseCode: 'AMOUNT_MISMATCH',
      rawPayload: { gateway: 'ACB', content: 'SEVQR ET20260005', transferAmount: 5000 },
      matchStatus: 'AMOUNT_MISMATCH',
      createdAt: new Date('2026-11-16T10:04:00Z'),
    },
    {
      orderId: null,
      gateway: 'SEPAY_VIETQR',
      gatewayTxnId: 'SEPAY-TXN-20260006-UNMATCHED',
      amountVnd: 10000,
      responseCode: 'UNMATCHED_ORDER',
      rawPayload: { gateway: 'MBBank', content: 'CHUYEN KHOAN HOC PHI KHOA HOC', transferAmount: 10000 },
      matchStatus: 'UNMATCHED_ORDER',
      createdAt: new Date('2026-11-17T08:30:00Z'),
    },
  ]);

  const anPyGraduatedAt = new Date('2026-01-24T13:45:00Z');

  const [enrAnPy, _enrAnAi, _enrAnSwe, _enrMaiAi] = await db
    .insert(enrollments)
    .values([
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortPyK01!.id,
        orderId: ordAnPy!.id,
        status: 'COMPLETED',
        finalExamPassed: true,
        dropoutRiskScore: 0.05,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-01-03T09:15:00Z'),
        completedAt: anPyGraduatedAt,
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordAnAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.12,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-10-28T10:05:00Z'),
        completedAt: null,
      },
      {
        accountId: stuAnAcc!.id,
        cohortId: cohortSweK01!.id,
        orderId: ordAnSwe!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.18,
        riskLevel: 'LOW',
        enrolledAt: new Date('2026-10-29T11:20:00Z'),
        completedAt: null,
      },
      {
        accountId: stuMaiAcc!.id,
        cohortId: cohortAiK01!.id,
        orderId: ordMaiAi!.id,
        status: 'ACTIVE',
        finalExamPassed: false,
        dropoutRiskScore: 0.74,
        riskLevel: 'HIGH',
        enrolledAt: new Date('2026-10-30T14:10:00Z'),
        completedAt: null,
      },
    ])
    .returning();

  const anCertCode = `3T-CERT-2026-${enrAnPy!.id}-${stuAnAcc!.id}`;
  const anCertHmac = crypto
    .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
    .update(`${enrAnPy!.id}:${stuAnAcc!.id}:${anCertCode}`)
    .digest('hex');

  await db.insert(certificates).values([
    {
      enrollmentId: enrAnPy!.id,
      accountId: stuAnAcc!.id,
      certificateCode: anCertCode,
      hmacSignature: anCertHmac,
      issuedAt: anPyGraduatedAt,
    },
  ]);

  await db.insert(courseReviews).values([
    {
      courseId: coursePython!.id,
      cohortId: cohortPyK01!.id,
      accountId: stuAnAcc!.id,
      rating: 5,
      comment:
        'Lộ trình Python AsyncIO và PostgreSQL Window Functions cực kỳ thực tế, bài tập bám sát tình huống dự án thật và giảng viên giải thích rất cặn kẽ.',
      isPublic: true,
      createdAt: new Date('2026-01-25T09:00:00Z'),
    },
  ]);

  // =========================================================================
  // 10. SESSION PROGRESS, QUIZ/EXAM ATTEMPTS, ANSWERS, PROCTORING & SKILL STATES
  // =========================================================================
  const progressRows: Array<typeof sessionProgress.$inferInsert> = [];
  const progressiveSkillTracker = new Map<
    string,
    {
      accountId: number;
      skillId: number;
      score: number | null;
      evidenceCount: number;
      trend: number;
      passedFinalExam: boolean;
    }
  >();

  function trackProgressiveSkillEvidence(params: {
    accountId: number;
    sessionOrder: number;
    isFinalExam: boolean;
    attemptPassed: boolean;
    items: Array<{ skillId: number; points: string | number; itemOrder: number; promptConfig?: unknown }>;
    answers: Array<{ isCorrect: boolean | null }>;
  }) {
    const bySkill = new Map<
      number,
      Array<{
        isCorrect: boolean;
        points: number;
        itemOrder: number;
        totalItems: number;
        hasScenarioTag: boolean;
      }>
    >();

    params.items.forEach((it, idx) => {
      const pCfg = (it.promptConfig || {}) as { scenarioTag?: string };
      const list = bySkill.get(it.skillId) ?? [];
      list.push({
        isCorrect: Boolean(params.answers[idx]?.isCorrect),
        points: Number(it.points) || 10,
        itemOrder: it.itemOrder ?? idx + 1,
        totalItems: params.items.length,
        hasScenarioTag: typeof pCfg.scenarioTag === 'string' && pCfg.scenarioTag.includes('thực chiến'),
      });
      bySkill.set(it.skillId, list);
    });

    for (const [skillId, skItems] of bySkill.entries()) {
      const key = `${params.accountId}:${skillId}`;
      const cur = progressiveSkillTracker.get(key) ?? {
        accountId: params.accountId,
        skillId,
        score: null,
        evidenceCount: 0,
        trend: 0,
        passedFinalExam: false,
      };
      if (params.isFinalExam && params.attemptPassed) {
        cur.passedFinalExam = true;
      }

      const upd = computeProgressiveSkillMastery({
        previousScore: cur.score,
        previousEvidenceCount: cur.evidenceCount,
        sessionOrder: params.sessionOrder,
        totalSessionsInCohort: 6,
        isFinalExam: params.isFinalExam,
        attemptPassed: params.attemptPassed,
        hasPassedCohortFinalExam: cur.passedFinalExam,
        items: skItems,
      });

      cur.score = upd.newScore;
      cur.evidenceCount = upd.updatedEvidenceCount;
      cur.trend = upd.delta;
      progressiveSkillTracker.set(key, cur);
    }
  }

  async function seedQuizOrExamSubmission(
    spec: Parameters<typeof buildAttemptDraftAndAnswerBuilders>[0] & {
      sessionOrder: number;
      isFinalExam?: boolean;
    }
  ) {
    const built = buildAttemptDraftAndAnswerBuilders({
      ...spec,
      skillNamesById,
    });
    const [insertedAttempt] = await db
      .insert(assessmentAttempts)
      .values([built.attemptRow])
      .returning();
    const answerRows = built.buildAnswersForAttemptId(insertedAttempt!.id);
    await db.insert(submissionAnswers).values(answerRows);
    trackProgressiveSkillEvidence({
      accountId: spec.accountId,
      sessionOrder: spec.sessionOrder,
      isFinalExam: Boolean(spec.isFinalExam),
      attemptPassed: Boolean(built.attemptRow.isPassed),
      items: spec.items,
      answers: answerRows,
    });
    return insertedAttempt!;
  }

  // 10A. An completes all 6 sessions of PY-SQL-2026-K01 + passes Final Exam (cleared proctoring)
  for (let i = 0; i < pyData.sessions.length; i++) {
    const sess = pyData.sessions[i]!;
    const quiz = pyData.sessionQuizzes[i]!;
    const qItems = pyData.itemsByAssessmentId.get(quiz.id) ?? [];
    const baseTime = new Date((sess.scheduledEnd ?? new Date()).getTime() + 15 * 60 * 1000);
    const doneTime = new Date(baseTime.getTime() + 8 * 60 * 1000);
    const durSec = sess.durationSeconds ?? 53;

    await seedQuizOrExamSubmission({
      assessmentId: quiz.id,
      accountId: stuAnAcc!.id,
      sessionOrder: sess.sessionOrder,
      items: qItems,
      wrongIndices: i % 2 === 1 ? [3] : [], // 100% and 75% alternating -> realistic progressive mastery!
      startedAt: baseTime,
      submittedAt: doneTime,
      gradingCompletedAt: doneTime,
    });

    progressRows.push({
      accountId: stuAnAcc!.id,
      sessionId: sess.id,
      lastPositionSec: durSec,
      maxWatchedSec: durSec,
      attendedLive: true,
      isCompleted: true,
      completedAt: doneTime,
      lastActivityAt: doneTime,
    });
  }

  const pyFinalItems = pyData.itemsByAssessmentId.get(pyData.finalExam.id) ?? [];
  const anFinalAttempt = await seedQuizOrExamSubmission({
    assessmentId: pyData.finalExam.id,
    accountId: stuAnAcc!.id,
    sessionOrder: 6,
    isFinalExam: true,
    items: pyFinalItems,
    wrongIndices: [5], // 7/8 = 87.5% -> PASSED
    totalRiskScore: '20.00',
    integrityStatus: 'CLEARED_BY_INSTRUCTOR',
    verdictNote: 'Học viên chuyển tab 3 giây do thông báo hệ điều hành, camera khuôn mặt khớp 100% suốt bài thi.',
    verdictBy: instKhoaAcc!.id,
    verdictAt: anPyGraduatedAt,
    startedAt: new Date('2026-01-24T13:00:00Z'),
    submittedAt: anPyGraduatedAt,
    gradingCompletedAt: anPyGraduatedAt,
  });

  await db.insert(proctoringEvents).values([
    {
      attemptId: anFinalAttempt.id,
      occurredAt: new Date('2026-01-24T13:18:00Z'),
      videoOffsetSec: 1080,
      tier: 'EDGE',
      eventType: 'TAB_HIDDEN',
      confidence: 0.95,
      riskDelta: '20.00',
      details: { durationMs: 3100, note: 'Blur window focus briefly' },
    },
  ]);

  // 10B. An in AI-ENG-2026-K01: completed s1–s3, currently watching s4 mid-way (54% watched)
  for (let i = 0; i < 3; i++) {
    const sess = aiK01Data.sessions[i]!;
    const quiz = aiK01Data.sessionQuizzes[i]!;
    const qItems = aiK01Data.itemsByAssessmentId.get(quiz.id) ?? [];
    const startAt = new Date((sess.scheduledEnd ?? new Date()).getTime() + 20 * 60 * 1000);
    const doneAt = new Date(startAt.getTime() + 10 * 60 * 1000);
    const durSec = sess.durationSeconds ?? 63;

    await seedQuizOrExamSubmission({
      assessmentId: quiz.id,
      accountId: stuAnAcc!.id,
      sessionOrder: sess.sessionOrder,
      items: qItems,
      wrongIndices: i === 2 ? [1] : [],
      startedAt: startAt,
      submittedAt: doneAt,
      gradingCompletedAt: doneAt,
    });

    progressRows.push({
      accountId: stuAnAcc!.id,
      sessionId: sess.id,
      lastPositionSec: durSec,
      maxWatchedSec: durSec,
      attendedLive: true,
      isCompleted: true,
      completedAt: doneAt,
      lastActivityAt: doneAt,
    });
  }
  progressRows.push({
    accountId: stuAnAcc!.id,
    sessionId: aiK01Data.sessions[3]!.id,
    lastPositionSec: 42,
    maxWatchedSec: 48, // 48 / 89s = 54% watched!
    attendedLive: false,
    isCompleted: false,
    completedAt: null,
    lastActivityAt: new Date('2026-11-17T15:30:00Z'),
  });

  // 10C. An in SWE-ARCH-2026-K01: completed s1–s2
  for (let i = 0; i < 2; i++) {
    const sess = sweK01Data.sessions[i]!;
    const quiz = sweK01Data.sessionQuizzes[i]!;
    const qItems = sweK01Data.itemsByAssessmentId.get(quiz.id) ?? [];
    const startAt = new Date((sess.scheduledEnd ?? new Date()).getTime() + 30 * 60 * 1000);
    const doneAt = new Date(startAt.getTime() + 9 * 60 * 1000);
    const durSec = sess.durationSeconds ?? 51;

    await seedQuizOrExamSubmission({
      assessmentId: quiz.id,
      accountId: stuAnAcc!.id,
      sessionOrder: sess.sessionOrder,
      items: qItems,
      wrongIndices: [],
      startedAt: startAt,
      submittedAt: doneAt,
      gradingCompletedAt: doneAt,
    });

    progressRows.push({
      accountId: stuAnAcc!.id,
      sessionId: sess.id,
      lastPositionSec: durSec,
      maxWatchedSec: durSec,
      attendedLive: true,
      isCompleted: true,
      completedAt: doneAt,
      lastActivityAt: doneAt,
    });
  }

  // 10D. Mai in AI-ENG-2026-K01: passed s1 (75%), failed s2 (50% -> remedial recommendations!)
  {
    const s1 = aiK01Data.sessions[0]!;
    const q1 = aiK01Data.sessionQuizzes[0]!;
    const start1 = new Date('2026-11-04T13:00:00Z');
    const done1 = new Date('2026-11-04T13:11:00Z');
    const dur1 = s1.durationSeconds ?? 89;
    await seedQuizOrExamSubmission({
      assessmentId: q1.id,
      accountId: stuMaiAcc!.id,
      sessionOrder: s1.sessionOrder,
      items: aiK01Data.itemsByAssessmentId.get(q1.id) ?? [],
      wrongIndices: [2],
      startedAt: start1,
      submittedAt: done1,
      gradingCompletedAt: done1,
    });
    progressRows.push({
      accountId: stuMaiAcc!.id,
      sessionId: s1.id,
      lastPositionSec: dur1,
      maxWatchedSec: dur1,
      attendedLive: true,
      isCompleted: true,
      completedAt: done1,
      lastActivityAt: done1,
    });

    const s2 = aiK01Data.sessions[1]!;
    const q2 = aiK01Data.sessionQuizzes[1]!;
    const start2 = new Date('2026-11-08T14:00:00Z');
    const done2 = new Date('2026-11-08T14:12:00Z');
    await seedQuizOrExamSubmission({
      assessmentId: q2.id,
      accountId: stuMaiAcc!.id,
      sessionOrder: s2.sessionOrder,
      items: aiK01Data.itemsByAssessmentId.get(q2.id) ?? [],
      wrongIndices: [1, 2], // 2/4 = 50% < 70% -> FAILED with remedial jumps!
      startedAt: start2,
      submittedAt: done2,
      gradingCompletedAt: done2,
    });
    progressRows.push({
      accountId: stuMaiAcc!.id,
      sessionId: s2.id,
      lastPositionSec: 31,
      maxWatchedSec: 35, // 35 / 63s = 56% watched!
      attendedLive: false,
      isCompleted: false,
      completedAt: null,
      lastActivityAt: done2,
    });
  }

  await db.insert(sessionProgress).values(progressRows);

  // Derive student_skill_states via Progressive Elo-IRT + Stage Weighting (0..100 scale!)
  const skillStateRows = Array.from(progressiveSkillTracker.values()).map((entry) => ({
    accountId: entry.accountId,
    skillId: entry.skillId,
    masteryScore: entry.score ?? 45,
    evidenceCount: Math.max(1, entry.evidenceCount),
    trend: Number(entry.trend.toFixed(2)),
  }));
  await db.insert(studentSkillStates).values(skillStateRows);

  // =========================================================================
  // 11. DISCUSSIONS, NOTIFICATIONS, CHAT SESSIONS & MOCK INTERVIEWS
  // =========================================================================
  const [threadAiS1, threadAiS2] = await db
    .insert(discussionThreads)
    .values([
      {
        sessionId: aiK01Data.sessions[0]!.id,
        authorId: stuAnAcc!.id,
        title: 'Cách chọn số lượng worker Uvicorn khi dùng FastAPI SSE Streaming?',
        videoTimestampSec: 36,
        isResolved: true,
        createdAt: new Date('2026-11-04T10:00:00Z'),
      },
      {
        sessionId: aiK01Data.sessions[1]!.id,
        authorId: stuMaiAcc!.id,
        title: 'Tại sao câu truy vấn pgvector có CASE WHEN lại không nhận HNSW index?',
        videoTimestampSec: 34,
        isResolved: false,
        createdAt: new Date('2026-11-16T13:20:00Z'),
      },
    ])
    .returning();

  await db.insert(discussionPosts).values([
    {
      threadId: threadAiS1!.id,
      authorId: stuAnAcc!.id,
      contentMd:
        'Thầy ơi, khi mở nhiều kết nối SSE dài hạn trên FastAPI thì mình nên cấu hình số worker Uvicorn theo số nhân CPU như thế nào để không bị nghẽn ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
    },
    {
      threadId: threadAiS1!.id,
      authorId: instKhoaAcc!.id,
      contentMd:
        'Với kết nối SSE thuần bất đồng bộ (`async def` + client `httpx.AsyncClient`), mỗi worker Uvicorn xử lý hàng nghìn kết nối mở đồng thời. Em cấu hình `1–2 workers / vCPU` và đảm bảo không gọi hàm đồng bộ chặn Event Loop nhé!',
      isAiGenerated: false,
      isInstructorVerified: true,
      verifiedBy: instKhoaAcc!.id,
    },
    {
      threadId: threadAiS2!.id,
      authorId: stuMaiAcc!.id,
      contentMd:
        'Em thử bọc `CASE WHEN embedding IS NOT NULL THEN embedding <=> $1 END` thì thấy `EXPLAIN ANALYZE` chuyển sang `Seq Scan`. Làm sao để vẫn dùng được `idx_chunks_embedding_hnsw` ạ?',
      isAiGenerated: false,
      isInstructorVerified: false,
    },
    {
      threadId: threadAiS2!.id,
      authorId: null,
      contentMd:
        'Gợi ý từ Trợ giảng AI (Slide Buổi 2 - 14:10): Bạn hãy chuyển điều kiện `WHERE embedding IS NOT NULL` xuống mệnh đề `WHERE` và giữ nguyên `ORDER BY embedding <=> $1 ASC LIMIT k` trực tiếp để PostgreSQL kích hoạt chỉ mục HNSW.',
      isAiGenerated: true,
      isInstructorVerified: false,
    },
  ]);

  await db.insert(notifications).values([
    {
      recipientId: stuAnAcc!.id,
      type: 'CERTIFICATE_ISSUED',
      title: `Chúc mừng tốt nghiệp khóa ${cohortPyK01!.code}!`,
      body: `Bạn đã hoàn thành xuất sắc kỳ thi sát hạch cuối khóa và nhận chứng chỉ xác thực số ${anCertCode}.`,
      metadata: { certificateCode: anCertCode, cohortId: cohortPyK01!.id },
      isRead: false,
      createdAt: anPyGraduatedAt,
    },
    {
      recipientId: stuMaiAcc!.id,
      type: 'AI_STUDY_REMINDER',
      title: 'Gợi ý ôn tập Buổi 2: Chỉ mục HNSW trên pgvector',
      body: 'Bạn đạt 50% ở bài kiểm tra Buổi 2 khóa AI-ENG-2026-K01. Hãy xem lại mốc 09:00–14:10 và làm lại Quiz để kịp tiến độ cùng lớp nhé!',
      metadata: { cohortId: cohortAiK01!.id, sessionId: aiK01Data.sessions[1]!.id },
      isRead: false,
      createdAt: new Date('2026-11-17T09:00:00Z'),
    },
    {
      recipientId: stuNamAcc!.id,
      type: 'WELCOME_GUIDE',
      title: 'Chào mừng bạn đến với 3T Academy!',
      body: 'Khám phá lộ trình phù hợp cùng Cố vấn AI và đăng ký đợt học đầu tiên để mở khóa phòng học trực tuyến kèm 4 lượt luyện phỏng vấn 1-1.',
      metadata: {},
      isRead: false,
      createdAt: new Date('2026-11-15T09:05:00Z'),
    },
  ]);

  const [chatNamAdvisor, chatAnTutor] = await db
    .insert(chatSessions)
    .values([
      {
        accountId: stuNamAcc!.id,
        scope: 'ADVISOR_GLOBAL',
        cohortId: null,
        sessionId: null,
        title: 'Tư vấn chọn lộ trình cho người mới học Python',
        contextSummary: 'Học viên mới tìm hiểu lộ trình từ nền tảng Python/SQL lên AI Engineering.',
      },
      {
        accountId: stuAnAcc!.id,
        scope: 'SESSION_TUTOR',
        cohortId: cohortAiK01!.id,
        sessionId: aiK01Data.sessions[2]!.id,
        title: 'Giải thích công thức hợp nhất hạng RRF k=60',
        contextSummary: 'Ôn tập thuật toán Hybrid Search Dense + BM25 trong Buổi 3.',
      },
    ])
    .returning();

  await db.insert(chatMessages).values([
    {
      chatSessionId: chatNamAdvisor!.id,
      role: 'user',
      content: 'Mình mới biết chút cơ bản thì nên đăng ký khóa nào trước để theo hướng Kỹ sư AI?',
      detectedTopic: 'Tư vấn lộ trình AI Engineering',
      citations: [],
    },
    {
      chatSessionId: chatNamAdvisor!.id,
      role: 'assistant',
      content:
        'Bạn nên bắt đầu với nền tảng Python AsyncIO & PostgreSQL thực chiến, sau đó đăng ký đợt **AI-ENG-2026-K02** (khai giảng tháng 12/2026) để làm chủ trọn vẹn Hybrid RAG, Function Calling và LLMOps.',
      detectedTopic: 'Tư vấn lộ trình AI Engineering',
      citations: [],
      llmProvider: '3t-rag',
      llmModel: 'gemini-2.5-flash',
      latencyMs: 320,
    },
    {
      chatSessionId: chatAnTutor!.id,
      role: 'user',
      content: 'Vì sao RRF dùng thứ hạng 1/(k + rank) thay vì cộng trực tiếp điểm cosine và điểm tsvector?',
      detectedTopic: 'Hybrid Search & RRF',
      citations: [],
    },
    {
      chatSessionId: chatAnTutor!.id,
      role: 'assistant',
      content:
        'Điểm Cosine nằm trong đoạn `[0, 1]` còn điểm tần suất từ khóa không bị chặn trên, nên cộng trực tiếp sẽ bị lệch thang đo. Công thức `1 / (60 + rank)` chuẩn hóa công bằng cả hai danh sách theo vị trí xếp hạng.',
      detectedTopic: 'Hybrid Search & RRF',
      citations: [
        {
          label: 'Buổi 3 · 00:31',
          jumpSec: 31,
          slideLabel: 'Buổi 3 · Slide Trang 2',
        },
      ],
      llmProvider: '3t-rag',
      llmModel: 'gemini-2.5-flash',
      latencyMs: 280,
    },
  ]);

  // Mock Interviews for An: 1 COMPLETED (-1 credit) + 1 CV_SCREENING (0 credit deducted)
  await db.insert(mockInterviews).values([
    {
      accountId: stuAnAcc!.id,
      targetLevel: 'FRESHER',
      targetRole: 'Fresher AI & Backend Engineer',
      jdRawText:
        'Tuyển dụng Fresher AI & Backend Engineer: Nắm vững Python AsyncIO, FastAPI, tối ưu truy vấn PostgreSQL/pgvector, xây dựng pipeline Hybrid RAG và kiểm thử với Pytest.',
      cvScreeningResult: {
        matchScore: 86,
        matchedSkills: ['Python AsyncIO', 'PostgreSQL', 'FastAPI', 'Hybrid RAG'],
        missingSkills: ['Langfuse Production Alerting'],
        summary: 'Hồ sơ có chứng chỉ tốt nghiệp Python & SQL tại 3T Academy và dự án Hybrid RAG bám sát yêu cầu JD.',
      },
      transcriptLog: [
        {
          turn: 1,
          speaker: 'interviewer',
          question: 'Bạn hãy giải thích cách ngăn chặn nghẽn Event Loop khi gọi LLM API trong FastAPI?',
          answer:
            'Em sử dụng httpx.AsyncClient bất đồng bộ kết hợp asyncio.Semaphore giới hạn số kết nối đồng thời, cấu hình timeout rõ ràng và truyền phản hồi qua SSE để giảm TTFT.',
          score: 88,
        },
        {
          turn: 2,
          speaker: 'interviewer',
          question: 'Khi truy vấn kết hợp tìm kiếm ngữ nghĩa và từ khóa trên PostgreSQL, bạn hợp nhất kết quả thế nào?',
          answer:
            'Em kết hợp chỉ mục HNSW trên cột vector(1024) với chỉ mục GIN trên cột tsvector và hợp nhất thứ hạng bằng Reciprocal Rank Fusion k=60 trước khi đưa qua bước rerank.',
          score: 90,
        },
      ],
      evaluationReport: {
        overallScore: 89,
        technicalScore: 90,
        communicationScore: 88,
        problemSolvingScore: 89,
        verdict: 'STRONG_FIT',
        strengths: [
          'Hiểu rõ bản chất Event Loop bất đồng bộ và tối ưu kết nối HTTP',
          'Trình bày mạch lạc kiến trúc Hybrid RAG trên PostgreSQL pgvector',
        ],
        improvements: ['Bổ sung thêm số liệu đo lường độ trễ p95 và chi phí token trên dự án thực tế'],
      },
      status: 'COMPLETED',
      createdAt: new Date('2026-11-12T13:00:00Z'),
      completedAt: new Date('2026-11-12T13:18:00Z'),
    },
    {
      accountId: stuAnAcc!.id,
      targetLevel: 'JUNIOR',
      targetRole: 'Junior Backend TypeScript Engineer',
      jdRawText:
        'Tuyển Junior Backend Engineer: Thành thạo Node.js, TypeScript, Drizzle ORM, giao dịch ACID SELECT FOR UPDATE và thiết kế Idempotent Payment Webhook.',
      cvScreeningResult: {
        matchScore: 82,
        matchedSkills: ['TypeScript', 'PostgreSQL ACID', 'Idempotent Webhook'],
        missingSkills: ['Load Testing k6 nâng cao'],
        summary: 'Ứng viên nắm vững nền tảng CSDL quan hệ và đang hoàn thiện khóa Kiến trúc Backend Chuyên sâu.',
      },
      transcriptLog: [],
      evaluationReport: null,
      status: 'CV_SCREENING',
      createdAt: new Date('2026-11-17T16:00:00Z'),
      completedAt: null,
    },
  ]);

  // =========================================================================
  // 12. USER PROFILES (Table 7/32) — Exact Interview Credits & Local Avatars!
  //     Rule: 0 base + 4 * nonRevokedEnrollments - completedMockInterviews (0 for staff)
  //     - Admin: 0, Khoa: 0, Ha: 0
  //     - An: 3 enrollments (PY COMPLETED, AI ACTIVE, SWE ACTIVE) * 4 - 1 COMPLETED mock = 11
  //     - Mai: 1 enrollment (AI ACTIVE) * 4 - 0 mocks = 4
  //     - Nam: 0 enrollments = 0 (tests locked Mock Interview gate & fresh onboarding/checkout!)
  // =========================================================================
  const anCvUpdatedIso = '2026-11-10T09:00:00.000Z'; // Strictly after PY cert issuedAt (2026-01-24)
  await db.insert(userProfiles).values([
    {
      accountId: adminAcc!.id,
      fullName: 'Trần Quản Trị (Admin 3T)',
      phone: '0901000111',
      githubUrl: 'https://github.com/3t-academy',
      linkedinUrl: 'https://linkedin.com/company/3t-academy',
      avatarUrl: '/assets/aistudio/image_a4275f35.png',
      bio: 'Giám đốc Vận hành & Quản trị Học vụ tại Học viện Công nghệ 3T Academy.',
      careerGoal: 'Chuẩn hóa chất lượng đào tạo công nghệ thực chiến theo chuẩn doanh nghiệp.',
      cvParsedData: {
        fullName: 'Trần Quản Trị (Admin 3T)',
        headline: 'Head of Academic Operations @ 3T Academy',
        phone: '0901000111',
        location: 'Hà Nội, Việt Nam',
      },
      preferences: { emailReminders: true, liveSessionAlerts: true, aiStudyNudges: false },
      interviewCredits: 0,
    },
    {
      accountId: instKhoaAcc!.id,
      fullName: 'TS. Lê Minh Khoa',
      phone: '0902111222',
      githubUrl: 'https://github.com/leminhkhoa-ai',
      linkedinUrl: 'https://linkedin.com/in/leminhkhoa-ai',
      avatarUrl: '/assets/aistudio/image_49d8b1b9.png',
      bio: 'Principal AI Architect · 11 năm kinh nghiệm xây dựng hệ thống NLP, Hybrid RAG và Multi-Agent tại Singapore & Việt Nam.',
      careerGoal: 'Đào tạo thế hệ Kỹ sư AI thực chiến làm chủ kiến trúc hệ thống Production.',
      cvParsedData: {
        fullName: 'TS. Lê Minh Khoa',
        headline: 'Principal AI Architect · Giảng viên Trưởng khối AI Engineering',
        phone: '0902111222',
        location: 'TP. Hồ Chí Minh & Hà Nội',
        skills: ['Hybrid RAG', 'Multi-Agent Systems', 'LLMOps', 'Python AsyncIO'],
      },
      preferences: { emailReminders: true, liveSessionAlerts: true },
      interviewCredits: 0,
    },
    {
      accountId: instHaAcc!.id,
      fullName: 'ThS. Nguyễn Thu Hà',
      phone: '0903222333',
      githubUrl: 'https://github.com/nguyenthuha-arch',
      linkedinUrl: 'https://linkedin.com/in/nguyenthuha-arch',
      avatarUrl: '/assets/aistudio/image_aa8c5a52.png',
      bio: 'Staff Data & Backend Architect · Chuyên gia tối ưu cơ sở dữ liệu phân tán, Data Lakehouse và kiến trúc Microservices.',
      careerGoal: 'Đồng hành cùng học viên xây dựng tư duy thiết kế hệ thống bền vững.',
      cvParsedData: {
        fullName: 'ThS. Nguyễn Thu Hà',
        headline: 'Staff Data & Backend Architect · Giảng viên Trưởng khối Backend & Data',
        phone: '0903222333',
        location: 'Hà Nội, Việt Nam',
        skills: ['PostgreSQL', 'TypeScript', 'System Design', 'Apache Spark', 'Kafka', 'dbt'],
      },
      preferences: { emailReminders: true, liveSessionAlerts: true },
      interviewCredits: 0,
    },
    {
      accountId: stuAnAcc!.id,
      fullName: 'Nguyễn Văn An',
      phone: '0908234567',
      githubUrl: 'https://github.com/nguyenvanan-ai',
      linkedinUrl: 'https://linkedin.com/in/nguyenvanan-ai',
      avatarUrl: '/assets/aistudio/image_ac1132bf.png',
      bio: 'Fresher AI & Backend Engineer · Đã tốt nghiệp khóa Python & SQL Thực chiến và đang theo học chuyên sâu Hybrid RAG & Backend TypeScript.',
      careerGoal: 'Trở thành Kỹ sư AI & Backend phát triển sản phẩm trí tuệ nhân tạo quy mô lớn.',
      goalEmbedding: computeSemanticEmbedding1024(
        'Fresher AI Backend Engineer Hybrid RAG FastAPI TypeScript PostgreSQL pgvector'
      ),
      faceReferenceR2Key: 'kyc/2026/stu-an-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(101, 512),
      cvParsedData: {
        fileName: 'NguyenVanAn_AI_Backend_CV_2026.pdf',
        updatedAt: anCvUpdatedIso,
        extractedAt: anCvUpdatedIso,
        fullName: 'Nguyễn Văn An',
        candidateName: 'Nguyễn Văn An',
        headline: 'Fresher AI & Backend Engineer',
        targetRole: 'Fresher AI & Backend Engineer',
        email: 'an.student@3t.edu.vn',
        phone: '0908234567',
        location: 'Cầu Giấy, Hà Nội',
        avatarUrl: '/assets/aistudio/image_ac1132bf.png',
        githubUrl: 'https://github.com/nguyenvanan-ai',
        linkedinUrl: 'https://linkedin.com/in/nguyenvanan-ai',
        careerObjective:
          'Ứng dụng kiến trúc Hybrid RAG (pgvector + RRF), FastAPI bất đồng bộ và TypeScript Clean Architecture để xây dựng nền tảng phần mềm thông minh.',
        summaryBio:
          'Tốt nghiệp loại Giỏi lộ trình Python & SQL Thực chiến tại 3T Academy, có kinh nghiệm xây dựng cổng RAG trích dẫn mốc thời gian video.',
        skills: ['Python AsyncIO', 'PostgreSQL & pgvector', 'FastAPI', 'TypeScript', 'Hybrid RAG'],
        externalSkills: ['GitHub Actions', 'Linux Ubuntu', 'TOEIC 845'],
        projects: [
          {
            name: 'Hệ thống Trợ giảng Hybrid RAG trích dẫn Video',
            role: 'Full-stack AI Developer',
            techStack: 'FastAPI, PostgreSQL pgvector, TypeScript, React',
            highlights:
              'Kết hợp tìm kiếm vector 1024 chiều với tsvector qua RRF k=60, giảm tỷ lệ câu trả lời thiếu nguồn trích dẫn xuống dưới 5%.',
          },
        ],
        workExperience: [],
        education: [
          {
            school: 'Đại học Bách Khoa Hà Nội',
            degree: 'Kỹ sư Công nghệ Thông tin',
            period: '2022 - 2026',
          },
        ],
        awardsAndCerts: [
          {
            title: 'Chứng chỉ Lập trình Python & SQL Thực chiến — 3T Academy',
            dateOrCode: `01/2026 · ${anCertCode}`,
          },
        ],
      },
      preferences: { emailReminders: true, liveSessionAlerts: true, aiStudyNudges: true },
      interviewCredits: 11,
    },
    {
      accountId: stuMaiAcc!.id,
      fullName: 'Lê Hoàng Mai',
      phone: '0912345678',
      githubUrl: 'https://github.com/lehoangmai-dev',
      linkedinUrl: 'https://linkedin.com/in/lehoangmai-dev',
      avatarUrl: '/assets/aistudio/image_db924838.png',
      bio: 'Lập trình viên chuyển dịch sang AI & Data Engineering · Đang theo học đợt AI-ENG-2026-K01.',
      careerGoal: 'Làm chủ hạ tầng Vector DB và Data Pipeline thời gian thực cho ứng dụng AI.',
      goalEmbedding: computeSemanticEmbedding1024(
        'Junior AI Data Engineer pgvector Apache Spark Kafka dbt Lakehouse'
      ),
      faceReferenceR2Key: 'kyc/2026/stu-mai-face-ref-v1.jpg',
      faceEmbedding: makeDeterministicVector(102, 512),
      cvParsedData: {
        fileName: 'LeHoangMai_Data_AI_CV_2026.pdf',
        updatedAt: '2026-11-01T08:00:00.000Z',
        extractedAt: '2026-11-01T08:00:00.000Z',
        fullName: 'Lê Hoàng Mai',
        candidateName: 'Lê Hoàng Mai',
        headline: 'Junior Backend & Data Developer',
        targetRole: 'Junior AI & Data Engineer',
        email: 'mai.student@3t.edu.vn',
        phone: '0912345678',
        location: 'Quận 1, TP. Hồ Chí Minh',
        avatarUrl: '/assets/aistudio/image_db924838.png',
        githubUrl: 'https://github.com/lehoangmai-dev',
        linkedinUrl: 'https://linkedin.com/in/lehoangmai-dev',
        careerObjective: 'Phát triển đường ống dữ liệu sạch và hệ thống truy xuất kiến thức tốc độ cao.',
        summaryBio: '1 năm kinh nghiệm phát triển API và cơ sở dữ liệu PostgreSQL.',
        skills: ['Python', 'PostgreSQL', 'Docker'],
        externalSkills: ['REST API', 'Redis cơ bản'],
        projects: [],
        workExperience: [],
        education: [
          {
            school: 'Đại học Khoa học Tự nhiên — ĐHQG TP.HCM',
            degree: 'Cử nhân Khoa học Máy tính',
            period: '2021 - 2025',
          },
        ],
        awardsAndCerts: [],
      },
      preferences: { emailReminders: true, liveSessionAlerts: true, aiStudyNudges: true },
      interviewCredits: 4,
    },
    {
      accountId: stuNamAcc!.id,
      fullName: 'Phạm Hoàng Nam',
      phone: '0987654321',
      githubUrl: 'https://github.com/phamhoangnam-dev',
      linkedinUrl: '',
      avatarUrl: '/assets/aistudio/image_a4275f35.png',
      bio: 'Sinh viên năm cuối ngành Kỹ thuật Phần mềm đang tìm hiểu lộ trình học tại 3T Academy.',
      careerGoal: 'Xây dựng nền tảng Python, SQL và ứng dụng AI thực tế để ứng tuyển vị trí Fresher.',
      goalEmbedding: computeSemanticEmbedding1024(
        'Sinh viên mới bắt đầu học Python SQL thực chiến và Kỹ sư AI Fresher'
      ),
      cvParsedData: {
        fileName: '',
        updatedAt: '',
        extractedAt: '',
        fullName: 'Phạm Hoàng Nam',
        candidateName: 'Phạm Hoàng Nam',
        headline: 'Sinh viên Kỹ thuật Phần mềm',
        targetRole: 'Fresher Software & AI Engineer',
        email: 'nam.student@3t.edu.vn',
        phone: '0987654321',
        location: 'Đà Nẵng, Việt Nam',
        avatarUrl: '/assets/aistudio/image_a4275f35.png',
        githubUrl: 'https://github.com/phamhoangnam-dev',
        linkedinUrl: '',
        careerObjective: 'Bổ sung dự án thực tế và kỹ năng Python/SQL/AI chuẩn doanh nghiệp.',
        summaryBio: '',
        skills: [],
        externalSkills: ['Git cơ bản', 'HTML/CSS'],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
      },
      preferences: { emailReminders: true, liveSessionAlerts: true, aiStudyNudges: true },
      interviewCredits: 0,
    },
  ]);

  // =========================================================================
  // 13. FULL 32-TABLE SELF-AUDIT VERIFICATION (Throws immediately if any drift!)
  // =========================================================================
  const [
    auditAccounts,
    auditCohorts,
    auditOrders,
    auditTxns,
    auditEnrollments,
    auditCertificates,
    auditSessions,
    auditSubtitles,
    auditProgress,
    auditAssessments,
    auditItems,
    auditAttempts,
    auditAnswers,
    auditProctoring,
    auditChunks,
    auditProfiles,
    auditMocks,
    auditSkills,
  ] = await Promise.all([
    db.select().from(accounts),
    db.select().from(cohorts),
    db.select().from(orders),
    db.select().from(paymentTransactions),
    db.select().from(enrollments),
    db.select().from(certificates),
    db.select().from(classSessions),
    db.select().from(sessionSubtitles),
    db.select().from(sessionProgress),
    db.select().from(assessments),
    db.select().from(assessmentItems),
    db.select().from(assessmentAttempts),
    db.select().from(submissionAnswers),
    db.select().from(proctoringEvents),
    db.select().from(knowledgeChunks),
    db.select().from(userProfiles),
    db.select().from(mockInterviews),
    db.select().from(studentSkillStates),
  ]);

  const violations = findSeedConsistencyViolations({
    accounts: auditAccounts.map((a) => ({ id: a.id, role: a.role })),
    cohorts: auditCohorts.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      maxSeats: c.maxSeats,
      enrolledCount: c.enrolledCount,
      scheduleSlots: c.scheduleSlots ?? [],
    })),
    orders: auditOrders.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      accountId: o.accountId,
      cohortId: o.cohortId,
      amountVnd: o.amountVnd,
      status: o.status,
      paidAt: o.paidAt,
    })),
    paymentTransactions: auditTxns.map((t) => ({
      id: t.id,
      orderId: t.orderId,
      amountVnd: t.amountVnd,
      matchStatus: t.matchStatus,
    })),
    enrollments: auditEnrollments.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      cohortId: e.cohortId,
      orderId: e.orderId,
      enrolledByAdmin: e.enrolledByAdmin,
      status: e.status,
      finalExamPassed: e.finalExamPassed,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
    })),
    certificates: auditCertificates.map((c) => ({
      enrollmentId: c.enrollmentId,
      accountId: c.accountId,
      certificateCode: c.certificateCode,
      issuedAt: c.issuedAt,
      revokedAt: c.revokedAt,
    })),
    sessions: auditSessions.map((s) => ({
      id: s.id,
      cohortId: s.cohortId,
      sessionOrder: s.sessionOrder,
      status: s.status,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      videoR2Key: s.videoR2Key,
    })),
    subtitles: auditSubtitles.map((sub) => ({ sessionId: sub.sessionId })),
    progress: auditProgress.map((p) => ({
      accountId: p.accountId,
      sessionId: p.sessionId,
      isCompleted: p.isCompleted,
      completedAt: p.completedAt,
      lastActivityAt: p.lastActivityAt,
    })),
    assessments: auditAssessments.map((a) => ({
      id: a.id,
      cohortId: a.cohortId,
      sessionId: a.sessionId,
      purpose: a.purpose,
      passScorePct: a.passScorePct,
    })),
    assessmentItems: auditItems.map((i) => ({
      id: i.id,
      assessmentId: i.assessmentId,
      skillId: i.skillId,
      points: i.points,
      gradingConfig: i.gradingConfig,
    })),
    attempts: auditAttempts.map((att) => ({
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
    answers: auditAnswers.map((ans) => ({
      attemptId: ans.attemptId,
      itemId: ans.itemId,
      finalScore: ans.finalScore,
      gradedAt: ans.gradedAt,
    })),
    proctoringEvents: auditProctoring.map((ev) => ({
      attemptId: ev.attemptId,
      eventType: ev.eventType,
      riskDelta: ev.riskDelta,
      occurredAt: ev.occurredAt,
    })),
    knowledgeChunks: auditChunks.map((ch) => ({
      sessionId: ch.sessionId,
      sourceType: ch.sourceType,
    })),
    profiles: auditProfiles.map((p) => ({
      accountId: p.accountId,
      interviewCredits: p.interviewCredits,
      cvParsedData: (p.cvParsedData ?? {}) as Record<string, unknown>,
    })),
    mockInterviews: auditMocks.map((m) => ({
      accountId: m.accountId,
      status: m.status,
      createdAt: m.createdAt,
      completedAt: m.completedAt,
    })),
    skillStates: auditSkills.map((s) => ({
      accountId: s.accountId,
      skillId: s.skillId,
    })),
  });

  if (violations.length > 0) {
    throw new Error(`Seed consistency violations (${violations.length}):\n- ${violations.join('\n- ')}`);
  }

  logger.info(
    {
      accounts: auditAccounts.length,
      cohorts: auditCohorts.length,
      sessions: auditSessions.length,
      orders: auditOrders.length,
      enrollments: auditEnrollments.length,
      assessments: auditAssessments.length,
      attempts: auditAttempts.length,
      chunks: auditChunks.length,
    },
    '32-table flow-consistent seed completed with 0 consistency violations!'
  );
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (isDirectRun) {
  runMigrations({ closePool: false })
    .then(() => runSeed(defaultDb))
    .catch((error) => {
      logger.error({ err: error }, 'Database seed failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
