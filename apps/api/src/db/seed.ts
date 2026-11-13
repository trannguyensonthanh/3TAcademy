import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
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
import argon2 from 'argon2';
import { logger } from '../config/logger.js';

/**
 * Helper tạo vector 1024 chiều giả lập nhưng nhất quán (deterministic) theo seed số học
 * để phục vụ truy vấn HNSW Cosine Similarity trên pgvector.
 */
function makeDeterministicVector(seedNum: number, dims = 1024): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dims; i++) {
    const val = Math.sin(seedNum * (i + 1) * 0.137) * 0.5;
    vec.push(Number(val.toFixed(6)));
  }
  return vec;
}

async function seed() {
  logger.info('Starting comprehensive A-to-Z database seeding (32 tables)...');

  try {
    // 0. Làm sạch dữ liệu cũ & Reset bộ đếm BIGSERIAL về 1 để ID luôn cố định, dễ test
    await db.execute(sql`
      TRUNCATE TABLE
        system_settings,
        mock_interviews,
        chat_messages,
        chat_sessions,
        student_skill_states,
        knowledge_chunks,
        proctoring_events,
        submission_answers,
        assessment_attempts,
        assessment_items,
        assessments,
        notifications,
        discussion_posts,
        discussion_threads,
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
        accounts
      RESTART IDENTITY CASCADE;
    `);

    // =========================================================================
    // 1. DOMAIN 6 (Part 1) — SYSTEM SETTINGS
    // =========================================================================
    await db.insert(systemSettings).values([
      {
        key: 'maintenance_mode',
        value: 'false',
        description: 'Bật/tắt chế độ bảo trì toàn hệ thống',
        isPublic: true,
      },
      {
        key: 'support_email',
        value: 'support@3tacademy.vn',
        description: 'Email hỗ trợ học vụ và kỹ thuật 24/7',
        isPublic: true,
      },
      {
        key: 'replay_retention_days',
        value: '180',
        description: 'Số ngày lưu trữ bản ghi video bài giảng sau khi bế giảng',
        isPublic: false,
      },
      {
        key: 'sepay_bank_name',
        value: 'MBBank (Ngân hàng Quân Đội)',
        description: 'Ngân hàng thụ hưởng VietQR SePay',
        isPublic: true,
      },
      {
        key: 'sepay_account_number',
        value: '098877665544',
        description: 'Số tài khoản nhận học phí tự động qua SePay',
        isPublic: true,
      },
      {
        key: 'sepay_account_holder',
        value: 'CONG TY CO PHAN CONG NGHE GIAO DUC 3T ACADEMY',
        description: 'Chủ tài khoản VietQR',
        isPublic: true,
      },
    ]);

    // =========================================================================
    // 2. DOMAIN 1 — ACCOUNTS, IDENTITIES, USER PROFILES & INSTRUCTOR PROFILES
    // =========================================================================
    const [adminHash, instructorHash, studentHash] = await Promise.all([
      argon2.hash('Admin@2026!'),
      argon2.hash('Instructor@2026!'),
      argon2.hash('Student@2026!'),
    ]);

    const insertedAccounts = await db
      .insert(accounts)
      .values([
        // 1: Admin
        {
          email: 'admin@3tacademy.vn',
          passwordHash: adminHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
        },
        // 2: Instructor 1 - TS. Trần Minh Khoa
        {
          email: 'khoa.tran@3tacademy.vn',
          passwordHash: instructorHash,
          role: 'INSTRUCTOR',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-01-05T08:00:00Z'),
        },
        // 3: Instructor 2 - ThS. Lê Thu Hà
        {
          email: 'ha.le@3tacademy.vn',
          passwordHash: instructorHash,
          role: 'INSTRUCTOR',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-01-06T08:00:00Z'),
        },
        // 4: Student 1 (Main Demo User) - Nguyễn Văn An
        {
          email: 'an.nguyen.dev@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-09-10T08:00:00Z'),
        },
        // 5: Student 2 - Lê Hoàng Mai (Low Risk)
        {
          email: 'mai.le@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-01T08:00:00Z'),
        },
        // 6: Student 3 - Phạm Thu Hà (Medium Risk)
        {
          email: 'ha.pham.data@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-02T08:00:00Z'),
        },
        // 7: Student 4 - Trần Minh Quân (High Risk)
        {
          email: 'quan.tran.dev@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-03T08:00:00Z'),
        },
        // 8: Student 5 - Vũ Đức Anh (High Risk)
        {
          email: 'anh.vu@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-04T08:00:00Z'),
        },
        // 9: Student 6 - Đỗ Quốc Khánh (High Risk)
        {
          email: 'khanh.do@techcorp.vn',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-05T08:00:00Z'),
        },
        // 10: Student 7 - Hoàng Gia Bảo (K02 High Risk)
        {
          email: 'bao.hoang@gmail.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-10-12T08:00:00Z'),
        },
        // 11: Student 8 - Vũ Đình Khôi (Completed Python K04)
        {
          email: 'khoi.vu@fpt.com',
          passwordHash: studentHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date('2026-08-15T08:00:00Z'),
        },
      ])
      .returning();

    const adminAcc = insertedAccounts[0]!;
    const instKhoaAcc = insertedAccounts[1]!;
    const instHaAcc = insertedAccounts[2]!;
    const stuAnAcc = insertedAccounts[3]!;
    const stuMaiAcc = insertedAccounts[4]!;
    const stuHaAcc = insertedAccounts[5]!;
    const stuQuanAcc = insertedAccounts[6]!;
    const stuAnhAcc = insertedAccounts[7]!;
    const stuKhanhAcc = insertedAccounts[8]!;
    const stuBaoAcc = insertedAccounts[9]!;
    const stuKhoiAcc = insertedAccounts[10]!;

    // Seed account_identities (LOCAL & GOOGLE OAuth)
    await db.insert(accountIdentities).values([
      {
        accountId: adminAcc.id,
        provider: 'LOCAL',
        providerUid: adminAcc.email,
        providerEmail: adminAcc.email,
      },
      {
        accountId: instKhoaAcc.id,
        provider: 'LOCAL',
        providerUid: instKhoaAcc.email,
        providerEmail: instKhoaAcc.email,
      },
      {
        accountId: stuAnAcc.id,
        provider: 'LOCAL',
        providerUid: stuAnAcc.email,
        providerEmail: stuAnAcc.email,
      },
      {
        accountId: stuAnAcc.id,
        provider: 'GOOGLE',
        providerUid: 'google-oauth2|10982374928374912',
        providerEmail: stuAnAcc.email,
      },
    ]);

    // Seed user_profiles
    const anCvParsedData = {
      fileName: 'CV_Nguyen_Van_An_2026.pdf',
      updatedAt: '10/11/2026',
      fullName: 'Nguyễn Văn An',
      headline: 'Kỹ Sư Backend Python & Ứng Dụng AI (AI Engineer)',
      email: 'an.nguyen.dev@gmail.com',
      phone: '0908 123 456',
      githubUrl: 'github.com/nguyenvanan-dev',
      linkedinUrl: 'linkedin.com/in/nguyenvanan',
      careerObjective:
        'Kỹ sư Backend Python với 2 năm kinh nghiệm phát triển hệ thống API hiệu năng cao và cơ sở dữ liệu PostgreSQL. Hướng tới vị trí Kỹ sư AI Thực chiến (AI Engineer), tập trung xây dựng các hệ thống tra cứu tài liệu thông minh (RAG), tìm kiếm ngữ nghĩa trên dữ liệu lớn và tự động hóa quy trình nghiệp vụ doanh nghiệp.',
      projects: [
        {
          id: 'proj-1',
          name: 'Hệ thống Trợ lý AI Tra cứu Tài liệu Nội bộ (Enterprise Hybrid RAG)',
          role: 'AI & Backend Engineer (Đồ án Khóa K01 — 3T Academy)',
          period: '09/2026 – 11/2026',
          techStack: 'Python, FastAPI, PostgreSQL (pgvector), Redis, Docker',
          highlights: [
            'Xây dựng bộ đọc tài liệu PDF/Word giữ nguyên cấu trúc bảng biểu tài chính dài hơn 100 trang.',
            'Kết hợp tìm kiếm từ khóa chính xác và tìm kiếm ngữ nghĩa (Vector Search), rút ngắn thời gian phản hồi xuống dưới 800ms.',
            'Thiết lập cơ chế bắt buộc trích dẫn số trang tài liệu gốc và phân quyền truy cập theo phòng ban.',
          ],
        },
        {
          id: 'proj-2',
          name: 'Nền tảng Đối soát Thanh toán & Quản lý Đơn hàng Tự động',
          role: 'Backend Python Developer',
          period: '03/2025 – 08/2026',
          techStack: 'Python, FastAPI, PostgreSQL, Celery, Redis',
          highlights: [
            'Thiết kế API xử lý Webhook chuyển khoản ngân hàng tự động với cơ chế chống trùng lặp giao dịch.',
            'Tối ưu hóa chỉ mục SQL và bộ nhớ đệm Redis giúp phục vụ 2.500 yêu cầu/giây ổn định.',
          ],
        },
      ],
      externalSkills: [
        { name: 'Golang', note: 'Ghi nhận từ dự án cá nhân trong CV' },
        { name: 'C++', note: 'Nền tảng cấu trúc dữ liệu & giải thuật ĐH' },
        { name: 'Git', note: 'Quản lý mã nguồn & làm việc nhóm (GitHub / GitLab)' },
        { name: 'Linux', note: 'Quản trị máy chủ Ubuntu & dòng lệnh Bash' },
        { name: 'Tiếng Anh TOEIC 800', note: 'Đọc hiểu tài liệu kỹ thuật & giao tiếp công việc' },
        { name: 'Unit Testing (PyTest)', note: 'Kiểm thử tự động cho dịch vụ Backend' },
      ],
    };

    await db.insert(userProfiles).values([
      {
        accountId: adminAcc.id,
        fullName: 'Ban Quản Trị Học Viện 3T',
        bio: 'Quản trị vận hành & Đào tạo 3T Academy',
        interviewCredits: 99,
        cvParsedData: {
          fileName: 'Admin_Profile.pdf',
          updatedAt: '01/10/2026',
          fullName: 'Ban Quản Trị Học Viện 3T',
          headline: 'Quản trị vận hành & Đào tạo 3T Academy',
          email: 'admin@3tacademy.vn',
          phone: '028 3888 9999',
          githubUrl: 'github.com/3t-academy',
          linkedinUrl: 'linkedin.com/company/3t-academy',
          careerObjective: 'Quản lý chất lượng đào tạo và cấp chứng chỉ tốt nghiệp.',
          projects: [],
          externalSkills: [],
        },
      },
      {
        accountId: instKhoaAcc.id,
        fullName: 'TS. Trần Minh Khoa',
        avatarUrl: '/src/assets/images/instructor_minh_khoa_1794209569290.jpg',
        bio: 'Chuyên gia AI & Xử lý ngôn ngữ tự nhiên với hơn 10 năm kinh nghiệm triển khai RAG & LLM.',
        interviewCredits: 99,
        cvParsedData: {
          fileName: 'Profile_TS_Tran_Minh_Khoa.pdf',
          updatedAt: '01/10/2026',
          fullName: 'TS. Trần Minh Khoa',
          headline: 'Giảng viên Trưởng Khối AI & Xử lý ngôn ngữ tự nhiên',
          email: 'khoa.tran@3tacademy.vn',
          phone: '0909 000 111',
          githubUrl: 'github.com/tranminhkhoa-ai',
          linkedinUrl: 'linkedin.com/in/tranminhkhoa',
          careerObjective: 'Nghiên cứu và đào tạo Kỹ sư AI Thực chiến tại 3T Academy.',
          projects: [],
          externalSkills: [],
        },
      },
      {
        accountId: instHaAcc.id,
        fullName: 'ThS. Lê Thu Hà',
        avatarUrl: '/src/assets/images/instructor_thu_ha_1794209570725.jpg',
        bio: 'Kiến trúc sư Hệ thống Phân tán, Điện toán đám mây & Kỹ thuật dữ liệu.',
        interviewCredits: 99,
        cvParsedData: {},
      },
      {
        accountId: stuAnAcc.id,
        fullName: 'Nguyễn Văn An',
        bio: 'Kỹ Sư Backend Python & Ứng Dụng AI (AI Engineer)',
        careerGoal: 'Trở thành AI Engineer chuyên thiết kế hệ thống Hybrid RAG và AI Agent doanh nghiệp',
        goalEmbedding: makeDeterministicVector(1),
        interviewCredits: 4,
        cvParsedData: anCvParsedData,
      },
      {
        accountId: stuMaiAcc.id,
        fullName: 'Lê Hoàng Mai',
        bio: 'Data Analyst chuyển hướng sang AI Engineer',
        interviewCredits: 2,
        cvParsedData: {},
      },
      {
        accountId: stuHaAcc.id,
        fullName: 'Phạm Thu Hà',
        bio: 'Kỹ sư dữ liệu tại doanh nghiệp bán lẻ',
        interviewCredits: 1,
        cvParsedData: {},
      },
      {
        accountId: stuQuanAcc.id,
        fullName: 'Trần Minh Quân',
        bio: 'Lập trình viên Backend Node.js / Python',
        interviewCredits: 0,
        cvParsedData: {},
      },
      {
        accountId: stuAnhAcc.id,
        fullName: 'Vũ Đức Anh',
        bio: 'Sinh viên năm cuối ngành Khoa học Máy tính',
        interviewCredits: 0,
        cvParsedData: {},
      },
      {
        accountId: stuKhanhAcc.id,
        fullName: 'Đỗ Quốc Khánh',
        bio: 'Kỹ sư phần mềm tại TechCorp',
        interviewCredits: 1,
        cvParsedData: {},
      },
      {
        accountId: stuBaoAcc.id,
        fullName: 'Hoàng Gia Bảo',
        bio: 'Học viên lớp K02',
        interviewCredits: 0,
        cvParsedData: {},
      },
      {
        accountId: stuKhoiAcc.id,
        fullName: 'Vũ Đình Khôi',
        bio: 'Kỹ sư dữ liệu tại FPT Software',
        interviewCredits: 4,
        cvParsedData: {},
      },
    ]);

    // Seed instructor_profiles
    await db.insert(instructorProfiles).values([
      {
        accountId: instKhoaAcc.id,
        headline: 'Chuyên gia AI & Xử lý ngôn ngữ tự nhiên',
        organization: '3T Research Lab',
        yearsOfExperience: 10,
        expertiseSummaryMd:
          'Tiến sĩ Khoa học Máy tính, chuyên sâu về Hệ thống Tìm kiếm Ngữ nghĩa (Hybrid RAG), Vector Database (pgvector) và Tác tử AI (AI Agents) trong doanh nghiệp.',
        socialLinks: {
          github: 'https://github.com/tranminhkhoa-ai',
          linkedin: 'https://linkedin.com/in/tranminhkhoa',
        },
      },
      {
        accountId: instHaAcc.id,
        headline: 'Kiến trúc sư Hệ thống & Đám mây',
        organization: '3T Cloud Division',
        yearsOfExperience: 8,
        expertiseSummaryMd:
          'Thạc sĩ Kỹ thuật Phần mềm, dẫn dắt các hệ thống thanh toán chịu tải cao, kiến trúc bất đồng bộ và kho dữ liệu phân tích.',
        socialLinks: {
          github: 'https://github.com/lethuha-cloud',
          linkedin: 'https://linkedin.com/in/lethuha',
        },
      },
    ]);

    // =========================================================================
    // 3. DOMAIN 2 — CATEGORIES, SKILLS, COURSES, COHORTS & CLASS SESSIONS
    // =========================================================================
    const insertedCategories = await db
      .insert(categories)
      .values([
        {
          name: 'AI & Dữ liệu',
          slug: 'ai-data',
          description: 'Các chương trình đào tạo Kỹ sư AI thực chiến, RAG, LLM và Nền tảng Python/SQL',
        },
        {
          name: 'Kỹ thuật Phần mềm & Cloud',
          slug: 'software-cloud',
          description: 'Thiết kế hệ thống chịu tải cao, Backend phân tán và triển khai Đám mây',
        },
        {
          name: 'Phân tích Dữ liệu',
          slug: 'data-analytics',
          description: 'Phân tích dữ liệu thực chiến, mô hình hóa dữ liệu và báo cáo quản trị BI',
        },
      ])
      .returning();

    const catAi = insertedCategories[0]!;
    const catSwe = insertedCategories[1]!;
    const catData = insertedCategories[2]!;

    const insertedSkills = await db
      .insert(skills)
      .values([
        // Nhóm kỹ năng nền tảng & khóa học
        { categoryId: catAi.id, code: 'PY-CORE', name: 'Python', description: 'Lập trình Python hiện đại, OOP và xử lý bất đồng bộ' },
        { categoryId: catAi.id, code: 'PYTHON-CORE', name: 'Python', description: 'Lập trình Python thực chiến' },
        { categoryId: catAi.id, code: 'SQL-BASE', name: 'SQL', description: 'Ngôn ngữ truy vấn cơ sở dữ liệu quan hệ SQL' },
        { categoryId: catAi.id, code: 'POSTGRES-SQL', name: 'PostgreSQL & SQL', description: 'Thiết kế CSDL quan hệ, Indexing, Transaction và pgvector trên PostgreSQL' },
        { categoryId: catAi.id, code: 'PANDAS-ANALYTICS', name: 'Pandas', description: 'Làm sạch, biến đổi và phân tích dữ liệu bảng với Pandas' },
        { categoryId: catAi.id, code: 'FASTAPI-ASYNC', name: 'FastAPI', description: 'Xây dựng dịch vụ API bất đồng bộ tốc độ cao với FastAPI & Pydantic' },
        { categoryId: catAi.id, code: 'VEC-DB', name: 'Cơ sở dữ liệu Vector', description: 'Lưu trữ và truy vấn vector đa chiều với chỉ mục HNSW' },
        { categoryId: catAi.id, code: 'HYBRID-RAG', name: 'RAG & Vector Search', description: 'Tìm kiếm kết hợp từ khóa (BM25/FTS) và ngữ nghĩa (Cosine Similarity)' },
        { categoryId: catAi.id, code: 'AI-AGENT', name: 'Xây dựng Trợ lý AI', description: 'Thiết kế Trợ lý AI có khả năng tra cứu công cụ và trích dẫn nguồn' },
        { categoryId: catAi.id, code: 'AI-AGENTS', name: 'AI Agents', description: 'Điều phối tác tử AI tự chủ và gọi hàm (Function Calling)' },
        { categoryId: catAi.id, code: 'AI-EVAL', name: 'Kiểm thử chất lượng AI', description: 'Đo lường độ trung thực (Faithfulness) và chống suy diễn (Hallucination)' },
        { categoryId: catAi.id, code: 'FINE-TUNING', name: 'Fine-tuning', description: 'Tinh chỉnh mô hình ngôn ngữ chuyên biệt với dữ liệu nội bộ' },
        { categoryId: catSwe.id, code: 'REDIS-CACHE', name: 'Redis', description: 'Bộ nhớ đệm tốc độ cao, Semantic Cache và hàng đợi tác vụ' },
        { categoryId: catSwe.id, code: 'DOCKER-DEPLOY', name: 'Docker', description: 'Đóng gói dịch vụ đa tầng với Docker và Docker Compose' },
        // Nhóm kỹ năng gắn với từng câu hỏi trắc nghiệm (Quiz Bank)
        { categoryId: catAi.id, code: 'DOCLING-CHUNK', name: 'Đọc & Chia nhỏ tài liệu thông minh', description: 'Bóc tách PDF/Word giữ nguyên cấu trúc bảng biểu Markdown' },
        { categoryId: catAi.id, code: 'FAITHFULNESS', name: 'Kiểm soát độ chính xác & Trích dẫn nguồn', description: 'Đảm bảo AI chỉ trả lời dựa trên tài liệu có trích dẫn trang' },
        { categoryId: catSwe.id, code: 'ASYNC-LATENCY', name: 'Xử lý bất đồng bộ & Tối ưu tốc độ', description: 'Chạy song song các nhánh tìm kiếm để giữ độ trễ dưới 1 giây' },
        { categoryId: catSwe.id, code: 'DATA-SECURITY', name: 'Bảo mật & Phân quyền tài liệu AI', description: 'Kiểm soát quyền truy cập tài liệu ngay ở tầng truy vấn SQL' },
        // Nhóm kỹ năng của khóa SWE & Data
        { categoryId: catSwe.id, code: 'NODE-TS', name: 'Node.js', description: 'Phát triển Backend hiệu năng cao với Node.js & TypeScript' },
        { categoryId: catSwe.id, code: 'DIST-SYS', name: 'Hệ thống phân tán', description: 'Thiết kế hệ thống chịu tải cao, Idempotency và Message Queue' },
        { categoryId: catSwe.id, code: 'DB-TUNE', name: 'Tối ưu PostgreSQL', description: 'Khóa dòng giao dịch (Row Locking) và tối ưu chỉ mục dữ liệu lớn' },
        { categoryId: catSwe.id, code: 'CLOUD-OPS', name: 'Triển khai Cloud', description: 'Vận hành, giám sát lỗi và bảo mật API trên hạ tầng Cloud' },
        { categoryId: catData.id, code: 'DATA-MOD', name: 'Mô hình hóa dữ liệu', description: 'Chuẩn hóa kho dữ liệu từ dữ liệu thô sang báo cáo quản trị' },
        { categoryId: catData.id, code: 'BI-DASH', name: 'Phân tích tăng trưởng', description: 'Phân tích tỷ lệ giữ chân khách hàng và báo cáo trực quan' },
        { categoryId: catAi.id, code: 'API-JSON', name: 'Kết nối dữ liệu API', description: 'Làm việc với chuẩn JSON và tích hợp RESTful API' },
      ])
      .returning();

    const skillByCode = new Map(insertedSkills.map((s) => [s.code, s]));

    // Seed 4 Courses matching INITIAL_COURSES
    const insertedCourses = await db
      .insert(courses)
      .values([
        {
          categoryId: catAi.id,
          slug: 'ai-engineer-hybrid-rag',
          title: 'Kỹ Sư AI Thực Chiến: Xây Dựng Trợ Lý Tri Thức & Ứng Dụng AI Doanh Nghiệp',
          shortDescription:
            'Tự tay xây dựng hệ thống tìm kiếm thông minh, kết nối cơ sở dữ liệu nội bộ và phát triển Trợ lý AI trả lời chính xác kèm trích dẫn tài liệu gốc.',
          descriptionMd:
            'Chương trình đào tạo 12 buổi học trực tiếp cùng chuyên gia, giúp bạn đi từ nền tảng lập trình Python sang tự tay xây dựng được sản phẩm Trợ lý AI hoàn chỉnh cho doanh nghiệp. Bạn sẽ được hướng dẫn từng bước cách xử lý tài liệu PDF/Word dài hàng trăm trang, thiết kế bộ máy tìm kiếm kết hợp ngữ nghĩa và từ khóa, kiểm soát chất lượng câu trả lời và tối ưu tốc độ phản hồi thực tế.',
          difficultyLevel: 4,
          status: 'PUBLISHED',
          embedding: makeDeterministicVector(10),
          syllabusTemplate: [
            {
              order: 1,
              title: 'Tổng quan ứng dụng AI trong doanh nghiệp & Cách giúp AI trả lời đúng sự thật',
              summary: 'Hiểu rõ nguyên nhân AI trả lời sai lệch và cách buộc hệ thống luôn trích dẫn nguồn tài liệu gốc.',
              activityTags: ['THEORY', 'WORKSHOP'],
            },
            {
              order: 2,
              title: 'Biểu diễn văn bản tiếng Việt thành Vector & Tìm kiếm theo ngữ nghĩa',
              summary: 'Thực hành chuyển đổi câu chữ thành vector số học để máy tính hiểu đúng ý nghĩa câu hỏi của người dùng.',
              activityTags: ['THEORY', 'LIVE_CODING'],
            },
            {
              order: 3,
              title: 'Thiết kế & Tăng tốc truy vấn Cơ sở dữ liệu Vector trên PostgreSQL',
              summary: 'Tổ chức bảng dữ liệu hàng triệu văn bản và tối ưu chỉ mục để tìm kiếm nhanh trong tích tắc.',
              activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
            },
            {
              order: 4,
              title: 'Kỹ thuật bóc tách tài liệu PDF/Word an toàn & Chia nhỏ đoạn văn thông minh',
              summary: 'Xây dựng bộ đọc tài liệu giữ nguyên bảng biểu và kiểm soát dung lượng tệp đầu vào an toàn.',
              activityTags: ['THEORY', 'LIVE_CODING'],
            },
            {
              order: 5,
              title: 'Kết hợp tìm kiếm từ khóa và tìm kiếm ngữ nghĩa để đạt độ chính xác cao nhất',
              summary: 'Phối hợp linh hoạt giữa tìm chính xác mã hiệu/tên riêng và tìm theo ý nghĩa câu hỏi.',
              activityTags: ['LIVE_CODING', 'WORKSHOP'],
            },
            {
              order: 6,
              title: 'Xây dựng Trợ giảng AI gắn mốc thời gian video & Trích dẫn trang tài liệu',
              summary: 'Đồng bộ hóa phụ đề bài giảng theo từng giây và dẫn người học tới đúng đoạn video cần xem.',
              activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
            },
          ],
        },
        {
          categoryId: catSwe.id,
          slug: 'distributed-backend-cloud-native-golang',
          title: 'Kỹ Sư Backend & Cloud Thực Chiến: Thiết Kế Hệ Thống Chịu Tải Cao',
          shortDescription:
            'Làm chủ kỹ năng thiết kế hệ thống thanh toán tự động, xử lý hàng nghìn giao dịch cùng lúc, tối ưu cơ sở dữ liệu và triển khai ứng dụng đám mây.',
          descriptionMd:
            'Khóa học dành cho lập trình viên muốn nâng tầm kỹ năng từ viết tính năng cơ bản sang thiết kế hệ thống lớn, hoạt động ổn định và an toàn. Bạn sẽ trực tiếp thực hành xây dựng luồng đối soát thanh toán ngân hàng tự động trong 3 giây, chống trùng lặp giao dịch khi mạng chập chờn và theo dõi sức khỏe hệ thống trực quan.',
          difficultyLevel: 4,
          status: 'PUBLISHED',
          embedding: makeDeterministicVector(20),
          syllabusTemplate: [
            {
              order: 1,
              title: 'Thiết kế luồng thanh toán chuyển khoản ngân hàng tự động & Đối soát an toàn',
              summary: 'Đảm bảo mỗi đơn hàng luôn được kích hoạt chính xác ngay cả khi đường truyền mạng bị gián đoạn.',
              activityTags: ['THEORY', 'LIVE_CODING'],
            },
            {
              order: 2,
              title: 'Tối ưu hóa truy vấn PostgreSQL & Xử lý nhiều người mua hàng cùng lúc',
              summary: 'Thực hành cơ chế khóa dòng dữ liệu an toàn và viết câu lệnh SQL chạy mượt trên dữ liệu lớn.',
              activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
            },
            {
              order: 3,
              title: 'Kiến trúc hàng đợi tin nhắn (Message Queue) & Xử lý tác vụ chạy ngầm',
              summary: 'Tách biệt các tác vụ gửi email, xuất báo cáo và xử lý video để giao diện người dùng luôn phản hồi tức thì.',
              activityTags: ['THEORY', 'LIVE_CODING'],
            },
            {
              order: 4,
              title: 'Bảo vệ hệ thống API, Phân quyền người dùng & Giám sát lỗi thời gian thực',
              summary: 'Thiết lập lớp bảo vệ tài khoản, giới hạn tần suất gọi API và cảnh báo sớm khi hệ thống quá tải.',
              activityTags: ['LIVE_CODING', 'WORKSHOP'],
            },
          ],
        },
        {
          categoryId: catData.id,
          slug: 'analytics-engineering-dbt-lakehouse',
          title: 'Phân Tích Dữ Liệu Thực Chiến & Xây Dựng Báo Cáo Thông Minh Với SQL, Python',
          shortDescription:
            'Làm chủ quy trình làm sạch dữ liệu, tự động hóa kiểm tra chất lượng số liệu và xây dựng hệ thống báo cáo trực quan giúp doanh nghiệp ra quyết định.',
          descriptionMd:
            'Chương trình thiết kế thực tế cho bạn muốn làm chủ trọn vẹn luồng phân tích dữ liệu hiện đại. Bạn sẽ thực hành trên bộ dữ liệu thực tế của doanh nghiệp, viết truy vấn SQL tối ưu và tự động hóa quy trình cập nhật báo cáo mỗi ngày.',
          difficultyLevel: 3,
          status: 'PUBLISHED',
          embedding: makeDeterministicVector(30),
          syllabusTemplate: [
            {
              order: 1,
              title: 'Tổ chức kho dữ liệu khoa học từ dữ liệu thô sang báo cáo quản trị',
              summary: 'Chuẩn hóa quy trình làm sạch và ghép nối dữ liệu từ nhiều nguồn khác nhau.',
              activityTags: ['THEORY', 'WORKSHOP'],
            },
            {
              order: 2,
              title: 'Kỹ thuật viết câu lệnh SQL nâng cao để phân tích hành vi khách hàng',
              summary: 'Đo lường tỷ lệ gắn bó của người dùng theo từng tuần và phát hiện sớm nguyên nhân rời bỏ.',
              activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
            },
            {
              order: 3,
              title: 'Tự động hóa kiểm tra độ chính xác của số liệu trước khi gửi báo cáo',
              summary: 'Thiết lập các bài kiểm tra tự động để phát hiện ngay dữ liệu bị thiếu hoặc trùng lặp.',
              activityTags: ['LIVE_CODING'],
            },
          ],
        },
        {
          categoryId: catAi.id,
          slug: 'python-sql-ai-foundation-bootcamp',
          title: 'Nền Tảng Lập Trình Python & Truy Vấn Dữ Liệu SQL Thực Chiến Cho Người Mới',
          shortDescription:
            'Lộ trình khởi đầu vững chắc giúp người mới hoặc người trái ngành nắm chắc Python hiện đại, xử lý dữ liệu bảng và viết truy vấn SQL tự tin.',
          descriptionMd:
            'Được thiết kế gần gũi, dễ hiểu dành riêng cho bạn mới bắt đầu hoặc muốn củng cố lại gốc lập trình trước khi học lên các lớp AI và Dữ liệu chuyên sâu. Mỗi buổi học đều có bài tập ngắn thực hành ngay tại lớp và trợ giảng AI đồng hành kèm cặp sát sao.',
          difficultyLevel: 2,
          status: 'PUBLISHED',
          embedding: makeDeterministicVector(40),
          syllabusTemplate: [
            {
              order: 1,
              title: 'Tư duy lập trình Python rõ ràng, dễ đọc & Quản lý dự án chuyên nghiệp',
              summary: 'Làm chủ cấu trúc dữ liệu, hàm, xử lý ngoại lệ và cách viết mã nguồn gọn gàng.',
              activityTags: ['THEORY', 'LIVE_CODING'],
            },
            {
              order: 2,
              title: 'Thiết kế bảng dữ liệu & Viết truy vấn SQL lấy đúng thông tin cần thiết',
              summary: 'Thực hành lọc, gom nhóm và kết nối nhiều bảng dữ liệu trên bài toán thực tế.',
              activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
            },
          ],
        },
      ])
      .returning();

    const courseAiRag = insertedCourses[0]!;
    const courseCloudSwe = insertedCourses[1]!;
    const courseDataAe = insertedCourses[2]!;
    const coursePyFoundations = insertedCourses[3]!;

    // Seed course_skills
    await db.insert(courseSkills).values([
      // Course 1: AI Engineer Hybrid RAG
      { courseId: courseAiRag.id, skillId: skillByCode.get('PY-CORE')!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
      { courseId: courseAiRag.id, skillId: skillByCode.get('SQL-BASE')!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
      { courseId: courseAiRag.id, skillId: skillByCode.get('VEC-DB')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: courseAiRag.id, skillId: skillByCode.get('HYBRID-RAG')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 2.0 },
      { courseId: courseAiRag.id, skillId: skillByCode.get('AI-AGENT')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: courseAiRag.id, skillId: skillByCode.get('AI-EVAL')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
      // Course 2: Backend & Cloud
      { courseId: courseCloudSwe.id, skillId: skillByCode.get('NODE-TS')!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
      { courseId: courseCloudSwe.id, skillId: skillByCode.get('SQL-BASE')!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
      { courseId: courseCloudSwe.id, skillId: skillByCode.get('DIST-SYS')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.8 },
      { courseId: courseCloudSwe.id, skillId: skillByCode.get('DB-TUNE')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: courseCloudSwe.id, skillId: skillByCode.get('CLOUD-OPS')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      // Course 3: Data Analytics
      { courseId: courseDataAe.id, skillId: skillByCode.get('SQL-BASE')!.id, skillRole: 'PREREQUISITE', targetWeight: 1.0 },
      { courseId: courseDataAe.id, skillId: skillByCode.get('PY-CORE')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.2 },
      { courseId: courseDataAe.id, skillId: skillByCode.get('DATA-MOD')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: courseDataAe.id, skillId: skillByCode.get('BI-DASH')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      // Course 4: Python & SQL Foundations
      { courseId: coursePyFoundations.id, skillId: skillByCode.get('PY-CORE')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: coursePyFoundations.id, skillId: skillByCode.get('SQL-BASE')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.5 },
      { courseId: coursePyFoundations.id, skillId: skillByCode.get('API-JSON')!.id, skillRole: 'LEARNING_OUTCOME', targetWeight: 1.0 },
    ]);

    // Seed 5 Cohorts matching INITIAL_COHORTS (including scheduleSlots JSONB)
    const insertedCohorts = await db
      .insert(cohorts)
      .values([
        {
          courseId: courseAiRag.id,
          instructorId: instKhoaAcc.id,
          code: 'AI-ENG-2026-K01',
          name: 'Lớp Kỹ Sư AI Thực Chiến — Khóa K01 (Đang mở ghi danh)',
          curriculumVersion: 'v2.4',
          scheduleSlots: [
            { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
            { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
          ],
          techStackNotes: 'Python 3.12, FastAPI, PostgreSQL 16 (pgvector), Redis, Docker',
          tuitionVnd: 8500000,
          enrolledCount: 34,
          enrollmentOpenAt: new Date('2026-10-15T00:00:00Z'),
          startDate: '2026-11-17',
          endDate: '2026-12-29',
          status: 'OPENING',
        },
        {
          courseId: courseAiRag.id,
          instructorId: instKhoaAcc.id,
          code: 'AI-ENG-2026-K02',
          name: 'Lớp Kỹ Sư AI Thực Chiến — Khóa K02 (Lịch linh hoạt Thứ 2 & Thứ 6)',
          curriculumVersion: 'v2.5',
          scheduleSlots: [
            { dayOfWeek: 1, startTime: '19:30', endTime: '21:30' },
            { dayOfWeek: 5, startTime: '16:30', endTime: '18:30' },
          ],
          techStackNotes: 'Python 3.12, FastAPI, PostgreSQL 16 (pgvector), LangGraph',
          tuitionVnd: 8500000,
          enrolledCount: 18,
          enrollmentOpenAt: new Date('2026-11-01T00:00:00Z'),
          startDate: '2027-01-09',
          endDate: '2027-02-21',
          status: 'OPENING',
        },
        {
          courseId: courseCloudSwe.id,
          instructorId: instHaAcc.id,
          code: 'SWE-CLOUD-2026-K01',
          name: 'Lớp Kỹ Sư Backend & Cloud — Khóa K01',
          curriculumVersion: 'v3.1',
          scheduleSlots: [
            { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
            { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
          ],
          techStackNotes: 'Node.js, TypeScript, Fastify, PostgreSQL, Redis, AWS',
          tuitionVnd: 7800000,
          enrolledCount: 29,
          enrollmentOpenAt: new Date('2026-10-20T00:00:00Z'),
          startDate: '2026-11-20',
          endDate: '2026-12-30',
          status: 'OPENING',
        },
        {
          courseId: courseDataAe.id,
          instructorId: instHaAcc.id,
          code: 'DATA-AE-2026-K01',
          name: 'Lớp Phân Tích Dữ Liệu Thực Chiến — Khóa K01',
          curriculumVersion: 'v1.9',
          scheduleSlots: [
            { dayOfWeek: 3, startTime: '19:30', endTime: '21:30' },
            { dayOfWeek: 0, startTime: '15:00', endTime: '17:00' },
          ],
          techStackNotes: 'SQL, Python, Pandas, dbt, DuckDB',
          tuitionVnd: 6500000,
          enrolledCount: 41,
          enrollmentOpenAt: new Date('2026-10-10T00:00:00Z'),
          startDate: '2026-11-18',
          endDate: '2026-12-27',
          status: 'OPENING',
        },
        {
          courseId: coursePyFoundations.id,
          instructorId: instKhoaAcc.id,
          code: 'PY-SQL-2026-K04',
          name: 'Lớp Nền Tảng Python & SQL Thực Chiến — Khóa K04',
          curriculumVersion: 'v4.0',
          scheduleSlots: [
            { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
            { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
          ],
          techStackNotes: 'Python 3.12, SQL, PostgreSQL, FastAPI cơ bản',
          tuitionVnd: 4900000,
          enrolledCount: 52,
          enrollmentOpenAt: new Date('2026-10-25T00:00:00Z'),
          startDate: '2026-11-21',
          endDate: '2026-12-26',
          status: 'OPENING',
        },
      ])
      .returning();

    const cohortAiK01 = insertedCohorts[0]!;
    const cohortAiK02 = insertedCohorts[1]!;
    const cohortPyK04 = insertedCohorts[4]!;

    // Seed 6 Class Sessions for AI-ENG-2026-K01 (non-overlapping timestamps respecting GiST constraint)
    const insertedSessions = await db
      .insert(classSessions)
      .values([
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 1,
          title: 'Buổi 1: Tổng quan ứng dụng AI thực tế & Cách giúp AI luôn trả lời kèm trích dẫn đúng',
          activityTags: ['THEORY', 'WORKSHOP'],
          descriptionMd: 'Hiểu rõ nguyên nhân AI trả lời sai lệch và cách buộc hệ thống luôn trích dẫn nguồn tài liệu gốc.',
          scheduledStart: new Date('2026-10-25T12:30:00Z'), // 19:30 ICT
          scheduledEnd: new Date('2026-10-25T14:30:00Z'),   // 21:30 ICT
          status: 'REPLAY_READY',
          livekitRoomName: 'room-ai-k01-sess-01',
          videoProvider: 'R2_HLS_AES128',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-01/master.m3u8',
          durationSeconds: 7200,
          aiSummaryMd:
            'Hiểu rõ khi nào nên kết nối tài liệu nội bộ cho AI và cách thiết lập quy tắc buộc Trợ lý thông minh luôn dẫn nguồn rõ ràng từng trang tài liệu.',
          lastUpdatedBy: instKhoaAcc.id,
        },
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 2,
          title: 'Buổi 2: Biểu diễn văn bản tiếng Việt thành Vector & Tìm kiếm theo ý nghĩa',
          activityTags: ['THEORY', 'LIVE_CODING'],
          descriptionMd: 'Thực hành chuyển đổi câu chữ thành vector số học để máy tính hiểu đúng ý nghĩa câu hỏi của người dùng.',
          scheduledStart: new Date('2026-10-29T12:30:00Z'),
          scheduledEnd: new Date('2026-10-29T14:30:00Z'),
          status: 'REPLAY_READY',
          livekitRoomName: 'room-ai-k01-sess-02',
          videoProvider: 'R2_HLS_AES128',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-02/master.m3u8',
          durationSeconds: 7450,
          aiSummaryMd:
            'Thực hành cách chuyển câu hỏi tiếng Việt có dấu thành các con số để máy tính tìm được đúng đoạn tài liệu đồng nghĩa dù người dùng dùng từ khóa khác nhau.',
          lastUpdatedBy: instKhoaAcc.id,
        },
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 3,
          title: 'Buổi 3: Tổ chức & Tăng tốc truy vấn kho tài liệu lớn trên PostgreSQL',
          activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          descriptionMd: 'Tổ chức bảng dữ liệu hàng triệu văn bản và tối ưu chỉ mục HNSW để tìm kiếm nhanh trong tích tắc.',
          scheduledStart: new Date('2026-11-01T12:30:00Z'),
          scheduledEnd: new Date('2026-11-01T14:30:00Z'),
          status: 'REPLAY_READY',
          livekitRoomName: 'room-ai-k01-sess-03',
          videoProvider: 'R2_HLS_AES128',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-03/master.m3u8',
          durationSeconds: 7100,
          aiSummaryMd:
            'Thực hành thiết lập chỉ mục tìm kiếm nhanh trên cơ sở dữ liệu PostgreSQL giúp tra cứu hàng trăm nghìn trang tài liệu chỉ trong vài chục mili-giây.',
          lastUpdatedBy: instKhoaAcc.id,
        },
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 4,
          title: 'Buổi 4: Kỹ thuật đọc tài liệu PDF/Word an toàn & Chia nhỏ đoạn văn giữ nguyên ngữ cảnh',
          activityTags: ['THEORY', 'LIVE_CODING'],
          descriptionMd: 'Xây dựng bộ đọc tài liệu giữ nguyên bảng biểu và kiểm soát dung lượng tệp đầu vào an toàn.',
          scheduledStart: new Date('2026-11-05T12:30:00Z'),
          scheduledEnd: new Date('2026-11-05T14:30:00Z'),
          status: 'REPLAY_READY',
          livekitRoomName: 'room-ai-k01-sess-04',
          videoProvider: 'R2_HLS_AES128',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-04/master.m3u8',
          durationSeconds: 6900,
          aiSummaryMd:
            'Hướng dẫn kiểm tra độ an toàn khi nhận tệp tài liệu từ người dùng và cách cắt nhỏ các bảng biểu dài mà vẫn giữ nguyên dòng tiêu đề cột để AI luôn hiểu đúng số liệu.',
          lastUpdatedBy: instKhoaAcc.id,
        },
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 5,
          title: 'Buổi 5: Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa cho Trợ lý AI',
          activityTags: ['LIVE_CODING', 'WORKSHOP'],
          descriptionMd: 'Phối hợp linh hoạt giữa tìm chính xác mã hiệu/tên riêng và tìm theo ý nghĩa câu hỏi.',
          scheduledStart: new Date('2026-11-11T12:30:00Z'),
          scheduledEnd: new Date('2026-11-11T14:30:00Z'),
          status: 'LIVE',
          livekitRoomName: 'room-ai-k01-sess-05',
          videoProvider: 'BUNNY_STREAM',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-05/live.m3u8',
          durationSeconds: 7200,
          aiSummaryMd:
            'ĐANG HỌC TRỰC TUYẾN: Phối hợp giữa tìm kiếm chính xác mã văn bản/tên riêng với tìm kiếm theo ý nghĩa câu hỏi để Trợ lý AI luôn lấy được đoạn tài liệu chuẩn xác nhất.',
          lastUpdatedBy: instKhoaAcc.id,
        },
        {
          cohortId: cohortAiK01.id,
          instructorId: instKhoaAcc.id,
          sessionOrder: 6,
          title: 'Buổi 6: Xây dựng Trợ giảng AI gắn mốc giây video & Trích dẫn trang tài liệu',
          activityTags: ['LIVE_CODING', 'EXERCISE_REVIEW'],
          descriptionMd: 'Đồng bộ hóa phụ đề bài giảng theo từng giây và dẫn người học tới đúng đoạn video cần xem.',
          scheduledStart: new Date('2026-11-14T12:30:00Z'),
          scheduledEnd: new Date('2026-11-14T14:30:00Z'),
          status: 'SCHEDULED',
          livekitRoomName: 'room-ai-k01-sess-06',
          videoProvider: 'R2_HLS_AES128',
          videoR2Key: 'cohorts/cohort-ai-k01/sessions/sess-ai-06/master.m3u8',
          durationSeconds: 7200,
          aiSummaryMd:
            'Buổi học sắp diễn ra: Hướng dẫn cách đồng bộ phụ đề bài giảng theo từng giây và tạo nút bấm để người học nhảy thẳng tới đoạn video thầy đang giải thích.',
          lastUpdatedBy: instKhoaAcc.id,
        },
      ])
      .returning();

    const sess1 = insertedSessions[0]!;
    const sess2 = insertedSessions[1]!;
    const sess3 = insertedSessions[2]!;
    const sess4 = insertedSessions[3]!;
    const sess5 = insertedSessions[4]!;
    const sess6 = insertedSessions[5]!;

    // Seed session_attachments matching INITIAL_COHORT_MATERIALS
    const insertedAttachments = await db
      .insert(sessionAttachments)
      .values([
        {
          sessionId: sess5.id,
          fileName: 'Slide Bài giảng Buổi 5: Kết hợp tìm kiếm từ khóa và ngữ nghĩa (Bản đầy đủ)',
          r2ObjectKey: 'cohorts/ai-k01/sess-05/slide-hybrid-search.pdf',
          mimeType: 'application/vnd.ms-powerpoint',
          fileSizeBytes: 5033164, // ~4.8 MB
          uploadedBy: instKhoaAcc.id,
        },
        {
          sessionId: sess5.id,
          fileName: 'Mã nguồn thực hành Buổi 5: Câu lệnh SQL kết hợp tìm kiếm nhanh trên PostgreSQL',
          r2ObjectKey: 'cohorts/ai-k01/sess-05/repo-hybrid-rrf.zip',
          mimeType: 'application/zip',
          fileSizeBytes: 1258291, // ~1.2 MB
          uploadedBy: instKhoaAcc.id,
        },
        {
          sessionId: sess4.id,
          fileName: 'Tài liệu hướng dẫn Buổi 4: Bóc tách PDF/Word giữ nguyên bảng biểu & Chia đoạn văn',
          r2ObjectKey: 'cohorts/ai-k01/sess-04/pdf-docling-chunking-guide.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 3565158, // ~3.4 MB
          uploadedBy: instKhoaAcc.id,
        },
        {
          sessionId: sess3.id,
          fileName: 'Bài thực hành mẫu Buổi 3: Thiết lập và đo tốc độ truy vấn dữ liệu lớn',
          r2ObjectKey: 'cohorts/ai-k01/sess-03/notebook-hnsw-benchmark.ipynb',
          mimeType: 'application/x-ipynb+json',
          fileSizeBytes: 2202009, // ~2.1 MB
          uploadedBy: instKhoaAcc.id,
        },
      ])
      .returning();

    // Seed session_subtitles (.vtt)
    await db.insert(sessionSubtitles).values([
      {
        sessionId: sess1.id,
        languageCode: 'vi',
        vttR2Key: 'cohorts/ai-k01/sess-01/subtitles-vi.vtt',
        isAutoGenerated: true,
      },
      {
        sessionId: sess2.id,
        languageCode: 'vi',
        vttR2Key: 'cohorts/ai-k01/sess-02/subtitles-vi.vtt',
        isAutoGenerated: true,
      },
      {
        sessionId: sess3.id,
        languageCode: 'vi',
        vttR2Key: 'cohorts/ai-k01/sess-03/subtitles-vi.vtt',
        isAutoGenerated: true,
      },
      {
        sessionId: sess4.id,
        languageCode: 'vi',
        vttR2Key: 'cohorts/ai-k01/sess-04/subtitles-vi.vtt',
        isAutoGenerated: false,
      },
      {
        sessionId: sess5.id,
        languageCode: 'vi',
        vttR2Key: 'cohorts/ai-k01/sess-05/subtitles-vi.vtt',
        isAutoGenerated: true,
      },
    ]);

    // =========================================================================
    // 4. DOMAIN 3 — ORDERS, SEPAY TRANSACTIONS, ENROLLMENTS, PROGRESS & CERTS
    // =========================================================================
    const insertedOrders = await db
      .insert(orders)
      .values([
        // Order 1: ET20268410 (Paid - Python K04)
        {
          orderCode: 'ET20268410',
          accountId: stuAnAcc.id,
          cohortId: cohortPyK04.id,
          amountVnd: 4900000,
          status: 'PAID',
          idempotencyKey: 'idem-ord-8410',
          paidAt: new Date('2026-10-12T13:14:00Z'),
          expiresAt: new Date('2026-10-13T13:14:00Z'),
        },
        // Order 2: ET20268891 (Paid - AI Engineer K01)
        {
          orderCode: 'ET20268891',
          accountId: stuAnAcc.id,
          cohortId: cohortAiK01.id,
          amountVnd: 8500000,
          status: 'PAID',
          idempotencyKey: 'idem-ord-8891',
          paidAt: new Date('2026-11-08T02:30:00Z'),
          expiresAt: new Date('2026-11-09T02:30:00Z'),
        },
        // Order 3: ET20268905 (Pending - Amount Mismatch test case)
        {
          orderCode: 'ET20268905',
          accountId: stuQuanAcc.id,
          cohortId: cohortAiK01.id,
          amountVnd: 8500000,
          status: 'PENDING',
          idempotencyKey: 'idem-ord-8905',
          expiresAt: new Date('2026-12-01T00:00:00Z'),
        },
      ])
      .returning();

    const ord8410 = insertedOrders[0]!;
    const ord8891 = insertedOrders[1]!;
    const ord8905 = insertedOrders[2]!;

    // Seed 4 payment_transactions matching INITIAL_PAYMENT_TRANSACTIONS (MATCHED, UNMATCHED_ORDER, AMOUNT_MISMATCH)
    await db.insert(paymentTransactions).values([
      {
        orderId: ord8410.id,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId: 'FT26285991023',
        amountVnd: 4900000,
        responseCode: '00',
        matchStatus: 'MATCHED',
        rawPayload: {
          orderCode: 'ET20268410',
          transferContent: 'ET20268410 NGUYEN VAN AN',
          referenceNumber: 'FT26285991023',
          bankBrandName: 'MBBank',
          processedAtDisplay: '12/10/2026 · 20:14',
        },
        createdAt: new Date('2026-10-12T13:14:00Z'),
      },
      {
        orderId: ord8891.id,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId: 'FT26310882190',
        amountVnd: 8500000,
        responseCode: '00',
        matchStatus: 'MATCHED',
        rawPayload: {
          orderCode: 'ET20268891',
          transferContent: 'ET20268891 KHOA AI K01',
          referenceNumber: 'FT26310882190',
          bankBrandName: 'MBBank',
          processedAtDisplay: '08/11/2026 · 09:30',
        },
        createdAt: new Date('2026-11-08T02:30:00Z'),
      },
      {
        orderId: null,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId: 'FT26312004512',
        amountVnd: 8500000,
        responseCode: '00',
        matchStatus: 'UNMATCHED_ORDER',
        rawPayload: {
          orderCode: null,
          transferContent: 'CHUYEN KHOAN HOC PHI AI K01 QUEN GHI MA DON',
          referenceNumber: 'FT26312004512',
          bankBrandName: 'MBBank',
          processedAtDisplay: '09/11/2026 · 15:20',
        },
        createdAt: new Date('2026-11-09T08:20:00Z'),
      },
      {
        orderId: ord8905.id,
        gateway: 'SEPAY_VIETQR',
        gatewayTxnId: 'FT26313991044',
        amountVnd: 5000000,
        responseCode: '00',
        matchStatus: 'AMOUNT_MISMATCH',
        rawPayload: {
          orderCode: 'ET20268905',
          transferContent: 'ET20268905 DONG TRUOC HOC PHI',
          referenceNumber: 'FT26313991044',
          bankBrandName: 'MBBank',
          processedAtDisplay: '10/11/2026 · 11:05',
        },
        createdAt: new Date('2026-11-10T04:05:00Z'),
      },
    ]);

    // Seed enrollments (matching INITIAL_ENROLLMENTS + dropoutRiskScore & riskLevel)
    const insertedEnrollments = await db
      .insert(enrollments)
      .values([
        // 1: Nguyễn Văn An - AI K01 (ACTIVE, LOW risk)
        {
          accountId: stuAnAcc.id,
          cohortId: cohortAiK01.id,
          orderId: ord8891.id,
          status: 'ACTIVE',
          finalExamPassed: true,
          dropoutRiskScore: 0.08,
          riskLevel: 'LOW',
          enrolledAt: new Date('2026-10-20T09:00:00Z'),
        },
        // 2: Lê Hoàng Mai - AI K01 (ACTIVE, LOW risk)
        {
          accountId: stuMaiAcc.id,
          cohortId: cohortAiK01.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.04,
          riskLevel: 'LOW',
          enrolledAt: new Date('2026-10-21T09:00:00Z'),
        },
        // 3: Phạm Thu Hà - AI K01 (ACTIVE, MEDIUM risk)
        {
          accountId: stuHaAcc.id,
          cohortId: cohortAiK01.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.46,
          riskLevel: 'MEDIUM',
          enrolledAt: new Date('2026-10-21T10:00:00Z'),
          lastRemindedAt: new Date('2026-11-09T08:30:00Z'),
        },
        // 4: Trần Minh Quân - AI K01 (ACTIVE, HIGH risk)
        {
          accountId: stuQuanAcc.id,
          cohortId: cohortAiK01.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.84,
          riskLevel: 'HIGH',
          enrolledAt: new Date('2026-10-22T09:00:00Z'),
          lastRemindedAt: new Date('2026-11-09T14:00:00Z'),
        },
        // 5: Vũ Đức Anh - AI K01 (ACTIVE, HIGH risk)
        {
          accountId: stuAnhAcc.id,
          cohortId: cohortAiK01.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.91,
          riskLevel: 'HIGH',
          enrolledAt: new Date('2026-10-22T11:00:00Z'),
          lastRemindedAt: new Date('2026-11-10T08:00:00Z'),
        },
        // 6: Đỗ Quốc Khánh - AI K01 (ACTIVE, HIGH risk)
        {
          accountId: stuKhanhAcc.id,
          cohortId: cohortAiK01.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.78,
          riskLevel: 'HIGH',
          enrolledAt: new Date('2026-10-23T09:00:00Z'),
          lastRemindedAt: new Date('2026-11-10T09:30:00Z'),
        },
        // 7: Hoàng Gia Bảo - AI K02 (ACTIVE, HIGH risk)
        {
          accountId: stuBaoAcc.id,
          cohortId: cohortAiK02.id,
          status: 'ACTIVE',
          finalExamPassed: false,
          dropoutRiskScore: 0.82,
          riskLevel: 'HIGH',
          enrolledAt: new Date('2026-11-01T09:00:00Z'),
        },
        // 8: Vũ Đình Khôi - Python K04 (COMPLETED, LOW risk)
        {
          accountId: stuKhoiAcc.id,
          cohortId: cohortPyK04.id,
          status: 'COMPLETED',
          finalExamPassed: true,
          dropoutRiskScore: 0.02,
          riskLevel: 'LOW',
          enrolledAt: new Date('2026-09-15T09:00:00Z'),
          completedAt: new Date('2026-11-09T20:00:00Z'),
        },
        // 9: Nguyễn Văn An - Python K04 (COMPLETED, LOW risk)
        {
          accountId: stuAnAcc.id,
          cohortId: cohortPyK04.id,
          orderId: ord8410.id,
          status: 'COMPLETED',
          finalExamPassed: true,
          dropoutRiskScore: 0.02,
          riskLevel: 'LOW',
          enrolledAt: new Date('2026-10-12T13:15:00Z'),
          completedAt: new Date('2026-11-08T10:00:00Z'),
        },
      ])
      .returning();

    const enrAnAiK01 = insertedEnrollments[0]!;

    // Seed session_progress for Nguyễn Văn An & other students
    await db.insert(sessionProgress).values([
      {
        accountId: stuAnAcc.id,
        sessionId: sess1.id,
        lastPositionSec: 7200,
        isCompleted: true,
        completedAt: new Date('2026-10-25T15:00:00Z'),
        lastActivityAt: new Date('2026-10-25T15:00:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        sessionId: sess2.id,
        lastPositionSec: 7450,
        isCompleted: true,
        completedAt: new Date('2026-10-29T15:10:00Z'),
        lastActivityAt: new Date('2026-10-29T15:10:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        sessionId: sess3.id,
        lastPositionSec: 7100,
        isCompleted: true,
        completedAt: new Date('2026-11-01T15:05:00Z'),
        lastActivityAt: new Date('2026-11-01T15:05:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        sessionId: sess4.id,
        lastPositionSec: 2535,
        isCompleted: false,
        lastActivityAt: new Date('2026-11-10T18:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        sessionId: sess5.id,
        lastPositionSec: 1840,
        isCompleted: false,
        lastActivityAt: new Date('2026-11-11T13:00:00Z'),
      },
      // Tiến độ của Trần Minh Quân (High risk - bỏ dở từ ngày 03/11)
      {
        accountId: stuQuanAcc.id,
        sessionId: sess1.id,
        lastPositionSec: 7200,
        isCompleted: true,
        completedAt: new Date('2026-10-26T14:00:00Z'),
        lastActivityAt: new Date('2026-10-26T14:00:00Z'),
      },
      {
        accountId: stuQuanAcc.id,
        sessionId: sess2.id,
        lastPositionSec: 7450,
        isCompleted: true,
        completedAt: new Date('2026-11-03T09:15:00Z'),
        lastActivityAt: new Date('2026-11-03T09:15:00Z'),
      },
    ]);

    // Seed course_reviews
    await db.insert(courseReviews).values([
      {
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        accountId: stuAnAcc.id,
        rating: 5,
        comment:
          'Bài giảng cực kỳ thực tế, đặc biệt là phần xử lý bảng biểu PDF và kết hợp tìm kiếm BM25 + pgvector. Trợ giảng AI chỉ đúng từng giây video giúp mình tiết kiệm rất nhiều thời gian.',
        isPublic: true,
      },
      {
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        accountId: stuMaiAcc.id,
        rating: 5,
        comment: 'Thầy Khoa giải thích rất dễ hiểu, hệ thống bài tập trắc nghiệm sau mỗi buổi học giúp nắm chắc kiến thức cốt lõi.',
        isPublic: true,
      },
      {
        courseId: coursePyFoundations.id,
        cohortId: cohortPyK04.id,
        accountId: stuKhoiAcc.id,
        rating: 5,
        comment: 'Lộ trình Python & SQL rất bài bản, phù hợp cho cả người mới bắt đầu.',
        isPublic: true,
      },
    ]);

    // Seed certificates matching INITIAL_CERTIFICATES ('CERT-3T-2026-8891')
    await db.insert(certificates).values([
      {
        enrollmentId: enrAnAiK01.id,
        accountId: stuAnAcc.id,
        certificateCode: 'CERT-3T-2026-8891',
        hmacSignature: '3T-VERIFIED-2026-9F86D081884C7D659A2FEAA0C55AD015',
        issuedAt: new Date('2026-11-08T09:45:00Z'),
      },
    ]);

    // =========================================================================
    // 5. DOMAIN 4 — TIMESTAMPED DISCUSSIONS & NOTIFICATIONS
    // =========================================================================
    const insertedThreads = await db
      .insert(discussionThreads)
      .values([
        {
          sessionId: sess5.id,
          authorId: stuAnAcc.id,
          title:
            'Khi tìm kiếm văn bản tiếng Việt có nhiều từ ghép chuyên ngành thì mình cấu hình bộ lọc từ khóa thế nào cho chuẩn ạ?',
          videoTimestampSec: 860, // 14:20
          isResolved: true,
        },
        {
          sessionId: sess4.id,
          authorId: stuQuanAcc.id,
          title: 'Cách xử lý bảng báo cáo tài chính bị xoay ngang nằm xen kẽ trong file PDF dài?',
          videoTimestampSec: 2535, // 42:15
          isResolved: true,
        },
      ])
      .returning();

    const thread1 = insertedThreads[0]!;
    const thread2 = insertedThreads[1]!;

    // Seed discussion_posts (including self-referencing parentPostId)
    const insertedRootPosts1 = await db
      .insert(discussionPosts)
      .values([
        {
          threadId: thread1.id,
          authorId: stuAnAcc.id,
          contentMd:
            'Thầy Khoa cho mình hỏi: ở phút 14:20 (Trang 8 tài liệu) thầy có hướng dẫn cách tìm từ khóa trên PostgreSQL. Nếu tài liệu công ty mình có nhiều mã quy định và từ ghép tiếng Việt thì nên kết hợp như thế nào để tìm chính xác nhất ạ?',
          isAiGenerated: false,
          isInstructorVerified: false,
        },
      ])
      .returning();
    const rootPost1 = insertedRootPosts1[0]!;

    const insertedAiReplyPosts1 = await db
      .insert(discussionPosts)
      .values([
        {
          threadId: thread1.id,
          parentPostId: rootPost1.id,
          authorId: null,
          contentMd:
            'Giải thích từ bài giảng Buổi 5 (mốc 14:20 · Trang 8 Slide): Bạn dùng nhánh tìm kiếm từ khóa để bắt chính xác các mã quy định, số hiệu văn bản và tên riêng; còn phần ý nghĩa của từ ghép tiếng Việt sẽ do nhánh tìm kiếm Vector đảm nhiệm. Nhờ vậy tốc độ tìm kiếm luôn đạt dưới 15ms mà không sợ sót ý.',
          isAiGenerated: true,
          isInstructorVerified: true,
          verifiedBy: instKhoaAcc.id,
        },
      ])
      .returning();
    const aiReplyPost1 = insertedAiReplyPosts1[0]!;

    await db.insert(discussionPosts).values([
      {
        threadId: thread1.id,
        parentPostId: aiReplyPost1.id,
        authorId: instKhoaAcc.id,
        contentMd:
          'Gợi ý của Trợ giảng AI chuẩn rồi đó An ơi! Thầy bổ sung thêm mẹo thực tế: em bật thêm bộ lọc bỏ dấu tiếng Việt (unaccent) cho nhánh từ khóa để khi người dùng gõ không dấu vẫn tìm ra đúng mã văn bản nhé.',
        isAiGenerated: false,
        isInstructorVerified: true,
        verifiedBy: instKhoaAcc.id,
      },
    ]);

    const insertedRootPosts2 = await db
      .insert(discussionPosts)
      .values([
        {
          threadId: thread2.id,
          authorId: stuQuanAcc.id,
          contentMd:
            'Khi mình làm bài tập Buổi 4 ở đoạn phút 42:15, có vài trang bảng biểu xoay ngang làm thứ tự cột bị đảo. Có cách nào tự động xoay trang lại trước khi đọc bảng không ạ?',
          isAiGenerated: false,
          isInstructorVerified: false,
        },
      ])
      .returning();
    const rootPost2 = insertedRootPosts2[0]!;

    await db.insert(discussionPosts).values([
      {
        threadId: thread2.id,
        parentPostId: rootPost2.id,
        authorId: instKhoaAcc.id,
        contentMd:
          'Chào Quân nhé, bạn kiểm tra góc xoay của từng trang PDF trước khi gọi hàm tách bảng là xử lý gọn ngay. Mình đã cập nhật sẵn hàm mẫu trong kho tài liệu Buổi 4 (tệp `doc_parser_helper.py` dòng 78), bạn tải về chạy thử nhé!',
        isAiGenerated: false,
        isInstructorVerified: true,
        verifiedBy: instKhoaAcc.id,
      },
    ]);

    // Seed 5 notifications matching INITIAL_NOTIFICATIONS (with readAt & actedAt)
    await db.insert(notifications).values([
      {
        recipientId: stuAnAcc.id,
        type: 'AI_STUDY_REMINDER',
        title: 'Nhắc ôn tập Buổi 4 & Làm bài kiểm tra mở khóa',
        body: 'Chào An! Bạn đã xem 85% video Buổi 4. Chỉ cần dành 10 phút hoàn thành bài trắc nghiệm là mở khóa xong tài liệu Buổi 5 nhé.',
        metadata: {
          cohortId: String(cohortAiK01.id),
          cohortCode: 'AI-ENG-2026-K01',
          studentName: 'Nguyễn Văn An',
        },
        isRead: true,
        createdAt: new Date('2026-11-08T09:00:00Z'),
        readAt: new Date('2026-11-08T10:15:00Z'),
        actedAt: new Date('2026-11-08T10:42:00Z'),
      },
      {
        recipientId: stuHaAcc.id,
        type: 'AI_STUDY_REMINDER',
        title: 'Gợi ý ôn lại phần chỉ mục HNSW trong Buổi 3',
        body: 'Chào Hà! Trợ giảng AI đã tổng hợp đoạn video ngắn phút 18:45 giúp bạn nắm chắc phần truy vấn pgvector trước khi làm bài kiểm tra Buổi 4.',
        metadata: {
          cohortId: String(cohortAiK01.id),
          cohortCode: 'AI-ENG-2026-K01',
          studentName: 'Phạm Thu Hà',
        },
        isRead: true,
        createdAt: new Date('2026-11-09T08:30:00Z'),
        readAt: new Date('2026-11-09T12:10:00Z'),
        actedAt: new Date('2026-11-09T19:20:00Z'),
      },
      {
        recipientId: stuQuanAcc.id,
        type: 'AI_STUDY_REMINDER',
        title: 'Lộ trình 20 phút bắt kịp tiến độ Buổi 3 & Buổi 4',
        body: 'Chào Quân! Mình thấy 6 ngày qua bạn bận chưa vào lớp. AI đã tóm tắt 3 ý trọng tâm của Buổi 3 để bạn xem nhanh trong 15 phút tối nay nhé.',
        metadata: {
          cohortId: String(cohortAiK01.id),
          cohortCode: 'AI-ENG-2026-K01',
          studentName: 'Trần Minh Quân',
        },
        isRead: true,
        createdAt: new Date('2026-11-09T14:00:00Z'),
        readAt: new Date('2026-11-09T18:05:00Z'),
        actedAt: null,
      },
      {
        recipientId: stuAnhAcc.id,
        type: 'AI_STUDY_REMINDER',
        title: 'Hỗ trợ cá nhân hóa giúp bạn hoàn thành Buổi 2 & Buổi 3',
        body: 'Chào Đức Anh! Nếu bạn đang vướng phần thực hành chia nhỏ tài liệu PDF, bấm vào đây để xem hướng dẫn từng bước từ Trợ giảng AI nhé.',
        metadata: {
          cohortId: String(cohortAiK01.id),
          cohortCode: 'AI-ENG-2026-K01',
          studentName: 'Vũ Đức Anh',
        },
        isRead: false,
        createdAt: new Date('2026-11-10T08:00:00Z'),
        readAt: null,
        actedAt: null,
      },
      {
        recipientId: stuKhanhAcc.id,
        type: 'AI_STUDY_REMINDER',
        title: 'Nhắc hoàn thành bài kiểm tra ngắn trước ca Live Buổi 5',
        body: 'Chào Khánh! Tối nay lớp K01 học trực tuyến Buổi 5 lúc 19:30. Bạn bấm vào đây để làm nhanh 10 câu trắc nghiệm Buổi 4 nhé.',
        metadata: {
          cohortId: String(cohortAiK01.id),
          cohortCode: 'AI-ENG-2026-K01',
          studentName: 'Đỗ Quốc Khánh',
        },
        isRead: true,
        createdAt: new Date('2026-11-10T09:30:00Z'),
        readAt: new Date('2026-11-10T11:00:00Z'),
        actedAt: new Date('2026-11-10T13:15:00Z'),
      },
    ]);

    // =========================================================================
    // 6. DOMAIN 5 — ASSESSMENTS, MCQ ITEMS, ATTEMPTS & PROCTORING EVENTS
    // =========================================================================
    const insertedAssessments = await db
      .insert(assessments)
      .values([
        // 1: Quiz Buổi 4 (PUBLISHED)
        {
          cohortId: cohortAiK01.id,
          sessionId: sess4.id,
          purpose: 'SESSION_ASSIGNMENT',
          gradingMode: 'AUTO',
          title: 'Bài Kiểm Tra Mở Khóa Cuối Buổi 4 (10 câu Trắc nghiệm A, B, C, D)',
          instructionsMd: 'Hoàn thành tối thiểu 7/10 câu đúng (70%) để mở khóa hoàn thành Buổi 4.',
          durationMinutes: 15,
          passScorePct: 70,
          maxAttempts: 5,
          status: 'PUBLISHED',
        },
        // 2: Quiz Buổi 5 (DRAFT - Để giảng viên duyệt xuất bản trên UI)
        {
          cohortId: cohortAiK01.id,
          sessionId: sess5.id,
          purpose: 'SESSION_ASSIGNMENT',
          gradingMode: 'AUTO',
          title: 'Bài Kiểm Tra Mở Khóa Cuối Buổi 5 (10 câu Trắc nghiệm A, B, C, D)',
          instructionsMd: 'Bài kiểm tra tự động sinh bởi AI từ phụ đề bài giảng Buổi 5.',
          durationMinutes: 15,
          passScorePct: 70,
          maxAttempts: 5,
          status: 'DRAFT',
        },
        // 3: Bài Thi Tốt Nghiệp Cuối Khóa K01 (FINAL_EXAM - PUBLISHED)
        {
          cohortId: cohortAiK01.id,
          sessionId: null,
          purpose: 'FINAL_EXAM',
          gradingMode: 'AUTO',
          title: 'Bài Thi Tốt Nghiệp Cuối Khóa Kỹ Sư AI Thực Chiến — Khóa K01 (25 câu A, B, C, D)',
          instructionsMd: 'Kỳ thi có bật Camera giám sát AI chống gian lận. Điểm đạt: 7.0/10.',
          durationMinutes: 45,
          passScorePct: 70,
          maxAttempts: 2,
          proctoringConfig: {
            requireCamera: true,
            detectMultiFace: true,
            detectPhone: true,
            detectTabSwitch: true,
          },
          status: 'PUBLISHED',
        },
      ])
      .returning();

    const quizSess4 = insertedAssessments[0]!;
    const quizSess5 = insertedAssessments[1]!;
    const finalExamK01 = insertedAssessments[2]!;

    // 10 câu hỏi Trắc nghiệm Buổi 4 chuẩn từ phase2QuizBank.ts
    const session4Questions = [
      {
        number: 1,
        scenarioTag: 'Câu 1/10 · Giữ nguyên cấu trúc bảng biểu PDF',
        prompt:
          'Khi đọc một báo cáo tài chính PDF dài 80 trang có nhiều bảng số liệu, cách cắt văn bản nào giúp Trợ lý AI trả lời chính xác từng con số mà không bị đứt gãy dòng?',
        options: [
          'Nhận diện tiêu đề mục và chuyển nguyên bảng số liệu sang Markdown kèm số trang gốc',
          'Cắt cố định cứ đúng 300 ký tự một đoạn bất kể đang ở giữa bảng số liệu',
          'Xóa toàn bộ các con số trong bảng trước khi lưu vào cơ sở dữ liệu',
          'Gộp toàn bộ 80 trang PDF thành một chuỗi ký tự duy nhất không ngắt đoạn',
        ],
        correctIndex: 0,
        explanation:
          'Giữ nguyên cấu trúc bảng Markdown kèm tiêu đề mục cha giúp mô hình ngôn ngữ đọc đúng hàng và cột mà không bị trộn lẫn số liệu giữa các trang.',
        skillCode: 'DOCLING-CHUNK',
        skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
        reviewTimestampLabel: '00:10 - 00:25',
        reviewJumpSec: 10,
        reviewSegmentRangeSec: [10, 25],
        slideLabel: 'Slide Trang 8',
      },
      {
        number: 2,
        scenarioTag: 'Câu 2/10 · Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa',
        prompt:
          'Vì sao trong bài giảng thầy Khoa khuyên nên kết hợp cả tìm kiếm từ khóa chính xác lẫn tìm kiếm theo ý nghĩa câu hỏi?',
        options: [
          'Để vừa bắt trúng các mã hợp đồng, tên riêng chính xác vừa hiểu đúng ý câu hỏi tự nhiên của người dùng',
          'Để tăng gấp đôi dung lượng ổ cứng lưu trữ không cần thiết',
          'Vì tìm kiếm theo ý nghĩa câu hỏi không thể hoạt động trên tiếng Việt',
          'Để bắt người dùng phải nhập câu hỏi bằng tiếng Anh',
        ],
        correctIndex: 0,
        explanation:
          'Tìm kiếm từ khóa rất mạnh với mã số, ký hiệu; trong khi tìm kiếm ngữ nghĩa hiểu được các cách diễn đạt đồng nghĩa.',
        skillCode: 'HYBRID-RAG',
        skillName: 'Tìm kiếm kết hợp từ khóa & ngữ nghĩa',
        reviewTimestampLabel: '00:25 - 00:40',
        reviewJumpSec: 25,
        reviewSegmentRangeSec: [25, 40],
        slideLabel: 'Slide Trang 12',
      },
      {
        number: 3,
        scenarioTag: 'Câu 3/10 · Chống trả lời sai lệch (Trích dẫn nguồn)',
        prompt:
          'Khi kho tài liệu nội bộ không có thông tin cho câu hỏi của khách hàng, Trợ lý AI cần phản hồi như thế nào để đảm bảo an toàn?',
        options: [
          'Thông báo lịch sự rằng tài liệu hiện tại chưa có thông tin này và gợi ý chuyển câu hỏi cho nhân viên hỗ trợ',
          'Tự suy đoán câu trả lời gần đúng để khách hàng không phải chờ',
          'Lấy đại một con số từ trang bất kỳ trong tài liệu để trả lời',
          'Tự động xóa câu hỏi của khách hàng khỏi lịch sử trò chuyện',
        ],
        correctIndex: 0,
        explanation:
          'Nguyên tắc quan trọng nhất của Trợ lý AI doanh nghiệp là chỉ trả lời dựa trên tài liệu được cung cấp kèm số trang trích dẫn rõ ràng.',
        skillCode: 'FAITHFULNESS',
        skillName: 'Kiểm soát độ chính xác & Trích dẫn nguồn',
        reviewTimestampLabel: '00:10 - 00:25',
        reviewJumpSec: 10,
        reviewSegmentRangeSec: [10, 25],
        slideLabel: 'Slide Trang 8',
      },
      {
        number: 4,
        scenarioTag: 'Câu 4/10 · Xử lý bất đồng bộ & Tối ưu tốc độ phản hồi',
        prompt:
          'Để giữ thời gian phản hồi của hệ thống tìm kiếm dưới 1 giây khi có nhiều học viên hỏi cùng lúc, bước nào sau đây là hiệu quả nhất?',
        options: [
          'Chạy song song bước tìm từ khóa và tìm ngữ nghĩa bằng xử lý bất đồng bộ (Promise.all), sau đó chỉ chấm điểm tinh lọc trên 20 đoạn phù hợp nhất',
          'Chấm điểm lại toàn bộ 100.000 đoạn văn bản trong cơ sở dữ liệu ở mỗi lần hỏi',
          'Tắt hoàn toàn bộ nhớ đệm (Cache) của máy chủ',
          'Đợi người trước hỏi xong 5 phút mới cho người tiếp theo gửi câu hỏi',
        ],
        correctIndex: 0,
        explanation:
          'Xử lý bất đồng bộ song song và lọc sơ bộ 20 đoạn đầu giúp giảm hơn 70% thời gian chờ mà vẫn giữ nguyên độ chính xác.',
        skillCode: 'ASYNC-LATENCY',
        skillName: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
        reviewTimestampLabel: '00:45 - 01:05',
        reviewJumpSec: 45,
        reviewSegmentRangeSec: [45, 65],
        slideLabel: 'Slide Trang 18',
      },
      {
        number: 5,
        scenarioTag: 'Câu 5/10 · Phân quyền truy cập tài liệu nội bộ',
        prompt:
          'Khi nhân viên phòng Kinh doanh đặt câu hỏi cho Trợ lý AI, làm thế nào để đảm bảo hệ thống không vô tình trích dẫn tài liệu mật của phòng Nhân sự?',
        options: [
          'Kiểm tra và lọc quyền truy cập theo phòng ban của người hỏi ngay trong câu lệnh tìm kiếm cơ sở dữ liệu trước khi đưa văn bản cho AI tổng hợp',
          'Đưa toàn bộ tài liệu mật cho AI đọc rồi dặn AI đừng tiết lộ',
          'Chỉ ẩn tên file tài liệu trên màn hình giao diện người dùng',
          'Yêu cầu nhân viên tự cam kết không hỏi về lương thưởng',
        ],
        correctIndex: 0,
        explanation:
          'Phân quyền phải được thực hiện ngay ở bước truy vấn dữ liệu để những đoạn tài liệu không thuộc quyền hạn tuyệt đối không đi vào bước tổng hợp câu trả lời.',
        skillCode: 'DATA-SECURITY',
        skillName: 'Bảo mật & Phân quyền tài liệu AI',
        reviewTimestampLabel: '00:25 - 00:45',
        reviewJumpSec: 25,
        reviewSegmentRangeSec: [25, 45],
        slideLabel: 'Slide Trang 12',
      },
      {
        number: 6,
        scenarioTag: 'Câu 6/10 · Lưu trữ siêu dữ liệu (Metadata) cho từng đoạn văn',
        prompt:
          'Khi lưu từng đoạn văn bản đã tách vào bảng PostgreSQL, thông tin đính kèm (Metadata) nào sau đây là bắt buộc phải có để học viên/nhân viên kiểm chứng nguồn?',
        options: [
          'Tên file tài liệu gốc, số trang PDF và tiêu đề mục cha của đoạn văn bản đó',
          'Màu sắc hình nền của máy tính người tải file',
          'Dung lượng RAM còn trống của máy chủ lúc tải file',
          'Tên trình duyệt web của người dùng',
        ],
        correctIndex: 0,
        explanation:
          'Lưu kèm tên file, số trang và tiêu đề mục cha giúp hiển thị nút trích dẫn chính xác tới từng trang tài liệu gốc.',
        skillCode: 'DOCLING-CHUNK',
        skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
        reviewTimestampLabel: '00:10 - 00:22',
        reviewJumpSec: 10,
        reviewSegmentRangeSec: [10, 22],
        slideLabel: 'Slide Trang 8',
      },
      {
        number: 7,
        scenarioTag: 'Câu 7/10 · Độ chồng lấp ngữ cảnh (Chunk Overlap)',
        prompt:
          'Vì sao khi tách các đoạn văn bản dài, chúng ta thường giữ lại một phần nhỏ câu cuối của đoạn trước lặp lại ở đầu đoạn tiếp theo (Overlap)?',
        options: [
          'Để câu văn ở ranh giới giữa hai đoạn không bị mất chủ ngữ hoặc đứt mạch ý nghĩa khi tìm kiếm',
          'Để làm cho file cơ sở dữ liệu nặng gấp 10 lần',
          'Để thay thế hoàn toàn việc đánh chỉ mục cơ sở dữ liệu',
          'Vì cơ sở dữ liệu không cho phép lưu các đoạn văn khác nhau hoàn toàn',
        ],
        correctIndex: 0,
        explanation:
          'Giữ độ gối đầu hợp lý (10% - 15%) giúp bảo toàn mạch ngữ nghĩa ở điểm cắt giữa hai đoạn liên tiếp.',
        skillCode: 'DOCLING-CHUNK',
        skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
        reviewTimestampLabel: '00:15 - 00:30',
        reviewJumpSec: 15,
        reviewSegmentRangeSec: [15, 30],
        slideLabel: 'Slide Trang 9',
      },
      {
        number: 8,
        scenarioTag: 'Câu 8/10 · Chuẩn hóa câu hỏi đầu vào của người dùng',
        prompt:
          'Nếu người dùng gửi câu hỏi tiếp nối ngắn gọn như "Còn phí phạt trả chậm thì sao?", bước xử lý nào giúp hệ thống tìm kiếm hiểu đúng ngữ cảnh?',
        options: [
          'Kết hợp lịch sử câu hỏi ngay trước đó để viết lại thành câu hỏi đầy đủ chủ ngữ trước khi đem đi tìm kiếm tài liệu',
          'Bắt người dùng phải thoát ra đăng nhập lại từ đầu',
          'Chỉ lấy đúng chữ "sao" để tìm kiếm trong cơ sở dữ liệu',
          'Trả về ngẫu nhiên một trang tài liệu bất kỳ',
        ],
        correctIndex: 0,
        explanation:
          'Làm rõ ngữ cảnh câu hỏi dựa trên lịch sử hội thoại giúp truy vấn tìm kiếm bám sát chủ đề đang trao đổi.',
        skillCode: 'HYBRID-RAG',
        skillName: 'Tìm kiếm kết hợp từ khóa & ngữ nghĩa',
        reviewTimestampLabel: '00:25 - 00:40',
        reviewJumpSec: 25,
        reviewSegmentRangeSec: [25, 40],
        slideLabel: 'Slide Trang 14',
      },
      {
        number: 9,
        scenarioTag: 'Câu 9/10 · Kiểm tra giới hạn tệp tải lên an toàn',
        prompt:
          'Trước khi đưa một tệp PDF hoặc DOCX của người dùng vào bộ đọc văn bản, hệ thống cần kiểm tra điều kiện nào để tránh làm treo máy chủ?',
        options: [
          'Kiểm tra đúng định dạng tệp cho phép, giới hạn dung lượng tệp và số trang tối đa trước khi xử lý',
          'Mở trực tiếp mọi tệp thực thi (.exe) mà người dùng gửi lên',
          'Tắt tường lửa của máy chủ',
          'Không cần kiểm tra bất kỳ thông tin gì',
        ],
        correctIndex: 0,
        explanation:
          'Kiểm tra định dạng và giới hạn dung lượng đầu vào giúp bảo vệ bộ nhớ RAM và CPU của máy chủ trước các tệp bất thường.',
        skillCode: 'DATA-SECURITY',
        skillName: 'Bảo mật & Phân quyền tài liệu AI',
        reviewTimestampLabel: '00:45 - 01:05',
        reviewJumpSec: 45,
        reviewSegmentRangeSec: [45, 65],
        slideLabel: 'Slide Trang 18',
      },
      {
        number: 10,
        scenarioTag: 'Câu 10/10 · Bộ nhớ đệm giảm chi phí & tăng tốc (Caching)',
        prompt:
          'Khi có 500 học viên cùng hỏi một câu hỏi phổ biến về nội dung bài giảng, kỹ thuật nào giúp hệ thống trả lời tức thì trong 10 mili-giây mà không tốn chi phí gọi lại mô hình AI?',
        options: [
          'Lưu kết quả trả lời đã kiểm duyệt vào bộ nhớ đệm (Redis Cache) và trả về ngay khi gặp câu hỏi trùng khớp',
          'Gọi lại mô hình AI lớn 500 lần liên tiếp',
          'Yêu cầu 499 học viên còn lại chờ đến ngày hôm sau',
          'Xóa câu hỏi của học viên',
        ],
        correctIndex: 0,
        explanation:
          'Sử dụng bộ nhớ đệm Redis cho các câu hỏi phổ biến giúp phản hồi tức thì và tiết kiệm tới 80% chi phí vận hành.',
        skillCode: 'ASYNC-LATENCY',
        skillName: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
        reviewTimestampLabel: '00:45 - 01:10',
        reviewJumpSec: 45,
        reviewSegmentRangeSec: [45, 70],
        slideLabel: 'Slide Trang 20',
      },
    ];

    const insertedQuiz4Items = await db
      .insert(assessmentItems)
      .values(
        session4Questions.map((q) => ({
          assessmentId: quizSess4.id,
          skillId: skillByCode.get(q.skillCode)!.id,
          itemOrder: q.number,
          itemType: 'SINGLE_CHOICE' as const,
          points: '1.00',
          promptConfig: {
            number: q.number,
            scenarioTag: q.scenarioTag,
            prompt: q.prompt,
            options: q.options,
            skillCode: q.skillCode,
            skillName: q.skillName,
            slideLabel: q.slideLabel,
          },
          gradingConfig: {
            correctIndex: q.correctIndex,
            reviewTimestampLabel: q.reviewTimestampLabel,
            reviewJumpSec: q.reviewJumpSec,
            reviewSegmentRangeSec: q.reviewSegmentRangeSec,
          },
          explanationMd: q.explanation,
          itemEmbedding: makeDeterministicVector(100 + q.number),
        }))
      )
      .returning();

    // Seed items for Quiz Buổi 5 (DRAFT) & Final Exam K01
    await db.insert(assessmentItems).values(
      session4Questions.map((q) => ({
        assessmentId: quizSess5.id,
        skillId: skillByCode.get(q.skillCode)!.id,
        itemOrder: q.number,
        itemType: 'SINGLE_CHOICE' as const,
        points: '1.00',
        promptConfig: {
          number: q.number,
          scenarioTag: q.scenarioTag,
          prompt: q.prompt,
          options: q.options,
          skillCode: q.skillCode,
          skillName: q.skillName,
          slideLabel: q.slideLabel,
        },
        gradingConfig: {
          correctIndex: q.correctIndex,
          reviewTimestampLabel: q.reviewTimestampLabel,
          reviewJumpSec: q.reviewJumpSec,
          reviewSegmentRangeSec: q.reviewSegmentRangeSec,
        },
        explanationMd: q.explanation,
        itemEmbedding: makeDeterministicVector(200 + q.number),
      }))
    );

    await db.insert(assessmentItems).values(
      session4Questions.map((q) => ({
        assessmentId: finalExamK01.id,
        skillId: skillByCode.get(q.skillCode)!.id,
        itemOrder: q.number,
        itemType: 'SINGLE_CHOICE' as const,
        points: '1.00',
        promptConfig: {
          number: q.number,
          scenarioTag: q.scenarioTag,
          prompt: q.prompt,
          options: q.options,
          skillCode: q.skillCode,
          skillName: q.skillName,
          slideLabel: q.slideLabel,
        },
        gradingConfig: {
          correctIndex: q.correctIndex,
          reviewTimestampLabel: q.reviewTimestampLabel,
          reviewJumpSec: q.reviewJumpSec,
          reviewSegmentRangeSec: q.reviewSegmentRangeSec,
        },
        explanationMd: q.explanation,
        itemEmbedding: makeDeterministicVector(300 + q.number),
      }))
    );

    // Seed assessment_attempts, submission_answers & proctoring_events
    const insertedAttempts = await db
      .insert(assessmentAttempts)
      .values([
        {
          assessmentId: finalExamK01.id,
          accountId: stuAnAcc.id,
          attemptNumber: 1,
          startedAt: new Date('2026-11-08T08:30:00Z'),
          submittedAt: new Date('2026-11-08T09:10:00Z'),
          gradingCompletedAt: new Date('2026-11-08T09:10:01Z'),
          totalScore: '9.40',
          maxPossibleScore: '10.00',
          scorePct: '94.00',
          isPassed: true,
          remedialRecommendations: [],
          totalRiskScore: '0.00',
          integrityStatus: 'CLEAN',
        },
        {
          assessmentId: finalExamK01.id,
          accountId: stuQuanAcc.id,
          attemptNumber: 1,
          startedAt: new Date('2026-11-09T08:30:00Z'),
          submittedAt: new Date('2026-11-09T09:05:00Z'),
          gradingCompletedAt: new Date('2026-11-09T09:05:01Z'),
          totalScore: '7.20',
          maxPossibleScore: '10.00',
          scorePct: '72.00',
          isPassed: true,
          remedialRecommendations: [],
          totalRiskScore: '65.00',
          integrityStatus: 'FLAGGED',
          verdictNote: 'Phát hiện 2 khuôn mặt trong khung hình ở phút 14 và chuyển tab trình duyệt 3 lần.',
        },
      ])
      .returning();
    const attemptAnFinal = insertedAttempts[0]!;
    const attemptQuanFlagged = insertedAttempts[1]!;

    // Seed submission_answers for attemptAnFinal
    await db.insert(submissionAnswers).values(
      insertedQuiz4Items.slice(0, 5).map((item, idx) => ({
        attemptId: attemptAnFinal.id,
        itemId: item.id,
        responseData: { selectedIndex: 0, itemOrder: idx + 1 },
        gradingStatus: 'AUTO_GRADED' as const,
        autoScore: '1.00',
        finalScore: '1.00',
        isCorrect: true,
        gradedAt: new Date('2026-11-08T09:10:01Z'),
      }))
    );

    // Seed proctoring_events for attemptQuanFlagged
    await db.insert(proctoringEvents).values([
      {
        attemptId: attemptQuanFlagged.id,
        videoOffsetSec: 840,
        tier: 'EDGE',
        eventType: 'MULTI_FACE',
        confidence: 0.94,
        riskDelta: '40.00',
        snapshotR2Key: 'proctoring/attempt-2/multi-face-840s.jpg',
        details: { facesDetected: 2, note: 'Phát hiện người thứ 2 nhìn vào màn hình thi' },
      },
      {
        attemptId: attemptQuanFlagged.id,
        videoOffsetSec: 1120,
        tier: 'EDGE',
        eventType: 'TAB_HIDDEN',
        confidence: 1.0,
        riskDelta: '25.00',
        details: { hiddenDurationSec: 14, note: 'Thí sinh rời khỏi tab bài thi 14 giây' },
      },
    ]);

    // =========================================================================
    // 7. DOMAIN 6 — HYBRID RAG CHUNKS, SKILL STATES, AI CHAT & MOCK INTERVIEWS
    // =========================================================================
    await db.insert(knowledgeChunks).values([
      {
        visibility: 'PUBLIC',
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        sourceType: 'FAQ',
        chunkIndex: 1,
        content:
          'Khóa Kỹ Sư AI Thực Chiến (AI-ENG-2026-K01) do TS. Trần Minh Khoa giảng dạy vào tối Thứ 3 & Thứ 7 (19:30 - 21:30), học phí 8.500.000đ. Học viên tự tay xây dựng hệ thống Hybrid RAG với Python, FastAPI và PostgreSQL pgvector.',
        contentHash: 'hash_public_faq_ai_k01_00000000000000000000000000000000000000001',
        embedding: makeDeterministicVector(501),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        sessionId: sess4.id,
        attachmentId: insertedAttachments[2]!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 1,
        content:
          'Để giữ nguyên ý nghĩa khi đọc báo cáo PDF dài hàng trăm trang, mình nhận diện các dòng tiêu đề mục lớn và đóng gói toàn bộ bảng số liệu thành một khối Markdown nguyên vẹn kèm theo số trang gốc.',
        contentHash: 'hash_sess04_chunk_01_0000000000000000000000000000000000000000001',
        startSec: 10,
        endSec: 25,
        pageNumber: 8,
        embedding: makeDeterministicVector(502),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        sessionId: sess4.id,
        attachmentId: insertedAttachments[2]!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 2,
        content:
          'Tại sao chỗ này phải kết hợp cả tìm kiếm từ khóa lẫn tìm kiếm theo ý nghĩa câu hỏi? Vì tìm kiếm từ khóa bắt trúng mã hợp đồng, còn tìm kiếm ngữ nghĩa hiểu câu hỏi tự nhiên của nhân viên.',
        contentHash: 'hash_sess04_chunk_02_0000000000000000000000000000000000000000002',
        startSec: 25,
        endSec: 40,
        pageNumber: 12,
        embedding: makeDeterministicVector(503),
      },
      {
        visibility: 'ENROLLED_ONLY',
        courseId: courseAiRag.id,
        cohortId: cohortAiK01.id,
        sessionId: sess4.id,
        attachmentId: insertedAttachments[2]!.id,
        sourceType: 'VIDEO_TRANSCRIPT',
        chunkIndex: 3,
        content:
          'Lưu ý rất quan trọng về xử lý bất đồng bộ: Chúng ta dùng Promise.all hoặc asyncio.gather để chạy song song hai bộ tìm kiếm, giúp tốc độ phản hồi luôn dưới 1 giây.',
        contentHash: 'hash_sess04_chunk_03_0000000000000000000000000000000000000000003',
        startSec: 45,
        endSec: 65,
        pageNumber: 18,
        embedding: makeDeterministicVector(504),
      },
    ]);

    // Seed 9 student_skill_states for Nguyễn Văn An matching INITIAL_STUDENT_SKILL_STATES
    // Note: mastery_score in DB is between 0.0 and 1.0 (e.g. 0.94 -> 94/100 on UI)
    await db.insert(studentSkillStates).values([
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('PYTHON-CORE')!.id,
        masteryScore: 0.94,
        evidenceCount: 6,
        trend: 0.08,
        updatedAt: new Date('2026-11-08T10:00:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('PANDAS-ANALYTICS')!.id,
        masteryScore: 0.88,
        evidenceCount: 5,
        trend: 0.06,
        updatedAt: new Date('2026-11-08T10:00:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('FASTAPI-ASYNC')!.id,
        masteryScore: 0.91,
        evidenceCount: 4,
        trend: 0.09,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('POSTGRES-SQL')!.id,
        masteryScore: 0.92,
        evidenceCount: 4,
        trend: 0.07,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('HYBRID-RAG')!.id,
        masteryScore: 0.86,
        evidenceCount: 4,
        trend: 0.12,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('AI-AGENTS')!.id,
        masteryScore: 0.82,
        evidenceCount: 3,
        trend: 0.05,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('FINE-TUNING')!.id,
        masteryScore: 0.76,
        evidenceCount: 3,
        trend: 0.04,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('REDIS-CACHE')!.id,
        masteryScore: 0.85,
        evidenceCount: 4,
        trend: 0.06,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
      {
        accountId: stuAnAcc.id,
        skillId: skillByCode.get('DOCKER-DEPLOY')!.id,
        masteryScore: 0.84,
        evidenceCount: 4,
        trend: 0.05,
        updatedAt: new Date('2026-11-09T14:30:00Z'),
      },
    ]);

    // Seed chat_sessions & chat_messages matching INITIAL_CHAT_MESSAGES (with detectedTopic)
    const insertedChatSessions = await db
      .insert(chatSessions)
      .values([
        {
          accountId: stuAnAcc.id,
          scope: 'SESSION_TUTOR',
          cohortId: cohortAiK01.id,
          sessionId: sess4.id,
          title: 'Hỏi đáp Trợ giảng AI Buổi 4 — Bóc tách PDF & Hybrid RAG',
        },
        {
          accountId: stuMaiAcc.id,
          scope: 'SESSION_TUTOR',
          cohortId: cohortAiK01.id,
          sessionId: sess5.id,
          title: 'Hỏi đáp Trợ giảng AI Buổi 5 — Công thức RRF & Semantic Cache',
        },
        {
          accountId: stuHaAcc.id,
          scope: 'SESSION_TUTOR',
          cohortId: cohortAiK01.id,
          sessionId: sess3.id,
          title: 'Hỏi đáp Trợ giảng AI Buổi 3 — Chỉ mục HNSW pgvector',
        },
        {
          accountId: stuQuanAcc.id,
          scope: 'SESSION_TUTOR',
          cohortId: cohortAiK01.id,
          sessionId: sess4.id,
          title: 'Hỏi đáp Trợ giảng AI Buổi 4 — Middleware FastAPI',
        },
        {
          accountId: stuKhanhAcc.id,
          scope: 'SESSION_TUTOR',
          cohortId: cohortAiK01.id,
          sessionId: sess6.id,
          title: 'Hỏi đáp Trợ giảng AI Buổi 6 — Multi-stage Dockerfile',
        },
      ])
      .returning();

    const chatSessAn = insertedChatSessions[0]!;
    const chatSessMai = insertedChatSessions[1]!;
    const chatSessHa = insertedChatSessions[2]!;
    const chatSessQuan = insertedChatSessions[3]!;
    const chatSessKhanh = insertedChatSessions[4]!;

    await db.insert(chatMessages).values([
      {
        chatSessionId: chatSessAn.id,
        role: 'user',
        content: 'Làm sao giữ nguyên tiêu đề cột khi chia đoạn bảng biểu PDF dài 100 trang trong hệ thống RAG?',
        detectedTopic: 'RAG & Vector Search',
        promptTokens: 320,
        completionTokens: 300,
        latencyMs: 480,
        createdAt: new Date('2026-11-09T20:12:00Z'),
      },
      {
        chatSessionId: chatSessAn.id,
        role: 'assistant',
        content:
          'Thầy Trần Minh Khoa đã minh họa trực tiếp cách tách bảng biểu an toàn ở giây [00:10], cách kết hợp tìm kiếm từ khóa & ngữ nghĩa ở [00:25] và xử lý bất đồng bộ ở [00:45]. Bạn bấm vào mốc thời gian để xem lại nhé!',
        citations: [
          { label: '[00:10]', jumpSec: 10, slideLabel: 'Slide Trang 8' },
          { label: '[00:25]', jumpSec: 25, slideLabel: 'Slide Trang 12' },
          { label: '[00:45]', jumpSec: 45, slideLabel: 'Slide Trang 18' },
        ],
        llmProvider: 'gemini',
        llmModel: 'gemini-2.5-flash',
        promptTokens: 320,
        completionTokens: 300,
        latencyMs: 480,
        createdAt: new Date('2026-11-09T20:12:01Z'),
      },
      {
        chatSessionId: chatSessMai.id,
        role: 'user',
        content: 'Cách kết hợp điểm BM25 và khoảng cách Cosine bằng công thức RRF trong truy vấn?',
        detectedTopic: 'RAG & Vector Search',
        promptTokens: 380,
        completionTokens: 360,
        latencyMs: 510,
        createdAt: new Date('2026-11-10T10:15:00Z'),
      },
      {
        chatSessionId: chatSessHa.id,
        role: 'user',
        content: 'Cách tạo chỉ mục HNSW trên pgvector và lọc phân quyền phòng ban ngay trong câu lệnh SQL?',
        detectedTopic: 'PostgreSQL & SQL',
        promptTokens: 340,
        completionTokens: 340,
        latencyMs: 495,
        createdAt: new Date('2026-11-10T11:30:00Z'),
      },
      {
        chatSessionId: chatSessQuan.id,
        role: 'user',
        content: 'Middleware kiểm tra JWT và giới hạn dung lượng upload file PDF trong FastAPI cấu hình thế nào?',
        detectedTopic: 'FastAPI',
        promptTokens: 290,
        completionTokens: 300,
        latencyMs: 530,
        createdAt: new Date('2026-11-10T14:05:00Z'),
      },
      {
        chatSessionId: chatSessAn.id,
        role: 'user',
        content: 'Khi dùng asyncio.gather trong Python để gọi song song 2 nhánh tìm kiếm thì xử lý timeout ra sao?',
        detectedTopic: 'Python',
        promptTokens: 250,
        completionTokens: 260,
        latencyMs: 460,
        createdAt: new Date('2026-11-10T15:20:00Z'),
      },
      {
        chatSessionId: chatSessMai.id,
        role: 'user',
        content: 'Chiến lược lưu Semantic Cache trên Redis để giảm chi phí gọi LLM cho các câu hỏi trùng lặp?',
        detectedTopic: 'Redis',
        promptTokens: 320,
        completionTokens: 320,
        latencyMs: 505,
        createdAt: new Date('2026-11-10T16:10:00Z'),
      },
      {
        chatSessionId: chatSessKhanh.id,
        role: 'user',
        content: 'Cách viết multi-stage Dockerfile nhẹ nhất cho dịch vụ AI Python + FastAPI?',
        detectedTopic: 'Docker',
        promptTokens: 280,
        completionTokens: 300,
        latencyMs: 520,
        createdAt: new Date('2026-11-10T17:00:00Z'),
      },
    ]);

    // Seed mock_interviews matching INITIAL_MOCK_INTERVIEWS
    await db.insert(mockInterviews).values([
      {
        accountId: stuAnAcc.id,
        targetLevel: 'FRESHER',
        targetRole: 'Kỹ Sư AI & Hệ Thống Tìm Kiếm Tri Thức (AI Engineer)',
        jdRawText:
          'Vị trí: AI Engineer (RAG & LLM). Yêu cầu: Nắm vững Python, FastAPI, PostgreSQL (pgvector); có kinh nghiệm xử lý tài liệu PDF/Word giữ nguyên bảng biểu, thiết kế Hybrid Search (BM25 + Vector), kiểm soát trích dẫn nguồn và phân quyền truy cập tài liệu theo phòng ban.',
        cvScreeningResult: {
          matchPercent: 78,
          passedGate: true,
          layoutAndPresentationFeedback:
            'Bố cục CV 1 trang A4 rõ ràng, phân tách mạch lạc giữa Mục tiêu nghề nghiệp, Dự án thực chiến và Kỹ năng công nghệ. Các gạch đầu dòng trong dự án đã sử dụng động từ hành động kèm con số định lượng (< 800ms, 100+ trang PDF).',
          jdMatchEvaluation:
            'Hồ sơ CV khớp 78% với yêu cầu tuyển dụng AI Engineer: Đã thể hiện rõ kinh nghiệm thực chiến với Python, FastAPI, PostgreSQL (pgvector) và xây dựng luồng Hybrid Search bảo toàn bảng biểu PDF.',
          missingKeywordsOrGaps: [
            'Nên bổ sung rõ hơn cách thiết lập bộ lọc phân quyền phòng ban ở tầng truy vấn SQL.',
            'Nhấn mạnh thêm chỉ số đánh giá độ chính xác trích dẫn nguồn trong dự án đầu tiên.',
          ],
        },
        transcriptLog: [
          {
            speaker: 'SENIOR_AI',
            speakerLabel: 'TS. Trần Minh Khoa (Chuyên gia Phỏng vấn AI)',
            stageTag: 'Câu 1/3 · Xác thực dự án trong CV',
            text: 'Chào An! Trong CV anh thấy em có làm dự án Hệ thống Trợ lý AI Tra cứu Tài liệu Nội bộ. Em hãy chia sẻ cách em xử lý các bảng số liệu dài trong file PDF để không bị mất dòng tiêu đề cột khi chia đoạn nhé?',
          },
          {
            speaker: 'STUDENT',
            speakerLabel: 'Nguyễn Văn An (Trả lời bằng giọng nói)',
            text: 'Dạ em dùng bộ đọc cấu trúc tài liệu để nhận diện từng bảng biểu, chuyển sang dạng Markdown và tự động gắn lại dòng tiêu đề cột kèm số trang gốc vào đầu mỗi đoạn cắt nhỏ ạ.',
          },
        ],
        evaluationReport: {
          overallScore: 89,
          projectDepthScore: 92,
          communicationScore: 88,
          strengths: [
            'Hiểu sâu bản chất kỹ thuật của dự án đã ghi trong CV, giải thích rõ cách bảo toàn bảng biểu PDF.',
            'Trình bày mạch lạc, đi thẳng vào giải pháp thực tế và nêu được con số đo lường cụ thể.',
          ],
          improvements: [
            'Khi trả lời về tối ưu tốc độ phản hồi, nên nói rõ hơn cách kết hợp chạy song song hai nhánh tìm kiếm.',
          ],
        },
        status: 'COMPLETED',
        createdAt: new Date('2026-11-09T19:00:00Z'),
        completedAt: new Date('2026-11-09T19:25:00Z'),
      },
    ]);

    logger.info(
      'Database seeding completed! Seeded: 11 accounts (Admin, 2 Instructors, 8 Students), 4 courses, 5 cohorts, 6 class sessions, 4 SePay transactions, 9 enrollments, 3 assessments (30 MCQ items), 4 RAG chunks, 9 skill states, 5 notifications, 8 chat messages, and 1 mock interview.'
    );
  } catch (error) {
    logger.error({ error }, 'Error while seeding database');
    throw error;
  } finally {
    await pool.end();
  }
}

seed();
