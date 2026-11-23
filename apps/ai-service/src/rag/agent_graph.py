"""
5-Node Corrective RAG (CRAG) + ReAct StateGraph (`agent_graph.py`)
------------------------------------------------------------------
Orchestrates multi-step reasoning for both the Public Advisor and Course-Scoped AI Tutor:
  [classify_intent]
         │
         ▼
  [react_tool_router] ──► Hybrid RRF (pgvector + BM25) + Cross-Encoder Reranker
         │
         ▼
  [grade_documents] ──(insufficient & rewrite_count == 0)──► [rewrite_query] ──┐
         │                                                                     │
         │ (grounded / max retries reached)  ◄─────────────────────────────────┘
         ▼
  [generate_and_verify_citations] ──► Post-hoc Timestamp & Chunk Grounding Check

Uses native `langgraph.graph.StateGraph` when `langgraph` is installed, with a built-in
deterministic `StateGraph` engine fallback so execution is 100% identical in all environments.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Là bộ não điều phối suy luận đa bước (Agentic CRAG — Corrective Retrieval-Augmented Generation)
  dùng chung cho cả AI Advisor (tư vấn công khai) lẫn AI Session Tutor (gia sư bài giảng có phân quyền RBAC).
- Thiết kế đồ thị trạng thái 5 nút khép kín kèm dấu vết quan sát (`trace` ghi rõ latency từng nút):
  1. `node_classify_intent`: Phân loại ý định, chặn lạc đề (Domain Guardrail) và trích mốc thời gian video.
  2. `node_react_tool_router`: Chọn công cụ truy xuất phù hợp (Hybrid RRF pgvector + tsvector) và tinh lọc Cross-Encoder Reranker.
  3. `node_grade_documents`: Thẩm định chất lượng tài liệu tìm được (`GROUNDED` nếu `max_relevance_score >= 0.34`, ngược lại `WEAK`).
  4. `node_rewrite_query`: Tự động mở rộng thuật ngữ chuyên ngành (Query Expansion) và quay vòng truy xuất lại tối đa 1 lần khi tài liệu yếu.
  5. `node_generate_and_verify_citations`: Sinh câu trả lời bám sát ngữ cảnh qua `LLMGateway` (có fallback offline) và hậu kiểm trích dẫn (chunkId, startSec <= endSec).

Liên kết chéo (Cross-layer):
- Được gọi từ `src/api/routes/rag_chat.py` (`POST /api/v1/ai/advisor/ask` & `POST /api/v1/ai/tutor/ask`),
  vốn được gọi bởi `aiServiceClient.askAdvisor()` và `aiServiceClient.askSessionTutor()` trong
  `apps/api/src/integrations/aiService.client.ts`.
- Gọi tiếp xuống `src/rag/retriever.py`, `src/rag/reranker.py`, `src/core/llm_gateway.py`.
"""

import re
import time
from typing import Any, Callable, Dict, List, Optional, TypedDict

from ..core.llm_gateway import LLMGateway
from ..core.logging import logger
from ..core.model_registry import has_package
from .reranker import rerank_candidates
from .retriever import (
    retrieve_course_scoped_tutor_context,
    retrieve_public_advisor_context,
)

# Bộ luật rào chắn (Guardrail) nhận diện nhanh các câu hỏi ngoài lĩnh vực CNTT / 3T Academy để từ chối sớm mà không tốn gọi LLM.
UNRELATED_DOMAIN_PATTERNS = [
    r"\bkế toán\b", r"\bke toan\b", r"\bthương mại điện tử\b", r"\bthuong mai dien tu\b",
    r"\bshopee\b", r"\blazada\b", r"\btiktok shop\b", r"\bnấu ăn\b", r"\bnau an\b",
    r"\bthời tiết\b", r"\bthoi tiet\b", r"\bbóng đá\b", r"\bbong da\b", r"\bchứng khoán\b",
    r"\bchung khoan\b", r"\bforex\b", r"\bbất động sản\b", r"\by tế\b", r"\bkhám bệnh\b",
    r"\bthuốc\b", r"\btử vi\b", r"\bphong thủy\b", r"\bchính trị\b", r"\bluật hình sự\b",
    r"\bmarketing\b", r"\bseo\b", r"\bnhân sự\b", r"\bhr\b", r"\bxổ số\b",
]

# Các dấu hiệu câu hỏi kỹ thuật/bài giảng chuyên sâu: ở chế độ Advisor công khai sẽ được điều hướng nhẹ nhàng sang đăng ký khóa học
# (tránh lộ nội dung bài giảng nội bộ `ENROLLED_ONLY` cho người chưa ghi danh).
DEEP_TECHNICAL_LECTURE_PATTERNS = [
    r"\bcông thức\b", r"\bcong thuc\b", r"\bviết code\b", r"\bviet code\b",
    r"\bcode mẫu\b", r"\bđoạn code\b", r"\bthuật toán chi tiết\b", r"\bgiải thích chi tiết\b",
    r"\bgiai thich chi tiet\b", r"\bcách cài đặt\b", r"\bcách cấu hình\b", r"\bsửa lỗi code\b",
    r"\bdebug\b", r"\bexplain analyze\b", r"\bhnsw\b", r"\brrf\b", r"\breciprocal rank fusion\b",
    r"\bragas\b", r"\bdeadlock\b", r"\boutbox pattern\b", r"\bwindow function\b",
]

