const env = (import.meta as any).env || {};
const explicitBaseUrl = env.VITE_API_BASE_URL ? String(env.VITE_API_BASE_URL).trim() : '';

export const API_CONFIG = {
  BASE_URL: explicitBaseUrl || '/api/v1',
  HAS_EXPLICIT_BACKEND: true,
};

const ACCESS_TOKEN_STORAGE_KEY = '3t_academy_access_token';
const REFRESH_TOKEN_STORAGE_KEY = '3t_academy_refresh_token';
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;
let inflightRefreshPromise: Promise<string | null> | null = null;

function writeStorageItem(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  for (const storageKind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageKind];
      if (!storage) continue;
      if (value) {
        storage.setItem(key, value);
      } else {
        storage.removeItem(key);
      }
    } catch {
      // Ignore storage errors (e.g. sandboxed iframe or quota)
    }
  }
}

function readStorageItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  for (const storageKind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageKind];
      if (!storage) continue;
      const val = storage.getItem(key);
      if (val) return val;
    } catch {
      // Ignore storage errors
    }
  }
  return null;
}

export function setAuthAccessToken(token: string | null): void {
  memoryAccessToken = token;
  writeStorageItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

export function getAuthAccessToken(): string | null {
  return readStorageItem(ACCESS_TOKEN_STORAGE_KEY) || memoryAccessToken;
}

export function setAuthRefreshToken(token: string | null): void {
  memoryRefreshToken = token;
  writeStorageItem(REFRESH_TOKEN_STORAGE_KEY, token);
}

export function getAuthRefreshToken(): string | null {
  return readStorageItem(REFRESH_TOKEN_STORAGE_KEY) || memoryRefreshToken;
}

export function clearAuthTokens(): void {
  setAuthAccessToken(null);
  setAuthRefreshToken(null);
}

export function hasStoredAuthSession(): boolean {
  return Boolean(getAuthAccessToken() || getAuthRefreshToken());
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

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (inflightRefreshPromise) {
    return inflightRefreshPromise;
  }

  inflightRefreshPromise = (async () => {
    try {
      const refreshToken = getAuthRefreshToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        },
        credentials: 'include',
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearAuthTokens();
        }
        return null;
      }

      const json = await response.json();
      const payload =
        json && typeof json === 'object' && 'data' in json && json.success === true
          ? json.data
          : json;

      if (payload && typeof payload.accessToken === 'string' && payload.accessToken) {
        setAuthAccessToken(payload.accessToken);
        if (typeof payload.refreshToken === 'string' && payload.refreshToken) {
          setAuthRefreshToken(payload.refreshToken);
        }
        return payload.accessToken as string;
      }

      return null;
    } catch {
      return null;
    } finally {
      inflightRefreshPromise = null;
    }
  })();

  return inflightRefreshPromise;
}

function shouldAttemptTokenRefresh(normalizedEndpoint: string): boolean {
  return (
    normalizedEndpoint !== '/auth/login' &&
    normalizedEndpoint !== '/auth/register' &&
    normalizedEndpoint !== '/auth/google' &&
    normalizedEndpoint !== '/auth/refresh' &&
    normalizedEndpoint !== '/auth/logout'
  );
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

  const buildHeaders = (tokenOverride?: string | null) => {
    const headers = new Headers(options?.headers || {});
    if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('X-Request-ID', generateRequestId());

    const accessToken = tokenOverride ?? getAuthAccessToken();
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return headers;
  };

  let response = await fetch(url, {
    ...options,
    method,
    headers: buildHeaders(),
    credentials: 'include',
  });

  if (response.status === 401 && shouldAttemptTokenRefresh(normalizedEndpoint)) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      response = await fetch(url, {
        ...options,
        method,
        headers: buildHeaders(newToken),
        credentials: 'include',
      });
    }
  }

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
