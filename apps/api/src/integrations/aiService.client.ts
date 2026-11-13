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
      projects?: Array<Record<string, unknown>>;
    }>(
      '/api/v1/ai/cv/parse',
      {
        method: 'POST',
        body: JSON.stringify({ rawText }),
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
      missingSkills?: string[];
    }>(
      '/api/v1/ai/interviews/screen-cv',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      correlationId
    );
  }

  async generateQuizDraft(sessionId: number, correlationId?: string) {
    return this.request<{
      session_id: number;
      generated_items: Array<Record<string, unknown>>;
    }>(
      '/api/v1/ai/assessments/generate-quiz',
      {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      },
      correlationId
    );
  }

  async generateSessionQuiz(
    payload: {
      session_id: number;
      session_title: string;
      transcript_text: string;
      skill_ids?: number[];
      question_count?: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      session_id: number;
      generated_items: Array<Record<string, unknown>>;
    }>(
      '/api/v1/ai/assessments/generate-quiz',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      correlationId
    );
  }

  async coGradeSubmission(
    payload: {
      item_id: number;
      prompt_md: string;
      rubric_config: Record<string, unknown>;
      student_response_md: string;
      github_repo_url?: string;
      max_points: number;
    },
    correlationId?: string
  ) {
    return this.request<{
      item_id: number;
      ai_suggestion: {
        score: number;
        feedback_md: string;
        rubric_scores: Record<string, number>;
      };
    }>(
      '/api/v1/ai/assessments/co-grade',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      correlationId
    );
  }
}

export const aiServiceClient = new AiServiceClient();
