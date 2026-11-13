import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Sparkles,
  UserCheck,
  Upload,
  Phone,
  Target,
  FileText,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Server,
  BarChart3,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { formatVnd, formatScheduleSlots } from '../utils/academyLogic';
import { CompetencyVerifiedShield, AvatarWithFallback } from '../components/BotanicalStickers';
import { profileInterviewApi } from '../services/profile-interview.api';

function buildTechAvatarSvgDataUrl(
  label: string,
  bgHex: string,
  accentHex: string,
  badgeText: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="28" fill="${bgHex}"/>
    <circle cx="60" cy="44" r="20" fill="${accentHex}" opacity="0.22"/>
    <circle cx="60" cy="44" r="14" fill="${accentHex}"/>
    <path d="M30 96C30 79 43 70 60 70C77 70 90 79 90 96" fill="${accentHex}" opacity="0.85"/>
    <rect x="18" y="88" width="84" height="20" rx="10" fill="#0F172A" opacity="0.82"/>
    <text x="60" y="101" text-anchor="middle" fill="#ECFDF5" font-family="monospace" font-weight="700" font-size="10">${badgeText}</text>
    <text x="60" y="48" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="800" font-size="11">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface TechAvatarPreset {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl: string;
}

export const TECH_AI_AVATAR_PRESETS: TechAvatarPreset[] = [
  {
    id: 'av-ai-eng',
    title: 'AI Engineer',
    subtitle: 'RAG & Multi-Agent',
    avatarUrl: buildTechAvatarSvgDataUrl('AI', '#064E3B', '#10B981', 'AI ENGINEER'),
  },
  {
    id: 'av-backend-py',
    title: 'Backend Python',
    subtitle: 'FastAPI & Microservices',
    avatarUrl: buildTechAvatarSvgDataUrl('PY', '#0F172A', '#38BDF8', 'PYTHON CLOUD'),
  },
  {
    id: 'av-data-ai',
    title: 'Data Scientist',
    subtitle: 'SQL, BI & Analytics',
    avatarUrl: buildTechAvatarSvgDataUrl('DS', '#1E1B4B', '#818CF8', 'DATA & BI'),
  },
  {
    id: 'av-llm-ops',
    title: 'MLOps Architect',
    subtitle: 'Docker & Vector DB',
    avatarUrl: buildTechAvatarSvgDataUrl('ML', '#065F46', '#34D399', 'MLOPS PRO'),
  },
  {
    id: 'av-fullstack-ai',
    title: 'Fullstack AI',
    subtitle: 'TypeScript & LLM API',
    avatarUrl: buildTechAvatarSvgDataUrl('FS', '#134E4A', '#2DD4BF', 'FULLSTACK AI'),
  },
  {
    id: 'av-nlp-research',
    title: 'NLP Specialist',
    subtitle: 'Fine-tuning & Eval',
    avatarUrl: buildTechAvatarSvgDataUrl('NLP', '#1F2937', '#F59E0B', 'NLP LABS'),
  },
];

export interface CareerGoalTrackOption {
  id: 'AI_ENGINEER' | 'BACKEND_CLOUD' | 'DATA_ANALYTICS';
  title: string;
  description: string;
  defaultGoalText: string;
  recommendedCourseId: string;
  recommendedCohortId: string;
}

export const CAREER_GOAL_TRACKS: CareerGoalTrackOption[] = [
  {
    id: 'AI_ENGINEER',
    title: 'AI Engineer',
    description: 'Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning.',
    defaultGoalText:
      'AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning triển khai thực tế tại doanh nghiệp.',
    recommendedCourseId: 'course-ai-eng',
    recommendedCohortId: 'cohort-ai-k01',
  },
  {
    id: 'BACKEND_CLOUD',
    title: 'Backend Python & Cloud',
    description: 'Thiết kế API hiệu năng cao, Microservices, Docker.',
    defaultGoalText:
      'Backend Python & Cloud — Thiết kế API hiệu năng cao với FastAPI, PostgreSQL, Microservices & Docker.',
    recommendedCourseId: 'course-fullstack-ai',
    recommendedCohortId: 'cohort-fs-k03',
  },
  {
    id: 'DATA_ANALYTICS',
    title: 'Data Analytics & AI',
    description: 'Xử lý dữ liệu lớn, Trực quan hóa dữ liệu và Dashboard BI.',
    defaultGoalText:
      'Data Analytics & AI — Xử lý dữ liệu lớn bằng Python/SQL, Trực quan hóa dữ liệu và xây dựng Dashboard BI.',
    recommendedCourseId: 'course-py-data',
    recommendedCohortId: 'cohort-py-k04',
  },
];

export const BIO_QUICK_SUGGESTIONS: string[] = [
  'Sinh viên đam mê AI muốn xây dựng sản phẩm thực tế',
  'Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI',
  'Kỹ sư dữ liệu tập trung tối ưu hóa hệ sinh thái dữ liệu doanh nghiệp',
];

export const OnboardingWizardView: React.FC = () => {
  const {
    courses,
    cohorts,
    navigate,
    enrollInCohort,
    currentUser,
    setCurrentUser,
    setRole,
  } = useAcademy();

  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState<string>(
    currentUser?.fullName || 'Nguyễn Văn An'
  );
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string>(
    currentUser?.avatarUrl || TECH_AI_AVATAR_PRESETS[0].avatarUrl
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>(currentUser?.phone || '0908 123 456');
  const [selectedTrackId, setSelectedTrackId] = useState<
    'AI_ENGINEER' | 'BACKEND_CLOUD' | 'DATA_ANALYTICS'
  >('AI_ENGINEER');
  const [careerGoal, setCareerGoal] = useState<string>(
    currentUser?.careerGoal || CAREER_GOAL_TRACKS[0].defaultGoalText
  );
  const [bioText, setBioText] = useState<string>(
    currentUser?.bio || BIO_QUICK_SUGGESTIONS[0]
  );

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  // Đồng bộ Họ tên nếu currentUser vừa được cập nhật từ bước Đăng ký / Google One-Tap
  useEffect(() => {
    if (currentUser?.fullName && (!fullName || fullName === 'Nguyễn Văn An')) {
      setFullName(currentUser.fullName);
    }
    if (currentUser?.avatarUrl) {
      setSelectedAvatarUrl(currentUser.avatarUrl);
    }
    if (currentUser?.phone) {
      setPhone(currentUser.phone);
    }
    if (currentUser?.bio) {
      setBioText(currentUser.bio);
    }
    if (currentUser?.careerGoal) {
      setCareerGoal(currentUser.careerGoal);
    }
  }, [currentUser]);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSelectedAvatarUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } else if (typeof URL !== 'undefined' && URL.createObjectURL) {
      setSelectedAvatarUrl(URL.createObjectURL(file));
    }
  };

  const handleSelectTrackCard = (track: CareerGoalTrackOption) => {
    setSelectedTrackId(track.id);
    setCareerGoal(track.defaultGoalText);
  };

  const validateForm = (): boolean => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage(
        'Vui lòng nhập đầy đủ Họ và tên thật có dấu để in trên Chứng chỉ tốt nghiệp.'
      );
      return false;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      setErrorMessage(
        'Vui lòng nhập Số điện thoại / Zalo liên hệ hợp lệ để Giáo vụ hỗ trợ lớp học.'
      );
      return false;
    }
    if (!careerGoal.trim()) {
      setErrorMessage('Vui lòng chọn hoặc nhập Mục tiêu nghề nghiệp cốt lõi của bạn.');
      return false;
    }
    if (!bioText.trim()) {
      setErrorMessage('Vui lòng nhập đôi dòng giới thiệu bản thân hoặc chọn gợi ý nhanh.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const persistProfileToBackend = async (): Promise<boolean> => {
    if (!validateForm()) return false;
    setIsSaving(true);
    try {
      const res = await profileInterviewApi.updateMyProfile({
        fullName: fullName.trim(),
        avatarUrl: selectedAvatarUrl,
        phone: phone.trim(),
        bio: bioText.trim(),
        careerGoal: careerGoal.trim(),
      });

      setRole('STUDENT');
      setCurrentUser((prev) => ({
        id: prev?.id || res.userProfile?.userId || 'acc-01',
        fullName: res.userProfile?.fullName || fullName.trim(),
        email: prev?.email || res.userProfile?.email || 'an.nguyen.dev@gmail.com',
        role: 'STUDENT',
        avatarUrl: res.userProfile?.avatarUrl || selectedAvatarUrl,
        phone: res.userProfile?.phone || phone.trim(),
        bio: res.userProfile?.bio || bioText.trim(),
        careerGoal: res.userProfile?.careerGoal || careerGoal.trim(),
      }));

      setSaveSuccessMessage(
        'Đã lưu Hồ sơ Khởi đầu & Mục tiêu Nghề nghiệp vào cơ sở dữ liệu hệ thống.'
      );
      return true;
    } catch {
      setErrorMessage('Không thể lưu hồ sơ lúc này. Vui lòng kiểm tra lại kết nối và thử lại.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteAndEnterWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await persistProfileToBackend();
    if (ok) {
      navigate('/app');
    }
  };

  const handleSaveAndViewRecommendedCohort = async () => {
    const ok = await persistProfileToBackend();
    if (ok) {
      setStep(2);
    }
  };

  const currentTrackObj =
    CAREER_GOAL_TRACKS.find((t) => t.id === selectedTrackId) ?? CAREER_GOAL_TRACKS[0];
  const recommendedCourse =
    courses.find((c) => c.id === currentTrackObj.recommendedCourseId) ?? courses[0];
  const recommendedCohort =
    cohorts.find((c) => c.id === currentTrackObj.recommendedCohortId) ?? cohorts[0];

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Header Progress Bar */}
      <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Thiết lập Hồ sơ Học viên Mới · Bước {step}/2</span>
            </span>
            <span className="text-xs font-mono text-[#475569] dark:text-[#94A3B8]">
              Đồng bộ trực tiếp vào Hồ sơ Năng lực &amp; Chứng chỉ
            </span>
          </div>
          {currentUser?.email && (
            <span className="text-xs font-mono text-[#059669] dark:text-[#34D399]">
              Tài khoản: {currentUser.email}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 1, label: '1. Hồ sơ Cá nhân & Mục tiêu Nghề nghiệp' },
            { id: 2, label: '2. Gợi ý Lộ trình & Lớp khai giảng phù hợp' },
          ].map((item) => (
            <div key={item.id} className="space-y-1.5">
              <div
                className={`h-2 rounded-full transition-colors ${
                  item.id <= step ? 'bg-[#10B981]' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
              <div
                className={`text-xs font-semibold ${
                  item.id === step
                    ? 'text-[#059669] dark:text-[#34D399]'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: THIẾT LẬP THÔNG TIN CÁ NHÂN & MỤC TIÊU NGHỀ NGHIỆP */}
      {step === 1 && (
        <form
          onSubmit={handleCompleteAndEnterWorkspace}
          className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 shadow-2xs space-y-7"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                Thiết Lập Hồ Sơ Khởi Đầu &amp; Mục Tiêu Nghề Nghiệp
              </h1>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                Hoàn tất thông tin định danh học viên trong 30 giây để hệ thống cá nhân hóa Góc học tập, Hồ sơ CV và cấp Chứng chỉ tốt nghiệp chính xác.
              </p>
            </div>
            <CompetencyVerifiedShield className="w-12 h-12 shrink-0 hidden sm:block" />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 flex items-center gap-2.5 text-xs font-medium text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. ẢNH ĐẠI DIỆN (AVATAR UPLOAD HOẶC CHỌN NHANH TRONG 3 GIÂY) */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
              1. Ảnh đại diện học viên (Avatar)
            </label>

            <div className="p-4 sm:p-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              {/* Current Avatar Preview + Upload Button */}
              <div className="flex items-center gap-4">
                <AvatarWithFallback
                  src={selectedAvatarUrl}
                  name={fullName || 'Học viên 3T'}
                  className="w-16 h-16 rounded-2xl shadow-xs"
                />
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    {uploadedFileName
                      ? `Đã tải ảnh: ${uploadedFileName}`
                      : 'Tải ảnh cá nhân hoặc chọn nhanh bộ Avatar Kỹ sư AI'}
                  </div>
                  <p className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                    Hiển thị trên Header, Phòng học trực tuyến và Hồ sơ năng lực.
                  </p>
                  <div>
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>Tải ảnh từ máy tính</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 6 Quick-Select Tech/AI Avatars */}
              <div className="w-full md:w-auto space-y-1.5">
                <div className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  Hoặc chọn nhanh Avatar phong cách Tech / AI (3 giây):
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {TECH_AI_AVATAR_PRESETS.map((preset) => {
                    const isSelected = selectedAvatarUrl === preset.avatarUrl;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedAvatarUrl(preset.avatarUrl);
                          setUploadedFileName(null);
                        }}
                        title={`${preset.title} — ${preset.subtitle}`}
                        className={`p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'border-[#10B981] bg-[#D1FAE5]/50 dark:bg-emerald-950/60 ring-2 ring-[#10B981]/30'
                            : 'border-[#E2ECE7] dark:border-[#1E2D24] bg-white dark:bg-[#111A15] hover:border-[#10B981]/60'
                        }`}
                      >
                        <img
                          src={preset.avatarUrl}
                          alt={preset.title}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                        <span className="text-[10px] font-semibold text-[#0F172A] dark:text-[#ECFDF5] truncate max-w-[68px]">
                          {preset.title.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 2. HỌ VÀ TÊN CHÍNH THỨC & 3. SỐ ĐIỆN THOẠI / ZALO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label
                htmlFor="onboarding-fullname"
                className="block text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]"
              >
                2. Họ và tên chính thức <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="onboarding-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 rounded-lg px-3 py-2">
                ⚠️ Vui lòng nhập đúng Họ và tên thật có dấu (ví dụ: Nguyễn Văn An) để in chính xác trên Chứng chỉ tốt nghiệp và Danh sách lớp học.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="onboarding-phone"
                className="block text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]"
              >
                3. Số điện thoại liên hệ / Zalo <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Phone className="w-4 h-4 text-[#10B981] absolute left-3.5 pointer-events-none" />
                <input
                  id="onboarding-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ví dụ: 0908 123 456"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-[#475569] dark:text-[#94A3B8] bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] rounded-lg px-3 py-2">
                Giáo vụ và Giảng viên dùng số Zalo này để thêm bạn vào nhóm lớp học trực tuyến, hỗ trợ kỹ thuật 1-1 và thông báo lịch học khẩn cấp.
              </p>
            </div>
          </div>

          {/* 4. MỤC TIÊU NGHỀ NGHIỆP CỐT LÕI (CAREER GOAL) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="onboarding-career-goal"
                className="block text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]"
              >
                4. Mục tiêu nghề nghiệp cốt lõi <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                Chọn nhanh định hướng bên dưới hoặc nhập mục tiêu cụ thể của bạn
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CAREER_GOAL_TRACKS.map((track) => {
                const active = selectedTrackId === track.id;
                const TrackIcon =
                  track.id === 'AI_ENGINEER'
                    ? Cpu
                    : track.id === 'BACKEND_CLOUD'
                    ? Server
                    : BarChart3;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => handleSelectTrackCard(track)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                      active
                        ? 'border-2 border-[#10B981] bg-[#D1FAE5]/35 dark:bg-emerald-950/40'
                        : 'border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] hover:border-[#10B981]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        <TrackIcon className="w-4 h-4 text-[#10B981] shrink-0" />
                        <span>{track.title}</span>
                      </span>
                      {active && (
                        <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      {track.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <Target className="w-4 h-4 text-[#10B981] absolute left-3.5 top-3 pointer-events-none" />
              <input
                id="onboarding-career-goal"
                type="text"
                required
                value={careerGoal}
                onChange={(e) => setCareerGoal(e.target.value)}
                placeholder="Nhập mục tiêu nghề nghiệp cụ thể của bạn..."
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] focus:outline-none focus:border-[#10B981]"
              />
            </div>
          </div>

          {/* 5. GIỚI THIỆU BẢN THÂN NGẮN GỌN (BIO + 3 NÚT GỢI Ý NHANH) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="onboarding-bio"
                className="block text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]"
              >
                5. Giới thiệu bản thân ngắn gọn (Bio) <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                1–2 câu để Giảng viên và bạn cùng lớp hiểu rõ nền tảng của bạn
              </span>
            </div>

            {/* 3 Quick-Select Bio Suggestion Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                Gợi ý điền nhanh:
              </span>
              {BIO_QUICK_SUGGESTIONS.map((suggestion) => {
                const isSelected = bioText.trim() === suggestion;
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setBioText(suggestion)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-[#D1FAE5] dark:bg-emerald-950/90 border-[#10B981] text-[#065F46] dark:text-emerald-300 font-semibold'
                        : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8] hover:border-[#10B981]'
                    }`}
                  >
                    + &ldquo;{suggestion}&rdquo;
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <FileText className="w-4 h-4 text-[#10B981] absolute left-3.5 top-3 pointer-events-none" />
              <textarea
                id="onboarding-bio"
                rows={2}
                required
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                placeholder="Nhập 1–2 câu giới thiệu ngắn gọn về chuyên môn hoặc định hướng học tập của bạn..."
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm text-[#0F172A] dark:text-[#ECFDF5] leading-relaxed focus:outline-none focus:border-[#10B981]"
              />
            </div>
          </div>

          {/* CTA FOOTER: HOÀN TẤT HỒ SƠ & VÀO GÓC HỌC TẬP HOẶC XEM GỢI Ý LỚP HỌC */}
          <div className="pt-4 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
              <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>
                Tặng sẵn <strong className="text-[#059669] dark:text-[#34D399]">02 lượt Phỏng vấn thử cùng AI</strong> ngay khi hoàn tất hồ sơ.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAndViewRecommendedCohort}
                className="px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer transition-colors"
              >
                Lưu &amp; Xem Lớp Khai Giảng Gợi Ý →
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {isSaving
                    ? 'Đang lưu hồ sơ...'
                    : 'Hoàn tất Hồ sơ & Vào Góc Học Tập'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* STEP 2: GỢI Ý LỘ TRÌNH & LỚP KHAI GIẢNG PHÙ HỢP VỚI MỤC TIÊU NGHỀ NGHIỆP */}
      {step === 2 && (
        <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 shadow-2xs space-y-6">
          {saveSuccessMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/90 border border-[#10B981] text-[#065F46] dark:text-emerald-300 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {/* Tóm tắt Hồ sơ vừa lưu */}
          <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <AvatarWithFallback
                src={selectedAvatarUrl}
                name={fullName}
                className="w-12 h-12 rounded-xl"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    {fullName}
                  </span>
                  <span className="font-mono text-xs text-[#059669] dark:text-[#34D399]">
                    · {phone}
                  </span>
                </div>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                  {bioText}
                </p>
                <p className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399] mt-0.5">
                  Mục tiêu: {careerGoal}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3 py-1.5 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:border-[#10B981] cursor-pointer self-start sm:self-center shrink-0"
            >
              Chỉnh sửa lại hồ sơ
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Đề xuất cá nhân hóa theo Mục tiêu Nghề nghiệp của bạn
            </span>
            <h2 className="text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Lộ Trình &amp; Đợt Học Khai Giảng Phù Hợp Nhất
            </h2>
          </div>

          <div className="p-6 rounded-2xl bg-[#F7FBF9] dark:bg-[#090F0C] border-2 border-[#10B981] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-[#059669] dark:text-[#34D399]">
                ĐỢT HỌC KHUYẾN NGHỊ: {recommendedCohort.code}
              </span>
              <span className="text-xs font-mono text-[#475569] dark:text-[#94A3B8]">
                Học phí trọn khóa: <strong>{formatVnd(recommendedCohort.tuitionVnd)}</strong>
              </span>
            </div>

            <h3 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              {recommendedCourse.title}
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              {recommendedCourse.shortDescription}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-[#10B981] shrink-0" />
                <div>
                  <div className="text-[#475569] dark:text-[#94A3B8]">Lịch học trực tuyến</div>
                  <div className="font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                    {formatScheduleSlots(recommendedCohort.scheduleSlots)}
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
                <div className="text-[#475569] dark:text-[#94A3B8]">Giảng viên phụ trách chính</div>
                <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
                  {recommendedCohort.staff[0]?.fullName ?? 'TS. Trần Minh Khoa'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
            >
              Vào thẳng Góc Học Tập của tôi →
            </button>
            <button
              type="button"
              onClick={() => {
                enrollInCohort(recommendedCohort.code);
                navigate('/app');
              }}
              className="px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold cursor-pointer shadow-xs"
            >
              Ghi Danh Đợt {recommendedCohort.code} &amp; Vào Góc Học Tập →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
