import structlog
from arq.connections import RedisSettings
from ..core.config import settings

logger = structlog.get_logger()


async def ingest_session_material(ctx, session_id: int, r2_key: str):
    """Async background task to ingest PDF/Video and index into pgvector."""
    logger.info("Ingesting session material", session_id=session_id, r2_key=r2_key)
    # Background ingestion logic here
    return {"status": "INDEXED", "session_id": session_id}


async def process_live_recording(ctx, session_id: int, recording_url: str):
    """Async background task to transcribe live recording and extract AI summary."""
    logger.info("Processing live recording", session_id=session_id)
    return {"status": "PROCESSED", "session_id": session_id}


class WorkerSettings:
    functions = [ingest_session_material, process_live_recording]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 4

