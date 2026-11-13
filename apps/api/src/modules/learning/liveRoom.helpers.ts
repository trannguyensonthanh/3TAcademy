import type { Response } from 'express';
import { env } from '../../config/env.js';

export interface PlayableVideoSource {
  videoUrl: string;
  playbackType: 'MP4' | 'HLS' | 'NONE';
  storageKey: string;
}

const SAMPLE_MP4_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
];

const SEED_PLACEHOLDER_KEY_REGEX = /^recordings\/(ai|py|swe)-k0\d\/s0\d\/master\.m3u8$/i;

export function resolvePlayableVideoSource(
  videoR2Key?: string | null,
  sessionOrder = 1,
  r2PublicDomain?: string
): PlayableVideoSource {
  const key = (videoR2Key || '').trim();
  if (!key) {
    return {
      videoUrl: '',
      playbackType: 'NONE',
      storageKey: '',
    };
  }

  if (/^(https?:\/\/|\/)/i.test(key)) {
    return {
      videoUrl: key,
      playbackType: key.toLowerCase().includes('.m3u8') ? 'HLS' : 'MP4',
      storageKey: key,
    };
  }

  const explicitDomainProvided = r2PublicDomain !== undefined;
  const configuredDomain = (
    explicitDomainProvided ? r2PublicDomain : env.R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || ''
  )
    .trim()
    .replace(/\/+$/, '');

  const isSeedPlaceholder = !explicitDomainProvided && SEED_PLACEHOLDER_KEY_REGEX.test(key);

  if (configuredDomain && !isSeedPlaceholder) {
    const resolved = `${configuredDomain}/${key.replace(/^\/+/, '')}`;
    return {
      videoUrl: resolved,
      playbackType: key.toLowerCase().includes('.m3u8') ? 'HLS' : 'MP4',
      storageKey: key,
    };
  }

  const fallbackIndex = Math.max(0, (sessionOrder - 1) % SAMPLE_MP4_VIDEOS.length);
  return {
    videoUrl: SAMPLE_MP4_VIDEOS[fallbackIndex] || SAMPLE_MP4_VIDEOS[0]!,
    playbackType: 'MP4',
    storageKey: key,
  };
}

export interface LiveHandRaiseEntry {
  accountId: string;
  fullName: string;
  role: string;
  raisedAt: string;
}

export interface LiveReactionEvent {
  id: string;
  senderName: string;
  label: string;
  createdAt: string;
}

export interface LiveRecordingState {
  isRecording: boolean;
  egressId?: string;
  objectKey?: string;
  publicUrl?: string;
  mode?: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
  startedAt?: string;
  stoppedAt?: string;
}

export interface LiveRoomRuntimeState {
  raisedHands: LiveHandRaiseEntry[];
  recentReactions: LiveReactionEvent[];
  questionVotes: Record<string, number>;
  mutedIdentities: string[];
  kickedIdentities: string[];
  recording: LiveRecordingState;
  hostBroadcast: {
    activeSlideLabel: string;
    liveTopicNote: string;
    updatedAt: string;
  };
}

interface InternalLiveRoomBucket {
  state: LiveRoomRuntimeState;
  clients: Set<Response>;
}

const roomBuckets = new Map<string, InternalLiveRoomBucket>();

function getOrCreateBucket(sessionId: string | number): InternalLiveRoomBucket {
  const key = String(sessionId);
  let bucket = roomBuckets.get(key);
  if (!bucket) {
    bucket = {
      state: {
        raisedHands: [],
        recentReactions: [],
        questionVotes: {},
        mutedIdentities: [],
        kickedIdentities: [],
        recording: {
          isRecording: false,
        },
        hostBroadcast: {
          activeSlideLabel: '',
          liveTopicNote: '',
          updatedAt: new Date().toISOString(),
        },
      },
      clients: new Set<Response>(),
    };
    roomBuckets.set(key, bucket);
  }
  return bucket;
}

export function getLiveRoomState(sessionId: string | number): LiveRoomRuntimeState {
  const bucket = getOrCreateBucket(sessionId);
  const cutoff = Date.now() - 20_000;
  bucket.state.recentReactions = bucket.state.recentReactions.filter(
    (r) => Date.parse(r.createdAt) >= cutoff
  );
  return {
    raisedHands: [...bucket.state.raisedHands],
    recentReactions: [...bucket.state.recentReactions],
    questionVotes: { ...bucket.state.questionVotes },
    mutedIdentities: [...bucket.state.mutedIdentities],
    kickedIdentities: [...bucket.state.kickedIdentities],
    recording: { ...bucket.state.recording },
    hostBroadcast: { ...bucket.state.hostBroadcast },
  };
}

export function broadcastLiveRoomEvent(
  sessionId: string | number,
  eventName: string,
  payload: unknown
): void {
  const bucket = getOrCreateBucket(sessionId);
  if (bucket.clients.size === 0) return;

  const serialized = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of Array.from(bucket.clients)) {
    try {
      client.write(serialized);
    } catch {
      bucket.clients.delete(client);
    }
  }
}

export function registerLiveRoomClient(
  sessionId: string | number,
  res: Response
): () => void {
  const bucket = getOrCreateBucket(sessionId);
  bucket.clients.add(res);
  return () => {
    bucket.clients.delete(res);
  };
}

