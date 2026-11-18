-- =============================================================================
-- EduTech AI Platform — 0001 Schema Alignment & Production Columns Upgrade
-- Safe & Idempotent for both fresh and pre-existing PostgreSQL volumes.
-- =============================================================================

-- 1. Extend PostgreSQL ENUMs safely (outside DO block or via ADD VALUE IF NOT EXISTS)
ALTER TYPE video_source_provider ADD VALUE IF NOT EXISTS 'R2_MP4';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'CANCELED';

-- 2. Upgrade user_profiles: contact links, preferences JSONB, default 0 interview_credits
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS github_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_profiles ALTER COLUMN interview_credits SET DEFAULT 0;

-- 3. Align courses.difficulty_level default with Drizzle schema
ALTER TABLE courses ALTER COLUMN difficulty_level SET DEFAULT 1;

-- 4. Upgrade cohorts: seat capacity (`max_seats`)
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS max_seats INT NOT NULL DEFAULT 35;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cohorts_max_seats'
    ) THEN
        ALTER TABLE cohorts ADD CONSTRAINT chk_cohorts_max_seats CHECK (max_seats > 0);
    END IF;
END $$;

-- 5. Upgrade session_progress: monotonic watch progress & live attendance flag
ALTER TABLE session_progress ADD COLUMN IF NOT EXISTS max_watched_sec INT NOT NULL DEFAULT 0;
ALTER TABLE session_progress ADD COLUMN IF NOT EXISTS attended_live BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE session_progress SET max_watched_sec = GREATEST(max_watched_sec, last_position_sec);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_progress_max_watched'
    ) THEN
        ALTER TABLE session_progress ADD CONSTRAINT chk_session_progress_max_watched CHECK (max_watched_sec >= 0);
    END IF;
END $$;

-- 6. Upgrade assessments: enforce session_id presence iff SESSION_ASSIGNMENT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_assessments_purpose_session'
    ) THEN
        ALTER TABLE assessments ADD CONSTRAINT chk_assessments_purpose_session CHECK (
            (purpose = 'SESSION_ASSIGNMENT' AND session_id IS NOT NULL)
            OR (purpose = 'FINAL_EXAM' AND session_id IS NULL)
        );
    END IF;
END $$;

-- 7. Fix blank-padded CHAR(64) on knowledge_chunks.content_hash -> VARCHAR(64)
ALTER TABLE knowledge_chunks
    ALTER COLUMN content_hash TYPE VARCHAR(64) USING TRIM(content_hash);

-- 8. Align mock_interviews default status to Round 1 ('CV_SCREENING')
ALTER TABLE mock_interviews ALTER COLUMN status SET DEFAULT 'CV_SCREENING';

-- 9. Normalize any legacy fractional student_skill_states.mastery_score (0 < x < 1) to 0..100
UPDATE student_skill_states
SET mastery_score = ROUND((mastery_score * 100)::numeric, 2)::real
WHERE mastery_score > 0 AND mastery_score < 1.0;

-- 10. Install automatic updated_at trigger across all 12 mutable tables
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'accounts',
        'user_profiles',
        'instructor_profiles',
        'courses',
        'cohorts',
        'class_sessions',
        'discussion_threads',
        'discussion_posts',
        'assessments',
        'student_skill_states',
        'chat_sessions',
        'system_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;', tbl, tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();',
            tbl,
            tbl
        );
    END LOOP;
END $$;
