import { httpRequest } from './apiClient';
import {
  CvParsedData,
  CvScreeningResult,
  InterviewEvaluationReport,
  StudentResumeData,
  StudentSkillStateRecord,
} from '../types/domain';

export type EnrolledSkillStateItem = StudentSkillStateRecord;

export interface ExternalCvSkillTagItem {
  name: string;
  note: string;
}

export interface ProfileAndSkillsResponse {
  userProfile: {
    userId?: string;
    fullName: string;
    avatarUrl?: string;
    headline: string;
    bio?: string;
    email: string;
    phone: string;
    githubUrl: string;
    linkedinUrl: string;
    careerObjective: string;
    careerGoal?: string;
    latestCvFileName: string;
    latestCvUpdatedAt: string;
    interviewCredits: number;
    cvParsedData: CvParsedData;
  };
  studentSkillStates: EnrolledSkillStateItem[];
  externalCvSkills: ExternalCvSkillTagItem[];
}

export interface UpdateMyProfilePayload {
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  bio: string;
  careerGoal: string;
}

export interface Round1CvScreeningResponse {
  interviewId: string;
  status: 'CV_SCREENING';
  creditDeducted: 0;
  availableCredits: number;
  cvScreeningResult: CvScreeningResult;
}

export const profileInterviewApi = {
  getMyProfileAndSkills: () =>
    httpRequest<ProfileAndSkillsResponse>('/me/profile-skills', {
      method: 'GET',
    }),

  updateMyProfile: (payload: UpdateMyProfilePayload) =>
    httpRequest<{
      success: boolean;
      userProfile: ProfileAndSkillsResponse['userProfile'];
    }>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadAndParseCv: (
    fileOrNameOrPayload: File | string | Partial<StudentResumeData>,
    resumeData?: Partial<StudentResumeData>
  ) => {
    const isFile =
      typeof File !== 'undefined' && fileOrNameOrPayload instanceof File
        ? true
        : typeof fileOrNameOrPayload === 'object' &&
          fileOrNameOrPayload !== null &&
          'name' in fileOrNameOrPayload &&
          typeof (fileOrNameOrPayload as File).name === 'string' &&
          'size' in fileOrNameOrPayload;

    const isResumePayloadObject =
      typeof fileOrNameOrPayload === 'object' &&
      fileOrNameOrPayload !== null &&
      !isFile;

    const fileName =
      typeof fileOrNameOrPayload === 'string'
        ? fileOrNameOrPayload
        : isFile
        ? (fileOrNameOrPayload as File).name
        : 'CV_Ho_So_Nang_Luc_2026.pdf';

    const size = isFile ? (fileOrNameOrPayload as File).size : 245000;
    const effectiveResumeData = isResumePayloadObject
      ? (fileOrNameOrPayload as Partial<StudentResumeData>)
      : resumeData;

    // When a real File is uploaded without manual override, send multipart/form-data (FormData)
    if (isFile && !effectiveResumeData && typeof FormData !== 'undefined') {
      const formData = new FormData();
      formData.append('file', fileOrNameOrPayload as File);
      formData.append('fileName', fileName);
      formData.append('size', String(size));
      formData.append('mode', 'PARSE_PDF');
      return httpRequest<{
        fileName: string;
        updatedAt: string;
        cvParsedData: CvParsedData;
      }>('/me/cv/upload', {
        method: 'POST',
        body: formData,
      });
    }

    return httpRequest<{
      fileName: string;
      updatedAt: string;
      cvParsedData: CvParsedData;
    }>('/me/cv/upload', {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        size,
        mode: effectiveResumeData ? 'SAVE_RESUME' : 'PARSE_PDF',
        resumeData: effectiveResumeData,
      }),
    });
  },

  screenCvAgainstJd: (
    targetLevel: 'INTERN' | 'FRESHER' | 'JUNIOR' | 'SENIOR' | string,
    targetRole: string,
    jdRawText: string,
    scenarioMode?: 'READY_78' | 'MISSING_COURSE_45'
  ) => {
    const normalizedLevel =
      targetLevel === 'MIDDLE_SENIOR' ? 'SENIOR' : targetLevel;
    return httpRequest<Round1CvScreeningResponse>('/interviews/screen-cv', {
      method: 'POST',
      body: JSON.stringify({
        targetLevel: normalizedLevel,
        targetRole,
        jdRawText,
        ...(scenarioMode ? { scenarioMode } : {}),
      }),
    });
  },

  startVoiceInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      status: 'IN_PROGRESS';
      startedAt: string;
      stageTag?: string;
      questionText?: string;
      interviewerName?: string;
      interviewerTitle?: string;
    }>(`/interviews/${encodeURIComponent(interviewId)}/start`, {
      method: 'POST',
    }),

  sendVoiceTurn: (interviewId: string, userTranscriptText: string, turnIndex?: number) =>
    httpRequest<{
      interviewId: string;
      recordedTranscript: string;
      acknowledged: boolean;
      turnEvaluation?: string;
      betterAnswerTip?: string;
      nextStageTag?: string;
      nextQuestionText?: string;
      isCompleted?: boolean;
    }>(`/interviews/${encodeURIComponent(interviewId)}/turn`, {
      method: 'POST',
      body: JSON.stringify({ transcript: userTranscriptText, turnIndex }),
    }),

  completeInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      status: 'COMPLETED';
      creditDeducted: 1;
      remainingCredits: number;
      evaluationReport: InterviewEvaluationReport;
    }>(`/interviews/${encodeURIComponent(interviewId)}/complete`, {
      method: 'POST',
    }),

  cancelDraftInterview: (interviewId: string) =>
    httpRequest<{
      interviewId: string;
      deleted: true;
      creditDeducted: 0;
    }>(`/interviews/${encodeURIComponent(interviewId)}`, {
      method: 'DELETE',
    }),
};

export const profileAndInterviewApi = profileInterviewApi;
