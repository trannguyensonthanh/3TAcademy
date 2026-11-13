import { httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  ClassSession,
  DiscussionThread,
  CohortMaterial,
  UpcomingTaskItem,
  OrderReceipt,
} from '../types/domain';
import { QuizEvaluationOutput } from '../utils/academyLogic';

export interface StudentDashboardSummaryResponse {
  liveSession: ClassSession;
  resumeSession: ClassSession;
  upcomingTasks: UpcomingTaskItem[];
  streakDays: number;
  attemptTrend?: {
    label: string;
    subLabel?: string;
    value: number;
    detailText?: string;
  }[];
}

export interface SessionChapterItem {
  sec: number;
  timeLabel: string;
  title: string;
  slideRange: string;
}

export interface SessionAiChatMessageItem {
  id: string;
  role: 'AI' | 'USER';
  content: string;
  citations?: { label: string; jumpSec: number; slideLabel: string }[];
}

export interface LiveSessionChatMessage {
  id: string;
  sessionId: string;
  senderName: string;
  senderRole: string;
  timeLabel: string;
  text: string;
  isStaff?: boolean;
}

export interface SessionDetailPayload {
  session: ClassSession;
  videoUrl: string;
  chapters?: SessionChapterItem[];
  aiChatHistory?: SessionAiChatMessageItem[];
  accessDenied?: boolean;
  isPlaceholder?: boolean;
  transcript: {
    sec: number;
    timeLabel: string;
    speaker: string;
    text: string;
    slidePage: number;
  }[];
  attachments: CohortMaterial[];
  quizSummary: {
    assessmentId: string;
    questionCount: number;
    passingScoreOutOf10: number;
    isCompleted: boolean;
    bestScorePercent?: number | null;
  };
  discussions: DiscussionThread[];
}

export const learningApi = {
  getStudentDashboard: () =>
    httpRequest<StudentDashboardSummaryResponse>('/me/dashboard', {
      method: 'GET',
    }),

  getDashboardSummary: () =>
    httpRequest<StudentDashboardSummaryResponse>('/me/dashboard', {
      method: 'GET',
    }),

  getMyEnrollments: () =>
    httpRequest<{ enrolledCohortIds: string[]; cohorts: Cohort[]; receipts: OrderReceipt[] }>(
      '/me/enrollments',
      { method: 'GET' }
    ),

  getCohortWorkspace: (cohortId: string) =>
    httpRequest<{
      cohort: Cohort;
      course: Course;
      sessions: ClassSession[];
      materials: CohortMaterial[];
      finalExamId?: string;
      finalExamPassed?: boolean;
      eligibleForFinalExam?: boolean;
      accessDenied?: boolean;
      isPlaceholder?: boolean;
    }>(`/cohorts/${encodeURIComponent(cohortId)}/workspace`, {
      method: 'GET',
    }),

  getSessionDetail: (cohortId: string, sessionId: string) =>
    httpRequest<SessionDetailPayload>(
      `/cohorts/${encodeURIComponent(cohortId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    ),

  updateVideoProgress: (sessionId: string, lastPositionSec: number) =>
    httpRequest<{
      sessionId: string;
      lastPositionSec: number;
      savedAt: string;
      updatedSession?: ClassSession;
    }>(`/sessions/${encodeURIComponent(sessionId)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ lastPositionSec }),
    }),

  submitSessionQuiz: (sessionId: string, answers: number[]) =>
    httpRequest<QuizEvaluationOutput>(
      `/sessions/${encodeURIComponent(sessionId)}/quiz-submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      }
    ),

  askSessionAiTutor: (sessionId: string, question: string, currentTimestampSec?: number) =>
    httpRequest<{
      answerMd: string;
      detectedTopic?: string;
      citations: { label: string; jumpSec: number; slideLabel: string }[];
    }>('/ai/tutor/ask', {
      method: 'POST',
      body: JSON.stringify({ sessionId, question, currentTimestampSec }),
    }),

  getSessionDiscussions: (sessionId: string) =>
    httpRequest<DiscussionThread[]>(
      `/sessions/${encodeURIComponent(sessionId)}/discussions`,
      { method: 'GET' }
    ),

  createSessionQuestion: (
    sessionId: string,
    contentMd: string,
    videoTimestampSec: number,
    title?: string
  ) =>
    httpRequest<{
      threadId: string;
      status: string;
      videoTimestampSec: number;
      thread?: DiscussionThread;
    }>(`/sessions/${encodeURIComponent(sessionId)}/discussions`, {
      method: 'POST',
      body: JSON.stringify({ title, contentMd, videoTimestampSec }),
    }),

  getLiveSessionChat: (sessionId: string) =>
    httpRequest<LiveSessionChatMessage[]>(
      `/sessions/${encodeURIComponent(sessionId)}/chat-messages`,
      { method: 'GET' }
    ),

  sendLiveSessionChat: (sessionId: string, text: string) =>
    httpRequest<LiveSessionChatMessage>(
      `/sessions/${encodeURIComponent(sessionId)}/chat-messages`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    ),

  verifyGuestSpeakerToken: (token: string, sessionId?: string) =>
    httpRequest<{
      valid: boolean;
      sessionId: string;
      sessionTitle: string;
      hostInstructorName: string;
      guestRoleLabel: string;
    }>('/live/guest/verify', {
      method: 'POST',
      body: JSON.stringify({ token, sessionId }),
    }),
};

export const studentLearningApi = learningApi;
