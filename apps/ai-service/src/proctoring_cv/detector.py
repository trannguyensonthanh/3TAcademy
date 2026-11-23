"""
Two-Tier Edge-Cloud Exam Proctoring CV Engine (`detector.py`)
-------------------------------------------------------------
Tier 1 (Local Real-Time Computer Vision, < 50ms, Zero LLM Token Cost):
  1. Face Counting (`0` -> `NO_FACE`, `>= 2` -> `MULTI_FACE`):
     Cascades across `MediaPipe` -> `OpenCV YuNet ONNX` -> `OpenCV Haar Cascade`.
  2. 3D Head Pose Estimation (`Yaw`, `Pitch`, `Roll` via `cv2.solvePnP`):
     Projects canonical 3D facial anthropometric coordinates onto detected 2D landmarks
     to flag sustained `LOOK_AWAY` (`|Yaw| > 32 deg` or `|Pitch| > 28 deg`).
  3. Prohibited Object Detection (`YOLOv8n ONNX` via `onnxruntime`):
     Detects COCO classes `67` (`cell phone` -> `PHONE_DETECTED`), `73` (`book`), `63` (`laptop`).

Tier 2 (Conditional Cloud VLM Escalation — `Gemini Vision API`):
  Invoked ONLY when Tier 1 flags a high-risk anomaly AND `escalate_vlm=True` to verify
  context and eliminate false positives before alerting the instructor.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Đóng vai trò động cơ Thị giác Máy tính giám sát thi trực tuyến 2 tầng tối ưu chi phí & độ trễ:
  + **Tầng 1 (Edge Local < 50ms, 0 token):** Chạy liên tục trên mọi khung hình webcam để đếm số mặt,
    tính góc quay đầu 3D (Euler Yaw/Pitch/Roll bằng bài toán hình học Perspective-n-Point `solvePnP`),
    và phát hiện vật thể cấm (điện thoại, người thứ 2, sách, laptop) bằng `YOLOv8n ONNX`.
  + **Tầng 2 (Cloud VLM có điều kiện):** CHỈ gửi ảnh lên Gemini Vision khi Tầng 1 bắt được vi phạm rủi ro cao
    (`riskDelta > 0`), giúp giảm > 95% chi phí API mà vẫn kiểm chứng được ngữ cảnh chống báo động giả (false positive).

Liên kết chéo (Cross-layer):
- Được gọi từ `src/api/routes/proctoring_ai.py` (`POST /api/v1/ai/proctoring/analyze-frame`),
  vốn nhận ảnh base64 từ `apps/api/src/modules/assessment/assessment.routes.ts`.
- Sử dụng trọng số ONNX định nghĩa tại `src/core/model_registry.py` (`YUNET_ONNX_PATH`, `YOLOV8N_ONNX_PATH`)
  và HTTP client tại `src/core/llm_gateway.py`.
"""

import base64
import math
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from ..core.config import is_valid_gemini_key, settings
from ..core.llm_gateway import get_http_client
from ..core.logging import logger
from ..core.model_registry import (
    YOLOV8N_ONNX_PATH,
    YUNET_ONNX_PATH,
    has_package,
)

# Mô hình nhân trắc học 6 điểm mốc khuôn mặt chuẩn trong không gian 3D (đơn vị mm, gốc tọa độ tại đầu mũi)
# làm đầu vào đối chiếu 3D-2D cho thuật toán `cv2.solvePnP`.
# Canonical 3D Anthropometric Facial Model Points (mm)
MODEL_3D_FACE_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),          # Nose tip
        (0.0, -330.0, -65.0),     # Chin
        (-225.0, 170.0, -135.0),  # Left eye outer corner
        (225.0, 170.0, -135.0),   # Right eye outer corner
        (-150.0, -150.0, -125.0), # Left mouth corner
        (150.0, -150.0, -125.0),  # Right mouth corner
    ],
    dtype=np.float64,
)

# Ánh xạ ID lớp vật thể chuẩn bộ dữ liệu COCO sang (tên nhãn, mã sự kiện gian lận, điểm cộng rủi ro).
COCO_PROHIBITED_CLASSES = {
    67: ("cell phone", "PHONE_DETECTED", 30.0),
    73: ("book", "BOOK_DETECTED", 15.0),
    63: ("laptop", "SECOND_SCREEN_DETECTED", 15.0),
}

