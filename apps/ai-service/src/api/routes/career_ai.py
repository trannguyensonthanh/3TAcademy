"""
Section-Weighted Semantic CV-JD Matching & Acoustic/STAR Fluency Rubric (`career_ai.py`)
----------------------------------------------------------------------------------------
Replaces flat keyword matching with two transparent quantitative models:
1. Section-Weighted CV-JD Cosine + IDF Technical Coverage:
   Score = 100 * (0.45 * S_skills + 0.35 * S_projects_exp + 0.20 * S_certs_edu)
2. Multi-Criteria Mock Interview Rubric:
   Evaluates Technical Concept Recall, STAR Action-Metric Structure, and Speech Fluency (WPM / filler ratio).
"""

import re
from typing import Any, Dict, List, Optional
import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.security import verify_internal_api_key
from ...rag.embedder import compute_semantic_embedding_1024

career_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["Career CV Semantic Matching & Mock Interview Rubric"],
    dependencies=[Depends(verify_internal_api_key)],
)

KNOWN_SKILLS = [
    ("Python & AsyncIO", 1.15, [r"\bpython\b", r"\bfastapi\b", r"\bpydantic\b", r"\basyncio\b"]),
    ("PostgreSQL & pgvector", 1.25, [r"\bsql\b", r"\bpostgresql\b", r"\bpostgres\b", r"\bpgvector\b", r"\bhnsw\b"]),
    ("TypeScript & Node.js", 1.15, [r"\btypescript\b", r"\bnode\.?js\b", r"\bexpress\b", r"\bdrizzle\b", r"\breact\b"]),
    ("Hybrid RAG & Agents", 1.35, [r"\brag\b", r"\brrf\b", r"\blanggraph\b", r"\bllm\b", r"\bgemini\b", r"\bembedding\b"]),
    ("Docker & CI/CD", 1.10, [r"\bdocker\b", r"\bkubernetes\b", r"\bci/cd\b", r"\bnginx\b", r"\bgithub actions\b"]),
    ("Streaming & Lakehouse", 1.30, [r"\bkafka\b", r"\bspark\b", r"\bpyspark\b", r"\bdbt\b", r"\blakehouse\b"]),
    ("Redis & Distributed Systems", 1.20, [r"\bredis\b", r"\bcache\b", r"\bqueue\b", r"\bidempotent\b", r"\bwebhook\b"]),
]

VI_FILLER_WORDS = [r"\bà\b", r"\bừm\b", r"\bờ\b", r"\bkiểu như\b", r"\bthì là\b"]


def _dense_cosine(text_a: str, text_b: str) -> float:
    if not text_a.strip() or not text_b.strip():
        return 0.0
    va = np.array(compute_semantic_embedding_1024(text_a), dtype=np.float32)
    vb = np.array(compute_semantic_embedding_1024(text_b), dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return max(0.0, float(np.dot(va, vb) / denom)) if denom > 1e-9 else 0.0


class ParseCvRequest(BaseModel):
    raw_text: Optional[str] = None
    rawText: Optional[str] = None


class ScreenCvRequest(BaseModel):
    cv_parsed_data: Dict[str, Any] = Field(default_factory=dict)
    target_level: str = "JUNIOR"
    target_role: str = "AI / Backend Engineer"
    jd_raw_text: str = ""


class EvaluateInterviewTurnRequest(BaseModel):
    question: str
    transcriptAnswer: str
    durationSeconds: float = Field(default=30.0, gt=0.5)
    expectedKeywords: List[str] = Field(default_factory=list)


@career_router.post("/cv/parse")
async def parse_cv_endpoint(req: ParseCvRequest):
    text = (req.raw_text or req.rawText or "").strip()
    lower = text.lower()

    matched_skills: List[str] = []
    for label, _idf_w, patterns in KNOWN_SKILLS:
        if any(re.search(p, lower) for p in patterns):
            matched_skills.append(label)

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

    # 1. IDF-weighted Technical Skill Coverage
    required_items: List[tuple[str, float, List[str]]] = []
    for label, idf_w, patterns in KNOWN_SKILLS:
        if any(re.search(p, jd_lower) for p in patterns):
            required_items.append((label, idf_w, patterns))
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

    # 2. Project & Quantitative Impact Evidence Score
    has_metrics = bool(re.search(r"\b(\d+%|\d+\s*ms|\d+x|p95|p99)\b", projects_section.lower()))
    s_proj_sem = min(1.0, _dense_cosine(projects_section or skills_section, jd_blob) * 2.4)
    s_projects = min(1.0, 0.75 * s_proj_sem + (0.25 if has_metrics else 0.08))

    # 3. Verified Credentials & Education Alignment
    has_3t_cert = "3t-cert" in certs_edu_section.lower() or "3t academy" in full_cv_lower
    s_certs = 0.92 if has_3t_cert else (0.72 if certs_edu_section.strip() else 0.50)

    # Section-Weighted Composite Score (45% Skills, 35% Projects/Exp, 20% Certs/Edu)
    composite = 0.45 * s_skills + 0.35 * s_projects + 0.20 * s_certs
    score = int(round(42 + composite * 54))
    score = max(42, min(97, score))

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
    return _evaluate_cv_against_jd(req)


@career_router.post("/interviews/screen-cv")
async def screen_cv_alias(req: ScreenCvRequest):
    return _evaluate_cv_against_jd(req)


@career_router.post("/mock-interviews/evaluate-answer")
async def evaluate_interview_turn(req: EvaluateInterviewTurnRequest):
    ans = req.transcriptAnswer.strip()
    words = [w for w in re.split(r"\s+", ans) if w]
    word_count = len(words)
    wpm = round((word_count / max(5.0, req.durationSeconds)) * 60.0, 1)

    filler_hits = sum(len(re.findall(pat, ans.lower())) for pat in VI_FILLER_WORDS)
    filler_ratio = filler_hits / max(1, word_count)

    # Ideal technical speaking pace in Vietnamese: 105 - 165 WPM
    pace_score = 1.0 if 95 <= wpm <= 175 else max(0.45, 1.0 - abs(wpm - 130) / 160.0)
    fluency_score = round(max(40.0, min(98.0, 100.0 * (0.75 * pace_score + 0.25 * (1.0 - min(1.0, filler_ratio * 5))))), 1)

    if req.expectedKeywords:
        hits = sum(1 for kw in req.expectedKeywords if kw.lower() in ans.lower())
        kw_recall = hits / len(req.expectedKeywords)
    else:
        kw_recall = min(1.0, _dense_cosine(req.question, ans) * 2.5)

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
