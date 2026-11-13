const env = (import.meta as any).env || {};
const explicitBaseUrl = env.VITE_API_BASE_URL ? String(env.VITE_API_BASE_URL).trim() : '';

export const API_CONFIG = {
  BASE_URL: explicitBaseUrl || '/api/v1',
  HAS_EXPLICIT_BACKEND: true,
};

const ACCESS_TOKEN_STORAGE_KEY = '3t_academy_access_token';
let memoryAccessToken: string | null = null;

export function setAuthAccessToken(token: string | null): void {
  memoryAccessToken = token;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
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
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      if (stored) return stored;
    }
  } catch {
    // Fallback to memory token
  }
  return memoryAccessToken;
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
 * Production HTTP Client:
 * Automatically attaches `Content-Type: application/json`, `X-Request-ID`,
 * `Authorization: Bearer <token>`, and `credentials: 'include'`.
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

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) {
        errorMessage = errorBody.message;
      } else if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      }
    } catch {
      // Keep status text
    }
    throw new Error(errorMessage);
  }

  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json && json.success === true) {
    return json.data as T;
  }
  return json as T;
}
