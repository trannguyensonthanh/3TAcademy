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

COCO_PROHIBITED_CLASSES = {
    67: ("cell phone", "PHONE_DETECTED", 30.0),
    73: ("book", "BOOK_DETECTED", 15.0),
    63: ("laptop", "SECOND_SCREEN_DETECTED", 15.0),
}

_yolo_ort_session: Any = None
_haar_face_cascade: Any = None
_haar_eye_cascade: Any = None
_mp_face_mesh: Any = None


def _get_yolo_session() -> Any:
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
    """
    Computes 3D Euler head orientation angles (Yaw, Pitch, Roll in degrees)
    from 6 2D facial landmarks using Perspective-n-Point (`cv2.solvePnP`).
    """
    import cv2

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

    ok, rvec, tvec = cv2.solvePnP(
        MODEL_3D_FACE_POINTS,
        image_2d_points.astype(np.float64),
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return {"yawDeg": 0.0, "pitchDeg": 0.0, "rollDeg": 0.0}

    rmat, _ = cv2.Rodrigues(rvec)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
    pitch = float(angles[0])
    yaw = float(angles[1])
    roll = float(angles[2])

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
    global _haar_face_cascade, _haar_eye_cascade
    import cv2

    h, w = bgr.shape[:2]

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
    """
    Runs YOLOv8n ONNX (`1x3x640x640` -> `1x84x8400`) via `onnxruntime` to detect
    prohibited exam items (`cell phone`, `book`, `laptop`) + person count cross-check.
    """
    sess = _get_yolo_session()
    if sess is None or not has_package("cv2"):
        return {"enabled": False, "objects": [], "personCount": 0}

    import cv2

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

    input_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {input_name: blob})
    preds = np.squeeze(outputs[0])  # (84, 8400) or (8400, 84)
    if preds.shape[0] == 84:
        preds = preds.T  # -> (8400, 84)

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
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not is_valid_gemini_key(api_key):
        return None
    try:
        model_name = (settings.GEMINI_MODEL or "gemini-2.5-flash").strip()
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

    face_res = _detect_faces_and_pose_cv(bgr)
    yolo_res = _detect_prohibited_objects_yolov8n(bgr)

    face_count = int(face_res["faceCount"])
    if yolo_res["personCount"] > face_count and yolo_res["personCount"] >= 2:
        face_count = int(yolo_res["personCount"])

    pose = face_res["headPose"]
    yaw = abs(float(pose.get("yawDeg", 0.0)))
    pitch = abs(float(pose.get("pitchDeg", 0.0)))
    prohibited = yolo_res["objects"]

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

    vlm_verification = None
    if anomalies and escalate_vlm and anomalies[0][2] > 0:
        vlm_verification = await _verify_with_gemini_vision(
            img_bytes, [a[0] for a in anomalies]
        )

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
