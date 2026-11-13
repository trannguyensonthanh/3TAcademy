import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  TrackSource,
  TrackType,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { getR2EndpointUrl, getR2PublicObjectUrl, isR2Configured } from './r2.service.js';

export interface TokenOptions {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost: boolean;
  canPublish?: boolean;
  metadata?: string;
}

export function getLiveKitHttpHost(wsUrl = env.LIVEKIT_API_URL): string {
  const raw = (wsUrl || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

export function getRoomServiceClient(): RoomServiceClient | null {
  const host = getLiveKitHttpHost();
  if (!host || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export function getEgressClient(): EgressClient | null {
  const host = getLiveKitHttpHost();
  if (!host || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new EgressClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export function getWebhookReceiver(): WebhookReceiver | null {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export function createLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  isHost,
  canPublish = true,
  metadata,
}: TokenOptions): Promise<string> {
  const apiKey = env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = env.LIVEKIT_API_SECRET || 'secret';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '6h',
    metadata:
      metadata ??
      JSON.stringify({
        role: isHost ? 'INSTRUCTOR' : 'STUDENT',
        isHost,
      }),
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: isHost,
  });

  return at.toJwt();
}

export interface GuestSpeakerInviteOptions {
  roomName: string;
  guestName: string;
  ttlHours?: number;
}

export function createGuestSpeakerToken({
  roomName,
  guestName,
  ttlHours = 24,
}: GuestSpeakerInviteOptions): Promise<string> {
  const apiKey = env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = env.LIVEKIT_API_SECRET || 'secret';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `guest-speaker-${Date.now()}`,
    name: `[Diễn giả] ${guestName}`,
    ttl: `${ttlHours}h`,
    metadata: JSON.stringify({
      role: 'GUEST_SPEAKER',
      isHost: false,
    }),
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: false,
  });

  return at.toJwt();
}

export async function muteLiveKitParticipantsAudio(params: {
  roomName: string;
  targetIdentity?: string;
  muteAllStudents?: boolean;
  hostIdentity?: string;
  muted?: boolean;
}): Promise<{
  mutedIdentities: string[];
  mutedTrackCount: number;
  sfuSynced: boolean;
}> {
  const muted = params.muted ?? true;
  const mutedIdentities: string[] = [];
  let mutedTrackCount = 0;
  const client = getRoomServiceClient();

  if (!client) {
    if (params.targetIdentity) mutedIdentities.push(params.targetIdentity);
    return { mutedIdentities, mutedTrackCount: 0, sfuSynced: false };
  }

  try {
    const participants = await client.listParticipants(params.roomName);
    for (const p of participants) {
      if (params.muteAllStudents) {
        if (params.hostIdentity && p.identity === params.hostIdentity) continue;
        let isParticipantHost = false;
        try {
          if (p.metadata) {
            const parsed = JSON.parse(p.metadata) as { isHost?: boolean; role?: string };
            if (parsed.isHost || parsed.role === 'INSTRUCTOR' || parsed.role === 'ADMIN') {
              isParticipantHost = true;
            }
          }
        } catch {
          // ignore metadata parse error
        }
        if (isParticipantHost) continue;
      } else if (params.targetIdentity && p.identity !== params.targetIdentity) {
        continue;
      }

      mutedIdentities.push(p.identity);
      const audioTracks = (p.tracks || []).filter(
        (t) => t.type === TrackType.AUDIO || t.source === TrackSource.MICROPHONE
      );
      for (const track of audioTracks) {
        if (track.sid) {
          await client.mutePublishedTrack(params.roomName, p.identity, track.sid, muted);
          mutedTrackCount += 1;
        }
      }
    }
    return { mutedIdentities, mutedTrackCount, sfuSynced: true };
  } catch {
    if (params.targetIdentity && !mutedIdentities.includes(params.targetIdentity)) {
      mutedIdentities.push(params.targetIdentity);
    }
    return { mutedIdentities, mutedTrackCount, sfuSynced: false };
  }
}

export async function kickLiveKitParticipant(params: {
  roomName: string;
  targetIdentity: string;
}): Promise<{ sfuRemoved: boolean }> {
  const client = getRoomServiceClient();
  if (!client || !params.targetIdentity) {
    return { sfuRemoved: false };
  }
  try {
    await client.removeParticipant(params.roomName, params.targetIdentity);
    return { sfuRemoved: true };
  } catch {
    return { sfuRemoved: false };
  }
}

export async function startLiveKitRoomRecordingToR2(params: {
  roomName: string;
  sessionId: string | number;
}): Promise<{
  egressId: string;
  objectKey: string;
  publicUrl: string;
  mode: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
}> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectKey = `recordings/session-${params.sessionId}/live-${timestamp}.mp4`;
  const publicUrl = getR2PublicObjectUrl(objectKey);

  const egressClient = getEgressClient();
  if (egressClient && isR2Configured()) {
    try {
      const fileOutput = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: objectKey,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey: env.R2_ACCESS_KEY_ID,
            secret: env.R2_SECRET_ACCESS_KEY,
            region: 'auto',
            endpoint: getR2EndpointUrl(),
            bucket: env.R2_BUCKET_NAME,
            forcePathStyle: true,
          }),
        },
      });

      const egressInfo = await egressClient.startRoomCompositeEgress(
        params.roomName,
        fileOutput,
        {
          layout: 'speaker-dark',
        }
      );

      if (egressInfo?.egressId) {
        return {
          egressId: egressInfo.egressId,
          objectKey,
          publicUrl,
          mode: 'LIVEKIT_EGRESS',
        };
      }
    } catch {
      // Fallback to browser/direct R2 recording session if LiveKit Cloud Egress has no active tracks yet
    }
  }

  return {
    egressId: `r2-rec-${params.sessionId}-${Date.now()}`,
    objectKey,
    publicUrl,
    mode: 'BROWSER_R2',
  };
}

export async function stopLiveKitRoomRecording(egressId?: string): Promise<boolean> {
  if (!egressId || egressId.startsWith('r2-rec-')) {
    return false;
  }
  const egressClient = getEgressClient();
  if (!egressClient) return false;
  try {
    await egressClient.stopEgress(egressId);
    return true;
  } catch {
    return false;
  }
}
