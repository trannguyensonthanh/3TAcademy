"""
Automated Technical Lecture Video Generator for 3T Academy (`generate_lecture_videos.py`)
-----------------------------------------------------------------------------------------
Renders 1280x720 HD dark-emerald technical architecture slides via Pillow (PIL),
synthesizes natural Vietnamese instructor voiceover via Microsoft Neural TTS (`edge-tts`),
and muxes H.264 + AAC faststart MP4 lecture videos + WebVTT subtitles via FFmpeg.
"""

import asyncio
import json
import math
import os
import subprocess
import tempfile
import wave
import struct
from pathlib import Path
from typing import Any, Dict, List
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "apps" / "web" / "public" / "videos" / "lectures"

LECTURES_SPEC: List[Dict[str, Any]] = [
    {
        "slug": "ai-s01-rag-architecture",
        "courseTag": "AI-ENG-2026 · Buổi 01",
        "instructor": "TS. Lê Minh Khoa",
        "voice": "vi-VN-NamMinhNeural",
        "title": "Kiến trúc Production RAG & Phòng chống Ảo giác",
        "slides": [
            {
                "heading": "1. Vì sao Mô hình Ngôn ngữ Lớn bị Ảo giác (Hallucination)?",
                "diagram": ["User Query", "Retriever (pgvector)", "Grounded Context", "Cited Answer"],
                "bullets": [
                    "LLM đóng băng tri thức tại thời điểm huấn luyện, không biết dữ liệu nội bộ.",
                    "RAG tách biệt Kho tri thức động (Non-parametric Memory) khỏi trọng số LLM.",
                    "Bắt buộc trích dẫn nguồn [chunk_id, timestamp_sec] để kiểm chứng từng câu.",
                ],
                "code": "SELECT id, content, 1 - (embedding <=> $1) AS score FROM knowledge_chunks;",
                "narration": (
                    "Chào mừng các bạn đến với buổi một khóa Kỹ sư AI Thực chiến tại Ba Tê Academy. "
                    "Trong hệ thống doanh nghiệp, mô hình ngôn ngữ lớn rất dễ sinh ảo giác nếu tự suy diễn ngoài dữ liệu. "
                    "Kiến trúc Production RAG giải quyết triệt để vấn đề này bằng cách truy xuất đúng đoạn tài liệu chuẩn xác từ cơ sở dữ liệu vector, "
                    "sau đó ép mô hình chỉ được tổng hợp câu trả lời kèm trích dẫn mốc thời gian và trang tài liệu gốc."
                ),
            },
            {
                "heading": "2. Phân tách Quyền Truy cập Tài liệu (Multi-Tenant Isolation)",
                "diagram": ["JWT Auth", "SQL Pre-Filter", "HNSW Vector Scan", "Top-K Chunks"],
                "bullets": [
                    "Tuyệt đối lọc quyền truy cập (visibility, course_id) TRƯỚC bước tính khoảng cách.",
                    "PUBLIC chunks phục vụ tư vấn lộ trình; COURSE_SCOPED cô lập riêng cho từng lớp.",
                    "Ngăn chặn rò rỉ dữ liệu chéo giữa các khóa học và phòng ban nội bộ.",
                ],
                "code": "WHERE visibility = 'COURSE_SCOPED' AND course_id = :enrolled_course_id",
                "narration": (
                    "Điểm cốt lõi thứ hai trong thiết kế hệ thống thực tế là bảo mật phân quyền ngay tại tầng truy vấn SQL. "
                    "Trước khi quét chỉ mục vector, chúng ta bắt buộc lọc cứng điều kiện khóa học và phạm vi hiển thị ngay trong PostgreSQL. "
                    "Nhờ vậy, mô hình ngôn ngữ hoàn toàn không thể nhìn thấy bất kỳ tài liệu nào nằm ngoài quyền hạn của học viên."
                ),
            },
            {
                "heading": "3. Đo lường Chất lượng Hệ thống RAG bằng Bộ chỉ số RAGAS",
                "diagram": ["Context Precision", "Context Recall", "Faithfulness", "Latency < 800ms"],
                "bullets": [
                    "Faithfulness đo tỷ lệ mệnh đề trong câu trả lời bám sát văn bản nguồn.",
                    "Context Recall đánh giá bộ truy xuất có lấy thiếu đoạn thông tin quan trọng không.",
                    "Kết hợp kiểm tra tự động sau mỗi lần cập nhật kho tài liệu mới.",
                ],
                "code": "faithfulness_score = supported_claims / max(1, total_generated_claims)",
                "narration": (
                    "Cuối cùng, để vận hành ổn định trên môi trường thực tế, chúng ta không đánh giá cảm tính mà đo lường định lượng bằng bộ chỉ số Faithfulness và Context Recall. "
                    "Mọi câu trả lời dưới ngưỡng tin cậy đều phải từ chối lịch sự thay vì đoán mò. "
                    "Các bạn hãy hoàn thành bài kiểm tra cuối buổi đạt từ bảy mươi phần trăm trở lên để mở khóa kiến thức tiếp theo nhé."
                ),
            },
        ],
    },
    {
        "slug": "ai-s02-chunking-hnsw",
        "courseTag": "AI-ENG-2026 · Buổi 02",
        "instructor": "TS. Lê Minh Khoa",
        "voice": "vi-VN-NamMinhNeural",
        "title": "Chiến lược Chunking Đa tầng & Chỉ mục Vector HNSW",
        "slides": [
            {
                "heading": "1. Băm Tài liệu Bảo toàn Cấu trúc (Structure-Aware Chunking)",
                "diagram": ["PDF / Markdown", "Header Hierarchy", "15% Overlap", "Semantic Chunks"],
                "bullets": [
                    "Cắt cứng theo ký tự làm vỡ bảng biểu tài chính và đứt mạch câu điều kiện.",
                    "Recursive Markdown Splitter giữ nguyên tiêu đề mục cha gắn kèm từng đoạn con.",
                    "Độ gối chồng 10% đến 15% bảo toàn ngữ nghĩa tại ranh giới giữa hai đoạn.",
                ],
                "code": "chunk_size = 512 tokens | chunk_overlap = 64 tokens | preserve_tables = True",
                "narration": (
                    "Chào các bạn, trong buổi học thứ hai này chúng ta đi sâu vào kỹ thuật băm tài liệu đa tầng và đánh chỉ mục HNSW trên pgvector. "
                    "Sai lầm phổ biến nhất khi làm RAG là cắt văn bản thuần túy theo số ký tự cố định khiến bảng biểu nhiều cột bị vỡ vụn. "
                    "Thay vào đó, ta cần giữ nguyên cấu trúc bảng sang Markdown kèm tiêu đề mục cha và gối chồng mười lăm phần trăm giữa hai đoạn liên tiếp."
                ),
            },
            {
                "heading": "2. Cấu trúc Đồ thị Phân tầng HNSW trên PostgreSQL pgvector",
                "diagram": ["Layer 2 (Sparse)", "Layer 1 (Skip)", "Layer 0 (Dense)", "Cosine <=>"],
                "bullets": [
                    "HNSW xây dựng đồ thị nhiều tầng giúp độ phức tạp tìm kiếm đạt O(log N).",
                    "Tham số m = 16 kiểm soát số cạnh nối; ef_construction = 64 tăng độ chính xác.",
                    "QUAN TRỌNG: Không bọc hàm quanh cột embedding để PostgreSQL dùng được Index.",
                ],
                "code": "CREATE INDEX idx_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);",
                "narration": (
                    "Khi kho học liệu tăng lên hàng trăm nghìn đoạn văn bản, quét tuần tự sẽ gây nghẽn cổ chai. "
                    "Chỉ mục đồ thị phân tầng HNSW nhảy bước lớn ở tầng thưa phía trên rồi thu hẹp dần xuống tầng dày bên dưới với tốc độ chỉ vài mili giây. "
                    "Đặc biệt lưu ý khi viết câu truy vấn SQL, tuyệt đối dùng trực tiếp toán tử khoảng cách cosine để bộ tối ưu hóa kích hoạt đúng chỉ mục HNSW."
                ),
            },
        ],
    },
    {
        "slug": "ai-s03-hybrid-search-rrf",
        "courseTag": "AI-ENG-2026 · Buổi 03",
        "instructor": "TS. Lê Minh Khoa",
        "voice": "vi-VN-NamMinhNeural",
        "title": "Hybrid Search (Dense + BM25) & Reciprocal Rank Fusion",
        "slides": [
            {
                "heading": "1. Kết hợp Tìm kiếm Ngữ nghĩa (Dense) và Từ khóa (BM25 / FTS)",
                "diagram": ["Dense Vector", "Sparse tsvector", "RRF (k = 60)", "Cross-Encoder"],
                "bullets": [
                    "Dense Vector hiểu câu diễn đạt đồng nghĩa nhưng dễ trượt mã lỗi, mã đơn hàng.",
                    "Full-Text Search (tsvector GIN) bắt chính xác tên hàm, mã chứng chỉ, thuật ngữ.",
                    "Kết hợp hai nhánh giúp bổ khuyết hoàn hảo cả độ phủ ngữ nghĩa lẫn độ chính xác.",
                ],
                "code": "rrf_score(d) = 1.0 / (60 + rank_dense) + 1.0 / (60 + rank_bm25)",
                "narration": (
                    "Chào các bạn đến với buổi ba về thuật toán tìm kiếm lai Hybrid Search và hợp nhất thứ hạng Reciprocal Rank Fusion. "
                    "Tìm kiếm vector rất mạnh khi hiểu ý nghĩa tự nhiên nhưng thường nhầm lẫn khi người dùng gõ mã lỗi hoặc mã đơn hàng cụ thể. "
                    "Vì điểm cosine và điểm từ khóa có thang đo khác nhau, công thức RRF dùng hằng số làm mượt k bằng sáu mươi để cộng nghịch đảo thứ hạng cực kỳ ổn định."
                ),
            },
            {
                "heading": "2. Tinh lọc Kết quả bằng Mô hình Cross-Encoder Reranker",
                "diagram": ["Top-20 RRF", "Cross-Encoder Pair", "Sigmoid Score", "Top-4 Grounded"],
                "bullets": [
                    "Bi-Encoder mã hóa câu hỏi và tài liệu độc lập nên mất tương tác chéo từng từ.",
                    "Cross-Encoder đưa cặp (Query, Chunk) qua cơ chế Self-Attention chấm điểm sâu.",
                    "Chặn sớm các câu hỏi ngoài phạm vi nếu điểm Reranker tối đa dưới ngưỡng tau.",
                ],
                "code": "rel_prob = cross_encoder.predict([(query, chunk.text) for chunk in top_20])",
                "narration": (
                    "Sau khi RRF lấy ra hai mươi ứng viên tiềm năng nhất, chúng ta đưa qua tầng thứ hai là mô hình Cross Encoder Reranker. "
                    "Cross Encoder chấm điểm trực tiếp sự tương tác giữa từng từ trong câu hỏi và văn bản để chọn ra bốn đoạn chuẩn xác nhất, "
                    "đồng thời loại bỏ ngay các truy vấn lạc đề mà không cần tốn chi phí gọi mô hình sinh ngôn ngữ."
                ),
            },
        ],
    },
    {
        "slug": "swe-s01-clean-arch-postgres",
        "courseTag": "SWE-ARCH-2026 · Kiến trúc Backend",
        "instructor": "TS. Lê Minh Khoa",
        "voice": "vi-VN-NamMinhNeural",
        "title": "Clean Architecture, PostgreSQL MVCC & Chống Race Condition",
        "slides": [
            {
                "heading": "1. Tách biệt Miền Nghiệp vụ & Khóa Bi quan SELECT FOR UPDATE",
                "diagram": ["Webhook Request", "Unique Txn Key", "Row Lock FOR UPDATE", "Atomic Commit"],
                "bullets": [
                    "Webhook thanh toán ngân hàng có thể gọi lặp nhiều lần khi mạng chập chờn.",
                    "Kết hợp khóa duy nhất gateway_txn_id và khóa dòng SELECT FOR UPDATE.",
                    "Đảm bảo cộng tiền, tạo ghi danh và cấp Credit diễn ra nguyên tử (ACID).",
                ],
                "code": "SELECT id, status FROM orders WHERE id = $1 FOR UPDATE;",
                "narration": (
                    "Chào các bạn học viên khóa Kiến trúc Backend Chuyên sâu. "
                    "Khi xử lý giao dịch tài chính và đối soát chuyển khoản tự động, hai tiến trình đồng thời có thể cùng đọc trạng thái đơn hàng đang chờ và cộng trùng quyền lợi. "
                    "Sử dụng giao dịch ACID kèm khóa dòng SELECT FOR UPDATE và mã giao dịch bất biến giúp hệ thống đạt tính nhất quán tuyệt đối dưới tải cao."
                ),
            },
            {
                "heading": "2. Chẩn đoán Truy vấn Chậm với EXPLAIN (ANALYZE, BUFFERS)",
                "diagram": ["Seq Scan (Chậm)", "Composite Index", "Index Only Scan", "P99 < 15ms"],
                "bullets": [
                    "Kiểm tra số trang đọc từ đĩa (shared read) so với bộ nhớ đệm (shared hit).",
                    "Thiết kế chỉ mục tổ hợp đúng thứ tự cột lọc bằng trước, cột sắp xếp sau.",
                    "Tránh bọc hàm biến đổi trên cột có chỉ mục để không bị rơi về quét toàn bảng.",
                ],
                "code": "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE account_id = 4 ORDER BY id DESC;",
                "narration": (
                    "Mỗi khi một API báo cáo trên bảng lớn phản hồi chậm, nguyên tắc đầu tiên của kỹ sư thực chiến là đo lường bằng lệnh EXPLAIN ANALYZE BUFFERS. "
                    "Từ kế hoạch thực thi thực tế, ta xác định chính xác nút thắt quét tuần tự và thiết kế chỉ mục tổ hợp tối ưu giúp giảm độ trễ xuống dưới mười lăm mili giây."
                ),
            },
        ],
    },
    {
        "slug": "data-s01-streaming-lakehouse",
        "courseTag": "DATA-PIPE-2026 · Kỹ thuật Dữ liệu",
        "instructor": "ThS. Nguyễn Thu Hà",
        "voice": "vi-VN-HoaiMyNeural",
        "title": "Streaming Data Pipeline, Idempotency & Medallion Lakehouse",
        "slides": [
            {
                "heading": "1. Kiến trúc Medallion 3 Tầng: Bronze -> Silver -> Gold",
                "diagram": ["Event Stream", "Bronze (Raw)", "Silver (Cleaned)", "Gold (Metrics)"],
                "bullets": [
                    "Tầng Bronze lưu nguyên bản sự kiện thô phục vụ chạy lại lịch sử khi cần.",
                    "Tầng Silver khử trùng lặp (Deduplication), chuẩn hóa kiểu dữ liệu và khóa ngoại.",
                    "Tầng Gold tổng hợp sẵn các bảng chiều phục vụ báo cáo phân tích tốc độ cao.",
                ],
                "code": "MERGE INTO silver_events t USING staging s ON t.event_id = s.event_id",
                "narration": (
                    "Chào các bạn học viên khóa Kỹ thuật Dữ liệu tại Ba Tê Academy, cô là Thu Hà. "
                    "Trong bài giảng này, chúng ta thiết kế đường ống dữ liệu chuẩn Medallion gồm ba tầng Bronze, Silver và Gold. "
                    "Nhờ tính chất bất biến ở tầng Bronze và cơ chế khử trùng lặp theo khóa định danh ở tầng Silver, hệ thống luôn đảm bảo số liệu báo cáo chính xác ngay cả khi luồng thu thập thử lại nhiều lần."
                ),
            },
            {
                "heading": "2. Kiểm soát Chất lượng Dữ liệu Tự động (Data Quality Gate)",
                "diagram": ["Schema Check", "Null / Range Gate", "Freshness SLA", "Publish Mart"],
                "bullets": [
                    "Chặn sớm các bản ghi âm bất thường hoặc thiếu khóa định danh trước tầng Gold.",
                    "Theo dõi độ trễ cập nhật dữ liệu (Data Freshness) và cảnh báo tự động.",
                    "Phân vùng bảng theo ngày giúp giảm mạnh lượng dữ liệu phải quét.",
                ],
                "code": "ASSERT COUNT(*) FILTER (WHERE amount_vnd < 0) = 0;",
                "narration": (
                    "Một đường ống dữ liệu tốt không bao giờ đẩy dữ liệu bẩn lên bảng điều khiển của ban giám đốc. "
                    "Bằng cách đặt các chốt kiểm định tự động về miền giá trị, tỷ lệ rỗng và độ tươi dữ liệu trước khi xuất bản sang tầng Gold, chúng ta phát hiện và cô lập sự cố ngay lập tức."
                ),
            },
        ],
    },
    {
        "slug": "py-s01-python-sql-analytics",
        "courseTag": "PY-SQL-2026 · Lập trình Nền tảng",
        "instructor": "ThS. Nguyễn Thu Hà",
        "voice": "vi-VN-HoaiMyNeural",
        "title": "Tối ưu Python Xử lý Dữ liệu & SQL Window Functions",
        "slides": [
            {
                "heading": "1. Xử lý Dữ liệu Hiệu năng Cao trong Python & Vectorization",
                "diagram": ["Raw CSV / JSON", "Generator Stream", "Vectorized Ops", "Clean Batch"],
                "bullets": [
                    "Dùng Generator và xử lý theo lô (Batching) giúp tiết kiệm bộ nhớ RAM.",
                    "Ưu tiên phép toán vector hóa trên mảng thay cho vòng lặp for thuần túy.",
                    "Kiểm tra chặt kiểu dữ liệu đầu vào bằng Pydantic trước khi lưu cơ sở dữ liệu.",
                ],
                "code": "valid_rows = [OrderSchema.model_validate(r) for r in stream_batches(path)]",
                "narration": (
                    "Chào mừng các bạn đến với khóa Lập trình Python và SQL Thực chiến. "
                    "Khi xử lý các tập dữ liệu lớn hàng trăm nghìn dòng, việc nạp toàn bộ file vào bộ nhớ và chạy vòng lặp thủ công sẽ rất chậm. "
                    "Áp dụng Generator đọc theo lô kết hợp các phép toán vector hóa giúp tốc độ xử lý tăng gấp hàng chục lần mà vẫn giữ dung lượng bộ nhớ ổn định."
                ),
            },
            {
                "heading": "2. Phân tích Chuyên sâu với CTE & SQL Window Functions",
                "diagram": ["WITH cte AS (...)", "PARTITION BY", "ROW_NUMBER / LAG", "Top-N Insight"],
                "bullets": [
                    "CTE chia nhỏ câu truy vấn phức tạp thành từng bước logic rõ ràng, dễ bảo trì.",
                    "ROW_NUMBER() OVER (PARTITION BY ...) lấy bản ghi mới nhất của từng học viên.",
                    "LAG() và SUM() OVER tính tốc độ tăng trưởng lũy kế ngay trên một lần quét.",
                ],
                "code": "SELECT account_id, score_pct, LAG(score_pct) OVER (PARTITION BY account_id ORDER BY id) FROM attempts;",
                "narration": (
                    "Ở phần SQL thực chiến, hàm cửa sổ Window Functions là vũ khí sắc bén nhất của người làm dữ liệu và AI. "
                    "Thay vì phải nối bảng tự thân nhiều lần gây tốn kém, các hàm ROW NUMBER và LAG cho phép xếp hạng và so sánh chênh lệch điểm số giữa hai lần thi liên tiếp cực kỳ gọn gàng và nhanh chóng."
                ),
            },
        ],
    },
]


