/**
 * ============================================================================
 * TỆP: apps/api/src/modules/assessment/skillMasteryModel.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Bộ máy Định lượng Năng lực Học viên theo thời gian
 *     dựa trên mô hình Trắc nghiệm tâm lý **Elo-IRT 2PL (Item Response Theory 2-Parameter Logistic)**
 *     kết hợp **Bayesian Cold-Start Prior** và **Trần phủ chương trình (Curriculum Ceiling)**.
 *   - Giải quyết bài toán sư phạm cốt lõi: Thay thế cách tính trung bình cộng ngây thơ
 *     (dễ bị lạm phát điểm 100/100 ngay Buổi 1 hoặc kìm hãm học viên tiến bộ về sau) bằng
 *     mô hình toán học phản ánh đúng độ khó câu hỏi và chiều sâu tiến trình học tập.
 *
 * CÔNG THỨC TOÁN HỌC CỐT LÕI:
 *   1. Xác suất làm đúng kỳ vọng theo hàm Logistic 2PL-IRT:
 *        `P_i = 1 / (1 + exp(-alpha * (theta - D_i)))`  (với `alpha = 0.08`)
 *   2. Cập nhật năng lực tiềm ẩn `theta` theo sai số dư bất đối xứng (Asymmetric Residual):
 *        `theta_new = theta_old + K_eff * asymmetryFactor * (y_i - P_i)`
 *      - Trả lời đúng câu khó (`D_i` cao, `P_i` thấp) -> thưởng điểm lớn.
 *      - Trả lời sai câu dễ (`P_i > 0.7`) -> phạt mạnh hơn `1.15x`.
 *   3. Trọng số giai đoạn tiến hóa `W_stage`: Buổi 1 (`1.0x`) -> Buổi 6 (`2.0x`) -> Thi cuối khóa (`3.0x`).
 *   4. Trần phủ chương trình: Buổi 1 tối đa `68` -> Buổi 6 tối đa `88` -> Đạt Thi cuối khóa mở khóa trần `100`.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Được gọi bởi: `apps/api/src/modules/assessment/assessment.routes.ts`
 *     (`gradeAndRecordAssessmentSubmission()` -> cập nhật bảng `student_skill_states`).
 *   - Không truy vấn DB trực tiếp, không gọi `apps/ai-service` (hàm thuần toán học, dễ unit-test).
 * ============================================================================
 *
 * Progressive Elo-IRT + Bayesian Skill Mastery Engine (`skillMasteryModel.ts`)
 *
 * Replaces naive arithmetic mean / fixed EMA with a psychometric 2PL-IRT / Elo model
 * featuring:
 * 1. Modest Bayesian Cold-Start Prior (theta_0 = 35) to prevent 100/100 score inflation on Session 1.
 * 2. Progressive Stage Weighting (W_stage: 1.0 -> 2.0 across sessions 1..S, and 3.0 on FINAL_EXAM)
 *    so later, deeper sessions and proctored final exams carry significantly greater authority.
 * 3. Item-Difficulty-Aware Asymmetric Residual Updates (y_i - P_i):
 *    - Answering a hard question correctly yields a large positive gain.
 *    - Missing a foundational/easy question yields a sharper penalty than missing an advanced edge case.
 * 4. Progressive Curriculum Coverage Ceiling:
 *    - Early sessions cap mastery around foundational/intermediate levels (~68..88).
 *    - Passing FINAL_EXAM unlocks the full [0..100] Mastery ceiling.
 */

export interface SkillItemObservation {
  isCorrect: boolean;
  points?: number;
  itemOrder?: number;
  totalItems?: number;
  hasScenarioTag?: boolean;
}

export interface ProgressiveSkillUpdateInput {
  /** Existing normalized score in [0..100], or null/undefined if no prior evidence exists */
  previousScore: number | null | undefined;
  /** Number of prior assessment evidences recorded for this (student, skill) */
  previousEvidenceCount: number;
  /** 1-based session order (1..S) for SESSION_ASSIGNMENT, or null for FINAL_EXAM */
  sessionOrder: number | null;
  /** Total sessions in the cohort (default 6) */
  totalSessionsInCohort?: number;
  /** Whether the current attempt is a cohort-wide proctored FINAL_EXAM */
  isFinalExam: boolean;
  /** Whether the student passed the current attempt */
  attemptPassed: boolean;
  /** Whether the student has already passed the cohort FINAL_EXAM previously */
  hasPassedCohortFinalExam?: boolean;
  /** Graded item outcomes belonging to this skill */
  items: SkillItemObservation[];
}

