# AI Service Models Directory

This directory stores offline model weights, ONNX runtimes, CTranslate2 weights, and vector embedding caches.

**Do NOT commit large weights or binary model files to Git.** These directories are excluded by `.gitignore`.

### Automatic Model Download

To download required CV & Proctoring models automatically:
```bash
python scripts/download_models.py
```

### Directory Layout
- `proctoring/` - Face detection (`face_detection_yunet_2023mar.onnx`) & Object detection (`yolov8n.onnx`)
- `whisper/` - Faster-Whisper CTranslate2 weights (`Systran/faster-whisper-tiny` or `small`)
- `reranker/` - Cross-Encoder ONNX models (`bge-reranker-base`)
- `embeddings/` - Offline FastEmbed cache (`BAAI/bge-m3`)
