"""Bộ sinh Vector Ngữ nghĩa 1024 chiều (Semantic Feature-Hashing Embedder tương thích BGE-M3 1024-dim & Đồng bộ Bit-for-Bit với Node.js).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Cung cấp hàm biểu diễn văn bản thành vector 1024 chiều chuẩn hóa L2 (cùng số chiều với chuẩn BGE-M3 `vector(1024)`
  trong PostgreSQL `pgvector`) phục vụ truy vấn HNSW Cosine, Reranker, Career CV-JD Matching và Topic Segmentation.
- **Điểm kiến trúc đặc biệt (Cross-Language Vector Parity):**
  Hàm `compute_semantic_embedding_1024()` được thiết kế chính xác từng bit (bit-for-bit identical: dùng UTF-16 code units,
  số nguyên 32-bit có dấu `_to_int32`/`_imul32` và băm kép FNV-1a) trùng khớp 100% với hàm `computeSemanticEmbedding1024`
  bên Backend TypeScript (`apps/api/src/db/seedHelpers.ts`). Nhờ đó, vector được seed từ Node.js và vector truy vấn
  sinh ra tại Python AI Service luôn nằm trên CÙNG một không gian hình học mà không phụ thuộc GPU/Internet,
  kèm fallback tất định `make_deterministic_vector()` cho chuỗi rỗng hoặc ngoại lệ.

Liên kết chéo (Cross-layer):
- Tương thích bit-for-bit với `computeSemanticEmbedding1024` tại `apps/api/src/db/seedHelpers.ts`.
- Được gọi bởi `src/rag/retriever.py`, `src/rag/reranker.py`, `src/worker/tasks.py`,
  `src/api/routes/career_ai.py`, và `src/live_copilot/topic_segmenter.py`.
"""

import logging
import math
import re
import struct
import unicodedata
from typing import List, Tuple

logger = logging.getLogger(__name__)


def _to_int32(n: int) -> int:
    """Mô phỏng ép kiểu số nguyên có dấu 32-bit (Int32 two's complement) giống phép toán bit trong JavaScript (`| 0`)."""
    n &= 0xFFFFFFFF
    return n - 0x100000000 if (n & 0x80000000) else n


def _imul32(a: int, b: int) -> int:
    """Mô phỏng chính xác hàm nhân 32-bit `Math.imul(a, b)` của JavaScript để đảm bảo giá trị hash trùng khớp 100%."""
    return _to_int32((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF))


def make_deterministic_vector(seed_num: int, dims: int = 1024) -> List[float]:
    """Sinh vector đơn vị (L2-normalized) tất định bằng hàm lượng giác sin/cos dùng làm fallback an toàn.

    Mục tiêu:
        Khi văn bản rỗng hoặc phát sinh ngoại lệ không mong muốn, vẫn trả về vector đơn vị hợp lệ khác 0
        để tránh lỗi chia cho 0 khi tính Cosine Similarity (`<=>`) trong pgvector.
    Đầu vào / Đầu ra:
        - Input: `seed_num` (hạt giống số nguyên), `dims` (số chiều vector, mặc định 1024).
        - Output: Danh sách `dims` số thực đã chuẩn hóa độ dài L2 = 1.
    """
    vec: List[float] = []
    norm_sq = 0.0
    for i in range(dims):
        val = math.sin(seed_num * 17.31 + i * 0.73) * math.cos(seed_num * 3.17 - i * 0.29)
        vec.append(val)
        norm_sq += val * val
    norm = math.sqrt(norm_sq) or 1.0
    return [round(v / norm, 6) for v in vec]


def _clean_unicode_text(text: str) -> str:
    """Làm sạch văn bản nhưng BẢO TOÀN trọn vẹn chữ cái có dấu tiếng Việt (Unicode category `L*` & `N*`).

    Mục tiêu:
        Giữ nguyên ngữ nghĩa dấu thanh tiếng Việt ("học" khác "hóc") và các ký hiệu lập trình (`_`, `+`, `-`
        như `C++`, `node_js`, `pg-vector`), đồng thời khớp hoàn toàn với biểu thức chính quy bên JavaScript.
    """
    # Exact equivalent of JS:
    #   (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s_+-]/gu, ' ').replace(/\s+/g, ' ').trim()
    # Preserves Vietnamese Unicode letters so diacritic semantics are retained.
    lowered = (text or "").lower()
    out_chars: List[str] = []
    for ch in lowered:
        cat = unicodedata.category(ch)
        if cat.startswith("L") or cat.startswith("N") or ch in ("_", "+", "-") or ch.isspace():
            out_chars.append(ch)
        else:
            out_chars.append(" ")
    return re.sub(r"\s+", " ", "".join(out_chars)).strip()


def _utf16_code_units(s: str) -> Tuple[int, ...]:
    """Chuyển chuỗi Python (UTF-8/UCS) thành dãy mã đơn vị UTF-16LE khớp với `.charCodeAt()` của JavaScript."""
    raw = s.encode("utf-16-le")
    return struct.unpack(f"<{len(raw) // 2}H", raw)


