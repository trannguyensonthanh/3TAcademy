import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ...core.llm_gateway import LLMGateway
from ...core.logging import logger
from ...core.security import verify_internal_api_key
from ...rag.retriever import (
    retrieve_course_scoped_tutor_context,
    retrieve_public_advisor_context,
)

rag_chat_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["RAG Advisor & Course Tutor"],
    dependencies=[Depends(verify_internal_api_key)],
)

UNRELATED_DOMAIN_PATTERNS = [
    r"\bkế toán\b",
    r"\bke toan\b",
    r"\bthương mại điện tử\b",
    r"\bthuong mai dien tu\b",
    r"\bshopee\b",
    r"\blazada\b",
    r"\btiktok shop\b",
    r"\bnấu ăn\b",
    r"\bnau an\b",
    r"\bthời tiết\b",
    r"\bthoi tiet\b",
    r"\bbóng đá\b",
    r"\bbong da\b",
    r"\bchứng khoán\b",
    r"\bchung khoan\b",
    r"\bforex\b",
    r"\bbất động sản\b",
    r"\by tế\b",
    r"\bkhám bệnh\b",
    r"\bthuốc\b",
    r"\btử vi\b",
    r"\bphong thủy\b",
    r"\bchính trị\b",
    r"\bluật hình sự\b",
    r"\bmarketing\b",
    r"\bseo\b",
    r"\bnhân sự\b",
    r"\bhr\b",
    r"\bxổ số\b",
]

DEEP_TECHNICAL_LECTURE_PATTERNS = [
    r"\bcông thức\b",
    r"\bcong thuc\b",
    r"\bviết code\b",
    r"\bviet code\b",
    r"\bcode mẫu\b",
    r"\bđoạn code\b",
    r"\bthuật toán chi tiết\b",
    r"\bgiải thích chi tiết\b",
    r"\bgiai thich chi tiet\b",
    r"\bcách cài đặt\b",
    r"\bcách cấu hình\b",
    r"\bsửa lỗi code\b",
    r"\bdebug\b",
    r"\bexplain analyze\b",
    r"\bhnsw\b",
    r"\brrf\b",
    r"\breciprocal rank fusion\b",
    r"\bragas\b",
    r"\bdeadlock\b",
    r"\boutbox pattern\b",
    r"\bwindow function\b",
]


def _matches_any(text: str, patterns: List[str]) -> bool:
    lowered = text.lower()
    return any(re.search(pat, lowered) for pat in patterns)


class AdvisorAskRequest(BaseModel):
    question: str = Field(..., min_length=2)


class TutorAskRequest(BaseModel):
    cohortId: int = Field(default=0)
    sessionId: int = Field(...)
    question: str = Field(..., min_length=2)
    currentVideoSec: int = Field(default=0)


