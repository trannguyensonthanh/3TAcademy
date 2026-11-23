"""Two-Tier Edge-Cloud Exam Proctoring Computer Vision Package.

Gói Thị giác Máy tính Giám sát Thi trực tuyến thuộc tầng AI Service (`apps/ai-service`):
- `detector.py`: Pipeline 2 tầng kết hợp Edge CV (MediaPipe/YuNet + SolvePnP 3D Head Pose + YOLOv8n ONNX)
  và Cloud VLM (Gemini Vision) để phát hiện gian lận phòng thi.
Được gọi bởi `src/api/routes/proctoring_ai.py` (từ Backend `apps/api/src/modules/assessment/assessment.routes.ts`).
"""
