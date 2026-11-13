
# 02. Thiết Kế Cơ Sở Dữ Liệu PostgreSQL 16 + pgvector (32 Bảng Chuẩn Hóa)

File SQL DDL gốc: `apps/api/src/db/migrations/0000_baseline.sql`
Định nghĩa Drizzle ORM: `apps/api/src/db/schema/`

---

## 1. Tổng Quan 6 Miền Nghiệp Vụ (32 Bảng Liên Kết Nhất Quán)

Sau khi tinh gọn bảng lịch rảnh giảng viên (`instructor_availabilities`), lược bỏ bảng trợ giảng trung gian (`cohort_instructors` — mặc định 1 Giảng viên phụ trách 1 Cohort) và bổ sung bảng phục vụ Phòng Luyện Phỏng Vấn Giọng Nói 2 Vòng (`mock_interviews`), hệ thống gồm đúng **32 bảng** chia làm 6 miền nghiệp vụ:

- **Miền 1 — Định danh, Google OAuth, Hồ sơ CV & Giảng viên (4 bảng):**
  `accounts`, `account_identities`, `user_profiles`, `instructor_profiles`
  *(File Drizzle: `src/db/schema/identity.ts`)*

- **Miền 2 — Từ điển Kỹ năng, Khóa học, Đợt khai giảng & Buổi học (8 bảng):**
  `categories`, `skills`, `courses`, `course_skills`, `cohorts`, `class_sessions`, `session_attachments`, `session_subtitles`
  *(File Drizzle: `src/db/schema/catalog.ts`, `src/db/schema/cohort.ts`)*

- **Miền 3 — Đơn hàng, Thanh toán VietQR SePay, Ghi danh, Tiến độ & Chứng chỉ (6 bảng):**
  `orders`, `payment_transactions`, `enrollments`, `session_progress`, `course_reviews`, `certificates`
  *(File Drizzle: `src/db/schema/commerce.ts`)*

- **Miền 4 — Thảo luận theo mốc thời gian video & Thông báo (3 bảng):**
  `discussion_threads`, `discussion_posts`, `notifications`
  *(File Drizzle: `src/db/schema/discussion.ts`)*

- **Miền 5 — Bài kiểm tra Trắc nghiệm A-B-C-D, Kết quả làm bài & Giám sát Thi Camera AI (5 bảng):**
  `assessments`, `assessment_items`, `assessment_attempts`, `submission_answers`, `proctoring_events`
  *(File Drizzle: `src/db/schema/assessment.ts`)*

- **Miền 6 — Kho Vector Hybrid RAG, Điểm Kỹ năng Học viện, Chat AI, Phỏng vấn AI & Cấu hình (6 bảng):**
  `knowledge_chunks`, `student_skill_states`, `chat_sessions`, `chat_messages`, `mock_interviews`, `system_settings`
  *(File Drizzle: `src/db/schema/ai_rag.ts`, `src/db/schema/system.ts`)*

---

## 2. Chi Tiết Cấu Trúc Từng Bảng Theo 6 Miền Nghiệp Vụ

### MIỀN 1: ĐỊNH DANH, GOOGLE OAUTH, HỒ SƠ CV & GIẢNG VIÊN (4 BẢNG)

#### Bảng 1: `accounts` (Tài khoản đăng nhập)
- `id` (BIGSERIAL PRIMARY KEY): Mã định danh tài khoản.
- `email` (CITEXT NOT NULL UNIQUE): Email đăng nhập (không phân biệt chữ hoa/thường).
- `password_hash` (TEXT): Mật khẩu đã băm bằng Argon2id (có thể NULL nếu đăng nhập hoàn toàn qua Google).
- `role` (account_role NOT NULL DEFAULT 'STUDENT'): Vai trò hệ thống (`STUDENT`, `INSTRUCTOR`, `ADMIN`).
- `status` (account_status NOT NULL DEFAULT 'ACTIVE'): Trạng thái tài khoản (`ACTIVE`, `LOCKED`).
- `email_verified_at` (TIMESTAMPTZ): Thời điểm xác thực email.
- `last_login_at` (TIMESTAMPTZ): Thời điểm đăng nhập gần nhất.
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 2: `account_identities` (Liên kết đăng nhập Google OAuth)
- `id` (BIGSERIAL PRIMARY KEY).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `provider` (auth_provider NOT NULL): `'LOCAL'` hoặc `'GOOGLE'`.
- `provider_uid` (VARCHAR(255) NOT NULL): Mã định danh người dùng từ Google.
- `provider_email` (CITEXT): Email phía Google.
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Ràng buộc duy nhất: `UNIQUE (provider, provider_uid)`.

