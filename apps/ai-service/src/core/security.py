"""Lớp bảo mật xác thực gọi nội bộ (Service-to-Service Auth) cho AI Service.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- AI Service KHÔNG bao giờ được gọi trực tiếp từ trình duyệt Frontend (`apps/web`).
- Mọi endpoint AI đều bắt buộc đi qua Backend Express (`apps/api`), nơi đính kèm khóa bí mật chia sẻ
  trong HTTP header `X-Internal-Key`.
- Dependency `verify_internal_api_key` đóng vai trò chốt chặn xác thực ở tầng FastAPI trước khi vào xử lý AI.

Liên kết chéo (Cross-layer):
- Nhận header `X-Internal-Key` do `AiServiceClient.request()` trong
  `apps/api/src/integrations/aiService.client.ts` và `apps/api/src/modules/assessment/assessment.routes.ts` gửi sang.
- Được gắn vào `dependencies=[Depends(verify_internal_api_key)]` ở tất cả 6 router trong `src/api/routes/*`
  và các endpoint trạng thái trong `src/main.py`.
"""

import hmac
from fastapi import Header, HTTPException, status
from .config import settings


async def verify_internal_api_key(
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
):
    """Xác thực khóa nội bộ `X-Internal-Key` để đảm bảo chỉ Backend Express mới được gọi AI Service.

    Mục tiêu:
        Ngăn chặn truy cập trái phép từ bên ngoài vào các endpoint AI tốn tài nguyên GPU/API token.
        Sử dụng `hmac.compare_digest` (so sánh hằng thời gian — constant-time comparison) để phòng chống
        tấn công kênh kề theo thời gian (timing side-channel attack).
    Liên kết luồng (Cross-layer):
        Được FastAPI thực thi tự động trước mọi route handler có khai báo `Depends(verify_internal_api_key)`.
        So khớp giá trị header với `settings.INTERNAL_API_KEY` (`src/core/config.py`).
    Đầu vào / Đầu ra:
        - Input: `x_internal_key` trích xuất bắt buộc từ HTTP Header `X-Internal-Key`.
        - Output: Trả về `None` nếu hợp lệ; ném `HTTPException(401 Unauthorized)` nếu khóa sai.
    """
    # Ensure all AI-service endpoints are only callable by the internal Express API backend.
    # Uses timing-safe comparison to prevent side-channel timing attacks.
    # Bước 1: So sánh khóa bí mật theo thời gian hằng để kẻ tấn công không đo được độ dài tiền tố khớp.
    if not hmac.compare_digest(x_internal_key, settings.INTERNAL_API_KEY):
        # Bước 2: Từ chối ngay yêu cầu với mã 401 khi chứng thực dịch vụ nội bộ không hợp lệ.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service credentials",
        )
