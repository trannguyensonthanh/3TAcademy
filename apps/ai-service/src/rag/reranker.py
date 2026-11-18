"""
Two-Stage Retrieval Cross-Encoder Reranker (`reranker.py`)
----------------------------------------------------------
Stage 2 precision filter applied after Stage 1 Hybrid RRF (pgvector HNSW + PostgreSQL tsvector):
- Tier 1: Local ONNX Cross-Encoder (`Xenova/ms-marco-MiniLM-L-6-v2` via `fastembed`).
- Tier 2: Calibrated Hybrid Cross-Scorer combining exact technical identifier match,
  ordered bigram overlap, token IDF coverage, and 1024-dim semantic cosine similarity.
"""

import math
import re
from typing import Any, Dict, List, Tuple
import numpy as np

from ..core.logging import logger
from ..core.model_registry import RERANKER_MODELS_DIR, has_package
from .embedder import compute_semantic_embedding_1024

_cross_encoder_instance: Any = None


def _get_onnx_cross_encoder() -> Any:
    global _cross_encoder_instance
    if _cross_encoder_instance is not None:
        return _cross_encoder_instance
    if not has_package("fastembed"):
        return None
    try:
        from fastembed.rerank.cross_encoder import TextCrossEncoder

        RERANKER_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        _cross_encoder_instance = TextCrossEncoder(
            model_name="Xenova/ms-marco-MiniLM-L-6-v2",
            cache_dir=str(RERANKER_MODELS_DIR),
        )
        return _cross_encoder_instance
    except Exception as exc:
        logger.warning("ONNX Cross-Encoder unavailable, using calibrated cross-scorer", error=str(exc))
        return None


def _sigmoid(x: float) -> float:
    x = max(-20.0, min(20.0, float(x)))
    return 1.0 / (1.0 + math.exp(-x))


def _tokenize_norm(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-zà-ỹ0-9_+-]{2,}", (text or "").lower())]


def _calibrated_pair_score(
    q_tokens: List[str],
    q_bigrams: set[Tuple[str, str]],
    q_vec: np.ndarray,
    doc_text: str,
    rrf_prior: float = 0.0,
) -> float:
    if not q_tokens or not doc_text:
        return 0.0
    d_tokens = _tokenize_norm(doc_text)
    if not d_tokens:
        return 0.0

    d_set = set(d_tokens)
    d_bigrams = set(zip(d_tokens, d_tokens[1:]))

    # 1. Length-weighted token recall (technical identifiers >= 5 chars carry higher weight)
    total_w = 0.0
    hit_w = 0.0
    for tk in set(q_tokens):
        w = 1.8 if (len(tk) >= 5 or any(c.isdigit() for c in tk)) else 1.0
        total_w += w
        if tk in d_set:
            hit_w += w
    lexical_cov = hit_w / max(1.0, total_w)

    # 2. Ordered phrase bigram precision
    bigram_cov = (
        len(q_bigrams.intersection(d_bigrams)) / max(1, len(q_bigrams))
        if q_bigrams
        else 0.0
    )

    # 3. 1024-dim semantic cosine interaction
    d_vec = np.array(compute_semantic_embedding_1024(doc_text), dtype=np.float32)
    denom = float(np.linalg.norm(q_vec) * np.linalg.norm(d_vec))
    sem_cos = float(np.dot(q_vec, d_vec) / denom) if denom > 1e-9 else 0.0

    # Calibrated logistic combination mapped to [0, 1]
    logit = -1.65 + 3.2 * lexical_cov + 2.1 * bigram_cov + 2.4 * max(0.0, sem_cos) + 18.0 * rrf_prior
    return round(_sigmoid(logit), 4)


def rerank_candidates(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 4,
    current_video_sec: int = 0,
) -> Dict[str, Any]:
    """
    Reranks retrieved chunks using Cross-Encoder scoring + optional temporal proximity boost
    when the student asks about the current lecture timestamp.
    """
    if not candidates:
        return {
            "backend": "EMPTY",
            "maxRelevanceScore": 0.0,
            "chunks": [],
        }

    docs = [str(c.get("content", "")) for c in candidates]
    q_tokens = _tokenize_norm(query)
    q_bigrams = set(zip(q_tokens, q_tokens[1:]))
    q_vec = np.array(compute_semantic_embedding_1024(query), dtype=np.float32)

    encoder = _get_onnx_cross_encoder()
    onnx_probs: List[float] = []
    backend = "CALIBRATED_HYBRID_CROSS_SCORER"

    if encoder is not None:
        try:
            raw_scores = list(encoder.rerank(query, docs))
            onnx_probs = [_sigmoid(float(s)) for s in raw_scores]
            if len(onnx_probs) == len(candidates):
                backend = "ONNX_CROSS_ENCODER_MINILM"
        except Exception as exc:
            logger.warning("ONNX Cross-Encoder runtime fallback", error=str(exc))
            onnx_probs = []

    scored: List[Dict[str, Any]] = []
    for idx, cand in enumerate(candidates):
        rrf_prior = float(cand.get("rrfScore") or cand.get("rrf_score") or 0.0)
        cal_score = _calibrated_pair_score(q_tokens, q_bigrams, q_vec, docs[idx], rrf_prior)
        if onnx_probs:
            # Blend multilingual lexical/semantic calibration with ONNX Cross-Encoder
            final_prob = 0.58 * onnx_probs[idx] + 0.42 * cal_score
        else:
            final_prob = cal_score

        # Temporal proximity boost when chunk overlaps student's active video timestamp
        st_sec = cand.get("startSec") if "startSec" in cand else cand.get("start_sec")
        en_sec = cand.get("endSec") if "endSec" in cand else cand.get("end_sec")
        if (
            current_video_sec > 0
            and st_sec is not None
            and en_sec is not None
            and (float(st_sec) - 30.0) <= current_video_sec <= (float(en_sec) + 30.0)
        ):
            final_prob = min(0.995, final_prob + 0.08)

        enriched = dict(cand)
        enriched["rerankScore"] = round(float(final_prob), 4)
        scored.append(enriched)

    scored.sort(key=lambda item: (-item["rerankScore"], int(item.get("chunkId") or item.get("id") or 0)))
    top_chunks = scored[:top_k]
    max_rel = float(top_chunks[0]["rerankScore"]) if top_chunks else 0.0

    return {
        "backend": backend,
        "maxRelevanceScore": round(max_rel, 4),
        "chunks": top_chunks,
    }
