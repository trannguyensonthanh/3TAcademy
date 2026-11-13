import { httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  CohortScheduleSlot,
  CertificateRecord,
  PaymentTransactionRecord,
  UserRole,
  Enrollment,
  ChatMessage,
  Notification,
} from '../types/domain';

export interface AdminUserAccountItem {
  id: string;
  fullName: string;
  email: string;
  roleCategory: 'Học viên' | 'Giảng viên' | 'Quản trị viên';
  roleDetail: string;
  cohortAssigned: string;
  locked: boolean;
  avatarUrl?: string;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
  instructorHeadline?: string;
  instructorOrganization?: string;
  instructorYearsOfExperience?: number;
  instructorExpertiseSummaryMd?: string;
}

export interface CreateAccountPayload {
  email: string;
  password: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  fullName: string;
  avatarUrl?: string;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
  instructorHeadline?: string;
  instructorOrganization?: string;
  instructorYearsOfExperience?: number;
  instructorExpertiseSummaryMd?: string;
  instructorSocialLinks?: {
    linkedin?: string;
    github?: string;
    website?: string;
  };
}

export interface EligibleGraduateItem {
  id: string;
  studentName: string;
  studentEmail: string;
  cohortCode: string;
  courseTitle: string;
  completedSessionsText: string;
  finalExamScore: number;
  issuedCertCode?: string;
}

export interface AdminOverviewResponse {
  totalRevenueVnd: number;
  activeCohortsCount: number;
  totalStudentsCount: number;
  issuedCertificatesCount: number;
  cohorts: Cohort[];
  certificates: Record<string, CertificateRecord>;
  enrollments: Enrollment[];
  chatMessages: ChatMessage[];
  notifications: Notification[];
  accounts: AdminUserAccountItem[];
  eligibleGraduates: EligibleGraduateItem[];
}

export const adminApi = {
  getAdminOverview: () =>
    httpRequest<AdminOverviewResponse>('/admin/overview', {
      method: 'GET',
    }),

  manageCourses: (payload: Partial<Course> & { versionId?: string }) =>
    httpRequest<{ courseId: string; status: 'SAVED'; course: Partial<Course> }>(
      '/admin/courses',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  manageCohorts: (payload: {
    cohortId?: string;
    courseId: string;
    instructorId: string;
    curriculumVersion: string;
    code: string;
    name: string;
    tuitionVnd: number;
    startDate: string;
    scheduleSlots: CohortScheduleSlot[];
    instructorName?: string;
  }) =>
    httpRequest<{
      cohortId: string;
      status: 'CREATED' | 'UPDATED';
      instructorId: string;
      curriculumVersion: string;
      scheduleSlots: CohortScheduleSlot[];
      cohort?: Cohort;
      payload: typeof payload;
    }>('/admin/cohorts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  manageUsers: (payload: {
    userId: string;
    role: UserRole;
    isActive?: boolean;
    fullName?: string;
    email?: string;
    roleDetail?: string;
    cohortAssigned?: string;
  }) =>
    httpRequest<{
      userId: string;
      role: UserRole;
      isActive?: boolean;
      updated: boolean;
      account?: AdminUserAccountItem;
    }>('/admin/users', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  createAccount: (payload: CreateAccountPayload) =>
    httpRequest<{
      success: boolean;
      account: AdminUserAccountItem;
    }>('/admin/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSepayTransactions: () =>
    httpRequest<PaymentTransactionRecord[]>('/admin/sepay-transactions', {
      method: 'GET',
    }),

  issueCertificatesBatch: (enrollmentIds: string[]) =>
    httpRequest<{
      issuedCount: number;
      certificateCodes: string[];
      issuedCertificates?: Record<string, CertificateRecord>;
      bonusInterviewCreditsAdded: number;
    }>('/admin/certificates/issue', {
      method: 'POST',
      body: JSON.stringify({ enrollmentIds }),
    }),

  toggleCertificateRevoke: (certificateCode: string) =>
    httpRequest<{
      certificateCode: string;
      isRevoked: boolean;
      certificate: CertificateRecord;
    }>(`/admin/certificates/${encodeURIComponent(certificateCode)}/revoke`, {
      method: 'PUT',
    }),
};
