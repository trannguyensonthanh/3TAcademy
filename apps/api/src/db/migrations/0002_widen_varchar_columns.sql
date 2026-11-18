-- =============================================================================
-- EduTech AI Platform — 0002 Widen VARCHAR Columns for SePay & Curriculum Codes
-- Safe & Idempotent on existing PostgreSQL databases.
-- =============================================================================

ALTER TABLE payment_transactions ALTER COLUMN gateway TYPE VARCHAR(30);
ALTER TABLE payment_transactions ALTER COLUMN response_code TYPE VARCHAR(40);
ALTER TABLE payment_transactions ALTER COLUMN match_status TYPE VARCHAR(30);

ALTER TABLE cohorts ALTER COLUMN curriculum_version TYPE VARCHAR(120);
ALTER TABLE proctoring_events ALTER COLUMN event_type TYPE VARCHAR(60);
ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(50);
ALTER TABLE chat_messages ALTER COLUMN llm_provider TYPE VARCHAR(50);
ALTER TABLE chat_messages ALTER COLUMN llm_model TYPE VARCHAR(100);