# Các biến singleton cache phiên suy luận ONNX / Haar / MediaPipe để tránh nạp lại model nặng trên từng khung hình.
_yolo_ort_session: Any = None
_haar_face_cascade: Any = None
_haar_eye_cascade: Any = None
_mp_face_mesh: Any = None


def _get_yolo_session() -> Any:
    """Khởi tạo lười phiên suy luận `onnxruntime.InferenceSession` (CPUExecutionProvider) cho YOLOv8n ONNX."""
    global _yolo_ort_session
    if _yolo_ort_session is not None:
        return _yolo_ort_session
    if not (has_package("onnxruntime") and YOLOV8N_ONNX_PATH.exists()):
        return None
    try:
        import onnxruntime as ort

        _yolo_ort_session = ort.InferenceSession(
            str(YOLOV8N_ONNX_PATH),
            providers=["CPUExecutionProvider"],
        )
        return _yolo_ort_session
    except Exception as exc:
        logger.warning("YOLOv8n ONNX load skipped", error=str(exc))
        return None


def _get_mediapipe_mesh() -> Any:
    """Khởi tạo lười `MediaPipe FaceMesh` (phát hiện tối đa 4 khuôn mặt và 468 mốc 3D/2D chính xác cao)."""
    global _mp_face_mesh
    if _mp_face_mesh is not None:
        return _mp_face_mesh
    if not has_package("mediapipe"):
        return None
    try:
        import mediapipe as mp

        if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
            _mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=4,
                refine_landmarks=False,
                min_detection_confidence=0.5,
            )
            return _mp_face_mesh
    except Exception as exc:
        logger.warning("MediaPipe FaceMesh unavailable, falling back to OpenCV", error=str(exc))
    return None


def decode_base64_image(image_base64: str) -> Tuple[Optional[np.ndarray], bytes]:
    """Giải mã chuỗi Data URI / base64 webcam thành mảng ảnh BGR OpenCV (`np.ndarray`) và byte thô.

    Mục tiêu:
        Xử lý linh hoạt cả chuỗi có tiền tố `data:image/jpeg;base64,...` lẫn chuỗi base64 thuần,
        đồng thời giữ lại `img_bytes` gốc để gửi tiếp lên Gemini Vision nếu cần leo thang Tier 2.
    """
    raw_str = (image_base64 or "").strip()
    if "," in raw_str and raw_str.lower().startswith("data:image"):
        raw_str = raw_str.split(",", 1)[1]
    img_bytes = base64.b64decode(raw_str)

    if has_package("cv2"):
        import cv2

        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return bgr, img_bytes
    return None, img_bytes


