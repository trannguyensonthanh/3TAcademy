"""
Cosine-Shift Topic Segmentation & MMR Extractive Summarizer (`topic_segmenter.py`)
----------------------------------------------------------------------------------
Implements two classical NLP/IR research algorithms without requiring LLM calls:
1. TextTiling Cosine-Shift Segmentation (Hearst, 1997 adapted to dense embeddings):
   Detects semantic valleys between sliding adjacent windows to generate Auto-Chapters.
2. Maximal Marginal Relevance — MMR (Carbonell & Goldstein, 1998):
   Selects top key takeaways balancing document centrality (lambda) vs redundancy (1 - lambda).
"""

import math
import re
from collections import Counter
from typing import Any, Dict, List
import numpy as np

from ..rag.embedder import compute_semantic_embedding_1024

VI_STOPWORDS = {
    "và", "là", "của", "các", "trong", "cho", "với", "để", "khi", "một", "những",
    "được", "trên", "theo", "tại", "từ", "này", "đó", "như", "có", "không", "sẽ",
    "chúng", "ta", "bạn", "hệ", "thống", "phần", "cách", "việc", "bằng", "hoặc",
}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-9:
        return 0.0
    return float(np.dot(a, b) / denom)


def _extract_top_keyphrases(text: str, limit: int = 4) -> List[str]:
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
    """
    Slides left/right windows across timestamped segments, computes depth scores
    d_t = 0.5 * ((peak_L - sim_t) + (peak_R - sim_t)), and splits chapters where
    d_t > mean(d) + 0.35 * std(d).
    """
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

    vecs = [
        np.array(compute_semantic_embedding_1024(str(s.get("text", ""))), dtype=np.float32)
        for s in segments
    ]
    n = len(segments)
    w = max(1, min(window_size, n // 2))

    sims: List[float] = []
    for i in range(n - 1):
        l_start = max(0, i - w + 1)
        r_end = min(n, i + 1 + w)
        v_left = np.mean(vecs[l_start : i + 1], axis=0)
        v_right = np.mean(vecs[i + 1 : r_end], axis=0)
        sims.append(_cosine(v_left, v_right))

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

    mean_d = float(np.mean(depths)) if depths else 0.0
    std_d = float(np.std(depths)) if depths else 0.0
    cutoff = mean_d + 0.35 * std_d

    boundaries = [0]
    for i, d_val in enumerate(depths):
        if d_val >= cutoff and d_val > 0.02 and (i + 1 - boundaries[-1]) >= 1:
            boundaries.append(i + 1)
    boundaries.append(n)

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
    """
    Maximal Marginal Relevance (MMR) Extractive Summarizer:
      MMR = argmax_{s_i in R \\ S} [ lambda * Sim(s_i, D_centroid) - (1 - lambda) * max_{s_j in S} Sim(s_i, s_j) ]
    """
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

    vecs = [
        np.array(compute_semantic_embedding_1024(c["text"]), dtype=np.float32)
        for c in candidates
    ]
    centroid = np.mean(vecs, axis=0)
    norm_c = float(np.linalg.norm(centroid))
    if norm_c > 1e-9:
        centroid = centroid / norm_c

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
