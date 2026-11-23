"""
Section-Weighted Semantic CV-JD Matching & Acoustic/STAR Fluency Rubric (`career_ai.py`)
----------------------------------------------------------------------------------------
Replaces flat keyword matching with two transparent quantitative models:
1. Section-Weighted CV-JD Cosine + IDF Technical Coverage:
   Score = 100 * (0.45 * S_skills + 0.35 * S_projects_exp + 0.20 * S_certs_edu)
2. Multi-Criteria Mock Interview Rubric:
   Evaluates Technical Concept Recall, STAR Action-Metric Structure, and Speech Fluency (WPM / filler ratio).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Đảm nhận toàn bộ nghiệp vụ Hướng nghiệp & Phỏng vấn giả lập 2 vòng (Career Center & Mock Interviews):
  + Trích xuất cấu trúc hồ sơ từ văn bản CV (`/api/v1/ai/cv/parse`).
  + Sàng lọc & chấm điểm độ khớp CV-JD theo mô hình định lượng phân mục kết hợp trọng số IDF + Dense Cosine Embedding
    (`/api/v1/ai/mock-interviews/round1-cv-defense` và alias `/api/v1/ai/interviews/screen-cv`).
  + Đánh giá từng lượt trả lời phỏng vấn Vòng 2 theo 3 trụ cột: Kỹ thuật (50%), Cấu trúc STAR (30%),
    và Độ lưu loát giọng nói WPM/từ đệm (20%) (`/api/v1/ai/mock-interviews/evaluate-answer`).

Liên kết chéo (Cross-layer):
- Được gọi từ `apps/api/src/modules/profile/profile.routes.ts` (dòng ~605, ~924) thông qua
  `apps/api/src/integrations/aiService.client.ts`:
  + `aiServiceClient.parseCvPdf()` -> `POST /api/v1/ai/cv/parse`
  + `aiServiceClient.screenCv()` -> `POST /api/v1/ai/mock-interviews/round1-cv-defense`
- Gọi tiếp xuống `compute_semantic_embedding_1024()` trong `src/rag/embedder.py` để tính độ tương đồng ngữ nghĩa 1024 chiều.
- Bảo vệ bởi `verify_internal_api_key` (`X-Internal-Key`).
"""

import re
from typing import Any, Dict, List, Optional
import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...rag.embedder import compute_semantic_embedding_1024

# Khai báo router AI Hướng nghiệp & Phỏng vấn giả lập.
career_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["Career CV Semantic Matching & Mock Interview Rubric"],
    dependencies=[Depends(verify_internal_api_key)],
)

# Bộ từ điển 10 kỹ năng cốt lõi đồng bộ 1-1 với bảng `skills` chuẩn hóa trong PostgreSQL (`seed.ts`),
# đi kèm trọng số IDF (kỹ năng chuyên sâu như RAG, AI Agents, Data Pipeline có trọng số cao hơn)
# và danh sách mẫu regex nhận diện biến thể từ khóa trong CV / JD.
KNOWN_SKILLS = [
    ("Lập trình Python (PYTHON)", 1.15, [r"\bpython\b", r"\bfastapi\b", r"\bpydantic\b", r"\basyncio\b", r"\bpytest\b"]),
    ("SQL & Cơ sở dữ liệu (SQL)", 1.20, [r"\bsql\b", r"\bpostgresql\b", r"\bpostgres\b", r"\bmysql\b", r"\bcte\b", r"\bwindow function\b"]),
    ("Hệ thống RAG & Tìm kiếm Ngữ nghĩa (RAG)", 1.35, [r"\brag\b", r"\bpgvector\b", r"\bhnsw\b", r"\brrf\b", r"\bembedding\b", r"\bchunking\b", r"\brerank"]),
    ("AI Agents & Điều phối Công cụ (AI_AGENTS)", 1.35, [r"\bagent\b", r"\blanggraph\b", r"\bfunction calling\b", r"\breact\b", r"\btool calling\b", r"\bmcp\b"]),
    ("Đánh giá & Vận hành AI (LLMOPS)", 1.30, [r"\bllmops\b", r"\bragas\b", r"\bguardrails\b", r"\bllm\b", r"\bgemini\b", r"\blangfuse\b", r"\bsse\b"]),
    ("Backend TypeScript & API (BACKEND_TS)", 1.15, [r"\btypescript\b", r"\bnode\.?js\b", r"\bexpress\b", r"\bdrizzle\b", r"\bzod\b", r"\brest\s*api\b"]),
    ("Thiết kế Hệ thống & Caching (SYSTEM_DESIGN)", 1.25, [r"\bredis\b", r"\bcache\b", r"\bqueue\b", r"\bidempotent\b", r"\bwebhook\b", r"\brate limit", r"\bsystem design\b"]),
    ("Docker, CI/CD & Triển khai (DEVOPS)", 1.15, [r"\bdocker\b", r"\bkubernetes\b", r"\bci/cd\b", r"\bnginx\b", r"\bgithub actions\b", r"\bdevops\b"]),
    ("Data Pipeline & Streaming (DATA_PIPELINE)", 1.30, [r"\bkafka\b", r"\bspark\b", r"\bpyspark\b", r"\bstreaming\b", r"\betl\b", r"\bairflow\b"]),
    ("Data Warehouse & Modeling (DATA_MODELING)", 1.25, [r"\bdbt\b", r"\blakehouse\b", r"\bstar schema\b", r"\bdata warehouse\b", r"\bmedallion\b", r"\bfeature store\b"]),
]