def solve_head_pose_pnp(
    image_2d_points: np.ndarray, img_w: int, img_h: int
) -> Dict[str, float]:
    """Ước lượng góc quay đầu 3D (Yaw, Pitch, Roll theo độ) bằng thuật toán Perspective-n-Point (`cv2.solvePnP`).

    Mục tiêu:
        Từ 6 điểm mốc 2D phát hiện được trên ảnh webcam (mũi, cằm, 2 khóe mắt, 2 khóe miệng) đối chiếu với
        mô hình khuôn mặt 3D chuẩn (`MODEL_3D_FACE_POINTS`), giải phương trình chiếu phối cảnh pinhole camera
        để thu được vector xoay Rodrigues (`rvec`) -> phân rã thành 3 góc Euler (`Yaw` quay ngang, `Pitch` cúi/ngẩng,
        `Roll` nghiêng đầu).
    Đầu vào / Đầu ra:
        - Input: `image_2d_points` (mảng 6x2 tọa độ pixel), `img_w`, `img_h` (kích thước ảnh).
        - Output: Dict `{"yawDeg": float, "pitchDeg": float, "rollDeg": float}`.
    """
    # Computes 3D Euler head orientation angles (Yaw, Pitch, Roll in degrees)
    # from 6 2D facial landmarks using Perspective-n-Point (`cv2.solvePnP`).
    import cv2

    # Bước 1: Xấp xỉ ma trận nội tham số camera pinhole (tiêu cự `f ≈ width`, quang tâm tại giữa ảnh, không méo kính).
    focal_length = float(img_w)
    center = (img_w / 2.0, img_h / 2.0)
    camera_matrix = np.array(
        [
            [focal_length, 0.0, center[0]],
            [0.0, focal_length, center[1]],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    # Bước 2: Giải bài toán PnP lặp Levenberg-Marquardt (`SOLVEPNP_ITERATIVE`) tìm vector xoay `rvec` & tịnh tiến `tvec`.
    ok, rvec, tvec = cv2.solvePnP(
        MODEL_3D_FACE_POINTS,
        image_2d_points.astype(np.float64),
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0}

    # Bước 3: Biến đổi `rvec` thành ma trận xoay 3x3 (`Rodrigues`) rồi phân rã RQ (`RQDecomp3x3`) ra 3 góc Euler.
    rmat, _ = cv2.Rodrigues(rvec)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
    pitch = float(angles[0])
    yaw = float(angles[1])
    roll = float(angles[2])

    # Bước 4: Chuẩn hóa góc Pitch khi bị đảo dấu quanh mốc ±180° do quy ước hệ trục tọa độ ảnh OpenCV.
    # Normalize wrap-around near +/-180 deg from coordinate convention
    if pitch > 90:
        pitch = 180 - pitch
    elif pitch < -90:
        pitch = -180 - pitch

    return {
        "yawDeg": round(yaw, 2),
        "pitchDeg": round(pitch, 2),
        "rollDeg": round(roll, 2),
    }


def _detect_faces_and_pose_cv(bgr: np.ndarray) -> Dict[str, Any]:
    """Phát hiện số lượng khuôn mặt & ước lượng tư thế đầu 3D theo chuỗi fallback 3 tầng: MediaPipe -> YuNet ONNX -> Haar Cascade.

    Mục tiêu:
        Đạt độ chính xác cao nhất có thể tùy theo gói thư viện & trọng số đang có trên máy:
        - **Tier 1A (`MediaPipe FaceMesh`):** 468 mốc chính xác nhất, lấy đúng 6 điểm chuẩn đưa vào `solvePnP`.
        - **Tier 1B (`OpenCV YuNet ONNX`):** Mạng CNN siêu nhẹ phát hiện mặt + 5 mốc (2 mắt, mũi, 2 khóe miệng)
          kèm nội suy điểm cằm từ cạnh dưới bounding box.
        - **Tier 1C (`OpenCV Haar Cascade`):** Bộ phát hiện cổ điển tích hợp sẵn trong OpenCV + tổng hợp hình học
          6 điểm mốc từ mắt/bounding box để vẫn tính được `solvePnP` khi thiếu mọi file ONNX.
    """
    global _haar_face_cascade, _haar_eye_cascade
    import cv2

    h, w = bgr.shape[:2]

    # Bước 1 (Tier 1A): Ưu tiên MediaPipe FaceMesh — trích xuất 6 chỉ số mốc (1, 152, 33, 263, 61, 291) khi có đúng 1 mặt.
    # Tier 1A: MediaPipe FaceMesh (468 3D/2D landmarks)
    mp_mesh = _get_mediapipe_mesh()
    if mp_mesh is not None:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        res = mp_mesh.process(rgb)
        multi_lms = getattr(res, "multi_face_landmarks", None) or []
        face_count = len(multi_lms)
        pose = {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0}
        if face_count == 1:
            lm = multi_lms[0].landmark
            # MediaPipe indices: 1=nose tip, 152=chin, 33=left eye, 263=right eye, 61=left mouth, 291=right mouth
            pts_2d = np.array(
                [
                    (lm[1].x * w, lm[1].y * h),
                    (lm[152].x * w, lm[152].y * h),
                    (lm[33].x * w, lm[33].y * h),
                    (lm[263].x * w, lm[263].y * h),
                    (lm[61].x * w, lm[61].y * h),
                    (lm[291].x * w, lm[291].y * h),
                ],
                dtype=np.float64,
            )
            pose = solve_head_pose_pnp(pts_2d, w, h)
        return {"detector": "MEDIAPIPE_FACEMESH_SOLVEPNP", "faceCount": face_count, "headPose": pose}

    # Bước 2 (Tier 1B): Dự phòng bằng mạng YuNet ONNX (`cv2.FaceDetectorYN`) với ngưỡng tin cậy 0.60 và NMS 0.3.
    # Tier 1B: OpenCV YuNet ONNX Face + 5-Keypoint Detector
    if YUNET_ONNX_PATH.exists() and hasattr(cv2, "FaceDetectorYN"):
        try:
            yunet = cv2.FaceDetectorYN.create(
                str(YUNET_ONNX_PATH), "", (w, h), 0.60, 0.3, 10
            )
            _, faces = yunet.detect(bgr)
            face_rows = faces if faces is not None else []
            face_count = len(face_rows)
            pose = {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0}
            if face_count == 1:
                f = face_rows[0]
                # YuNet format: [x, y, bw, bh, re_x, re_y, le_x, le_y, nt_x, nt_y, rm_x, rm_y, lm_x, lm_y, conf]
                bx, by, bw, bh = float(f[0]), float(f[1]), float(f[2]), float(f[3])
                re_pt = (float(f[4]), float(f[5]))
                le_pt = (float(f[6]), float(f[7]))
                nose_pt = (float(f[8]), float(f[9]))
                rm_pt = (float(f[10]), float(f[11]))
                lm_pt = (float(f[12]), float(f[13]))
                chin_pt = ((rm_pt[0] + lm_pt[0]) / 2.0, by + bh * 0.98)
                pts_2d = np.array([nose_pt, chin_pt, re_pt, le_pt, rm_pt, lm_pt], dtype=np.float64)
                pose = solve_head_pose_pnp(pts_2d, w, h)
            return {"detector": "OPENCV_YUNET_ONNX_SOLVEPNP", "faceCount": face_count, "headPose": pose}
        except Exception as exc:
            logger.warning("YuNet ONNX inference warning, using Haar fallback", error=str(exc))

    # Bước 3 (Tier 1C): Dự phòng cuối bằng Haar Cascade (cân bằng sáng `equalizeHist` -> dò mặt & 2 mắt -> suy diễn 6 mốc).
    # Tier 1C: Built-in OpenCV Haar Cascade + Geometric Landmark Synthesis for SolvePnP
    if _haar_face_cascade is None:
        _haar_face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        _haar_eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye.xml"
        )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    faces = _haar_face_cascade.detectMultiScale(
        gray, scaleFactor=1.12, minNeighbors=5, minSize=(48, 48)
    )
    face_count = len(faces)
    pose = {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0}
    if face_count == 1:
        fx, fy, fw, fh = [float(v) for v in faces[0]]
        roi_gray = gray[int(fy) : int(fy + fh * 0.65), int(fx) : int(fx + fw)]
        eyes = _haar_eye_cascade.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=3)
        if len(eyes) >= 2:
            eyes_sorted = sorted(eyes, key=lambda e: e[0])[:2]
            e1, e2 = eyes_sorted[0], eyes_sorted[1]
            left_eye = (fx + e1[0] + e1[2] * 0.5, fy + e1[1] + e1[3] * 0.5)
            right_eye = (fx + e2[0] + e2[2] * 0.5, fy + e2[1] + e2[3] * 0.5)
        else:
            left_eye = (fx + fw * 0.32, fy + fh * 0.36)
            right_eye = (fx + fw * 0.68, fy + fh * 0.36)

        eye_mid_x = (left_eye[0] + right_eye[0]) * 0.5
        box_mid_x = fx + fw * 0.5
        asym_shift = (eye_mid_x - box_mid_x) * 0.6
        nose_pt = (box_mid_x + asym_shift, fy + fh * 0.56)
        chin_pt = (box_mid_x, fy + fh * 0.96)
        left_mouth = (fx + fw * 0.36 + asym_shift * 0.4, fy + fh * 0.78)
        right_mouth = (fx + fw * 0.64 + asym_shift * 0.4, fy + fh * 0.78)
        pts_2d = np.array(
            [nose_pt, chin_pt, left_eye, right_eye, left_mouth, right_mouth], dtype=np.float64
        )
        pose = solve_head_pose_pnp(pts_2d, w, h)

    return {"detector": "OPENCV_HAAR_SOLVEPNP", "faceCount": face_count, "headPose": pose}


