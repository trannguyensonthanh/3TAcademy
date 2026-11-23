"""Quản lý cấu hình tập trung (Environment & Settings) cho AI Service.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Nạp tập trung toàn bộ biến môi trường của AI Service (PostgreSQL DSN, Redis URL, Internal API Key,
  Gemini API Key, vLLM endpoint, Langfuse keys) theo thứ tự ưu tiên từ monorepo root đến thư mục service.
- Cung cấp cơ chế fallback không phụ thuộc `pydantic-settings` giúp các script kiểm thử nhẹ hoặc môi trường
  thiếu thư viện vẫn nạp được cấu hình `.env` an toàn.

Liên kết chéo (Cross-layer):
- Được import bởi hầu hết các module trong `apps/ai-service/src/` (`main.py`, `core/db.py`, `core/security.py`,
  `core/llm_gateway.py`, `core/observability.py`, `worker/tasks.py`).
- Giá trị `INTERNAL_API_KEY` phải khớp tuyệt đối với `INTERNAL_API_KEY` trong `apps/api/src/config/env.ts`
  để Backend Express gọi được sang AI Service.
"""

import os
from pathlib import Path

# Xác định đường dẫn gốc của ai-service và gốc toàn bộ monorepo để dò tìm file `.env` đa cấp.
SERVICE_ROOT = Path(__file__).resolve().parents[2]
MONOREPO_ROOT = Path(__file__).resolve().parents[4]
ENV_FILE_CANDIDATES = (
    str(MONOREPO_ROOT / ".env"),
    str(MONOREPO_ROOT / "apps" / "api" / ".env"),
    str(SERVICE_ROOT / ".env"),
    ".env",
)


def is_valid_gemini_key(raw_key: str | None) -> bool:
    """Kiểm tra sơ bộ tính hợp lệ của khóa Gemini API trước khi gửi request ra cloud.

    Mục tiêu:
        Tránh gọi API Gemini thất bại vô ích khi người dùng quên điền key hoặc để nguyên giá trị mẫu (placeholder)
        trong file `.env`, từ đó kích hoạt sớm nhánh fallback cục bộ/heuristic.
    Liên kết luồng (Cross-layer):
        Được gọi bởi `src/main.py`, `src/core/llm_gateway.py`, `src/live_copilot/asr_whisper.py`,
        và `src/proctoring_cv/detector.py`.
    Đầu vào / Đầu ra:
        - Input: `raw_key` (chuỗi key thô lấy từ biến môi trường, có thể `None`).
        - Output: `True` nếu key đủ độ dài (>= 16 ký tự) và không mang tiền tố giữ chỗ; ngược lại `False`.
    """
    # Bước 1: Chuẩn hóa khoảng trắng và loại ngay chuỗi quá ngắn.
    key = (raw_key or "").strip()
    if len(key) < 16:
        return False
    # Bước 2: Từ chối các chuỗi mẫu thường gặp trong file `.env.example`.
    lowered = key.lower()
    if lowered.startswith(("your_", "your-", "placeholder", "change_me", "xxx")):
        return False
    return True


try:
    from pydantic import Field
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class Settings(BaseSettings):
        """Lớp cấu hình chuẩn sử dụng Pydantic BaseSettings để đọc & xác thực biến môi trường.

        Mục tiêu:
            Ánh xạ tự động biến môi trường sang thuộc tính có kiểm tra kiểu (type validation) và ràng buộc độ dài
            (ví dụ `INTERNAL_API_KEY` tối thiểu 16 ký tự để chống đặt khóa yếu).
        Liên kết luồng (Cross-layer):
            Khởi tạo singleton `settings` dùng chung trong toàn bộ tiến trình FastAPI và ARQ worker.
        """

        model_config = SettingsConfigDict(
            env_file=ENV_FILE_CANDIDATES,
            env_file_encoding="utf-8",
            extra="ignore",
        )

        ENV: str = Field(default="development")
        PORT: int = Field(default=8000)
        DATABASE_URL: str = Field(
            default="postgresql://edutech_user:edutech_secret_2026@localhost:54320/edutech_db"
        )
        REDIS_URL: str = Field(default="redis://localhost:63790")
        INTERNAL_API_KEY: str = Field(
            default="internal_shared_secret_2026", min_length=16
        )
        GEMINI_API_KEY: str = Field(default="")
        GEMINI_MODEL: str = Field(default="gemini-3.5-flash")
        VLLM_API_BASE: str = Field(default="http://localhost:8001/v1")
        VLLM_API_KEY: str = Field(default="")
        LANGFUSE_PUBLIC_KEY: str = Field(default="")
        LANGFUSE_SECRET_KEY: str = Field(default="")
        LANGFUSE_HOST: str = Field(default="https://cloud.langfuse.com")

    settings = Settings()

except ImportError:
    # Nhánh dự phòng khi môi trường chưa cài `pydantic-settings`: tự parse file `.env` thuần bằng Python stdlib.
    def _load_dotenv_fallback() -> None:
        """Đọc thủ công các file `.env` ứng viên và nạp vào `os.environ` nếu biến chưa tồn tại.

        Mục tiêu:
            Đảm bảo các module lõi vẫn khởi chạy được trong môi trường tối giản không có `pydantic-settings`.
        """
        # Bước 1: Duyệt từng đường dẫn file `.env` theo thứ tự ứng viên.
        for cand_str in ENV_FILE_CANDIDATES:
            candidate = Path(cand_str)
            if candidate.exists():
                # Bước 2: Tách từng dòng `KEY=VALUE`, bỏ qua dòng chú thích `#` và cắt dấu ngoặc bao quanh.
                for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                    ln = line.strip()
                    if ln and not ln.startswith("#") and "=" in ln:
                        k, v = ln.split("=", 1)
                        val = v.strip().strip('"').strip("'")
                        if val:
                            # Chỉ gán khi biến chưa có trong môi trường hệ điều hành (ưu tiên env thực tế).
                            os.environ.setdefault(k.strip(), val)

    _load_dotenv_fallback()

    class _FallbackSettings:
        """Bản sao giao diện của `Settings` đọc trực tiếp từ `os.environ` khi thiếu Pydantic."""

        ENV: str = os.environ.get("ENV", "development")
        PORT: int = int(os.environ.get("PORT", "8000"))
        DATABASE_URL: str = os.environ.get(
            "DATABASE_URL",
            "postgresql://edutech_user:edutech_secret_2026@localhost:54320/edutech_db",
        )
        REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:63790")
        INTERNAL_API_KEY: str = os.environ.get("INTERNAL_API_KEY", "internal_shared_secret_2026")
        GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
        GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
        VLLM_API_BASE: str = os.environ.get("VLLM_API_BASE", "http://localhost:8001/v1")
        VLLM_API_KEY: str = os.environ.get("VLLM_API_KEY", "")
        LANGFUSE_PUBLIC_KEY: str = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        LANGFUSE_SECRET_KEY: str = os.environ.get("LANGFUSE_SECRET_KEY", "")
        LANGFUSE_HOST: str = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

    settings = _FallbackSettings()  # type: ignore[assignment]
