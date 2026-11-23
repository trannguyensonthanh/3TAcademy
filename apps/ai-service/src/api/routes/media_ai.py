"""Router API xử lý Media Bài giảng: Phiên âm giọng nói (ASR) + Phân chương tự động + Tóm tắt trích chọn (MMR).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Nhận đường dẫn file audio/video bài giảng (hoặc bản transcript gợi ý) từ Backend/Admin/Giảng viên.
- Kết hợp 2 mô-đun học máy trong `src/live_copilot/`:
  1. `asr_whisper.py`: Chuyển giọng nói thành văn bản (Faster-Whisper CTranslate2 INT8 + VAD -> fallback Gemini Audio)
     và tạo phụ đề chuẩn WebVTT.
  2. `topic_segmenter.py`: Phân đoạn chủ đề tự động theo độ dịch chuyển ngữ nghĩa Cosine (TextTiling Cosine-Shift)
     và trích chọn câu tóm tắt đại diện giảm trùng lặp bằng thuật toán MMR (Maximal Marginal Relevance).

Liên kết chéo (Cross-layer):
- Bảo vệ bởi `verify_internal_api_key` (`X-Internal-Key`), tiếp nhận yêu cầu nội bộ từ Backend (`apps/api`)
  hoặc công cụ xử lý bài giảng.
- Gọi sang `transcribe_media_pipeline()`, `segment_topics_cosine_shift()`, `summarize_extractive_mmr()`.
"""

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...live_copilot.asr_whisper import transcribe_media_pipeline
from ...live_copilot.topic_segmenter import (
    segment_topics_cosine_shift,
    summarize_extractive_mmr,
)

# Router nhóm chức năng phân tích bài giảng đa phương tiện (`/api/v1/ai/media`).
media_router = APIRouter(
    prefix="/api/v1/ai/media",
    tags=["Speech ASR (Faster-Whisper) & Extractive Lecture Intelligence"],
    dependencies=[Depends(verify_internal_api_key)],
)


class TranscribeSummarizeRequest(BaseModel):
    """Schema yêu cầu phiên âm, tạo phụ đề WebVTT, phân chương và tóm tắt bài giảng."""

    mediaPath: Optional[str] = None
    transcriptText: Optional[str] = None
    language: str = Field(default="vi")
    maxSummarySentences: int = Field(default=4, ge=1, le=10)


@media_router.post("/transcribe-and-summarize")
async def transcribe_and_summarize(req: TranscribeSummarizeRequest):
    """Chạy trọn bộ pipeline ASR -> Auto-Chapters (Cosine-Shift) -> Extractive Summary (MMR) cho một bài giảng.

    Mục tiêu:
        Biến video/audio bài giảng thô thành dữ liệu học tập có cấu trúc (phụ đề WebVTT có timestamp,
        mục lục chương tự động và tóm tắt các ý cốt lõi) giúp sinh viên tra cứu nhanh và phục vụ lập chỉ mục RAG.
    Liên kết luồng (Cross-layer):
        - Nhận gọi từ Backend `apps/api` qua endpoint `POST /api/v1/ai/media/transcribe-and-summarize`.
        - Gọi tuần tự `transcribe_media_pipeline()` (`asr_whisper.py`), `segment_topics_cosine_shift()` và
          `summarize_extractive_mmr()` (`topic_segmenter.py`).
    Đầu vào / Đầu ra:
        - Input: `TranscribeSummarizeRequest` (`mediaPath`, `transcriptText`, `language`, `maxSummarySentences`).
        - Output: Dict JSON gồm `asrEngine`, `language`, `vad`, `segments`, `vtt`, `autoChapters`, `extractiveSummary`.
    """
    # Bước 1: Phiên âm giọng nói thành danh sách các đoạn transcript có mốc thời gian (`startSec`, `endSec`) + chuỗi WebVTT.
    asr_res = await transcribe_media_pipeline(
        media_path=req.mediaPath,
        transcript_hint=req.transcriptText,
        language=req.language,
    )
    segments = asr_res["segments"]
    # Bước 2: Phát hiện điểm chuyển ý giữa các đoạn bằng độ tương đồng Cosine để sinh mục lục chương tự động.
    chapters = segment_topics_cosine_shift(segments)
    # Bước 3: Áp dụng thuật toán MMR trích chọn tối đa `maxSummarySentences` câu đại diện, giàu thông tin và ít lặp ý.
    mmr_summary = summarize_extractive_mmr(segments, max_sentences=req.maxSummarySentences)

    return {
        "asrEngine": asr_res["engine"],
        "language": asr_res["language"],
        "vad": asr_res["vad"],
        "segments": segments,
        "vtt": asr_res["vtt"],
        "autoChapters": chapters,
        "extractiveSummary": mmr_summary,
    }
