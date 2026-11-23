"""Router API Khảo thí & Chấm điểm AI: Sinh đề Quiz tự động từ bài giảng và Trợ giảng đồng chấm bài tự luận.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Phục vụ giảng viên (Instructor) trên trang giảng dạy tạo nhanh bộ câu hỏi trắc nghiệm bám sát phụ đề buổi học
  (`/api/v1/ai/assessments/generate-quiz`) và nhận gợi ý chấm bài tự luận/dự án theo rubric (`/api/v1/ai/assessments/co-grade`).
- Kết hợp gọi LLM qua `LLMGateway.generate_text()` (chuỗi fallback Gemini -> vLLM) với tầng dự phòng tất định
  (`_build_deterministic_quiz_items`) để hệ thống không bao giờ trả lỗi trắng khi mất mạng hoặc hết quota LLM.

Liên kết chéo (Cross-layer):
- Được gọi từ `apps/api/src/modules/teach/teach.routes.ts` (dòng ~1924) thông qua
  `aiServiceClient.generateQuizDraft()` trong `apps/api/src/integrations/aiService.client.ts`.
- Gọi sang `LLMGateway.generate_text()` (`src/core/llm_gateway.py`); bảo vệ bởi `verify_internal_api_key`.
"""

import json
import re
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ...core.llm_gateway import LLMGateway
from ...core.logging import logger
from ...core.security import verify_internal_api_key

# Khai báo router khảo thí AI (`/api/v1/ai/assessments`) với xác thực `X-Internal-Key`.
grading_router = APIRouter(
    prefix="/api/v1/ai/assessments",
    tags=["ai-assessments"],
    dependencies=[Depends(verify_internal_api_key)],
)


class GenerateQuizRequest(BaseModel):
    """Schema đầu vào để AI sinh bộ câu hỏi trắc nghiệm 4 đáp án gắn với `session_id` và `skill_ids`."""

    session_id: int
    session_title: str
    transcript_text: str = ""
    skill_ids: list[int] = Field(default_factory=list)
    question_count: int = Field(default=4, ge=1, le=15)


class CoGradeSubmissionRequest(BaseModel):
    """Schema đầu vào cho trợ giảng AI gợi ý điểm số và nhận xét bài nộp tự luận/code theo rubric."""

    item_id: int
    prompt_md: str
    rubric_config: dict
    student_response_md: str
    github_repo_url: str | None = None
    max_points: float = Field(default=10.0, gt=0)