export interface ProgressiveSkillUpdateOutput {
  previousScore: number;
  newScore: number;
  delta: number;
  stageWeight: number;
  ceilingApplied: number;
  updatedEvidenceCount: number;
}

const COLD_START_PRIOR_THETA = 40;
const IRT_DISCRIMINATION_ALPHA = 0.08;
const BASE_K_FACTOR = 18;

/**
 * Tính trọng số giai đoạn tiến hóa `W_stage` theo vị trí buổi học trong khóa.
 *
 * - **Mục tiêu:** Đảm bảo kết quả ở các buổi chuyên sâu cuối khóa và Kỳ thi cuối khóa có sức nặng
 *   quyết định hơn nhiều so với bài Quiz nhập môn ở Buổi 1.
 * - **Đầu vào:** `sessionOrder` (1..S hoặc `null`), `totalSessionsInCohort` (mặc định 6), `isFinalExam`.
 * - **Đầu ra:** Hệ số trọng số: Buổi 1 -> `1.00`, Buổi 6 -> `2.00`, `FINAL_EXAM` -> `3.00`.
 *
 * Computes progressive stage weight W_stage:
 * - Session 1 of 6 -> 1.00
 * - Session 6 of 6 -> 2.00
 * - FINAL_EXAM     -> 3.00
 */
export function computeStageWeight(
  sessionOrder: number | null,
  totalSessionsInCohort = 6,
  isFinalExam = false
): number {
  if (isFinalExam) {
    return 3.0;
  }
  const safeTotal = Math.max(1, totalSessionsInCohort);
  const clampedOrder = Math.min(safeTotal, Math.max(1, sessionOrder ?? 1));
  if (safeTotal === 1) {
    return 1.5;
  }
  const progressRatio = (clampedOrder - 1) / (safeTotal - 1);
  return Number((1.0 + 1.0 * progressRatio).toFixed(3));
}

/**
 * Ước lượng độ khó chuẩn hóa `D_i` trong khoảng `[25, 85]` cho từng câu hỏi trắc nghiệm.
 *
 * - **Mục tiêu:** Mô hình hóa độ khó câu hỏi từ 4 yếu tố: chiều sâu buổi học (Buổi 1: 30 -> Buổi 6: 62 -> Thi cuối: 68),
 *   vị trí tương đối của câu trong đề (`+0..8`), hệ số điểm cao (`+5`) và có tình huống thực chiến `hasScenarioTag` (`+4`).
 * - **Đầu ra:** Số thực `D_i` nằm trong `[25, 85]`.
 *
 * Estimates calibrated item difficulty D_i in [25, 85] from curriculum depth,
 * item points weight, relative position inside the assessment, and scenario complexity.
 */
export function estimateItemDifficulty(
  obs: SkillItemObservation,
  sessionOrder: number | null,
  totalSessionsInCohort = 6,
  isFinalExam = false
): number {
  const safeTotalSessions = Math.max(1, totalSessionsInCohort);
  const sessionDepthRatio = isFinalExam
    ? 0.9
    : (Math.min(safeTotalSessions, Math.max(1, sessionOrder ?? 1)) - 1) /
      Math.max(1, safeTotalSessions - 1);

  // Base difficulty rises from 30 (Session 1) -> 62 (Session 6) -> 68 (Final Exam)
  let difficulty = 30 + sessionDepthRatio * 32 + (isFinalExam ? 6 : 0);

  // Relative item position within the quiz/exam (+0..8)
  const totalItems = Math.max(1, obs.totalItems ?? 1);
  const itemIdx = Math.min(totalItems, Math.max(1, obs.itemOrder ?? 1));
  if (totalItems > 1) {
    difficulty += ((itemIdx - 1) / (totalItems - 1)) * 8;
  }

  // Higher point weight or real-world scenario tag increases difficulty (+4..7)
  if ((obs.points ?? 1) > 1.2) {
    difficulty += 5;
  }
  if (obs.hasScenarioTag) {
    difficulty += 4;
  }

  return Math.min(85, Math.max(25, Number(difficulty.toFixed(2))));
}