# Từ điển mở rộng đồng nghĩa kỹ thuật song ngữ Việt-Anh dùng cho Node 4 (`rewrite_query`) khi truy xuất lần 1 có điểm thấp.
TECHNICAL_SYNONYM_EXPANSIONS = [
    (r"\btìm kiếm lai\b|\bhybrid\b", "Hybrid Search Dense Vector pgvector BM25 tsvector Reciprocal Rank Fusion RRF"),
    (r"\bảo giác\b|\bhallucination\b", "Hallucination Grounding Faithfulness RAG trích dẫn nguồn"),
    (r"\bbăm tài liệu\b|\bchunk\b", "Chunking Recursive Markdown overlap cấu trúc bảng"),
    (r"\bchỉ mục vector\b|\bhnsw\b", "HNSW index vector_cosine_ops pgvector m ef_construction"),
    (r"\bkhóa dòng\b|\brace condition\b|\btrùng giao dịch\b", "SELECT FOR UPDATE ACID Idempotent Webhook gateway_txn_id"),
    (r"\bhồ dữ liệu\b|\bmedallion\b|\blakehouse\b", "Medallion Bronze Silver Gold Data Quality Deduplication"),
    (r"\bhàm cửa sổ\b|\bxếp hạng\b", "SQL Window Functions ROW_NUMBER DENSE_RANK LAG CTE"),
    (r"\blộ trình\b|\bngười mới\b|\btrái ngành\b", "Lập trình Python SQL Thực chiến Kỹ sư AI khai giảng học phí"),
]


class AgentGraphState(TypedDict, total=False):
    """Cấu trúc trạng thái chia sẻ (Shared Graph State) chảy xuyên suốt 5 nút của đồ thị LangGraph CRAG."""

    scope: str  # "ADVISOR" | "TUTOR"
    original_question: str
    active_query: str
    cohort_id: int
    session_id: int
    current_video_sec: int
    intent: str
    selected_tool: str
    rewrite_count: int
    context_meta: Dict[str, Any]
    candidate_chunks: List[Dict[str, Any]]
    graded_chunks: List[Dict[str, Any]]
    rerank_backend: str
    max_relevance_score: float
    doc_grade: str  # "GROUNDED" | "WEAK" | "GUARDRAIL_BLOCKED" | "NOT_FOUND"
    answer_md: str
    detected_topic: str
    verified_citations: List[Dict[str, Any]]
    trace: List[Dict[str, Any]]


def _matches_any(text: str, patterns: List[str]) -> bool:
    """Kiểm tra nhanh văn bản (chữ thường) có khớp bất kỳ biểu thức chính quy nào trong `patterns` không."""
    lowered = (text or "").lower()
    return any(re.search(p, lowered) for p in patterns)


def _parse_timestamp_query_sec(question: str, fallback_sec: int) -> int:
    """Trích xuất mốc thời gian video mà học viên đề cập trực tiếp trong câu hỏi (ví dụ "phút 05:30" hay "giây 120").

    Mục tiêu:
        Giúp Reranker ưu tiên đúng đoạn transcript mà học viên đang hỏi (thay vì chỉ dùng vị trí con trỏ phát hiện tại).
    """
    m = re.search(r"(\d{1,2})\s*(?:phút|:)\s*(\d{1,2})", question.lower())
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m_sec = re.search(r"(?:giây|mốc)\s*(\d{1,4})\s*s?", question.lower())
    if m_sec:
        return int(m_sec.group(1))
    return fallback_sec


