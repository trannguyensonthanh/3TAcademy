from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.career_ai import career_router
from .api.routes.grading_ai import grading_router
from .api.routes.media_ai import media_router
from .api.routes.proctoring_ai import proctoring_router
from .api.routes.rag_chat import rag_chat_router
from .api.routes.scheduler_routes import scheduler_router
from .core.config import is_valid_gemini_key, settings
from .core.db import close_db_pool, get_db_pool
from .core.llm_gateway import close_http_client
from .core.logging import logger, setup_logging
from .core.model_registry import ensure_model_directories, get_models_registry_status
from .core.security import verify_internal_api_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    ensure_model_directories()
    logger.info("AI Service v2.0 starting up", env=settings.ENV, model=settings.GEMINI_MODEL)
    yield
    await close_http_client()
    await close_db_pool()
    logger.info("AI Service shutting down")


app = FastAPI(
    title="3T Academy Research AI Service",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grading_router)
app.include_router(rag_chat_router)
app.include_router(career_router)
app.include_router(media_router)
app.include_router(proctoring_router)
app.include_router(scheduler_router)


@app.get("/health")
@app.get("/health/live")
async def health_live():
    return {"status": "UP", "service": "ai-service", "version": "2.0.0", "model": settings.GEMINI_MODEL}


@app.get("/health/ready")
async def health_ready():
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "READY", "database": "UP"}
    except Exception as exc:
        logger.warning("AI Service DB readiness check failed", error=str(exc))
        return {"status": "DEGRADED", "database": "DOWN"}


@app.get("/api/v1/ai/status", dependencies=[Depends(verify_internal_api_key)])
async def ai_status():
    gemini_ready = is_valid_gemini_key(settings.GEMINI_API_KEY)
    return {
        "status": "OPERATIONAL",
        "gemini_configured": gemini_ready,
        "gemini_model": settings.GEMINI_MODEL,
        "vllm_base": settings.VLLM_API_BASE,
        "langfuse_configured": bool(settings.LANGFUSE_PUBLIC_KEY),
        "registry": get_models_registry_status(gemini_configured=gemini_ready),
    }


@app.get("/api/v1/ai/models/status", dependencies=[Depends(verify_internal_api_key)])
async def ai_models_status():
    gemini_ready = is_valid_gemini_key(settings.GEMINI_API_KEY)
    return get_models_registry_status(gemini_configured=gemini_ready)
