import { httpRequest } from './apiClient';
import {
  Course,
  Cohort,
  CourseSkill,
  CertificateRecord,
  CourseCategoryItem,
} from '../types/domain';

export interface CatalogFilters {
  category?: string;
  level?: string;
  query?: string;
}

export interface CourseDetailWithCohortsResponse {
  course: Course;
  cohorts: Cohort[];
  syllabusTemplate: {
    version: string;
    totalWeeks: number;
    sessionsPerWeek: number;
    modules: Course['syllabusTemplate'];
  };
}

export interface AcademyFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const catalogApi = {
  getCategories: () =>
    httpRequest<CourseCategoryItem[]>('/categories', {
      method: 'GET',
    }),

  getSkills: () =>
    httpRequest<CourseSkill[]>('/skills', {
      method: 'GET',
    }),

  getCourses: (filters?: CatalogFilters) =>
    httpRequest<Course[]>(
      `/courses?category=${encodeURIComponent(filters?.category || '')}&level=${encodeURIComponent(
        filters?.level || ''
      )}&q=${encodeURIComponent(filters?.query || '')}`,
      { method: 'GET' }
    ),

  getCohorts: () =>
    httpRequest<Cohort[]>('/cohorts', {
      method: 'GET',
    }),

  getFaqs: () =>
    httpRequest<AcademyFaqItem[]>('/faqs', {
      method: 'GET',
    }),

  getCertificates: () =>
    httpRequest<Record<string, CertificateRecord>>('/certificates', {
      method: 'GET',
    }),

  getCourseBySlug: (slug: string) =>
    httpRequest<CourseDetailWithCohortsResponse>(`/courses/${encodeURIComponent(slug)}`, {
      method: 'GET',
    }),

  askPublicAdvisor: (goal: string, background?: string) =>
    httpRequest<{
      replyText: string;
      recommendedCourseSlug: string;
      recommendedCohortId: string;
      recommendedCohortCodes?: string[];
    }>('/advisor/ask', {
      method: 'POST',
      body: JSON.stringify({ goal, background }),
    }),

  askCareerAdvisor: (goal: string, background?: string) =>
    httpRequest<{
      replyText: string;
      recommendedCourseSlug: string;
      recommendedCohortId: string;
      recommendedCohortCodes?: string[];
    }>('/advisor/ask', {
      method: 'POST',
      body: JSON.stringify({ goal, background }),
    }),

  verifyCertificateByCode: (code: string) =>
    httpRequest<{
      found: boolean;
      accessDenied?: boolean;
      isOwner?: boolean;
      errorCode?: 'FORBIDDEN_OTHER_STUDENT' | 'NOT_FOUND';
      message?: string;
      certificate: CertificateRecord | null;
    }>(
      `/certificates/verify/${encodeURIComponent(code)}`,
      { method: 'GET' }
    ),

  verifyCertificate: (code: string) =>
    httpRequest<{
      found: boolean;
      accessDenied?: boolean;
      isOwner?: boolean;
      errorCode?: 'FORBIDDEN_OTHER_STUDENT' | 'NOT_FOUND';
      message?: string;
      certificate: CertificateRecord | null;
    }>(
      `/certificates/verify/${encodeURIComponent(code)}`,
      { method: 'GET' }
    ),
};