def compute_semantic_embedding_1024(text: str, dims: int = 1024) -> List[float]:
    """Mã hóa văn bản thành vector 1024 chiều chuẩn hóa L2 bằng kỹ thuật Signed Double Feature-Hashing đa cấp N-gram.

    Mục tiêu:
        Biểu diễn đặc trưng ngôn ngữ (từ đơn Unigram trọng số 1.5, cụm 2 từ liên tiếp Bigram trọng số 2.0,
        và chuỗi con 4 ký tự Char 4-gram trọng số 0.6 giúp bắt được biến thể chính tả/từ ghép tiếng Việt)
        vào không gian 1024 chiều bằng 2 hàm băm FNV-1a có dấu (+/-) giúp triệt tiêu va chạm hash (Weinberger hashing trick).
    Liên kết luồng (Cross-layer):
        - Khớp bit-for-bit với `computeSemanticEmbedding1024` trong `apps/api/src/db/seedHelpers.ts`.
        - Được gọi bởi `embed_query_1024()`, `reranker.py`, `career_ai.py`, `topic_segmenter.py`, `worker/tasks.py`.
    Đầu vào / Đầu ra:
        - Input: `text` (chuỗi văn bản bất kỳ), `dims` (mặc định 1024 khớp cột `embedding vector(1024)` trong PostgreSQL).
        - Output: List 1024 số thực chuẩn hóa L2 (`||v||_2 = 1`), sẵn sàng cho phép đo Cosine `<=>` của pgvector.
    """
    # Bit-for-bit identical 1024-dimensional L2-normalized semantic feature-hashing vector
    # matching `computeSemanticEmbedding1024` in `apps/api/src/db/seedHelpers.ts`.
    # Bước 1: Chuẩn hóa Unicode tiếng Việt; nếu văn bản rỗng thì trả về vector tất định dự phòng.
    cleaned = _clean_unicode_text(text)
    if not cleaned:
        return make_deterministic_vector(1, dims)

    # Bước 2: Tách token (>= 2 đơn vị UTF-16) và trích xuất 3 tầng đặc trưng:
    # Unigram (w=1.5), Bigram giữ thứ tự cụm từ (w=2.0), và Character 4-gram (w=0.6) chống lỗi biến thể hình thái.
    tokens = [t for t in cleaned.split(" ") if len(_utf16_code_units(t)) >= 2]
    features: List[Tuple[str, float]] = []

    for i, tk in enumerate(tokens):
        features.append((f"u:{tk}", 1.5))
        if i + 1 < len(tokens):
            features.append((f"b:{tk}_{tokens[i + 1]}", 2.0))
        # Match JS UTF-16 `.length >= 4` and `.slice(j, j + 4)`
        if len(tk) >= 4:
            for j in range(0, len(tk) - 3):
                features.append((f"c:{tk[j : j + 4]}", 0.6))

    # Bước 3: Chiếu đặc trưng vào mảng 1024 chiều bằng băm kép FNV-1a 32-bit kèm bit dấu (+/-)
    # để giá trị kỳ vọng của nhiễu va chạm bằng 0 (bảo toàn tích vô hướng theo định lý Johnson-Lindenstrauss).
    vec = [0.0] * dims
    for feat_token, weight in features:
        h1 = 2166136261
        h2 = 16777619
        for code in _utf16_code_units(feat_token):
            h1 = _to_int32(h1 ^ code)
            h1 = _imul32(h1, 16777619)
            h2 = _to_int32(h2 ^ code)
            h2 = _imul32(h2, 1099511627)

        idx1 = abs(h1) % dims
        idx2 = abs(h2) % dims
        sign1 = 1.0 if (h1 & 1) == 0 else -1.0
        sign2 = 1.0 if (h2 & 1) == 0 else -1.0
        vec[idx1] += sign1 * weight
        vec[idx2] += sign2 * (weight * 0.5)

    # Bước 4: Chuẩn hóa L2 (`v / ||v||_2`) để khoảng cách Cosine `<=>` trong pgvector phản ánh chính xác góc giữa 2 vector.
    norm_sq = sum(v * v for v in vec)
    if norm_sq == 0.0:
        return make_deterministic_vector(1, dims)
    norm = math.sqrt(norm_sq)
    return [round(v / norm, 6) for v in vec]


def format_pgvector_literal(vec: List[float]) -> str:
    """Định dạng mảng số thực Python thành chuỗi literal chuẩn `pgvector` dạng `"[0.012345,-0.045678,...]"`."""
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


async def embed_query_1024(text: str) -> List[float]:
    """Hàm bất đồng bộ mã hóa câu hỏi truy vấn thành vector 1024 chiều (có fallback an toàn nếu gặp ngoại lệ).

    Liên kết luồng (Cross-layer):
        Được gọi bởi `retrieve_public_advisor_context()` và `retrieve_course_scoped_tutor_context()`
        trong `src/rag/retriever.py`.
    """
    try:
        return compute_semantic_embedding_1024(text, 1024)
    except Exception as exc:
        logger.warning("Fallback embedding computation warning", error=str(exc))
        return make_deterministic_vector(1, 1024)
