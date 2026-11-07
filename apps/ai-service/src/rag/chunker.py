import re
from typing import List, Dict, Any


def chunk_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> List[Dict[str, Any]]:
    """
    Splits text by markdown headings and paragraphs while maintaining overlap.
    """
    paragraphs = re.split(r"\n\n+", text)
    chunks = []
    current_chunk = []
    current_length = 0

    for p in paragraphs:
        p_len = len(p)
        if current_length + p_len > chunk_size and current_chunk:
            combined = "\n\n".join(current_chunk)
            chunks.append({"content": combined, "length": len(combined)})
            # Keep last paragraph for overlap
            current_chunk = [current_chunk[-1]] if len(current_chunk[-1]) < chunk_overlap else []
            current_length = len(current_chunk[0]) if current_chunk else 0

        current_chunk.append(p)
        current_length += p_len

    if current_chunk:
        combined = "\n\n".join(current_chunk)
        chunks.append({"content": combined, "length": len(combined)})

    return chunks

