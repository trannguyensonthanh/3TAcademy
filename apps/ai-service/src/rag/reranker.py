"""
Two-Stage Retrieval Cross-Encoder Reranker (`reranker.py`)
----------------------------------------------------------
Stage 2 precision filter applied after Stage 1 Hybrid RRF (pgvector HNSW + PostgreSQL tsvector):
- Tier 1: Local ONNX Cross-Encoder (`Xenova/ms-marco-MiniLM-L-6-v2` via `fastembed`).
- Tier 2: Calibrated Hybrid Cross-Scorer combining exact technical identifier match,
  ordered bigram overlap, token IDF coverage, and 1024-dim semantic cosine similarity.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Thực thi Giai đoạn 2 (Precision Reranking) của kiến trúc truy xuất 2 tầng (Two-Stage Retrieval):
  sau khi Giai đoạn 1 (`retriever.py`) kéo về tập ứng viên rộng bằng Bi-Encoder/BM25, Cross-Encoder đọc
  đồng thời cặp `(Query, Document)` để tinh lọc và sắp xếp lại Top-K đoạn văn bản chính xác nhất đưa vào LLM.
- Hỗ trợ pha trộn (ensemble) giữa Cross-Encoder ONNX local (`58%`) và bộ chấm hiệu chuẩn đa ngôn ngữ (`42%`),
  giúp vẫn chính xác cao trên tiếng Việt chuyên ngành, đồng thời cộng điểm ưu tiên theo mốc giây video (`±30s`)
  khi học viên hỏi trực tiếp nội dung đang phát.

Liên kết chéo (Cross-layer):
- Được gọi bởi node `grade_documents_node` trong `src/rag/agent_graph.py`.
- Sử dụng `RERANKER_MODELS_DIR`, `has_package` (`src/core/model_registry.py`) và
  `compute_semantic_embedding_1024` (`src/rag/embedder.py`).
"""

import math
import re
from typing import Any, Dict, List, Tuple
import numpy as np

from ..core.logging import logger
from ..core.model_registry import RERANKER_MODELS_DIR, has_package
from .embedder import compute_semantic_embedding_1024

# Biến toàn cục giữ singleton mô hình ONNX Cross-Encoder sau lần nạp đầu tiên (tránh nạp lại vào RAM mỗi request).
_cross_encoder_instance: Any = None


def _get_onnx_cross_encoder() -> Any:
    """Khởi tạo lười (lazy load) mô hình Cross-Encoder ONNX (`Xenova/ms-marco-MiniLM-L-6-v2`) qua `fastembed`.

    Mục tiêu:
        Chạy suy luận Cross-Encoder ngay trên CPU bằng ONNX Runtime với trọng số lưu cache tại
        `apps/ai-service/models/reranker`; nếu chưa cài `fastembed` hoặc thiếu file thì trả về `None`
        để rơi mượt sang Tier 2 (`_calibrated_pair_score`).
    """
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
    """Hàm kích hoạt Logistic Sigmoid `1 / (1 + e^-x)` có kẹp biên `[-20, 20]` tránh tràn số thực (`OverflowError`)."""
    x = max(-20.0, min(20.0, float(x)))
    return 1.0 / (1.0 + math.exp(-x))


def _tokenize_norm(text: str) -> List[str]:
    """Tách token chữ thường bảo toàn dấu tiếng Việt và ký hiệu kỹ thuật (`_`, `+`, `-`), loại từ ngắn < 2 ký tự."""
    return [t for t in re.findall(r"[a-zà-ỹ0-9_+-]{2,}", (text or "").lower())]


