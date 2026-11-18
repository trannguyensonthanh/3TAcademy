"""
Automated Local AI Model Weights Downloader (`download_models.py`)
------------------------------------------------------------------
Downloads and verifies local ONNX / CTranslate2 weights into `apps/ai-service/models/`:
1. `models/proctoring/face_detection_yunet_2023mar.onnx` (OpenCV Zoo YuNet Face + 5 Landmarks)
2. `models/proctoring/yolov8n.onnx` (YOLOv8n COCO-80 ONNX for cell phone / book / laptop detection)
3. `models/whisper/` (Faster-Whisper `base` / `small` INT8 CTranslate2 ASR weights, if installed)
4. `models/reranker/` (FastEmbed `Xenova/ms-marco-MiniLM-L-6-v2` Cross-Encoder ONNX, if installed)
5. `models/embeddings/` (FastEmbed `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, if installed)

Usage:
  python apps/ai-service/scripts/download_models.py          # Download all available models
  python apps/ai-service/scripts/download_models.py --cv-only # Download lightweight CV ONNX weights only
"""

import argparse
import sys
from pathlib import Path
import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SCRIPT_DIR.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from src.core.model_registry import (  # noqa: E402
    EMBEDDING_MODELS_DIR,
    PROCTORING_MODELS_DIR,
    RERANKER_MODELS_DIR,
    WHISPER_MODELS_DIR,
    YOLOV8N_ONNX_PATH,
    YUNET_ONNX_PATH,
    ensure_model_directories,
    get_models_registry_status,
    has_package,
)

YUNET_URLS = [
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx",
]

YOLOV8N_URLS = [
    "https://huggingface.co/Kalray/yolov8/resolve/main/yolov8n.onnx",
    "https://huggingface.co/SpotLab/YOLOv8Detection/resolve/3005c6751fb19cdeb6b10c066185908faf66a097/yolov8n.onnx",
]


def download_binary_with_fallback(urls: list[str], dest: Path, min_bytes: int) -> bool:
    if dest.exists() and dest.stat().st_size >= min_bytes:
        print(f"[OK] Đã có sẵn {dest.name} ({dest.stat().st_size // 1024} KB)")
        return True

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_dest = dest.with_suffix(".part")
    for url in urls:
        try:
            print(f"[DOWNLOAD] Đang tải {dest.name} từ {url} ...")
            with httpx.Client(timeout=90.0, follow_redirects=True) as client:
                with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    with open(tmp_dest, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            f.write(chunk)
            if tmp_dest.exists() and tmp_dest.stat().st_size >= min_bytes:
                tmp_dest.replace(dest)
                print(f"[OK] Đã lưu {dest} ({dest.stat().st_size // 1024} KB)")
                return True
        except Exception as exc:
            print(f"[WARN] Nguồn {url} không khả dụng: {exc}")
            if tmp_dest.exists():
                tmp_dest.unlink(missing_ok=True)
    return False


def download_whisper_weights(model_size: str = "base") -> None:
    if not has_package("faster_whisper"):
        print("[SKIP] Chưa cài `faster-whisper` trên môi trường Python hiện tại (cài qua `pip install faster-whisper`).")
        return
    try:
        from faster_whisper import WhisperModel

        print(f"[DOWNLOAD] Đang tải Faster-Whisper ({model_size}, INT8 CTranslate2) vào {WHISPER_MODELS_DIR} ...")
        WhisperModel(model_size, device="cpu", compute_type="int8", download_root=str(WHISPER_MODELS_DIR))
        print(f"[OK] Đã sẵn sàng Faster-Whisper ({model_size}) tại {WHISPER_MODELS_DIR}")
    except Exception as exc:
        print(f"[WARN] Không thể tải Faster-Whisper lúc này: {exc}")


def download_fastembed_weights() -> None:
    if not has_package("fastembed"):
        print("[SKIP] Chưa cài `fastembed` trên môi trường Python hiện tại (cài qua `pip install fastembed`).")
        return
    try:
        from fastembed import TextEmbedding
        from fastembed.rerank.cross_encoder import TextCrossEncoder

        print(f"[DOWNLOAD] Đang tải Cross-Encoder Reranker ONNX vào {RERANKER_MODELS_DIR} ...")
        TextCrossEncoder(
            model_name="Xenova/ms-marco-MiniLM-L-6-v2",
            cache_dir=str(RERANKER_MODELS_DIR),
        )
        print("[OK] Đã sẵn sàng Cross-Encoder Reranker ONNX!")

        print(f"[DOWNLOAD] Đang tải Multilingual Bi-Encoder ONNX vào {EMBEDDING_MODELS_DIR} ...")
        TextEmbedding(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            cache_dir=str(EMBEDDING_MODELS_DIR),
        )
        print("[OK] Đã sẵn sàng Multilingual Bi-Encoder ONNX!")
    except Exception as exc:
        print(f"[WARN] Không thể tải FastEmbed ONNX lúc này: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Tải trọng số AI/CV/Speech cục bộ cho 3T Academy")
    parser.add_argument("--cv-only", action="store_true", help="Chỉ tải các model ONNX thị giác máy tính (YuNet + YOLOv8n)")
    parser.add_argument("--whisper-size", default="base", choices=["tiny", "base", "small"], help="Kích thước model Faster-Whisper")
    args = parser.parse_args()

    ensure_model_directories()
    print(f"=== KHỞI TẠO THƯ MỤC MODEL TẠI: {PROCTORING_MODELS_DIR.parent} ===")

    download_binary_with_fallback(YUNET_URLS, YUNET_ONNX_PATH, min_bytes=100_000)
    download_binary_with_fallback(YOLOV8N_URLS, YOLOV8N_ONNX_PATH, min_bytes=5_000_000)

    if not args.cv_only:
        download_whisper_weights(model_size=args.whisper_size)
        download_fastembed_weights()

    status = get_models_registry_status()
    print("\n=== TỔNG HỢP TRẠNG THÁI PIPELINE AI HIỆN TẠI ===")
    for k, v in status["activePipelines"].items():
        print(f"  • {k}: {v}")


if __name__ == "__main__":
    main()