export function setHandRaiseState(
  sessionId: string | number,
  entry: { accountId: string; fullName: string; role: string; raised: boolean }
): LiveHandRaiseEntry[] {
  const bucket = getOrCreateBucket(sessionId);
  bucket.state.raisedHands = bucket.state.raisedHands.filter(
    (h) => h.accountId !== entry.accountId
  );
  if (entry.raised) {
    bucket.state.raisedHands.push({
      accountId: entry.accountId,
      fullName: entry.fullName,
      role: entry.role,
      raisedAt: new Date().toISOString(),
    });
  }
  broadcastLiveRoomEvent(sessionId, 'hand_raise', {
    raisedHands: bucket.state.raisedHands,
  });
  return [...bucket.state.raisedHands];
}

export function addLiveReaction(
  sessionId: string | number,
  senderName: string,
  label: string
): LiveReactionEvent {
  const bucket = getOrCreateBucket(sessionId);
  const reaction: LiveReactionEvent = {
    id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderName,
    label,
    createdAt: new Date().toISOString(),
  };
  bucket.state.recentReactions = [...bucket.state.recentReactions.slice(-15), reaction];
  broadcastLiveRoomEvent(sessionId, 'reaction', reaction);
  return reaction;
}

export function upvoteLiveDiscussion(
  sessionId: string | number,
  threadId: string | number
): number {
  const bucket = getOrCreateBucket(sessionId);
  const key = String(threadId);
  const nextVotes = (bucket.state.questionVotes[key] ?? 0) + 1;
  bucket.state.questionVotes[key] = nextVotes;
  broadcastLiveRoomEvent(sessionId, 'qa_upvoted', {
    threadId: key,
    votes: nextVotes,
  });
  return nextVotes;
}

export function updateHostBroadcastState(
  sessionId: string | number,
  updates: { activeSlideLabel?: string; liveTopicNote?: string }
): LiveRoomRuntimeState['hostBroadcast'] {
  const bucket = getOrCreateBucket(sessionId);
  bucket.state.hostBroadcast = {
    activeSlideLabel: updates.activeSlideLabel ?? bucket.state.hostBroadcast.activeSlideLabel,
    liveTopicNote: updates.liveTopicNote ?? bucket.state.hostBroadcast.liveTopicNote,
    updatedAt: new Date().toISOString(),
  };
  broadcastLiveRoomEvent(sessionId, 'host_broadcast', bucket.state.hostBroadcast);
  return { ...bucket.state.hostBroadcast };
}

export function updateMutedParticipantsState(
  sessionId: string | number,
  params: {
    targetIdentities?: string[];
    muteAllStudents?: boolean;
    muted: boolean;
    mutedBy: string;
  }
): string[] {
  const bucket = getOrCreateBucket(sessionId);
  const set = new Set(bucket.state.mutedIdentities);
  if (params.muteAllStudents && params.muted) {
    set.add('ALL_STUDENTS');
  } else if (params.muteAllStudents && !params.muted) {
    set.clear();
  }

  for (const id of params.targetIdentities || []) {
    const clean = id.trim();
    if (!clean) continue;
    if (params.muted) {
      set.add(clean);
    } else {
      set.delete(clean);
    }
  }

  bucket.state.mutedIdentities = Array.from(set);
  broadcastLiveRoomEvent(sessionId, 'participant_muted', {
    mutedIdentities: bucket.state.mutedIdentities,
    targetIdentities: params.targetIdentities || [],
    muteAllStudents: Boolean(params.muteAllStudents),
    muted: params.muted,
    mutedBy: params.mutedBy,
    timestamp: new Date().toISOString(),
  });
  return [...bucket.state.mutedIdentities];
}

export function updateKickedParticipantsState(
  sessionId: string | number,
  params: {
    targetIdentities: string[];
    kicked: boolean;
    kickedBy: string;
  }
): string[] {
  const bucket = getOrCreateBucket(sessionId);
  const set = new Set(bucket.state.kickedIdentities);
  for (const id of params.targetIdentities) {
    const clean = id.trim();
    if (!clean) continue;
    if (params.kicked) {
      set.add(clean);
      const numericId = clean.replace(/^acc-/, '');
      bucket.state.raisedHands = bucket.state.raisedHands.filter(
        (h) => h.accountId !== clean && h.accountId !== numericId
      );
    } else {
      set.delete(clean);
    }
  }
  bucket.state.kickedIdentities = Array.from(set);
  broadcastLiveRoomEvent(sessionId, 'participant_kicked', {
    kickedIdentities: bucket.state.kickedIdentities,
    targetIdentities: params.targetIdentities,
    kicked: params.kicked,
    kickedBy: params.kickedBy,
    timestamp: new Date().toISOString(),
  });
  return [...bucket.state.kickedIdentities];
}

export function updateLiveRecordingState(
  sessionId: string | number,
  patch: Partial<LiveRecordingState>
): LiveRecordingState {
  const bucket = getOrCreateBucket(sessionId);
  bucket.state.recording = {
    ...bucket.state.recording,
    ...patch,
  };
  broadcastLiveRoomEvent(sessionId, 'recording_status', bucket.state.recording);
  return { ...bucket.state.recording };
}
