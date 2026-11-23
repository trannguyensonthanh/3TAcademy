/**
 * ============================================================================
 * TỆP: apps/api/src/integrations/r2.service.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Dịch vụ lưu trữ đối tượng Cloudflare R2 (tương thích chuẩn S3)
 *     phục vụ upload và phân phối video bài giảng / bản ghi livestream (Replay MP4/WebM).
 *   - Tự cài đặt thuần chuẩn chữ ký số **AWS Signature Version 4 (AWS4-HMAC-SHA256)** bằng
 *     module `node:crypto` có sẵn của Node.js, giúp tối ưu dung lượng bundle mà không cần
 *     cài thêm bộ AWS SDK nặng nề.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ:
 *     + `apps/api/src/integrations/livekit.service.ts` (lấy endpoint S3 & URL công khai cho LiveKit Egress)
 *     + `apps/api/src/modules/teach/teach.routes.ts` (ký URL upload trực tiếp `createR2PresignedPutUrl`
 *       khi bắt đầu ghi hình và `uploadBufferToR2` khi nhận file ghi hình từ trình duyệt Giảng viên)
 *   - Gọi tiếp sang:
 *     + Cloudflare R2 S3-Compatible API (`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
 *     + CDN / Public Domain (`env.R2_PUBLIC_DOMAIN`) để Frontend phát video bài giảng.
 * ============================================================================
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** Tính mã băm HMAC-SHA256 trả về dạng `Buffer` (dùng trong chuỗi dẫn xuất khóa ký AWS4). */
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Tính mã băm SHA-256 dạng chuỗi thập lục phân (hex) cho nội dung request/payload. */
function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Mã hóa URI nghiêm ngặt theo chuẩn RFC 3986 (bắt buộc bởi thuật toán AWS Signature V4). */
function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Mã hóa từng phân đoạn đường dẫn object key trên bucket mà vẫn giữ nguyên dấu phân tách `/`. */
function encodeObjectKeyPath(objectKey: string): string {
  return objectKey
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

/**
 * Dẫn xuất khóa ký AWS Signature V4 (Signing Key) qua 4 vòng HMAC-SHA256 lồng nhau:
 * `AWS4 + secretKey -> dateStamp -> region -> service -> 'aws4_request'`.
 */
function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * Kiểm tra xem Backend đã được cấu hình đầy đủ 4 thông số kết nối Cloudflare R2 hay chưa.
 *
 * - **Đầu ra:** `true` nếu đủ `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
 */
export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME
  );
}

/**
 * Trả về S3-compatible endpoint của tài khoản Cloudflare R2 hiện tại.
 *
 * - **Đầu ra:** Chuỗi `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
 */
export function getR2EndpointUrl(): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * Xây dựng URL công khai (Public CDN URL) để Frontend phát trực tiếp video/tài nguyên đã lưu trên R2.
 *
 * - **Mục tiêu:** Ưu tiên domain công khai (`R2_PUBLIC_DOMAIN`, miễn phí egress bandwidth của Cloudflare R2);
 *   nếu chưa gán custom domain thì fallback về đường dẫn trực tiếp của R2 bucket.
 * - **Đầu vào:** `objectKey` — khóa đối tượng trong bucket (ví dụ `recordings/session-1/live-xxx.mp4`).
 * - **Đầu ra:** URL HTTPS sẵn sàng đưa vào thẻ `<video src="...">` trên Frontend.
 */
export function getR2PublicObjectUrl(objectKey: string): string {
  const cleanKey = objectKey.replace(/^\/+/, '');
  const base = (env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
  if (!base) {
    return `${getR2EndpointUrl()}/${env.R2_BUCKET_NAME}/${cleanKey}`;
  }
  return `${base}/${cleanKey}`;
}

/**
 * Tạo Presigned PUT URL ký bằng AWS Signature V4 cho Cloudflare R2 để client upload thẳng không qua Backend.
 *
 * - **Mục tiêu:** Giảm tải băng thông máy chủ API khi upload file video lớn; client nhận URL có chữ ký tạm thời
 *   (từ 60 giây tới tối đa 24 giờ) để gửi trực tiếp HTTP `PUT` lên Cloudflare R2.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/recording/start`).
 * - **Đầu vào:** `params` gồm `objectKey`, `contentType` (tùy chọn), `expiresInSeconds` (mặc định `3600s`, giới hạn `[60, 86400]`).
 * - **Đầu ra:** `{ uploadUrl, publicUrl, objectKey }` (URL để PUT file và URL công khai để phát lại sau khi upload xong).
 *
 * Generates an AWS Signature V4 Presigned PUT URL for Cloudflare R2
 * so clients or services can upload directly to R2 without extra SDK bloat.
 */
export function createR2PresignedPutUrl(params: {
  objectKey: string;
  contentType?: string;
  expiresInSeconds?: number;
}): { uploadUrl: string; publicUrl: string; objectKey: string } {
  // Bước 1: Chuẩn hóa objectKey, thời hạn sống và mốc thời gian chuẩn ISO8601 dạng rút gọn (`YYYYMMDDTHHMMSSZ`)
  const cleanKey = params.objectKey.replace(/^\/+/, '');
  const expires = Math.min(Math.max(params.expiresInSeconds ?? 3600, 60), 86400);
  const region = 'auto';
  const service = 's3';
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Bước 2: Xây dựng Canonical URI và tập Query Parameters ký chữ ký AWS4 (dùng `UNSIGNED-PAYLOAD` cho Presigned URL)
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodeRfc3986(env.R2_BUCKET_NAME)}/${encodeObjectKeyPath(cleanKey)}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k]!)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  // Bước 3: Lắp Canonical Request -> StringToSign -> tính chữ ký HMAC-SHA256 bằng Signing Key dẫn xuất
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(env.R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  // Bước 4: Ghép `X-Amz-Signature` vào cuối URL và trả kèm `publicUrl` để lưu vào DB bài học
  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return {
    uploadUrl,
    publicUrl: getR2PublicObjectUrl(cleanKey),
    objectKey: cleanKey,
  };
}

