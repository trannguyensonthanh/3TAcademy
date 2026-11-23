/**
 * ============================================================================
 * TỆP: apps/api/src/modules/learning/liveRoom.helpers.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Bộ quản lý trạng thái phòng học trực tuyến trong bộ nhớ
 *     (In-Memory Real-time Room State & SSE Event Broker) kết hợp bộ phân giải nguồn phát
 *     video bài giảng Cloudflare R2 (`resolvePlayableVideoSource`).
 *   - Đảm nhiệm:
 *     1. Quản lý danh sách client SSE (`EventSource`) kết nối vào từng phòng `sessionId`,
 *        theo dõi danh sách người tham gia online (`activeParticipants`) kèm vùng đệm 45 giây
 *        cho người vừa mở phòng đang chờ bắt tay SSE.
 *     2. Phát sự kiện thời gian thực (`broadcastLiveRoomEvent`) cho toàn bộ thành viên trong lớp:
 *        giơ tay (`hand_raise`), thả cảm xúc (`reaction`), bình chọn câu hỏi Q&A (`qa_upvoted`),
 *        tắt mic/đuổi học viên (`participant_muted`, `participant_kicked`), đồng bộ slide/media
 *        của Giảng viên (`host_broadcast`, `host_media_sync`), chuyển tiếp tín hiệu WebRTC
 *        (`webrtc_signal`, `live_audio_chunk`) và trạng thái ghi hình R2 (`recording_status`).
 *     3. Phân giải `videoR2Key` lưu trong PostgreSQL thành URL phát MP4/HLS sẵn sàng cho Frontend.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Được gọi từ:
 *     + `apps/api/src/modules/learning/learning.routes.ts` (vào phòng Live, mở SSE stream, giơ tay,
 *       reaction, upvote, WebRTC signaling, đồng bộ media, webhook LiveKit)
 *     + `apps/api/src/modules/teach/teach.routes.ts` (đổi trạng thái LIVE/REPLAY_READY, mute/kick,
 *       ghi hình, cập nhật slide broadcast)
 *   - Không truy vấn DB trực tiếp, không gọi `apps/ai-service`.
 * ============================================================================
 */
import type { Response } from 'express';
import { env } from '../../config/env.js';

export interface LiveHandRaiseItem {
  accountId: string;
  fullName: string;
  role: string;
  raisedAt: string;
}