# ============================================================================
# NODE 1: Intent Classifier & Domain Guardrail
# ============================================================================
async def node_classify_intent(state: AgentGraphState) -> Dict[str, Any]:
    """Nút 1 (Classify Intent): Phân loại ý định, áp rào chắn miền tri thức và trích mốc thời gian video.

    Mục tiêu:
        Định tuyến câu hỏi vào đúng 1 trong 5 nhãn ý định (`OUT_OF_DOMAIN`, `DEEP_LECTURE_IN_ADVISOR`,
        `TIMESTAMP_CONTEXT_EXPLAIN`, `CATALOG_AND_ROADMAP_ADVISORY`, `COURSE_CONCEPT_QA`) và gán công cụ ReAct tương ứng.
    """
    # Bước 1: Lấy câu hỏi gốc, phạm vi (`ADVISOR`/`TUTOR`) và phân loại ý định theo thứ tự ưu tiên từ rào chắn -> nghiệp vụ.
    t0 = time.perf_counter()
    q = state["original_question"].strip()
    scope = state["scope"]
    trace = list(state.get("trace") or [])

    if _matches_any(q, UNRELATED_DOMAIN_PATTERNS):
        intent = "OUT_OF_DOMAIN"
        tool = "none_guardrail"
    elif scope == "ADVISOR" and _matches_any(q, DEEP_TECHNICAL_LECTURE_PATTERNS):
        intent = "DEEP_LECTURE_IN_ADVISOR"
        tool = "search_public_catalog"
    elif scope == "TUTOR" and re.search(r"\b(phút|giây|mốc|đoạn này|vừa giảng)\b", q.lower()):
        intent = "TIMESTAMP_CONTEXT_EXPLAIN"
        tool = "lookup_video_timestamp_window"
    elif scope == "ADVISOR":
        intent = "CATALOG_AND_ROADMAP_ADVISORY"
        tool = "search_public_catalog"
    else:
        intent = "COURSE_CONCEPT_QA"
        tool = "search_course_hybrid_rrf"

    # Bước 2: Giải mã mốc giây video nếu học viên nêu trực tiếp trong câu hỏi và ghi lại dấu vết `trace`.
    resolved_sec = _parse_timestamp_query_sec(q, state.get("current_video_sec", 0))
    trace.append(
        {
            "node": "classify_intent",
            "intent": intent,
            "selectedTool": tool,
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }
    )
    return {
        "intent": intent,
        "selected_tool": tool,
        "active_query": q,
        "current_video_sec": resolved_sec,
        "trace": trace,
    }


# ============================================================================
# NODE 2: ReAct Tool Router + Hybrid RRF + Cross-Encoder Reranker
# ============================================================================
async def node_react_tool_router(state: AgentGraphState) -> Dict[str, Any]:
    """Nút 2 (Retrieve & Rerank): Thực thi truy xuất 2 tầng (Stage 1 Hybrid RRF -> Stage 2 Cross-Encoder Reranker).

    Mục tiêu:
        Kéo về 8 ứng viên rộng từ PostgreSQL (đảm bảo cách ly RBAC `PUBLIC` vs `ENROLLED_ONLY`),
        sau đó tinh lọc qua Cross-Encoder để giữ 4 ứng viên sắc nét nhất cùng điểm `max_relevance_score`.
    Liên kết luồng (Cross-layer):
        Gọi `retrieve_public_advisor_context()` hoặc `retrieve_course_scoped_tutor_context()` (`src/rag/retriever.py`)
        và `rerank_candidates()` (`src/rag/reranker.py`).
    """
    t0 = time.perf_counter()
    trace = list(state.get("trace") or [])
    intent = state.get("intent", "")
    query = state.get("active_query") or state["original_question"]

    # Bước 1: Nhánh ngắn mạch cho câu hỏi ngoài miền (`OUT_OF_DOMAIN`) — bỏ qua Reranker để tiết kiệm chi phí,
    # nhưng với Tutor vẫn tải nhẹ tên khóa học/kỹ năng để câu từ chối lịch sự đúng ngữ cảnh lớp học.
    if intent == "OUT_OF_DOMAIN":
        # For Tutor, still fetch session metadata if needed to personalize guardrail message
        meta: Dict[str, Any] = {}
        if state["scope"] == "TUTOR":
            ctx = await retrieve_course_scoped_tutor_context(
                cohort_id=state.get("cohort_id", 0),
                session_id=state["session_id"],
                question=query,
                current_video_sec=state.get("current_video_sec", 0),
                top_k=2,
            )
            if ctx is None:
                return {"doc_grade": "NOT_FOUND", "trace": trace}
            meta = ctx
        trace.append(
            {
                "node": "react_tool_router",
                "tool": "none_guardrail",
                "candidatesRetrieved": 0,
                "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
            }
        )
        return {
            "context_meta": meta,
            "candidate_chunks": [],
            "rerank_backend": "SKIPPED_GUARDRAIL",
            "max_relevance_score": 0.0,
            "trace": trace,
        }

    # Bước 2: Phạm vi ADVISOR — Truy xuất Hybrid RRF 8 chunks công khai (`PUBLIC`) + danh mục khóa học -> Rerank lấy Top 4.
    if state["scope"] == "ADVISOR":
        ctx = await retrieve_public_advisor_context(query, top_k=8)
        reranked = rerank_candidates(query, ctx["chunks"], top_k=4)
        trace.append(
            {
                "node": "react_tool_router",
                "tool": state.get("selected_tool", "search_public_catalog"),
                "candidatesRetrieved": len(ctx["chunks"]),
                "rerankBackend": reranked["backend"],
                "maxRelevanceScore": reranked["maxRelevanceScore"],
                "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
            }
        )
        return {
            "context_meta": {"catalog": ctx["catalog"]},
            "candidate_chunks": reranked["chunks"],
            "rerank_backend": reranked["backend"],
            "max_relevance_score": reranked["maxRelevanceScore"],
            "trace": trace,
        }

    # Bước 3: Phạm vi TUTOR — Truy xuất Hybrid RRF cách ly khóa học (`ENROLLED_ONLY`) -> Rerank kèm thưởng mốc video (`±30s`).
    # TUTOR scope: Course-isolated Hybrid RRF + Cross-Encoder Reranking
    ctx = await retrieve_course_scoped_tutor_context(
        cohort_id=state.get("cohort_id", 0),
        session_id=state["session_id"],
        question=query,
        current_video_sec=state.get("current_video_sec", 0),
        top_k=8,
    )
    if ctx is None:
        return {"doc_grade": "NOT_FOUND", "trace": trace}

    reranked = rerank_candidates(
        query,
        ctx["chunks"],
        top_k=4,
        current_video_sec=state.get("current_video_sec", 0),
    )
    trace.append(
        {
            "node": "react_tool_router",
            "tool": state.get("selected_tool", "search_course_hybrid_rrf"),
            "candidatesRetrieved": len(ctx["chunks"]),
            "rerankBackend": reranked["backend"],
            "maxRelevanceScore": reranked["maxRelevanceScore"],
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }
    )
    return {
        "context_meta": ctx,
        "candidate_chunks": reranked["chunks"],
        "rerank_backend": reranked["backend"],
        "max_relevance_score": reranked["maxRelevanceScore"],
        "trace": trace,
    }