def load_font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    win_fonts = Path("C:/Windows/Fonts")
    candidates = []
    if mono:
        candidates = [win_fonts / "consolab.ttf" if bold else win_fonts / "consola.ttf"]
    elif bold:
        candidates = [win_fonts / "arialbd.ttf", win_fonts / "segoeuib.ttf"]
    else:
        candidates = [win_fonts / "arial.ttf", win_fonts / "segoeui.ttf"]

    for font_path in candidates:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size=size)
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_w: int) -> List[str]:
    words = text.split(" ")
    lines: List[str] = []
    cur = ""
    for w in words:
        test = f"{cur} {w}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_w and cur:
            lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    return lines


def render_slide_png(
    out_png: Path,
    course_tag: str,
    instructor: str,
    lecture_title: str,
    slide_idx: int,
    total_slides: int,
    slide: Dict[str, Any],
) -> None:
    W, H = 1280, 720
    img = Image.new("RGB", (W, H), (9, 17, 14))
    draw = ImageDraw.Draw(img)

    # Subtle top accent bar & card frame
    draw.rectangle([0, 0, W, 8], fill=(16, 185, 129))
    draw.rounded_rectangle([36, 30, W - 36, H - 30], radius=22, fill=(15, 26, 21), outline=(30, 58, 45), width=2)

    f_badge = load_font(18, bold=True)
    f_title = load_font(30, bold=True)
    f_heading = load_font(25, bold=True)
    f_body = load_font(21, bold=False)
    f_diag = load_font(18, bold=True)
    f_code = load_font(18, bold=False, mono=True)
    f_footer = load_font(16, bold=False)

    # Header row
    draw.rounded_rectangle([68, 54, 340, 92], radius=10, fill=(6, 78, 59))
    draw.text((84, 63), course_tag, fill=(110, 231, 183), font=f_badge)
    draw.text((W - 360, 63), f"Giảng viên: {instructor}", fill=(148, 163, 184), font=f_badge)

    draw.text((68, 108), lecture_title, fill=(236, 253, 245), font=f_title)
    draw.line([(68, 156), (W - 68, 156)], fill=(30, 58, 45), width=2)

    # Slide section heading
    draw.text((68, 176), slide["heading"], fill=(52, 211, 153), font=f_heading)

    # Architecture Flow Diagram Boxes
    nodes: List[str] = slide.get("diagram", [])
    if nodes:
        box_y1, box_y2 = 226, 294
        gap = 34
        avail_w = W - 136 - gap * (len(nodes) - 1)
        box_w = avail_w // len(nodes)
        for i, node_label in enumerate(nodes):
            bx1 = 68 + i * (box_w + gap)
            bx2 = bx1 + box_w
            draw.rounded_rectangle(
                [bx1, box_y1, bx2, box_y2],
                radius=12,
                fill=(19, 38, 30),
                outline=(16, 185, 129),
                width=2,
            )
            tb = draw.textbbox((0, 0), node_label, font=f_diag)
            tx = bx1 + (box_w - (tb[2] - tb[0])) // 2
            ty = box_y1 + (68 - (tb[3] - tb[1])) // 2 - 2
            draw.text((tx, ty), node_label, fill=(240, 253, 244), font=f_diag)
            if i < len(nodes) - 1:
                ax1 = bx2 + 6
                ax2 = bx2 + gap - 6
                ay = (box_y1 + box_y2) // 2
                draw.line([(ax1, ay), (ax2, ay)], fill=(52, 211, 153), width=3)
                draw.polygon([(ax2, ay), (ax2 - 8, ay - 6), (ax2 - 8, ay + 6)], fill=(52, 211, 153))

    # Bullet points
    cur_y = 324
    for b in slide.get("bullets", []):
        wrapped = wrap_text(draw, f"•  {b}", f_body, W - 150)
        for j, ln in enumerate(wrapped):
            draw.text((76 + (22 if j > 0 else 0), cur_y), ln, fill=(226, 232, 240), font=f_body)
            cur_y += 32
        cur_y += 8

    # Code / Formula Box
    code_str = slide.get("code", "")
    if code_str:
        draw.rounded_rectangle(
            [68, H - 154, W - 68, H - 90],
            radius=12,
            fill=(6, 12, 10),
            outline=(45, 85, 65),
            width=2,
        )
        draw.text((90, H - 132), code_str, fill=(110, 231, 183), font=f_code)

    # Footer
    draw.text(
        (68, H - 66),
        "3T Academy · Học liệu Video Bài giảng Kỹ thuật Chuẩn Production (Đồng bộ Phụ đề & AI RAG)",
        fill=(100, 116, 139),
        font=f_footer,
    )
    draw.text(
        (W - 190, H - 66),
        f"Slide {slide_idx}/{total_slides}",
        fill=(52, 211, 153),
        font=f_badge,
    )

    img.save(out_png, format="PNG")


