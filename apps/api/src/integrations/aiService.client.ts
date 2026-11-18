import { env } from '../config/env.js';

export class AiServiceClient {
  private baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, '');
  private apiKey = env.INTERNAL_API_KEY;

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    correlationId = 'internal',
    timeoutMs = 2500
  ): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('X-Internal-Key', this.apiKey);
    headers.set('X-Request-ID', correlationId);
    headers.set('Content-Type', 'application/json');

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`AI Service request failed with status ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async askAdvisor(question: string, correlationId?: string) {
    return this.request<{
      answerMd: string;
      citations: Array<{ chunkId: number; sourceType: string; snippet: string }>;
    }>(
      '/api/v1/ai/advisor/ask',
      {
        method: 'POST',
        body: JSON.stringify({ question }),
      },
      correlationId
    );
  }

  async askSessionTutor(
    payload: {
      cohortId: number;
      sessionId: number;
      question: string;
      currentVideoSec: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      answerMd: string;
      detectedTopic?: string;
      citations: Array<{
        chunkId?: number;
        startSec?: number;
        endSec?: number;
        pageNumber?: number;
        snippet?: string;
      }>;
    }>(
      '/api/v1/ai/tutor/ask',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      correlationId
    );
  }

  async parseCvPdf(rawText: string, correlationId?: string) {
    return this.request<{
      skills?: string[];
      externalSkills?: Array<{ name: string; note?: string }>;
      projects?: Array<Record<string, unknown>>;
      phone?: string;
      githubUrl?: string;
      linkedinUrl?: string;
      headline?: string;
      careerObjective?: string;
    }>(
      '/api/v1/ai/cv/parse',
      {
        method: 'POST',
        body: JSON.stringify({ raw_text: rawText, rawText }),
      },
      correlationId
    );
  }

  async screenCv(
    payload: {
      cvData: Record<string, unknown>;
      targetLevel: string;
      targetRole: string;
      jdRawText: string;
    },
    correlationId?: string
  ) {
    return this.request<{
      matchScore?: number;
      match_score?: number;
      missingSkills?: string[];
      missing_skills?: string[];
      feedback?: string;
    }>(
      '/api/v1/ai/mock-interviews/round1-cv-defense',
      {
        method: 'POST',
        body: JSON.stringify({
          cv_parsed_data: payload.cvData,
          target_level: payload.targetLevel,
          target_role: payload.targetRole,
          jd_raw_text: payload.jdRawText,
        }),
      },
      correlationId
    );
  }

  async generateQuizDraft(
    params: {
      sessionId: number;
      sessionTitle: string;
      transcriptText: string;
      skillIds?: number[];
      questionCount?: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      session_id: number;
      generated_items: Array<{
        prompt: string;
        options: string[];
        correctIndex: number;
        explanationMd: string;
        skillId?: number;
      }>;
    }>(
      '/api/v1/ai/assessments/generate-quiz',
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: params.sessionId,
          session_title: params.sessionTitle,
          transcript_text: params.transcriptText,
          skill_ids: params.skillIds ?? [],
          question_count: params.questionCount ?? 4,
        }),
      },
      correlationId,
      4000
    );
  }
}

export const aiServiceClient = new AiServiceClient();
