"""
Speech Intelligence & ASR Pipeline (`asr_whisper.py`)
-----------------------------------------------------
Multi-tier audio/video transcription & WebVTT subtitle alignment:
1. FFmpeg 16kHz Mono PCM extraction + Acoustic Energy/ZCR Voice Activity Detection (VAD).
2. Tier-1 Neural ASR: `Faster-Whisper` (`CTranslate2` INT8/FP16) with word/segment timestamps.
3. Tier-2 Multimodal Audio Fallback: Companion `.vtt` alignment or Gemini Audio REST API.
"""

import base64
import math
import os
import re
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np

from ..core.config import is_valid_gemini_key, settings
from ..core.llm_gateway import get_http_client
from ..core.logging import logger
from ..core.model_registry import WHISPER_MODELS_DIR, has_package

_whisper_instance: Any = None


def _get_whisper_model() -> Any:
    global _whisper_instance
    if _whisper_instance is not None:
        return _whisper_instance
    if not has_package("faster_whisper"):
        return None
    try:
        from faster_whisper import WhisperModel

        model_size = os.environ.get("WHISPER_MODEL_SIZE", "base")
        device = os.environ.get("WHISPER_DEVICE", "cpu")
        compute_type = "int8" if device == "cpu" else "float16"
        WHISPER_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        _whisper_instance = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=str(WHISPER_MODELS_DIR),
        )
        return _whisper_instance
    except Exception as exc:
        logger.warning("Faster-Whisper initialization skipped, using fallback tier", error=str(exc))
        return None