@rag_chat_router.post("/advisor/ask")
async def ask_advisor(req: AdvisorAskRequest):
    question = req.question.strip()

    # 1. Hard Guardrail: Out-of-system / unrelated domains
    if _matches_any(question, UNRELATED_DOMAIN_PATTERNS):
        return {
            "answerMd": (
                "Mình xin lỗi nha, câu hỏi này nằm ngoài phạm vi hệ thống đào tạo của **3T Academy** "
                "nên mình không biết thông tin để giải đáp cho bạn. Mình chỉ hỗ trợ tư vấn lộ trình học tập, "
                "lịch khai giảng và thông tin các khóa học công nghệ (AI, Backend, Kỹ thuật Dữ liệu, Python & SQL) "
                "tại học viện thôi. Nếu bạn đang quan tâm đến hướng đi nào trong ngành lập trình thì cứ nhắn mình nhé!"
            ),
            "citations": [],
        }

    # 2. Retrieve strictly PUBLIC chunks + catalog metadata
    ctx = await retrieve_public_advisor_context(question, top_k=4)
    public_chunks = ctx["chunks"]
    catalog = ctx["catalog"]

    # 3. Hard Guardrail: Deep technical lecture content not allowed in Career Advisor
    if _matches_any(question, DEEP_TECHNICAL_LECTURE_PATTERNS):
        return {
            "answerMd": (
                "Mình không biết chi tiết nội dung bài giảng, công thức hay cách triển khai code chuyên sâu bên trong khóa học đâu bạn ơi, "
                "vì mục tiêu của mình là đồng hành tư vấn lộ trình học tập và chọn lớp phù hợp cho bạn thôi.\n\n"
                "Những kiến thức kỹ thuật chuyên sâu này sẽ được giảng viên hướng dẫn trực tiếp và có Trợ giảng AI riêng giải đáp "
                "bên trong từng khóa học sau khi bạn đăng ký. Hiện tại **3T Academy** đang mở 4 lộ trình với học phí **10.000 đ/khóa**:\n"
                "- **Kỹ sư AI Thực chiến: RAG, Agents & LLMOps** (`AI-ENG-2026-K01`)\n"
                "- **Kiến trúc Backend Chuyên sâu: TypeScript, PostgreSQL & Distributed Systems** (`SWE-ARCH-2026-K01`)\n"
                "- **Kỹ thuật Dữ liệu: Streaming Pipeline & Lakehouse** (`DATA-PIPE-2026-K01`)\n"
                "- **Lập trình Python & SQL Thực chiến cho Kỹ sư Dữ liệu & AI** (`PY-SQL-2026-K01`)\n\n"
                "Bạn đang muốn tìm hiểu lộ trình nào để mình gợi ý chi tiết lịch học cho bạn nhé?"
            ),
            "citations": [
                {
                    "chunkId": c["chunkId"],
                    "sourceType": c["sourceType"],
                    "snippet": c["snippet"],
                }
                for c in public_chunks[:2]
            ],
        }

    catalog_text = "\n".join(
        f"- Khóa học: {c['title']} (Mã lớp: {c['cohortCode']}, Học phí: {c['tuitionVnd']:,} đ, Khai giảng: {c['startDate']}): {c['shortDescription']}"
        for c in catalog
    )
    chunks_text = "\n\n".join(
        f"[Tài liệu #{c['chunkId']} - {c['sourceType']}]: {c['content']}"
        for c in public_chunks
    )

    system_instruction = (
        "Bạn là Trợ lý Tư vấn Lộ trình học tập của 3T Academy.\n"
        "QUY TẮC BẮT BUỘC:\n"
        "1. Giọng văn: Gần gũi, nhẹ nhàng, thân thiện, xưng 'mình' và gọi người học là 'bạn'.\n"
        "2. KHÔNG ĐƯỢC ẢO GIÁC, KHÔNG NÓI BỪA: Chỉ sử dụng đúng thông tin từ Danh mục khóa học và Tài liệu PUBLIC bên dưới.\n"
        "3. Nếu người dùng hỏi những gì KHÔNG liên quan đến hệ thống 3T Academy (ví dụ: kế toán, thương mại điện tử, nấu ăn, thời tiết...), hãy lịch sự nói rằng mình không biết vì nằm ngoài phạm vi hệ thống.\n"
        "4. Nếu người dùng hỏi kiến thức chuyên sâu bên trong bài giảng (công thức, viết code chi tiết, giải thích thuật toán chuyên sâu), hãy nhẹ nhàng trả lời rằng mình không biết chi tiết kiến thức bên trong khóa học vì mục tiêu của mình chỉ là tư vấn lộ trình học tập phù hợp, và gợi ý khóa học tương ứng để bạn ấy tham khảo."
    )

    prompt = (
        f"=== DANH MỤC KHÓA HỌC ĐANG MỞ TẠI 3T ACADEMY ===\n{catalog_text}\n\n"
        f"=== TÀI LIỆU TƯ VẤN CÔNG KHAI (PUBLIC RAG) ===\n{chunks_text}\n\n"
        f"=== CÂU HỎI CỦA HỌC VIÊN ===\n{question}\n\n"
        "Hãy trả lời ngắn gọn, rõ ràng, ấm áp và đúng quy tắc."
    )

    try:
        answer_md = await LLMGateway.generate_text(
            prompt=prompt, system_instruction=system_instruction
        )
    except Exception as exc:
        logger.warning("Advisor LLM fallback triggered", error=str(exc))
        best_chunk = public_chunks[0]["content"] if public_chunks else ""
        answer_md = (
            f"Chào bạn nha! Mình gửi bạn thông tin lộ trình tại **3T Academy** dựa trên nhu cầu của bạn nhé:\n\n"
            f"{best_chunk}\n\n"
            f"Hiện tại tất cả 4 khóa học tại hệ thống đều đang mở đợt học mới với học phí ưu đãi **10.000 đ**. "
            f"Bạn chia sẻ thêm mục tiêu của bạn để mình tư vấn lớp phù hợp nhất nha!"
        )

    return {
        "answerMd": answer_md,
        "citations": [
            {
                "chunkId": c["chunkId"],
                "sourceType": c["sourceType"],
                "snippet": c["snippet"],
            }
            for c in public_chunks[:3]
        ],
    }


