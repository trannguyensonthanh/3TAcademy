"""Router API Giám sát Thi Trực tuyến bằng Thị giác Máy tính (AI Proctoring CV).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Frontend (`apps/web`) chụp ảnh webcam thí sinh định kỳ trong phòng thi và gửi lên Backend (`apps/api`).
- Backend chuyển tiếp ảnh dạng base64 sang endpoint `/api/v1/ai/proctoring/analyze-frame` tại đây.
- AI Service chạy pipeline Computer Vision 2 tầng (Edge local: MediaPipe/YuNet + SolvePnP 3D Head Pose +
  YOLOv8n ONNX phát hiện điện thoại/người lạ; Cloud Tier 2: leo thang xác minh bằng Gemini Vision khi có nghi vấn).

Liên kết chéo (Cross-layer):
- Được gọi trực tiếp từ `apps/api/src/modules/assessment/assessment.routes.ts` (dòng ~1463)
  qua `POST /api/v1/ai/proctoring/analyze-frame` với header `X-Internal-Key`.
- Chuyển xử lý sang `analyze_exam_frame()` trong `src/proctoring_cv/detector.py`.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...proctoring_cv.detector import analyze_exam_frame

# Khai báo router giám sát thi, yêu cầu xác thực khóa nội bộ `X-Internal-Key`.
proctoring_router = APIRouter(
    prefix="/api/v1/ai/proctoring",
    tags=["Two-Tier Edge-Cloud Proctoring CV (MediaPipe/YuNet + SolvePnP + YOLOv8n + Gemini Vision)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class AnalyzeProctoringFrameRequest(BaseModel):
    """Schema chứa ảnh chụp webcam thí sinh dạng base64 và cờ cho phép leo thang sang Cloud VLM."""

    imageBase64: str = Field(..., min_length=32)
    escalateVlm: bool = Field(default=True)


@proctoring_router.post("/analyze-frame")
async def analyze_proctoring_frame_endpoint(req: AnalyzeProctoringFrameRequest):
    """Phân tích một khung hình webcam phòng thi để phát hiện dấu hiệu gian lận theo kiến trúc Edge-Cloud 2 tầng.

    Mục tiêu:
        Xác định số khuôn mặt, góc xoay đầu 3D (Yaw/Pitch/Roll), vật thể cấm (điện thoại, người thứ hai, sách vở)
        và trả về điểm nghi vấn (`suspicionScore`) cùng loại sự kiện vi phạm (`eventType`) để Backend ghi log thi.
    Liên kết luồng (Cross-layer):
        - Nhận request từ `apps/api/src/modules/assessment/assessment.routes.ts`.
        - Gọi `analyze_exam_frame()` trong `src/proctoring_cv/detector.py`.
    Đầu vào / Đầu ra:
        - Input: JSON `{ "imageBase64": str, "escalateVlm": bool }`.
        - Output: Dict JSON kết quả giám sát (`engine`, `faceCount`, `headPose`, `prohibitedObjects`,
          `violationDetected`, `eventType`, `suspicionScore`, `vlmVerification`, `evidenceSummary`).
    """
    return await analyze_exam_frame(
        image_base64=req.imageBase64,
        escalate_vlm=req.escalateVlm,
    )