#### Bảng 3: `user_profiles` (Hồ sơ cá nhân, Dữ liệu CV trích xuất & Số lượt Phỏng vấn)
- `account_id` (BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE).
- `full_name` (VARCHAR(150) NOT NULL): Họ và tên hiển thị.
- `avatar_url` (TEXT): Ảnh đại diện.
- `bio` (TEXT): Giới thiệu ngắn.
- `career_goal` (TEXT): Mục tiêu nghề nghiệp do học viên nhập bằng văn bản.
- `goal_embedding` (vector(1024)): Vector biểu diễn mục tiêu nghề nghiệp để gợi ý khóa học.
- `face_reference_r2_key` (TEXT): Đường dẫn ảnh khuôn mặt gốc chụp lúc khởi tạo hồ sơ.
- `face_embedding` (vector(512)): Vector khuôn mặt ArcFace 512 chiều dùng để đối khớp khi thi cuối khóa.
- `cv_parsed_data` (JSONB NOT NULL DEFAULT '{}'): Dữ liệu trích xuất từ bản CV hiện tại của học viên (bao gồm Thông tin liên hệ, Học vấn, Kinh nghiệm, các Dự án đã làm và mảng `external_skills` lưu các kỹ năng ngoài chương trình của Học viện như `Golang`, `C++`...).
- `interview_credits` (INT NOT NULL DEFAULT 0 CHECK (interview_credits >= 0)): Số lượt luyện phỏng vấn giọng nói hiện có (tăng thêm `+4` khi học viên hoàn thành khóa học và vượt qua kỳ thi cuối khóa).
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 4: `instructor_profiles` (Hồ sơ chuyên môn của Giảng viên / Trợ giảng)
- `account_id` (BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE).
- `headline` (VARCHAR(200) NOT NULL): Chức danh chuyên môn (ví dụ: *Senior AI Tech Lead*).
- `organization` (VARCHAR(150)): Đơn vị công tác hiện tại.
- `years_of_experience` (SMALLINT CHECK (years_of_experience >= 0)): Số năm kinh nghiệm.
- `expertise_summary_md` (TEXT): Tiểu sử và thế mạnh chuyên môn.
- `social_links` (JSONB NOT NULL DEFAULT '{}'): Liên kết LinkedIn, GitHub, Website.
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

---

### MIỀN 2: TỪ ĐIỂN KỸ NĂNG, KHÓA HỌC, ĐỢT KHAI GIẢNG & BUỔI HỌC (8 BẢNG)

#### Bảng 5: `categories` (Danh mục lĩnh vực đào tạo)
- `id` (SERIAL PRIMARY KEY).
- `name` (VARCHAR(120) NOT NULL).
- `slug` (VARCHAR(140) NOT NULL UNIQUE).
- `description` (TEXT).
- `parent_id` (INT REFERENCES categories(id) ON DELETE SET NULL).
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 6: `skills` (Từ điển Kỹ năng chuẩn do Học viện đào tạo)
- `id` (SERIAL PRIMARY KEY).
- `category_id` (INT REFERENCES categories(id) ON DELETE SET NULL).
- `code` (VARCHAR(80) NOT NULL UNIQUE): Mã kỹ năng chuẩn (ví dụ: `'python'`, `'pandas'`, `'rag-vector'`, `'ai-agents'`, `'fine-tuning'`, `'fastapi'`, `'sql-postgres'`, `'redis'`, `'docker'`, `'reactjs'`, `'aws-cloud'`).
- `name` (VARCHAR(150) NOT NULL): Tên kỹ năng hiển thị.
- `description` (TEXT): Mô tả phạm vi kiến thức của kỹ năng.
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 7: `courses` (Khóa học gốc của Học viện)
- `id` (BIGSERIAL PRIMARY KEY).
- `category_id` (INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT).
- `title` (VARCHAR(255) NOT NULL): Tên khóa học.
- `slug` (VARCHAR(280) NOT NULL UNIQUE): Đường dẫn URL.
- `short_description` (VARCHAR(500) NOT NULL).
- `description_md` (TEXT NOT NULL).
- `thumbnail_url` (TEXT).
- `difficulty_level` (SMALLINT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 5)).
- `syllabus_template` (JSONB NOT NULL DEFAULT '[]'): Khung chương trình mẫu gồm danh sách các buổi học chuẩn.
- `status` (course_status NOT NULL DEFAULT 'DRAFT'): `'DRAFT'`, `'PUBLISHED'`, `'ARCHIVED'`.
- `embedding` (vector(1024)): Vector ngữ nghĩa của khóa học (có chỉ mục HNSW `idx_courses_embedding_hnsw`).
- `search_tsv` (tsvector GENERATED ALWAYS): Cột tìm kiếm toàn văn tự động từ tiêu đề và mô tả (có chỉ mục GIN `idx_courses_search_tsv_gin`).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 8: `course_skills` (Ánh xạ Kỹ năng đầu vào & Kỹ năng đầu ra của Khóa học)
- `course_id` (BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE).
- `skill_id` (INT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT).
- `skill_role` (skill_relation_role NOT NULL): `'PREREQUISITE'` (Kỹ năng cần biết trước) hoặc `'LEARNING_OUTCOME'` (Kỹ năng đạt được sau khóa học).
- `target_weight` (REAL NOT NULL DEFAULT 1.0 CHECK (target_weight > 0)).
- Khóa chính: `PRIMARY KEY (course_id, skill_id, skill_role)`.

