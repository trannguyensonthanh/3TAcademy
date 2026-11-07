from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    ENV: str = Field(default="development")
    PORT: int = Field(default=8000)
    DATABASE_URL: str = Field(default="postgresql://edutech_user:edutech_secret_2026@localhost:5432/edutech_v2")
    REDIS_URL: str = Field(default="redis://localhost:6379")

    INTERNAL_API_KEY: str = Field(min_length=16)

    GEMINI_API_KEY: str = Field(default="")
    VLLM_API_BASE: str = Field(default="http://localhost:8001/v1")
    VLLM_API_KEY: str = Field(default="")

    LANGFUSE_PUBLIC_KEY: str = Field(default="")
    LANGFUSE_SECRET_KEY: str = Field(default="")
    LANGFUSE_HOST: str = Field(default="https://cloud.langfuse.com")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