# Danh sách từ đệm tiếng Việt thường xuất hiện khi ứng viên ngập ngừng, dùng để tính tỷ lệ filler trong độ lưu loát.
VI_FILLER_WORDS = [r"\bà\b", r"\bừm\b", r"\bờ\b", r"\bkiểu như\b", r"\bthì là\b"]


def _dense_cosine(text_a: str, text_b: str) -> float:
    """Tính độ tương đồng Cosine giữa hai đoạn văn bản trong không gian vector ngữ nghĩa 1024 chiều.

    Mục tiêu:
        Bắt được sự tương đồng về ngữ nghĩa giữa CV/câu trả lời và JD/câu hỏi ngay cả khi cách diễn đạt
        không trùng khít từng từ khóa (ví dụ "truy vấn vector" vẫn gần nghĩa với "pgvector / HNSW").
    Liên kết luồng (Cross-layer):
        Gọi `compute_semantic_embedding_1024()` từ `src/rag/embedder.py`.
    Đầu vào / Đầu ra:
        - Input: `text_a`, `text_b` (2 chuỗi văn bản).
        - Output: Giá trị thực trong `[0.0, 1.0]` (`max(0, cos(va, vb))`).
    """
    if not text_a.strip() or not text_b.strip():
        return 0.0
    va = np.array(compute_semantic_embedding_1024(text_a), dtype=np.float32)
    vb = np.array(compute_semantic_embedding_1024(text_b), dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return max(0.0, float(np.dot(va, vb) / denom)) if denom > 1e-9 else 0.0


class ParseCvRequest(BaseModel):
    """Schema yêu cầu phân tích CV thô (hỗ trợ cả `raw_text` snake_case và `rawText` camelCase)."""

    raw_text: Optional[str] = None
    rawText: Optional[str] = None


class ScreenCvRequest(BaseModel):
    """Schema yêu cầu sàng lọc CV đối chiếu với Mô tả Công việc (JD) cho Vòng 1 phỏng vấn."""

    cv_parsed_data: Dict[str, Any] = Field(default_factory=dict)
    target_level: str = "JUNIOR"
    target_role: str = "AI / Backend Engineer"
    jd_raw_text: str = ""


class EvaluateInterviewTurnRequest(BaseModel):
    """Schema đầu vào chấm điểm một lượt trả lời phỏng vấn (Vòng 2) kèm thời lượng nói và từ khóa kỳ vọng."""

    question: str
    transcriptAnswer: str
    durationSeconds: float = Field(default=30.0, gt=0.5)
    expectedKeywords: List[str] = Field(default_factory=list)


@career_router.post("/cv/parse")
async def parse_cv_endpoint(req: ParseCvRequest):
    """Trích xuất kỹ năng chuyên môn, số điện thoại Việt Nam, link GitHub và LinkedIn từ văn bản CV.

    Mục tiêu:
        Tự động điền sẵn hồ sơ năng lực học viên khi người dùng tải lên CV PDF/text thay vì phải nhập tay.
    Liên kết luồng (Cross-layer):
        - Được gọi bởi `aiServiceClient.parseCvPdf()` (`apps/api/src/integrations/aiService.client.ts`),
          từ `apps/api/src/modules/profile/profile.routes.ts`.
    Đầu vào / Đầu ra:
        - Input: `ParseCvRequest` (`raw_text` / `rawText`).
        - Output: Dict JSON gồm `skills`, `externalSkills`, `projects`, `phone`, `githubUrl`, `linkedinUrl`.
    """
    # Bước 1: Chuẩn hóa văn bản CV đầu vào sang chữ thường để so khớp biểu thức chính quy không phân biệt hoa/thường.
    text = (req.raw_text or req.rawText or "").strip()
    lower = text.lower()

    # Bước 2: Dò khớp từng nhóm kỹ năng trong danh mục `KNOWN_SKILLS`.
    matched_skills: List[str] = []
    for label, _idf_w, patterns in KNOWN_SKILLS:
        if any(re.search(p, lower) for p in patterns):
            matched_skills.append(label)

    # Bước 3: Dùng Regex trích xuất thông tin liên hệ và đường dẫn hồ sơ kỹ thuật (SĐT VN, GitHub, LinkedIn).
    phone_match = re.search(r"(?:\+?84|0)(?:[\s.-]*\d){8,10}", text)
    github_match = re.search(r"https?://(?:www\.)?github\.com/[A-Za-z0-9_.-]+", text, re.I)
    linkedin_match = re.search(
        r"https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9_.-]+", text, re.I
    )

    return {
        "skills": matched_skills,
        "externalSkills": [{"name": s, "note": "Trích xuất cấu trúc từ CV"} for s in matched_skills],
        "projects": [],
        "phone": re.sub(r"\s+", "", phone_match.group(0)) if phone_match else None,
        "githubUrl": github_match.group(0) if github_match else None,
        "linkedinUrl": linkedin_match.group(0) if linkedin_match else None,
    }


def _evaluate_cv_against_jd(req: ScreenCvRequest) -> Dict[str, Any]:
    """Đánh giá định lượng độ phù hợp CV-JD theo mô hình trọng số 3 phân mục (Section-Weighted Semantic Matching).

    Mục tiêu:
        Thay thế việc đếm từ khóa phẳng bằng công thức minh bạch, giải thích được:
        `Composite = 0.45 * S_skills + 0.35 * S_projects + 0.20 * S_certs`,
        trong đó kết hợp cả độ phủ kỹ năng theo trọng số IDF, độ tương đồng ngữ nghĩa Dense Cosine 1024-dim,
        chỉ số định lượng tác động dự án (`%`, `ms`, `P95`, `2x`) và chứng chỉ xác thực.
    Liên kết luồng (Cross-layer):
        Được dùng chung bởi 2 endpoint `round1_cv_defense()` và `screen_cv_alias()`;
        gọi `_dense_cosine()` -> `compute_semantic_embedding_1024()`.
    Đầu vào / Đầu ra:
        - Input: `ScreenCvRequest` (`cv_parsed_data`, `target_level`, `target_role`, `jd_raw_text`).
        - Output: Dict JSON gồm `matchScore`/`match_score` (thang 42..97), `sectionScores`, `matchedSkills`,
          `missingSkills`/`missing_skills`, và `feedback` giải trình chi tiết.
    """
    # Bước 1: Gom nội dung CV theo 3 phân mục độc lập (Kỹ năng, Dự án/Kinh nghiệm, Chứng chỉ/Học vấn)
    # để đánh trọng số riêng biệt thay vì trộn lẫn toàn bộ CV thành một khối phẳng.
    cv = req.cv_parsed_data or {}
    jd_blob = f"{req.target_role} {req.target_level} {req.jd_raw_text}".strip()
    jd_lower = jd_blob.lower()

    # Extract structured CV sections
    skills_section = " ".join(
        [str(x) for x in (cv.get("skills") or [])]
        + [str(x) for x in (cv.get("externalSkills") or [])]
        + [str(cv.get("headline") or ""), str(cv.get("careerObjective") or "")]
    )
    projects_section = " ".join(
        str(p) for p in (cv.get("projects") or []) + (cv.get("workExperience") or [])
    ) or str(cv.get("summaryBio") or "")
    certs_edu_section = " ".join(
        str(e) for e in (cv.get("awardsAndCerts") or []) + (cv.get("education") or [])
    )
    full_cv_lower = f"{skills_section} {projects_section} {certs_edu_section}".lower()

    # Bước 2: Tính điểm phân mục 1 — Độ phủ kỹ năng có trọng số IDF (70%) + Tương đồng ngữ nghĩa (30%).
    # 1. IDF-weighted Technical Skill Coverage
    required_items: List[tuple[str, float, List[str]]] = []
    for label, idf_w, patterns in KNOWN_SKILLS:
        if any(re.search(p, jd_lower) for p in patterns):
            required_items.append((label, idf_w, patterns))
    # Nếu JD viết chung chung không nhắc kỹ năng cụ thể nào, lấy 4 nhóm kỹ năng nền tảng làm chuẩn đối chiếu.
    if not required_items:
        required_items = KNOWN_SKILLS[:4]

    present: List[str] = []
    missing: List[str] = []
    earned_idf = 0.0
    total_idf = 0.0
    for label, idf_w, patterns in required_items:
        total_idf += idf_w
        if any(re.search(p, full_cv_lower) for p in patterns):
            present.append(label)
            earned_idf += idf_w
        else:
            missing.append(label)

    s_skills_idf = earned_idf / max(1.0, total_idf)
    s_skills_sem = min(1.0, _dense_cosine(skills_section or full_cv_lower, jd_blob) * 2.2)
    s_skills = 0.70 * s_skills_idf + 0.30 * s_skills_sem

    # Bước 3: Tính điểm phân mục 2 — Tương đồng ngữ nghĩa dự án với JD (75%) + điểm thưởng số liệu định lượng (25%).
    # 2. Project & Quantitative Impact Evidence Score
    has_metrics = bool(re.search(r"\b(\d+%|\d+\s*ms|\d+x|p95|p99)\b", projects_section.lower()))
    s_proj_sem = min(1.0, _dense_cosine(projects_section or skills_section, jd_blob) * 2.4)
    s_projects = min(1.0, 0.75 * s_proj_sem + (0.25 if has_metrics else 0.08))

    # Bước 4: Tính điểm phân mục 3 — Bằng cấp & Chứng chỉ xác thực (ưu tiên chứng chỉ nội bộ 3T-CERT).
    # 3. Verified Credentials & Education Alignment
    has_3t_cert = "3t-cert" in certs_edu_section.lower() or "3t academy" in full_cv_lower
    s_certs = 0.92 if has_3t_cert else (0.72 if certs_edu_section.strip() else 0.50)

    # Bước 5: Tổng hợp điểm có trọng số (45% / 35% / 20%) và chuẩn hóa về thang điểm [42, 97] để phản hồi tự nhiên.
    # Section-Weighted Composite Score (45% Skills, 35% Projects/Exp, 20% Certs/Edu)
    composite = 0.45 * s_skills + 0.35 * s_projects + 0.20 * s_certs
    score = int(round(42 + composite * 54))
    score = max(42, min(97, score))

    # Bước 6: Sinh nhận xét Markdown giải trình minh bạch từng phân mục và chỉ ra kỹ năng còn thiếu.
    feedback = (
        f"Đánh giá định lượng theo trọng số phân mục cho vị trí **{req.target_role}** ({req.target_level}) đạt **{score}/100** "
        f"(Độ phủ kỹ năng IDF: `{round(s_skills * 100)}%`, Dự án thực chiến: `{round(s_projects * 100)}%`, Bằng cấp/Chứng chỉ: `{round(s_certs * 100)}%`). "
        + (f"Khớp tốt: {', '.join(present)}. " if present else "")
        + (
            f"Cần bổ sung minh chứng dự án cho: {', '.join(missing)}."
            if missing
            else "Hồ sơ bao phủ đầy đủ các năng lực cốt lõi của JD."
        )
    )

    return {
        "matchScore": score,
        "match_score": score,
        "sectionScores": {
            "skillsCoveragePct": round(s_skills * 100, 1),
            "projectImpactPct": round(s_projects * 100, 1),
            "credentialsPct": round(s_certs * 100, 1),
        },
        "matchedSkills": present,
        "missingSkills": missing,
        "missing_skills": missing,
        "feedback": feedback,
    }


@career_router.post("/mock-interviews/round1-cv-defense")
async def round1_cv_defense(req: ScreenCvRequest):
    """Endpoint Phỏng vấn giả lập Vòng 1 (CV Defense / Sàng lọc CV-JD).

    Liên kết luồng (Cross-layer):
        Được gọi bởi `aiServiceClient.screenCv()` (`apps/api/src/integrations/aiService.client.ts`),
        từ `apps/api/src/modules/profile/profile.routes.ts`.
    """
    return _evaluate_cv_against_jd(req)


@career_router.post("/interviews/screen-cv")
async def screen_cv_alias(req: ScreenCvRequest):
    """Endpoint alias cho sàng lọc CV-JD (giữ tương thích ngược với các caller dùng đường dẫn `/interviews/screen-cv`)."""
    return _evaluate_cv_against_jd(req)


@career_router.post("/mock-interviews/evaluate-answer")
async def evaluate_interview_turn(req: EvaluateInterviewTurnRequest):
    """Endpoint Phỏng vấn giả lập Vòng 2: Chấm điểm câu trả lời theo Rubric đa tiêu chí (Technical + STAR + Fluency).

    Mục tiêu:
        Đánh giá toàn diện một lượt trả lời phỏng vấn bằng 3 thành phần định lượng:
        1. `technicalScore` (trọng số 50%): Tỷ lệ nhắc đúng `expectedKeywords` (hoặc độ tương đồng Cosine với câu hỏi).
        2. `starStructureScore` (trọng số 30%): Phát hiện động từ hành động/kết quả theo mô hình STAR và độ đầy đủ ý.
        3. `fluencyScore` (trọng số 20%): Tốc độ nói chuẩn tiếng Việt kỹ thuật (95–175 WPM) trừ điểm tỷ lệ từ đệm.
    Liên kết luồng (Cross-layer):
        Được gọi qua `POST /api/v1/ai/mock-interviews/evaluate-answer` từ luồng phỏng vấn Vòng 2 của Backend `apps/api`.
        Gọi `_dense_cosine()` khi không có danh sách từ khóa kỳ vọng cố định.
    Đầu vào / Đầu ra:
        - Input: `EvaluateInterviewTurnRequest` (`question`, `transcriptAnswer`, `durationSeconds`, `expectedKeywords`).
        - Output: Dict JSON gồm `overallScore`, `technicalScore`, `starStructureScore`, `fluencyScore`, `speechMetrics`.
    """
    # Bước 1: Tách từ và tính tốc độ nói WPM (Words Per Minute) cùng mật độ từ đệm (`à`, `ừm`, `ờ`...).
    ans = req.transcriptAnswer.strip()
    words = [w for w in re.split(r"\s+", ans) if w]
    word_count = len(words)
    wpm = round((word_count / max(5.0, req.durationSeconds)) * 60.0, 1)

    filler_hits = sum(len(re.findall(pat, ans.lower())) for pat in VI_FILLER_WORDS)
    filler_ratio = filler_hits / max(1, word_count)

    # Bước 2: Chấm điểm độ lưu loát (`fluency_score`) — dải tốc độ lý tưởng 95..175 WPM (tâm 130 WPM),
    # kết hợp phạt khi tỷ lệ từ đệm cao.
    # Ideal technical speaking pace in Vietnamese: 105 - 165 WPM
    pace_score = 1.0 if 95 <= wpm <= 175 else max(0.45, 1.0 - abs(wpm - 130) / 160.0)
    fluency_score = round(max(40.0, min(98.0, 100.0 * (0.75 * pace_score + 0.25 * (1.0 - min(1.0, filler_ratio * 5))))), 1)

    # Bước 3: Chấm độ phủ kiến thức kỹ thuật (`kw_recall`) bằng so khớp từ khóa kỳ vọng hoặc Dense Cosine fallback.
    if req.expectedKeywords:
        hits = sum(1 for kw in req.expectedKeywords if kw.lower() in ans.lower())
        kw_recall = hits / len(req.expectedKeywords)
    else:
        kw_recall = min(1.0, _dense_cosine(req.question, ans) * 2.5)

    # Bước 4: Đánh giá cấu trúc STAR (tìm dấu hiệu Hành động & Kết quả) và tính tổng điểm có trọng số 50/30/20.
    has_action_result = bool(re.search(r"\b(triển khai|tối ưu|giảm|tăng|kết quả|ví dụ|sử dụng)\b", ans.lower()))
    star_score = round(min(96.0, 62.0 + (22.0 if has_action_result else 6.0) + min(12.0, word_count / 8.0)), 1)
    tech_score = round(max(38.0, min(98.0, 48.0 + kw_recall * 48.0)), 1)
    overall = round(0.50 * tech_score + 0.30 * star_score + 0.20 * fluency_score, 1)

    return {
        "overallScore": overall,
        "technicalScore": tech_score,
        "starStructureScore": star_score,
        "fluencyScore": fluency_score,
        "speechMetrics": {
            "wordCount": word_count,
            "wordsPerMinute": wpm,
            "fillerCount": filler_hits,
        },
    }
