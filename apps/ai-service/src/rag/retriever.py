"""Bộ truy xuất lai Hybrid Search (Stage 1 RAG): pgvector HNSW Cosine + PostgreSQL Full-Text Search (tsvector) + RRF k=60 + Lọc RBAC.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Thực thi Giai đoạn 1 (Recall Stage) của hệ thống Two-Stage Retrieval cho cả AI Advisor (tri thức công khai)
  và AI Session Tutor (tri thức nội bộ khóa học).
- Kết hợp 2 kênh tìm kiếm bổ trợ nhau trong PostgreSQL:
  1. **Dense Vector Search (`pgvector` HNSW Cosine `<=>`):** Bắt tốt ý nghĩa tổng quát và từ đồng nghĩa.
  2. **Sparse Lexical Search (`GIN search_tsv` + `ts_rank_cd` kiểu BM25):** Bắt chính xác mã lỗi, tên hàm, thuật ngữ chuyên ngành.
  3. **Reciprocal Rank Fusion (RRF, `k = 60`):** Trộn 2 danh sách xếp hạng không cần chuẩn hóa thang điểm tuyệt đối
     (`score = ∑ 1 / (60 + rank)`), kèm cộng điểm ưu tiên nhẹ (`+0.008`) cho buổi học hiện tại của sinh viên.
- **Bảo mật dữ liệu theo vai trò (RBAC Isolation ngay tầng SQL):**
  + Advisor chỉ được đọc `visibility = 'PUBLIC'`.
  + Tutor bị cách ly nghiêm ngặt trong `visibility = 'ENROLLED_ONLY' AND course_id = $1 AND (cohort_id = $2 OR cohort_id IS NULL)`
    nhằm ngăn tuyệt đối rò rỉ tài liệu giữa các khóa học khác nhau.

Liên kết chéo (Cross-layer):
- Được gọi bởi node Retrieve của đồ thị CRAG trong `src/rag/agent_graph.py`.
- Sử dụng `get_db_pool()` (`src/core/db.py`) và `embed_query_1024()`, `format_pgvector_literal()` (`src/rag/embedder.py`).
- Truy vấn trực tiếp các bảng PostgreSQL: `knowledge_chunks`, `courses`, `cohorts`, `class_sessions`, `course_skills`, `skills`.
"""

from typing import Any, Dict, List, Optional
from ..core.db import get_db_pool
from .embedder import embed_query_1024, format_pgvector_literal

# Hằng số làm mượt xếp hạng k=60 theo bài báo gốc Reciprocal Rank Fusion (Cormack et al., SIGIR 2009),
# giúp giảm tác động quá mạnh của thứ hạng ngoại lai và cân bằng hài hòa giữa Vector Search và Full-Text Search.
RRF_K = 60