/**
 * Tính trần phủ chương trình (Curriculum Coverage Ceiling) giới hạn điểm thành thạo tối đa ở mỗi chặng.
 *
 * - **Mục tiêu:** Ngăn tình trạng học viên mới làm đúng 4 câu Quiz Buổi 1 đã hiện 100% thành thạo kỹ năng;
 *   chỉ khi hoàn thành các buổi sau (trần tăng dần 68 -> 88) và vượt qua Kỳ thi cuối khóa mới mở trần 100.
 * - **Đầu ra:** Ngưỡng trần nguyên trong `{68..88, 100}`.
 *
 * Computes curriculum coverage ceiling so early introductory quizzes cannot inflate
 * mastery to 100/100 before advanced sessions and Final Exam are completed.
 */
export function computeCurriculumCeiling(params: {
  sessionOrder: number | null;
  totalSessionsInCohort?: number;
  isFinalExam: boolean;
  attemptPassed: boolean;
  hasPassedCohortFinalExam?: boolean;
}): number {
  if ((params.isFinalExam && params.attemptPassed) || params.hasPassedCohortFinalExam) {
    return 100;
  }
  if (params.isFinalExam && !params.attemptPassed) {
    return 88;
  }
  const safeTotal = Math.max(1, params.totalSessionsInCohort ?? 6);
  const clampedOrder = Math.min(safeTotal, Math.max(1, params.sessionOrder ?? 1));
  const depthRatio = safeTotal > 1 ? (clampedOrder - 1) / (safeTotal - 1) : 1;
  // Session 1 cap = 68, Session 2 = 72, Session 3 = 76, Session 4 = 80, Session 5 = 84, Session 6 = 88
  return Math.min(88, Math.round(68 + depthRatio * 20));
}

/**
 * Thuật toán cập nhật điểm thành thạo kỹ năng tiến bộ **Elo-IRT 2PL** cho cặp `(Học viên, Kỹ năng)`.
 *
 * - **Mục tiêu:** Tính điểm năng lực mới `newScore` (0..100) và độ biến thiên `delta` sau khi học viên nộp bài.
 * - **Liên kết luồng (Cross-layer):** Được gọi trong Transaction của `gradeAndRecordAssessmentSubmission()`
 *   (`apps/api/src/modules/assessment/assessment.routes.ts`) để ghi bảng `student_skill_states`.
 * - **Đầu vào:** `ProgressiveSkillUpdateInput` (điểm cũ, số bằng chứng trước đó, thứ tự buổi, cờ thi cuối khóa, danh sách câu đúng/sai).
 * - **Đầu ra:** `ProgressiveSkillUpdateOutput` (`previousScore`, `newScore`, `delta`, `stageWeight`, `ceilingApplied`, `updatedEvidenceCount`).
 */
