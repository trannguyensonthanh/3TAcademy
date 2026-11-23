"""Router API cho Trợ lý Tư vấn Tuyển sinh (AI Advisor) và Gia sư Bài giảng (AI Session Tutor) theo kiến trúc CRAG.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Tiếp nhận câu hỏi từ người dùng (khách vãng lai hỏi tư vấn khóa học hoặc học viên đang xem video bài giảng)
  thông qua Backend Express.
- Đóng gói trạng thái ban đầu (initial state) và kích hoạt đồ thị tác tử 5 nút LangGraph CRAG
  (`execute_crag_agent` trong `src/rag/agent_graph.py`) để truy xuất, xếp hạng lại, kiểm chứng và sinh câu trả lời
  có trích dẫn nguồn (citations) chính xác.

Liên kết chéo (Cross-layer):
- Được gọi trực tiếp bởi `apps/api/src/integrations/aiService.client.ts`:
  + `aiServiceClient.askAdvisor()` -> `POST /api/v1/ai/advisor/ask`
  + `aiServiceClient.askSessionTutor()` -> `POST /api/v1/ai/tutor/ask`
- Gọi tiếp xuống `execute_crag_agent()` trong `src/rag/agent_graph.py`, vốn điều phối `retriever.py`,
  `reranker.py` và `llm_gateway.py`.
- Bảo vệ bởi `verify_internal_api_key` (`X-Internal-Key`).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...rag.agent_graph import execute_crag_agent

# Khai báo router `/api/v1/ai` với lớp xác thực nội bộ bắt buộc cho mọi endpoint RAG.
rag_chat_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["RAG Advisor & Course Tutor (LangGraph CRAG + Cross-Encoder)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class AdvisorAskRequest(BaseModel):
    """Schema yêu cầu hỏi đáp Tư vấn khóa học (phạm vi công khai `ADVISOR`)."""

    question: str = Field(..., min_length=2)


class TutorAskRequest(BaseModel):
    """Schema yêu cầu hỏi đáp Gia sư trong lớp học (phạm vi `TUTOR` gắn với `cohortId`, `sessionId` và thời điểm video)."""

    cohortId: int = Field(default=0)
    sessionId: int = Field(...)
    question: str = Field(..., min_length=2)
    currentVideoSec: int = Field(default=0)


@rag_chat_router.post("/advisor/ask")
async def ask_advisor(req: AdvisorAskRequest):
    """Endpoint AI Advisor: Tư vấn khóa học, lộ trình, học phí dựa trên tri thức công khai (CRAG).

    Mục tiêu:
        Trả lời câu hỏi tuyển sinh/lộ trình học tập có căn cứ từ bảng `courses`, `cohorts` và `knowledge_chunks`
        công khai, hạn chế ảo giác (hallucination) nhờ quy trình kiểm chứng 5 bước CRAG.
    Liên kết luồng (Cross-layer):
        - Được gọi từ `AiServiceClient.askAdvisor()` trong `apps/api/src/integrations/aiService.client.ts`.
        - Gọi `execute_crag_agent()` (`src/rag/agent_graph.py`) với `scope="ADVISOR"`.
    Đầu vào / Đầu ra:
        - Input: JSON `{ "question": str }`.
        - Output: JSON gồm `answerMd` (Markdown), `citations` (trích dẫn đã kiểm chứng), `rerankBackend`,
          `maxRelevanceScore`, và `agentTrace` (dấu vết thực thi từng node CRAG để minh giải).
    """
    # Bước 1: Khởi tạo state đầu vào cho phạm vi ADVISOR và chạy toàn bộ đồ thị 5 nút CRAG.
    final_state = await execute_crag_agent(
        {
            "scope": "ADVISOR",
            "original_question": req.question.strip(),
            "rewrite_count": 0,
            "trace": [],
        }
    )
    # Bước 2: Trả về câu trả lời Markdown cùng metadata kiểm chứng và trace cho Backend/Frontend.
    return {
        "answerMd": final_state.get("answer_md", ""),
        "citations": final_state.get("verified_citations", []),
        "rerankBackend": final_state.get("rerank_backend", "CALIBRATED_HYBRID_CROSS_SCORER"),
        "maxRelevanceScore": final_state.get("max_relevance_score", 0.0),
        "agentTrace": final_state.get("trace", []),
    }


@rag_chat_router.post("/tutor/ask")
async def ask_tutor(req: TutorAskRequest):
    """Endpoint AI Session Tutor: Gia sư giải đáp thắc mắc theo đúng buổi học & mốc giây video hiện tại.

    Mục tiêu:
        Truy xuất ngữ cảnh bài giảng có lọc quyền RBAC theo đúng khóa học/buổi học (`cohortId`, `sessionId`),
        ưu tiên đoạn transcript xung quanh `currentVideoSec` để giải thích bám sát bài học và gắn trích dẫn timestamp.
    Liên kết luồng (Cross-layer):
        - Được gọi từ `AiServiceClient.askSessionTutor()` trong `apps/api/src/integrations/aiService.client.ts`.
        - Gọi `execute_crag_agent()` (`src/rag/agent_graph.py`) với `scope="TUTOR"`.
    Đầu vào / Đầu ra:
        - Input: JSON `{ "cohortId": int, "sessionId": int, "question": str, "currentVideoSec": int }`.
        - Output: JSON gồm `answerMd`, `detectedTopic`, `citations` (có `startSec`/`endSec`/`pageNumber`),
          `rerankBackend`, `maxRelevanceScore`, `agentTrace`; trả HTTP 404 nếu `sessionId` không tồn tại.
    """
    # Bước 1: Kích hoạt CRAG Agent trong phạm vi TUTOR kèm thông tin ngữ cảnh buổi học và mốc thời gian video.
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
    # Bước 2: Nếu node Retrieve báo buổi học/khóa học không tồn tại trong DB, trả lỗi 404 rõ ràng cho Backend.
    if final_state.get("doc_grade") == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc khóa học")

    # Bước 3: Định dạng kết quả trả về cho giao diện Tutor bên cạnh video player.
    return {
        "answerMd": final_state.get("answer_md", ""),
        "detectedTopic": final_state.get("detected_topic", "Kiến thức bài giảng"),
        "citations": final_state.get("verified_citations", []),
        "rerankBackend": final_state.get("rerank_backend", "CALIBRATED_HYBRID_CROSS_SCORER"),
        "maxRelevanceScore": final_state.get("max_relevance_score", 0.0),
        "agentTrace": final_state.get("trace", []),
    }
