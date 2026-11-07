from ortools.sat.python import cp_model
from typing import List, Dict, Any


def solve_schedule(
    sessions: List[Dict[str, Any]],
    instructors: List[Dict[str, Any]],
    time_slots: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    CP-SAT constraint programming solver for academy scheduling.
    Ensures no instructor double-booking across cohorts.
    """
    model = cp_model.CpModel()

    # Decision variables: session_slot[(session_id, slot_id)] = 1 if assigned
    assignments = {}
    for s in sessions:
        for t in time_slots:
            assignments[(s["id"], t["id"])] = model.NewBoolVar(f"s_{s['id']}_t_{t['id']}")

    # Constraint 1: Each session must be assigned to exactly one time slot
    for s in sessions:
        model.AddExactlyOne(assignments[(s["id"], t["id"])] for t in time_slots)

    # Constraint 2: No instructor can teach two sessions at the same time slot
    for t in time_slots:
        for inst in instructors:
            inst_sessions = [s for s in sessions if s.get("instructor_id") == inst["id"]]
            if len(inst_sessions) > 1:
                model.Add(
                    sum(assignments[(s["id"], t["id"])] for s in inst_sessions) <= 1
                )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

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

