import asyncpg
from .config import settings
from .logging import logger

pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        logger.info("Initializing asyncpg PostgreSQL pool")
        pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
    return pool


async def close_db_pool():
    global pool
    if pool is not None:
        logger.info("Closing asyncpg PostgreSQL pool")
        await pool.close()
        pool = None