export interface LiveReactionItem {
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

export interface LiveParticipantPresence {
  accountId: string;
  fullName: string;
  role: string;
  roleLabel: string;
  avatarUrl?: string;
  isHost: boolean;
  joinedAt: string;
}

export interface LiveHostMediaState {
  camOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  mirrorCam?: boolean;
  cameraFrameDataUrl?: string;
  screenFrameDataUrl?: string;
  hostAccountId?: string;
  hostName?: string;
  updatedAt: string;
}

export interface LiveRoomRuntimeState {
  raisedHands: LiveHandRaiseItem[];
  recentReactions: LiveReactionItem[];
  questionVotes: Record<string, number>;
  mutedIdentities: string[];
  kickedIdentities: string[];
  activeParticipants: LiveParticipantPresence[];
  recording: LiveRecordingState;
  hostBroadcast: {
    activeSlideLabel: string;
    liveTopicNote: string;
    updatedAt: string;
  };
  hostMedia: LiveHostMediaState;
}

interface LiveRoomBucket {
  state: LiveRoomRuntimeState;
  clients: Set<Response>;
  clientParticipants: Map<Response, LiveParticipantPresence>;
  recentJoinedMap: Map<string, { participant: LiveParticipantPresence; expiresAt: number }>;
}

const roomBuckets = new Map<number, LiveRoomBucket>();

/** Lấy hoặc khởi tạo bucket trạng thái in-memory (clients SSE, participants, hostMedia, recording) cho một `sessionId`. */
function getOrCreateBucket(sessionId: number): LiveRoomBucket {
  let bucket = roomBuckets.get(sessionId);
  if (!bucket) {
    bucket = {
      state: {
        raisedHands: [],
        recentReactions: [],
        questionVotes: {},
        mutedIdentities: [],
        kickedIdentities: [],
        activeParticipants: [],
        recording: {
          isRecording: false,
        },
        hostBroadcast: {
          activeSlideLabel: 'Đang trình chiếu trực tiếp',
          liveTopicNote: 'Đang thảo luận trực tiếp cùng Giảng viên',
          updatedAt: new Date().toISOString(),
        },
        hostMedia: {
          camOn: false,
          micOn: false,
          screenSharing: false,
          mirrorCam: true,
          updatedAt: new Date().toISOString(),
        },
      },
      clients: new Set<Response>(),
      clientParticipants: new Map<Response, LiveParticipantPresence>(),
      recentJoinedMap: new Map(),
    };
    roomBuckets.set(sessionId, bucket);
  }
  return bucket;
}

/**
 * Tính lại danh sách thành viên đang hiện diện trong phòng học (`activeParticipants`).
 * - Hợp nhất người đang giữ kết nối SSE sống + người vừa vào phòng trong 45s gần nhất (`recentJoinedMap`),
 *   loại bỏ người bị đuổi (`kickedIdentities`) và luôn sắp Giảng viên/Host lên đầu danh sách.
 */
function recomputeActiveParticipants(bucket: LiveRoomBucket): LiveParticipantPresence[] {
  const now = Date.now();
  const byAccountId = new Map<string, LiveParticipantPresence>();

  // 1. Users with an active SSE connection right now
  for (const p of bucket.clientParticipants.values()) {
    const key = String(p.accountId);
    if (
      !bucket.state.kickedIdentities.includes(key) &&
      !bucket.state.kickedIdentities.includes(`acc-${key}`)
    ) {
      byAccountId.set(key, p);
    }
  }

  // 2. Users who just fetched GET /live/sessions/:sessionId within the last 45s (while SSE is opening)
  for (const [key, entry] of bucket.recentJoinedMap.entries()) {
    if (entry.expiresAt <= now) {
      bucket.recentJoinedMap.delete(key);
      continue;
    }
    if (
      !byAccountId.has(key) &&
      !bucket.state.kickedIdentities.includes(key) &&
      !bucket.state.kickedIdentities.includes(`acc-${key}`)
    ) {
      byAccountId.set(key, entry.participant);
    }
  }

  // Sort: Host/Instructor first, then by joinedAt
  const list = Array.from(byAccountId.values()).sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return a.joinedAt.localeCompare(b.joinedAt);
  });

  bucket.state.activeParticipants = list;
  return list;
}

/** Lấy ảnh chụp trạng thái thời gian thực hiện hành (`LiveRoomRuntimeState`) của phòng học `sessionId`. */
export function getLiveRoomState(sessionId: number): LiveRoomRuntimeState {
  const bucket = getOrCreateBucket(sessionId);
  recomputeActiveParticipants(bucket);
  return bucket.state;
}

/** Đánh dấu người dùng vừa tải phòng Live (giữ hiện diện 45s chờ SSE kết nối) và broadcast `participants_updated`. */
export function markParticipantJoinedRoom(
  sessionId: number,
  participant: Omit<LiveParticipantPresence, 'joinedAt'> & { joinedAt?: string }
): LiveParticipantPresence[] {
  const bucket = getOrCreateBucket(sessionId);
  const key = String(participant.accountId);
  const existing = bucket.state.activeParticipants.find((p) => String(p.accountId) === key);
  const presence: LiveParticipantPresence = {
    ...participant,
    accountId: key,
    joinedAt: existing?.joinedAt || participant.joinedAt || new Date().toISOString(),
  };

  bucket.recentJoinedMap.set(key, {
    participant: presence,
    expiresAt: Date.now() + 45_000,
  });

  const updated = recomputeActiveParticipants(bucket);
  broadcastLiveRoomEvent(sessionId, 'participants_updated', {
    participants: updated,
    participantCount: updated.length,
  });
  return updated;
}

