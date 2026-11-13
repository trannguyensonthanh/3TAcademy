import { handleMockRequest } from '../mocks/mockBackendServer';

const env = (import.meta as any).env || {};
const explicitBaseUrl = env.VITE_API_BASE_URL ? String(env.VITE_API_BASE_URL).trim() : '';

export const API_CONFIG = {
  BASE_URL: explicitBaseUrl || 'http://localhost:4000/api/v1',
  HAS_EXPLICIT_BACKEND: Boolean(explicitBaseUrl),
  USE_MOCK_FALLBACK: explicitBaseUrl
    ? env.VITE_USE_MOCKS === 'true'
    : env.VITE_USE_MOCKS !== 'false',
};

const ACCESS_TOKEN_STORAGE_KEY = '3t_academy_access_token';

export function setAuthAccessToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAuthAccessToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback below
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * HTTP Client chuẩn Production:
 * Tự động đính kèm `Content-Type: application/json`, `X-Request-ID`, `Authorization: Bearer <token>`
 * và `credentials: 'include'`. Khi bật chế độ Mock hoặc chưa chạy Backend local,
 * tự động chuyển tiếp `(method, endpoint, body)` xuống `handleMockRequest` trong `src/mocks/mockBackendServer.ts`.
 */
export async function httpRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_CONFIG.BASE_URL}${normalizedEndpoint}`;

  const headers = new Headers(options?.headers || {});
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Request-ID', generateRequestId());

  const accessToken = getAuthAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (API_CONFIG.USE_MOCK_FALLBACK) {
    return await handleMockRequest<T>(method, normalizedEndpoint, options?.body);
  }

  try {
    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (json && typeof json === 'object' && 'data' in json && json.success === true) {
      return json.data as T;
    }
    return json as T;
  } catch (err) {
    if (API_CONFIG.USE_MOCK_FALLBACK) {
      return await handleMockRequest<T>(method, normalizedEndpoint, options?.body);
    }
    throw err;
  }
}
