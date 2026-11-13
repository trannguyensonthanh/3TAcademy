import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { evaluatePasswordStrength } from '../utils/academyLogic';
import { CompetencyVerifiedShield } from '../components/BotanicalStickers';
import { authApi } from '../services/auth.api';
import { setAuthAccessToken } from '../services/apiClient';

export const AuthView: React.FC<{ initialMode: 'LOGIN' | 'REGISTER' }> = ({
  initialMode,
}) => {
  const { setRole, setCurrentUser, navigate } = useAcademy();
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const strength = evaluatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ Email hợp lệ.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }
    setErrorMsg(null);

    try {
      if (mode === 'REGISTER') {
        const res = await authApi.register(fullName, email, password);
        if (res.accessToken) {
          setAuthAccessToken(res.accessToken);
        }
        if (res.user) {
          setCurrentUser(res.user);
        }
        setRole(res.user.role || 'STUDENT');
        navigate('/onboarding');
      } else {
        const res = await authApi.login(email, password);
        if (res.accessToken) {
          setAuthAccessToken(res.accessToken);
        }
        if (res.user) {
          setCurrentUser(res.user);
        }
        const userRole = res.user.role || 'STUDENT';
        setRole(userRole);
        if (userRole === 'INSTRUCTOR') {
          navigate('/teach');
        } else if (userRole === 'ADMIN') {
          navigate('/admin');
        } else {
          navigate('/app');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng nhập / đăng ký thất bại. Vui lòng kiểm tra lại thông tin.');
    }
  };

  const handleGoogleOneTap = async () => {
    setErrorMsg(null);
    try {
      const idToken = 'google-oauth-id-token';
      const res = await authApi.googleLogin(idToken);
      if (res.accessToken) {
        setAuthAccessToken(res.accessToken);
      }
      if (res.user) {
        setCurrentUser(res.user);
      }
      const nextRole = res.user?.role || 'STUDENT';
      setRole(nextRole);
      if (nextRole === 'INSTRUCTOR') {
        navigate('/teach');
      } else if (nextRole === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/onboarding');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Xác thực Google OAuth không thành công.');
    }
  };

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-sm">
        {/* Left 5 Columns: Botanical Editorial Brand Panel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#D1FAE5]/80 via-[#F7FBF9] to-white dark:from-emerald-950/80 dark:via-[#111A15] dark:to-[#090F0C] p-8 flex flex-col justify-between space-y-8 border-b lg:border-b-0 lg:border-r border-[#E2ECE7] dark:border-[#1E2D24]">
          <div className="space-y-4">
            <CompetencyVerifiedShield className="w-12 h-12" />
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
              Hệ Sinh Thái Học Tập Trực Tiếp &amp; Bảo Chứng Năng Lực Kỹ Sư Công Nghệ
            </h1>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              Một tài khoản duy nhất để tham gia lớp học trực tuyến theo đợt, hỏi bài cùng Trợ giảng AI 24/7, nộp bài tập thực hành và nhận Chứng chỉ tốt nghiệp của bạn.
            </p>
          </div>

          <div className="space-y-3 text-xs text-[#0F172A] dark:text-[#ECFDF5]">
            {[
              'Lưu lại tiến độ xem bài giảng trên cả máy tính và điện thoại',
              'Làm bài tập ngắn cuối mỗi buổi để nắm chắc kiến thức thực tế',
              'Được gợi ý lộ trình học vừa sức với mục tiêu công việc của bạn',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex items-center gap-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <span>Bảo mật xác thực chuẩn OAuth 2.0 &amp; Mã hóa Argon2id</span>
          </div>
        </div>

        {/* Right 7 Columns: Streamlined Auth Form + Google OAuth 1-Tap */}
        <div className="lg:col-span-7 p-8 sm:p-10 space-y-6">
          {/* Mode Switcher Tabs (Max 2 tabs) */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="inline-flex p-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  navigate('/login');
                }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'LOGIN'
                    ? 'bg-white dark:bg-[#111A15] text-[#0F172A] dark:text-[#ECFDF5] shadow-2xs'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER');
                  navigate('/register');
                }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'REGISTER'
                    ? 'bg-white dark:bg-[#111A15] text-[#0F172A] dark:text-[#ECFDF5] shadow-2xs'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Tạo tài khoản mới
              </button>
            </div>

            <span className="text-xs text-[#475569] dark:text-[#94A3B8]">
              Zone 2 · Định danh Học viên
            </span>
          </div>

          {/* Google OAuth 1-Tap Button (Strictly no Facebook/GitHub clutter) */}
          <div>
            <button
              type="button"
              onClick={handleGoogleOneTap}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>Tiếp tục nhanh bằng Google OAuth 1-Tap</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[#475569] dark:text-[#94A3B8]">
            <div className="h-px flex-1 bg-[#E2ECE7] dark:bg-[#1E2D24]" />
            <span>HOẶC SỬ DỤNG EMAIL HỌC VIÊN</span>
            <div className="h-px flex-1 bg-[#E2ECE7] dark:bg-[#1E2D24]" />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-[#EF4444]/40 text-xs text-[#EF4444] font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'REGISTER' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-fullname"
                  className="block text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]"
                >
                  Họ và tên đầy đủ (Hiển thị trên Chứng chỉ tốt nghiệp của bạn)
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-sm text-[#0F172A] dark:text-[#ECFDF5]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]"
              >
                Địa chỉ Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono text-sm text-[#0F172A] dark:text-[#ECFDF5]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]"
              >
                Mật khẩu bảo mật
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono text-sm text-[#0F172A] dark:text-[#ECFDF5]"
              />

              {/* Live Red -> Amber -> Green Password Strength Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-3 gap-1.5 h-1.5">
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 1
                        ? strength.level === 'WEAK'
                          ? 'bg-[#EF4444]'
                          : strength.level === 'MEDIUM'
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#10B981]'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 2
                        ? strength.level === 'MEDIUM'
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#10B981]'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                  <div
                    className={`rounded-full transition-colors ${
                      strength.score >= 3 ? 'bg-[#10B981]' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                </div>
                <div
                  className={`text-[11px] font-medium ${
                    strength.level === 'WEAK'
                      ? 'text-[#EF4444]'
                      : strength.level === 'MEDIUM'
                      ? 'text-[#F59E0B]'
                      : strength.level === 'STRONG'
                      ? 'text-[#10B981]'
                      : 'text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  Độ mạnh mật khẩu: {strength.label}
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                <span>
                  {mode === 'LOGIN'
                    ? 'Đăng Nhập Vào Góc Học Tập'
                    : 'Tạo Tài Khoản & Thiết Lập Hồ Sơ Học Viên'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
