import http from 'node:http';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLiveReaction,
  broadcastLiveRoomEvent,
  getLiveRoomState,
  registerLiveRoomClient,
  resolvePlayableVideoSource,
  setHandRaiseState,
  updateHostBroadcastState,
  upvoteLiveDiscussion,
} from '../src/modules/learning/liveRoom.helpers.js';

const { state } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test_db';
  process.env.INTERNAL_API_KEY ??= 'test_internal_api_key_123456';
  process.env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_key_must_be_at_least_32_chars';
  process.env.JWT_REFRESH_SECRET ??= 'test_jwt_refresh_secret_key_must_be_at_least_32_chars';
  process.env.LIVEKIT_API_URL = 'wss://livekit.test.3t.edu.vn';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'secret_key_for_testing_only_123456';

  return {
    state: {
      enrolledForSessionCohort: true,
      sessionStatus: 'LIVE' as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY',
      videoR2Key: 'recordings/ai-k01/s05/master.m3u8',
      updatedSessions: [] as Array<Record<string, unknown>>,
    },
  };
});

vi.mock('../src/db/index.js', () => {
  const sampleSession = {
    id: 5,
    cohortId: 2,
    instructorId: 2,
    sessionOrder: 5,
    title: 'LLMOps & RAG Guardrails',
    descriptionMd: 'Mô tả buổi 5',
    activityTags: ['THEORY', 'LIVE_CODING'],
    scheduledStart: new Date('2026-04-02T12:30:00Z'),
    scheduledEnd: new Date('2026-04-02T14:30:00Z'),
    get status() {
      return state.sessionStatus;
    },
    get videoR2Key() {
      return state.videoR2Key;
    },
    videoProvider: 'R2_HLS_AES128',
    livekitRoomName: 'room-ai-k01-s05',
    durationSeconds: 5400,
    aiSummaryMd: 'Tóm tắt Ragas & Guardrails',
  };

  const sampleCohort = {
    id: 2,
    courseId: 1,
    instructorId: 2,
    code: 'AI-ENG-2026-K01',
    name: 'AI_01_Mùa Xuân Hè',
    status: 'ONGOING',
    curriculumVersion: 'v2',
    techStackNotes: 'FastAPI, pgvector',
    tuitionVnd: 12000000,
    enrolledCount: 28,
    enrollmentOpenAt: new Date('2026-01-01T00:00:00Z'),
    startDate: '2026-03-01',
    endDate: '2026-05-01',
    scheduleSlots: [],
  };

  const createSelectChain = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (resolve: (val: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  };

  let selectCall = 0;

  const dbMock = {
    select: () => {
      selectCall += 1;
      return {
        from: (table: unknown) => {
          let rows: unknown[] = [];
          if (table && typeof table === 'object') {
            const tableName =
              (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')] ??
              Object.getOwnPropertySymbols(table)
                .map((s) => (s.toString().includes('Name') ? (table as Record<symbol, unknown>)[s] : null))
                .find(Boolean);

            if (tableName === 'class_sessions') {
              rows = [sampleSession];
            } else if (tableName === 'cohorts') {
              rows = [sampleCohort];
            } else if (tableName === 'courses') {
              rows = [{ id: 1, slug: 'ai-eng', title: 'Kỹ Sư AI Thực Chiến' }];
            } else if (tableName === 'enrollments') {
              rows = state.enrolledForSessionCohort
                ? [
                    {
                      id: 99,
                      accountId: 4,
                      cohortId: 2,
                      status: 'ACTIVE',
                      fullName: 'Nguyễn Văn An',
                      role: 'STUDENT',
                    },
                  ]
                : [];
            } else if (tableName === 'user_profiles') {
              rows = [
                {
                  accountId: 4,
                  fullName: 'Nguyễn Văn An',
                  avatarUrl: null,
                  headline: 'AI Student',
                },
                {
                  accountId: 2,
                  fullName: 'TS. Lê Minh Khoa',
                  avatarUrl: null,
                  headline: 'Lead AI Architect',
                },
              ];
            } else if (tableName === 'accounts') {
              rows = [
                { id: 2, role: 'INSTRUCTOR', email: 'khoa@3t.edu.vn' },
                { id: 4, role: 'STUDENT', email: 'an@3t.edu.vn' },
              ];
            } else if (tableName === 'discussion_threads') {
              rows = [
                {
                  id: 77,
                  sessionId: 5,
                  title: 'Câu hỏi về Ragas Faithfulness',
                  videoTimestampSec: 120,
                  isResolved: false,
                  createdAt: new Date('2026-04-02T13:00:00Z'),
                  authorId: 4,
                  authorName: 'Nguyễn Văn An',
                },
              ];
            }
          }
          void selectCall;
          return createSelectChain(rows);
        },
      };
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (typeof values.status === 'string') {
              state.sessionStatus = values.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
            }
            if (typeof values.videoR2Key === 'string') {
              state.videoR2Key = values.videoR2Key;
            }
            state.updatedSessions.push(values);
            return [{ ...sampleSession, ...values }];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => [],
        onConflictDoUpdate: async () => [],
        returning: async () => [],
      }),
    }),
  };

  return {
    pool: { end: async () => undefined },
    db: dbMock,
  };
});