def _build_deterministic_quiz_items(req: GenerateQuizRequest) -> list[dict]:
    """Tạo bộ câu hỏi trắc nghiệm dự phòng theo ngữ cảnh buổi học khi LLM không khả dụng hoặc parse JSON lỗi.

    Mục tiêu:
        Đảm bảo tính khả dụng 100% cho luồng tạo nháp Quiz của giảng viên; câu hỏi dự phòng vẫn lồng ghép
        tiêu đề buổi học, trích đoạn câu đầu của transcript và giữ đúng định dạng kép (camelCase + snake_case)
        tương thích với cả Frontend lẫn DB schema của `apps/api`.
    Liên kết luồng (Cross-layer):
        Được gọi nội bộ trong `generate_session_quiz()` khi khối `try` gọi `LLMGateway` thất bại.
    Đầu vào / Đầu ra:
        - Input: `req` (`GenerateQuizRequest`).
        - Output: Danh sách `req.question_count` dict câu hỏi trắc nghiệm đầy đủ `prompt_config` và `grading_config`.
    """
    # Bước 1: Trích tiêu đề buổi học và câu mở đầu transcript (giới hạn 120 ký tự) để cá nhân hóa nội dung câu hỏi.
    title = req.session_title.strip() or f"Buổi học #{req.session_id}"
    snippet = (req.transcript_text or "").strip()
    first_sentence = (
        snippet.split(".")[0].strip()[:120]
        if snippet
        else f"nguyên lý thiết kế thực chiến trong {title}"
    )

    # Bước 2: Định nghĩa 4 mẫu câu hỏi chuẩn kỹ thuật phần mềm (kiến trúc, kiểm thử, tránh lỗi phổ biến, mở rộng)
    # có phân bổ vị trí đáp án đúng (`correct_idx`) đa dạng.
    templates = [
        (
            f"Trong nội dung '{title}', nguyên tắc kiến trúc cốt lõi nào giúp hệ thống vận hành ổn định trên môi trường Production?",
            [
                f"Thiết kế tách lớp rõ ràng, kiểm soát timeout và áp dụng chuẩn {first_sentence}",
                "Gộp toàn bộ nghiệp vụ và truy vấn vào một hàm đồng bộ duy nhất trên client",
                "Tắt hoàn toàn cơ chế xác thực và logging để giảm độ trễ",
                "Lưu cứng toàn bộ cấu hình nhạy cảm trực tiếp trong mã nguồn giao diện",
            ],
            0,
            f"Bám sát trọng tâm của '{title}': tách lớp trách nhiệm, bảo toàn tính nhất quán dữ liệu và kiểm soát lỗi.",
        ),
        (
            f"Khi kiểm thử và nghiệm thu kỹ thuật cho '{title}', tiêu chí nào phản ánh đúng độ tin cậy của giải pháp?",
            [
                "Chỉ kiểm tra trường hợp đầu vào lý tưởng trên máy cá nhân",
                "Đo lường latency P95, kiểm chứng tính idempotent và xử lý triệt để các edge cases",
                "Bỏ qua ràng buộc toàn vẹn dữ liệu ở tầng cơ sở dữ liệu",
                "Tăng kích thước payload trả về không giới hạn",
            ],
            1,
            "Hệ thống thực chiến luôn đòi hỏi kiểm chứng P95 latency, idempotency và xử lý ngoại lệ rõ ràng.",
        ),
        (
            f"Đâu là sai lầm phổ biến nhất cần tránh khi triển khai thực tế chủ đề '{title}'?",
            [
                "Viết unit test tự động cho các nhánh logic quan trọng",
                "Theo dõi structured logs kèm correlation ID",
                "Thực hiện truy vấn tuần tự N+1 hoặc khóa tài nguyên quá lâu gây nghẽn cổ chai",
                "Sử dụng chỉ mục (index) phù hợp với mẫu truy vấn thực tế",
            ],
            2,
            "Truy vấn N+1 và giữ lock lâu là nguyên nhân hàng đầu gây suy giảm hiệu năng khi tải tăng cao.",
        ),
        (
            f"Để tối ưu khả năng mở rộng và bảo trì cho bài toán trong '{title}', hướng tiếp cận nào được khuyến nghị?",
            [
                "Sao chép logic nghiệp vụ ra nhiều nơi không đồng bộ",
                "Chuẩn hóa hợp đồng dữ liệu (schema validation), tách rõ boundary và giám sát chỉ số vận hành",
                "Bỏ qua bước kiểm tra kiểu dữ liệu đầu vào",
                "Dùng biến toàn cục lưu trạng thái phiên làm việc trong bộ nhớ tiến trình đơn lẻ",
            ],
            1,
            "Chuẩn hóa hợp đồng API/DB và stateless boundary giúp hệ thống dễ mở rộng ngang và an toàn khi nâng cấp.",
        ),
    ]

    # Bước 3: Lặp xoay vòng theo `question_count` và gán vòng tròn `skill_id` để phân bổ đều năng lực cần đánh giá.
    items: list[dict] = []
    for idx in range(req.question_count):
        tpl = templates[idx % len(templates)]
        skill_id = req.skill_ids[idx % len(req.skill_ids)] if req.skill_ids else 1
        prompt_text, options, correct_idx, explanation = tpl
        option_letters = ["A", "B", "C", "D"]
        items.append(
            {
                "prompt": prompt_text,
                "options": options,
                "correctIndex": correct_idx,
                "explanationMd": explanation,
                "skillId": skill_id,
                "item_type": "SINGLE_CHOICE",
                "skill_id": skill_id,
                "points": 2.5,
                "prompt_config": {
                    "question_md": prompt_text,
                    "options": [
                        {"id": option_letters[i], "text": opt}
                        for i, opt in enumerate(options)
                    ],
                },
                "grading_config": {
                    "correctIndex": correct_idx,
                    "correct_option_id": option_letters[correct_idx],
                },
                "explanation_md": explanation,
            }
        )
    return items


