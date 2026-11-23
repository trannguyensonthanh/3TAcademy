"""Cấu hình hệ thống ghi nhật ký có cấu trúc (Structured Logging) cho AI Service.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Cung cấp đối tượng `logger` thống nhất trên toàn bộ AI Service để ghi lại luồng chạy LLM, RAG, ASR, CV và Worker.
- Tự động chuyển đổi định dạng hiển thị: dễ đọc có màu trên Console khi chạy `development`, và chuẩn JSON máy đọc được
  (phục vụ ELK/Loki/Datadog) khi chạy `production`.
- Hỗ trợ fallback sang `logging` chuẩn của Python nếu chưa cài thư viện `structlog`.

Liên kết chéo (Cross-layer):
- `setup_logging()` được gọi một lần khi khởi động trong `lifespan()` tại `src/main.py`.
- Biến `logger` được import xuyên suốt các module `core/*`, `rag/*`, `live_copilot/*`, `proctoring_cv/*`, `worker/*`.
"""

import logging
from .config import settings

try:
    import structlog

    def setup_logging() -> None:
        """Thiết lập pipeline xử lý log của `structlog` dựa theo môi trường chạy (`ENV`).

        Mục tiêu:
            Tự động gắn context variables (như request ID), mức độ log, dấu thời gian ISO-8601 và
            chọn bộ kết xuất Console (dev) hoặc JSON (production).
        Liên kết luồng (Cross-layer):
            Được gọi ở bước đầu tiên trong `lifespan()` tại `src/main.py`.
        Đầu vào / Đầu ra:
            - Input: Không có (đọc `settings.ENV` từ `src/core/config.py`).
            - Output: `None` (cấu hình global cho `structlog` và `logging`).
        """
        # Bước 1: Xác định môi trường dev hay production để chọn renderer phù hợp.
        is_dev = getattr(settings, "ENV", "development") != "production"
        # Bước 2: Đăng ký chuỗi processor chuẩn hóa trường thông tin cho mọi bản ghi log.
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.dev.ConsoleRenderer() if is_dev else structlog.processors.JSONRenderer(),
            ],
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
        logging.basicConfig(level=logging.INFO)

    logger = structlog.get_logger()

except ImportError:
    # Nhánh tương thích khi chưa cài `structlog`: bọc standard `logging` để vẫn nhận được keyword arguments (`**kw`).
    logging.basicConfig(level=logging.INFO)
    _std_logger = logging.getLogger("edutech-ai")

    class _CompatLogger:
        """Lớp bọc tương thích API của `structlog` bằng module `logging` mặc định của Python."""

        def info(self, msg: str, **kw: object) -> None:
            """Ghi log mức INFO kèm cặp khóa-giá trị ngữ cảnh."""
            _std_logger.info("%s %s", msg, kw if kw else "")

        def warning(self, msg: str, **kw: object) -> None:
            """Ghi log mức WARNING kèm cặp khóa-giá trị ngữ cảnh."""
            _std_logger.warning("%s %s", msg, kw if kw else "")

        def error(self, msg: str, **kw: object) -> None:
            """Ghi log mức ERROR kèm cặp khóa-giá trị ngữ cảnh."""
            _std_logger.error("%s %s", msg, kw if kw else "")

    def setup_logging() -> None:
        """Cấu hình mức log cơ bản INFO khi chạy ở chế độ fallback không có `structlog`."""
        logging.basicConfig(level=logging.INFO)

    logger = _CompatLogger()