/** Đăng ký kết nối SSE (`res`) của một học viên/giảng viên vào phòng và trả hàm cleanup khi ngắt kết nối. */
export function registerLiveRoomClient(
  sessionId: number,
  res: Response,
  participant?: Omit<LiveParticipantPresence, 'joinedAt'> & { joinedAt?: string }
): () => void {
  const bucket = getOrCreateBucket(sessionId);
  bucket.clients.add(res);

  if (participant && participant.accountId) {
    const key = String(participant.accountId);
    const existing = bucket.state.activeParticipants.find((p) => String(p.accountId) === key);
    const presence: LiveParticipantPresence = {
      ...participant,
      accountId: key,
      joinedAt: existing?.joinedAt || participant.joinedAt || new Date().toISOString(),
    };
    bucket.clientParticipants.set(res, presence);
    bucket.recentJoinedMap.delete(key);
    const updated = recomputeActiveParticipants(bucket);
    broadcastLiveRoomEvent(sessionId, 'participants_updated', {
      participants: updated,
      participantCount: updated.length,
    });
  }

  return () => {
    unregisterLiveRoomClient(sessionId, res);
  };
}

/**
 * Gỡ kết nối SSE khi người dùng rời phòng; tự hạ tay nếu đang giơ tay, và tự tắt trạng thái `hostMedia`
 * nếu Giảng viên cuối cùng rời phòng để tránh treo khung hình cũ trên màn hình học viên.
 */
export function unregisterLiveRoomClient(sessionId: number, res: Response): void {
  const bucket = roomBuckets.get(sessionId);
  if (!bucket) return;

  const leavingParticipant = bucket.clientParticipants.get(res);
  bucket.clients.delete(res);
  bucket.clientParticipants.delete(res);

  if (leavingParticipant) {
    const key = String(leavingParticipant.accountId);
    bucket.recentJoinedMap.delete(key);
    const updated = recomputeActiveParticipants(bucket);
    const stillPresent = updated.some((p) => String(p.accountId) === key);
    if (!stillPresent) {
      bucket.state.raisedHands = bucket.state.raisedHands.filter(
        (h) => String(h.accountId) !== key
      );
      if (leavingParticipant.isHost && !updated.some((p) => p.isHost)) {
        bucket.state.hostMedia = {
          camOn: false,
          micOn: false,
          screenSharing: false,
          mirrorCam: true,
          updatedAt: new Date().toISOString(),
        };
        broadcastLiveRoomEvent(sessionId, 'host_media_sync', bucket.state.hostMedia);
      }
    }
    broadcastLiveRoomEvent(sessionId, 'participants_updated', {
      participants: updated,
      participantCount: updated.length,
    });
    broadcastLiveRoomEvent(sessionId, 'room_state', bucket.state);
  }
}

/** Phát sự kiện Server-Sent Events (`event: <name>\ndata: <json>\n\n`) tới toàn bộ client đang kết nối vào phòng `sessionId`. */
export function broadcastLiveRoomEvent(
  sessionId: number,
  event: string,
  payload: unknown
): void {
  const bucket = roomBuckets.get(sessionId);
  if (!bucket || bucket.clients.size === 0) return;
  const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of bucket.clients) {
    try {
      client.write(serialized);
    } catch {
      bucket.clients.delete(client);
      bucket.clientParticipants.delete(client);
    }
  }
}

/** Bật hoặc hạ trạng thái giơ tay phát biểu của một tài khoản và phát sự kiện `hand_raise` tới cả lớp. */
export function setHandRaiseState(
  sessionId: number,
  params: { accountId: string; fullName: string; role: string; raised: boolean }
): LiveHandRaiseItem[] {
  const bucket = getOrCreateBucket(sessionId);
  const filtered = bucket.state.raisedHands.filter(
    (h) => h.accountId !== params.accountId
  );
  if (params.raised) {
    filtered.push({
      accountId: params.accountId,
      fullName: params.fullName,
      role: params.role,
      raisedAt: new Date().toISOString(),
    });
  }
  bucket.state.raisedHands = filtered;
  broadcastLiveRoomEvent(sessionId, 'hand_raise', {
    raisedHands: bucket.state.raisedHands,
  });
  return bucket.state.raisedHands;
}

export function toggleHandRaise(
  sessionId: number,
  item: Omit<LiveHandRaiseItem, 'raisedAt'>,
  raised: boolean
): LiveHandRaiseItem[] {
  return setHandRaiseState(sessionId, { ...item, raised });
}

