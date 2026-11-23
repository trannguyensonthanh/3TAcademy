"""Tích hợp nền tảng giám sát LLM Observability (Langfuse) cho AI Service.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Cung cấp client Langfuse theo mẫu Lazy Singleton để truy vết (trace) prompt, độ trễ (latency),
  lượng token tiêu thụ và chi phí gọi mô hình AI trong các luồng RAG / Grading / Career.
- Hoạt động hoàn toàn tùy chọn (graceful degradation): nếu chưa cấu hình khóa Langfuse, hệ thống trả về `None`
  và vận hành bình thường không gián đoạn.

Liên kết chéo (Cross-layer):
- Đọc khóa cấu hình `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` từ `src/core/config.py`.
- Trạng thái cấu hình Langfuse cũng được báo cáo qua endpoint `/api/v1/ai/status` trong `src/main.py`.
"""

from langfuse import Langfuse
from .config import settings
from .logging import logger

# Biến toàn cục lưu giữ instance Langfuse client duy nhất sau khi khởi tạo.
langfuse: Langfuse | None = None


def get_langfuse() -> Langfuse | None:
    """Khởi tạo lười (lazy init) và trả về client Langfuse nếu đã cấu hình đủ cặp khóa.

    Mục tiêu:
        Bật tính năng theo dõi (tracing) các lời gọi LLM lên Langfuse mà không làm crash AI Service
        nếu môi trường dev chưa có key hoặc mạng tới Langfuse gặp sự cố.
    Liên kết luồng (Cross-layer):
        Đọc cấu hình từ `settings` (`src/core/config.py`) và ghi log qua `logger` (`src/core/logging.py`).
    Đầu vào / Đầu ra:
        - Input: Không có tham số.
        - Output: Instance `Langfuse` nếu cấu hình hợp lệ và khởi tạo thành công; ngược lại trả về `None`.
    """
    global langfuse
    # Bước 1: Chỉ khởi tạo một lần duy nhất khi có đủ cả public key và secret key.
    if langfuse is None and settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
        try:
            # Bước 2: Khởi tạo SDK Langfuse trỏ tới host được cấu hình (mặc định Langfuse Cloud hoặc self-host).
            langfuse = Langfuse(
                public_key=settings.LANGFUSE_PUBLIC_KEY,
                secret_key=settings.LANGFUSE_SECRET_KEY,
                host=settings.LANGFUSE_HOST,
            )
            logger.info("Langfuse observability client initialized")
        except Exception as e:
            # Bước 3: Bắt lỗi mềm (soft-fail) để lỗi công cụ giám sát không bao giờ chặn luồng AI chính.
            logger.warning("Failed to initialize Langfuse", error=str(e))
    return langfuse

