import time
from typing import Any, Dict, List
import httpx
from .config import is_valid_gemini_key, settings
from .logging import logger

http_client: httpx.AsyncClient | None = None
vllm_cooldown_until: float = 0.0


def get_http_client() -> httpx.AsyncClient:
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=20.0)
    return http_client


async def close_http_client() -> None:
    global http_client
    if http_client is not None:
        await http_client.aclose()
        http_client = None


class LLMGateway:
    @staticmethod
    async def generate_text(
        prompt: str, system_instruction: str = "", temperature: float = 0.25
    ) -> str:
        """
        Non-blocking async call to Google Gemini REST API (`GEMINI_MODEL`, default `gemini-2.5-flash`).
        Falls back to self-hosted vLLM server if Gemini is unconfigured or unavailable.
        """
        global vllm_cooldown_until
        client = get_http_client()

        api_key = (settings.GEMINI_API_KEY or "").strip()
        if is_valid_gemini_key(api_key):
            model_name = (settings.GEMINI_MODEL or "gemini-2.5-flash").strip()
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
                res = await client.post(url, json=body, timeout=8.0)
                res.raise_for_status()
                data = res.json()
                candidates: List[Dict[str, Any]] = data.get("candidates") or []
                if candidates:
                    parts = (candidates[0].get("content") or {}).get("parts") or []
                    text = "".join(str(p.get("text") or "") for p in parts).strip()
                    if text:
                        return text
            except Exception as e:
                logger.warning(
                    "Gemini REST call failed, attempting fallback to vLLM",
                    model=model_name,
                    error=str(e),
                )

        if time.time() < vllm_cooldown_until or not settings.VLLM_API_BASE:
            raise RuntimeError("All LLM providers are currently in cooldown or unavailable")

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
            vllm_cooldown_until = time.time() + 60.0
            logger.error("vLLM fallback call failed", error=str(e))
            raise RuntimeError("Failed to generate response from all available LLM backends")