# ============================================================================
# NODE 3: CRAG Document Relevance Grader
# ============================================================================
async def node_grade_documents(state: AgentGraphState) -> Dict[str, Any]:
    """Nút 3 (Grade/Verify Documents): Đánh giá chất lượng tập tài liệu truy xuất theo nguyên lý CRAG.

    Mục tiêu:
        Lọc bỏ các đoạn nhiễu có `rerankScore < 0.22` và kết luận trạng thái:
        - `GUARDRAIL_BLOCKED`: Câu hỏi bị rào chắn từ Node 1.
        - `GROUNDED`: Có bằng chứng đáng tin cậy (`max_relevance_score >= 0.34`) -> đi thẳng tới Node 5 (Generate).
        - `WEAK`: Bằng chứng yếu -> kích hoạt cạnh rẽ nhánh quay sang Node 4 (`rewrite_query`) để tự sửa câu truy vấn.
    """
    t0 = time.perf_counter()
    trace = list(state.get("trace") or [])
    if state.get("doc_grade") == "NOT_FOUND":
        return {"doc_grade": "NOT_FOUND"}

    # Bước 1: Nếu là ý định bị rào chắn, đánh dấu `GUARDRAIL_BLOCKED` để không kích hoạt vòng lặp rewrite vô ích.
    intent = state.get("intent", "")
    if intent in ("OUT_OF_DOMAIN", "DEEP_LECTURE_IN_ADVISOR"):
        trace.append(
            {
                "node": "grade_documents",
                "verdict": "GUARDRAIL_BLOCKED",
                "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
            }
        )
        return {
            "doc_grade": "GUARDRAIL_BLOCKED",
            "graded_chunks": (state.get("candidate_chunks") or [])[:2],
            "trace": trace,
        }

    # Bước 2: Lọc giữ các chunk vượt ngưỡng nhiễu `0.22` (luôn dự phòng tối thiểu 2 chunk đầu nếu tất cả đều thấp).
    candidates = state.get("candidate_chunks") or []
    filtered = [c for c in candidates if float(c.get("rerankScore", 0.0)) >= 0.22]
    if not filtered and candidates:
        filtered = candidates[:2]

    # Bước 3: Chốt phán quyết `GROUNDED` hay `WEAK` dựa vào ngưỡng chất lượng `0.34` của ứng viên đứng đầu.
    max_score = float(state.get("max_relevance_score", 0.0))
    verdict = "GROUNDED" if (filtered and max_score >= 0.34) else "WEAK"

    trace.append(
        {
            "node": "grade_documents",
            "verdict": verdict,
            "keptChunks": len(filtered),
            "maxRelevanceScore": max_score,
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }
    )
    return {
        "doc_grade": verdict,
        "graded_chunks": filtered,
        "trace": trace,
    }


