import { API_CONFIG, getAuthAccessToken, httpRequest } from './apiClient';
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
  sender?: string;
  senderRole: string;
  roleLabel?: string;
  timeLabel: string;
  time?: string;
  text: string;
  isStaff?: boolean;
}

export interface LiveParticipantItem {
  accountId: string;
  fullName: string;
  role: string;
  roleLabel: string;
  avatarUrl?: string;
  isHost: boolean;
}

export interface LiveHandRaiseItem {
  accountId: string;
  fullName: string;
  role: string;
  raisedAt: string;
}

export interface LiveReactionPayload {
  id: string;
  senderName: string;
  label: string;
  createdAt: string;
}

export interface LiveRoomRuntimeState {
  raisedHands: LiveHandRaiseItem[];
  recentReactions: LiveReactionPayload[];
  questionVotes: Record<string, number>;
  hostBroadcast: {
    activeSlideLabel: string;
    liveTopicNote: string;
    updatedAt: string;
  };
}

export interface LiveSessionRoomPayload {
  session: ClassSession;
  cohort: Cohort | null;
  participants: LiveParticipantItem[];
  participantCount: number;
  isHost: boolean;
  video: {
    videoUrl: string;
    playbackType: 'MP4' | 'HLS' | 'NONE';
    storageKey: string;
  };
  livekit: {
    roomName: string;
    token: string;
    serverUrl: string;
    enabled: boolean;
  };
  roomState: LiveRoomRuntimeState;
  chatMessages: LiveSessionChatMessage[];
  discussions: (DiscussionThread & { votes?: number })[];
  transcript: {
    id?: string;
    sec: number;
    timeLabel: string;
    speaker: string;
    text: string;
    slidePage: number;
  }[];
  attachments: CohortMaterial[];
}

export interface SessionDetailPayload {
  session: ClassSession;
  videoUrl: string;
  playbackType?: 'MP4' | 'HLS' | 'NONE';
  storageKey?: string;
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

  updateVideoProgress: (sessionId: string, lastPositionSec: number, completed?: boolean) =>
    httpRequest<{
      sessionId: string;
      lastPositionSec: number;
      isCompleted?: boolean;
      savedAt: string;
      updatedSession?: ClassSession;
    }>(`/sessions/${encodeURIComponent(sessionId)}/progress`, {
      method: 'PUT',
      body: JSON.stringify(
        completed !== undefined ? { lastPositionSec, completed } : { lastPositionSec }
      ),
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

  getLiveSessionRoom: (sessionId: string) =>
    httpRequest<LiveSessionRoomPayload>(
      `/live/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    ),

  getLiveEventsUrl: (sessionId: string): string => {
    const token = getAuthAccessToken();
    const base = `${API_CONFIG.BASE_URL}/live/sessions/${encodeURIComponent(sessionId)}/events`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  },

  setLiveHandRaise: (sessionId: string, raised: boolean) =>
    httpRequest<{ raised: boolean; raisedHands: LiveHandRaiseItem[] }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/hand-raise`,
      {
        method: 'POST',
        body: JSON.stringify({ raised }),
      }
    ),

  sendLiveReaction: (sessionId: string, label: string) =>
    httpRequest<{ reaction: LiveReactionPayload }>(
      `/live/sessions/${encodeURIComponent(sessionId)}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ label }),
      }
    ),

  upvoteLiveDiscussion: (threadId: string) =>
    httpRequest<{ threadId: string; votes: number }>(
      `/live/discussions/${encodeURIComponent(threadId)}/upvote`,
      {
        method: 'POST',
      }
    ),

  verifyGuestSpeakerToken: (
    token: string,
    sessionId?: string,
    guestDisplayName?: string,
    guestRoleHeadline?: string
  ) =>
    httpRequest<{
      valid: boolean;
      sessionId: string;
      cohortId?: string;
      cohortName?: string;
      cohortCode?: string;
      sessionTitle: string;
      hostInstructorName: string;
      guestRoleLabel: string;
      livekit?: {
        roomName: string;
        token: string;
        serverUrl: string;
        enabled: boolean;
      };
    }>('/live/guest/verify', {
      method: 'POST',
      body: JSON.stringify({ token, sessionId, guestDisplayName, guestRoleHeadline }),
    }),
};

export const studentLearningApi = learningApi;
