import crypto from 'node:crypto';
import { env } from '../config/env.js';

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeObjectKeyPath(objectKey: string): string {
  return objectKey
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME
  );
}

export function getR2EndpointUrl(): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export function getR2PublicObjectUrl(objectKey: string): string {
  const cleanKey = objectKey.replace(/^\/+/, '');
  const base = (env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
  if (!base) {
    return `${getR2EndpointUrl()}/${env.R2_BUCKET_NAME}/${cleanKey}`;
  }
  return `${base}/${cleanKey}`;
}

/**
 * Generates an AWS Signature V4 Presigned PUT URL for Cloudflare R2
 * so clients or services can upload directly to R2 without extra SDK bloat.
 */
export function createR2PresignedPutUrl(params: {
  objectKey: string;
  contentType?: string;
  expiresInSeconds?: number;
}): { uploadUrl: string; publicUrl: string; objectKey: string } {
  const cleanKey = params.objectKey.replace(/^\/+/, '');
  const expires = Math.min(Math.max(params.expiresInSeconds ?? 3600, 60), 86400);
  const region = 'auto';
  const service = 's3';
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

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

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return {
    uploadUrl,
    publicUrl: getR2PublicObjectUrl(cleanKey),
    objectKey: cleanKey,
  };
}

/**
 * Uploads a Buffer directly from the Node.js Backend to Cloudflare R2 via signed PUT request.
 */
export async function uploadBufferToR2(params: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<{ objectKey: string; publicUrl: string; sizeBytes: number }> {
  const cleanKey = params.objectKey.replace(/^\/+/, '');
  const region = 'auto';
  const service = 's3';
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(params.body);
  const canonicalUri = `/${encodeRfc3986(env.R2_BUCKET_NAME)}/${encodeObjectKeyPath(cleanKey)}`;
  const canonicalHeaders = [
    `content-type:${params.contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

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