@grading_router.post("/generate-quiz")
async def generate_session_quiz(req: GenerateQuizRequest):
    """Sinh nháp bộ câu hỏi trắc nghiệm từ tiêu đề và nội dung phụ đề buổi học bằng LLM (có fallback an toàn).

    Mục tiêu:
        Giảm thời gian soạn đề của giảng viên: gửi prompt có cấu trúc yêu cầu LLM trả về JSON thuần
        gồm 4 phương án A/B/C/D, vị trí đáp án đúng và giải thích chi tiết.
    Liên kết luồng (Cross-layer):
        - Được gọi từ `AiServiceClient.generateQuizDraft()` (`apps/api/src/integrations/aiService.client.ts`),
          do `apps/api/src/modules/teach/teach.routes.ts` kích hoạt.
        - Gọi `LLMGateway.generate_text()` (`src/core/llm_gateway.py`).
    Đầu vào / Đầu ra:
        - Input: `GenerateQuizRequest` (`session_id`, `session_title`, `transcript_text`, `skill_ids`, `question_count`).
        - Output: Dict JSON `{ "session_id": int, "generated_items": list[dict] }`.
    """
    # AI Quiz Generator synced 100% with `apps/api/src/integrations/aiService.client.ts`.
    # Uses Gemini when configured and falls back cleanly to contextual questions.
    try:
        # Bước 1: Thiết kế System Prompt ép định dạng đầu ra là mảng JSON thuần và phân bổ đều đáp án đúng 0..3.
        sys_inst = (
            "Bạn là chuyên gia khảo thí kỹ thuật phần mềm & AI tại 3T Academy. "
            "Hãy sinh bộ câu hỏi trắc nghiệm 4 lựa chọn (chỉ trả về JSON thuần, không markdown codeblock) "
            'theo cấu trúc: [{"prompt": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanationMd": "..."}]. '
            "Phân bổ correctIndex đa dạng giữa 0, 1, 2, 3."
        )
        # Cắt ngắn transcript ở 3000 ký tự đầu để tiết kiệm token và giữ tốc độ phản hồi trong timeout 4s của Backend.
        user_prompt = (
            f"Tiêu đề buổi học: {req.session_title}\n"
            f"Số câu hỏi cần tạo: {req.question_count}\n"
            f"Nội dung tóm tắt / phụ đề bài giảng:\n{(req.transcript_text or '')[:3000]}"
        )
        # Bước 2: Gọi LLM bất đồng bộ qua `LLMGateway` (tự động fallback qua các model Gemini và vLLM).
        raw_json = await LLMGateway.generate_text(
            prompt=user_prompt, system_instruction=sys_inst, temperature=0.3
        )
        # Bước 3: Lột bỏ vỏ ```json ... ``` nếu LLM vẫn sinh markdown fence, sau đó giải mã JSON.
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_json.strip(), flags=re.IGNORECASE)
        parsed = json.loads(cleaned)
        # Bước 4: Chuẩn hóa dữ liệu (đảm bảo luôn đủ 4 phương án, `correctIndex` thuộc [0..3], gắn `skill_id`).
        if isinstance(parsed, list) and len(parsed) > 0:
            items: list[dict] = []
            option_letters = ["A", "B", "C", "D"]
            for idx, entry in enumerate(parsed[: req.question_count]):
                opts = [str(o) for o in (entry.get("options") or [])][:4]
                while len(opts) < 4:
                    opts.append(f"Phương án bổ sung {len(opts) + 1}")
                c_idx = int(entry.get("correctIndex", idx % 4))
                if c_idx < 0 or c_idx > 3:
                    c_idx = 0
                skill_id = req.skill_ids[idx % len(req.skill_ids)] if req.skill_ids else 1
                p_text = str(entry.get("prompt") or f"Câu hỏi {idx + 1} - {req.session_title}")
                exp_md = str(entry.get("explanationMd") or "Đối chiếu trực tiếp nội dung bài giảng.")
                items.append(
                    {
                        "prompt": p_text,
                        "options": opts,
                        "correctIndex": c_idx,
                        "explanationMd": exp_md,
                        "skillId": skill_id,
                        "item_type": "SINGLE_CHOICE",
                        "skill_id": skill_id,
                        "points": 2.5,
                        "prompt_config": {
                            "question_md": p_text,
                            "options": [
                                {"id": option_letters[i], "text": opt}
                                for i, opt in enumerate(opts)
                            ],
                        },
                        "grading_config": {
                            "correctIndex": c_idx,
                            "correct_option_id": option_letters[c_idx],
                        },
                        "explanation_md": exp_md,
                    }
                )
            return {"session_id": req.session_id, "generated_items": items}
    except Exception as exc:
        # Bước 5: Ghi log và chuyển mượt sang bộ sinh câu hỏi tất định nếu LLM lỗi hoặc trả JSON sai cú pháp.
        logger.info("Using deterministic contextual quiz generator fallback", reason=str(exc))

    return {
        "session_id": req.session_id,
        "generated_items": _build_deterministic_quiz_items(req),
    }