/**
 * Tải trực tiếp một bộ đệm nhị phân (`Buffer`) từ Node.js Backend lên Cloudflare R2 bằng HTTP PUT ký AWS4.
 *
 * - **Mục tiêu:** Dùng khi trình duyệt Giảng viên gửi dữ liệu video ghi hình dạng Base64 lên Backend
 *   (tránh cấu hình CORS phức tạp trên bucket) để Backend xác thực rồi đẩy thẳng lên R2 kèm kiểm toàn vẹn SHA-256.
 * - **Liên kết luồng (Cross-layer):**
 *   + Được gọi từ: `apps/api/src/modules/teach/teach.routes.ts` (`POST /api/v1/teach/sessions/:sessionId/recording/upload`).
 * - **Đầu vào:** `params` gồm `objectKey`, `body` (`Buffer` nội dung file), `contentType` (ví dụ `video/webm` hoặc `video/mp4`).
 * - **Đầu ra:** `{ objectKey, publicUrl, sizeBytes }`; ném `Error` nếu Cloudflare R2 trả lỗi HTTP.
 *
 * Uploads a Buffer directly from the Node.js Backend to Cloudflare R2 via signed PUT request.
 */
export async function uploadBufferToR2(params: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<{ objectKey: string; publicUrl: string; sizeBytes: number }> {
  // Bước 1: Chuẩn hóa đường dẫn đối tượng và thời điểm ký AWS4
  const cleanKey = params.objectKey.replace(/^\/+/, '');
  const region = 'auto';
  const service = 's3';
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Bước 2: Băm SHA-256 toàn bộ nội dung Buffer (`x-amz-content-sha256`) để đảm bảo tính toàn vẹn dữ liệu khi truyền tải
  const payloadHash = sha256Hex(params.body);
  const canonicalUri = `/${encodeRfc3986(env.R2_BUCKET_NAME)}/${encodeObjectKeyPath(cleanKey)}`;
  const canonicalHeaders = [
    `content-type:${params.contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  // Bước 3: Lập Canonical Request, StringToSign và header `Authorization: AWS4-HMAC-SHA256 ...`
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(env.R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Bước 4: Gửi HTTP PUT kèm dữ liệu nhị phân lên R2 và kiểm tra kết quả phản hồi
  const endpoint = `https://${host}${canonicalUri}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': params.contentType,
      'Content-Length': String(params.body.byteLength),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: new Uint8Array(params.body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`R2 upload failed (${response.status}): ${errText.slice(0, 240)}`);
  }

  return {
    objectKey: cleanKey,
    publicUrl: getR2PublicObjectUrl(cleanKey),
    sizeBytes: params.body.byteLength,
  };
}
