import logging
from .config import settings

try:
    import structlog

    def setup_logging() -> None:
        is_dev = getattr(settings, "ENV", "development") != "production"
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
    logging.basicConfig(level=logging.INFO)
    _std_logger = logging.getLogger("edutech-ai")

    class _CompatLogger:
        def info(self, msg: str, **kw: object) -> None:
            _std_logger.info("%s %s", msg, kw if kw else "")

        def warning(self, msg: str, **kw: object) -> None:
            _std_logger.warning("%s %s", msg, kw if kw else "")

        def error(self, msg: str, **kw: object) -> None:
            _std_logger.error("%s %s", msg, kw if kw else "")

    def setup_logging() -> None:
        logging.basicConfig(level=logging.INFO)

    logger = _CompatLogger()