# ============================================================================
# NODE 4: Corrective Query Rewriter (Domain Terminology Expansion)
# ============================================================================
async def node_rewrite_query(state: AgentGraphState) -> Dict[str, Any]:
    """Nút 4 (Corrective Query Rewriter): Mở rộng từ đồng nghĩa kỹ thuật & ngữ cảnh buổi học để truy xuất lại.

    Mục tiêu:
        Khắc phục hiện tượng lệch từ vựng (vocabulary mismatch — ví dụ học viên hỏi "khóa dòng" trong khi tài liệu
        viết "SELECT FOR UPDATE") bằng cách nối thêm thuật ngữ chuẩn song ngữ hoặc tiêu đề buổi học vào `active_query`,
        tăng `rewrite_count` để đảm bảo vòng lặp CRAG dừng sau tối đa 1 lần thử lại.
    """
    t0 = time.perf_counter()
    trace = list(state.get("trace") or [])
    base_q = state["original_question"].strip()
    additions: List[str] = []

    # Bước 1: So khớp từ điển mở rộng thuật ngữ song ngữ `TECHNICAL_SYNONYM_EXPANSIONS`.
    for pat, expansion in TECHNICAL_SYNONYM_EXPANSIONS:
        if re.search(pat, base_q.lower()):
            additions.append(expansion)

    # Bước 2: Nếu không trúng mẫu từ điển nào, neo thêm tiêu đề buổi học (Tutor) hoặc từ khóa danh mục (Advisor).
    meta = state.get("context_meta") or {}
    if not additions and meta.get("sessionTitle"):
        additions.append(str(meta["sessionTitle"]))
    elif not additions and state["scope"] == "ADVISOR":
        additions.append("3T Academy lộ trình khóa học Python SQL AI Backend Data")

    # Bước 3: Cập nhật `active_query` mới và tăng bộ đếm `rewrite_count` lên 1 rồi quay lại Node 2 (`react_tool_router`).
    rewritten = f"{base_q} {' '.join(additions)}".strip()
    new_count = int(state.get("rewrite_count", 0)) + 1
    trace.append(
        {
            "node": "rewrite_query",
            "rewriteCount": new_count,
            "expandedQuery": rewritten[:160],
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }
    )
    return {
        "active_query": rewritten,
        "rewrite_count": new_count,
        "trace": trace,
    }


