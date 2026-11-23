"""
Model Registry & Capability Inspector (`model_registry.py`)
----------------------------------------------------------
Centralizes local model paths (`apps/ai-service/models/`) and runtime feature detection
so every research pipeline (ASR, RAG Reranker, LangGraph Agent, Proctoring CV, CP-SAT)
reports its exact active execution tier transparently for observability & thesis evaluation.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Định nghĩa tập trung đường dẫn thư mục chứa trọng số mô hình local (`apps/ai-service/models/`):
  Whisper CTranslate2, Proctoring YuNet/YOLOv8n ONNX, Bi-Encoder Embedding ONNX và Cross-Encoder Reranker ONNX.
- Tự động dò kiểm runtime đã cài đặt (`cv2`, `onnxruntime`, `mediapipe`, `faster_whisper`, `fastembed`,
  `langgraph`, `ortools`) và file trọng số hiện có trên đĩa để suy ra tầng thực thi đang hoạt động
  (ONNX/CTranslate2 cục bộ vs Cloud API vs Fallback).

Liên kết chéo (Cross-layer):
- Được gọi bởi `src/main.py` (`lifespan`, `/api/v1/ai/status`, `/api/v1/ai/models/status`),
  `src/rag/embedder.py`, `src/rag/reranker.py`, `src/live_copilot/asr_whisper.py`,
  `src/proctoring_cv/detector.py`, và `src/api/routes/scheduler_routes.py`.
"""

import importlib.util
from pathlib import Path
from typing import Any, Dict

# Khai báo cây thư mục chuẩn lưu trọng số AI cục bộ trong `apps/ai-service/models/`.
SERVICE_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_ROOT = SERVICE_ROOT / "models"

WHISPER_MODELS_DIR = MODELS_ROOT / "whisper"
PROCTORING_MODELS_DIR = MODELS_ROOT / "proctoring"
EMBEDDING_MODELS_DIR = MODELS_ROOT / "embeddings"
RERANKER_MODELS_DIR = MODELS_ROOT / "reranker"

# Đường dẫn file trọng số ONNX cụ thể cho pipeline giám sát thi (Proctoring CV).
YUNET_ONNX_PATH = PROCTORING_MODELS_DIR / "face_detection_yunet_2023mar.onnx"
YOLOV8N_ONNX_PATH = PROCTORING_MODELS_DIR / "yolov8n.onnx"


def has_package(pkg_name: str) -> bool:
    """Kiểm tra nhanh một thư viện Python đã được cài đặt hay chưa mà KHÔNG cần import nặng vào RAM.

    Mục tiêu:
        Dùng `importlib.util.find_spec` để dò khả năng runtime nhanh chóng (tránh tốn hàng giây nạp thư viện AI lớn).
    Liên kết luồng (Cross-layer):
        Được gọi bởi `get_models_registry_status()` và `src/api/routes/scheduler_routes.py`.
    Đầu vào / Đầu ra:
        - Input: `pkg_name` (tên module Python, ví dụ `"ortools"`, `"faster_whisper"`).
        - Output: `True` nếu tìm thấy module trong môi trường Python hiện tại; ngược lại `False`.
    """
    try:
        return importlib.util.find_spec(pkg_name) is not None
    except Exception:
        return False


def ensure_model_directories() -> None:
    """Đảm bảo 4 thư mục con lưu trọng số mô hình local luôn tồn tại trên ổ đĩa.

    Mục tiêu:
        Tạo sẵn cây thư mục `models/{whisper, proctoring, embeddings, reranker}` khi khởi động để
        các loader mô hình không gặp lỗi FileNotFoundError lúc tải cache.
    Liên kết luồng (Cross-layer):
        Được gọi trong `lifespan()` tại `src/main.py` và mỗi lần kiểm tra `get_models_registry_status()`.
    """
    for d in (WHISPER_MODELS_DIR, PROCTORING_MODELS_DIR, EMBEDDING_MODELS_DIR, RERANKER_MODELS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def _dir_has_files(directory: Path) -> bool:
    """Kiểm tra một thư mục model đã có file trọng số cache thực sự hay chưa (bỏ qua file ẩn như `.gitkeep`).

    Đầu vào / Đầu ra:
        - Input: `directory` (đối tượng `Path`).
        - Output: `True` nếu có ít nhất 1 file thông thường bên trong (đệ quy); ngược lại `False`.
    """
    if not directory.exists():
        return False
    return any(p.is_file() and not p.name.startswith(".") for p in directory.rglob("*"))


def get_models_registry_status(gemini_configured: bool = False) -> Dict[str, Any]:
    """Quét và tổng hợp báo cáo trạng thái toàn bộ runtime, trọng số local và tầng pipeline AI đang chạy.

    Mục tiêu:
        Cung cấp góc nhìn minh bạch (observability) phục vụ vận hành và bảo vệ Đồ án Tốt nghiệp:
        biết chính xác từng tính năng AI đang chạy bằng model học sâu local (ONNX/CTranslate2),
        Cloud API (Gemini), hay thuật toán dự phòng (fallback).
    Liên kết luồng (Cross-layer):
        Được gọi bởi `/api/v1/ai/status` và `/api/v1/ai/models/status` tại `src/main.py`.
    Đầu vào / Đầu ra:
        - Input: `gemini_configured` (`True` nếu `GEMINI_API_KEY` hợp lệ).
        - Output: Dict JSON chứa 4 khối chính: `modelsRoot`, `runtimes`, `weights`, và `activePipelines`.
    """
    # Bước 1: Bảo đảm cây thư mục trọng số đã được tạo trước khi kiểm tra dung lượng/tồn tại file.
    ensure_model_directories()

    # Bước 2: Kiểm tra sự hiện diện của các thư viện suy luận lõi trong môi trường Python.
    has_faster_whisper = has_package("faster_whisper")
    has_mediapipe = has_package("mediapipe")
    has_cv2 = has_package("cv2")
    has_ort = has_package("onnxruntime")
    has_fastembed = has_package("fastembed")
    has_langgraph = has_package("langgraph")
    has_ortools = has_package("ortools")

    # Bước 3: Kiểm tra file trọng số ONNX/CTranslate2 có thực sự tồn tại và đủ kích thước tối thiểu
    # (tránh nhận nhầm file tải lỗi hoặc file rỗng: YuNet > 50KB, YOLOv8n > 1MB).
    yunet_ready = YUNET_ONNX_PATH.exists() and YUNET_ONNX_PATH.stat().st_size > 50_000
    yolo_ready = YOLOV8N_ONNX_PATH.exists() and YOLOV8N_ONNX_PATH.stat().st_size > 1_000_000
    whisper_cached = _dir_has_files(WHISPER_MODELS_DIR)
    reranker_cached = _dir_has_files(RERANKER_MODELS_DIR)
    embedder_cached = _dir_has_files(EMBEDDING_MODELS_DIR)

    # Bước 4: Ánh xạ trạng thái runtime + weights sang tên tầng pipeline thực thi thực tế của 7 bài toán AI.
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