def _calibrated_pair_score(
    q_tokens: List[str],
    q_bigrams: set[Tuple[str, str]],
    q_vec: np.ndarray,
    doc_text: str,
    rrf_prior: float = 0.0,
) -> float:
    """Tính xác suất liên quan hiệu chuẩn `[0, 1]` cho cặp `(Query, Document)` dựa trên 4 tín hiệu kết hợp.

    Mục tiêu:
        Bổ trợ tiếng Việt chuyên ngành cho Cross-Encoder tiếng Anh (MS-MARCO) và đóng vai trò bộ chấm dự phòng
        khi không có ONNX Runtime. Kết hợp tuyến tính 4 tín hiệu qua hàm sigmoid:
        1. Độ phủ từ vựng có trọng số (từ dài >= 5 ký tự hoặc chứa chữ số mang trọng số 1.8 vì thường là thuật ngữ/mã).
        2. Độ khớp cụm 2 từ đúng thứ tự (Ordered Bigram Overlap).
        3. Độ tương đồng Cosine trong không gian vector ngữ nghĩa 1024 chiều.
        4. Điểm tiên nghiệm `rrf_prior` từ Stage 1 Hybrid RRF.
    """
    if not q_tokens or not doc_text:
        return 0.0
    d_tokens = _tokenize_norm(doc_text)
    if not d_tokens:
        return 0.0

    d_set = set(d_tokens)
    d_bigrams = set(zip(d_tokens, d_tokens[1:]))

    # Bước 1: Tính độ phủ từ vựng có trọng số — ưu tiên thuật ngữ kỹ thuật dài/chứa số (`w = 1.8`).
    # 1. Length-weighted token recall (technical identifiers >= 5 chars carry higher weight)
    total_w = 0.0
    hit_w = 0.0
    for tk in set(q_tokens):
        w = 1.8 if (len(tk) >= 5 or any(c.isdigit() for c in tk)) else 1.0
        total_w += w
        if tk in d_set:
            hit_w += w
    lexical_cov = hit_w / max(1.0, total_w)

    # Bước 2: Tính độ khớp cụm 2 từ liên tiếp (Bigram) để phân biệt tài liệu thực sự nói về đúng khái niệm ghép.
    # 2. Ordered phrase bigram precision
    bigram_cov = (
        len(q_bigrams.intersection(d_bigrams)) / max(1, len(q_bigrams))
        if q_bigrams
        else 0.0
    )

    # Bước 3: Tính độ tương đồng ngữ nghĩa Cosine trên vector 1024 chiều.
    # 3. 1024-dim semantic cosine interaction
    d_vec = np.array(compute_semantic_embedding_1024(doc_text), dtype=np.float32)
    denom = float(np.linalg.norm(q_vec) * np.linalg.norm(d_vec))
    sem_cos = float(np.dot(q_vec, d_vec) / denom) if denom > 1e-9 else 0.0

    # Bước 4: Tổ hợp logit hiệu chuẩn (bias -1.65) và ánh xạ qua Sigmoid về xác suất `[0, 1]`.
    # Calibrated logistic combination mapped to [0, 1]
    logit = -1.65 + 3.2 * lexical_cov + 2.1 * bigram_cov + 2.4 * max(0.0, sem_cos) + 18.0 * rrf_prior
    return round(_sigmoid(logit), 4)


def rerank_candidates(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 4,
    current_video_sec: int = 0,
) -> Dict[str, Any]:
    """Xếp hạng lại (Stage 2 Reranking) tập ứng viên từ Hybrid Search để chọn ra `top_k` đoạn liên quan nhất.

    Mục tiêu:
        Tinh lọc độ chính xác (Precision@K) trước khi đưa ngữ cảnh vào LLM; đồng thời trả về
        `maxRelevanceScore` làm căn cứ cho nút CRAG Grade quyết định đi tiếp sang Generate hay quay vòng Rewrite Query.
    Liên kết luồng (Cross-layer):
        Được gọi bởi `grade_documents_node()` trong `src/rag/agent_graph.py`.
    Đầu vào / Đầu ra:
        - Input: `query` (câu hỏi hiện tại), `candidates` (danh sách chunk từ `retriever.py`),
          `top_k` (số chunk giữ lại), `current_video_sec` (giây video hiện tại để cộng thưởng gần thời điểm `+0.08`).
        - Output: Dict `{"backend": str, "maxRelevanceScore": float, "chunks": list[dict]}`.
    """
    # Reranks retrieved chunks using Cross-Encoder scoring + optional temporal proximity boost
    # when the student asks about the current lecture timestamp.
    if not candidates:
        return {
            "backend": "EMPTY",
            "maxRelevanceScore": 0.0,
            "chunks": [],
        }

    # Bước 1: Tiền xử lý câu hỏi 1 lần duy nhất (tokens, bigrams, vector 1024-dim) để tái dùng cho mọi ứng viên.
    docs = [str(c.get("content", "")) for c in candidates]
    q_tokens = _tokenize_norm(query)
    q_bigrams = set(zip(q_tokens, q_tokens[1:]))
    q_vec = np.array(compute_semantic_embedding_1024(query), dtype=np.float32)

    # Bước 2: Thử suy luận Tier 1 bằng ONNX Cross-Encoder cục bộ; chuyển raw logits qua Sigmoid về [0, 1].
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

    # Bước 3: Chấm điểm từng ứng viên — pha trộn 58% ONNX Cross-Encoder + 42% Calibrated Scorer (nếu ONNX sẵn sàng),
    # và cộng thưởng Temporal Proximity (+0.08) nếu đoạn transcript nằm trong cửa sổ ±30 giây quanh mốc video đang xem.
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

    # Bước 4: Sắp xếp giảm dần theo `rerankScore`, cắt Top-K và trích `maxRelevanceScore` làm ngưỡng kích hoạt CRAG.
    scored.sort(key=lambda item: (-item["rerankScore"], int(item.get("chunkId") or item.get("id") or 0)))
    top_chunks = scored[:top_k]
    max_rel = float(top_chunks[0]["rerankScore"]) if top_chunks else 0.0

    return {
        "backend": backend,
        "maxRelevanceScore": round(max_rel, 4),
        "chunks": top_chunks,
    }