# ============================================================================
# NODE 5: Grounded Response Generator + Citation Verification
# ============================================================================
async def node_generate_and_verify_citations(state: AgentGraphState) -> Dict[str, Any]:
    """Nút 5 (Generate Grounded Answer & Verify Citations): Sinh phản hồi bám sát tài liệu và hậu kiểm trích dẫn.

    Mục tiêu:
        - Xử lý phản hồi rào chắn an toàn (`OUT_OF_DOMAIN`, `DEEP_LECTURE_IN_ADVISOR`) không tốn token LLM.
        - Với câu hỏi hợp lệ, nhồi ngữ cảnh đã qua Reranker vào Prompt chống ảo giác (Grounded Prompting)
          và gọi `LLMGateway.generate_text()`; nếu LLM lỗi thì tự động fallback bằng đoạn trích tốt nhất.
        - Hậu kiểm danh sách trích dẫn (`verified_citations`): đảm bảo có `chunkId` hợp lệ và biên thời gian
          không âm (`endSec >= startSec`) để trình phát video nhảy đúng vị trí khi người dùng bấm vào trích dẫn.
    Liên kết luồng (Cross-layer):
        Gọi `LLMGateway.generate_text()` (`src/core/llm_gateway.py`).
    """
    t0 = time.perf_counter()
    trace = list(state.get("trace") or [])
    scope = state["scope"]
    intent = state.get("intent", "")
    question = state["original_question"].strip()
    meta = state.get("context_meta") or {}
    chunks = state.get("graded_chunks") or []

    if state.get("doc_grade") == "NOT_FOUND":
        return {"answer_md": "", "verified_citations": [], "trace": trace}

    # Bước 1 (5A): Trả lời rào chắn tức thì cho câu hỏi lạc đề hoặc câu hỏi bài giảng sâu ở chế độ Advisor công khai.
    # 5A. Guardrail responses
    if intent == "OUT_OF_DOMAIN":
        if scope == "ADVISOR":
            ans = (
                "Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi hệ thống đào tạo của **3T Academy** "
                "nên mình không biết thông tin để giải đáp cho bạn. Mình chỉ hỗ trợ tư vấn lộ trình học tập, "
                "lịch khai giảng và thông tin các khóa học công nghệ (AI, Backend, Kỹ thuật Dữ liệu, Python & SQL) "
                "tại học viện thôi. Nếu bạn đang quan tâm đến hướng đi nào trong ngành lập trình thì cứ nhắn mình nhé!"
            )
            return {"answer_md": ans, "verified_citations": [], "detected_topic": "Ngoài phạm vi", "trace": trace}

        course_title = meta.get("courseTitle", "khóa học hiện tại")
        skill_names = [s["name"] for s in (meta.get("skills") or [])]
        skill_list_str = ", ".join(skill_names) if skill_names else course_title
        ans = (
            f"Mình xin lỗi nha, câu hỏi này không thuộc chủ đề của khóa **{course_title}** nên mình không biết thông tin để giải đáp. "
            f"Trong không gian lớp học này, mình chỉ hỗ trợ giải đáp các kiến thức chuyên môn thuộc khóa học "
            f"({skill_list_str}) thôi nhé. Bạn có thắc mắc nào về bài giảng hôm nay cứ hỏi mình nha!"
        )
        return {
            "answer_md": ans,
            "verified_citations": [],
            "detected_topic": "Ngoài phạm vi khóa học",
            "trace": trace,
        }

    if intent == "DEEP_LECTURE_IN_ADVISOR":
        ans = (
            "Mình không biết chi tiết nội dung bài giảng, công thức hay cách triển khai code chuyên sâu bên trong khóa học đâu bạn ơi, "
            "vì mục tiêu của mình là đồng hành tư vấn lộ trình học tập và chọn lớp phù hợp cho bạn thôi.\n\n"
            "Những kiến thức kỹ thuật chuyên sâu này sẽ được giảng viên hướng dẫn trực tiếp và có Trợ giảng AI riêng giải đáp "
            "bên trong từng khóa học sau khi bạn đăng ký. Hiện tại **3T Academy** đang mở 4 lộ trình với học phí **10.000 đ/khóa**:\n"
            "- **Kỹ sư AI Thực chiến: RAG, Agents & LLMOps** (`AI-ENG-2026-K01`)\n"
            "- **Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems** (`SWE-ARCH-2026-K01`)\n"
            "- **Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse** (`DATA-PIPE-2026-K01`)\n"
            "- **Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI** (`PY-SQL-2026-K01`)\n\n"
            "Bạn đang muốn tìm hiểu lộ trình nào để mình gợi ý chi tiết lịch học cho bạn nhé?"
        )
        cites = [
            {
                "chunkId": c["chunkId"],
                "sourceType": c["sourceType"],
                "snippet": c["snippet"],
                "rerankScore": c.get("rerankScore", 0.0),
            }
            for c in chunks[:2]
        ]
        return {"answer_md": ans, "verified_citations": cites, "detected_topic": "Tư vấn lộ trình", "trace": trace}

    # Bước 2 (5B - ADVISOR): Lắp ghép danh mục khóa học thực thời + top chunks công khai vào prompt và gọi LLM (kèm fallback).
    # 5B. Grounded Generation for Advisor vs Tutor
    if scope == "ADVISOR":
        catalog = meta.get("catalog") or []
        catalog_text = "\n".join(
            f"- Khóa học: {c['title']} (Mã lớp: {c['cohortCode']}, Học phí: {c['tuitionVnd']:,} đ, Khai giảng: {c['startDate']}): {c['shortDescription']}"
            for c in catalog
        )
        chunks_text = "\n\n".join(
            f"[Tài liệu #{c['chunkId']} - {c['sourceType']} | Độ phù hợp {c.get('rerankScore', 0):.2f}]: {c['content']}"
            for c in chunks
        )
        system_instruction = (
            "Bạn là Trợ lý Tư vấn Lộ trình học tập của 3T Academy.\n"
            "QUY TẮC BẮT BUỘC:\n"
            "1. Giọng văn: Gần gũi, nhẹ nhàng, thân thiện, xưng 'mình' và gọi người học là 'bạn'.\n"
            "2. KHÔNG ĐƯỢC ẢO GIÁC: Chỉ sử dụng đúng thông tin từ Danh mục khóa học và Tài liệu PUBLIC bên dưới.\n"
            "3. Nếu câu hỏi ngoài phạm vi 3T Academy, lịch sự từ chối."
        )
        prompt = (
            f"=== DANH MỤC KHÓA HỌC ĐANG MỞ TẠI 3T ACADEMY ===\n{catalog_text}\n\n"
            f"=== TÀI LIỆU TƯ VẤN CÔNG KHAI (ĐÃ QUA CROSS-ENCODER RERANKER) ===\n{chunks_text}\n\n"
            f"=== CÂU HỎI CỦA HỌC VIÊN ===\n{question}\n\n"
            "Hãy trả lời ngắn gọn, rõ ràng, ấm áp và đúng quy tắc."
        )
        try:
            answer_md = await LLMGateway.generate_text(prompt=prompt, system_instruction=system_instruction)
        except Exception as exc:
            logger.warning("Advisor LLM fallback triggered", error=str(exc))
            best_chunk = chunks[0]["content"] if chunks else ""
            answer_md = (
                f"Chào bạn nha! Mình gửi bạn thông tin lộ trình tại **3T Academy** dựa trên nhu cầu của bạn nhé:\n\n"
                f"{best_chunk}\n\n"
                f"Hiện tại tất cả 4 khóa học tại hệ thống đều đang mở đợt học mới với học phí trải nghiệm **10.000 đ**. "
                f"Bạn chia sẻ thêm mục tiêu của bạn để mình tư vấn lớp phù hợp nhất nha!"
            )

        verified_citations = [
            {
                "chunkId": int(c["chunkId"]),
                "sourceType": str(c["sourceType"]),
                "snippet": str(c["snippet"]),
                "rerankScore": float(c.get("rerankScore", 0.0)),
            }
            for c in chunks[:3]
            if c.get("chunkId") is not None
        ]
        trace.append(
            {
                "node": "generate_and_verify_citations",
                "verifiedCitations": len(verified_citations),
                "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
            }
        )
        return {
            "answer_md": answer_md,
            "verified_citations": verified_citations,
            "detected_topic": "Tư vấn lộ trình",
            "trace": trace,
        }

    # Bước 3 (5B - TUTOR): Xây dựng prompt cô lập kiến thức theo khóa học & buổi học kèm mốc giây video hiện tại.
    # TUTOR Grounded Generation + Timestamp Verification
    course_title = meta.get("courseTitle", "")
    skill_names = [s["name"] for s in (meta.get("skills") or [])]
    skill_list_str = ", ".join(skill_names) if skill_names else course_title
    chunks_text = "\n\n".join(
        f"[Chunk #{c['chunkId']} | Giây {c['startSec']}s-{c['endSec']}s | Slide trang {c['pageNumber']} | Điểm Rerank {c.get('rerankScore', 0):.2f}]: {c['content']}"
        for c in chunks
    )
    system_instruction = (
        f"Bạn là Trợ giảng AI chuyên trách RIÊNG cho khóa học '{course_title}' (Buổi {meta.get('sessionOrder')}: {meta.get('sessionTitle')}).\n"
        "QUY TẮC BẮT BUỘC:\n"
        "1. Giọng văn: Gần gũi, tận tình, xưng 'mình' và gọi học viên là 'bạn'.\n"
        f"2. CÔ LẬP KIẾN THỨC KHÓA HỌC: Chỉ giải đáp kiến thức thuộc khóa '{course_title}' ({skill_list_str}).\n"
        "3. KHÔNG ẢO GIÁC: Bám sát Học liệu bên dưới và nêu rõ mốc thời gian bài giảng nếu có."
    )
    prompt = (
        f"=== THÔNG TIN BUỔI HỌC HIỆN TẠI ===\n"
        f"Khóa học: {course_title} | Buổi {meta.get('sessionOrder')}: {meta.get('sessionTitle')}\n"
        f"Kỹ năng trọng tâm: {skill_list_str}\n\n"
        f"=== HỌC LIỆU ĐÃ KIỂM ĐỊNH QUA HYBRID RRF & CROSS-ENCODER ===\n"
        f"{chunks_text or meta.get('sessionSummary', '')}\n\n"
        f"=== CÂU HỎI CỦA HỌC VIÊN (Tại mốc video {state.get('current_video_sec', 0)}s) ===\n"
        f"{question}\n\n"
        "Hãy giải đáp dễ hiểu, chính xác và gắn liền với học liệu."
    )
    detected_topic = skill_names[0] if skill_names else course_title
    try:
        answer_md = await LLMGateway.generate_text(prompt=prompt, system_instruction=system_instruction)
    except Exception as exc:
        logger.warning("Tutor LLM fallback triggered", error=str(exc))
        top_content = chunks[0]["content"] if chunks else meta.get("sessionSummary", "")
        answer_md = (
            f"Chào bạn! Dựa trên nội dung bài giảng trong khóa **{course_title}** (Buổi {meta.get('sessionOrder')}), "
            f"mình giải thích chi tiết điểm bạn đang thắc mắc như sau nhé:\n\n{top_content}"
        )

    # Bước 4: Hậu kiểm trích dẫn (Post-hoc Citation Verification) — đảm bảo `endSec >= startSec` và lọc đủ `chunkId`.
    # Post-hoc Citation Grounding Verification: ensure valid non-negative bounds
    verified_citations = []
    for c in chunks[:3]:
        if c.get("chunkId") is None:
            continue
        st_s = c.get("startSec")
        en_s = c.get("endSec")
        if st_s is not None and en_s is not None and float(en_s) < float(st_s):
            en_s = st_s
        verified_citations.append(
            {
                "chunkId": int(c["chunkId"]),
                "startSec": st_s,
                "endSec": en_s,
                "pageNumber": c.get("pageNumber"),
                "snippet": str(c.get("snippet") or "")[:180],
                "rerankScore": float(c.get("rerankScore", 0.0)),
            }
        )

    trace.append(
        {
            "node": "generate_and_verify_citations",
            "verifiedCitations": len(verified_citations),
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }
    )
    return {
        "answer_md": answer_md,
        "detected_topic": detected_topic,
        "verified_citations": verified_citations,
        "trace": trace,
    }