#### Bảng 9: `cohorts` (Đợt khai giảng / Lớp học cụ thể)
- `id` (BIGSERIAL PRIMARY KEY).
- `course_id` (BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT).
- `code` (VARCHAR(50) NOT NULL UNIQUE): Mã đợt mở lớp (ví dụ: `'AI-ENG-2026-K01'`).
- `name` (VARCHAR(255) NOT NULL): Tên đợt học.
- `instructor_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT): Giảng viên phụ trách chính của đợt học.
- `curriculum_version` (VARCHAR(30) NOT NULL DEFAULT 'v1.0'): Phiên bản đề cương áp dụng cho đợt này (giúp đợt mới năm 2026 cập nhật đề cương mới mà vẫn giữ nguyên đề cương của đợt cũ năm 2025).
- `tech_stack_notes` (TEXT): Ghi chú lịch học cố định hàng tuần và công nghệ sử dụng.
- `tuition_vnd` (BIGINT NOT NULL CHECK (tuition_vnd >= 0)): Học phí niêm yết bằng VND.
- `enrolled_count` (INT NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0)): Số học viên đã ghi danh.
- `enrollment_open_at` (TIMESTAMPTZ NOT NULL): Thời điểm bắt đầu mở cổng đăng ký.
- `start_date` (DATE NOT NULL), `end_date` (DATE NOT NULL CHECK (end_date >= start_date)).
- `schedule_slots` (JSONB NOT NULL DEFAULT `'[]'`): Mảng các ca học trong tuần theo cấu trúc `{ dayOfWeek: 0..6, startTime: 'HH:mm', endTime: 'HH:mm' }` (hỗ trợ linh hoạt từng buổi học có khung giờ khác nhau).
- `replay_expires_at` (TIMESTAMPTZ).
- `status` (cohort_status NOT NULL DEFAULT 'DRAFT'): `'DRAFT'`, `'OPENING'`, `'ONGOING'`, `'COMPLETED'`, `'ARCHIVED'`.
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 10: `class_sessions` (Buổi học bên trong một Đợt khai giảng)
*(Đã loại bỏ hoàn toàn các cột `is_free_preview`, `external_youtube_id`, `hls_manifest_r2_key`, `hls_aes_key_hex`).*
- `id` (BIGSERIAL PRIMARY KEY).
- `cohort_id` (BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE).
- `instructor_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT): Giảng viên chủ trì buổi học (mặc định gán từ `cohorts.instructor_id`, cho phép đổi nếu có buổi dạy thay).
- `session_order` (SMALLINT NOT NULL CHECK (session_order > 0)): Thứ tự buổi học trong lớp.
- `activity_tags` (TEXT[] NOT NULL DEFAULT '{}'): Nhãn hoạt động (`'THEORY'`, `'LIVE_CODING'`, `'WORKSHOP'`...).
- `title` (VARCHAR(255) NOT NULL): Tên buổi học (do Admin thiết lập theo đề cương).
- `description_md` (TEXT): Nội dung chi tiết buổi học.
- `scheduled_start` (TIMESTAMPTZ), `scheduled_end` (TIMESTAMPTZ): Thời gian bắt đầu và kết thúc.
- `status` (session_status NOT NULL DEFAULT 'SCHEDULED'): `'SCHEDULED'`, `'LIVE'`, `'PROCESSING_REPLAY'`, `'REPLAY_READY'`.
- `livekit_room_name` (VARCHAR(120) UNIQUE): Tên phòng học trực tuyến LiveKit.
- `video_provider` (video_source_provider): `'R2_HLS_AES128'` hoặc `'BUNNY_STREAM'`.
- `video_r2_key` (TEXT): Đường dẫn file video `.mp4` bản ghi buổi học trên Cloudflare R2.
- `duration_seconds` (INT CHECK (duration_seconds >= 0)): Thời lượng video (giây).
- `ai_summary_md` (TEXT): Bản tóm tắt trọng tâm buổi học.
- `last_updated_by` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Ràng buộc chống trùng thứ tự buổi: `UNIQUE (cohort_id, session_order)`.
- **Ràng buộc khóa cứng chống trùng giờ dạy của cùng một giảng viên (`EXCLUDE USING gist`):**
  `EXCLUDE USING gist (instructor_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&) WHERE (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL)`.

