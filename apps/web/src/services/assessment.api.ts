import { httpRequest } from './apiClient';
import {
  StudentSafePromptConfigItem,
  StoredMcqAttemptResult,
  AssessmentPublishStatus,
  McqQuestionItem,
} from '../types/domain';

export type {
  StudentSafePromptConfigItem,
  StoredMcqAttemptResult,
  AssessmentPublishStatus,
  McqQuestionItem,
};

export interface StudentAssessmentPayload {
  assessmentId: string;
  cohortId?: string;
  sessionId?: string;
  isFinalExam: boolean;
  status?: AssessmentPublishStatus;
  title: string;
  questionCount: number;
  timeLimitMinutes: number;
  isRetakeLocked: boolean;
  hasPassedFinalExam?: boolean;
  promptConfig: StudentSafePromptConfigItem[];
}

export interface AssessmentResultWithMeta extends StoredMcqAttemptResult {
  cohortId?: string;
  sessionId?: string;
  finalExamId?: string;
  hasStoredAttempt?: boolean;
  hasPassedFinalExam?: boolean;
  questionsWithExplanations?: McqQuestionItem[];
  submission?: StoredMcqAttemptResult;
}

export const assessmentApi = {
  getAssessmentForStudent: (assessmentId: string) =>
    httpRequest<StudentAssessmentPayload>(
      `/assessments/${encodeURIComponent(assessmentId)}`,
      { method: 'GET' }
    ),

  startAssessmentAttempt: (assessmentId: string) =>
    httpRequest<{
      attemptId: string;
      assessmentId: string;
      attemptNumber: number;
      startedAt: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/start`, {
      method: 'POST',
    }),

  submitAssessmentAttempt: (
    assessmentId: string,
    answers: Record<number, number>,
    telemetryLog?: unknown
  ) =>
    httpRequest<
      StoredMcqAttemptResult & {
        bonusInterviewCreditsAdded?: number;
        updatedInterviewCredits?: number;
        issuedCertificateCode?: string;
      }
    >(
      `/assessments/${encodeURIComponent(assessmentId)}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers, telemetryLog }),
      }
    ),

  getAssessmentResult: (assessmentId: string) =>
    httpRequest<AssessmentResultWithMeta>(
      `/assessments/${encodeURIComponent(assessmentId)}/result`,
      { method: 'GET' }
    ),

  reportProctoringEvent: (
    assessmentId: string,
    eventType: string,
    snapshotNote?: string
  ) =>
    httpRequest<{
      assessmentId: string;
      recorded: boolean;
      eventType: string;
      timestamp: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/proctoring-events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, snapshotNote }),
    }),

  analyzeProctoringSnapshot: (
    assessmentId: string,
    imageBase64: string,
    videoOffsetSec?: number
  ) =>
    httpRequest<{
      assessmentId: string;
      recorded: boolean;
      detectorTier1?: string;
      yoloObjectDetectorActive?: boolean;
      state: 'NORMAL' | 'WARNING' | 'ALERT';
      eventType: string;
      confidence: number;
      riskDelta: number;
      message: string;
      faceCount: number;
      headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
      prohibitedObjects: Array<{ label?: string; confidence?: number }>;
      latencyMs?: number;
      timestamp: string;
    }>(`/assessments/${encodeURIComponent(assessmentId)}/proctoring-snapshot`, {
      method: 'POST',
      body: JSON.stringify({ imageBase64, videoOffsetSec, escalateVlm: true }),
    }),
};