def _detect_prohibited_objects_yolov8n(bgr: np.ndarray) -> Dict[str, Any]:
    """Chạy mô hình phát hiện vật thể `YOLOv8n ONNX` phát hiện điện thoại, sách, laptop và đếm chéo số người.

    Mục tiêu:
        Tiền xử lý ảnh theo chuẩn Letterbox 640x640 (giữ nguyên tỷ lệ khung hình, đệm viền xám 114 để không làm méo vật thể),
        suy luận tensor `(1, 3, 640, 640) -> (1, 84, 8400)` qua ONNX Runtime, lọc ngưỡng tin cậy (`conf >= 0.38`)
        và khử khung chồng lấn bằng NMS (`IoU = 0.45`).
        Ngoài điện thoại/sách/laptop, còn đếm lớp COCO `0` (`person`, `conf >= 0.48`) để phát hiện người thứ 2
        ngay cả khi người đó quay lưng không lộ khuôn mặt trước bộ đếm mặt!
    """
    # Runs YOLOv8n ONNX (`1x3x640x640` -> `1x84x8400`) via `onnxruntime` to detect
    # prohibited exam items (`cell phone`, `book`, `laptop`) + person count cross-check.
    sess = _get_yolo_session()
    if sess is None or not has_package("cv2"):
        return {"enabled": False, "objects": [], "personCount": 0}

    import cv2

    # Bước 1: Letterbox Resize về 640x640 (giữ đúng aspect ratio + viền màu xám 114), chuyển BGR->RGB, chuẩn hóa [0,1] và NCHW.
    orig_h, orig_w = bgr.shape[:2]
    inp_size = 640
    scale = min(inp_size / orig_w, inp_size / orig_h)
    nw, nh = int(round(orig_w * scale)), int(round(orig_h * scale))
    resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)

    canvas = np.full((inp_size, inp_size, 3), 114, dtype=np.uint8)
    pad_x = (inp_size - nw) // 2
    pad_y = (inp_size - nh) // 2
    canvas[pad_y : pad_y + nh, pad_x : pad_x + nw] = resized

    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

    # Bước 2: Chạy suy luận ONNX Runtime và chuyển vị đầu ra về `(8400, 84)` (4 tọa độ box + 80 điểm lớp COCO).
    input_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {input_name: blob})
    preds = np.squeeze(outputs[0])  # (84, 8400) or (8400, 84)
    if preds.shape[0] == 84:
        preds = preds.T  # -> (8400, 84)

    # Bước 3: Lọc nhanh các anchor vượt ngưỡng tin cậy `0.38` và quy đổi tọa độ box từ 640x640 về ảnh gốc.
    class_scores = preds[:, 4:]
    class_ids = np.argmax(class_scores, axis=1)
    max_confs = class_scores[np.arange(len(preds)), class_ids]

    keep_mask = max_confs >= 0.38
    boxes_xywh = preds[keep_mask, :4]
    kept_ids = class_ids[keep_mask]
    kept_confs = max_confs[keep_mask]

    if len(boxes_xywh) == 0:
        return {"enabled": True, "objects": [], "personCount": 0}

    nms_boxes: List[List[int]] = []
    for bx, by, bw, bh in boxes_xywh:
        x1 = int((bx - bw / 2 - pad_x) / scale)
        y1 = int((by - bh / 2 - pad_y) / scale)
        w_box = int(bw / scale)
        h_box = int(bh / scale)
        nms_boxes.append([max(0, x1), max(0, y1), max(1, w_box), max(1, h_box)])

    # Bước 4: Áp dụng Non-Maximum Suppression (NMS, IoU=0.45) để giữ một hộp duy nhất cho mỗi vật thể,
    # rồi phân loại người (`cid == 0`) và vật thể cấm (`COCO_PROHIBITED_CLASSES`).
    indices = cv2.dnn.NMSBoxes(nms_boxes, kept_confs.tolist(), 0.38, 0.45)
    flat_idx = indices.flatten().tolist() if len(indices) > 0 else []

    prohibited: List[Dict[str, Any]] = []
    person_count = 0
    for idx in flat_idx:
        cid = int(kept_ids[idx])
        conf = round(float(kept_confs[idx]), 3)
        if cid == 0 and conf >= 0.48:
            person_count += 1
        elif cid in COCO_PROHIBITED_CLASSES:
            label, ev_type, risk_delta = COCO_PROHIBITED_CLASSES[cid]
            prohibited.append(
                {
                    "classId": cid,
                    "label": label,
                    "eventType": ev_type,
                    "confidence": conf,
                    "riskDelta": risk_delta,
                    "bbox": nms_boxes[idx],
                }
            )

    return {"enabled": True, "objects": prohibited, "personCount": person_count}


