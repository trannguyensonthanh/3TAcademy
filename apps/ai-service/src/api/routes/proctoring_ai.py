from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...proctoring_cv.detector import analyze_exam_frame

proctoring_router = APIRouter(
    prefix="/api/v1/ai/proctoring",
    tags=["Two-Tier Edge-Cloud Proctoring CV (MediaPipe/YuNet + SolvePnP + YOLOv8n + Gemini Vision)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class AnalyzeProctoringFrameRequest(BaseModel):
    imageBase64: str = Field(..., min_length=32)
    escalateVlm: bool = Field(default=True)


@proctoring_router.post("/analyze-frame")
async def analyze_proctoring_frame_endpoint(req: AnalyzeProctoringFrameRequest):
    return await analyze_exam_frame(
        image_base64=req.imageBase64,
        escalate_vlm=req.escalateVlm,
    )
