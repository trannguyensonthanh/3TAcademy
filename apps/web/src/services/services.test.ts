import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authApi,
  catalogApi,
  orderApi,
  learningApi,
  assessmentApi,
  profileInterviewApi,
  teachApi,
  adminApi,
  setAuthAccessToken,
  getAuthAccessToken,
} from './index';

const servicesDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(servicesDir, '..');

test('All *.api.ts files are pure httpRequest wrappers without .find(), .filter() or mock data', () => {
  const apiFiles = [
    'auth.api.ts',
    'catalog.api.ts',
    'order.api.ts',
    'learning.api.ts',
    'assessment.api.ts',
    'profile-interview.api.ts',
    'teach.api.ts',
    'admin.api.ts',
  ];

  for (const fileName of apiFiles) {
    const filePath = path.join(servicesDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      content.includes('.find('),
      false,
      `${fileName} must not contain .find()`
    );
    assert.equal(
      content.includes('.filter('),
      false,
      `${fileName} must not contain .filter()`
    );
    assert.equal(
      content.includes('mockDatabase'),
      false,
      `${fileName} must not import mockDatabase`
    );
    assert.equal(
      content.includes('mockBackendServer'),
      false,
      `${fileName} must not import mockBackendServer`
    );
  }
});

test('Zero files in src/views, src/components, src/context, or src/services reference mockDatabase, phase2QuizBank, mockBackendServer, DevToolbar, or simulateSepayWebhook', () => {
  const dirsToScan = [
    path.join(srcDir, 'views'),
    path.join(srcDir, 'components'),
    path.join(srcDir, 'context'),
    path.join(srcDir, 'services'),
  ];

  for (const dir of dirsToScan) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isFile() &&
        !entry.name.endsWith('.test.ts') &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      ) {
        const fullPath = path.join(dir, entry.name);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.equal(
          content.includes('mockDatabase'),
          false,
          `${entry.name} must not import mockDatabase`
        );
        assert.equal(
          content.includes('phase2QuizBank'),
          false,
          `${entry.name} must not import phase2QuizBank`
        );
        assert.equal(
          content.includes('mockBackendServer'),
          false,
          `${entry.name} must not import mockBackendServer`
        );
        assert.equal(
          content.includes('DevToolbar'),
          false,
          `${entry.name} must not reference DevToolbar`
        );
        assert.equal(
          content.includes('simulateSepayWebhook'),
          false,
          `${entry.name} must not reference simulateSepayWebhook`
        );
      }
    }
  }
});

test('6-block Resume Builder pure hydration and Smart Sync selection', async () => {
  const {
    mapApiProfileToStudentResume,
    mapParsedCvToStudentResume,
    applySmartSyncSelection,
  } = await import('../components/StudentProfileCvWorkspace');

  const hydrated = mapApiProfileToStudentResume({
    userProfile: {
      fullName: 'Trần Minh Quân',
      headline: '',
      bio: 'Học viên Kỹ sư AI Thực chiến',
      email: 'quan.tran@gmail.com',
      phone: '0912345678',
      githubUrl: 'https://github.com/quantran',
      linkedinUrl: 'https://linkedin.com/in/quantran',
      careerObjective: '',
      careerGoal: 'Trở thành AI Engineer sau 4 tháng',
      latestCvFileName: 'CV_Quan_2026.pdf',
      latestCvUpdatedAt: '2026-11-12',
      interviewCredits: 2,
      cvParsedData: {
        skills: ['Python', 'FastAPI'],
        projects: [
          {
            id: 'p1',
            name: 'Enterprise RAG Pipeline',
            role: 'Backend & AI Engineer',
            period: '2026',
            techStack: 'Python, FastAPI, pgvector',
            highlights: ['Xây dựng hệ thống tra cứu tài liệu nội bộ.'],
          },
        ],
        externalSkills: [],
      },
    },
    studentSkillStates: [],
    externalCvSkills: [],
  });

  assert.equal(hydrated.fullName, 'Trần Minh Quân');
  assert.equal(hydrated.headline, 'Học viên Kỹ sư AI Thực chiến');
  assert.equal(hydrated.careerObjective, 'Trở thành AI Engineer sau 4 tháng');
  assert.deepEqual(hydrated.skills, ['Python', 'FastAPI']);
  assert.equal(hydrated.projects.length, 1);

  const parsedFromPdf = mapParsedCvToStudentResume(
    {
      fullName: 'Quan Tran (PDF)',
      headline: 'Senior AI Engineer',
      skills: ['LangGraph & Multi-Agent'],
      projects: [
        {
          id: 'p2',
          name: 'Multi-Agent Orchestrator',
          role: 'Lead Developer',
          period: '2026',
          techStack: 'LangGraph, Redis',
          highlights: ['Điều phối tác tử AI.'],
        },
      ],
      externalSkills: [],
    },
    hydrated
  );

  const syncedResume = applySmartSyncSelection(hydrated, parsedFromPdf, {
    syncFullName: false,
    syncHeadline: true,
    syncCareerObjective: true,
    syncSkills: true,
    syncProjects: true,
    syncExperienceAndEdu: true,
  });

  assert.equal(syncedResume.fullName, 'Trần Minh Quân');
  assert.equal(syncedResume.headline, 'Senior AI Engineer');
  assert.ok(syncedResume.skills.includes('LangGraph & Multi-Agent'));
  assert.equal(syncedResume.projects.length, 2);
});

