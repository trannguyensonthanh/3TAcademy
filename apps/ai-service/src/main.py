"""Điểm khởi chạy chính (Entrypoint) của dịch vụ AI Service (FastAPI).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Là lớp cổng vào HTTP (ASGI application) của toàn bộ tầng AI Service chạy trên cổng 8000.
- Khởi tạo hạ tầng vòng đời (logging, thư mục lưu trọng số mô hình local) khi khởi động và dọn dẹp tài nguyên
  (HTTP client pool, PostgreSQL connection pool) khi tắt ứng dụng.
- Gắn kết 6 nhóm router nghiệp vụ AI (Grading, RAG Chat, Career/CV, Media ASR, Proctoring CV, Scheduler CP-SAT)
  cùng các endpoint giám sát sức khỏe (`/health`, `/health/ready`) và trạng thái mô hình (`/api/v1/ai/status`).

Liên kết chéo (Cross-layer):
- Nhận request HTTP nội bộ từ Backend Express (`apps/api/src/integrations/aiService.client.ts` và
  `apps/api/src/modules/assessment/assessment.routes.ts`) qua header bảo mật `X-Internal-Key`.
- Điều phối xuống 6 router trong `src/api/routes/*`, tầng lõi `src/core/*` (`db`, `llm_gateway`, `model_registry`, `security`).
"""

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
    """Quản lý vòng đời khởi động (startup) và tắt (shutdown) của FastAPI.

    Mục tiêu:
        Chuẩn bị logging, thư mục lưu model local trước khi nhận request đầu tiên và đóng gọn
        các kết nối mạng/database khi server dừng để tránh rò rỉ tài nguyên (connection leak).
    Liên kết luồng (Cross-layer):
        Được FastAPI tự động thực thi khi tiến trình Uvicorn khởi chạy `src.main:app`.
        Gọi tới `setup_logging`, `ensure_model_directories`, `close_http_client`, `close_db_pool`.
    Đầu vào / Đầu ra:
        - Input: `app` (instance FastAPI).
        - Output: Async generator theo chuẩn ASGI lifespan protocol.
    """
    # Bước 1: Khởi tạo định dạng log có cấu trúc (structlog) và tạo sẵn cây thư mục chứa model ONNX/CTranslate2.
    setup_logging()
    ensure_model_directories()
    logger.info("AI Service v2.0 starting up", env=settings.ENV, model=settings.GEMINI_MODEL)
    # Bước 2: Nhường quyền điều khiển cho FastAPI phục vụ các HTTP request trong suốt thời gian chạy.
    yield
    # Bước 3: Khi server nhận tín hiệu dừng (SIGTERM/SIGINT), đóng an toàn HTTP client và DB connection pool.
    await close_http_client()
    await close_db_pool()
    logger.info("AI Service shutting down")


# Khởi tạo ứng dụng FastAPI gắn với quản lý vòng đời lifespan.
app = FastAPI(
    title="3T Academy Research AI Service",
    version="2.0.0",
    lifespan=lifespan,
)

# Cấu hình CORS cho phép gọi chéo nguồn trong môi trường phát triển/nội bộ.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký 6 router chức năng AI chính vào ứng dụng FastAPI.
app.include_router(grading_router)
app.include_router(rag_chat_router)
app.include_router(career_router)
app.include_router(media_router)
app.include_router(proctoring_router)
app.include_router(scheduler_router)


@app.get("/health")
@app.get("/health/live")
async def health_live():
    """Kiểm tra Liveness Probe của tiến trình AI Service.

    Mục tiêu:
        Xác nhận tiến trình FastAPI đang sống (phản hồi HTTP 200), không kiểm tra phụ thuộc ngoài.
    Liên kết luồng (Cross-layer):
        Được Docker/Kubernetes healthcheck hoặc đội vận hành gọi định kỳ.
    Đầu vào / Đầu ra:
        - Input: Không có tham số.
        - Output: Dict JSON chứa `status`, `service`, `version`, `model`.
    """
    return {"status": "UP", "service": "ai-service", "version": "2.0.0", "model": settings.GEMINI_MODEL}


@app.get("/health/ready")
async def health_ready():
    """Kiểm tra Readiness Probe — xác minh AI Service đã sẵn sàng kết nối PostgreSQL/pgvector.

    Mục tiêu:
        Đảm bảo kết nối cơ sở dữ liệu phục vụ RAG (pgvector) đang hoạt động trước khi nhận traffic thực tế.
    Liên kết luồng (Cross-layer):
        Gọi `get_db_pool()` trong `src/core/db.py` để thực thi truy vấn ping `SELECT 1`.
    Đầu vào / Đầu ra:
        - Input: Không có tham số.
        - Output: Dict JSON `{"status": "READY", "database": "UP"}` hoặc `DEGRADED` nếu lỗi kết nối DB.
    """
    # Bước 1: Mở kết nối từ asyncpg pool và chạy truy vấn nhẹ `SELECT 1` để kiểm tra DB sống.
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "READY", "database": "UP"}
    except Exception as exc:
        # Bước 2: Nếu DB lỗi, không crash endpoint mà trả về trạng thái DEGRADED để hệ thống giám sát cảnh báo.
        logger.warning("AI Service DB readiness check failed", error=str(exc))
        return {"status": "DEGRADED", "database": "DOWN"}


@app.get("/api/v1/ai/status", dependencies=[Depends(verify_internal_api_key)])
async def ai_status():
    """Trả về tổng quan trạng thái vận hành toàn hệ thống AI (LLM, Langfuse và Model Registry).

    Mục tiêu:
        Cho phép Backend hoặc Admin dashboard kiểm tra nhanh cấu hình API key, vLLM, observability và các model local.
    Liên kết luồng (Cross-layer):
        Bảo vệ bởi `verify_internal_api_key` (`X-Internal-Key`); gọi `is_valid_gemini_key` và `get_models_registry_status`.
    Đầu vào / Đầu ra:
        - Input: Header `X-Internal-Key`.
        - Output: Dict JSON mô tả trạng thái từng thành phần AI và bản đồ trạng thái model trong registry.
    """
    # Bước 1: Kiểm tra khóa Gemini API có hợp lệ (không rỗng, không phải chuỗi placeholder).
    gemini_ready = is_valid_gemini_key(settings.GEMINI_API_KEY)
    # Bước 2: Tổng hợp thông tin cấu hình runtime và trạng thái toàn bộ tầng model local/cloud.
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
    """Trả về báo cáo chi tiết trạng thái sẵn sàng của tất cả mô hình AI (ONNX/CTranslate2/API).

    Mục tiêu:
        Giúp kiểm toán từng pipeline AI (Embedding, Reranker, Whisper ASR, Proctoring CV, CP-SAT, LLM)
        đang chạy ở chế độ model thật hay fallback.
    Liên kết luồng (Cross-layer):
        Bảo vệ bởi `verify_internal_api_key`; gọi trực tiếp `get_models_registry_status` trong `src/core/model_registry.py`.
    Đầu vào / Đầu ra:
        - Input: Header `X-Internal-Key`.
        - Output: Dict JSON thống kê số model sẵn sàng và thông số từng model cụ thể.
    """
    gemini_ready = is_valid_gemini_key(settings.GEMINI_API_KEY)
    return get_models_registry_status(gemini_configured=gemini_ready)
