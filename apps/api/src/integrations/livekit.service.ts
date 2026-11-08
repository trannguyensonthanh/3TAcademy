import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env.js';

export interface TokenOptions {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost: boolean;
}

export function createLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  isHost,
}: TokenOptions): Promise<string> {
  const apiKey = env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = env.LIVEKIT_API_SECRET || 'secret';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: isHost,
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

/**
 * Generates a one-time LiveKit invite token for external Guest Speakers
 * without requiring a database account or GUEST role in PostgreSQL.
 */
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


