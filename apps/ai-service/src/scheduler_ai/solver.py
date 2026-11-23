"""Bộ giải bài toán Xếp lịch Đợt học bằng Lập trình Ràng buộc (Google OR-Tools CP-SAT).

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Đóng vai trò lõi toán học tối ưu tổ hợp (Combinatorial Optimization) cho tính năng AI Cohort Scheduler.
- Mô hình hóa bài toán xếp lịch học thành bài toán thỏa mãn ràng buộc nhị phân (Boolean CSP / SAT):
  mỗi cặp `(buổi học s, khung giờ t)` là một biến quyết định `x_{s,t} ∈ {0, 1}`.

Liên kết chéo (Cross-layer):
- Được gọi bởi endpoint `POST /api/v1/ai/scheduler/optimize` tại `src/api/routes/scheduler_routes.py`
  khi môi trường có cài `ortools` (được quản trị viên gọi thông qua Backend `apps/api`).
"""

from ortools.sat.python import cp_model
from typing import List, Dict, Any


def solve_schedule(
    sessions: List[Dict[str, Any]],
    instructors: List[Dict[str, Any]],
    time_slots: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Giải bài toán phân công buổi học vào khung giờ bằng Google OR-Tools CP-SAT đảm bảo không trùng lịch giảng viên.

    Mục tiêu:
        Tìm một phương án phân bổ hợp lệ (hoặc tối ưu) sao cho:
        - Ràng buộc cứng 1 (Assignment): Mỗi buổi học `s` được xếp vào ĐÚNG 1 khung giờ `t` (`∑_t x_{s,t} = 1`).
        - Ràng buộc cứng 2 (No Double-Booking): Tại mỗi khung giờ `t`, mỗi giảng viên `inst` dạy TỐI ĐA 1 buổi học
          (`∑_{s ∈ S(inst)} x_{s,t} <= 1`).
    Liên kết luồng (Cross-layer):
        Được gọi từ `optimize_cohort_schedule()` trong `src/api/routes/scheduler_routes.py`.
    Đầu vào / Đầu ra:
        - Input:
            + `sessions`: Danh sách dict buổi học (cần trường `id`, `instructor_id`).
            + `instructors`: Danh sách dict giảng viên (cần trường `id`).
            + `time_slots`: Danh sách dict khung giờ khả dụng (cần trường `id`).
        - Output:
            + Nếu tìm thấy nghiệm (`OPTIMAL` / `FEASIBLE`): `{"status": "SUCCESS", "assignments": [{"session_id", "slot_id"}, ...]}`.
            + Nếu vô nghiệm (`INFEASIBLE` / timeout): `{"status": "INFEASIBLE", "message": ...}`.
    """
    # CP-SAT constraint programming solver for academy scheduling.
    # Ensures no instructor double-booking across cohorts.
    # Bước 1: Khởi tạo mô hình CP-SAT và khai báo ma trận biến quyết định nhị phân `assignments[(s, t)] ∈ {0, 1}`.
    model = cp_model.CpModel()

    # Decision variables: session_slot[(session_id, slot_id)] = 1 if assigned
    assignments = {}
    for s in sessions:
        for t in time_slots:
            assignments[(s["id"], t["id"])] = model.NewBoolVar(f"s_{s['id']}_t_{t['id']}")

    # Bước 2: Ràng buộc cứng 1 — Mỗi buổi học phải được xếp vào duy nhất một khung giờ (`AddExactlyOne`).
    # Constraint 1: Each session must be assigned to exactly one time slot
    for s in sessions:
        model.AddExactlyOne(assignments[(s["id"], t["id"])] for t in time_slots)

    # Bước 3: Ràng buộc cứng 2 — Trong cùng một khung giờ, một giảng viên không thể dạy đồng thời >= 2 buổi học.
    # Constraint 2: No instructor can teach two sessions at the same time slot
    for t in time_slots:
        for inst in instructors:
            inst_sessions = [s for s in sessions if s.get("instructor_id") == inst["id"]]
            if len(inst_sessions) > 1:
                model.Add(
                    sum(assignments[(s["id"], t["id"])] for s in inst_sessions) <= 1
                )

    # Bước 4: Cấu hình giới hạn thời gian giải tối đa 10 giây (chống treo tiến trình) và chạy bộ giải CP-SAT.
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    # Bước 5: Trích xuất các cặp `(session_id, slot_id)` có biến quyết định bằng 1 nếu bài toán có nghiệm.
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = []
        for s in sessions:
            for t in time_slots:
                if solver.Value(assignments[(s["id"], t["id"])]) == 1:
                    results.append({"session_id": s["id"], "slot_id": t["id"]})
        return {"status": "SUCCESS", "assignments": results}
    else:
        return {
            "status": "INFEASIBLE",
            "message": "Không thể tìm thấy lịch học thỏa mãn toàn bộ ràng buộc (xung đột giờ giảng viên)",
        }