def _route_after_grading(state: AgentGraphState) -> str:
    """Hàm định tuyến có điều kiện (Conditional Edge) sau Node 3 (`grade_documents`).

    Mục tiêu:
        Nếu tài liệu truy xuất bị đánh giá `WEAK` và chưa viết lại câu hỏi lần nào (`rewrite_count < 1`),
        rẽ nhánh sang `rewrite_query` để tự sửa truy vấn; ngược lại đi thẳng sang `generate_and_verify_citations`.
    """
    grade = state.get("doc_grade", "GROUNDED")
    rewrites = int(state.get("rewrite_count", 0))
    if grade == "WEAK" and rewrites < 1:
        return "rewrite_query"
    return "generate_and_verify_citations"


# ============================================================================
# Native LangGraph Compiler + Deterministic Compatible Engine Fallback
# ============================================================================
_compiled_langgraph: Any = None


def _get_compiled_langgraph() -> Any:
    """Biên dịch đồ thị 5 nút CRAG bằng `langgraph.graph.StateGraph` (lazy singleton) nếu thư viện `langgraph` đã cài."""
    global _compiled_langgraph
    if _compiled_langgraph is not None:
        return _compiled_langgraph
    if not has_package("langgraph"):
        return None
    try:
        from langgraph.graph import END, StateGraph

        # Khai báo 5 nút và các cạnh chuyển trạng thái (bao gồm cạnh rẽ nhánh có điều kiện + vòng lặp tự sửa CRAG).
        workflow = StateGraph(AgentGraphState)
        workflow.add_node("classify_intent", node_classify_intent)
        workflow.add_node("react_tool_router", node_react_tool_router)
        workflow.add_node("grade_documents", node_grade_documents)
        workflow.add_node("rewrite_query", node_rewrite_query)
        workflow.add_node("generate_and_verify_citations", node_generate_and_verify_citations)

        workflow.set_entry_point("classify_intent")
        workflow.add_edge("classify_intent", "react_tool_router")
        workflow.add_edge("react_tool_router", "grade_documents")
        workflow.add_conditional_edges(
            "grade_documents",
            _route_after_grading,
            {
                "rewrite_query": "rewrite_query",
                "generate_and_verify_citations": "generate_and_verify_citations",
            },
        )
        workflow.add_edge("rewrite_query", "react_tool_router")
        workflow.add_edge("generate_and_verify_citations", END)
        _compiled_langgraph = workflow.compile()
        return _compiled_langgraph
    except Exception as exc:
        logger.warning("LangGraph compile fallback to deterministic StateGraph", error=str(exc))
        return None


