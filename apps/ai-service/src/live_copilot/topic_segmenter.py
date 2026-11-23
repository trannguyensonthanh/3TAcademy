"""
Cosine-Shift Topic Segmentation & MMR Extractive Summarizer (`topic_segmenter.py`)
----------------------------------------------------------------------------------
Implements two classical NLP/IR research algorithms without requiring LLM calls:
1. TextTiling Cosine-Shift Segmentation (Hearst, 1997 adapted to dense embeddings):
   Detects semantic valleys between sliding adjacent windows to generate Auto-Chapters.
2. Maximal Marginal Relevance — MMR (Carbonell & Goldstein, 1998):
   Selects top key takeaways balancing document centrality (lambda) vs redundancy (1 - lambda).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Đảm nhận tầng phân tích ngữ nghĩa bài giảng hoàn toàn không tốn chi phí LLM token (chạy nội bộ 100% CPU):
  + Tự động chia mục lục chương (`autoChapters`) cho video bài giảng từ danh sách đoạn phụ đề có mốc thời gian.
  + Rút trích các câu trọng tâm đại diện (`extractiveSummary`) có gắn timestamp `[MM:SS]` đảm bảo bao phủ rộng
    chủ đề mà không lặp ý.

Liên kết chéo (Cross-layer):
- Được gọi bởi `src/api/routes/media_ai.py` (`POST /api/v1/ai/media/transcribe-and-summarize`) và
  tác vụ nền `process_live_recording()` trong `src/worker/tasks.py`.
- Sử dụng vector 1024 chiều từ `compute_semantic_embedding_1024()` trong `src/rag/embedder.py`.
"""

import math
import re
from collections import Counter
from typing import Any, Dict, List
import numpy as np

from ..rag.embedder import compute_semantic_embedding_1024