#### Bảng 11: `session_attachments` (Tài liệu Slide PDF / Bài tập đính kèm buổi học)
- `id` (BIGSERIAL PRIMARY KEY).
- `session_id` (BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE).
- `file_name` (VARCHAR(255) NOT NULL).
- `r2_object_key` (TEXT NOT NULL).
- `mime_type` (VARCHAR(100) NOT NULL).
- `file_size_bytes` (BIGINT NOT NULL CHECK (file_size_bytes > 0)).
- `uploaded_by` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL).
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 12: `session_subtitles` (Phụ đề đồng bộ thời gian `.vtt` của buổi học)
- `id` (BIGSERIAL PRIMARY KEY).
- `session_id` (BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE).
- `language_code` (VARCHAR(10) NOT NULL DEFAULT 'vi').
- `vtt_r2_key` (TEXT NOT NULL).
- `is_auto_generated` (BOOLEAN NOT NULL DEFAULT TRUE).
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Ràng buộc duy nhất: `UNIQUE (session_id, language_code)`.

---

### MIỀN 3: ĐƠN HÀNG, THANH TOÁN VIETQR SEPAY, GHI DANH, TIẾN ĐỘ & CHỨNG CHỈ (6 BẢNG)

#### Bảng 13: `orders` (Đơn đăng ký học phí trực tiếp theo Đợt học)
- `id` (BIGSERIAL PRIMARY KEY).
- `order_code` (VARCHAR(40) NOT NULL UNIQUE): Mã đơn hàng duy nhất (dùng làm nội dung chuyển khoản bắt buộc trên mã QR ngân hàng, ví dụ: `'ET20268891'`).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT).
- `cohort_id` (BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT).
- `amount_vnd` (BIGINT NOT NULL CHECK (amount_vnd >= 0)): Số tiền học phí cần chuyển khoản.
- `status` (order_status NOT NULL DEFAULT 'PENDING'): `'PENDING'`, `'PAID'`, `'FAILED'`, `'EXPIRED'`, `'CANCELED'`.
- `idempotency_key` (VARCHAR(100) UNIQUE): Khóa chống tạo trùng đơn hàng.
- `paid_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ NOT NULL), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 14: `payment_transactions` (Nhật ký giao dịch Webhook chuyển khoản ngân hàng SePay VietQR)
- `id` (BIGSERIAL PRIMARY KEY).
- `order_id` (BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT).
- `gateway` (VARCHAR(20) NOT NULL DEFAULT 'SEPAY_VIETQR'): Cổng thanh toán mặc định là `'SEPAY_VIETQR'`.
- `gateway_txn_id` (VARCHAR(100) NOT NULL UNIQUE): Mã giao dịch ngân hàng từ SePay để chống xử lý trùng lặp.
- `amount_vnd` (BIGINT NOT NULL): Số tiền thực nhận.
- `response_code` (VARCHAR(10) NOT NULL).
- `match_status` (VARCHAR(20) NOT NULL DEFAULT 'MATCHED' CHECK (match_status IN ('MATCHED', 'UNMATCHED_ORDER', 'AMOUNT_MISMATCH'))).
- `raw_payload` (JSONB NOT NULL): Toàn bộ dữ liệu JSON Webhook nhận được từ SePay để đối soát.
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 15: `enrollments` (Hồ sơ nhập học của học viên trong một Đợt khai giảng)
- `id` (BIGSERIAL PRIMARY KEY).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT).
- `cohort_id` (BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT).
- `order_id` (BIGINT REFERENCES orders(id) ON DELETE RESTRICT).
- `enrolled_by_admin` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL).
- `status` (enrollment_status NOT NULL DEFAULT 'ACTIVE'): `'ACTIVE'`, `'COMPLETED'`, `'REVOKED'`.
- `final_exam_passed` (BOOLEAN NOT NULL DEFAULT FALSE): Đánh dấu đã vượt qua kỳ thi trắc nghiệm cuối khóa.
- `dropout_risk_score` (REAL NOT NULL DEFAULT 0.0 CHECK (dropout_risk_score BETWEEN 0.0 AND 1.0)): Điểm đánh giá nguy cơ bỏ học / không hoàn thành khóa học.
- `risk_level` (VARCHAR(15) NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH'))): Mức cảnh báo nguy cơ bỏ học (`'LOW'`, `'MEDIUM'`, `'HIGH'`).
- `enrolled_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `completed_at` (TIMESTAMPTZ), `last_reminded_at` (TIMESTAMPTZ).
- Ràng buộc duy nhất: `UNIQUE (account_id, cohort_id)`.

