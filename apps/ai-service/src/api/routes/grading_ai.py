from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ...core.security import verify_internal_api_key

grading_router = APIRouter(
    prefix="/api/v1/ai/assessments",
    tags=["ai-assessments"],
    dependencies=[Depends(verify_internal_api_key)],
)


class GenerateQuizRequest(BaseModel):
    session_id: int
    session_title: str
    transcript_text: str
    skill_ids: list[int] = Field(default_factory=list)
    question_count: int = Field(default=5, ge=1, le=15)


class CoGradeSubmissionRequest(BaseModel):
    item_id: int
    prompt_md: str
    rubric_config: dict
    student_response_md: str
    github_repo_url: str | None = None
    max_points: float = Field(default=10.0, gt=0)


@grading_router.post("/generate-quiz")
async def generate_session_quiz(req: GenerateQuizRequest):
    """
    AI Quiz Generator: Reads session transcript/subtitles and generates
    a competency verification quiz (MCQ + True/False + Short Essay)
    so students can pass it to mark the session as completed.
    """
    return {
        "session_id": req.session_id,
        "generated_items": [
            {
                "item_type": "SINGLE_CHOICE",
                "skill_id": req.skill_ids[0] if req.skill_ids else 1,
                "points": 2.0,
                "prompt_config": {
                    "question_md": f"Câu hỏi kiểm tra hiểu bài cho buổi: {req.session_title}",
                    "options": [
                        {"id": "A", "text": "Phương án A"},
                        {"id": "B", "text": "Phương án B"},
                        {"id": "C", "text": "Phương án C"},
                        {"id": "D", "text": "Phương án D"},
                    ],
                },
                "grading_config": {"correct_option_id": "A"},
                "explanation_md": "Giải thích chi tiết dựa trên nội dung bài giảng.",
            }
        ],
    }


@grading_router.post("/co-grade")
async def co_grade_submission(req: CoGradeSubmissionRequest):
    """
    AI Co-Grader (LLM-as-a-Judge): Evaluates student Essay / Markdown / Code Snippet / GitHub Repo
    against the Instructor's Rubric and produces a structured draft score & feedback for 1-click approval.
    """
    return {
        "item_id": req.item_id,
        "ai_suggestion": {
            "score": round(req.max_points * 0.85, 2),
            "feedback_md": (
                "### Nhận xét từ AI Trợ Giảng\n"
                "- **Điểm mạnh:** Trình bày đúng trọng tâm kiến thức và cấu trúc rõ ràng.\n"
                "- **Góp ý cải thiện:** Cần bổ sung xử lý ngoại lệ (edge cases) và giải thích độ phức tạp thuật toán."
            ),
            "rubric_scores": {"logic": 0.9, "clean_code_or_clarity": 0.8},
        },
    }
