import logging
import math
import re
import struct
import unicodedata
from typing import List, Tuple

logger = logging.getLogger(__name__)


def _to_int32(n: int) -> int:
    n &= 0xFFFFFFFF
    return n - 0x100000000 if (n & 0x80000000) else n


def _imul32(a: int, b: int) -> int:
    return _to_int32((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF))


def make_deterministic_vector(seed_num: int, dims: int = 1024) -> List[float]:
    vec: List[float] = []
    norm_sq = 0.0
    for i in range(dims):
        val = math.sin(seed_num * 17.31 + i * 0.73) * math.cos(seed_num * 3.17 - i * 0.29)
        vec.append(val)
        norm_sq += val * val
    norm = math.sqrt(norm_sq) or 1.0
    return [round(v / norm, 6) for v in vec]


def _clean_unicode_text(text: str) -> str:
    """
    Exact equivalent of JS:
      (text || '').toLowerCase().replace(/[^\\p{L}\\p{N}\\s_+-]/gu, ' ').replace(/\\s+/g, ' ').trim()
    Preserves Vietnamese Unicode letters so diacritic semantics are retained.
    """
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
    raw = s.encode("utf-16-le")
    return struct.unpack(f"<{len(raw) // 2}H", raw)


def compute_semantic_embedding_1024(text: str, dims: int = 1024) -> List[float]:
    """
    Bit-for-bit identical 1024-dimensional L2-normalized semantic feature-hashing vector
    matching `computeSemanticEmbedding1024` in `apps/api/src/db/seedHelpers.ts`.
    """
    cleaned = _clean_unicode_text(text)
    if not cleaned:
        return make_deterministic_vector(1, dims)

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

    norm_sq = sum(v * v for v in vec)
    if norm_sq == 0.0:
        return make_deterministic_vector(1, dims)
    norm = math.sqrt(norm_sq)
    return [round(v / norm, 6) for v in vec]


def format_pgvector_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


async def embed_query_1024(text: str) -> List[float]:
    try:
        return compute_semantic_embedding_1024(text, 1024)
    except Exception as exc:
        logger.warning("Fallback embedding computation warning", error=str(exc))
        return make_deterministic_vector(1, 1024)
