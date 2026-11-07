import hmac
from fastapi import Header, HTTPException, status
from .config import settings


async def verify_internal_api_key(
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
):
    """
    Ensure all AI-service endpoints are only callable by the internal Express API backend.
    Uses timing-safe comparison to prevent side-channel timing attacks.
    """
    if not hmac.compare_digest(x_internal_key, settings.INTERNAL_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service credentials",
        )
