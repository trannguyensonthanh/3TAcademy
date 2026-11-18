from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...core.model_registry import has_package
from ...core.security import verify_internal_api_key

scheduler_router = APIRouter(
    prefix="/api/v1/ai/scheduler",
    tags=["CP-SAT Cohort Schedule Optimizer (Google OR-Tools)"],
    dependencies=[Depends(verify_internal_api_key)],
)


class OptimizeScheduleRequest(BaseModel):
    sessions: List[Dict[str, Any]] = Field(default_factory=list)
    instructors: List[Dict[str, Any]] = Field(default_factory=list)
    timeSlots: List[Dict[str, Any]] = Field(default_factory=list)


def _greedy_conflict_free_fallback(
    sessions: List[Dict[str, Any]], time_slots: List[Dict[str, Any]]
) -> Dict[str, Any]:
    busy_instructor_slots: set[tuple[Any, Any]] = set()
    assignments: List[Dict[str, Any]] = []

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
        if not placed:
            return {
                "status": "INFEASIBLE",
                "solver": "CONFLICT_CHECK_FALLBACK",
                "message": "Không đủ khung giờ trống không trùng lịch giảng viên.",
            }
    return {"status": "SUCCESS", "solver": "CONFLICT_CHECK_FALLBACK", "assignments": assignments}


@scheduler_router.post("/optimize")
async def optimize_cohort_schedule(req: OptimizeScheduleRequest):
    if not req.sessions or not req.timeSlots:
        return {"status": "SUCCESS", "solver": "TRIVIAL", "assignments": []}

    if has_package("ortools"):
        from ...scheduler_ai.solver import solve_schedule

        res = solve_schedule(req.sessions, req.instructors, req.timeSlots)
        res["solver"] = "ORTOOLS_CPSAT"
        return res

    return _greedy_conflict_free_fallback(req.sessions, req.timeSlots)
