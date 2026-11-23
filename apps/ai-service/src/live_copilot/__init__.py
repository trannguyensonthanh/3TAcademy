"""Live Copilot Speech, VAD, Whisper ASR & Topic Segmentation Package.

Gói xử lý bài giảng thông minh thuộc tầng AI Service (`apps/ai-service`):
- `asr_whisper.py`: Nhận dạng giọng nói Faster-Whisper (CTranslate2) + VAD + xuất phụ đề WebVTT + fallback Gemini Audio.
- `topic_segmenter.py`: Phân chương tự động bằng độ dịch chuyển ngữ nghĩa Cosine-Shift và tóm tắt trích chọn MMR.
Được gọi bởi `src/api/routes/media_ai.py` và tác vụ nền `src/worker/tasks.py`.
"""
