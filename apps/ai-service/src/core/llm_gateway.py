"""Cổng gọi Mô hình Ngôn ngữ Lớn (LLM Gateway) có cơ chế Fallback đa tầng và Circuit Breaker.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Là điểm truy cập duy nhất từ toàn bộ AI Service tới các mô hình LLM (Cloud Gemini REST API và Self-hosted vLLM).
- Hiện thực chiến lược chịu lỗi (High Availability) theo chuỗi fallback tuần tự:
  `GEMINI_MODEL (cấu hình người dùng) -> gemini-3.5-flash -> gemini-3.1-flash-lite -> gemini-3.8-flash -> vLLM (Qwen2.5-7B-Instruct)`.
- Tích hợp cơ chế Circuit Breaker (cooldown 60 giây cho vLLM khi bị lỗi) và dùng chung `httpx.AsyncClient`
  (HTTP keep-alive pool) để gọi bất đồng bộ không chặn event loop của FastAPI.

Liên kết chéo (Cross-layer):
- Được gọi bởi `src/rag/agent_graph.py`, `src/api/routes/grading_ai.py`, `src/api/routes/career_ai.py`.
- Đóng client trong `lifespan()` tại `src/main.py` (`close_http_client()`).
- Đọc `GEMINI_API_KEY`, `GEMINI_MODEL`, `VLLM_API_BASE`, `VLLM_API_KEY` từ `src/core/config.py`.
"""

import time
from typing import Any, Dict, List
import httpx
from .config import is_valid_gemini_key, settings
from .logging import logger

# Biến toàn cục lưu giữ HTTP client tái sử dụng kết nối TCP/TLS và mốc thời gian cooldown cho vLLM.
http_client: httpx.AsyncClient | None = None
vllm_cooldown_until: float = 0.0


def get_http_client() -> httpx.AsyncClient:
    """Khởi tạo lười (lazy init) và trả về `httpx.AsyncClient` dùng chung cho toàn tiến trình.

    Mục tiêu:
        Tái sử dụng connection pool (HTTP/1.1 Keep-Alive) giúp giảm độ trễ TLS handshake khi gọi Gemini/vLLM liên tục.
    Liên kết luồng (Cross-layer):
        Được gọi nội bộ trong `LLMGateway.generate_text()`.
    Đầu vào / Đầu ra:
        - Input: Không có.
        - Output: Instance `httpx.AsyncClient` với timeout mặc định 20 giây.
    """
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=20.0)
    return http_client


async def close_http_client() -> None:
    """Đóng sạch `httpx.AsyncClient` khi tắt ứng dụng FastAPI để giải phóng socket.

    Mục tiêu:
        Tránh cảnh báo rò rỉ tài nguyên mạng khi Uvicorn shutdown.
    Liên kết luồng (Cross-layer):
        Được gọi trong khối shutdown của `lifespan()` tại `src/main.py`.
    """
    global http_client
    if http_client is not None:
        await http_client.aclose()
        http_client = None


