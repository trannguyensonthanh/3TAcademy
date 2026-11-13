import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  authApi,
  catalogApi,
  orderApi,
  learningApi,
  assessmentApi,
  profileInterviewApi,
  teachApi,
  adminApi,
} from './index';
import {
  INITIAL_COHORTS,
  INITIAL_CLASS_SESSIONS,
  INITIAL_USER_PROFILES,
  INITIAL_PAYMENT_TRANSACTIONS,
  INITIAL_ASSESSMENTS,
  INITIAL_MOCK_INTERVIEWS,
  INITIAL_ENROLLMENTS,
  INITIAL_CHAT_MESSAGES,
  INITIAL_NOTIFICATIONS,
} from '../data/mockDatabase';

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
    const filePath = path.resolve(process.cwd(), 'src/services', fileName);
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
  }
});

test('mockDatabase.ts aligns 100% with latest PostgreSQL schema', () => {
  // 1. Cohorts: instructorId, curriculumVersion & scheduleSlots (JSONB), no TA role
  for (const cohort of INITIAL_COHORTS) {
    assert.ok(cohort.instructorId, 'cohort must have instructorId');
    assert.ok(cohort.curriculumVersion, 'cohort must have curriculumVersion');
    assert.ok(
      Array.isArray(cohort.scheduleSlots) && cohort.scheduleSlots.length >= 1,
      'cohort must have scheduleSlots array'
    );
    for (const slot of cohort.scheduleSlots) {
      assert.ok([0, 1, 2, 3, 4, 5, 6].includes(slot.dayOfWeek));
      assert.match(slot.startTime, /^\d{2}:\d{2}$/);
      assert.match(slot.endTime, /^\d{2}:\d{2}$/);
    }
    assert.equal('schedule_text' in cohort, false);
    for (const key of Object.keys(cohort)) {
      assert.notEqual(key.toLowerCase(), 'scheduletext');
    }
    for (const member of cohort.staff) {
      assert.equal(member.role, 'INSTRUCTOR');
    }
  }

  // 2. ClassSessions: videoR2Key & videoProvider, no legacy fields
  for (const session of INITIAL_CLASS_SESSIONS) {
    assert.ok(session.videoR2Key.length > 0);
    assert.ok(
      session.videoProvider === 'R2_HLS_AES128' ||
        session.videoProvider === 'BUNNY_STREAM'
    );
    assert.equal('isFreePreview' in session, false);
    assert.equal('externalYoutubeId' in session, false);
    assert.equal('hlsAesKeyHex' in session, false);
  }

  // 3. UserProfiles: cvParsedData & interviewCredits, no cvReviewFeedback
  for (const profile of INITIAL_USER_PROFILES) {
    assert.ok(profile.cvParsedData);
    assert.equal(typeof profile.interviewCredits, 'number');
    assert.equal('cvReviewFeedback' in profile, false);
    assert.ok(['STUDENT', 'INSTRUCTOR', 'ADMIN'].includes(profile.role));
  }

  // 4. PaymentTransactions: orderId (nullable), gateway: 'SEPAY_VIETQR', matchStatus
  assert.ok(INITIAL_PAYMENT_TRANSACTIONS.some((tx) => tx.orderId === null));
  for (const tx of INITIAL_PAYMENT_TRANSACTIONS) {
    assert.equal(tx.gateway, 'SEPAY_VIETQR');
    assert.ok(
      ['MATCHED', 'UNMATCHED_ORDER', 'AMOUNT_MISMATCH'].includes(tx.matchStatus)
    );
  }

  // 5. Assessments: status ('DRAFT' | 'PUBLISHED')
  assert.ok(INITIAL_ASSESSMENTS.some((a) => a.status === 'DRAFT'));
  assert.ok(INITIAL_ASSESSMENTS.some((a) => a.status === 'PUBLISHED'));

  // 6. MockInterviews: targetLevel, targetRole, jdRawText, cvScreeningResult, transcriptLog, evaluationReport, status
  for (const intv of INITIAL_MOCK_INTERVIEWS) {
    assert.ok(['INTERN', 'FRESHER', 'JUNIOR', 'SENIOR'].includes(intv.targetLevel));
    assert.ok(intv.targetRole.length > 0);
    assert.ok(intv.jdRawText.length > 0);
    assert.ok(intv.cvScreeningResult.layoutAndPresentationFeedback.length > 0);
    assert.ok(intv.cvScreeningResult.jdMatchEvaluation.length > 0);
    assert.ok(Array.isArray(intv.transcriptLog));
    assert.ok(
      ['CV_SCREENING', 'IN_PROGRESS', 'COMPLETED'].includes(intv.status)
    );
  }

  // 7. Enrollments: dropoutRiskScore (0.0 - 1.0) & riskLevel ('LOW' | 'MEDIUM' | 'HIGH')
  assert.ok(INITIAL_ENROLLMENTS.length >= 6);
  assert.ok(INITIAL_ENROLLMENTS.some((e) => e.riskLevel === 'HIGH'));
  for (const enr of INITIAL_ENROLLMENTS) {
    assert.ok(enr.dropoutRiskScore >= 0 && enr.dropoutRiskScore <= 1);
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(enr.riskLevel));
  }

  // 8. ChatMessages: detectedTopic (string | null)
  assert.ok(INITIAL_CHAT_MESSAGES.length >= 6);
  assert.ok(
    INITIAL_CHAT_MESSAGES.some((m) => m.detectedTopic === 'RAG & Vector Search')
  );
  for (const msg of INITIAL_CHAT_MESSAGES) {
    assert.ok('detectedTopic' in msg);
  }

  // 9. Notifications: actedAt (string | null)
  assert.ok(INITIAL_NOTIFICATIONS.length >= 5);
  assert.ok(INITIAL_NOTIFICATIONS.some((n) => n.actedAt !== null));
  assert.ok(INITIAL_NOTIFICATIONS.some((n) => n.actedAt === null));
});