#### Bảng 16: `session_progress` (Tiến độ hoàn thành từng buổi học của học viên)
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `session_id` (BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE).
- `last_position_sec` (INT NOT NULL DEFAULT 0 CHECK (last_position_sec >= 0)): Giây video đang xem dở để mở lại xem tiếp.
- `is_completed` (BOOLEAN NOT NULL DEFAULT FALSE): Chỉ chuyển thành `TRUE` khi học viên vượt qua bài kiểm tra trắc nghiệm ngắn (`SESSION_ASSIGNMENT`) của buổi học đó.
- `completed_at` (TIMESTAMPTZ), `last_activity_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Khóa chính: `PRIMARY KEY (account_id, session_id)`.

#### Bảng 17: `course_reviews` (Đánh giá khóa học từ học viên)
- `id` (BIGSERIAL PRIMARY KEY).
- `course_id` (BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE).
- `cohort_id` (BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `rating` (SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5)).
- `comment` (TEXT), `is_public` (BOOLEAN NOT NULL DEFAULT TRUE), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Ràng buộc duy nhất: `UNIQUE (cohort_id, account_id)`.

#### Bảng 18: `certificates` (Chứng chỉ tốt nghiệp số có chữ ký xác thực)
- `id` (BIGSERIAL PRIMARY KEY).
- `enrollment_id` (BIGINT NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT).
- `certificate_code` (VARCHAR(64) NOT NULL UNIQUE): Mã tra cứu chứng chỉ công khai.
- `hmac_signature` (VARCHAR(128) NOT NULL): Chữ ký số chống làm giả.
- `issued_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `revoked_at` (TIMESTAMPTZ), `revoke_reason` (TEXT).

---

### MIỀN 4: THẢO LUẬN THEO MỐC THỜI GIAN VIDEO & THÔNG BÁO (3 BẢNG)

#### Bảng 19: `discussion_threads` (Chủ đề câu hỏi của học viên gắn với giây video bài giảng)
- `id` (BIGSERIAL PRIMARY KEY).
- `session_id` (BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE).
- `author_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `title` (VARCHAR(255) NOT NULL).
- `video_timestamp_sec` (INT CHECK (video_timestamp_sec >= 0)): Giây trong video mà học viên đang thắc mắc.
- `is_resolved` (BOOLEAN NOT NULL DEFAULT FALSE).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 20: `discussion_posts` (Nội dung phản hồi trong chủ đề thảo luận)
- `id` (BIGSERIAL PRIMARY KEY).
- `thread_id` (BIGINT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE).
- `author_id` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL).
- `parent_post_id` (BIGINT REFERENCES discussion_posts(id) ON DELETE CASCADE).
- `content_md` (TEXT NOT NULL).
- `is_ai_generated` (BOOLEAN NOT NULL DEFAULT FALSE).
- `is_instructor_verified` (BOOLEAN NOT NULL DEFAULT FALSE): Đánh dấu câu trả lời đã được Giảng viên xác nhận đúng.
- `verified_by` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 21: `notifications` (Thông báo hệ thống cho người dùng)
- `id` (BIGSERIAL PRIMARY KEY).
- `recipient_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `type` (VARCHAR(40) NOT NULL), `title` (VARCHAR(200) NOT NULL), `body` (TEXT NOT NULL).
- `metadata` (JSONB NOT NULL DEFAULT '{}').
- `is_read` (BOOLEAN NOT NULL DEFAULT FALSE), `read_at` (TIMESTAMPTZ): Thời điểm học viên đọc thông báo, `acted_at` (TIMESTAMPTZ): Thời điểm học viên bấm vào thông báo nhắc nhở (`AI_STUDY_REMINDER`) và thực sự quay lại học bài, `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

---

### MIỀN 5: BÀI KIỂM TRA TRẮC NGHIỆM A-B-C-D, KẾT QUẢ LÀM BÀI & GIÁM SÁT THI CAMERA AI (5 BẢNG)

#### Bảng 22: `assessments` (Bài kiểm tra cuối buổi học & Đề thi tốt nghiệp cuối khóa)
- `id` (BIGSERIAL PRIMARY KEY).
- `cohort_id` (BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE).
- `session_id` (BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE): Gắn với buổi học cụ thể nếu `purpose = 'SESSION_ASSIGNMENT'` (`NULL` nếu là đề thi cuối khóa `FINAL_EXAM`).
- `purpose` (assessment_purpose NOT NULL): `'SESSION_ASSIGNMENT'` (Bài kiểm tra mở khóa buổi học) hoặc `'FINAL_EXAM'` (Bài thi tốt nghiệp cuối khóa).
- `grading_mode` (grading_mode NOT NULL DEFAULT 'AUTO'): Mặc định `'AUTO'` (chấm tự động tức thì 100%).
- `title` (VARCHAR(255) NOT NULL), `instructions_md` (TEXT).
- `duration_minutes` (SMALLINT CHECK (duration_minutes > 0)).
- `pass_score_pct` (SMALLINT NOT NULL DEFAULT 70 CHECK (pass_score_pct BETWEEN 0 AND 100)): Điểm chuẩn vượt qua bài kiểm tra (mặc định 70%).
- `max_attempts` (SMALLINT), `due_at` (TIMESTAMPTZ).
- `proctoring_config` (JSONB NOT NULL DEFAULT '{}'): Cấu hình giám sát Camera AI cho kỳ thi cuối khóa.
- `status` (assessment_status NOT NULL DEFAULT 'DRAFT'): `'DRAFT'` (Bản nháp do AI mới sinh) hoặc `'PUBLISHED'` (Đã được Giảng viên duyệt công bố).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 23: `assessment_items` (Danh sách câu hỏi trong bài kiểm tra — Chuẩn hóa Trắc nghiệm A, B, C, D)
- `id` (BIGSERIAL PRIMARY KEY).
- `assessment_id` (BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE).
- `skill_id` (INT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT): Kỹ năng được kiểm tra ở câu hỏi này (dùng để cập nhật điểm `student_skill_states`).
- `item_order` (SMALLINT NOT NULL): Thứ tự câu hỏi.
- `item_type` (assessment_item_type NOT NULL): Mặc định dùng `'SINGLE_CHOICE'` (Trắc nghiệm 4 lựa chọn A, B, C, D).
- `points` (NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (points > 0)).
- `prompt_config` (JSONB NOT NULL): Lưu nội dung câu hỏi và 4 phương án A, B, C, D hiển thị cho học viên.
- `grading_config` (JSONB NOT NULL): Lưu đáp án đúng (`{"correct_option_id": "B"}`). **Tuyệt đối không trả cột này về cho trình duyệt học viên khi đang làm bài.**
- `explanation_md` (TEXT): Giải thích chi tiết đáp án đúng.
- `item_embedding` (vector(1024)): Vector nội dung câu hỏi dùng để tìm ngay đoạn phút:giây video bài giảng cần ôn lại khi học viên chọn sai.
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Ràng buộc duy nhất: `UNIQUE (assessment_id, item_order)`.

#### Bảng 24: `assessment_attempts` (Lượt làm bài kiểm tra / bài thi của học viên)
- `id` (BIGSERIAL PRIMARY KEY).
- `assessment_id` (BIGINT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `attempt_number` (SMALLINT NOT NULL DEFAULT 1).
- `started_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `expires_at` (TIMESTAMPTZ), `submitted_at` (TIMESTAMPTZ), `grading_completed_at` (TIMESTAMPTZ).
- `total_score` (NUMERIC(6,2)), `max_possible_score` (NUMERIC(6,2)), `score_pct` (NUMERIC(5,2)).
- `is_passed` (BOOLEAN): Kết quả Đạt hay Chưa đạt ngay sau khi bấm nộp bài.
- `remedial_recommendations` (JSONB): Danh sách các đoạn video bài giảng (`session_id`, `start_sec`, `end_sec`) tương ứng với những câu làm sai để học viên bấm xem lại ngay.
- `total_risk_score` (NUMERIC(6,2) NOT NULL DEFAULT 0): Điểm cảnh báo từ Camera giám sát (dành cho `FINAL_EXAM`).
- `integrity_status` (integrity_verdict NOT NULL DEFAULT 'CLEAN'): `'CLEAN'`, `'FLAGGED'`, `'CONFIRMED_CHEAT'`, `'CLEARED_BY_INSTRUCTOR'`.
- `verdict_note` (TEXT), `verdict_by` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL), `verdict_at` (TIMESTAMPTZ).