/** Lưu biểu cảm mới nhất (giữ tối đa 20 biểu cảm gần nhất) và phát sự kiện `reaction` qua SSE. */
export function addLiveReaction(
  sessionId: number,
  senderName: string,
  label: string
): LiveReactionItem {
  const bucket = getOrCreateBucket(sessionId);
  const reaction: LiveReactionItem = {
    id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderName,
    label,
    createdAt: new Date().toISOString(),
  };
  bucket.state.recentReactions = [
    ...bucket.state.recentReactions.slice(-19),
    reaction,
  ];
  broadcastLiveRoomEvent(sessionId, 'reaction', reaction);
  return reaction;
}

export const pushLiveReaction = addLiveReaction;

/** Tăng lượt bình chọn (+1) cho một câu hỏi Q&A trong phòng học và broadcast `qa_upvoted`. */
export function upvoteLiveDiscussion(
  sessionId: number,
  threadId: number | string
): number {
  const bucket = getOrCreateBucket(sessionId);
  const key = String(threadId);
  const nextVotes = (bucket.state.questionVotes[key] ?? 1) + 1;
  bucket.state.questionVotes[key] = nextVotes;
  broadcastLiveRoomEvent(sessionId, 'qa_upvoted', {
    threadId: key,
    votes: nextVotes,
  });
  return nextVotes;
}

export const incrementQuestionVote = upvoteLiveDiscussion;

/** Cập nhật tiêu đề slide đang trình chiếu và ghi chú chủ đề của Giảng viên, phát sự kiện `host_broadcast`. */
export function updateHostBroadcastState(
  sessionId: number,
  patch: { activeSlideLabel?: string; liveTopicNote?: string }
): LiveRoomRuntimeState['hostBroadcast'] {
  const bucket = getOrCreateBucket(sessionId);
  bucket.state.hostBroadcast = {
    activeSlideLabel:
      patch.activeSlideLabel?.trim() || bucket.state.hostBroadcast.activeSlideLabel,
    liveTopicNote:
      patch.liveTopicNote?.trim() || bucket.state.hostBroadcast.liveTopicNote,
    updatedAt: new Date().toISOString(),
  };
  broadcastLiveRoomEvent(sessionId, 'host_broadcast', bucket.state.hostBroadcast);
  return bucket.state.hostBroadcast;
}

/** Đồng bộ trạng thái Camera/Micro/Chia sẻ màn hình (và khung hình dự phòng) của Giảng viên tới học viên qua `host_media_sync`. */
export function updateHostMediaState(
  sessionId: number,
  patch: Partial<LiveHostMediaState>
): LiveHostMediaState {
  const bucket = getOrCreateBucket(sessionId);
  const prev = bucket.state.hostMedia;
  const nextCamOn = patch.camOn !== undefined ? patch.camOn : prev.camOn;
  const nextScreenSharing =
    patch.screenSharing !== undefined ? patch.screenSharing : prev.screenSharing;
  const nextMicOn = patch.micOn !== undefined ? patch.micOn : prev.micOn;

  bucket.state.hostMedia = {
    ...prev,
    ...patch,
    camOn: nextCamOn,
    micOn: nextMicOn,
    screenSharing: nextScreenSharing,
    cameraFrameDataUrl: nextCamOn
      ? (patch.cameraFrameDataUrl !== undefined
          ? patch.cameraFrameDataUrl
          : prev.cameraFrameDataUrl)
      : undefined,
    screenFrameDataUrl: nextScreenSharing
      ? (patch.screenFrameDataUrl !== undefined
          ? patch.screenFrameDataUrl
          : prev.screenFrameDataUrl)
      : undefined,
    updatedAt: new Date().toISOString(),
  };
  broadcastLiveRoomEvent(sessionId, 'host_media_sync', bucket.state.hostMedia);
  return bucket.state.hostMedia;
}

