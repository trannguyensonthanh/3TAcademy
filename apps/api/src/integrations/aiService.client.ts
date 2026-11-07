import { env } from '../config/env.js';

export class AiServiceClient {
  private baseUrl = env.AI_SERVICE_URL;
  private apiKey = env.INTERNAL_API_KEY;

  async request<T>(endpoint: string, options: RequestInit = {}, correlationId = 'internal'): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('X-Internal-Key', this.apiKey);
    headers.set('X-Request-ID', correlationId);
    headers.set('Content-Type', 'application/json');

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      throw new Error(`AI Service request failed with status ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async runCodeSandbox(code: string, language: string, stdin = '', correlationId?: string) {
    return this.request<{
      status: string;
      stdout: string;
      stderr: string;
      timeMs: number;
      memoryKb: number;
    }>(
      '/api/v1/code/run',
      {
        method: 'POST',
        body: JSON.stringify({ code, language, stdin }),
      },
      correlationId
    );
  }
}

export const aiServiceClient = new AiServiceClient();