def _fuse_rrf(
    vector_rows: List[Dict[str, Any]],
    fts_rows: List[Dict[str, Any]],
    top_k: int,
    boost_session_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Trộn kết quả từ Vector Search và Full-Text Search bằng công thức Reciprocal Rank Fusion (RRF).

    Mục tiêu:
        Hợp nhất 2 bảng xếp hạng có thang điểm khác bản chất (Cosine ∈ [-1, 1] vs `ts_rank_cd` không cố định biên)
        thành một điểm duy nhất `RRF(d) = 1/(60 + rank_vec) + 1/(60 + rank_fts)`, đồng thời ưu tiên nhẹ
        các chunk thuộc đúng buổi học đang xem (`boost_session_id`).
    Liên kết luồng (Cross-layer):
        Được gọi nội bộ bởi `retrieve_public_advisor_context()` và `retrieve_course_scoped_tutor_context()`.
    Đầu vào / Đầu ra:
        - Input: `vector_rows`, `fts_rows` (danh sách bản ghi đã xếp hạng giảm dần theo từng kênh), `top_k`, `boost_session_id`.
        - Output: Danh sách tối đa `top_k` ứng viên tốt nhất đã gắn thêm trường `rrf_score`.
    """
    by_id: Dict[int, Dict[str, Any]] = {}
    scores: Dict[int, float] = {}

    # Bước 1: Cộng điểm nghịch đảo thứ hạng cho các ứng viên đến từ kênh tìm kiếm Vector HNSW.
    for rank, row in enumerate(vector_rows):
        cid = int(row["id"])
        by_id[cid] = row
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)

    # Bước 2: Cộng dồn điểm nghịch đảo thứ hạng cho các ứng viên đến từ kênh tìm kiếm Từ khóa (tsvector FTS).
    # Tài liệu xuất hiện ở top cao trên CẢ HAI kênh sẽ nhận tổng điểm vượt trội.
    for rank, row in enumerate(fts_rows):
        cid = int(row["id"])
        if cid not in by_id:
            by_id[cid] = row
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)

    # Bước 3: Áp dụng ưu tiên ngữ cảnh buổi học hiện tại (+0.008 ≈ nửa bậc hạng đầu) nếu đang ở chế độ AI Tutor.
    if boost_session_id is not None:
        for cid, row in by_id.items():
            if row.get("session_id") == boost_session_id:
                scores[cid] = scores.get(cid, 0.0) + 0.008

    # Bước 4: Sắp xếp giảm dần theo `rrf_score` (phá hòa tất định theo `cid` tăng dần) và cắt lấy `top_k`.
    ranked_ids = sorted(scores.keys(), key=lambda cid: (-scores[cid], cid))[:top_k]
    result: List[Dict[str, Any]] = []
    for cid in ranked_ids:
        item = dict(by_id[cid])
        item["rrf_score"] = scores[cid]
        result.append(item)
    return result


async def retrieve_public_advisor_context(
    question: str, top_k: int = 4
) -> Dict[str, Any]:
    """Truy xuất ngữ cảnh lai (Hybrid RRF + danh mục khóa học công khai) cho trợ lý tư vấn AI Advisor.

    Mục tiêu:
        Tìm top ứng viên tri thức từ bảng `knowledge_chunks` với ràng buộc cứng `visibility = 'PUBLIC'`
        kết hợp dữ liệu thực thời về các khóa học/đợt tuyển sinh đang mở (`courses` LEFT JOIN `cohorts`)
        để AI tư vấn chính xác học phí, lịch khai giảng và lộ trình.
    Liên kết luồng (Cross-layer):
        - Được gọi bởi node `retrieve_node` trong `src/rag/agent_graph.py` khi `scope == "ADVISOR"`.
        - Truy vấn bảng `knowledge_chunks`, `courses`, `cohorts` trong PostgreSQL thông qua `get_db_pool()`.
    Đầu vào / Đầu ra:
        - Input: `question` (câu hỏi người dùng hoặc câu hỏi đã được viết lại bởi CRAG), `top_k` (số ứng viên cần lấy).
        - Output: Dict `{"chunks": [...], "catalog": [...]}`.
    """
    # Hybrid RRF retrieval (HNSW cosine index `<=>` + GIN `search_tsv` full-text index)
    # strictly restricted to `visibility = 'PUBLIC'` chunks.
    # Notice `ORDER BY kc.embedding <=> $1::vector ASC` is unwrapped so PostgreSQL uses `idx_chunks_embedding_hnsw`.
    # Bước 1: Mã hóa câu hỏi thành vector 1024 chiều định dạng pgvector literal.
    pool = await get_db_pool()
    query_vec = await embed_query_1024(question)
    vec_literal = format_pgvector_literal(query_vec)

    async with pool.acquire() as conn:
        # Bước 2: Kênh Dense Vector Search — giữ nguyên `ORDER BY kc.embedding <=> $1::vector ASC` (không bọc biểu thức)
        # để PostgreSQL Query Planner kích hoạt chỉ mục HNSW (`idx_chunks_embedding_hnsw`) chạy trong vài mili-giây.
        vec_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.source_type,
                kc.course_id,
                kc.content,
                1 - (kc.embedding <=> $1::vector) AS similarity
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'PUBLIC'
              AND kc.embedding IS NOT NULL
            ORDER BY kc.embedding <=> $1::vector ASC
            LIMIT 12
            """,
            vec_literal,
        )

        # Bước 3: Kênh Sparse Full-Text Search — dùng `websearch_to_tsquery('simple', $1)` trên chỉ mục GIN `search_tsv`
        # và chấm mật độ phủ từ khóa bằng `ts_rank_cd`.
        fts_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.source_type,
                kc.course_id,
                kc.content,
                ts_rank_cd(kc.search_tsv, websearch_to_tsquery('simple', $1)) AS similarity
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'PUBLIC'
              AND kc.search_tsv @@ websearch_to_tsquery('simple', $1)
            ORDER BY ts_rank_cd(kc.search_tsv, websearch_to_tsquery('simple', $1)) DESC
            LIMIT 12
            """,
            question,
        )

        # Bước 4: Nạp danh mục khóa học đã xuất bản kèm đợt học đang mở (`OPENING`/`ONGOING`) để chống sai lệch học phí/lịch.
        course_rows = await conn.fetch(
            """
            SELECT
                c.id,
                c.slug,
                c.title,
                c.short_description,
                c.difficulty_level,
                ch.id AS cohort_id,
                ch.code AS cohort_code,
                ch.name AS cohort_name,
                ch.status AS cohort_status,
                ch.tuition_vnd,
                ch.start_date,
                ch.end_date
            FROM courses c
            LEFT JOIN cohorts ch ON ch.course_id = c.id AND ch.status IN ('OPENING', 'ONGOING')
            WHERE c.status = 'PUBLISHED'
            ORDER BY c.id ASC, ch.start_date ASC
            """
        )

    # Bước 5: Trộn 2 danh sách bằng RRF (`k=60`) và đóng gói định dạng chuẩn cho tầng Reranker + CRAG Agent.
    fused = _fuse_rrf([dict(r) for r in vec_rows], [dict(r) for r in fts_rows], top_k)

    chunks = [
        {
            "chunkId": int(row["id"]),
            "sourceType": str(row["source_type"]),
            "courseId": int(row["course_id"]) if row["course_id"] is not None else None,
            "content": str(row["content"]),
            "similarity": float(row.get("similarity") or 0.0),
            "rrfScore": float(row.get("rrf_score") or 0.0),
            "snippet": str(row["content"])[:160],
        }
        for row in fused
    ]

    catalog_items = [
        {
            "courseId": int(r["id"]),
            "slug": str(r["slug"]),
            "title": str(r["title"]),
            "shortDescription": str(r["short_description"]),
            "difficultyLevel": int(r["difficulty_level"]),
            "cohortId": int(r["cohort_id"]) if r["cohort_id"] is not None else None,
            "cohortCode": str(r["cohort_code"] or ""),
            "cohortName": str(r["cohort_name"] or ""),
            "tuitionVnd": int(r["tuition_vnd"] or 10000),
            "startDate": str(r["start_date"] or ""),
        }
        for r in course_rows
    ]

    return {
        "chunks": chunks,
        "catalog": catalog_items,
    }


async def retrieve_course_scoped_tutor_context(
    cohort_id: int,
    session_id: int,
    question: str,
    current_video_sec: int = 0,
    top_k: int = 4,
) -> Optional[Dict[str, Any]]:
    """Truy xuất ngữ cảnh bài giảng cách ly RBAC theo đúng khóa học & đợt học cho AI Session Tutor.

    Mục tiêu:
        Đảm bảo học viên trong khóa học nào chỉ truy xuất được tri thức `ENROLLED_ONLY` thuộc đúng `course_id`
        và `cohort_id` đó; đồng thời lấy thêm kỹ năng của khóa (`skills`) và danh sách khóa học khác (`otherCourses`)
        để CRAG Agent phát hiện câu hỏi ngoài phạm vi khóa học hiện tại (out-of-scope guard).
    Liên kết luồng (Cross-layer):
        - Được gọi bởi `retrieve_node` trong `src/rag/agent_graph.py` khi `scope == "TUTOR"`.
        - Truy vấn PostgreSQL: `class_sessions`, `cohorts`, `courses`, `course_skills`, `skills`, `knowledge_chunks`.
    Đầu vào / Đầu ra:
        - Input: `cohort_id`, `session_id`, `question`, `current_video_sec`, `top_k`.
        - Output: Dict ngữ cảnh đầy đủ (thông tin khóa học, buổi học, kỹ năng, các khóa khác và top chunks đã trộn RRF);
          trả `None` nếu `session_id` không tồn tại.
    """
    # Hybrid RRF retrieval isolated strictly to the student's enrolled course (`visibility = 'ENROLLED_ONLY'`).
    # Uses unwrapped `ORDER BY kc.embedding <=> $3::vector ASC` so PostgreSQL leverages `idx_chunks_embedding_hnsw`.
    # Bước 1: Mã hóa câu hỏi thành vector 1024 chiều để sẵn sàng tìm kiếm ngữ nghĩa.
    pool = await get_db_pool()
    query_vec = await embed_query_1024(question)
    vec_literal = format_pgvector_literal(query_vec)

    async with pool.acquire() as conn:
        # Bước 2: Xác thực sự tồn tại của buổi học (`session_id`) và lấy siêu dữ liệu khóa học/đợt học tương ứng.
        session_row = await conn.fetchrow(
            """
            SELECT
                s.id AS session_id,
                s.session_order,
                s.title AS session_title,
                s.description_md AS session_description,
                s.ai_summary_md,
                ch.id AS cohort_id,
                ch.code AS cohort_code,
                ch.tech_stack_notes,
                c.id AS course_id,
                c.slug AS course_slug,
                c.title AS course_title,
                c.short_description AS course_short_description,
                c.syllabus_template
            FROM class_sessions s
            INNER JOIN cohorts ch ON ch.id = s.cohort_id
            INNER JOIN courses c ON c.id = ch.course_id
            WHERE s.id = $1 AND ($2::bigint IS NULL OR ch.id = $2)
            LIMIT 1
            """,
            session_id,
            cohort_id if cohort_id > 0 else None,
        )

        if not session_row:
            return None

        course_id = int(session_row["course_id"])
        resolved_cohort_id = int(session_row["cohort_id"])

        # Bước 3: Lấy bảng kỹ năng mục tiêu của khóa học và danh sách khóa học khác (phục vụ kiểm tra lạc đề/RBAC).
        skill_rows = await conn.fetch(
            """
            SELECT sk.code, sk.name, sk.description, cs.skill_role
            FROM course_skills cs
            INNER JOIN skills sk ON sk.id = cs.skill_id
            WHERE cs.course_id = $1
            """,
            course_id,
        )

        other_courses_rows = await conn.fetch(
            """
            SELECT c.id, c.title, c.short_description
            FROM courses c
            WHERE c.id != $1
            """,
            course_id,
        )

        # Bước 4: Kênh Vector Search HNSW có khóa chặt phạm vi RBAC (`visibility='ENROLLED_ONLY'`, `course_id`, `cohort_id`).
        vec_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.session_id,
                kc.source_type,
                kc.start_sec,
                kc.end_sec,
                kc.page_number,
                kc.content,
                1 - (kc.embedding <=> $3::vector) AS vector_similarity
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'ENROLLED_ONLY'
              AND kc.course_id = $1
              AND (kc.cohort_id = $2 OR kc.cohort_id IS NULL)
              AND kc.embedding IS NOT NULL
            ORDER BY kc.embedding <=> $3::vector ASC
            LIMIT 12
            """,
            course_id,
            resolved_cohort_id,
            vec_literal,
        )

        # Bước 5: Kênh Full-Text Search (tsvector GIN) trên đúng cùng tập dữ liệu RBAC đã cách ly.
        fts_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.session_id,
                kc.source_type,
                kc.start_sec,
                kc.end_sec,
                kc.page_number,
                kc.content,
                ts_rank_cd(kc.search_tsv, websearch_to_tsquery('simple', $3)) AS vector_similarity
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'ENROLLED_ONLY'
              AND kc.course_id = $1
              AND (kc.cohort_id = $2 OR kc.cohort_id IS NULL)
              AND kc.search_tsv @@ websearch_to_tsquery('simple', $3)
            ORDER BY ts_rank_cd(kc.search_tsv, websearch_to_tsquery('simple', $3)) DESC
            LIMIT 12
            """,
            course_id,
            resolved_cohort_id,
            question,
        )

    # Bước 6: Hợp nhất kết quả bằng RRF và cộng điểm ưu tiên cho các chunk thuộc đúng `session_id` đang học.
    fused = _fuse_rrf(
        [dict(r) for r in vec_rows],
        [dict(r) for r in fts_rows],
        top_k,
        boost_session_id=session_id,
    )

    return {
        "courseId": course_id,
        "courseSlug": str(session_row["course_slug"]),
        "courseTitle": str(session_row["course_title"]),
        "courseShortDescription": str(session_row["course_short_description"]),
        "cohortId": resolved_cohort_id,
        "cohortCode": str(session_row["cohort_code"]),
        "techStackNotes": str(session_row["tech_stack_notes"] or ""),
        "sessionId": int(session_row["session_id"]),
        "sessionOrder": int(session_row["session_order"]),
        "sessionTitle": str(session_row["session_title"]),
        "sessionDescription": str(session_row["session_description"] or ""),
        "sessionSummary": str(session_row["ai_summary_md"] or ""),
        "skills": [
            {
                "code": str(r["code"]),
                "name": str(r["name"]),
                "description": str(r["description"] or ""),
                "role": str(r["skill_role"]),
            }
            for r in skill_rows
        ],
        "otherCourses": [
            {
                "id": int(r["id"]),
                "title": str(r["title"]),
                "shortDescription": str(r["short_description"]),
            }
            for r in other_courses_rows
        ],
        "chunks": [
            {
                "chunkId": int(r["id"]),
                "sessionId": int(r["session_id"]) if r["session_id"] is not None else None,
                "sourceType": str(r["source_type"]),
                "startSec": int(r["start_sec"]) if r["start_sec"] is not None else 15,
                "endSec": int(r["end_sec"]) if r["end_sec"] is not None else 90,
                "pageNumber": int(r["page_number"]) if r["page_number"] is not None else 8,
                "content": str(r["content"]),
                "similarity": float(r.get("vector_similarity") or 0.0),
                "rrfScore": float(r.get("rrf_score") or 0.0),
                "snippet": str(r["content"])[:180],
            }
            for r in fused
        ],
    }
