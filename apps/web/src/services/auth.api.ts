import { httpRequest } from './apiClient';
import { AppRole } from '../types/domain';

export interface AuthUserProfile {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  careerGoal?: string;
  interviewCredits?: number;
}

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUserProfile;
  isNewUser?: boolean;
}

export const authApi = {
  login: (email: string, password?: string) =>
    httpRequest<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (fullName: string, email: string, password?: string) =>
    httpRequest<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password }),
    }),

  googleAuth: (idToken: string) =>
    httpRequest<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  googleLogin: (idToken: string) =>
    httpRequest<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  getMe: async (): Promise<AuthUserProfile> => {
    const res = await httpRequest<AuthUserProfile | { user: AuthUserProfile }>('/auth/me', {
      method: 'GET',
    });
    if (res && typeof res === 'object' && 'user' in res && res.user) {
      return res.user;
    }
    return res as AuthUserProfile;
  },

  logout: () =>
    httpRequest<{ success: boolean; loggedOutAt: string }>('/auth/logout', {
      method: 'POST',
    }),
};
