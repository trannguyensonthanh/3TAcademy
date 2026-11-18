import hashlib
import structlog
from arq.connections import RedisSettings

from ..core.config import settings
from ..core.db import get_db_pool
from ..live_copilot.asr_whisper import transcribe_media_pipeline
from ..live_copilot.topic_segmenter import (
    segment_topics_cosine_shift,
    summarize_extractive_mmr,
)
from ..rag.chunker import chunk_markdown_document
from ..rag.embedder import compute_semantic_embedding_1024, format_pgvector_literal

logger = structlog.get_logger()


async def ingest_session_material(ctx, session_id: int, r2_key: str, raw_markdown: str = ""):
    """
    Async background worker task:
    Splits markdown/slide material using structure-aware chunker, computes 1024-dim vectors,
    and indexes directly into `knowledge_chunks` (`visibility = 'ENROLLED_ONLY'`).
    """
    logger.info("Ingesting session material", session_id=session_id, r2_key=r2_key)
    if not raw_markdown.strip():
        return {"status": "SKIPPED_EMPTY", "session_id": session_id}

    pool = await get_db_pool()
    chunks = chunk_markdown_document(raw_markdown)
    inserted = 0

    async with pool.acquire() as conn:
        sess = await conn.fetchrow(
            """
            SELECT s.id, s.cohort_id, ch.course_id
            FROM class_sessions s
            INNER JOIN cohorts ch ON ch.id = s.cohort_id
            WHERE s.id = $1
            """,
            session_id,
        )
        if not sess:
            return {"status": "SESSION_NOT_FOUND", "session_id": session_id}

        for idx, ch in enumerate(chunks, start=1):
            content = ch["content"]
            ch_hash = hashlib.sha256(f"{session_id}:doc:{idx}:{content}".encode("utf-8")).hexdigest()
            vec_lit = format_pgvector_literal(compute_semantic_embedding_1024(content))
            await conn.execute(
                """
                INSERT INTO knowledge_chunks (
                    visibility, course_id, cohort_id, session_id, source_type,
                    chunk_index, content, content_hash, page_number, embedding
                )
                VALUES ('ENROLLED_ONLY', $1, $2, $3, 'ATTACHMENT_DOC', $4, $5, $6, $7, $8::vector)
                ON CONFLICT (content_hash) DO NOTHING
                """,
                int(sess["course_id"]),
                int(sess["cohort_id"]),
                session_id,
                idx,
                content,
                ch_hash,
                idx,
                vec_lit,
            )
            inserted += 1

    return {"status": "INDEXED", "session_id": session_id, "chunks_indexed": inserted}


async def process_live_recording(ctx, session_id: int, recording_path: str):
    """
    Async background worker task:
    Runs Faster-Whisper ASR + Acoustic VAD -> Cosine-Shift Auto-Chapters -> MMR Extractive Summary,
    updates `class_sessions.ai_summary_md`, and indexes timestamped `VIDEO_TRANSCRIPT` chunks.
    """
    logger.info("Processing live recording with Faster-Whisper & MMR", session_id=session_id)
    asr_res = await transcribe_media_pipeline(media_path=recording_path, language="vi")
    segments = asr_res["segments"]
    chapters = segment_topics_cosine_shift(segments)
    mmr = summarize_extractive_mmr(segments, max_sentences=5)

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        sess = await conn.fetchrow(
            """
            SELECT s.id, s.cohort_id, ch.course_id
            FROM class_sessions s
            INNER JOIN cohorts ch ON ch.id = s.cohort_id
            WHERE s.id = $1
            """,
            session_id,
        )
        if sess and mmr["summaryMd"]:
            await conn.execute(
                "UPDATE class_sessions SET ai_summary_md = $1 WHERE id = $2",
                mmr["summaryMd"],
                session_id,
            )
            for idx, ch in enumerate(chapters, start=1):
                content = f"{ch['title']}: {ch['summary']}"
                ch_hash = hashlib.sha256(f"{session_id}:vid:{idx}:{content}".encode("utf-8")).hexdigest()
                vec_lit = format_pgvector_literal(compute_semantic_embedding_1024(content))
                await conn.execute(
                    """
                    INSERT INTO knowledge_chunks (
                        visibility, course_id, cohort_id, session_id, source_type,
                        chunk_index, content, content_hash, start_sec, end_sec, embedding
                    )
                    VALUES ('ENROLLED_ONLY', $1, $2, $3, 'VIDEO_TRANSCRIPT', $4, $5, $6, $7, $8, $9::vector)
                    ON CONFLICT (content_hash) DO NOTHING
                    """,
                    int(sess["course_id"]),
                    int(sess["cohort_id"]),
                    session_id,
                    idx,
                    content,
                    ch_hash,
                    int(round(ch["startSec"])),
                    int(round(ch["endSec"])),
                    vec_lit,
                )

    return {
        "status": "PROCESSED",
        "session_id": session_id,
        "asr_engine": asr_res["engine"],
        "chapters_count": len(chapters),
    }


class WorkerSettings:
    functions = [ingest_session_material, process_live_recording]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 4