test('Frontend-Backend HTTP contract synchronization across all API modules', async () => {
  const capturedRequests: {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  }[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers || {});
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init?.body) {
      body = init.body;
    }
    capturedRequests.push({ url, method, headers, body });

    return new Response(
      JSON.stringify({
        success: true,
        data: { ok: true, url, method },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  try {
    setAuthAccessToken('jwt-test-token-123');
    assert.equal(getAuthAccessToken(), 'jwt-test-token-123');

    await authApi.login('user@3t.edu.vn', 'Password123');
    assert.equal(capturedRequests.at(-1)?.url, '/api/v1/auth/login');
    assert.equal(capturedRequests.at(-1)?.method, 'POST');
    assert.equal(
      capturedRequests.at(-1)?.headers.get('Authorization'),
      'Bearer jwt-test-token-123'
    );

    await authApi.getMe();
    assert.equal(capturedRequests.at(-1)?.url, '/api/v1/auth/me');
    assert.equal(capturedRequests.at(-1)?.method, 'GET');

    await catalogApi.getCourses({ category: 'AI & Dữ liệu', query: 'RAG' });
    assert.ok(capturedRequests.at(-1)?.url.startsWith('/api/v1/courses?'));

    await orderApi.createCohortOrder('cohort-ai-k01', 'idem-key-001');
    assert.equal(capturedRequests.at(-1)?.url, '/api/v1/orders');
    assert.equal(capturedRequests.at(-1)?.method, 'POST');
    assert.equal(
      capturedRequests.at(-1)?.headers.get('Idempotency-Key'),
      'idem-key-001'
    );
    assert.deepEqual(capturedRequests.at(-1)?.body, {
      cohortId: 'cohort-ai-k01',
      idempotencyKey: 'idem-key-001',
    });

    await learningApi.getCohortWorkspace('cohort-ai-k01');
    assert.equal(
      capturedRequests.at(-1)?.url,
      '/api/v1/cohorts/cohort-ai-k01/workspace'
    );

    await assessmentApi.submitAssessmentAttempt('quiz-01', { 1: 0, 2: 1 });
    assert.equal(
      capturedRequests.at(-1)?.url,
      '/api/v1/assessments/quiz-01/submit'
    );
    assert.deepEqual(capturedRequests.at(-1)?.body, {
      answers: { '1': 0, '2': 1 },
    });

    await profileInterviewApi.screenCvAgainstJd(
      'SENIOR',
      'AI Engineer',
      'Python, FastAPI, pgvector'
    );
    assert.equal(capturedRequests.at(-1)?.url, '/api/v1/interviews/screen-cv');
    assert.deepEqual(capturedRequests.at(-1)?.body, {
      targetLevel: 'SENIOR',
      targetRole: 'AI Engineer',
      jdRawText: 'Python, FastAPI, pgvector',
    });

    await teachApi.updateSessionSummary('sess-01', 'Tóm tắt buổi học');
    assert.equal(
      capturedRequests.at(-1)?.url,
      '/api/v1/teach/sessions/sess-01/materials'
    );
    assert.equal(capturedRequests.at(-1)?.method, 'PUT');

    await adminApi.getSepayTransactions();
    assert.equal(
      capturedRequests.at(-1)?.url,
      '/api/v1/admin/sepay-transactions'
    );

    setAuthAccessToken(null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
