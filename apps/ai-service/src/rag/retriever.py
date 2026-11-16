from typing import Any, Dict, List, Optional
from ..core.db import get_db_pool
from .embedder import embed_query_1024, format_pgvector_literal


async def retrieve_public_advisor_context(
    question: str, top_k: int = 4
) -> Dict[str, Any]:
    """
    Retrieves ONLY public catalog & FAQ chunks (`visibility = 'PUBLIC'`) using
    PostgreSQL pgvector cosine distance (`<=>`).
    Strictly excludes all `ENROLLED_ONLY` paid course lecture chunks.
    """
    pool = await get_db_pool()
    query_vec = await embed_query_1024(question)
    vec_literal = format_pgvector_literal(query_vec)

    async with pool.acquire() as conn:
        chunk_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.source_type,
                kc.course_id,
                kc.content,
                CASE
                    WHEN kc.embedding IS NOT NULL THEN 1 - (kc.embedding <=> $1::vector)
                    ELSE 0.0
                END AS similarity
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'PUBLIC'
            ORDER BY
                CASE
                    WHEN kc.embedding IS NOT NULL THEN (kc.embedding <=> $1::vector)
                    ELSE 1.0
                END ASC,
                kc.id ASC
            LIMIT $2
            """,
            vec_literal,
            top_k,
        )

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
            ORDER BY c.id ASC
            """
        )

    chunks = [
        {
            "chunkId": int(row["id"]),
            "sourceType": str(row["source_type"]),
            "courseId": int(row["course_id"]) if row["course_id"] is not None else None,
            "content": str(row["content"]),
            "similarity": float(row["similarity"] or 0.0),
            "snippet": str(row["content"])[:160],
        }
        for row in chunk_rows
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
    """
    Retrieves lecture knowledge chunks strictly isolated to a single paid course:
      WHERE visibility = 'ENROLLED_ONLY' AND course_id = :current_course_id
    Never accesses chunks from any other course (`course_id != :current_course_id`).
    """
    pool = await get_db_pool()
    query_vec = await embed_query_1024(question)
    vec_literal = format_pgvector_literal(query_vec)

    async with pool.acquire() as conn:
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

        chunk_rows = await conn.fetch(
            """
            SELECT
                kc.id,
                kc.session_id,
                kc.source_type,
                kc.start_sec,
                kc.end_sec,
                kc.page_number,
                kc.content,
                CASE
                    WHEN kc.embedding IS NOT NULL THEN 1 - (kc.embedding <=> $3::vector)
                    ELSE 0.0
                END AS vector_similarity,
                CASE
                    WHEN kc.session_id = $4 THEN 0.15
                    ELSE 0.0
                END AS session_boost
            FROM knowledge_chunks kc
            WHERE kc.visibility = 'ENROLLED_ONLY'
              AND kc.course_id = $1
              AND (kc.cohort_id = $2 OR kc.cohort_id IS NULL)
            ORDER BY
                (
                    CASE
                        WHEN kc.embedding IS NOT NULL THEN 1 - (kc.embedding <=> $3::vector)
                        ELSE 0.0
                    END
                    + CASE WHEN kc.session_id = $4 THEN 0.15 ELSE 0.0 END
                ) DESC,
                kc.chunk_index ASC
            LIMIT $5
            """,
            course_id,
            resolved_cohort_id,
            vec_literal,
            session_id,
            top_k,
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
                "similarity": float(r["vector_similarity"] or 0.0) + float(r["session_boost"] or 0.0),
                "snippet": str(r["content"])[:180],
            }
            for r in chunk_rows
        ],
    }
