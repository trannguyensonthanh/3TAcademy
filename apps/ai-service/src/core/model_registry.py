"""
Model Registry & Capability Inspector (`model_registry.py`)
----------------------------------------------------------
Centralizes local model paths (`apps/ai-service/models/`) and runtime feature detection
so every research pipeline (ASR, RAG Reranker, LangGraph Agent, Proctoring CV, CP-SAT)
reports its exact active execution tier transparently for observability & thesis evaluation.
"""

import importlib.util
from pathlib import Path
from typing import Any, Dict

SERVICE_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_ROOT = SERVICE_ROOT / "models"

WHISPER_MODELS_DIR = MODELS_ROOT / "whisper"
PROCTORING_MODELS_DIR = MODELS_ROOT / "proctoring"
EMBEDDING_MODELS_DIR = MODELS_ROOT / "embeddings"
RERANKER_MODELS_DIR = MODELS_ROOT / "reranker"

YUNET_ONNX_PATH = PROCTORING_MODELS_DIR / "face_detection_yunet_2023mar.onnx"
YOLOV8N_ONNX_PATH = PROCTORING_MODELS_DIR / "yolov8n.onnx"


def has_package(pkg_name: str) -> bool:
    try:
        return importlib.util.find_spec(pkg_name) is not None
    except Exception:
        return False


def ensure_model_directories() -> None:
    for d in (WHISPER_MODELS_DIR, PROCTORING_MODELS_DIR, EMBEDDING_MODELS_DIR, RERANKER_MODELS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def _dir_has_files(directory: Path) -> bool:
    if not directory.exists():
        return False
    return any(p.is_file() and not p.name.startswith(".") for p in directory.rglob("*"))


def get_models_registry_status(gemini_configured: bool = False) -> Dict[str, Any]:
    ensure_model_directories()

    has_faster_whisper = has_package("faster_whisper")
    has_mediapipe = has_package("mediapipe")
    has_cv2 = has_package("cv2")
    has_ort = has_package("onnxruntime")
    has_fastembed = has_package("fastembed")
    has_langgraph = has_package("langgraph")
    has_ortools = has_package("ortools")

    yunet_ready = YUNET_ONNX_PATH.exists() and YUNET_ONNX_PATH.stat().st_size > 50_000
    yolo_ready = YOLOV8N_ONNX_PATH.exists() and YOLOV8N_ONNX_PATH.stat().st_size > 1_000_000
    whisper_cached = _dir_has_files(WHISPER_MODELS_DIR)
    reranker_cached = _dir_has_files(RERANKER_MODELS_DIR)
    embedder_cached = _dir_has_files(EMBEDDING_MODELS_DIR)

    return {
        "modelsRoot": str(MODELS_ROOT),
        "runtimes": {
            "opencv": has_cv2,
            "onnxruntime": has_ort,
            "mediapipe": has_mediapipe,
            "faster_whisper": has_faster_whisper,
            "fastembed": has_fastembed,
            "langgraph": has_langgraph,
            "ortools": has_ortools,
            "gemini_multimodal": gemini_configured,
        },
        "weights": {
            "yunet_face_onnx": {
                "path": str(YUNET_ONNX_PATH),
                "present": yunet_ready,
                "sizeKb": round(YUNET_ONNX_PATH.stat().st_size / 1024, 1) if yunet_ready else 0,
            },
            "yolov8n_prohibited_objects_onnx": {
                "path": str(YOLOV8N_ONNX_PATH),
                "present": yolo_ready,
                "sizeKb": round(YOLOV8N_ONNX_PATH.stat().st_size / 1024, 1) if yolo_ready else 0,
            },
            "faster_whisper_ctranslate2": {
                "directory": str(WHISPER_MODELS_DIR),
                "cached": whisper_cached,
            },
            "cross_encoder_reranker_onnx": {
                "directory": str(RERANKER_MODELS_DIR),
                "cached": reranker_cached,
            },
            "neural_bi_encoder_onnx": {
                "directory": str(EMBEDDING_MODELS_DIR),
                "cached": embedder_cached,
            },
        },
        "activePipelines": {
            "speechAsr": (
                "FASTER_WHISPER_CTRANSLATE2_INT8"
                if has_faster_whisper
                else ("GEMINI_AUDIO_AND_VAD" if gemini_configured else "ACOUSTIC_VAD_VTT_SYNC")
            ),
            "topicAndSummary": "TEXTTILING_COSINE_SHIFT_AND_MMR_EXTRACTIVE",
            "ragRetrieval": (
                "PGVECTOR_HNSW_BM25_RRF_PLUS_ONNX_CROSS_ENCODER"
                if has_fastembed
                else "PGVECTOR_HNSW_BM25_RRF_PLUS_CALIBRATED_CROSS_SCORER"
            ),
            "agentOrchestration": (
                "LANGGRAPH_NATIVE_CRAG_STATEGRAPH"
                if has_langgraph
                else "BUILT_IN_DETERMINISTIC_CRAG_STATEGRAPH"
            ),
            "proctoringEdgeTier1": (
                "MEDIAPIPE_SOLVEPNP_PLUS_YOLOV8N_ONNX"
                if (has_mediapipe and yolo_ready and has_ort)
                else (
                    "OPENCV_YUNET_SOLVEPNP_PLUS_YOLOV8N_ONNX"
                    if (has_cv2 and yunet_ready and yolo_ready and has_ort)
                    else ("OPENCV_CASCADE_SOLVEPNP_CV" if has_cv2 else "HEURISTIC_FRAME_GUARD")
                )
            ),
            "proctoringCloudTier2": (
                "GEMINI_VISION_ESCALATION_ACTIVE" if gemini_configured else "LOCAL_CV_VERDICT_ONLY"
            ),
            "schedulerOptimization": (
                "ORTOOLS_CPSAT_SOLVER" if has_ortools else "GREEDY_CONFLICT_FREE_FALLBACK"
            ),
        },
    }
