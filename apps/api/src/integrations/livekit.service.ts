/**
 * ============================================================================
 * TỆP: apps/api/src/integrations/livekit.service.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Dịch vụ tích hợp LiveKit SFU (WebRTC Real-time Video/Audio)
 *     phục vụ phòng học livestream trực tuyến.
 *   - Đảm nhiệm:
 *     1. Cấp phát JWT Access Token phân quyền chặt chẽ giữa Giảng viên (Host / `roomAdmin`),
 *        Học viên (Student) và Diễn giả khách mời (Guest Speaker).
 *     2. Điều khiển phòng SFU từ phía server (tắt mic cá nhân/toàn lớp, đuổi học viên vi phạm).
 *     3. Khởi tạo & dừng ghi hình phòng livestream (LiveKit Cloud Egress xuất thẳng MP4 lên
 *        Cloudflare R2, có fallback sang chế độ `BROWSER_R2` nếu phòng chưa có track hoạt động).
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ:
 *     + `apps/api/src/modules/learning/learning.routes.ts` (xin token vào phòng livestream, xác thực link diễn giả)
 *     + `apps/api/src/modules/teach/teach.routes.ts` (mute/kick học viên, start/stop recording, tạo link diễn giả)
 *   - Gọi tiếp sang:
 *     + LiveKit Server SDK (`RoomServiceClient`, `EgressClient`, `AccessToken`, `WebhookReceiver`)
 *     + `apps/api/src/integrations/r2.service.ts` (lấy endpoint S3 và URL công khai Cloudflare R2 cho bản ghi hình)
 * ============================================================================
 */
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

/**
 * Chuyển đổi URL WebSocket của LiveKit (`wss://` / `ws://`) sang URL HTTP (`https://` / `http://`).
 *
 * - **Mục tiêu:** `RoomServiceClient` và `EgressClient` của LiveKit gọi Twirp/HTTP API thay vì WebSocket,
 *   nên cần chuyển đổi giao thức từ biến môi trường `LIVEKIT_API_URL`.
 * - **Đầu vào:** `wsUrl` (mặc định đọc từ `env.LIVEKIT_API_URL`).
 * - **Đầu ra:** Chuỗi origin HTTP đã cắt dấu `/` ở cuối (hoặc chuỗi rỗng nếu chưa cấu hình).
 */
