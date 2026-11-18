from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...live_copilot.asr_whisper import transcribe_media_pipeline
from ...live_copilot.topic_segmenter import (
    segment_topics_cosine_shift,
    summarize_extractive_mmr,
)

media_router = APIRouter(
    prefix="/api/v1/ai/media",
    tags=["Speech ASR (Faster-Whisper) & Extractive Lecture Intelligence"],
    dependencies=[Depends(verify_internal_api_key)],
)


class TranscribeSummarizeRequest(BaseModel):
    mediaPath: Optional[str] = None
    transcriptText: Optional[str] = None
    language: str = Field(default="vi")
    maxSummarySentences: int = Field(default=4, ge=1, le=10)


@media_router.post("/transcribe-and-summarize")
async def transcribe_and_summarize(req: TranscribeSummarizeRequest):
    asr_res = await transcribe_media_pipeline(
        media_path=req.mediaPath,
        transcript_hint=req.transcriptText,
        language=req.language,
    )
    segments = asr_res["segments"]
    chapters = segment_topics_cosine_shift(segments)
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