vi.mock('../src/config/redis.js', () => ({
  redis: { quit: async () => 'OK' },
}));

describe('liveRoom helpers', () => {
  it('resolves playable video sources accurately for full URLs, R2 domains, placeholder keys, and empty keys', () => {
    expect(resolvePlayableVideoSource('', 1)).toEqual({
      videoUrl: '',
      playbackType: 'NONE',
      storageKey: '',
    });

    expect(
      resolvePlayableVideoSource('https://cdn.example.com/videos/buoi-01.mp4', 1)
    ).toEqual({
      videoUrl: 'https://cdn.example.com/videos/buoi-01.mp4',
      playbackType: 'MP4',
      storageKey: 'https://cdn.example.com/videos/buoi-01.mp4',
    });

    expect(
      resolvePlayableVideoSource('recordings/ai-k01/s05/master.m3u8', 5, 'https://media.3t.edu.vn')
    ).toEqual({
      videoUrl: 'https://media.3t.edu.vn/recordings/ai-k01/s05/master.m3u8',
      playbackType: 'HLS',
      storageKey: 'recordings/ai-k01/s05/master.m3u8',
    });

    const fallback = resolvePlayableVideoSource('recordings/ai-k01/s05/master.m3u8', 5, '');
    expect(fallback.videoUrl.startsWith('https://')).toBe(true);
    expect(fallback.playbackType).toBe('MP4');
    expect(fallback.storageKey).toBe('recordings/ai-k01/s05/master.m3u8');
  });

  it('tracks raised hands, reactions, discussion upvotes, and broadcasts SSE events', () => {
    const writtenChunks: string[] = [];
    const mockRes = {
      write: (chunk: string) => {
        writtenChunks.push(chunk);
        return true;
      },
    } as unknown as import('express').Response;

    const unregister = registerLiveRoomClient(901, mockRes);

    setHandRaiseState(901, {
      accountId: '4',
      fullName: 'Nguyễn Văn An',
      role: 'STUDENT',
      raised: true,
    });
    addLiveReaction(901, 'Nguyễn Văn An', '❤️ Thả tim');
    const votes = upvoteLiveDiscussion(901, '77');
    updateHostBroadcastState(901, {
      activeSlideLabel: 'Slide 14',
      liveTopicNote: 'Ragas Context Recall',
    });
    broadcastLiveRoomEvent(901, 'custom_ping', { ok: true });

    const roomState = getLiveRoomState(901);
    expect(roomState.raisedHands).toHaveLength(1);
    expect(roomState.raisedHands[0]?.fullName).toBe('Nguyễn Văn An');
    expect(roomState.questionVotes['77']).toBe(votes);
    expect(roomState.hostBroadcast.activeSlideLabel).toBe('Slide 14');
    expect(writtenChunks.some((c) => c.includes('event: hand_raise'))).toBe(true);
    expect(writtenChunks.some((c) => c.includes('event: reaction'))).toBe(true);
    expect(writtenChunks.some((c) => c.includes('event: qa_upvoted'))).toBe(true);
    expect(writtenChunks.some((c) => c.includes('event: host_broadcast'))).toBe(true);

    unregister();
  });
});

