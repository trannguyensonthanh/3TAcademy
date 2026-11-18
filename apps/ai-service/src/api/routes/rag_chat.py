from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...rag.agent_graph import execute_crag_agent

rag_chat_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["RAG Advisor & Course Tutor (LangGraph CRAG + Cross-Encoder)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class AdvisorAskRequest(BaseModel):
    question: str = Field(..., min_length=2)


class TutorAskRequest(BaseModel):
    cohortId: int = Field(default=0)
    sessionId: int = Field(...)
    question: str = Field(..., min_length=2)
    currentVideoSec: int = Field(default=0)


@rag_chat_router.post("/advisor/ask")
async def ask_advisor(req: AdvisorAskRequest):
    final_state = await execute_crag_agent(
        {
            "scope": "ADVISOR",
            "original_question": req.question.strip(),
            "rewrite_count": 0,
            "trace": [],
        }
    )
    return {
        "answerMd": final_state.get("answer_md", ""),
        "citations": final_state.get("verified_citations", []),
        "rerankBackend": final_state.get("rerank_backend", "CALIBRATED_HYBRID_CROSS_SCORER"),
        "maxRelevanceScore": final_state.get("max_relevance_score", 0.0),
        "agentTrace": final_state.get("trace", []),
    }


@rag_chat_router.post("/tutor/ask")
async def ask_tutor(req: TutorAskRequest):
    final_state = await execute_crag_agent(
        {
            "scope": "TUTOR",
            "original_question": req.question.strip(),
            "cohort_id": req.cohortId,
            "session_id": req.sessionId,
            "current_video_sec": req.currentVideoSec,
            "rewrite_count": 0,
            "trace": [],
        }
    )
    if final_state.get("doc_grade") == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc khóa học")

    return {
        "answerMd": final_state.get("answer_md", ""),
        "detectedTopic": final_state.get("detected_topic", "Kiến thức bài giảng"),
        "citations": final_state.get("verified_citations", []),
        "rerankBackend": final_state.get("rerank_backend", "CALIBRATED_HYBRID_CROSS_SCORER"),
        "maxRelevanceScore": final_state.get("max_relevance_score", 0.0),
        "agentTrace": final_state.get("trace", []),
    }