def generate_fallback_wav(out_wav: Path, duration_sec: float = 16.0) -> None:
    sample_rate = 16000
    n_samples = int(sample_rate * duration_sec)
    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            env = 0.04 * math.sin(2 * math.pi * 220.0 * (i / sample_rate))
            val = int(max(-32767, min(32767, env * 32767)))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(bytes(frames))


async def synthesize_narration_audio(text: str, voice: str, out_audio: Path) -> None:
    try:
        import edge_tts

        communicate = edge_tts.Communicate(text=text, voice=voice, rate="+4%")
        await communicate.save(str(out_audio))
        if out_audio.exists() and out_audio.stat().st_size > 512:
            return
    except Exception as exc:
        print(f"[WARN] edge-tts unavailable ({type(exc).__name__}), trying Google Vietnamese TTS...")

    # Tier-2: Google Vietnamese Neural TTS (`tl=vi`) via httpx (sentence-chunked <= 180 chars)
    try:
        import re
        import urllib.parse
        import httpx

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
        chunks: List[str] = []
        for s in sentences:
            while len(s) > 180:
                cut = s.rfind(" ", 0, 180)
                if cut <= 0:
                    cut = 180
                chunks.append(s[:cut].strip())
                s = s[cut:].strip()
            if s:
                chunks.append(s)

        mp3_parts = bytearray()
        async with httpx.AsyncClient(
            timeout=12.0,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        ) as client:
            for chunk in chunks:
                q = urllib.parse.quote(chunk)
                url = f"https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q={q}"
                resp = await client.get(url)
                resp.raise_for_status()
                mp3_parts.extend(resp.content)

        if len(mp3_parts) > 1024:
            out_audio.write_bytes(bytes(mp3_parts))
            return
    except Exception as exc2:
        print(f"[WARN] Google Vietnamese TTS fallback triggered: {exc2}")

    wav_fallback = out_audio.with_suffix(".wav")
    est_dur = max(12.0, len(text.split()) / 2.8)
    generate_fallback_wav(wav_fallback, est_dur)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_fallback), "-c:a", "libmp3lame", "-q:a", "4", str(out_audio)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def probe_duration_seconds(media_path: Path) -> float:
    res = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(media_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(res.stdout.strip())


def format_vtt_ts(sec: float) -> str:
    ms = int(round((sec - math.floor(sec)) * 1000))
    total_s = int(math.floor(sec))
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


async def build_all_lectures() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: Dict[str, Any] = {}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        for lec in LECTURES_SPEC:
            slug = lec["slug"]
            out_mp4 = OUTPUT_DIR / f"{slug}.mp4"
            out_vtt = OUTPUT_DIR / f"{slug}.vtt"
            slides = lec["slides"]
            segment_files: List[Path] = []
            cues: List[Dict[str, Any]] = []
            cursor_sec = 0.0

            print(f"Building lecture video: {slug} ({len(slides)} slides)...")
            for idx, sl in enumerate(slides, start=1):
                png_path = tmp_dir / f"{slug}_s{idx}.png"
                mp3_path = tmp_dir / f"{slug}_s{idx}.mp3"
                seg_mp4 = tmp_dir / f"{slug}_s{idx}.mp4"

                render_slide_png(
                    out_png=png_path,
                    course_tag=lec["courseTag"],
                    instructor=lec["instructor"],
                    lecture_title=lec["title"],
                    slide_idx=idx,
                    total_slides=len(slides),
                    slide=sl,
                )
                await synthesize_narration_audio(sl["narration"], lec["voice"], mp3_path)
                seg_dur = probe_duration_seconds(mp3_path)

                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-loop",
                        "1",
                        "-framerate",
                        "15",
                        "-i",
                        str(png_path),
                        "-i",
                        str(mp3_path),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-tune",
                        "stillimage",
                        "-pix_fmt",
                        "yuv420p",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "128k",
                        "-ar",
                        "44100",
                        "-shortest",
                        str(seg_mp4),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                real_seg_dur = probe_duration_seconds(seg_mp4)
                cues.append(
                    {
                        "slideNumber": idx,
                        "heading": sl["heading"],
                        "startSec": round(cursor_sec, 2),
                        "endSec": round(cursor_sec + real_seg_dur, 2),
                        "text": sl["narration"],
                    }
                )
                cursor_sec += real_seg_dur
                segment_files.append(seg_mp4)

            concat_txt = tmp_dir / f"{slug}_concat.txt"
            concat_txt.write_text(
                "\n".join(f"file '{p.as_posix()}'" for p in segment_files),
                encoding="utf-8",
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(concat_txt),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(out_mp4),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            total_dur = int(round(probe_duration_seconds(out_mp4)))
            vtt_lines = ["WEBVTT", ""]
            for c in cues:
                vtt_lines.append(f"{format_vtt_ts(c['startSec'])} --> {format_vtt_ts(c['endSec'])}")
                vtt_lines.append(f"{lec['instructor']}: {c['text']}")
                vtt_lines.append("")
            out_vtt.write_text("\n".join(vtt_lines), encoding="utf-8")

            manifest[slug] = {
                "videoPath": f"/videos/lectures/{slug}.mp4",
                "vttPath": f"/videos/lectures/{slug}.vtt",
                "durationSeconds": total_dur,
                "title": lec["title"],
                "instructor": lec["instructor"],
                "cues": cues,
            }
            print(f"  -> Saved {out_mp4.name} ({total_dur}s, {out_mp4.stat().st_size // 1024} KB)")

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"All {len(manifest)} technical lecture videos generated successfully!")


if __name__ == "__main__":
    asyncio.run(build_all_lectures())
