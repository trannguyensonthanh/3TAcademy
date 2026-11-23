"""Quản lý Connection Pool bất đồng bộ (asyncpg) tới PostgreSQL + pgvector.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Cung cấp kết nối hiệu năng cao trực tiếp từ AI Service xuống PostgreSQL (cùng cơ sở dữ liệu với `apps/api`)
  để thực thi truy vấn Hybrid Search (pgvector HNSW + tsvector BM25) và lưu chỉ mục vector tri thức RAG.
- Sử dụng mẫu thiết kế Lazy Singleton Connection Pool để tái sử dụng kết nối TCP, tránh chi phí bắt tay (handshake)
  mỗi lần có request RAG.

Liên kết chéo (Cross-layer):
- Được gọi bởi `src/main.py` (`health_ready`, `lifespan` shutdown), `src/rag/retriever.py` (truy vấn vector/BM25),
  và `src/worker/tasks.py` (ghi chunk & embedding vào bảng `knowledge_chunks`).
- Kết nối tới PostgreSQL dựa trên `settings.DATABASE_URL` từ `src/core/config.py`.
"""

import asyncpg
from .config import settings
from .logging import logger

# Biến toàn cục giữ instance connection pool duy nhất trong tiến trình hiện tại.
pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Khởi tạo (nếu chưa có) và trả về PostgreSQL connection pool bất đồng bộ.

    Mục tiêu:
        Duy trì sẵn từ 2 đến 10 kết nối tới PostgreSQL, đặt giới hạn timeout 60 giây cho mỗi câu lệnh SQL
        để bảo vệ hệ thống trước truy vấn vector nặng bị treo.
    Liên kết luồng (Cross-layer):
        Được gọi bởi `src/rag/retriever.py`, `src/worker/tasks.py` và `src/main.py` (`/health/ready`).
    Đầu vào / Đầu ra:
        - Input: Không có tham số (đọc `settings.DATABASE_URL`).
        - Output: Đối tượng `asyncpg.Pool` sẵn sàng để mượn kết nối (`async with pool.acquire()`).
    """
    global pool
    # Bước 1: Kiểm tra lazy initialization — chỉ mở pool trong lần gọi đầu tiên.
    if pool is None:
        logger.info("Initializing asyncpg PostgreSQL pool")
        # Bước 2: Khởi tạo pool với dải kích thước tối ưu cho workload AI bất đồng bộ.
        pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
    return pool


async def close_db_pool():
    """Đóng an toàn toàn bộ kết nối trong PostgreSQL pool khi tắt dịch vụ.

    Mục tiêu:
        Giải phóng sạch các phiên kết nối DB khi FastAPI shutdown để tránh lỗi "too many connections" ở PostgreSQL.
    Liên kết luồng (Cross-layer):
        Được gọi trong khối shutdown của `lifespan()` tại `src/main.py`.
    Đầu vào / Đầu ra:
        - Input: Không có.
        - Output: `None` (reset biến toàn cục `pool = None`).
    """
    global pool
    if pool is not None:
        logger.info("Closing asyncpg PostgreSQL pool")
        await pool.close()
        pool = None

