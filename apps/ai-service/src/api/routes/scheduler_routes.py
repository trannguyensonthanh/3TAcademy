"""Router API Xếp lịch Đợt học Tối ưu (AI Cohort Scheduler) dùng Google OR-Tools CP-SAT.

Vai trò trong kiến trúc 3 tầng (Frontend `apps/web` <-> Backend `apps/api` <-> AI Service `apps/ai-service`):
- Phục vụ quản trị viên (Admin/Academic Ops) tự động xếp lịch các buổi học (`sessions`) vào các khung giờ (`timeSlots`)
  sao cho KHÔNG xảy ra xung đột lịch giảng dạy của giảng viên (`instructors`).
- Ưu tiên gọi bộ giải lập trình ràng buộc (Constraint Programming) Google OR-Tools CP-SAT (`src/scheduler_ai/solver.py`);
  nếu môi trường chưa cài `ortools`, tự động rơi về thuật toán tham lam kiểm tra xung đột (`_greedy_conflict_free_fallback`).

Liên kết chéo (Cross-layer):
- Bảo vệ bởi `verify_internal_api_key` (`X-Internal-Key`), nhận yêu cầu từ luồng quản trị lịch học của Backend `apps/api`.
- Gọi `has_package("ortools")` (`src/core/model_registry.py`) và `solve_schedule()` (`src/scheduler_ai/solver.py`).
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.model_registry import has_package
from ...core.security import verify_internal_api_key

# Khai báo router tối ưu lịch học `/api/v1/ai/scheduler`.
scheduler_router = APIRouter(
    prefix="/api/v1/ai/scheduler",
    tags=["CP-SAT Cohort Schedule Optimizer (Google OR-Tools)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class OptimizeScheduleRequest(BaseModel):
    """Schema dữ liệu đầu vào cho bài toán xếp lịch: danh sách buổi học, giảng viên và khung giờ trống."""

    sessions: List[Dict[str, Any]] = Field(default_factory=list)
    instructors: List[Dict[str, Any]] = Field(default_factory=list)
    timeSlots: List[Dict[str, Any]] = Field(default_factory=list)


def _greedy_conflict_free_fallback(
    sessions: List[Dict[str, Any]], time_slots: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Thuật toán xếp lịch tham lam (Greedy) không trùng lịch giảng viên khi môi trường không có Google OR-Tools.

    Mục tiêu:
        Đảm bảo tính năng xếp lịch vẫn hoạt động trơn tru trên môi trường nhẹ bằng cách gán lần lượt từng buổi học
        vào khung giờ đầu tiên mà giảng viên phụ trách chưa bận.
    Liên kết luồng (Cross-layer):
        Được gọi nội bộ bởi `optimize_cohort_schedule()` khi `has_package("ortools") == False`.
    Đầu vào / Đầu ra:
        - Input: `sessions` (mỗi phần tử có `id`, `instructor_id`), `time_slots` (mỗi phần tử có `id`).
        - Output: Dict JSON gồm `status` (`SUCCESS` hoặc `INFEASIBLE`), `solver`, và danh sách `assignments`.
    """
    # Bước 1: Dùng tập hợp (set) theo dõi các cặp `(instructor_id, slot_id)` đã bị chiếm dụng trong O(1).
    busy_instructor_slots: set[tuple[Any, Any]] = set()
    assignments: List[Dict[str, Any]] = []

    # Bước 2: Duyệt từng buổi học và chọn khung giờ trống đầu tiên không xung đột giảng viên.
    for s in sessions:
        sid = s.get("id")
        inst_id = s.get("instructor_id")
        placed = False
        for t in time_slots:
            tid = t.get("id")
            if (inst_id, tid) not in busy_instructor_slots:
                busy_instructor_slots.add((inst_id, tid))
                assignments.append({"session_id": sid, "slot_id": tid})
                placed = True
                break
        # Bước 3: Nếu có ít nhất 1 buổi học không thể đặt vào bất kỳ khung giờ nào, báo bài toán vô nghiệm (INFEASIBLE).
        if not placed:
            return {
                "status": "INFEASIBLE",
                "solver": "CONFLICT_CHECK_FALLBACK",
                "message": "Không đủ khung giờ trống không trùng lịch giảng viên.",
            }
    return {"status": "SUCCESS", "solver": "CONFLICT_CHECK_FALLBACK", "assignments": assignments}


@scheduler_router.post("/optimize")
async def optimize_cohort_schedule(req: OptimizeScheduleRequest):
    """Endpoint tối ưu hóa lịch học cho một hoặc nhiều đợt học (Cohort) không trùng lịch giảng viên.

    Mục tiêu:
        Giải bài toán phân công tài nguyên (Timetabling / CSP) bằng Google OR-Tools CP-SAT để tìm nghiệm
        tối ưu/hợp lệ, kèm nhãn `solver` minh bạch cho Backend hiển thị kết quả.
    Liên kết luồng (Cross-layer):
        - Nhận yêu cầu từ Admin qua Backend `apps/api` tới `POST /api/v1/ai/scheduler/optimize`.
        - Gọi `solve_schedule()` trong `src/scheduler_ai/solver.py` (nếu có `ortools`) hoặc `_greedy_conflict_free_fallback()`.
    Đầu vào / Đầu ra:
        - Input: `OptimizeScheduleRequest` (`sessions`, `instructors`, `timeSlots`).
        - Output: Dict JSON chứa `status`, `solver` (`TRIVIAL` / `ORTOOLS_CPSAT` / `CONFLICT_CHECK_FALLBACK`) và `assignments`.
    """
    # Bước 1: Xử lý trường hợp biên rỗng (không có buổi học hoặc không có khung giờ).
    if not req.sessions or not req.timeSlots:
        return {"status": "SUCCESS", "solver": "TRIVIAL", "assignments": []}

    # Bước 2: Nếu thư viện Google OR-Tools sẵn sàng, chuyển sang bộ giải CP-SAT tối ưu ràng buộc toàn cục.
    if has_package("ortools"):
        from ...scheduler_ai.solver import solve_schedule

        res = solve_schedule(req.sessions, req.instructors, req.timeSlots)
        res["solver"] = "ORTOOLS_CPSAT"
        return res

    # Bước 3: Dự phòng bằng thuật toán tham lam khi thiếu OR-Tools.
    return _greedy_conflict_free_fallback(req.sessions, req.timeSlots)