test('Modular API services execute end-to-end via handleMockRequest', async () => {
  // Auth
  const loginRes = await authApi.login('an.nguyen.dev@gmail.com', 'secret');
  assert.equal(loginRes.user.role, 'STUDENT');

  // Catalog
  const courses = await catalogApi.getCourses({ query: 'AI' });
  assert.ok(courses.length >= 1);

  // Order & SePay
  const order = await orderApi.createCohortOrder('cohort-ai-k01', 'idem-01');
  assert.equal(order.orderCode, 'ET20268891');
  const webhook = await orderApi.simulateSepayWebhook(order.orderCode);
  assert.equal(webhook.status, 'PAID');
  assert.equal(webhook.gateway, 'SEPAY_VIETQR');

  // Learning
  const dashboard = await learningApi.getStudentDashboard();
  assert.ok(dashboard.liveSession.id);

  // Assessment (10 questions for session quiz, 25 for final exam, hidden correctIndex)
  const quiz = await assessmentApi.getAssessmentForStudent('quiz-sess-ai-04');
  assert.equal(quiz.questionCount, 10);
  assert.equal('correctIndex' in (quiz.promptConfig[0] as any), false);

  const finalExam = await assessmentApi.getAssessmentForStudent(
    'final-exam-cohort-ai-k01'
  );
  assert.equal(finalExam.questionCount, 25);

  // Profile & 2-Round Interview
  const profileSkills = await profileInterviewApi.getMyProfileAndSkills();
  assert.equal(profileSkills.studentSkillStates.length, 9);

  const round1 = await profileInterviewApi.screenCvAgainstJd(
    'FRESHER',
    'AI Engineer',
    'Yêu cầu Python, FastAPI, PostgreSQL pgvector, RAG',
    'READY_78'
  );
  assert.equal(round1.creditDeducted, 0);
  assert.equal(round1.cvScreeningResult.matchPercent, 78);
  assert.ok(round1.cvScreeningResult.layoutAndPresentationFeedback.length > 10);
  assert.ok(round1.cvScreeningResult.jdMatchEvaluation.length > 10);

  await profileInterviewApi.startVoiceInterview(round1.interviewId);
  await profileInterviewApi.sendVoiceTurn(
    round1.interviewId,
    'Em dùng bộ đọc cấu trúc bảng biểu Markdown kèm tiêu đề cột.'
  );
  const cancelled = await profileInterviewApi.cancelDraftInterview(
    round1.interviewId
  );
  assert.equal(cancelled.deleted, true);
  assert.equal(cancelled.creditDeducted, 0);

  // Teach & Admin
  const generatedQuiz = await teachApi.generateSessionQuizByAi('sess-ai-05');
  assert.equal(generatedQuiz.status, 'DRAFT');
  assert.equal(generatedQuiz.items.length, 10);

  const publishedQuiz = await teachApi.publishAssessment(
    generatedQuiz.assessmentId,
    generatedQuiz.items
  );
  assert.equal(publishedQuiz.status, 'PUBLISHED');

  const reminderRes = await teachApi.sendAiPersonalizedReminder('enr-k01-03');
  assert.equal(reminderRes.type, 'AI_STUDY_REMINDER');
  assert.ok(reminderRes.notificationId.startsWith('notif-ai-'));

  const sepayTxs = await adminApi.getSepayTransactions();
  assert.ok(sepayTxs.length >= 3);

  const adminOverview = await adminApi.getAdminOverview();
  assert.ok(adminOverview.totalRevenueVnd > 0);
  assert.ok(adminOverview.accounts.length >= 3);
  assert.ok(adminOverview.eligibleGraduates.length >= 2);

  // Admin Account Creation (Database schema: accounts, user_profiles, instructor_profiles)
  const createdStudent = await adminApi.createAccount({
    email: 'new.student@3tacademy.vn',
    password: 'Password@123',
    role: 'STUDENT',
    fullName: 'Lê Văn Hoàng',
    careerGoal: 'Kỹ sư AI Thực chiến',
    interviewCredits: 3,
  });
  assert.equal(createdStudent.success, true);
  assert.equal(createdStudent.account.roleCategory, 'Học viên');
  assert.equal(createdStudent.account.fullName, 'Lê Văn Hoàng');
  assert.equal(createdStudent.account.cohortAssigned, 'Chưa phân công lớp');

  const createdInstructor = await adminApi.createAccount({
    email: 'new.instructor@3tacademy.vn',
    password: 'Password@123',
    role: 'INSTRUCTOR',
    fullName: 'TS. Phan Thanh Bình',
    instructorHeadline: 'Chuyên gia Thị giác Máy tính & Deep Learning',
    instructorOrganization: 'Viện Công nghệ Tiên tiến',
    instructorYearsOfExperience: 9,
  });
  assert.equal(createdInstructor.success, true);
  assert.equal(createdInstructor.account.roleCategory, 'Giảng viên');
  assert.equal(createdInstructor.account.cohortAssigned, 'Chưa phân công lớp');
  assert.equal(
    createdInstructor.account.instructorHeadline,
    'Chuyên gia Thị giác Máy tính & Deep Learning'
  );

  await assert.rejects(
    async () => {
      await adminApi.createAccount({
        email: 'invalid.inst@3tacademy.vn',
        password: 'pass',
        role: 'INSTRUCTOR',
        fullName: 'Thiếu Headline',
      });
    },
    /Tiêu đề chuyên môn của Giảng viên không được để trống/
  );
});