/** Chuyển tiếp bản tin tín hiệu WebRTC Peer-to-Peer (`offer`, `answer`, `ice-candidate`) giữa Giảng viên và Học viên qua SSE. */
export function relayWebRtcSignal(
  sessionId: number,
  signal: {
    fromAccountId: string;
    fromName: string;
    isHost: boolean;
    targetAccountId?: string;
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'request-offer' | 'media-stopped';
    sdp?: unknown;
    candidate?: unknown;
  }
): void {
  broadcastLiveRoomEvent(sessionId, 'webrtc_signal', {
    ...signal,
    createdAt: new Date().toISOString(),
  });
}

/** Chuyển tiếp gói âm thanh dự phòng dạng Base64 (`live_audio_chunk`) khi WebRTC/LiveKit không khả dụng. */
export function relayLiveAudioChunk(
  sessionId: number,
  chunk: {
    fromAccountId: string;
    fromName: string;
    isHost: boolean;
    mimeType: string;
    audioBase64: string;
    seq: number;
  }
): void {
  broadcastLiveRoomEvent(sessionId, 'live_audio_chunk', {
    ...chunk,
    createdAt: new Date().toISOString(),
  });
}

/** Cập nhật danh sách người bị tắt micro (hoặc cờ `ALL_STUDENTS`) trong trạng thái phòng và broadcast `participant_muted`. */
export function updateMutedParticipantsState(
  sessionId: number,
  params: {
    targetIdentities: string[];
    muted: boolean;
    muteAllStudents?: boolean;
    mutedBy?: string;
  }
): string[] {
  const bucket = getOrCreateBucket(sessionId);
  const current = new Set(bucket.state.mutedIdentities);
  if (params.muted) {
    if (params.muteAllStudents) {
      current.add('ALL_STUDENTS');
    }
    for (const id of params.targetIdentities) {
      current.add(id);
    }
  } else {
    if (params.muteAllStudents) {
      current.delete('ALL_STUDENTS');
    }
    for (const id of params.targetIdentities) {
      current.delete(id);
    }
  }
  bucket.state.mutedIdentities = Array.from(current);
  broadcastLiveRoomEvent(sessionId, 'participant_muted', {
    mutedIdentities: bucket.state.mutedIdentities,
    targetIdentities: params.targetIdentities,
    muteAllStudents: Boolean(params.muteAllStudents),
    muted: params.muted,
    mutedBy: params.mutedBy,
    updatedAt: new Date().toISOString(),
  });
  return bucket.state.mutedIdentities;
}

/** Cập nhật danh sách người bị mời khỏi phòng (`kickedIdentities`), xóa họ khỏi `activeParticipants` và broadcast `participant_kicked`. */
export function updateKickedParticipantsState(
  sessionId: number,
  params: {
    targetIdentity?: string;
    targetIdentities?: string[];
    kicked: boolean;
    kickedBy?: string;
  }
): string[] {
  const bucket = getOrCreateBucket(sessionId);
  const current = new Set(bucket.state.kickedIdentities);
  const rawTargets = [
    ...(params.targetIdentities || []),
    ...(params.targetIdentity ? [params.targetIdentity] : []),
  ];
  const expandedTargets: string[] = [];

  for (const raw of rawTargets) {
    const normalizedId = raw.replace(/^acc-/, '');
    const withPrefix = `acc-${normalizedId}`;
    expandedTargets.push(normalizedId, withPrefix);

    if (params.kicked) {
      current.add(normalizedId);
      current.add(withPrefix);
      bucket.state.raisedHands = bucket.state.raisedHands.filter(
        (h) => h.accountId !== normalizedId && `acc-${h.accountId}` !== withPrefix
      );
      bucket.recentJoinedMap.delete(normalizedId);
      for (const [client, p] of bucket.clientParticipants.entries()) {
        if (String(p.accountId) === normalizedId || `acc-${p.accountId}` === withPrefix) {
          bucket.clientParticipants.delete(client);
        }
      }
    } else {
      current.delete(normalizedId);
      current.delete(withPrefix);
    }
  }

  bucket.state.kickedIdentities = Array.from(current);
  const updatedParticipants = recomputeActiveParticipants(bucket);

  broadcastLiveRoomEvent(sessionId, 'participant_kicked', {
    kickedIdentities: bucket.state.kickedIdentities,
    targetIdentities: expandedTargets,
    kicked: params.kicked,
    kickedBy: params.kickedBy,
    updatedAt: new Date().toISOString(),
  });
  broadcastLiveRoomEvent(sessionId, 'participants_updated', {
    participants: updatedParticipants,
    participantCount: updatedParticipants.length,
  });
  return bucket.state.kickedIdentities;
}