@rag_chat_router.post("/tutor/ask")
async def ask_tutor(req: TutorAskRequest):
    ctx = await retrieve_course_scoped_tutor_context(
        cohort_id=req.cohortId,
        session_id=req.sessionId,
        question=req.question.strip(),
        current_video_sec=req.currentVideoSec,
        top_k=4,
    )
    if not ctx:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc khóa học")

    course_title = ctx["courseTitle"]
    skill_names = [s["name"] for s in ctx["skills"]]
    skill_list_str = ", ".join(skill_names) if skill_names else course_title

    # 1. Hard Guardrail: Unrelated domain check
    if _matches_any(req.question, UNRELATED_DOMAIN_PATTERNS):
        return {
            "answerMd": (
                f"Mình xin lỗi nha, câu hỏi này không thuộc chủ đề của khóa **{course_title}** nên mình không biết thông tin để giải đáp. "
                f"Trong không gian lớp học này, mình chỉ hỗ trợ giải đáp các kiến thức chuyên môn thuộc khóa học "
                f"({skill_list_str}) thôi nhé. Bạn có thắc mắc nào về bài giảng hôm nay cứ hỏi mình nha!"
            ),
            "detectedTopic": "Ngoài phạm vi khóa học",
            "citations": [],
        }

    chunks = ctx["chunks"]
    chunks_text = "\n\n".join(
        f"[Chunk #{c['chunkId']} | Giây {c['startSec']}s-{c['endSec']}s | Slide trang {c['pageNumber']}]: {c['content']}"
        for c in chunks
    )

    system_instruction = (
        f"Bạn là Trợ giảng AI chuyên trách RIÊNG cho khóa học '{course_title}' (Buổi {ctx['sessionOrder']}: {ctx['sessionTitle']}).\n"
        "QUY TẮC BẮT BUỘC:\n"
        "1. Giọng văn: Gần gũi, nhẹ nhàng, tận tình như một người bạn đồng hành, xưng 'mình' và gọi học viên là 'bạn'.\n"
        f"2. CÔ LẬP KIẾN THỨC KHÓA HỌC: Bạn CHỈ được phép biết và giải đáp các kiến thức nằm trong phạm vi của khóa '{course_title}' (Các kỹ năng/chủ đề được phép: {skill_list_str}).\n"
        "3. Nếu học viên hỏi về kiến thức thuộc khóa học khác hoặc lĩnh vực khác (ví dụ: kế toán, thương mại điện tử, hoặc công nghệ không dạy trong khóa này), hãy lịch sự từ chối và nói rằng mình chỉ biết kiến thức trong khóa học này thôi.\n"
        "4. KHÔNG ĐƯỢC ẢO GIÁC, KHÔNG BỊA ĐẶT: Chỉ trả lời dựa trên Học liệu (Knowledge Chunks) của khóa học được cung cấp bên dưới."
    )

    prompt = (
        f"=== THÔNG TIN BUỔI HỌC HIỆN TẠI ===\n"
        f"Khóa học: {course_title}\n"
        f"Buổi {ctx['sessionOrder']}: {ctx['sessionTitle']}\n"
        f"Chủ đề được phép khai thác: {skill_list_str}\n\n"
        f"=== HỌC LIỆU TRÍCH XUẤT TỪ VECTOR DATABASE (CHỈ THUỘC KHÓA HỌC NÀY) ===\n"
        f"{chunks_text or ctx['sessionSummary']}\n\n"
        f"=== CÂU HỎI CỦA HỌC VIÊN (Tại mốc video {req.currentVideoSec}s) ===\n"
        f"{req.question}\n\n"
        "Hãy giải đáp dễ hiểu, gần gũi và bám sát học liệu của khóa học."
    )

    detected_topic = skill_names[0] if skill_names else course_title
    try:
        answer_md = await LLMGateway.generate_text(
            prompt=prompt, system_instruction=system_instruction
        )
    except Exception as exc:
        logger.warning("Tutor LLM fallback triggered", error=str(exc))
        top_content = chunks[0]["content"] if chunks else ctx["sessionSummary"]
        answer_md = (
            f"Chào bạn! Dựa trên nội dung bài giảng trong khóa **{course_title}** (Buổi {ctx['sessionOrder']}), "
            f"mình giải thích chi tiết điểm bạn đang thắc mắc như sau nhé:\n\n{top_content}"
        )

    return {
        "answerMd": answer_md,
        "detectedTopic": detected_topic,
        "citations": [
            {
                "chunkId": c["chunkId"],
                "startSec": c["startSec"],
                "endSec": c["endSec"],
                "pageNumber": c["pageNumber"],
                "snippet": c["snippet"],
            }
            for c in chunks[:3]
        ],
    }