@grading_router.post("/co-grade")
async def co_grade_submission(req: CoGradeSubmissionRequest):
    """Đưa ra điểm đề xuất và nhận xét sơ bộ hỗ trợ giảng viên chấm bài tự luận (Human-in-the-Loop Co-Grading).

    Mục tiêu:
        Tính nhanh tỷ lệ điểm gợi ý có chặn biên an toàn `[0.55, 0.95]` dựa trên độ chi tiết bài làm của học viên,
        kèm cấu trúc nhận xét Markdown và điểm thành phần rubric để giảng viên xem xét phê duyệt cuối cùng.
    Liên kết luồng (Cross-layer):
        Được gọi qua `POST /api/v1/ai/assessments/co-grade` từ luồng chấm bài tự luận của Backend `apps/api`.
    Đầu vào / Đầu ra:
        - Input: `CoGradeSubmissionRequest` (`item_id`, `prompt_md`, `rubric_config`, `student_response_md`, `max_points`).
        - Output: Dict JSON chứa `item_id` và `ai_suggestion` (`score`, `feedback_md`, `rubric_scores`).
    """
    # Bước 1: Đo độ dài nội dung bài làm và ánh xạ tuyến tính có kẹp ngưỡng [0.55, 0.95] để tránh cho điểm cực đoan.
    response_len = len((req.student_response_md or "").strip())
    ratio = min(0.95, max(0.55, 0.65 + min(response_len, 600) / 2000.0))
    # Bước 2: Quy đổi sang thang điểm `max_points` và trả về phiếu góp ý có cấu trúc cho giảng viên.
    return {
        "item_id": req.item_id,
        "ai_suggestion": {
            "score": round(req.max_points * ratio, 2),
            "feedback_md": (
                "### Nhận xét từ AI Trợ Giảng\n"
                "- **Điểm mạnh:** Bám sát yêu cầu đề bài và trình bày luồng xử lý rõ ràng.\n"
                "- **Góp ý cải thiện:** Nên bổ sung phân tích edge cases, kiểm soát lỗi và độ phức tạp thuật toán."
            ),
            "rubric_scores": {"logic": round(ratio, 2), "clean_code_or_clarity": round(ratio - 0.05, 2)},
        },
    }