async def _verify_with_gemini_vision(
    img_bytes: bytes, flagged_reasons: List[str]
) -> Optional[Dict[str, Any]]:
    """Tầng 2 (Cloud VLM Escalation): Gửi ảnh nghi vấn sang Gemini Vision để xác minh ngữ cảnh giảm báo động giả.

    Mục tiêu:
        Khi Tier 1 (CV cục bộ) phát hiện vi phạm có `riskDelta > 0`, gọi Gemini Vision trả lời ngắn gọn 3 ý
        (số người, điện thoại/tài liệu cầm tay, hướng nhìn màn hình) để đính kèm vào biên bản cảnh báo cho giảng viên.
    """
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not is_valid_gemini_key(api_key):
        return None
    try:
        model_name = (settings.GEMINI_MODEL or "gemini-3.5-flash").strip()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        b64_data = base64.b64encode(img_bytes).decode("ascii")
        client = get_http_client()
        res = await client.post(
            url,
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"inlineData": {"mimeType": "image/jpeg", "data": b64_data}},
                            {
                                "text": (
                                    f"Hệ thống CV tầng Edge vừa gắn cờ khung hình phòng thi trực tuyến với mã: {', '.join(flagged_reasons)}. "
                                    "Hãy quan sát ảnh và xác nhận ngắn gọn trong 1 câu tiếng Việt: "
                                    "(1) Có mấy người trong ảnh? (2) Có điện thoại/tài liệu cầm tay không? (3) Thí sinh có đang nhìn màn hình thi không?"
                                )
                            },
                        ],
                    }
                ],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 180},
            },
            timeout=8.0,
        )
        res.raise_for_status()
        parts = ((res.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        summary = "".join(str(p.get("text") or "") for p in parts).strip()
        if summary:
            return {"verified": True, "model": model_name, "vlmNote": summary}
    except Exception as exc:
        logger.warning("Gemini Vision Tier-2 escalation skipped", error=str(exc))
    return None


async def analyze_exam_frame(
    image_base64: str, escalate_vlm: bool = True
) -> Dict[str, Any]:
    """Hàm điều phối chính phân tích một khung hình webcam giám sát thi theo kiến trúc 2 tầng Edge-Cloud.

    Mục tiêu:
        Tổng hợp tín hiệu từ bộ phát hiện khuôn mặt + tư thế đầu 3D (`_detect_faces_and_pose_cv`) và
        bộ phát hiện vật thể cấm (`_detect_prohibited_objects_yolov8n`), xếp hạng mức độ nghiêm trọng
        (`PHONE_DETECTED` > `MULTI_FACE` > `NO_FACE` > `LOOK_AWAY`), leo thang xác minh Gemini Vision nếu cần
        và đo độ trễ thực thi (`latencyMs`).
    Liên kết luồng (Cross-layer):
        - Được gọi trực tiếp bởi `analyze_proctoring_frame_endpoint()` trong `src/api/routes/proctoring_ai.py`
          (nhận request từ `apps/api/src/modules/assessment/assessment.routes.ts`).
    Đầu vào / Đầu ra:
        - Input: `image_base64` (ảnh JPEG/PNG mã hóa base64), `escalate_vlm` (cho phép gọi Tier 2 Gemini Vision).
        - Output: Dict JSON chứa `status`, `detectorTier1`, `yoloObjectDetectorActive`, `vlmTier2Escalation`,
          `state` (`NORMAL`/`WARNING`/`ALERT`), `eventType`, `confidence`, `riskDelta`, `message`,
          `faceCount`, `headPose`, `prohibitedObjects`, `latencyMs`.
    """
    # Bước 1: Bấm giờ độ trễ và giải mã ảnh base64 sang ma trận BGR OpenCV; nếu ảnh hỏng thì trả trạng thái an toàn.
    t0 = time.perf_counter()
    bgr, img_bytes = decode_base64_image(image_base64)
    if bgr is None:
        return {
            "status": "INVALID_IMAGE",
            "state": "NORMAL",
            "eventType": "CAMERA_NORMAL",
            "confidence": 0.0,
            "riskDelta": 0.0,
            "faceCount": 1,
            "headPose": {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0},
            "prohibitedObjects": [],
            "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
        }

    # Bước 2: Chạy song song về mặt dữ liệu 2 nhánh Tier 1 cục bộ: (A) Mặt & Tư thế đầu 3D + (B) Vật thể cấm YOLOv8n.
    face_res = _detect_faces_and_pose_cv(bgr)
    yolo_res = _detect_prohibited_objects_yolov8n(bgr)

    # Đối chiếu chéo số người từ YOLOv8n: nếu phát hiện >= 2 người (kể cả quay lưng) thì cập nhật `face_count`.
    face_count = int(face_res["faceCount"])
    if yolo_res["personCount"] > face_count and yolo_res["personCount"] >= 2:
        face_count = int(yolo_res["personCount"])

    pose = face_res["headPose"]
    yaw = abs(float(pose.get("yawDeg", 0.0)))
    pitch = abs(float(pose.get("pitchDeg", 0.0)))
    prohibited = yolo_res["objects"]

    # Bước 3: Áp dụng luật chấm mức độ vi phạm theo thứ tự ưu tiên giảm dần rủi ro:
    # Điện thoại (+30) -> Nhiều người (+25) -> Không thấy mặt (+15) -> Quay đầu quá ngưỡng |Yaw|>32° / |Pitch|>28° (cảnh báo +0).
    anomalies: List[Tuple[str, float, float, str]] = []  # (eventType, confidence, riskDelta, message)
    if any(obj["eventType"] == "PHONE_DETECTED" for obj in prohibited):
        ph = next(obj for obj in prohibited if obj["eventType"] == "PHONE_DETECTED")
        anomalies.append(
            (
                "PHONE_DETECTED",
                float(ph["confidence"]),
                30.0,
                "Phát hiện điện thoại di động trong khung hình phòng thi (YOLOv8n ONNX).",
            )
        )
    if face_count >= 2:
        anomalies.append(
            (
                "MULTI_FACE",
                0.92,
                25.0,
                f"Phát hiện {face_count} người xuất hiện đồng thời trong khung hình Camera.",
            )
        )
    elif face_count == 0:
        anomalies.append(
            (
                "NO_FACE",
                0.88,
                15.0,
                "Không tìm thấy khuôn mặt thí sinh trước khung hình Camera giám sát.",
            )
        )
    elif yaw > 32.0 or pitch > 28.0:
        anomalies.append(
            (
                "LOOK_AWAY",
                round(min(0.96, 0.65 + max(yaw - 32.0, pitch - 28.0) / 60.0), 2),
                0.0,  # Warning state reminder before hard strike
                f"Góc nghiêng đầu vượt ngưỡng an toàn (Yaw={pose['yawDeg']}°, Pitch={pose['pitchDeg']}°).",
            )
        )

    # Bước 4 (Tier 2): Chỉ leo thang gọi Cloud VLM (Gemini Vision) khi có vi phạm nghiêm trọng (`riskDelta > 0`).
    vlm_verification = None
    if anomalies and escalate_vlm and anomalies[0][2] > 0:
        vlm_verification = await _verify_with_gemini_vision(
            img_bytes, [a[0] for a in anomalies]
        )

    # Bước 5: Kết luận trạng thái UI (`NORMAL` / `WARNING` / `ALERT`) và đóng gói kết quả telemetry gửi về Backend.
    if not anomalies:
        primary_event = "CAMERA_NORMAL"
        ui_state = "NORMAL"
        conf = 0.96
        risk_delta = 0.0
        msg = "Camera ổn định — Khuôn mặt & góc nhìn hợp lệ."
    else:
        primary_event, conf, risk_delta, msg = anomalies[0]
        ui_state = "ALERT" if primary_event in ("PHONE_DETECTED", "MULTI_FACE") else "WARNING"
        if vlm_verification and vlm_verification.get("vlmNote"):
            msg = f"{msg} [Xác minh VLM: {vlm_verification['vlmNote']}]"

    return {
        "status": "ANALYZED",
        "detectorTier1": face_res["detector"],
        "yoloObjectDetectorActive": bool(yolo_res["enabled"]),
        "vlmTier2Escalation": vlm_verification,
        "state": ui_state,
        "eventType": primary_event,
        "confidence": conf,
        "riskDelta": risk_delta,
        "message": msg,
        "faceCount": face_count,
        "headPose": pose,
        "prohibitedObjects": prohibited,
        "latencyMs": round((time.perf_counter() - t0) * 1000, 2),
    }
