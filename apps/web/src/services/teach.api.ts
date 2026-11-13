import { httpRequest } from './apiClient';
import {
  Cohort,
  ClassSession,
  DiscussionThread,
  CohortMaterial,
  Enrollment,
  ChatMessage,
  Notification,
  McqQuestionItem,
  AssessmentPublishStatus,
} from '../types/domain';

export type { McqQuestionItem, AssessmentPublishStatus };

export interface ExamCameraReviewItem {
  id: string;
  studentName: string;
  studentEmail?: string;
  cohortCode: string;
  examTitle?: string;
  mcqScore: string;
  submittedAt?: string;
  cameraFlagReason: string;
  cameraTimestamp: string;
  snapshotNote: string;
  decision: 'PENDING' | 'APPROVED' | 'RETAKE_REQUIRED';
}

export const teachApi = {
  getInstructorSchedule: () =>
    httpRequest<{
      liveSession: ClassSession;
      upcomingSessions: ClassSession[];
      allSessions: ClassSession[];
      examReviews: ExamCameraReviewItem[];
      enrollments: Enrollment[];
      chatMessages: ChatMessage[];
      notifications: Notification[];
      discussions: DiscussionThread[];
      materials: CohortMaterial[];
    }>('/teach/schedule', {
      method: 'GET',
    }),

  getInstructorCohorts: () =>
    httpRequest<Cohort[]>('/teach/cohorts', {
      method: 'GET',
    }),

  getInstructorCohortDetail: (cohortId: string) =>
    httpRequest<{
      cohort: Cohort;
      sessions: ClassSession[];
      finalExamAssessmentId?: string;
      finalExamQuestions: McqQuestionItem[];
      finalExamPublishStatus?: AssessmentPublishStatus;
      enrollments?: Enrollment[];
      discussions?: DiscussionThread[];
      materials?: CohortMaterial[];
    }>(`/teach/cohorts/${encodeURIComponent(cohortId)}`, {
      method: 'GET',
    }),

  getInstructorSessionDetail: (cohortId: string, sessionId: string) =>
    httpRequest<{
      session: ClassSession;
      videoUrl?: string;
      playbackType?: 'MP4' | 'HLS' | 'NONE';
      assessmentId?: string;
      questions: McqQuestionItem[];
      publishStatus: AssessmentPublishStatus;
      materials?: CohortMaterial[];
      discussions?: DiscussionThread[];
    }>(
      `/teach/cohorts/${encodeURIComponent(cohortId)}/sessions/${encodeURIComponent(
        sessionId
      )}`,
      { method: 'GET' }
    ),

  updateSessionSummary: (sessionId: string, aiSummaryMd: string) =>
    httpRequest<{
      sessionId: string;
      updated: boolean;
      updatedAt: string;
      videoUrl?: string;
      session?: ClassSession;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/materials`, {
      method: 'PUT',
      body: JSON.stringify({ aiSummaryMd }),
    }),

  updateSessionMaterials: (
    sessionId: string,
    payload: {
      title?: string;
      aiSummaryMd?: string;
      scheduledStart?: string;
      videoR2Key?: string;
      status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      durationSeconds?: number;
      cohortId?: string;
      sessionOrder?: number;
      materialTitle?: string;
      fileType?: 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK';
    }
  ) =>
    httpRequest<{
      sessionId: string;
      updated: boolean;
      updatedAt: string;
      videoUrl?: string;
      playbackType?: 'MP4' | 'HLS' | 'NONE';
      session?: ClassSession;
      material?: CohortMaterial;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/materials`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateSessionLiveStatus: (
    sessionId: string,
    payload: {
      status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      videoR2Key?: string;
      activeSlideLabel?: string;
      liveTopicNote?: string;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      videoUrl: string;
      playbackType: 'MP4' | 'HLS' | 'NONE';
      hostBroadcast: {
        activeSlideLabel: string;
        liveTopicNote: string;
        updatedAt: string;
      };
      updatedAt: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/live-status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  muteSessionParticipant: (
    sessionId: string,
    payload: {
      targetIdentity?: string;
      accountId?: string;
      muteAllStudents?: boolean;
      muted?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      muted: boolean;
      muteAllStudents: boolean;
      mutedIdentities: string[];
      sfuMutedTracks: number;
      sfuSynced: boolean;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/mute-participant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  kickSessionParticipant: (
    sessionId: string,
    payload: {
      targetIdentity?: string;
      accountId?: string;
      kicked?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      kicked: boolean;
      targetIdentity: string;
      kickedIdentities: string[];
      sfuRemoved: boolean;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/kick-participant`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startSessionRecording: (sessionId: string) =>
    httpRequest<{
      sessionId: string;
      roomName: string;
      recording: {
        isRecording: boolean;
        egressId?: string;
        objectKey?: string;
        publicUrl?: string;
        mode?: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
        startedAt?: string;
      };
      presignedUploadUrl?: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/start`, {
      method: 'POST',
    }),

  stopSessionRecording: (
    sessionId: string,
    payload?: { objectKey?: string; markReplayReady?: boolean }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      recording: {
        isRecording: boolean;
        egressId?: string;
        objectKey?: string;
        publicUrl?: string;
        stoppedAt?: string;
      };
      videoUrl: string;
      playbackType: 'MP4' | 'HLS' | 'NONE';
      r2PublicUrl: string;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/stop`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  uploadSessionRecordingToR2: (
    sessionId: string,
    payload: {
      fileName?: string;
      contentType?: string;
      base64Data: string;
      markReplayReady?: boolean;
    }
  ) =>
    httpRequest<{
      sessionId: string;
      status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
      objectKey: string;
      videoUrl: string;
      sizeBytes: number;
      recording: {
        isRecording: boolean;
        objectKey?: string;
        publicUrl?: string;
        stoppedAt?: string;
      };
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/recording/upload`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateSessionQuizByAi: (sessionId: string) =>
    httpRequest<{
      assessmentId: string;
      sessionId: string;
      status: AssessmentPublishStatus;
      items: McqQuestionItem[];
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/generate-quiz`, {
      method: 'POST',
    }),

  publishAssessment: (
    assessmentId: string,
    items: McqQuestionItem[],
    status: AssessmentPublishStatus = 'PUBLISHED'
  ) =>
    httpRequest<{
      assessmentId: string;
      status: AssessmentPublishStatus;
      publishedCount: number;
      publishedAt: string;
    }>(`/teach/assessments/${encodeURIComponent(assessmentId)}/publish`, {
      method: 'PUT',
      body: JSON.stringify({ status, items }),
    }),

  createGuestSpeakerLink: (sessionId: string) =>
    httpRequest<{
      sessionId: string;
      oneTimeGuestUrl: string;
      expiresInHours: number;
    }>(`/teach/sessions/${encodeURIComponent(sessionId)}/guest-link`, {
      method: 'POST',
    }),

  replyAndVerifyDiscussion: (threadId: string, content: string) =>
    httpRequest<{
      threadId: string;
      verifiedByStaff: boolean;
      repliedAt: string;
      thread?: DiscussionThread;
    }>(`/teach/discussions/${encodeURIComponent(threadId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  reviewExamProctoring: (
    reviewId: string,
    decision: 'APPROVED' | 'RETAKE_REQUIRED'
  ) =>
    httpRequest<{
      reviewId: string;
      decision: 'APPROVED' | 'RETAKE_REQUIRED';
      updatedAt: string;
    }>(`/teach/exam-reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PUT',
      body: JSON.stringify({ decision }),
    }),

  sendAiPersonalizedReminder: (enrollmentId: string) =>
    httpRequest<{
      notificationId: string;
      enrollmentId: string;
      type: 'AI_STUDY_REMINDER';
      title: string;
      createdAt: string;
    }>(`/teach/enrollments/${encodeURIComponent(enrollmentId)}/ai-reminder`, {
      method: 'POST',
    }),
};