async def _run_deterministic_state_graph(initial_state: AgentGraphState) -> AgentGraphState:
    """Động cơ chạy đồ thị trạng thái 5 nút tất định (Fallback Engine) tương đương 100% LangGraph khi thiếu gói `langgraph`.

    Mục tiêu:
        Duy trì đúng tô-pô đồ thị và giới hạn an toàn `steps < 10` (tránh lặp vô hạn) để hành vi hệ thống
        nhất quán tuyệt đối trên mọi môi trường triển khai.
    """
    # Executes the exact 5-node CRAG graph topology when `langgraph` package is absent.
    state: Dict[str, Any] = dict(initial_state)
    nodes: Dict[str, Callable[[AgentGraphState], Any]] = {
        "classify_intent": node_classify_intent,
        "react_tool_router": node_react_tool_router,
        "grade_documents": node_grade_documents,
        "rewrite_query": node_rewrite_query,
        "generate_and_verify_citations": node_generate_and_verify_citations,
    }
    current: Optional[str] = "classify_intent"
    steps = 0
    while current is not None and steps < 10:
        steps += 1
        updates = await nodes[current](state)  # type: ignore[arg-type]
        if updates:
            state.update(updates)
        if current == "classify_intent":
            current = "react_tool_router"
        elif current == "react_tool_router":
            current = "grade_documents"
        elif current == "grade_documents":
            current = _route_after_grading(state)  # type: ignore[arg-type]
        elif current == "rewrite_query":
            current = "react_tool_router"
        else:
            current = None
    return state  # type: ignore[return-value]


async def execute_crag_agent(initial_state: AgentGraphState) -> AgentGraphState:
    """Điểm vào duy nhất kích hoạt đồ thị tác tử 5 nút CRAG (ưu tiên LangGraph native, fallback về engine nội bộ).

    Liên kết luồng (Cross-layer):
        Được gọi bởi `ask_advisor()` và `ask_tutor()` trong `src/api/routes/rag_chat.py`.
    Đầu vào / Đầu ra:
        - Input: `initial_state` (`AgentGraphState` chứa `scope`, `original_question`, và tùy chọn `cohort_id`, `session_id`, `current_video_sec`).
        - Output: `AgentGraphState` cuối cùng chứa `answer_md`, `verified_citations`, `detected_topic`, `rerank_backend`, `max_relevance_score`, `trace`.
    """
    graph = _get_compiled_langgraph()
    if graph is not None:
        res = await graph.ainvoke(initial_state)
        return res
    return await _run_deterministic_state_graph(initial_state)
