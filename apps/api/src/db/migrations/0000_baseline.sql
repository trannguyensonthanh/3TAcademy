-- =============================================================================
-- EduTech AI Platform — Baseline PostgreSQL 16 + pgvector Schema (32 Tables)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- UUIDv4 generation (gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS citext;      -- Case-insensitive email text
CREATE EXTENSION IF NOT EXISTS vector;      -- Vector similarity search (pgvector)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- Exclusion constraints on time ranges (tstzrange)

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------
CREATE TYPE account_role          AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');
CREATE TYPE account_status        AS ENUM ('ACTIVE', 'LOCKED');
CREATE TYPE auth_provider         AS ENUM ('LOCAL', 'GOOGLE');


CREATE TYPE course_status         AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE skill_relation_role   AS ENUM ('PREREQUISITE', 'LEARNING_OUTCOME');
CREATE TYPE cohort_status         AS ENUM ('DRAFT', 'OPENING', 'ONGOING', 'COMPLETED', 'ARCHIVED');
CREATE TYPE session_status        AS ENUM ('SCHEDULED', 'LIVE', 'PROCESSING_REPLAY', 'REPLAY_READY');
CREATE TYPE video_source_provider AS ENUM ('R2_HLS_AES128', 'BUNNY_STREAM');

CREATE TYPE order_status          AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED');
CREATE TYPE enrollment_status     AS ENUM ('ACTIVE', 'COMPLETED', 'REVOKED');

CREATE TYPE assessment_purpose    AS ENUM ('SESSION_ASSIGNMENT', 'FINAL_EXAM');
CREATE TYPE assessment_status     AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE grading_mode          AS ENUM ('AUTO', 'MANUAL', 'HYBRID');
CREATE TYPE assessment_item_type  AS ENUM (
    'SINGLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE',
    'SHORT_ANSWER', 'ESSAY', 'FILE_SUBMISSION'
);
CREATE TYPE mock_interview_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CV_SCREENING');


CREATE TYPE answer_grading_status AS ENUM ('AUTO_GRADED', 'PENDING_MANUAL', 'MANUALLY_GRADED');
CREATE TYPE integrity_verdict     AS ENUM ('CLEAN', 'FLAGGED', 'CONFIRMED_CHEAT', 'CLEARED_BY_INSTRUCTOR');
CREATE TYPE chunk_visibility      AS ENUM ('PUBLIC', 'ENROLLED_ONLY');

-- -----------------------------------------------------------------------------
-- 2. DOMAIN 1 — Identity, Google OAuth & Instructors (4 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
    id                  BIGSERIAL PRIMARY KEY,
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT,
    role                account_role NOT NULL DEFAULT 'STUDENT',
    status              account_status NOT NULL DEFAULT 'ACTIVE',
    email_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account_identities (
    id              BIGSERIAL PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider        auth_provider NOT NULL,
    provider_uid    VARCHAR(255) NOT NULL,
    provider_email  CITEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_uid)
);

CREATE TABLE user_profiles (
    account_id              BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    full_name               VARCHAR(150) NOT NULL,
    avatar_url              TEXT,
    bio                     TEXT,
    career_goal             TEXT,
    goal_embedding          vector(1024),
    face_reference_r2_key   TEXT,
    face_embedding          vector(512),
    cv_parsed_data          JSONB NOT NULL DEFAULT '{}',
    interview_credits       INT NOT NULL DEFAULT 2 CHECK (interview_credits >= 0),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE instructor_profiles (
    account_id              BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    headline                VARCHAR(200) NOT NULL,
    organization            VARCHAR(150),
    years_of_experience     SMALLINT CHECK (years_of_experience >= 0),
    expertise_summary_md    TEXT,
    social_links            JSONB NOT NULL DEFAULT '{}',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- 3. DOMAIN 2 — Skill Taxonomy, Courses, Cohorts & Class Sessions (8 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) NOT NULL UNIQUE,
    description TEXT,
    parent_id   INT REFERENCES categories(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE skills (
    id              SERIAL PRIMARY KEY,
    category_id     INT REFERENCES categories(id) ON DELETE SET NULL,
    code            VARCHAR(80) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    id                      BIGSERIAL PRIMARY KEY,
    category_id             INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title                   VARCHAR(255) NOT NULL,
    slug                    VARCHAR(280) NOT NULL UNIQUE,
    short_description       VARCHAR(500) NOT NULL,
    description_md          TEXT NOT NULL,
    thumbnail_url           TEXT,
    difficulty_level        SMALLINT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 5),
    syllabus_template       JSONB NOT NULL DEFAULT '[]',
    status                  course_status NOT NULL DEFAULT 'DRAFT',
    embedding               vector(1024),
    search_tsv              tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(short_description, ''))
    ) STORED,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_embedding_hnsw ON courses USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_courses_search_tsv_gin ON courses USING gin (search_tsv);

CREATE TABLE course_skills (
    course_id       BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    skill_id        INT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    skill_role      skill_relation_role NOT NULL,
    target_weight   REAL NOT NULL DEFAULT 1.0 CHECK (target_weight > 0),
    PRIMARY KEY (course_id, skill_id, skill_role)
);

CREATE TABLE cohorts (
    id                      BIGSERIAL PRIMARY KEY,
    course_id               BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    code                    VARCHAR(50) NOT NULL UNIQUE,
    name                    VARCHAR(255) NOT NULL,
    instructor_id           BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    curriculum_version      VARCHAR(120) NOT NULL DEFAULT 'v1.0',
    tech_stack_notes        TEXT,
    tuition_vnd             BIGINT NOT NULL CHECK (tuition_vnd >= 0),
    enrolled_count          INT NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
    enrollment_open_at      TIMESTAMPTZ NOT NULL,
    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL CHECK (end_date >= start_date),
    schedule_slots          JSONB NOT NULL DEFAULT '[]',
    replay_expires_at       TIMESTAMPTZ,
    status                  cohort_status NOT NULL DEFAULT 'DRAFT',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE class_sessions (
    id                      BIGSERIAL PRIMARY KEY,
    cohort_id               BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    instructor_id           BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    session_order           SMALLINT NOT NULL CHECK (session_order > 0),
    activity_tags           TEXT[] NOT NULL DEFAULT '{}',
    title                   VARCHAR(255) NOT NULL,
    description_md          TEXT,
    scheduled_start         TIMESTAMPTZ,
    scheduled_end           TIMESTAMPTZ,
    status                  session_status NOT NULL DEFAULT 'SCHEDULED',
    livekit_room_name       VARCHAR(120) UNIQUE,
    video_provider          video_source_provider,
    video_r2_key            TEXT,
    duration_seconds        INT CHECK (duration_seconds >= 0),
    ai_summary_md           TEXT,
    last_updated_by         BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (cohort_id, session_order),
    CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start),
    EXCLUDE USING gist (
        instructor_id WITH =,
        tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
    ) WHERE (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL)
);

CREATE TABLE session_attachments (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    file_name       VARCHAR(255) NOT NULL,
    r2_object_key   TEXT NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    uploaded_by     BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_subtitles (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    language_code       VARCHAR(10) NOT NULL DEFAULT 'vi',
    vtt_r2_key          TEXT NOT NULL,
    is_auto_generated   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, language_code)
);

-- -----------------------------------------------------------------------------
-- 4. DOMAIN 3 — Direct Orders, SePay VietQR Transactions, Enrollments & Certs (6 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id                  BIGSERIAL PRIMARY KEY,
    order_code          VARCHAR(40) NOT NULL UNIQUE,
    account_id          BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    cohort_id           BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
    amount_vnd          BIGINT NOT NULL CHECK (amount_vnd >= 0),
    status              order_status NOT NULL DEFAULT 'PENDING',
    idempotency_key     VARCHAR(100) UNIQUE,
    paid_at             TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_transactions (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    gateway             VARCHAR(20) NOT NULL DEFAULT 'SEPAY_VIETQR',
    gateway_txn_id      VARCHAR(100) NOT NULL UNIQUE,
    amount_vnd          BIGINT NOT NULL,
    response_code       VARCHAR(10) NOT NULL,
    raw_payload         JSONB NOT NULL,
    match_status        VARCHAR(20) NOT NULL DEFAULT 'MATCHED' CHECK (match_status IN ('MATCHED', 'UNMATCHED_ORDER', 'AMOUNT_MISMATCH')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE enrollments (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    cohort_id           BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
    order_id            BIGINT REFERENCES orders(id) ON DELETE RESTRICT,
    enrolled_by_admin   BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    status              enrollment_status NOT NULL DEFAULT 'ACTIVE',
    final_exam_passed   BOOLEAN NOT NULL DEFAULT FALSE,
    dropout_risk_score  REAL NOT NULL DEFAULT 0.0 CHECK (dropout_risk_score BETWEEN 0.0 AND 1.0),
    risk_level          VARCHAR(15) NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    last_reminded_at    TIMESTAMPTZ,
    UNIQUE (account_id, cohort_id)
);

CREATE TABLE session_progress (
    account_id              BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    session_id              BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    last_position_sec       INT NOT NULL DEFAULT 0 CHECK (last_position_sec >= 0),
    is_completed            BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at            TIMESTAMPTZ,
    last_activity_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, session_id)
);

CREATE TABLE course_reviews (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    cohort_id   BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    is_public   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cohort_id, account_id)
);

CREATE TABLE certificates (
    id                  BIGSERIAL PRIMARY KEY,
    enrollment_id       BIGINT NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT,
    account_id          BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    certificate_code    VARCHAR(64) NOT NULL UNIQUE,
    hmac_signature      VARCHAR(128) NOT NULL,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ,
    revoke_reason       TEXT
);

-- -----------------------------------------------------------------------------
-- 5. DOMAIN 4 — Timestamped Discussions & Notifications (3 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE discussion_threads (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    author_id           BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    video_timestamp_sec INT CHECK (video_timestamp_sec >= 0),
    is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE discussion_posts (
    id                      BIGSERIAL PRIMARY KEY,
    thread_id               BIGINT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
    author_id               BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    parent_post_id          BIGINT REFERENCES discussion_posts(id) ON DELETE CASCADE,
    content_md              TEXT NOT NULL,
    is_ai_generated         BOOLEAN NOT NULL DEFAULT FALSE,
    is_instructor_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by             BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    recipient_id    BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type            VARCHAR(40) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    acted_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_unread ON notifications (recipient_id, created_at DESC) WHERE is_read = FALSE;

-- -----------------------------------------------------------------------------
-- 6. DOMAIN 5 — Assessments, Dual Grading, Code Review & CV Proctoring (5 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE assessments (
    id                  BIGSERIAL PRIMARY KEY,
    cohort_id           BIGINT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    session_id          BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
    purpose             assessment_purpose NOT NULL,
    grading_mode        grading_mode NOT NULL DEFAULT 'AUTO',
    title               VARCHAR(255) NOT NULL,
    instructions_md     TEXT,
    duration_minutes    SMALLINT CHECK (duration_minutes > 0),
    pass_score_pct      SMALLINT NOT NULL DEFAULT 70 CHECK (pass_score_pct BETWEEN 0 AND 100),
    max_attempts        SMALLINT,
    due_at              TIMESTAMPTZ,
    proctoring_config   JSONB NOT NULL DEFAULT '{}',
    status              assessment_status NOT NULL DEFAULT 'DRAFT',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assessment_items (
    id                  BIGSERIAL PRIMARY KEY,
    assessment_id       BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    skill_id            INT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    item_order          SMALLINT NOT NULL,
    item_type           assessment_item_type NOT NULL,
    points              NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (points > 0),
    prompt_config       JSONB NOT NULL,
    grading_config      JSONB NOT NULL,
    explanation_md      TEXT,
    item_embedding      vector(1024),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, item_order)
);

CREATE TABLE assessment_attempts (
    id                          BIGSERIAL PRIMARY KEY,
    assessment_id               BIGINT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
    account_id                  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    attempt_number              SMALLINT NOT NULL DEFAULT 1,
    started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ,
    submitted_at                TIMESTAMPTZ,
    grading_completed_at        TIMESTAMPTZ,
    total_score                 NUMERIC(6,2),
    max_possible_score          NUMERIC(6,2),
    score_pct                   NUMERIC(5,2),
    is_passed                   BOOLEAN,
    remedial_recommendations    JSONB,
    total_risk_score            NUMERIC(6,2) NOT NULL DEFAULT 0,
    integrity_status            integrity_verdict NOT NULL DEFAULT 'CLEAN',
    verdict_note                TEXT,
    verdict_by                  BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    verdict_at                  TIMESTAMPTZ
);

CREATE TABLE submission_answers (
    id                  BIGSERIAL PRIMARY KEY,
    attempt_id          BIGINT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    item_id             BIGINT NOT NULL REFERENCES assessment_items(id) ON DELETE RESTRICT,
    response_data       JSONB NOT NULL DEFAULT '{}',
    grading_status      answer_grading_status NOT NULL DEFAULT 'AUTO_GRADED',
    auto_score          NUMERIC(5,2),
    manual_score        NUMERIC(5,2),
    final_score         NUMERIC(5,2),
    is_correct          BOOLEAN,
    feedback_md         TEXT,
    ai_suggestion       JSONB,
    graded_by           BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    graded_at           TIMESTAMPTZ,
    UNIQUE (attempt_id, item_id)
);

CREATE INDEX idx_submission_answers_pending ON submission_answers (grading_status) WHERE grading_status = 'PENDING_MANUAL';
CREATE INDEX idx_submission_answers_item    ON submission_answers (item_id, final_score);

CREATE TABLE proctoring_events (
    id                  BIGSERIAL PRIMARY KEY,
    attempt_id          BIGINT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    video_offset_sec    INT,
    tier                VARCHAR(10) NOT NULL CHECK (tier IN ('EDGE', 'SERVER')),
    event_type          VARCHAR(40) NOT NULL,
    confidence          REAL CHECK (confidence BETWEEN 0 AND 1),
    risk_delta          NUMERIC(5,2) NOT NULL DEFAULT 0,
    snapshot_r2_key     TEXT,
    details             JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_proctoring_events_attempt ON proctoring_events (attempt_id, occurred_at);

-- -----------------------------------------------------------------------------
-- 7. DOMAIN 6 — Hybrid RAG Vector Store, Skill States, Chat, Interviews & System (6 Tables)
-- -----------------------------------------------------------------------------
CREATE TABLE knowledge_chunks (
    id              BIGSERIAL PRIMARY KEY,
    visibility      chunk_visibility NOT NULL DEFAULT 'ENROLLED_ONLY',
    course_id       BIGINT REFERENCES courses(id) ON DELETE CASCADE,
    cohort_id       BIGINT REFERENCES cohorts(id) ON DELETE CASCADE,
    session_id      BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
    attachment_id   BIGINT REFERENCES session_attachments(id) ON DELETE CASCADE,
    source_type     VARCHAR(30) NOT NULL,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    content_hash    CHAR(64) NOT NULL,
    start_sec       INT,
    end_sec         INT,
    page_number     INT,
    embedding       vector(1024) NOT NULL,
    search_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_access_filter  ON knowledge_chunks (visibility, course_id, cohort_id);
CREATE INDEX idx_chunks_embedding_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_search_tsv_gin ON knowledge_chunks USING gin (search_tsv);

CREATE TABLE student_skill_states (
    account_id      BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    skill_id        INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    mastery_score   REAL NOT NULL DEFAULT 0.0 CHECK (mastery_score BETWEEN 0.0 AND 100.0),
    evidence_count  INT NOT NULL DEFAULT 0,
    trend           REAL NOT NULL DEFAULT 0.0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, skill_id)
);

CREATE TABLE chat_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    public_id           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    account_id          BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    scope               VARCHAR(20) NOT NULL CHECK (scope IN ('ADVISOR_GLOBAL', 'SESSION_TUTOR', 'LIVE_COPILOT')),
    cohort_id           BIGINT REFERENCES cohorts(id) ON DELETE CASCADE,
    session_id          BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
    title               VARCHAR(255),
    context_summary     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_owner ON chat_sessions (account_id, updated_at DESC);

CREATE TABLE chat_messages (
    id                  BIGSERIAL PRIMARY KEY,
    chat_session_id     BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role                VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content             TEXT NOT NULL,
    detected_topic      VARCHAR(100),
    citations           JSONB NOT NULL DEFAULT '[]',
    llm_provider        VARCHAR(30),
    llm_model           VARCHAR(80),
    prompt_tokens       INT,
    completion_tokens   INT,
    latency_ms          INT,
    langfuse_trace_id   VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_topic ON chat_messages (detected_topic) WHERE role = 'user' AND detected_topic IS NOT NULL;

CREATE TABLE mock_interviews (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_level        VARCHAR(20) NOT NULL CHECK (target_level IN ('INTERN', 'FRESHER', 'JUNIOR', 'SENIOR')),
    target_role         VARCHAR(150) NOT NULL,
    jd_raw_text         TEXT NOT NULL,
    cv_screening_result JSONB,
    transcript_log      JSONB NOT NULL DEFAULT '[]',
    evaluation_report   JSONB,
    status              mock_interview_status NOT NULL DEFAULT 'IN_PROGRESS',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_mock_interviews_account ON mock_interviews (account_id, created_at DESC);

CREATE INDEX idx_chat_messages_session ON chat_messages (chat_session_id, created_at);

CREATE TABLE system_settings (
    setting_key     VARCHAR(100) PRIMARY KEY,
    setting_value   TEXT NOT NULL,
    description     TEXT,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

