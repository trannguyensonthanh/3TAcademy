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
}

export interface AuthSessionResponse {
  accessToken: string;
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

  getMe: () =>
    httpRequest<AuthUserProfile>('/auth/me', {
      method: 'GET',
    }),

  logout: () =>
    httpRequest<{ success: boolean; loggedOutAt: string }>('/auth/logout', {
      method: 'POST',
    }),
};