export function computeProgressiveSkillMastery(
  input: ProgressiveSkillUpdateInput
): ProgressiveSkillUpdateOutput {
  // Bước 1: Xác định năng lực khởi điểm `theta` — nếu chưa có bằng chứng cũ thì khởi tạo bằng Bayesian Cold-Start Prior (`40`)
  const totalSessions = Math.max(1, input.totalSessionsInCohort ?? 6);
  const hasPrior =
    typeof input.previousScore === 'number' &&
    Number.isFinite(input.previousScore) &&
    input.previousEvidenceCount > 0;

  const displayedPreviousScore = hasPrior
    ? Math.min(100, Math.max(0, Math.round(input.previousScore!)))
    : 0;

  // Latent ability starts at Bayesian prior (35) on first observation
  let theta = hasPrior ? displayedPreviousScore : COLD_START_PRIOR_THETA;

  const stageWeight = computeStageWeight(
    input.sessionOrder,
    totalSessions,
    input.isFinalExam
  );

  // Bước 2: Tính hệ số bước nhảy hiệu dụng `effectiveK` = (BASE_K * W_stage * hệ số giảm chấn theo số bằng chứng) / sqrt(số câu)
  // Dampen step size gently with evidence count, but amplify by stageWeight so late sessions dominate!
  const evidenceDamping = 1 / (1 + 0.06 * Math.min(12, Math.max(0, input.previousEvidenceCount)));
  const itemsCount = Math.max(1, input.items.length);
  const effectiveK = (BASE_K_FACTOR * stageWeight * evidenceDamping) / Math.sqrt(itemsCount);

  // Bước 3: Lặp qua từng câu hỏi của kỹ năng để cập nhật `theta` theo mô hình 2PL-IRT (xác suất kỳ vọng P_i và sai số dư bất đối xứng)
  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i]!;
    const d_i = estimateItemDifficulty(
      {
        ...item,
        itemOrder: item.itemOrder ?? i + 1,
        totalItems: item.totalItems ?? itemsCount,
      },
      input.sessionOrder,
      totalSessions,
      input.isFinalExam
    );

    const expectedProb = 1 / (1 + Math.exp(-IRT_DISCRIMINATION_ALPHA * (theta - d_i)));
    const actualOutcome = item.isCorrect ? 1 : 0;
    const residual = actualOutcome - expectedProb;

    // Asymmetric penalty/reward: missing an easy item (expectedProb > 0.7) carries 1.15x weight
    const asymmetryFactor = !item.isCorrect && expectedProb > 0.7 ? 1.15 : 1.0;
    theta += effectiveK * asymmetryFactor * residual;
  }

  // Bước 4: Neo kéo hiệu suất giai đoạn cuối (stageWeight >= 1.8 & đúng >= 80%) giúp học viên bứt phá không bị điểm thấp đầu khóa kéo lùi
  // Blend in stage-weighted empirical performance anchor when stageWeight >= 1.8 (late sessions / Final Exam)
  // so a student who improved dramatically in late sessions is not held back by early low scores!
  const correctRatio =
    input.items.filter((it) => it.isCorrect).length / Math.max(1, input.items.length);
  if (stageWeight >= 1.8 && correctRatio >= 0.8) {
    const targetAnchor = 55 + correctRatio * 42;
    const pullAlpha = input.isFinalExam ? 0.42 : 0.25;
    theta = theta * (1 - pullAlpha) + targetAnchor * pullAlpha;
  }

  // Bước 5: Áp trần phủ chương trình `effectiveCeiling` (không bao giờ hạ điểm cũ chỉ vì trần thấp hơn) và chặn sàn tối thiểu `8`
  const ceiling = computeCurriculumCeiling({
    sessionOrder: input.sessionOrder,
    totalSessionsInCohort: totalSessions,
    isFinalExam: input.isFinalExam,
    attemptPassed: input.attemptPassed,
    hasPassedCohortFinalExam: input.hasPassedCohortFinalExam,
  });

  // Never drop an already-higher score purely due to ceiling if they already unlocked a higher score earlier
  const effectiveCeiling = hasPrior ? Math.max(ceiling, displayedPreviousScore) : ceiling;
  const boundedNewScore = Math.min(
    effectiveCeiling,
    Math.max(8, Math.round(theta))
  );
  const delta = boundedNewScore - displayedPreviousScore;

  return {
    previousScore: displayedPreviousScore,
    newScore: boundedNewScore,
    delta,
    stageWeight,
    ceilingApplied: effectiveCeiling,
    updatedEvidenceCount: Math.max(0, input.previousEvidenceCount) + input.items.length,
  };
}

/**
 * Tính điểm trung bình có trọng số giai đoạn (`W_stage`) trên nhiều lượt bài kiểm tra trong cùng một đợt học.
 *
 * - **Đầu vào:** Mảng lượt làm bài `{ scorePct, sessionOrder?, isFinalExam? }` và tổng số buổi.
 * - **Đầu ra:** Điểm phần trăm nguyên `[0..100]` trong đó buổi sau (1.0x -> 2.0x) và Thi cuối khóa (3.0x) có trọng số cao hơn.
 *
 * Stage-weighted average score across multiple assessment attempts in a cohort.
 * Later sessions (1.0x -> 2.0x) and FINAL_EXAM (3.0x) weigh more than early introductory quizzes.
 */
export function computeWeightedCohortScorePct(
  attempts: Array<{
    scorePct: number;
    sessionOrder?: number | null;
    isFinalExam?: boolean;
  }>,
  totalSessionsInCohort = 6
): number {
  if (attempts.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const att of attempts) {
    const w = computeStageWeight(
      att.sessionOrder ?? null,
      totalSessionsInCohort,
      Boolean(att.isFinalExam)
    );
    weightedSum += att.scorePct * w;
    weightTotal += w;
  }
  return weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
}