test('Zero files in src/views, src/components, or src/context import mockDatabase or phase2QuizBank', () => {
  const dirsToScan = [
    path.resolve(process.cwd(), 'src/views'),
    path.resolve(process.cwd(), 'src/components'),
    path.resolve(process.cwd(), 'src/context'),
  ];

  for (const dir of dirsToScan) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
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
      }
    }
  }
});

test('Personal certificate lookup privacy: allows own certificate and blocks other students certificates', async () => {
  // 1. Own certificate (Nguyễn Văn An — CERT-3T-2026-8891)
  const ownResult = await catalogApi.verifyCertificate('CERT-3T-2026-8891');
  assert.equal(ownResult.found, true);
  assert.equal(ownResult.accessDenied, false);
  assert.equal(ownResult.isOwner, true);
  assert.ok(ownResult.certificate);
  assert.equal(ownResult.certificate?.studentName, 'Nguyễn Văn An');

  // 2. Another student's certificate (Lê Hoàng Mai — CERT-3T-2026-8892) must be blocked
  const otherStudentResult = await catalogApi.verifyCertificate('CERT-3T-2026-8892');
  assert.equal(otherStudentResult.found, false);
  assert.equal(otherStudentResult.accessDenied, true);
  assert.equal(otherStudentResult.isOwner, false);
  assert.equal(otherStudentResult.errorCode, 'FORBIDDEN_OTHER_STUDENT');
  assert.equal(otherStudentResult.certificate, null);

  // 3. Client certificates map only exposes own certificates
  const myCertsMap = await catalogApi.getCertificates();
  const certCodes = Object.keys(myCertsMap);
  assert.ok(certCodes.includes('CERT-3T-2026-8891'));
  assert.equal(certCodes.includes('CERT-3T-2026-8892'), false);
  assert.equal(certCodes.includes('CERT-3T-2026-9901'), false);
});