/** Cập nhật trạng thái ghi hình phòng livestream (`isRecording`, `objectKey`, `publicUrl`) và broadcast `recording_status`. */
export function updateLiveRecordingState(
  sessionId: number,
  recording: LiveRecordingState
): LiveRecordingState {
  const bucket = getOrCreateBucket(sessionId);
  bucket.state.recording = {
    ...bucket.state.recording,
    ...recording,
  };
  broadcastLiveRoomEvent(sessionId, 'recording_status', bucket.state.recording);
  return bucket.state.recording;
}

// High-availability, fast-loading MP4 video streams with CORS & byte-range support
const RELIABLE_MP4_LECTURE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://media.w3.org/2010/05/bunny/trailer.mp4',
  'https://media.w3.org/2010/05/video/movie_300.mp4',
];

// Matches seed placeholder keys that were never uploaded as real objects to R2
const SEED_PLACEHOLDER_KEY_REGEX =
  /^(recordings\/(ai|py|swe|fs|de|do|sec|cloud|data|ml)-|.*\/master\.m3u8$)/i;

/**
 * Resolves a session's `videoR2Key` into a playable URL and stream type (HLS or MP4).
 */
/**
 * Phân giải cột `videoR2Key` trong DB thành nguồn phát video hợp lệ (`MP4` / `HLS` / `NONE`) cho trình phát Frontend.
 * - Ưu tiên: (1) URL tuyệt đối `http(s)://` hoặc `/videos/...` -> (2) Domain `R2_PUBLIC_DOMAIN` thật -> (3) MP4 fallback công cộng.
 */
export function resolvePlayableVideoSource(
  videoR2Key: string | null | undefined,
  sessionOrder = 1,
  customR2PublicDomain?: string
): {
  videoUrl: string;
  playbackType: 'MP4' | 'HLS' | 'NONE';
  storageKey: string;
} {
  const raw = (videoR2Key || '').trim();
  if (!raw) {
    return {
      videoUrl: '',
      playbackType: 'NONE',
      storageKey: '',
    };
  }

  const fallbackMp4 =
    RELIABLE_MP4_LECTURE_VIDEOS[
      Math.max(0, sessionOrder - 1) % RELIABLE_MP4_LECTURE_VIDEOS.length
    ] ?? RELIABLE_MP4_LECTURE_VIDEOS[0]!;

  // Full URL (e.g., https://pub-....r2.dev/recordings/session-6/...) or local static lecture video (/videos/lectures/...)
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/videos/')) {
    const isHls = /\.m3u8(\?.*)?$/i.test(raw);
    return {
      videoUrl: raw,
      playbackType: isHls ? 'HLS' : 'MP4',
      storageKey: raw,
    };
  }

  const cleanKey = raw.replace(/^\/+/, '');
  const r2Domain = (
    customR2PublicDomain !== undefined ? customR2PublicDomain : env.R2_PUBLIC_DOMAIN || ''
  ).replace(/\/+$/, '');
  const isR2DomainConfigured =
    Boolean(r2Domain) &&
    !r2Domain.includes('media.yourdomain.com') &&
    !r2Domain.includes('cdn.3t.edu.vn');

  if (
    isR2DomainConfigured &&
    (customR2PublicDomain !== undefined || !SEED_PLACEHOLDER_KEY_REGEX.test(cleanKey))
  ) {
    const fullR2Url = `${r2Domain}/${cleanKey}`;
    const isHls = /\.m3u8(\?.*)?$/i.test(cleanKey);
    return {
      videoUrl: fullR2Url,
      playbackType: isHls ? 'HLS' : 'MP4',
      storageKey: cleanKey,
    };
  }

  return {
    videoUrl: fallbackMp4,
    playbackType: 'MP4',
    storageKey: cleanKey,
  };
}
