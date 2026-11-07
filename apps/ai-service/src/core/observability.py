from langfuse import Langfuse
from .config import settings
from .logging import logger

langfuse: Langfuse | None = None


def get_langfuse() -> Langfuse | None:
    global langfuse
    if langfuse is None and settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
        try:
            langfuse = Langfuse(
                public_key=settings.LANGFUSE_PUBLIC_KEY,
                secret_key=settings.LANGFUSE_SECRET_KEY,
                host=settings.LANGFUSE_HOST,
            )
            logger.info("Langfuse observability client initialized")
        except Exception as e:
            logger.warning("Failed to initialize Langfuse", error=str(e))
    return langfuse