def format_vtt_timestamp(sec: float) -> str:
    sec = max(0.0, float(sec))
    ms = int(round((sec - math.floor(sec)) * 1000))
    total_s = int(math.floor(sec))
    if ms >= 1000:
        ms -= 1000
        total_s += 1
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def build_webvtt_from_segments(segments: List[Dict[str, Any]]) -> str:
    lines = ["WEBVTT", ""]
    for idx, seg in enumerate(segments, start=1):
        start_ts = format_vtt_timestamp(float(seg.get("startSec", 0.0)))
        end_ts = format_vtt_timestamp(float(seg.get("endSec", 0.0)))
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        lines.append(str(idx))
        lines.append(f"{start_ts} --> {end_ts}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def parse_webvtt_file(vtt_path: Path) -> List[Dict[str, Any]]:
    raw = vtt_path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\n\s*\n", raw.strip())
    ts_re = re.compile(
        r"(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})"
    )

    def _to_sec(h: Optional[str], m: str, s: str, ms: str) -> float:
        return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    segments: List[Dict[str, Any]] = []
    for blk in blocks:
        lines = [ln.strip() for ln in blk.splitlines() if ln.strip()]
        if not lines or lines[0].upper().startswith("WEBVTT"):
            continue
        ts_idx = -1
        match = None
        for i, ln in enumerate(lines):
            m = ts_re.search(ln)
            if m:
                ts_idx = i
                match = m
                break
        if match and ts_idx >= 0:
            start_s = _to_sec(match.group(1), match.group(2), match.group(3), match.group(4))
            end_s = _to_sec(match.group(5), match.group(6), match.group(7), match.group(8))
            text = " ".join(lines[ts_idx + 1 :]).strip()
            if text:
                segments.append(
                    {
                        "startSec": round(start_s, 2),
                        "endSec": round(end_s, 2),
                        "text": text,
                        "confidence": 0.98,
                    }
                )
    return segments


def extract_pcm16k_wav(input_media_path: Path, out_wav_path: Path) -> bool:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_media_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-acodec",
                "pcm_s16le",
                str(out_wav_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return out_wav_path.exists() and out_wav_path.stat().st_size > 1024
    except Exception as exc:
        logger.warning("FFmpeg PCM extraction failed", error=str(exc))
        return False


def analyze_acoustic_vad(wav_path: Path, frame_ms: int = 30) -> Dict[str, Any]:
    """
    Computes short-time frame energy E_t = (1/N) * sum(x_i^2) and Zero-Crossing Rate (ZCR)
    over 30ms frames at 16kHz to detect active speech intervals without any LLM dependency.
    """
    with wave.open(str(wav_path), "rb") as wf:
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    duration_sec = round(len(samples) / max(1, sr), 2)
    if len(samples) == 0:
        return {"durationSec": 0.0, "speechRatio": 0.0, "voicedIntervals": []}

    win = max(1, int(sr * (frame_ms / 1000.0)))
    num_wins = len(samples) // win
    if num_wins == 0:
        return {"durationSec": duration_sec, "speechRatio": 1.0, "voicedIntervals": [[0.0, duration_sec]]}

    trimmed = samples[: num_wins * win].reshape(num_wins, win)
    rms_energy = np.sqrt(np.mean(trimmed * trimmed, axis=1))
    noise_floor = float(np.percentile(rms_energy, 15))
    energy_thresh = max(0.008, noise_floor * 2.2)

    voiced_mask = rms_energy >= energy_thresh
    speech_ratio = round(float(np.mean(voiced_mask)), 3)

    intervals: List[List[float]] = []
    in_speech = False
    seg_start = 0.0
    dt = frame_ms / 1000.0
    for idx, is_voiced in enumerate(voiced_mask):
        t = idx * dt
        if is_voiced and not in_speech:
            in_speech = True
            seg_start = t
        elif not is_voiced and in_speech:
            if t - seg_start >= 0.35:
                intervals.append([round(seg_start, 2), round(t, 2)])
            in_speech = False
    if in_speech and (num_wins * dt - seg_start) >= 0.35:
        intervals.append([round(seg_start, 2), round(num_wins * dt, 2)])

    # Merge intervals separated by short micro-pauses (< 0.45s)
    merged: List[List[float]] = []
    for iv in intervals:
        if merged and (iv[0] - merged[-1][1]) <= 0.45:
            merged[-1][1] = iv[1]
        else:
            merged.append(iv)

    return {
        "durationSec": duration_sec,
        "speechRatio": speech_ratio,
        "voicedIntervalsCount": len(merged),
        "voicedIntervals": merged[:60],
    }


async def transcribe_media_pipeline(
    media_path: Optional[str] = None,
    transcript_hint: Optional[str] = None,
    language: str = "vi",
) -> Dict[str, Any]:
    """
    Executes multi-tier Speech-to-Text + VAD telemetry:
    Tier 1: Faster-Whisper CTranslate2 neural ASR on 16kHz WAV.
    Tier 2: Companion WebVTT cues or Gemini Multimodal Audio API.
    Tier 3: Transcript-hint alignment across VAD voiced intervals.
    """
    vad_stats: Dict[str, Any] = {"durationSec": 0.0, "speechRatio": 0.0, "voicedIntervals": []}
    segments: List[Dict[str, Any]] = []
    engine_used = "TRANSCRIPT_SEGMENTER"

    resolved_path: Optional[Path] = None
    if media_path:
        cand = Path(media_path)
        if cand.exists():
            resolved_path = cand

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "audio_16k.wav"
        has_wav = resolved_path is not None and extract_pcm16k_wav(resolved_path, wav_path)

        if has_wav:
            vad_stats = analyze_acoustic_vad(wav_path)

            # Tier 1: Faster-Whisper CTranslate2 Local Neural ASR
            whisper_model = _get_whisper_model()
            if whisper_model is not None:
                try:
                    raw_segs, info = whisper_model.transcribe(
                        str(wav_path),
                        language=language,
                        beam_size=4,
                        vad_filter=True,
                        vad_parameters={"min_silence_duration_ms": 400},
                    )
                    for s in raw_segs:
                        txt = (s.text or "").strip()
                        if txt:
                            prob = round(float(math.exp(max(-5.0, min(0.0, getattr(s, "avg_logprob", -0.2))))), 3)
                            segments.append(
                                {
                                    "startSec": round(float(s.start), 2),
                                    "endSec": round(float(s.end), 2),
                                    "text": txt,
                                    "confidence": prob,
                                }
                            )
                    if segments:
                        engine_used = "FASTER_WHISPER_CTRANSLATE2"
                except Exception as exc:
                    logger.warning("Faster-Whisper inference error, falling back", error=str(exc))

        # Tier 2A: Companion `.vtt` file alongside lecture video
        if not segments and resolved_path is not None:
            companion_vtt = resolved_path.with_suffix(".vtt")
            if companion_vtt.exists():
                segments = parse_webvtt_file(companion_vtt)
                if segments:
                    engine_used = "ACOUSTIC_VAD_PLUS_ALIGNED_VTT"

        # Tier 2B: Gemini Multimodal Audio API (when audio < 12 MB and API key configured)
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if (
            not segments
            and has_wav
            and is_valid_gemini_key(api_key)
            and wav_path.stat().st_size <= 12 * 1024 * 1024
        ):
            try:
                audio_b64 = base64.b64encode(wav_path.read_bytes()).decode("ascii")
                model_name = (settings.GEMINI_MODEL or "gemini-2.5-flash").strip()
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                client = get_http_client()
                res = await client.post(
                    url,
                    json={
                        "contents": [
                            {
                                "role": "user",
                                "parts": [
                                    {"inlineData": {"mimeType": "audio/wav", "data": audio_b64}},
                                    {
                                        "text": (
                                            f"Hãy gỡ băng chính xác đoạn âm thanh bài giảng tiếng '{language}' này. "
                                            "Trả về từng câu trên một dòng, không thêm bình luận ngoài lề."
                                        )
                                    },
                                ],
                            }
                        ],
                        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1500},
                    },
                    timeout=20.0,
                )
                res.raise_for_status()
                parts = ((res.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                transcript_text = "".join(str(p.get("text") or "") for p in parts).strip()
                if transcript_text:
                    transcript_hint = transcript_text
                    engine_used = "GEMINI_MULTIMODAL_AUDIO_ASR"
            except Exception as exc:
                logger.warning("Gemini Multimodal Audio fallback skipped", error=str(exc))

    # Tier 3: Align `transcript_hint` sentences onto VAD voiced intervals
    if not segments and transcript_hint:
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?;\n])\s+", transcript_hint.strip())
            if len(s.strip()) >= 3
        ]
        intervals = vad_stats.get("voicedIntervals") or []
        total_dur = float(vad_stats.get("durationSec") or max(30.0, len(sentences) * 8.0))
        step = total_dur / max(1, len(sentences))
        for i, sent in enumerate(sentences):
            if i < len(intervals):
                st, en = float(intervals[i][0]), float(intervals[i][1])
            else:
                st = round(i * step, 2)
                en = round((i + 1) * step, 2)
            segments.append(
                {
                    "startSec": st,
                    "endSec": max(round(st + 1.0, 2), en),
                    "text": sent,
                    "confidence": 0.90,
                }
            )

    full_text = " ".join(s["text"] for s in segments).strip()
    return {
        "engine": engine_used,
        "language": language,
        "vad": vad_stats,
        "segments": segments,
        "fullText": full_text,
        "vtt": build_webvtt_from_segments(segments),
    }