export function getLiveKitHttpHost(wsUrl = env.LIVEKIT_API_URL): string {
  const raw = (wsUrl || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

/**
 * Khởi tạo `RoomServiceClient` để điều khiển phòng học và người tham gia trên LiveKit SFU.
 *
 * - **Đầu ra:** Thực thể `RoomServiceClient` nếu đã cấu hình đủ URL + API Key + API Secret, ngược lại trả `null`.
 */
export function getRoomServiceClient(): RoomServiceClient | null {
  const host = getLiveKitHttpHost();
  if (!host || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

/**
 * Khởi tạo `EgressClient` để gửi lệnh ghi hình phòng livestream xuất trực tiếp ra lưu trữ S3/R2.
 *
 * - **Đầu ra:** Thực thể `EgressClient` hoặc `null` nếu thiếu thông số LiveKit.
 */
export function getEgressClient(): EgressClient | null {
  const host = getLiveKitHttpHost();
  if (!host || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new EgressClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

/**
 * Khởi tạo `WebhookReceiver` để xác thực chữ ký các webhook LiveKit gửi về Backend (ví dụ kết thúc Egress).
 *
 * - **Đầu ra:** Thực thể `WebhookReceiver` hoặc `null` nếu thiếu khóa bí mật.
 */
export function getWebhookReceiver(): WebhookReceiver | null {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

/**
 * Ký phát JWT Access Token cho Giảng viên (Host) hoặc Học viên (Student) kết nối vào phòng LiveKit.
 *
 * - **Mục tiêu:** Đảm bảo chỉ người dùng đã qua bước kiểm tra quyền của Backend mới có thể vào đúng `roomName`,
 *   với quyền hạn phân tách rõ (`roomAdmin: true` chỉ cấp cho Host/Giảng viên).
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/learning/learning.routes.ts` (`POST /api/v1/sessions/:sessionId/livekit-token`).
 *   + Frontend (`apps/web`) nhận JWT này rồi truyền trực tiếp cho LiveKit Client SDK để mở WebRTC.
 * - **Đầu vào:** `TokenOptions` gồm `roomName`, `participantIdentity`, `participantName`, `isHost`, `canPublish`, `metadata`.
 * - **Đầu ra:** Promise chuỗi JWT LiveKit có thời hạn sống `6h`.
 */
export function createLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  isHost,
  canPublish = true,
  metadata,
}: TokenOptions): Promise<string> {
  // Bước 1: Đọc khóa API LiveKit (có giá trị dev mặc định cho môi trường phát triển cục bộ)
  const apiKey = env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = env.LIVEKIT_API_SECRET || 'secret';

  // Bước 2: Đóng gói danh tính (`identity`), tên hiển thị và metadata vai trò vào AccessToken (TTL 6 giờ)
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

  // Bước 3: Gắn VideoGrant phân quyền phòng học — chỉ Host mới có cờ `roomAdmin: true`
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: isHost,
  });

  // Bước 4: Ký HMAC-SHA256 và xuất chuỗi JWT
  return at.toJwt();
}

export interface GuestSpeakerInviteOptions {
  roomName: string;
  guestName: string;
  ttlHours?: number;
}

/**
 * Tạo JWT Access Token riêng cho Diễn giả khách mời (Guest Speaker) không cần tài khoản trong hệ thống.
 *
 * - **Mục tiêu:** Cho phép Giảng viên mời chuyên gia bên ngoài vào chia sẻ màn hình/phát biểu
 *   (`canPublish: true`) nhưng không cấp quyền quản trị phòng (`roomAdmin: false`).
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/learning/learning.routes.ts` (`POST /api/v1/live/guest/verify`)
 *     và `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/guest-link`).
 * - **Đầu vào:** `roomName`, `guestName`, `ttlHours` (mặc định `24` giờ).
 * - **Đầu ra:** Promise chuỗi JWT LiveKit gắn vai trò `GUEST_SPEAKER`.
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

/**
 * Tắt (hoặc bật lại) luồng micro của một học viên cụ thể hoặc toàn bộ học viên trong phòng LiveKit SFU.
 *
 * - **Mục tiêu:** Cung cấp quyền kiểm soát trật tự lớp học từ phía server cho Giảng viên;
 *   bảo vệ tuyệt đối không tự tắt nhầm micro của Host / Giảng viên / Admin khi bật chế độ `muteAllStudents`.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/mute-participant`).
 * - **Đầu vào:** `roomName`, `targetIdentity` (tắt 1 người), `muteAllStudents` (tắt cả lớp), `hostIdentity`, `muted` (mặc định `true`).
 * - **Đầu ra:** Danh sách `mutedIdentities`, số track âm thanh đã tắt (`mutedTrackCount`) và cờ `sfuSynced` báo trạng thái đồng bộ SFU.
 */
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

  // Bước 1: Nếu chưa cấu hình LiveKit SFU thật, trả về `sfuSynced: false` để lớp vẫn xử lý qua kênh signaling SSE nội bộ
  if (!client) {
    if (params.targetIdentity) mutedIdentities.push(params.targetIdentity);
    return { mutedIdentities, mutedTrackCount: 0, sfuSynced: false };
  }

  try {
    // Bước 2: Lấy danh sách toàn bộ người đang có mặt trong phòng từ LiveKit SFU
    const participants = await client.listParticipants(params.roomName);
    for (const p of participants) {
      // Bước 3: Lọc đối tượng cần mute — nếu là chế độ tắt toàn lớp thì bỏ qua Host / Giảng viên / Admin
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

      // Bước 4: Tìm tất cả track âm thanh/micro của đối tượng và gọi lệnh `mutePublishedTrack` lên SFU
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

/**
 * Đuổi (ngắt kết nối cưỡng bức) một người tham gia khỏi phòng LiveKit SFU.
 *
 * - **Mục tiêu:** Cho phép Giảng viên xử lý học viên gây rối ngay lập tức ở tầng media SFU.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/kick-participant`).
 * - **Đầu vào:** `roomName`, `targetIdentity`.
 * - **Đầu ra:** `{ sfuRemoved: boolean }` xác nhận SFU đã ngắt kết nối thành công hay chưa.
 */
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

/**
 * Bắt đầu ghi hình phòng học livestream và xuất file MP4 thẳng lên Cloudflare R2.
 *
 * - **Mục tiêu:** Tự động tạo bản ghi xem lại (Replay) lưu trữ bền vững trên R2. Nếu LiveKit Egress
 *   khả dụng và phòng đang có luồng phát, dùng `LIVEKIT_EGRESS`; ngược lại fallback mượt sang `BROWSER_R2`
 *   (trình duyệt Giảng viên tự ghi bằng MediaRecorder rồi upload lên R2).
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/recording/start`).
 *   + Gọi sang: `r2.service.ts` (`getR2EndpointUrl`, `getR2PublicObjectUrl`, `isR2Configured`) và LiveKit Egress API.
 * - **Đầu vào:** `roomName`, `sessionId`.
 * - **Đầu ra:** `egressId`, `objectKey` trên R2, `publicUrl` xem lại, và `mode` (`LIVEKIT_EGRESS` | `BROWSER_R2`).
 */
export async function startLiveKitRoomRecordingToR2(params: {
  roomName: string;
  sessionId: string | number;
}): Promise<{
  egressId: string;
  objectKey: string;
  publicUrl: string;
  mode: 'LIVEKIT_EGRESS' | 'BROWSER_R2';
}> {
  // Bước 1: Sinh đường dẫn lưu trữ chuẩn trên R2 theo định dạng `recordings/session-{id}/live-{timestamp}.mp4`
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectKey = `recordings/session-${params.sessionId}/live-${timestamp}.mp4`;
  const publicUrl = getR2PublicObjectUrl(objectKey);

  // Bước 2: Nếu đủ cấu hình LiveKit Egress + Cloudflare R2, khởi chạy Room Composite Egress ghi MP4 thẳng sang S3/R2
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

  // Bước 3: Nhánh Fallback `BROWSER_R2` khi chưa có track LiveKit Cloud hoặc đang chạy chế độ dev/WebRTC trình duyệt
  return {
    egressId: `r2-rec-${params.sessionId}-${Date.now()}`,
    objectKey,
    publicUrl,
    mode: 'BROWSER_R2',
  };
}

/**
 * Dừng tác vụ ghi hình LiveKit Cloud Egress đang chạy.
 *
 * - **Mục tiêu:** Đóng file MP4 trên R2 khi Giảng viên bấm kết thúc ghi hình (bỏ qua nếu là mã `r2-rec-*` của trình duyệt).
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/recording/stop`).
 * - **Đầu vào:** `egressId` của phiên ghi hình.
 * - **Đầu ra:** `true` nếu dừng thành công trên LiveKit Egress, ngược lại `false`.
 */
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
