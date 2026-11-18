import os
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[2]
MONOREPO_ROOT = Path(__file__).resolve().parents[4]
ENV_FILE_CANDIDATES = (
    str(MONOREPO_ROOT / ".env"),
    str(MONOREPO_ROOT / "apps" / "api" / ".env"),
    str(SERVICE_ROOT / ".env"),
    ".env",
)


def is_valid_gemini_key(raw_key: str | None) -> bool:
    key = (raw_key or "").strip()
    if len(key) < 16:
        return False
    lowered = key.lower()
    if lowered.startswith(("your_", "your-", "placeholder", "change_me", "xxx")):
        return False
    return True


try:
    from pydantic import Field
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class Settings(BaseSettings):
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
        GEMINI_MODEL: str = Field(default="gemini-2.5-flash")
        VLLM_API_BASE: str = Field(default="http://localhost:8001/v1")
        VLLM_API_KEY: str = Field(default="")
        LANGFUSE_PUBLIC_KEY: str = Field(default="")
        LANGFUSE_SECRET_KEY: str = Field(default="")
        LANGFUSE_HOST: str = Field(default="https://cloud.langfuse.com")

    settings = Settings()

except ImportError:
    def _load_dotenv_fallback() -> None:
        for cand_str in ENV_FILE_CANDIDATES:
            candidate = Path(cand_str)
            if candidate.exists():
                for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                    ln = line.strip()
                    if ln and not ln.startswith("#") and "=" in ln:
                        k, v = ln.split("=", 1)
                        val = v.strip().strip('"').strip("'")
                        if val:
                            os.environ.setdefault(k.strip(), val)

    _load_dotenv_fallback()

    class _FallbackSettings:
        ENV: str = os.environ.get("ENV", "development")
        PORT: int = int(os.environ.get("PORT", "8000"))
        DATABASE_URL: str = os.environ.get(
            "DATABASE_URL",
            "postgresql://edutech_user:edutech_secret_2026@localhost:54320/edutech_db",
        )
        REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:63790")
        INTERNAL_API_KEY: str = os.environ.get("INTERNAL_API_KEY", "internal_shared_secret_2026")
        GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
        GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        VLLM_API_BASE: str = os.environ.get("VLLM_API_BASE", "http://localhost:8001/v1")
        VLLM_API_KEY: str = os.environ.get("VLLM_API_KEY", "")
        LANGFUSE_PUBLIC_KEY: str = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        LANGFUSE_SECRET_KEY: str = os.environ.get("LANGFUSE_SECRET_KEY", "")
        LANGFUSE_HOST: str = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

    settings = _FallbackSettings()  # type: ignore[assignment]