#### Bảng 25: `submission_answers` (Câu trả lời của học viên cho từng câu hỏi)
- `id` (BIGSERIAL PRIMARY KEY).
- `attempt_id` (BIGINT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE).
- `item_id` (BIGINT NOT NULL REFERENCES assessment_items(id) ON DELETE RESTRICT).
- `response_data` (JSONB NOT NULL DEFAULT '{}'): Lưu phương án học viên đã chọn (ví dụ: `{"selected_option_id": "A"}`).
- `grading_status` (answer_grading_status NOT NULL DEFAULT 'AUTO_GRADED').
- `auto_score` (NUMERIC(5,2)), `manual_score` (NUMERIC(5,2)), `final_score` (NUMERIC(5,2)).
- `is_correct` (BOOLEAN): Đúng (`TRUE`) hay Sai (`FALSE`).
- `feedback_md` (TEXT), `ai_suggestion` (JSONB).
- `graded_by` (BIGINT REFERENCES accounts(id) ON DELETE SET NULL), `graded_at` (TIMESTAMPTZ).
- Ràng buộc duy nhất: `UNIQUE (attempt_id, item_id)`.

#### Bảng 26: `proctoring_events` (Nhật ký sự kiện cảnh báo từ Camera AI trong kỳ thi cuối khóa)
- `id` (BIGSERIAL PRIMARY KEY).
- `attempt_id` (BIGINT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE).
- `occurred_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `video_offset_sec` (INT).
- `tier` (VARCHAR(10) NOT NULL CHECK (tier IN ('EDGE', 'SERVER'))).
- `event_type` (VARCHAR(40) NOT NULL): Loại cảnh báo (`'NO_FACE'`, `'MULTI_FACE'`, `'TAB_HIDDEN'`, `'PHONE_DETECTED'`...).
- `confidence` (REAL CHECK (confidence BETWEEN 0 AND 1)).
- `risk_delta` (NUMERIC(5,2) NOT NULL DEFAULT 0).
- `snapshot_r2_key` (TEXT): Ảnh chụp khoảnh khắc cảnh báo để Giảng viên xem lại.
- `details` (JSONB NOT NULL DEFAULT '{}').

---

### MIỀN 6: KHO VECTOR HYBRID RAG, ĐIỂM KỸ NĂNG HỌC VIỆN, CHAT AI, PHỎNG VẤN AI & CẤU HÌNH (6 BẢNG)

#### Bảng 27: `knowledge_chunks` (Kho tri thức Hybrid RAG lưu lời giảng từng giây video & trang tài liệu PDF)
- `id` (BIGSERIAL PRIMARY KEY).
- `visibility` (chunk_visibility NOT NULL DEFAULT 'ENROLLED_ONLY'): `'PUBLIC'` (dùng cho tư vấn ngoài trang chủ) hoặc `'ENROLLED_ONLY'` (cô lập theo từng lớp học).
- `course_id` (BIGINT REFERENCES courses(id) ON DELETE CASCADE).
- `cohort_id` (BIGINT REFERENCES cohorts(id) ON DELETE CASCADE).
- `session_id` (BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE).
- `attachment_id` (BIGINT REFERENCES session_attachments(id) ON DELETE CASCADE).
- `source_type` (VARCHAR(30) NOT NULL): `'VIDEO_TRANSCRIPT'`, `'ATTACHMENT_DOC'`, `'FAQ'`.
- `chunk_index` (INT NOT NULL): Thứ tự đoạn văn bản.
- `content` (TEXT NOT NULL), `content_hash` (CHAR(64) NOT NULL).
- `start_sec` (INT), `end_sec` (INT): Giây bắt đầu và giây kết thúc trong video bài giảng.
- `page_number` (INT): Số trang trong tài liệu Slide PDF.
- `embedding` (vector(1024) NOT NULL): Vector 1024 chiều (có chỉ mục HNSW `idx_chunks_embedding_hnsw`).
- `search_tsv` (tsvector GENERATED ALWAYS): Cột tìm kiếm từ khóa chính xác (có chỉ mục GIN `idx_chunks_search_tsv_gin`).
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 28: `student_skill_states` (Điểm nắm bắt kỹ năng theo tiêu chuẩn nội bộ của Học viện)
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `skill_id` (INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE): Chỉ tính cho các kỹ năng chuẩn có đào tạo tại Học viện.
- `mastery_score` (REAL NOT NULL DEFAULT 0.0 CHECK (mastery_score BETWEEN 0.0 AND 1.0)): Điểm tham khảo (từ `0.0` đến `1.0`, hiển thị `0–100`) tính từ tỷ lệ trả lời đúng các câu hỏi trắc nghiệm thuộc kỹ năng này.
- `evidence_count` (INT NOT NULL DEFAULT 0): Tổng số câu hỏi kiểm tra của kỹ năng này mà học viên đã thực hiện.
- `trend` (REAL NOT NULL DEFAULT 0.0): Độ thay đổi điểm số sau bài kiểm tra gần nhất.
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- Khóa chính: `PRIMARY KEY (account_id, skill_id)`.

#### Bảng 29: `chat_sessions` (Phiên trò chuyện với Trợ lý Tư vấn hoặc Trợ giảng AI buổi học)
- `id` (BIGSERIAL PRIMARY KEY).
- `public_id` (UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `scope` (VARCHAR(20) NOT NULL CHECK (scope IN ('ADVISOR_GLOBAL', 'SESSION_TUTOR', 'LIVE_COPILOT'))).
- `cohort_id` (BIGINT REFERENCES cohorts(id) ON DELETE CASCADE).
- `session_id` (BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE).
- `title` (VARCHAR(255)), `context_summary` (TEXT).
- `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 30: `chat_messages` (Tin nhắn trong phiên trò chuyện AI kèm trích dẫn mốc giây video)
- `id` (BIGSERIAL PRIMARY KEY).
- `chat_session_id` (BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE).
- `role` (VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system'))).
- `content` (TEXT NOT NULL).
- `detected_topic` (VARCHAR(100)): Chủ đề câu hỏi do AI tự động gắn nhãn khi học viên đặt câu hỏi (phục vụ thống kê các chủ đề được hỏi AI nhiều nhất, có Partial Index `idx_chat_messages_topic`).
- `citations` (JSONB NOT NULL DEFAULT '[]'): Mảng chứa các mốc trích dẫn (`session_id`, `start_sec`, `end_sec`, `page_number`) để bấm tua video.
- `llm_provider` (VARCHAR(30)), `llm_model` (VARCHAR(80)), `prompt_tokens` (INT), `completion_tokens` (INT), `latency_ms` (INT), `langfuse_trace_id` (VARCHAR(64)).
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

#### Bảng 31: `mock_interviews` (Phiên Luyện Phỏng Vấn Giọng Nói 2 Vòng theo CV trong Hồ sơ & JD Mục tiêu)
- `id` (BIGSERIAL PRIMARY KEY).
- `account_id` (BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE).
- `target_level` (VARCHAR(20) NOT NULL CHECK (target_level IN ('INTERN', 'FRESHER', 'JUNIOR', 'SENIOR'))): Cấp bậc ứng tuyển học viên chọn.
- `target_role` (VARCHAR(150) NOT NULL): Vị trí ứng tuyển (ví dụ: *AI Engineer*, *Backend Developer*...).
- `jd_raw_text` (TEXT NOT NULL): Nội dung tờ JD công ty mà học viên nộp để đối chiếu và phỏng vấn.
- `cv_screening_result` (JSONB): Kết quả thẩm định Vòng 1 (Độ khớp giữa CV trong `user_profiles` với tờ JD, lời nhắc bổ sung kiến thức khóa học đã học vào CV, và nhận xét cách trình bày CV).
- `transcript_log` (JSONB NOT NULL DEFAULT '[]'): Lịch sử hội thoại hỏi – đáp bằng giọng nói ở Vòng 2 giữa Senior AI và học viên.
- `evaluation_report` (JSONB): Báo cáo đánh giá chi tiết sau khi hoàn thành buổi phỏng vấn (lúc hoàn tất mới trừ `1 Credit` trong `user_profiles.interview_credits`).
- `status` (mock_interview_status NOT NULL DEFAULT 'IN_PROGRESS'): `'CV_SCREENING'`, `'IN_PROGRESS'`, `'COMPLETED'`.
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `completed_at` (TIMESTAMPTZ).

#### Bảng 32: `system_settings` (Cấu hình vận hành toàn hệ thống)
- `setting_key` (VARCHAR(100) PRIMARY KEY).
- `setting_value` (TEXT NOT NULL).
- `description` (TEXT).
- `is_public` (BOOLEAN NOT NULL DEFAULT FALSE).
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).

