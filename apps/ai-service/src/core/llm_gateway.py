import time
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from google import genai
from .config import settings
from .logging import logger

gemini_client: genai.Client | None = None
http_client: httpx.AsyncClient | None = None
vllm_cooldown_until: float = 0.0


def get_gemini_client() -> genai.Client | None:
    global gemini_client
    if gemini_client is None and settings.GEMINI_API_KEY:
        gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return gemini_client


def get_http_client() -> httpx.AsyncClient:
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=60.0)
    return http_client


class LLMGateway:
    @staticmethod
    async def generate_text(prompt: str, system_instruction: str = "") -> str:
        """
        Attempts to call Google Gemini first. If rate-limited or unavailable,
        falls back to self-hosted vLLM Qwen server.
        """
        global vllm_cooldown_until

        gemini = get_gemini_client()
        if gemini:
            try:
                response = gemini.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                    config={"system_instruction": system_instruction} if system_instruction else None,
                )
                if response.text:
                    return response.text
            except Exception as e:
                logger.warning("Gemini API call failed, attempting fallback to vLLM", error=str(e))

        # Fallback to vLLM
        if time.time() < vllm_cooldown_until:
            raise RuntimeError("All LLM providers are currently in cooldown or unavailable")

        client = get_http_client()
        try:
            res = await client.post(
                f"{settings.VLLM_API_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
                json={
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                },
            )
            res.raise_for_status()
            data = res.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            vllm_cooldown_until = time.time() + 60.0  # 1-minute cooldown
            logger.error("vLLM fallback call failed", error=str(e))
            raise RuntimeError("Failed to generate response from all available LLM backends")
