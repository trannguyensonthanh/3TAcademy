"""Tác vụ nền bất đồng bộ (ARQ + Redis Worker) xử lý nạp tri thức tài liệu & phiên âm video bài giảng.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Tách các tác vụ AI nặng, tốn thời gian (phân mảnh tài liệu Markdown, tính vector embedding 1024 chiều,
  chạy Faster-Whisper ASR phiên âm bản ghi lớp học live, phân chương Cosine-Shift và tóm tắt MMR) ra khỏi
  luồng HTTP request-response đồng bộ để API không bị timeout.
- Dữ liệu sau khi xử lý được ghi trực tiếp vào bảng PostgreSQL `knowledge_chunks` (kèm vector `pgvector`
  và nhãn phân quyền `visibility = 'ENROLLED_ONLY'`) và `class_sessions.ai_summary_md` để phục vụ AI Tutor RAG.

Liên kết chéo (Cross-layer):
- Hàng đợi Redis (`settings.REDIS_URL` từ `src/core/config.py`) tiếp nhận job từ Backend/Admin khi có tài liệu
  hoặc video ghi hình buổi học mới.
- Gọi các module nội bộ: `core/db.py` (`get_db_pool`), `rag/chunker.py` (`chunk_markdown_document`),
  `rag/embedder.py` (`compute_semantic_embedding_1024`, `format_pgvector_literal`),
  `live_copilot/asr_whisper.py` (`transcribe_media_pipeline`), `live_copilot/topic_segmenter.py`.
"""

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
    """Tác vụ nền nạp tài liệu/slide buổi học vào kho vector RAG (`knowledge_chunks`).

    Mục tiêu:
        Phân mảnh văn bản Markdown giữ nguyên cấu trúc đề mục (`chunk_markdown_document`), mã hóa từng mảnh
        thành vector ngữ nghĩa 1024 chiều và lưu vào PostgreSQL `knowledge_chunks` với cờ `ENROLLED_ONLY`
        (bảo mật RBAC theo `course_id`, `cohort_id`, `session_id`) cùng chống trùng lặp idempotent bằng `content_hash`.
    Liên kết luồng (Cross-layer):
        - Được ARQ Worker thực thi khi có job nạp tài liệu buổi học mới.
        - Đọc bảng `class_sessions` JOIN `cohorts` để lấy `course_id`, `cohort_id`; ghi vào bảng `knowledge_chunks`.
        - Gọi `chunk_markdown_document()`, `compute_semantic_embedding_1024()`, `format_pgvector_literal()`.
    Đầu vào / Đầu ra:
        - Input: `ctx` (ARQ worker context), `session_id`, `r2_key` (khóa lưu trữ trên Cloudflare R2), `raw_markdown`.
        - Output: Dict trạng thái (`SKIPPED_EMPTY`, `SESSION_NOT_FOUND`, hoặc `INDEXED` kèm `chunks_indexed`).
    """
    # Async background worker task:
    # Splits markdown/slide material using structure-aware chunker, computes 1024-dim vectors,
    # and indexes directly into `knowledge_chunks` (`visibility = 'ENROLLED_ONLY'`).
    # Bước 1: Kiểm tra nội dung rỗng để bỏ qua sớm, tránh tốn kết nối DB.
    logger.info("Ingesting session material", session_id=session_id, r2_key=r2_key)
    if not raw_markdown.strip():
        return {"status": "SKIPPED_EMPTY", "session_id": session_id}

    # Bước 2: Phân mảnh tài liệu theo cấu trúc tiêu đề/đoạn văn Markdown có gối đầu (overlap).
    pool = await get_db_pool()
    chunks = chunk_markdown_document(raw_markdown)
    inserted = 0

    async with pool.acquire() as conn:
        # Bước 3: Tra cứu `cohort_id` và `course_id` từ DB để gắn siêu dữ liệu phân quyền RBAC cho từng chunk.
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

        # Bước 4: Tính SHA-256 `content_hash` (đảm bảo idempotent khi retry job) + vector embedding 1024 chiều
        # và chèn vào `knowledge_chunks` (`ON CONFLICT DO NOTHING`).
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
    """Tác vụ nền hậu xử lý bản ghi lớp học trực tuyến: ASR -> Auto-Chapters -> Tóm tắt MMR -> Vector Indexing.

    Mục tiêu:
        Tự động hóa hoàn toàn sau mỗi buổi học: phiên âm video thành transcript có timestamp, cắt chương tự động
        theo độ dịch chuyển Cosine, tạo bản tóm tắt Markdown cập nhật vào `class_sessions.ai_summary_md`,
        và lập chỉ mục từng chương (`start_sec`, `end_sec`) vào `knowledge_chunks` để AI Tutor trích dẫn đúng giây video.
    Liên kết luồng (Cross-layer):
        - Được ARQ Worker thực thi khi có file ghi hình buổi học hoàn tất.
        - Gọi `transcribe_media_pipeline()`, `segment_topics_cosine_shift()`, `summarize_extractive_mmr()`,
          `compute_semantic_embedding_1024()`.
        - Cập nhật bảng `class_sessions` và chèn mới vào `knowledge_chunks` (`source_type = 'VIDEO_TRANSCRIPT'`).
    Đầu vào / Đầu ra:
        - Input: `ctx`, `session_id` (ID buổi học), `recording_path` (đường dẫn file audio/video ghi hình).
        - Output: Dict JSON chứa `status="PROCESSED"`, `session_id`, `asr_engine`, và `chapters_count`.
    """
    # Async background worker task:
    # Runs Faster-Whisper ASR + Acoustic VAD -> Cosine-Shift Auto-Chapters -> MMR Extractive Summary,
    # updates `class_sessions.ai_summary_md`, and indexes timestamped `VIDEO_TRANSCRIPT` chunks.
    # Bước 1: Chạy pipeline nhận dạng giọng nói Faster-Whisper (hoặc fallback Gemini Audio/VAD) ra danh sách đoạn thoại.
    logger.info("Processing live recording with Faster-Whisper & MMR", session_id=session_id)
    asr_res = await transcribe_media_pipeline(media_path=recording_path, language="vi")
    segments = asr_res["segments"]
    # Bước 2: Phân chương tự động (Cosine-Shift) và rút trích tóm tắt 5 câu trọng tâm không lặp ý (MMR).
    chapters = segment_topics_cosine_shift(segments)
    mmr = summarize_extractive_mmr(segments, max_sentences=5)

    # Bước 3: Cập nhật tóm tắt AI vào bảng `class_sessions` và lập chỉ mục vector có mốc thời gian (`start_sec`, `end_sec`).
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
            # Bước 4: Lưu từng chương video thành 1 chunk `VIDEO_TRANSCRIPT` chống trùng bằng `content_hash`.
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
    """Cấu hình tiến trình ARQ Worker: đăng ký danh sách tác vụ, kết nối Redis và giới hạn tối đa 4 job song song."""

    functions = [ingest_session_material, process_live_recording]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 4
