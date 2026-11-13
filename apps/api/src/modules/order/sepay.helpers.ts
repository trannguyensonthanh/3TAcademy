export interface SepayWebhookUrls {
  publicBaseUrl: string;
  primaryWebhookUrl: string;
  backupWebhookUrl: string;
  fallbackWebhookUrls: string[];
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

export function buildSepayWebhookUrls(
  publicBaseUrlRaw: string,
  primaryOverride?: string,
  backupOverride?: string
): SepayWebhookUrls {
  const publicBaseUrl = normalizeBaseUrl(publicBaseUrlRaw);
  const primaryWebhookUrl =
    primaryOverride && primaryOverride.trim()
      ? primaryOverride.trim()
      : `${publicBaseUrl}/api/v1/webhooks/sepay`;
  const backupWebhookUrl =
    backupOverride && backupOverride.trim()
      ? backupOverride.trim()
      : `${publicBaseUrl}/api/v1/webhooks/sepay/backup`;

  const candidates = [
    backupWebhookUrl,
    `${publicBaseUrl}/webhooks/sepay`,
    `${publicBaseUrl}/webhooks/sepay/backup`,
    `${publicBaseUrl}/api/webhooks/sepay`,
    `${publicBaseUrl}/api/webhooks/sepay/backup`,
    `${publicBaseUrl}/api/v1/sepay/webhook`,
  ];

  const fallbackWebhookUrls = Array.from(
    new Set(candidates.filter((url) => url !== primaryWebhookUrl))
  );

  return {
    publicBaseUrl,
    primaryWebhookUrl,
    backupWebhookUrl,
    fallbackWebhookUrls,
  };
}

const ORDER_CODE_PATTERN = /(?:^|[^A-Z0-9])((?:ORD)?(?:3T|ET)[A-Z0-9-]*\d[A-Z0-9-]*)(?=$|[^A-Z0-9])/i;
const DIRECT_CODE_PATTERN = /^(?:ORD)?(?:3T|ET)[A-Z0-9-]+$/i;

export function extractOrderCodeFromSepayPayload(
  payload: Record<string, unknown>
): string | null {
  for (const directField of [payload.code, payload.orderCode]) {
    if (typeof directField === 'string') {
      const trimmed = directField.trim().toUpperCase();
      if (trimmed && DIRECT_CODE_PATTERN.test(trimmed)) {
        return trimmed;
      }
    }
  }

  const content = String(payload.content || payload.description || '');
  const match = content.match(ORDER_CODE_PATTERN);
  return match && match[1] ? match[1].toUpperCase() : null;
}

export function isIncomingSepayTransfer(payload: Record<string, unknown>): boolean {
  if (payload.transferType === undefined || payload.transferType === null) {
    return true;
  }
  const normalized = String(payload.transferType).trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized === 'in';
}

export function isSepaySecretAuthorized(
  headers: Record<string, string | string[] | undefined>,
  configuredSecret?: string
): boolean {
  const secret = configuredSecret?.trim();
  if (!secret) {
    return true;
  }

  const rawAuth = headers.authorization ?? headers.Authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    const token = trimmed.replace(/^(?:Apikey|Bearer)\s+/i, '').trim();
    if (token === secret) {
      return true;
    }
  }

  const rawCustomHeader = headers['x-sepay-secret'] ?? headers['X-Sepay-Secret'];
  const customHeader = Array.isArray(rawCustomHeader) ? rawCustomHeader[0] : rawCustomHeader;
  if (typeof customHeader === 'string' && customHeader.trim() === secret) {
    return true;
  }

  return false;
}
