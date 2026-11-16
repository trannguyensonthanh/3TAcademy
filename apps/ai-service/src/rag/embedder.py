import math
import re
import unicodedata
from typing import List
from ..core.llm_gateway import get_gemini_client
from ..core.logging import logger


def _normalize_vietnamese_tokens(text: str) -> List[str]:
    lowered = text.lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"[^a-z0-9\s]", " ", stripped)
    return [tok for tok in cleaned.split() if len(tok) >= 2]


def compute_semantic_embedding_1024(text: str, dims: int = 1024) -> List[float]:
    """
    Computes a deterministic, L2-normalized 1024-dimensional semantic feature-hashing
    embedding vector (unigrams + bigrams + character trigrams) compatible with
    PostgreSQL pgvector(1024) Cosine Similarity (`1 - (embedding <=> query_vec)`).
    Matches the exact algorithm in `apps/api/src/db/seedHelpers.ts`.
    """
    vec = [0.0] * dims
    tokens = _normalize_vietnamese_tokens(text)

    if not tokens:
        vec[0] = 1.0
        return vec

    features: List[str] = []
    for i, tok in enumerate(tokens):
        features.append(f"u:{tok}")
        features.append(f"u:{tok}")  # boost exact token match
        if i + 1 < len(tokens):
            features.append(f"b:{tokens[i]}_{tokens[i + 1]}")
        if len(tok) >= 4:
            for c in range(len(tok) - 2):
                features.append(f"c:{tok[c : c + 3]}")

    mask32 = 0xFFFFFFFF
    for feat in features:
        h1 = 2166136261
        h2 = 16777619
        for ch in feat:
            code = ord(ch)
            h1 = ((h1 ^ code) * 16777619) & mask32
            h2 = ((h2 + code) * 1099511627) & mask32

        idx1 = h1 % dims
        idx2 = h2 % dims
        sign1 = 1.0 if (h1 & 1) == 0 else -1.0
        sign2 = 1.0 if (h2 & 1) == 0 else -1.0
        vec[idx1] += sign1 * 1.0
        vec[idx2] += sign2 * 0.5

    norm_sq = sum(v * v for v in vec)
    norm = math.sqrt(norm_sq) if norm_sq > 0 else 1.0
    return [round(v / norm, 6) for v in vec]


def format_pgvector_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


async def embed_query_1024(text: str) -> List[float]:
    """
    Returns the 1024-dimensional normalized vector for pgvector retrieval.
    Uses the deterministic semantic embedding space matching seeded knowledge_chunks
    so Cosine Similarity in PostgreSQL pgvector is 100% aligned.
    """
    try:
        return compute_semantic_embedding_1024(text, 1024)
    except Exception as exc:
        logger.warning("Fallback embedding computation warning", error=str(exc))
        vec = [0.0] * 1024
        vec[0] = 1.0
        return vec