describe('live classroom & video HTTP routes', () => {
  let server: http.Server;
  let baseUrl: string;
  let jwtSecret = '';

  const signToken = (payload: { id: number; email: string; role: string }) =>
    jwt.sign(
      { id: payload.id, sub: String(payload.id), email: payload.email, role: payload.role },
      jwtSecret,
      { expiresIn: '1h' }
    );

  beforeAll(async () => {
    const { env } = await import('../src/config/env.js');
    jwtSecret = env.JWT_ACCESS_SECRET;
    const { app } = await import('../src/app.js');
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    state.enrolledForSessionCohort = true;
    state.sessionStatus = 'LIVE';
    state.videoR2Key = 'recordings/ai-k01/s05/master.m3u8';
    state.updatedSessions = [];
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('allows enrolled student into GET /api/v1/live/sessions/:sessionId with LiveKit token & real cohort data', async () => {
    const studentToken = signToken({ id: 4, email: 'an@3t.edu.vn', role: 'STUDENT' });

    const res = await fetch(`${baseUrl}/api/v1/live/sessions/5`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = (await res.json()) as {
      session: { id: string; status: string };
      cohort: { code: string; name: string };
      livekit: { enabled: boolean; roomName: string; token: string };
      video: { videoUrl: string };
    };

    expect(res.status).toBe(200);
    expect(body.session.id).toBe('5');
    expect(body.cohort.code).toBe('AI-ENG-2026-K01');
    expect(body.cohort.name).toBe('AI_01_Mùa Xuân Hè');
    expect(body.livekit.enabled).toBe(true);
    expect(body.livekit.token.length).toBeGreaterThan(20);
    expect(body.video.videoUrl.startsWith('https://')).toBe(true);
  });

  it('returns 403 NOT_ENROLLED_IN_COHORT with actual session cohort info when student is not enrolled', async () => {
    state.enrolledForSessionCohort = false;
    const studentToken = signToken({ id: 99, email: 'other@3t.edu.vn', role: 'STUDENT' });

    const res = await fetch(`${baseUrl}/api/v1/live/sessions/5`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = (await res.json()) as {
      code: string;
      cohort: { code: string; name: string };
    };

    expect(res.status).toBe(403);
    expect(body.code).toBe('NOT_ENROLLED_IN_COHORT');
    expect(body.cohort.code).toBe('AI-ENG-2026-K01');
    expect(body.cohort.name).toBe('AI_01_Mùa Xuân Hè');
  });

  it('handles hand-raise, reaction, and Q&A upvote endpoints for authenticated users', async () => {
    const studentToken = signToken({ id: 4, email: 'an@3t.edu.vn', role: 'STUDENT' });

    const handRes = await fetch(`${baseUrl}/api/v1/live/sessions/5/hand-raise`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raised: true }),
    });
    const handBody = (await handRes.json()) as {
      raised: boolean;
      raisedHands: Array<{ fullName: string }>;
    };
    expect(handRes.status).toBe(200);
    expect(handBody.raised).toBe(true);
    expect(handBody.raisedHands[0]?.fullName).toBe('Nguyễn Văn An');

    const reactRes = await fetch(`${baseUrl}/api/v1/live/sessions/5/reactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: '👏 Vỗ tay' }),
    });
    expect(reactRes.status).toBe(201);

    const upvoteRes = await fetch(`${baseUrl}/api/v1/live/discussions/77/upvote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const upvoteBody = (await upvoteRes.json()) as { threadId: string; votes: number };
    expect(upvoteRes.status).toBe(200);
    expect(upvoteBody.threadId).toBe('77');
    expect(upvoteBody.votes).toBeGreaterThanOrEqual(1);
  });

  it('lets instructor update session live status and replay video URL via PUT /api/v1/teach/sessions/:sessionId/live-status', async () => {
    const instructorToken = signToken({
      id: 2,
      email: 'khoa@3t.edu.vn',
      role: 'INSTRUCTOR',
    });

    const res = await fetch(`${baseUrl}/api/v1/teach/sessions/5/live-status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${instructorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'REPLAY_READY',
        videoR2Key: 'https://cdn.3t.edu.vn/replays/ai-s05.mp4',
        activeSlideLabel: 'Slide Tổng Kết',
        liveTopicNote: 'Đã lưu bản ghi',
      }),
    });
    const body = (await res.json()) as {
      status: string;
      videoUrl: string;
      hostBroadcast: { activeSlideLabel: string; liveTopicNote: string };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe('REPLAY_READY');
    expect(body.videoUrl).toBe('https://cdn.3t.edu.vn/replays/ai-s05.mp4');
    expect(body.hostBroadcast.activeSlideLabel).toBe('Slide Tổng Kết');
  });

  it('lets instructor mute a specific student or all students and start/stop R2 recording', async () => {
    const instructorToken = signToken({
      id: 2,
      email: 'khoa@3t.edu.vn',
      role: 'INSTRUCTOR',
    });

    const muteRes = await fetch(`${baseUrl}/api/v1/teach/sessions/5/mute-participant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instructorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetIdentity: 'acc-4',
        muteAllStudents: true,
        muted: true,
      }),
    });
    const muteBody = (await muteRes.json()) as {
      muted: boolean;
      muteAllStudents: boolean;
      mutedIdentities: string[];
    };
    expect(muteRes.status).toBe(200);
    expect(muteBody.muted).toBe(true);
    expect(muteBody.muteAllStudents).toBe(true);
    expect(muteBody.mutedIdentities).toContain('ALL_STUDENTS');
    expect(muteBody.mutedIdentities).toContain('acc-4');

    const startRecRes = await fetch(`${baseUrl}/api/v1/teach/sessions/5/recording/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instructorToken}`,
      },
    });
    const startRecBody = (await startRecRes.json()) as {
      recording: { isRecording: boolean; publicUrl: string };
      presignedUploadUrl: string;
    };
    expect(startRecRes.status).toBe(200);
    expect(startRecBody.recording.isRecording).toBe(true);
    expect(startRecBody.recording.publicUrl).toContain('.r2.dev/recordings/session-5/');
    expect(startRecBody.presignedUploadUrl).toContain('r2.cloudflarestorage.com');

    const stopRecRes = await fetch(`${baseUrl}/api/v1/teach/sessions/5/recording/stop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instructorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ markReplayReady: true }),
    });
    const stopRecBody = (await stopRecRes.json()) as {
      status: string;
      recording: { isRecording: boolean };
      r2PublicUrl: string;
    };
    expect(stopRecRes.status).toBe(200);
    expect(stopRecBody.status).toBe('REPLAY_READY');
    expect(stopRecBody.recording.isRecording).toBe(false);
    expect(stopRecBody.r2PublicUrl).toContain('.r2.dev/recordings/session-5/');

    // Kick a disruptive student (id=4) and verify they cannot re-join
    const kickRes = await fetch(`${baseUrl}/api/v1/teach/sessions/5/kick-participant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instructorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetIdentity: 'acc-4',
        kicked: true,
      }),
    });
    const kickBody = (await kickRes.json()) as {
      kicked: boolean;
      kickedIdentities: string[];
    };
    expect(kickRes.status).toBe(200);
    expect(kickBody.kicked).toBe(true);
    expect(kickBody.kickedIdentities).toContain('acc-4');

    const studentToken = signToken({
      id: 4,
      email: 'an.student@3t.edu.vn',
      role: 'STUDENT',
    });
    const kickedJoinRes = await fetch(`${baseUrl}/api/v1/live/sessions/5`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });
    const kickedJoinBody = (await kickedJoinRes.json()) as { code: string };
    expect(kickedJoinRes.status).toBe(403);
    expect(kickedJoinBody.code).toBe('KICKED_FROM_SESSION');
  });
});