test('6-block Resume Builder hydration, Smart Sync selection, and Backend save', async () => {
  const {
    mapApiProfileToStudentResume,
    mapParsedCvToStudentResume,
    applySmartSyncSelection,
  } = await import('../components/StudentProfileCvWorkspace');

  // 1. Hydrate existing CV from getMyProfileAndSkills()
  const initialRes = await profileInterviewApi.getMyProfileAndSkills();
  const hydrated = mapApiProfileToStudentResume(initialRes);
  assert.equal(hydrated.fullName, 'Nguyễn Văn An');
  assert.ok(hydrated.skills.length >= 5);
  assert.ok(hydrated.projects.length >= 2);
  assert.ok(hydrated.workExperience.length >= 2);
  assert.ok(hydrated.education.length >= 1);
  assert.ok(hydrated.awardsAndCerts.length >= 2);

  // 2. Upload PDF CV in PARSE_PDF mode -> does NOT overwrite backend profile before confirmation
  const parseRes = await profileInterviewApi.uploadAndParseCv('CV_New_Upload_2026.pdf');
  const parsedFromPdf = mapParsedCvToStudentResume(parseRes.cvParsedData, hydrated);
  assert.ok(parsedFromPdf.fullName.includes('An Nguyen'));
  assert.ok(parsedFromPdf.skills.includes('LangGraph & Multi-Agent'));

  const beforeConfirmRes = await profileInterviewApi.getMyProfileAndSkills();
  assert.equal(beforeConfirmRes.userProfile.fullName, 'Nguyễn Văn An');

  // 3. Apply Smart Sync with default checkboxes (syncFullName: false, others: true)
  const syncedResume = applySmartSyncSelection(hydrated, parsedFromPdf, {
    syncFullName: false,
    syncHeadline: true,
    syncCareerObjective: true,
    syncSkills: true,
    syncProjects: true,
    syncExperienceAndEdu: true,
  });
  assert.equal(syncedResume.fullName, 'Nguyễn Văn An'); // Preserved real name for certificate
  assert.equal(syncedResume.headline, parsedFromPdf.headline);
  assert.ok(syncedResume.skills.includes('LangGraph & Multi-Agent'));
  assert.ok(syncedResume.projects.length > hydrated.projects.length);

  // 4. Save synced resume to backend
  await profileInterviewApi.uploadAndParseCv('CV_New_Upload_2026.pdf', syncedResume);
  const afterSaveRes = await profileInterviewApi.getMyProfileAndSkills();
  assert.equal(afterSaveRes.userProfile.fullName, 'Nguyễn Văn An');
  assert.equal(afterSaveRes.userProfile.headline, parsedFromPdf.headline);
  assert.ok(afterSaveRes.userProfile.cvParsedData.skills?.includes('LangGraph & Multi-Agent'));

  // 5. Empty CV hydration for newly registered account
  const emptyHydrated = mapApiProfileToStudentResume({
    userProfile: {
      fullName: 'Trần Minh Quân',
      headline: '',
      bio: 'Học viên Kỹ sư AI Thực chiến',
      email: 'quan.tran@gmail.com',
      phone: '',
      githubUrl: '',
      linkedinUrl: '',
      careerObjective: '',
      careerGoal: 'Trở thành AI Engineer sau 4 tháng',
      latestCvFileName: 'Chưa tải lên file CV',
      latestCvUpdatedAt: 'Chưa cập nhật',
      interviewCredits: 2,
      cvParsedData: { projects: [], externalSkills: [] },
    },
    studentSkillStates: [],
    externalCvSkills: [],
  });
  assert.equal(emptyHydrated.fullName, 'Trần Minh Quân');
  assert.equal(emptyHydrated.headline, 'Học viên Kỹ sư AI Thực chiến');
  assert.equal(emptyHydrated.careerObjective, 'Trở thành AI Engineer sau 4 tháng');
  assert.deepEqual(emptyHydrated.skills, []);
  assert.deepEqual(emptyHydrated.projects, []);
  assert.deepEqual(emptyHydrated.workExperience, []);
  assert.deepEqual(emptyHydrated.education, []);
  assert.deepEqual(emptyHydrated.awardsAndCerts, []);
});

