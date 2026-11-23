"""Bộ phân mảnh tài liệu Markdown theo cấu trúc đoạn (Structure-Aware Chunking có gối đầu Overlap).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Là bước tiền xử lý đầu tiên trong đường ống nạp tri thức (RAG Ingestion Pipeline).
- Chia nhỏ tài liệu học tập / slide Markdown dài thành các mảnh (`chunks`) vừa tầm khoảng 800 ký tự
  mà không cắt đứt giữa chừng một đoạn văn hay tiêu đề, đồng thời giữ lại đoạn cuối làm vùng gối đầu
  (`chunk_overlap = 150`) để bảo toàn mạch ngữ cảnh giữa 2 chunk liền kề.

Liên kết chéo (Cross-layer):
- Được gọi trong luồng nạp tài liệu nền (`src/worker/tasks.py`) trước khi mã hóa vector bằng `src/rag/embedder.py`
  và lưu vào bảng PostgreSQL `knowledge_chunks`.
"""

import re
from typing import List, Dict, Any


def chunk_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> List[Dict[str, Any]]:
    """Phân mảnh văn bản Markdown theo ranh giới đoạn văn (`\\n\\n+`) có duy trì độ gối đầu (overlap).

    Mục tiêu:
        Tránh hiện tượng cắt ngang câu/ý khi chia cứng theo số ký tự; giữ lại đoạn văn cuối cùng nếu đủ ngắn
        (`< chunk_overlap`) sang chunk kế tiếp để các câu hỏi nằm ở ranh giới hai đoạn vẫn truy xuất đủ ngữ cảnh.
    Liên kết luồng (Cross-layer):
        Đầu ra danh sách chunk (`{"content", "length"}`) được truyền tiếp vào `compute_semantic_embedding_1024()`
        (`src/rag/embedder.py`) để tạo vector 1024 chiều lưu vào pgvector.
    Đầu vào / Đầu ra:
        - Input:
            + `text`: Nội dung Markdown/văn bản nguồn.
            + `chunk_size`: Ngưỡng độ dài mục tiêu mỗi chunk (mặc định 800 ký tự).
            + `chunk_overlap`: Ngưỡng độ dài tối đa của đoạn cuối được giữ lại để gối đầu (mặc định 150 ký tự).
        - Output: Danh sách dict `[{"content": str, "length": int}, ...]`.
    """
    # Splits text by markdown headings and paragraphs while maintaining overlap.
    # Bước 1: Tách tài liệu thành các đoạn tự nhiên dựa trên dòng trống kép (`\n\n+`), giữ nguyên tiêu đề và khối văn bản.
    paragraphs = re.split(r"\n\n+", text)
    chunks = []
    current_chunk = []
    current_length = 0

    # Bước 2: Gom tuần tự các đoạn vào `current_chunk` cho đến khi vượt ngưỡng `chunk_size`.
    for p in paragraphs:
        p_len = len(p)
        if current_length + p_len > chunk_size and current_chunk:
            combined = "\n\n".join(current_chunk)
            chunks.append({"content": combined, "length": len(combined)})
            # Bước 3: Duy trì ngữ cảnh nối tiếp (Overlap) bằng cách giữ lại đoạn cuối nếu nhỏ hơn `chunk_overlap`.
            # Keep last paragraph for overlap
            current_chunk = [current_chunk[-1]] if len(current_chunk[-1]) < chunk_overlap else []
            current_length = len(current_chunk[0]) if current_chunk else 0

        current_chunk.append(p)
        current_length += p_len

    # Bước 4: Đẩy phần đoạn văn còn tồn đọng cuối cùng thành chunk cuối.
    if current_chunk:
        combined = "\n\n".join(current_chunk)
        chunks.append({"content": combined, "length": len(combined)})

    return chunks