class LLMGateway:
    """Lớp cổng điều phối gọi LLM bất đồng bộ hỗ trợ chuỗi fallback đa model và tự phục hồi."""

    @staticmethod
    async def generate_text(
        prompt: str, system_instruction: str = "", temperature: float = 0.25
    ) -> str:
        """Sinh văn bản từ LLM thông qua chuỗi fallback Gemini Cloud -> Self-hosted vLLM.

        Mục tiêu:
            Đảm bảo tính sẵn sàng cao cho mọi tác vụ AI (trả lời RAG, sinh đề quiz, chấm bài tự luận, phân tích CV).
            Nếu model chính quá tải (HTTP 429/503) hoặc chưa hỗ trợ (404), hệ thống tự trượt sang model kế tiếp
            trong danh sách ứng viên trước khi dự phòng bằng máy chủ vLLM nội bộ.
        Liên kết luồng (Cross-layer):
            - Được gọi bởi `src/rag/agent_graph.py` (node Generate), `src/api/routes/grading_ai.py`,
              và `src/api/routes/career_ai.py`.
            - Gọi ra ngoài tới Google Generative Language REST API (`v1beta`) hoặc OpenAI-compatible vLLM API.
        Đầu vào / Đầu ra:
            - Input:
                + `prompt`: Nội dung yêu cầu của người dùng / ngữ cảnh bài học.
                + `system_instruction`: Chỉ dẫn vai trò hệ thống (System Prompt) định hình phong cách & ràng buộc JSON.
                + `temperature`: Độ sáng tạo lấy mẫu (mặc định `0.25` ưu tiên chính xác, ít bịa đặt).
            - Output: Chuỗi văn bản kết quả đã cắt khoảng trắng thừa; ném `RuntimeError` nếu mọi tầng đều thất bại
              (để caller phía trên kích hoạt fallback heuristic/offline).
        """
        # Non-blocking async call to Google Gemini REST API (`GEMINI_MODEL`, default `gemini-3.5-flash`).
        # Falls back to fallback candidate models, and self-hosted vLLM server if Gemini is unconfigured or unavailable.
        global vllm_cooldown_until
        client = get_http_client()

        # Bước 1: Kiểm tra Gemini API key hợp lệ; nếu hợp lệ thì xây dựng danh sách model fallback theo thứ tự ưu tiên:
        # `GEMINI_MODEL (cấu hình) -> gemini-3.5-flash -> gemini-3.1-flash-lite -> gemini-3.8-flash`.
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if is_valid_gemini_key(api_key):
            user_model = (settings.GEMINI_MODEL or "").strip()
            candidate_models = []
            # Bỏ qua model cũ `gemini-2.5-flash` nếu còn sót trong cấu hình để ưu tiên thế hệ 3.x mới hơn.
            if user_model and user_model != "gemini-2.5-flash":
                candidate_models.append(user_model)
            for m in ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"]:
                if m not in candidate_models:
                    candidate_models.append(m)

            # Bước 2: Thử lần lượt từng model Gemini trong chuỗi ứng viên cho tới khi nhận được phản hồi hợp lệ.
            for model_name in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                body: Dict[str, Any] = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": temperature,
                        "maxOutputTokens": 1200,
                    },
                }
                if system_instruction:
                    body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

                try:
                    # Đặt timeout 10s mỗi model để tránh kẹt quá lâu trước khi chuyển sang model dự phòng.
                    res = await client.post(url, json=body, timeout=10.0)
                    # Nếu gặp lỗi tạm thời (404 model chưa mở, 429 hết quota, 503 quá tải), trượt sang model tiếp theo.
                    if res.status_code in (404, 503, 429) and model_name != candidate_models[-1]:
                        logger.warning(
                            "Gemini model returned temporary error, trying next candidate",
                            model=model_name,
                            status=res.status_code,
                        )
                        continue
                    res.raise_for_status()
                    data = res.json()
                    # Bước 3: Trích xuất nội dung text từ cấu trúc `candidates[0].content.parts`.
                    candidates: List[Dict[str, Any]] = data.get("candidates") or []
                    if candidates:
                        parts = (candidates[0].get("content") or {}).get("parts") or []
                        text = "".join(str(p.get("text") or "") for p in parts).strip()
                        if text:
                            return text
                except Exception as e:
                    logger.warning(
                        "Gemini REST call failed, trying next candidate or fallback",
                        model=model_name,
                        error=str(e),
                    )

        # Bước 4: Kiểm tra Circuit Breaker của tầng vLLM — nếu đang trong thời gian chờ 60s hoặc chưa cấu hình
        # thì từ chối ngay (fail-fast) để không làm treo request.
        if time.time() < vllm_cooldown_until or not settings.VLLM_API_BASE:
            raise RuntimeError("All LLM providers are currently in cooldown or unavailable")

        # Bước 5: Tầng dự phòng cuối cùng — gọi máy chủ vLLM self-hosted theo chuẩn OpenAI Chat Completions API
        # (mô hình mã nguồn mở `Qwen/Qwen2.5-7B-Instruct`).
        try:
            headers = {}
            if settings.VLLM_API_KEY:
                headers["Authorization"] = f"Bearer {settings.VLLM_API_KEY}"
            res = await client.post(
                f"{settings.VLLM_API_BASE.rstrip('/')}/chat/completions",
                headers=headers,
                json={
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": temperature,
                },
                timeout=8.0,
            )
            res.raise_for_status()
            data = res.json()
            return str(data["choices"][0]["message"]["content"]).strip()
        except Exception as e:
            # Bước 6: Nếu vLLM cũng lỗi, bật Circuit Breaker trong 60 giây để bảo vệ hiệu năng hệ thống.
            vllm_cooldown_until = time.time() + 60.0
            logger.error("vLLM fallback call failed", error=str(e))
            raise RuntimeError("Failed to generate response from all available LLM backends")
