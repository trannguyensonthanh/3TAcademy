from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging import setup_logging, logger
from .core.security import verify_internal_api_key
from .api.routes.grading_ai import grading_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("AI Service starting up", env=settings.ENV)
    yield
    logger.info("AI Service shutting down")


app = FastAPI(
    title="EduTech AI Service",
    version="1.0.0",
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


@app.get("/health/live")
async def health_live():
    return {"status": "UP", "service": "ai-service"}


@app.get("/health/ready")
async def health_ready():
    return {"status": "READY"}


@app.get("/api/v1/ai/status", dependencies=[Depends(verify_internal_api_key)])
async def ai_status():
    return {
        "status": "OPERATIONAL",
        "gemini_configured": bool(settings.GEMINI_API_KEY),
        "vllm_base": settings.VLLM_API_BASE,
        "langfuse_configured": bool(settings.LANGFUSE_PUBLIC_KEY),
    }