# Danh sách từ dừng (Stopwords) tiếng Việt phổ biến cần loại bỏ khi rút trích cụm từ khóa đại diện cho tiêu đề chương.
VI_STOPWORDS = {
    "và", "là", "của", "các", "trong", "cho", "với", "để", "khi", "một", "những",
    "được", "trên", "theo", "tại", "từ", "này", "đó", "như", "có", "không", "sẽ",
    "chúng", "ta", "bạn", "hệ", "thống", "phần", "cách", "việc", "bằng", "hoặc",
}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Tính độ tương đồng Cosine giữa hai vector NumPy (`(a · b) / (||a|| * ||b||)`), an toàn khi chia cho 0."""
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-9:
        return 0.0
    return float(np.dot(a, b) / denom)


def _extract_top_keyphrases(text: str, limit: int = 4) -> List[str]:
    """Trích xuất các thuật ngữ nổi bật nhất trong một chương dựa trên tần suất xuất hiện và độ dài từ.

    Mục tiêu:
        Tạo tên chương tự động ngắn gọn, giàu thông tin mà không cần gọi LLM; ưu tiên từ xuất hiện nhiều,
        và khi hòa tần suất thì ưu tiên từ dài hơn (thường là thuật ngữ kỹ thuật chuyên ngành).
    """
    tokens = [
        t
        for t in re.findall(r"[A-Za-zÀ-ỹ0-9_+-]{3,}", text)
        if t.lower() not in VI_STOPWORDS and not t.isdigit()
    ]
    counts = Counter(tokens)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0])))
    return [w for w, _ in ranked[:limit]]


def segment_topics_cosine_shift(
    segments: List[Dict[str, Any]], window_size: int = 2
) -> List[Dict[str, Any]]:
    """Phân đoạn chủ đề tự động (Auto-Chapters) bằng thuật toán TextTiling Cosine-Shift (Hearst, 1997).

    Mục tiêu:
        Phát hiện các điểm chuyển đổi chủ đề trong bài giảng bằng cách trượt 2 cửa sổ liền kề trái/phải
        trên chuỗi vector embedding của từng đoạn thoại:
        - Tại ranh giới giữa 2 chủ đề khác nhau, độ tương đồng Cosine `sim_t` giữa cửa sổ trái và phải
          sẽ tụt sâu tạo thành "thung lũng ngữ nghĩa" (semantic valley).
        - Điểm độ sâu thung lũng `d_t = 0.5 * ((peak_L - sim_t) + (peak_R - sim_t))` vượt ngưỡng thích nghi
          `mean(d) + 0.35 * std(d)` sẽ được chọn làm điểm cắt chương mới.
    Liên kết luồng (Cross-layer):
        Được gọi bởi `src/api/routes/media_ai.py` và `src/worker/tasks.py`.
        Sử dụng `compute_semantic_embedding_1024()` (`src/rag/embedder.py`).
    Đầu vào / Đầu ra:
        - Input: `segments` (list đoạn thoại có `startSec`, `endSec`, `text`), `window_size` (kích thước cửa sổ trượt).
        - Output: Danh sách chương `[{"chapterOrder", "startSec", "endSec", "title", "keyConcepts", "summary"}, ...]`.
    """
    # Slides left/right windows across timestamped segments, computes depth scores
    # d_t = 0.5 * ((peak_L - sim_t) + (peak_R - sim_t)), and splits chapters where
    # d_t > mean(d) + 0.35 * std(d).
    # Bước 1: Xử lý trường hợp biên rỗng hoặc quá ngắn (<= 2 đoạn thoại -> gom thành 1 chương duy nhất).
    if not segments:
        return []
    if len(segments) <= 2:
        joined = " ".join(str(s.get("text", "")) for s in segments).strip()
        kws = _extract_top_keyphrases(joined, 3)
        return [
            {
                "chapterOrder": 1,
                "startSec": float(segments[0].get("startSec", 0.0)),
                "endSec": float(segments[-1].get("endSec", 0.0)),
                "title": f"Trọng tâm: {', '.join(kws)}" if kws else "Nội dung bài giảng",
                "keyConcepts": kws,
                "summary": joined[:240],
            }
        ]

    # Bước 2: Mã hóa từng đoạn thoại sang không gian vector ngữ nghĩa 1024 chiều.
    vecs = [
        np.array(compute_semantic_embedding_1024(str(s.get("text", ""))), dtype=np.float32)
        for s in segments
    ]
    n = len(segments)
    w = max(1, min(window_size, n // 2))

    # Bước 3: Trượt cặp cửa sổ trái `[i-w+1..i]` và phải `[i+1..i+w]`, tính độ tương đồng Cosine `sims[i]`
    # giữa vector trung bình (centroid) của 2 cửa sổ tại mỗi ranh giới ứng viên `i`.
    sims: List[float] = []
    for i in range(n - 1):
        l_start = max(0, i - w + 1)
        r_end = min(n, i + 1 + w)
        v_left = np.mean(vecs[l_start : i + 1], axis=0)
        v_right = np.mean(vecs[i + 1 : r_end], axis=0)
        sims.append(_cosine(v_left, v_right))

    # Bước 4: Tính điểm độ sâu thung lũng (Depth Score) tại mỗi vị trí: leo dốc sang trái (`peak_l`) và
    # sang phải (`peak_r`) để đo mức tụt tương đồng cục bộ `d_t`.
    depths: List[float] = []
    for i, s_val in enumerate(sims):
        peak_l = s_val
        for j in range(i - 1, -1, -1):
            if sims[j] >= peak_l:
                peak_l = sims[j]
            else:
                break
        peak_r = s_val
        for j in range(i + 1, len(sims)):
            if sims[j] >= peak_r:
                peak_r = sims[j]
            else:
                break
        depths.append(0.5 * ((peak_l - s_val) + (peak_r - s_val)))

    # Bước 5: Chọn ranh giới cắt chương theo ngưỡng thích nghi thống kê (`mean + 0.35 * std` và > 0.02 để lọc nhiễu).
    mean_d = float(np.mean(depths)) if depths else 0.0
    std_d = float(np.std(depths)) if depths else 0.0
    cutoff = mean_d + 0.35 * std_d

    boundaries = [0]
    for i, d_val in enumerate(depths):
        if d_val >= cutoff and d_val > 0.02 and (i + 1 - boundaries[-1]) >= 1:
            boundaries.append(i + 1)
    boundaries.append(n)

    # Bước 6: Đóng gói các đoạn giữa từng cặp ranh giới thành danh sách chương kèm từ khóa và tóm lược đầu chương.
    chapters: List[Dict[str, Any]] = []
    for c_idx in range(len(boundaries) - 1):
        st_i, en_i = boundaries[c_idx], boundaries[c_idx + 1]
        chunk_segs = segments[st_i:en_i]
        if not chunk_segs:
            continue
        chapter_text = " ".join(str(s.get("text", "")) for s in chunk_segs).strip()
        kws = _extract_top_keyphrases(chapter_text, 4)
        chapters.append(
            {
                "chapterOrder": len(chapters) + 1,
                "startSec": round(float(chunk_segs[0].get("startSec", 0.0)), 2),
                "endSec": round(float(chunk_segs[-1].get("endSec", 0.0)), 2),
                "title": f"Phần {len(chapters) + 1}: {', '.join(kws[:3])}" if kws else f"Phần {len(chapters) + 1}",
                "keyConcepts": kws,
                "summary": chapter_text[:280],
            }
        )
    return chapters


def summarize_extractive_mmr(
    segments: List[Dict[str, Any]],
    max_sentences: int = 4,
    lambda_param: float = 0.72,
) -> Dict[str, Any]:
    """Tóm tắt trích chọn giảm trùng lặp bằng thuật toán Maximal Marginal Relevance — MMR (Carbonell & Goldstein, 1998).

    Mục tiêu:
        Chọn ra tối đa `max_sentences` câu nguyên gốc từ bài giảng (100% trung thực, không bịa đặt như LLM)
        thỏa mãn tối đa hóa đồng thời 2 tiêu chí đối nghịch:
        - **Độ đại diện (Relevance/Centrality, trọng số `lambda = 0.72`):** Gần với vector tâm `D_centroid` của toàn bài giảng.
        - **Độ đa dạng (Diversity, trọng số `1 - lambda = 0.28`):** Khác biệt tối đa với các câu đã chọn trước đó trong tập `S`.
        Công thức chọn tham lam từng bước:
        `MMR = argmax_{s_i in R \\ S} [ lambda * Sim(s_i, D_centroid) - (1 - lambda) * max_{s_j in S} Sim(s_i, s_j) ]`.
    Liên kết luồng (Cross-layer):
        Được gọi bởi `src/api/routes/media_ai.py` và `src/worker/tasks.py` (ghi vào `class_sessions.ai_summary_md`).
    Đầu vào / Đầu ra:
        - Input: `segments` (list đoạn phụ đề), `max_sentences` (số câu tóm tắt), `lambda_param` (hệ số cân bằng).
        - Output: Dict `{"algorithm": str, "bullets": list[dict], "summaryMd": str}`.
    """
    # Maximal Marginal Relevance (MMR) Extractive Summarizer:
    #   MMR = argmax_{s_i in R \ S} [ lambda * Sim(s_i, D_centroid) - (1 - lambda) * max_{s_j in S} Sim(s_i, s_j) ]
    # Bước 1: Tách các đoạn thoại thành danh sách câu ứng viên (>= 5 từ để loại câu cảm thán ngắn) kèm mốc thời gian.
    candidates: List[Dict[str, Any]] = []
    for seg in segments:
        raw_txt = str(seg.get("text", "")).strip()
        for sent in re.split(r"(?<=[.!?])\s+", raw_txt):
            clean = sent.strip()
            if len(clean.split()) >= 5:
                candidates.append(
                    {
                        "text": clean,
                        "startSec": float(seg.get("startSec", 0.0)),
                        "endSec": float(seg.get("endSec", 0.0)),
                    }
                )

    if not candidates:
        return {"bullets": [], "summaryMd": "", "algorithm": "MMR_EXTRACTIVE"}

    # Bước 2: Mã hóa từng câu ứng viên sang vector 1024 chiều và tính vector tâm (`centroid`) chuẩn hóa của toàn bài giảng.
    vecs = [
        np.array(compute_semantic_embedding_1024(c["text"]), dtype=np.float32)
        for c in candidates
    ]
    centroid = np.mean(vecs, axis=0)
    norm_c = float(np.linalg.norm(centroid))
    if norm_c > 1e-9:
        centroid = centroid / norm_c

    # Bước 3: Lặp tham lam chọn từng câu tối đa hóa điểm MMR = `lambda * centrality - (1 - lambda) * redundancy`.
    doc_sims = [_cosine(v, centroid) for v in vecs]
    selected_indices: List[int] = []
    k = min(max_sentences, len(candidates))

    while len(selected_indices) < k:
        best_idx = -1
        best_mmr = -1e9
        for idx in range(len(candidates)):
            if idx in selected_indices:
                continue
            redundancy = (
                max(_cosine(vecs[idx], vecs[sel]) for sel in selected_indices)
                if selected_indices
                else 0.0
            )
            mmr_score = lambda_param * doc_sims[idx] - (1.0 - lambda_param) * redundancy
            if mmr_score > best_mmr:
                best_mmr = mmr_score
                best_idx = idx
        if best_idx < 0:
            break
        selected_indices.append(best_idx)

    # Bước 4: Sắp xếp lại các câu đã chọn theo đúng trình tự thời gian bài giảng và định dạng Markdown kèm `[MM:SS]`.
    # Sort selected highlights chronologically for natural lecture reading order
    selected_indices.sort()
    bullets: List[Dict[str, Any]] = []
    md_lines = ["### Tóm tắt Trọng tâm Bài giảng (MMR Extractive)"]
    for idx in selected_indices:
        item = candidates[idx]
        mm = int(math.floor(item["startSec"] // 60))
        ss = int(math.floor(item["startSec"] % 60))
        stamp = f"{mm:02d}:{ss:02d}"
        bullets.append(
            {
                "timestamp": stamp,
                "startSec": round(item["startSec"], 2),
                "text": item["text"],
                "centralityScore": round(doc_sims[idx], 3),
            }
        )
        md_lines.append(f"- **[{stamp}]** {item['text']}")

    return {
        "algorithm": f"MMR_EXTRACTIVE (lambda={lambda_param})",
        "bullets": bullets,
        "summaryMd": "\n".join(md_lines),
    }