test('1:1 SQL Schema alignment: CourseCategoryItem optional iconName, single INSTRUCTOR on Cohort, and VARCHAR(120) curriculumVersion', async () => {
  const categories = await catalogApi.getCategories();
  assert.ok(categories.length >= 3);
  for (const cat of categories) {
    assert.ok(cat.id);
    assert.ok(cat.name);
    assert.equal(cat.iconName ?? null, null);
  }

  const longCurriculumVersion =
    'Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới dành cho Khóa K02 & K03)';
  const createdCohortRes = await adminApi.manageCohorts({
    courseId: 'course-ai-eng',
    instructorId: 'usr-inst-khoa',
    curriculumVersion: longCurriculumVersion,
    code: 'AI-ENG-2026-K09',
    name: 'Khóa K09 — Kiểm thử Schema 1:1',
    tuitionVnd: 8900000,
    startDate: '20/12/2026',
    scheduleSlots: [
      { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
      { dayOfWeek: 6, startTime: '19:30', endTime: '21:30' },
    ],
    instructorName: 'TS. Trần Minh Khoa',
  });
  assert.equal(createdCohortRes.status, 'CREATED');
  assert.equal(createdCohortRes.curriculumVersion, longCurriculumVersion);
  assert.ok(createdCohortRes.cohort);
  assert.equal(createdCohortRes.cohort?.curriculumVersion, longCurriculumVersion);
  assert.equal(createdCohortRes.cohort?.staff.length, 1);
  assert.equal(createdCohortRes.cohort?.staff[0].role, 'INSTRUCTOR');
});

test('Real business flows: Livestream Chat, Guest Speaker Verification, Session Chapters/AI History, Advisor Cohort Codes & Dynamic Interview Turns', async () => {
  // 1. Advisor returns recommendedCohortCodes
  const advisorRes = await catalogApi.askCareerAdvisor('AI_ENGINEER', 'Biết Python cơ bản');
  assert.ok(Array.isArray(advisorRes.recommendedCohortCodes));
  assert.ok((advisorRes.recommendedCohortCodes?.length ?? 0) >= 1);

  // 2. Session detail returns dynamic chapters and aiChatHistory
  const sessionDetail = await learningApi.getSessionDetail('cohort-ai-k01', 'sess-ai-04');
  assert.ok(Array.isArray(sessionDetail.chapters) && sessionDetail.chapters.length >= 2);
  assert.ok(Array.isArray(sessionDetail.aiChatHistory) && sessionDetail.aiChatHistory.length >= 1);

  // 3. Livestream Chat GET & POST
  const initialLiveChat = await learningApi.getLiveSessionChat('sess-ai-05');
  assert.ok(initialLiveChat.length >= 2);
  const sentChat = await learningApi.sendLiveSessionChat(
    'sess-ai-05',
    'Em đã chạy thử thành công truy vấn Hybrid Search trên máy cá nhân ạ!'
  );
  assert.ok(sentChat.senderName.length > 0);
  assert.equal(
    sentChat.text,
    'Em đã chạy thử thành công truy vấn Hybrid Search trên máy cá nhân ạ!'
  );
  const updatedLiveChat = await learningApi.getLiveSessionChat('sess-ai-05');
  assert.ok(updatedLiveChat.length >= initialLiveChat.length + 1);

  // 4. Guest speaker token verification
  const verifiedGuest = await learningApi.verifyGuestSpeakerToken(
    'guest-token-k01-live',
    'sess-ai-05'
  );
  assert.equal(verifiedGuest.valid, true);
  assert.ok(verifiedGuest.sessionTitle.length > 0);

  // 5. Dynamic Voice Interview start & turn progression
  const screening = await profileInterviewApi.screenCvAgainstJd(
    'FRESHER',
    'AI Engineer',
    'Python, FastAPI, PostgreSQL pgvector',
    'READY_78'
  );
  const started = await profileInterviewApi.startVoiceInterview(screening.interviewId);
  assert.ok(started.questionText && started.questionText.length > 10);
  assert.ok(started.stageTag && started.stageTag.includes('Câu 1'));

  const turn1 = await profileInterviewApi.sendVoiceTurn(
    screening.interviewId,
    'Dạ em dùng Docling nhận diện bảng biểu sang Markdown kèm số trang gốc.'
  );
  assert.equal(turn1.acknowledged, true);
  assert.ok(turn1.nextQuestionText && turn1.nextQuestionText.length > 10);
  assert.equal(turn1.isCompleted, false);

  // 6. Registration -> Onboarding Profile & Career Setup (PUT /me/profile) -> Profile & CV Sync
  const regRes = await authApi.register(
    'Phạm Minh Tuấn',
    'tuan.pham.ai@3tacademy.vn',
    '3TAcademy@2026'
  );
  assert.equal(regRes.user.fullName, 'Phạm Minh Tuấn');
  assert.equal(regRes.user.role, 'STUDENT');
  assert.equal(regRes.isNewUser, true);

  const updatedProfileRes = await profileInterviewApi.updateMyProfile({
    fullName: 'Phạm Minh Tuấn',
    avatarUrl: 'data:image/svg+xml;utf8,test-avatar',
    phone: '0912 345 678',
    bio: 'Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI',
    careerGoal: 'AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning.',
  });
  assert.equal(updatedProfileRes.success, true);
  assert.equal(updatedProfileRes.userProfile.fullName, 'Phạm Minh Tuấn');
  assert.equal(updatedProfileRes.userProfile.avatarUrl, 'data:image/svg+xml;utf8,test-avatar');
  assert.equal(updatedProfileRes.userProfile.phone, '0912 345 678');
  assert.equal(
    updatedProfileRes.userProfile.bio,
    'Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI'
  );
  assert.equal(
    updatedProfileRes.userProfile.careerGoal,
    'AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning.'
  );

  const hydratedProfile = await profileInterviewApi.getMyProfileAndSkills();
  assert.equal(hydratedProfile.userProfile.fullName, 'Phạm Minh Tuấn');
  assert.equal(hydratedProfile.userProfile.phone, '0912 345 678');
  assert.equal(
    hydratedProfile.userProfile.headline,
    'Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI'
  );
  assert.equal(
    hydratedProfile.userProfile.careerObjective,
    'AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning.'
  );
});