---

## 3. Năm (5) Quy Tắc Truy Vấn Bảo Mật & Toàn Vẹn Dữ Liệu Bắt Buộc

1. **Quy tắc Chống Lộ Đáp Án Trắc Nghiệm:** Khi viết API lấy đề kiểm tra cho học viên làm bài, câu lệnh `SELECT` trên bảng `assessment_items` chỉ được lấy `id, item_order, item_type, skill_id, points, prompt_config`. Tuyệt đối cấm trả về cột `grading_config` và `explanation_md` trước khi học viên bấm nộp bài.
2. **Quy tắc Cô Lập Tri Thức RAG Theo Lớp Học:** Khi học viên hỏi Trợ giảng AI trong buổi học (`SESSION_TUTOR`), truy vấn vào bảng `knowledge_chunks` bắt buộc phải kiểm tra học viên có bản ghi `enrollments` hợp lệ trong `cohort_id` đó và lọc đúng `WHERE cohort_id = $1`.
3. **Quy tắc Giao Dịch Thanh Toán VietQR SePay Nguyên Tử:** Khi nhận Webhook từ SePay (`POST /api/v1/webhooks/sepay`), bắt buộc mở Transaction:
   - `SELECT * FROM orders WHERE order_code = $1 FOR UPDATE;`
   - Nếu `status = 'PAID'` thì dừng ngay và trả về thành công (Idempotent).
   - Kiểm tra số tiền chuyển khoản khớp với `amount_vnd`.
   - Cập nhật `orders.status = 'PAID'`, thêm bản ghi `payment_transactions`, thêm bản ghi `enrollments`, và cộng `cohorts.enrolled_count = enrolled_count + 1` trong cùng một Transaction.
4. **Quy tắc Khấu Trừ Credit Phỏng Vấn Công Bằng:** Ở Vòng 1 của `mock_interviews` (Duyệt CV & Đối chiếu JD), hệ thống chỉ kiểm tra điều kiện `user_profiles.interview_credits > 0` chứ **chưa trừ Credit**. Chỉ khi học viên hoàn thành Vòng 2 (Phỏng vấn giọng nói) và xuất báo cáo `evaluation_report` (`status = 'COMPLETED'`), hệ thống mới chạy câu lệnh nguyên tử `UPDATE user_profiles SET interview_credits = interview_credits - 1 WHERE account_id = $1 AND interview_credits > 0`.
5. **Quy tắc Bảo Toàn Đề Cương Theo Đợt Khai Giảng (`Cohort`):** Khi Admin chỉnh sửa đề cương cho một đợt mở lớp mới (ví dụ năm 2026), mọi thao tác thêm/sửa buổi học chỉ tác động lên các dòng `class_sessions` của `cohort_id` mới đó, tuyệt đối không làm thay đổi dữ liệu `class_sessions` hay `knowledge_chunks` của các đợt khai giảng cũ (năm 2025).

---
