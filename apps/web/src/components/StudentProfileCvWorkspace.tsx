import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  Edit3,
  Save,
  Mail,
  Phone,
  Globe,
  Plus,
  X,
  Trash2,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  profileAndInterviewApi,
  ProfileAndSkillsResponse,
} from '../services/profile-interview.api';
import { CvParsedData } from '../types/domain';
import { AvatarWithFallback } from './BotanicalStickers';

export interface ResumeProjectItem {
  id: string;
  name: string;
  period: string; // VD: "08/2026 – 11/2026"
  role: string; // VD: "Lead Developer"
  techStack: string; // VD: "Python, FastAPI, pgvector, React"
  bullets: string[]; // Các thành tựu đạt được
}

export interface ResumeWorkExperienceItem {
  id: string;
  company: string; // Tên công ty
  position: string; // Vị trí (VD: Backend Developer)
  period: string; // Thời gian làm việc
  summary: string; // Mô tả đóng góp & kết quả công việc
}

export interface ResumeEducationItem {
  id: string;
  school: string; // Tên trường ĐH / CĐ
  degree: string; // Bằng cấp / Chuyên ngành
  period: string; // Niên khóa (VD: 2021 – 2025)
  gpaOrHonors?: string; // GPA hoặc Xếp loại
}

export interface ResumeAwardCertItem {
  id: string;
  title: string; // Tên Chứng chỉ hoặc Giải thưởng
  issuer: string; // Tổ chức cấp (VD: 3T Academy, IIG)
  dateOrCode: string; // Ngày cấp hoặc Mã định danh chứng chỉ
  detail?: string;
}

export interface StudentResumeData {
  fullName: string;
  avatarUrl?: string;
  headline: string;
  email: string;
  phone: string;
  githubUrl: string;
  linkedinUrl: string;
  careerObjective: string;
  skills: string[];
  projects: ResumeProjectItem[];
  workExperience: ResumeWorkExperienceItem[];
  education: ResumeEducationItem[];
  awardsAndCerts: ResumeAwardCertItem[];
}

const EMPTY_RESUME_DATA: StudentResumeData = {
  fullName: '',
  avatarUrl: '',
  headline: '',
  email: '',
  phone: '',
  githubUrl: '',
  linkedinUrl: '',
  careerObjective: '',
  skills: [],
  projects: [],
  workExperience: [],
  education: [],
  awardsAndCerts: [],
};

/**
 * Chuyển đổi dữ liệu trả về từ API `getMyProfileAndSkills()` hoặc `cvParsedData` sang `StudentResumeData` chuẩn 6 khối
 */
export function mapApiProfileToStudentResume(
  res: ProfileAndSkillsResponse
): StudentResumeData {
  const { userProfile, studentSkillStates, externalCvSkills } = res;
  const cv: Partial<CvParsedData> = userProfile?.cvParsedData || {};

  const hasExistingCv = Boolean(
    cv &&
      (Boolean(cv.fileName) ||
        (Array.isArray(cv.projects) && cv.projects.length > 0) ||
        (Array.isArray(cv.workExperience) && cv.workExperience.length > 0) ||
        (Array.isArray(cv.workExperiences) && cv.workExperiences.length > 0) ||
        (Array.isArray(cv.education) && cv.education.length > 0) ||
        (Array.isArray(cv.awardsAndCerts) && cv.awardsAndCerts.length > 0) ||
        (Array.isArray(cv.certificationsAndAwards) &&
          cv.certificationsAndAwards.length > 0) ||
        (Array.isArray(cv.skills) && cv.skills.length > 0) ||
        (Array.isArray(cv.externalSkills) && cv.externalSkills.length > 0))
  );

  // Trường hợp tài khoản mới chưa có CV (cvParsedData trống):
  // Điền sẵn fullName, email, headline (userProfile.headline || userProfile.bio),
  // careerObjective (userProfile.careerObjective || userProfile.careerGoal), các mảng còn lại để rỗng []
  if (!hasExistingCv) {
    return {
      fullName: userProfile.fullName || '',
      avatarUrl: userProfile.avatarUrl || '',
      headline: userProfile.headline || userProfile.bio || '',
      email: userProfile.email || '',
      phone: userProfile.phone || '',
      githubUrl: userProfile.githubUrl || '',
      linkedinUrl: userProfile.linkedinUrl || '',
      careerObjective:
        userProfile.careerObjective || userProfile.careerGoal || '',
      skills: [],
      projects: [],
      workExperience: [],
      education: [],
      awardsAndCerts: [],
    };
  }

  // Trường hợp đã có dữ liệu CV (cvParsedData): Nạp toàn bộ 6 khối từ backend
  const mergedSkills: string[] =
    Array.isArray(cv.skills) && cv.skills.length > 0
      ? cv.skills
      : Array.from(
          new Set([
            ...(studentSkillStates || []).map((s) => s.name),
            ...(externalCvSkills || cv.externalSkills || []).map((s) => s.name),
          ])
        );

  const projects: ResumeProjectItem[] = (cv.projects || []).map((p, idx) => ({
    id: p.id || `proj-${idx + 1}`,
    name: p.name || '',
    period: p.period || '',
    role: p.role || '',
    techStack: p.techStack || '',
    bullets:
      Array.isArray(p.bullets) && p.bullets.length > 0
        ? p.bullets
        : Array.isArray(p.highlights)
        ? p.highlights
        : [],
  }));

  const rawWorkExp = cv.workExperience || cv.workExperiences || [];
  const workExperience: ResumeWorkExperienceItem[] = Array.isArray(rawWorkExp)
    ? rawWorkExp.map((w: any, idx: number) => ({
        id: String(w.id || `exp-${idx + 1}`),
        company: String(w.company || ''),
        position: String(w.position || w.role || ''),
        period: String(w.period || ''),
        summary: String(w.summary || w.description || ''),
      }))
    : [];

  const rawEducation = cv.education || [];
  const education: ResumeEducationItem[] = Array.isArray(rawEducation)
    ? rawEducation.map((e: any, idx: number) => ({
        id: String(e.id || `edu-${idx + 1}`),
        school: String(e.school || e.organization || ''),
        degree: String(e.degree || e.title || ''),
        period: String(e.period || e.periodOrCode || ''),
        gpaOrHonors: e.gpaOrHonors ? String(e.gpaOrHonors) : e.detail ? String(e.detail) : undefined,
      }))
    : [];

  const rawAwards = cv.awardsAndCerts || cv.certificationsAndAwards || [];
  const awardsAndCerts: ResumeAwardCertItem[] = Array.isArray(rawAwards)
    ? rawAwards.map((a: any, idx: number) => ({
        id: String(a.id || `cert-${idx + 1}`),
        title: String(a.title || ''),
        issuer: String(a.issuer || a.organization || ''),
        dateOrCode: String(a.dateOrCode || a.periodOrCode || ''),
        detail: a.detail ? String(a.detail) : undefined,
      }))
    : [];

  return {
    fullName: userProfile.fullName || cv.fullName || '',
    avatarUrl: userProfile.avatarUrl || cv.avatarUrl || '',
    headline: userProfile.bio || userProfile.headline || cv.headline || '',
    email: userProfile.email || cv.email || '',
    phone: userProfile.phone || cv.phone || '',
    githubUrl: cv.githubUrl || userProfile.githubUrl || '',
    linkedinUrl: cv.linkedinUrl || userProfile.linkedinUrl || '',
    careerObjective:
      userProfile.careerGoal ||
      userProfile.careerObjective ||
      cv.careerObjective ||
      '',
    skills: mergedSkills,
    projects,
    workExperience,
    education,
    awardsAndCerts,
  };
}

/**
 * Chuyển đổi trực tiếp `CvParsedData` (từ kết quả trích xuất PDF vừa tải lên) sang `StudentResumeData`
 */
export function mapParsedCvToStudentResume(
  cv: CvParsedData,
  fallbackCurrent: StudentResumeData
): StudentResumeData {
  const extractedSkills =
    Array.isArray(cv.skills) && cv.skills.length > 0
      ? cv.skills
      : Array.isArray(cv.externalSkills) && cv.externalSkills.length > 0
      ? cv.externalSkills.map((s) => s.name)
      : fallbackCurrent.skills;

  const projects: ResumeProjectItem[] = Array.isArray(cv.projects)
    ? cv.projects.map((p, idx) => ({
        id: p.id || `proj-parsed-${idx + 1}`,
        name: p.name || '',
        period: p.period || '',
        role: p.role || '',
        techStack: p.techStack || '',
        bullets:
          Array.isArray(p.bullets) && p.bullets.length > 0
            ? p.bullets
            : Array.isArray(p.highlights)
            ? p.highlights
            : [],
      }))
    : [];

  const rawWorkExp = cv.workExperience || cv.workExperiences || [];
  const workExperience: ResumeWorkExperienceItem[] = Array.isArray(rawWorkExp)
    ? rawWorkExp.map((w: any, idx: number) => ({
        id: String(w.id || `exp-parsed-${idx + 1}`),
        company: String(w.company || ''),
        position: String(w.position || ''),
        period: String(w.period || ''),
        summary: String(w.summary || ''),
      }))
    : [];

  const rawEdu = cv.education || [];
  const education: ResumeEducationItem[] = Array.isArray(rawEdu)
    ? rawEdu.map((e: any, idx: number) => ({
        id: String(e.id || `edu-parsed-${idx + 1}`),
        school: String(e.school || ''),
        degree: String(e.degree || ''),
        period: String(e.period || ''),
        gpaOrHonors: e.gpaOrHonors ? String(e.gpaOrHonors) : undefined,
      }))
    : [];

  const rawAwards = cv.awardsAndCerts || cv.certificationsAndAwards || [];
  const awardsAndCerts: ResumeAwardCertItem[] = Array.isArray(rawAwards)
    ? rawAwards.map((a: any, idx: number) => ({
        id: String(a.id || `cert-parsed-${idx + 1}`),
        title: String(a.title || ''),
        issuer: String(a.issuer || ''),
        dateOrCode: String(a.dateOrCode || ''),
        detail: a.detail ? String(a.detail) : undefined,
      }))
    : [];

  return {
    fullName: cv.fullName || cv.candidateName || fallbackCurrent.fullName,
    headline: cv.headline || cv.targetRole || fallbackCurrent.headline,
    email: cv.email || fallbackCurrent.email,
    phone: cv.phone || fallbackCurrent.phone,
    githubUrl: cv.githubUrl || fallbackCurrent.githubUrl,
    linkedinUrl: cv.linkedinUrl || fallbackCurrent.linkedinUrl,
    careerObjective:
      cv.careerObjective || cv.summaryBio || fallbackCurrent.careerObjective,
    skills: extractedSkills,
    projects,
    workExperience,
    education,
    awardsAndCerts,
  };
}

export interface SmartSyncSelectionState {
  syncFullName: boolean; // Mặc định false (không tích) để giữ tên thật cấp chứng chỉ
  syncHeadline: boolean; // Mặc định true
  syncCareerObjective: boolean; // Mặc định true
  syncSkills: boolean; // Mặc định true
  syncProjects: boolean; // Mặc định true
  syncExperienceAndEdu: boolean; // Mặc định true
}

/**
 * Hàm trộn (Merge) thông minh giữa Hồ sơ hiện tại và Hồ sơ trích xuất từ CV theo đúng các mục học viên tích chọn [x]
 */
export function applySmartSyncSelection(
  current: StudentResumeData,
  parsed: StudentResumeData,
  selection: SmartSyncSelectionState
): StudentResumeData {
  // 1. Kỹ năng: thêm các kỹ năng mới phát hiện từ CV vào danh sách hiện tại
  const mergedSkills = selection.syncSkills
    ? Array.from(new Set([...current.skills, ...parsed.skills]))
    : current.skills;

  // 2. Dự án: thêm các dự án mới đọc được từ CV vào danh sách dự án
  const existingProjectNames = new Set(
    current.projects.map((p) => p.name.trim().toLowerCase())
  );
  const newProjects = parsed.projects.filter(
    (p) => !existingProjectNames.has(p.name.trim().toLowerCase())
  );
  const mergedProjects = selection.syncProjects
    ? [...newProjects, ...current.projects]
    : current.projects;

  // 3. Kinh nghiệm làm việc, Học vấn & Chứng chỉ: thêm các mục mới phát hiện vào hồ sơ
  const existingExpKeys = new Set(
    current.workExperience.map(
      (w) => `${w.company.trim().toLowerCase()}::${w.position.trim().toLowerCase()}`
    )
  );
  const newWorkExp = parsed.workExperience.filter(
    (w) =>
      !existingExpKeys.has(
        `${w.company.trim().toLowerCase()}::${w.position.trim().toLowerCase()}`
      )
  );

  const existingEduKeys = new Set(
    current.education.map(
      (e) => `${e.school.trim().toLowerCase()}::${e.degree.trim().toLowerCase()}`
    )
  );
  const newEdu = parsed.education.filter(
    (e) =>
      !existingEduKeys.has(
        `${e.school.trim().toLowerCase()}::${e.degree.trim().toLowerCase()}`
      )
  );

  const existingAwardKeys = new Set(
    current.awardsAndCerts.map((a) => a.title.trim().toLowerCase())
  );
  const newAwards = parsed.awardsAndCerts.filter(
    (a) => !existingAwardKeys.has(a.title.trim().toLowerCase())
  );

  return {
    fullName: selection.syncFullName ? parsed.fullName : current.fullName,
    headline: selection.syncHeadline ? parsed.headline : current.headline,
    email: current.email || parsed.email,
    phone: current.phone || parsed.phone,
    githubUrl: current.githubUrl || parsed.githubUrl,
    linkedinUrl: current.linkedinUrl || parsed.linkedinUrl,
    careerObjective: selection.syncCareerObjective
      ? parsed.careerObjective
      : current.careerObjective,
    skills: mergedSkills,
    projects: mergedProjects,
    workExperience: selection.syncExperienceAndEdu
      ? [...newWorkExp, ...current.workExperience]
      : current.workExperience,
    education: selection.syncExperienceAndEdu
      ? [...newEdu, ...current.education]
      : current.education,
    awardsAndCerts: selection.syncExperienceAndEdu
      ? [...newAwards, ...current.awardsAndCerts]
      : current.awardsAndCerts,
  };
}

export const StudentProfileCvWorkspace: React.FC = () => {
  const { latestCvFileName, latestCvUpdatedAt, updateLatestCv } = useAcademy();

  const [resume, setResume] = useState<StudentResumeData>(EMPTY_RESUME_DATA);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [newSkillText, setNewSkillText] = useState<string>('');

  // Modal state cho Thêm / Sửa từng khối (Khối 3, 4, 5, 6)
  const [projectModalState, setProjectModalState] = useState<{
    open: boolean;
    editingId: string | null;
    name: string;
    role: string;
    period: string;
    techStack: string;
    bulletsText: string;
  }>({
    open: false,
    editingId: null,
    name: '',
    role: '',
    period: '',
    techStack: '',
    bulletsText: '',
  });

  const [workExpModalState, setWorkExpModalState] = useState<{
    open: boolean;
    editingId: string | null;
    company: string;
    position: string;
    period: string;
    summary: string;
  }>({
    open: false,
    editingId: null,
    company: '',
    position: '',
    period: '',
    summary: '',
  });

  const [educationModalState, setEducationModalState] = useState<{
    open: boolean;
    editingId: string | null;
    school: string;
    degree: string;
    period: string;
    gpaOrHonors: string;
  }>({
    open: false,
    editingId: null,
    school: '',
    degree: '',
    period: '',
    gpaOrHonors: '',
  });

  const [awardModalState, setAwardModalState] = useState<{
    open: boolean;
    editingId: string | null;
    title: string;
    issuer: string;
    dateOrCode: string;
    detail: string;
  }>({
    open: false,
    editingId: null,
    title: '',
    issuer: '',
    dateOrCode: '',
    detail: '',
  });

  // Smart Sync Modal state (Popup Đối soát Thông minh khi tải file CV PDF)
  const [pendingSyncModal, setPendingSyncModal] = useState<{
    open: boolean;
    fileName: string;
    updatedAt: string;
    parsedResume: StudentResumeData;
  } | null>(null);

  const [syncSelection, setSyncSelection] = useState<SmartSyncSelectionState>({
    syncFullName: false, // Mặc định KHÔNG tích để giữ tên thật cấp chứng chỉ
    syncHeadline: true,
    syncCareerObjective: true,
    syncSkills: true,
    syncProjects: true,
    syncExperienceAndEdu: true,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. NẠP DỮ LIỆU ĐỘNG TỪ API KHI MOUNT COMPONENT
  useEffect(() => {
    let active = true;
    const loadProfileFromApi = async () => {
      setIsLoadingProfile(true);
      try {
        const res = await profileAndInterviewApi.getMyProfileAndSkills();
        if (!active) return;
        const hydrated = mapApiProfileToStudentResume(res);
        setResume(hydrated);
        if (
          res.userProfile?.latestCvFileName &&
          res.userProfile.latestCvFileName !== 'Chưa tải lên file CV'
        ) {
          updateLatestCv(res.userProfile.latestCvFileName);
        }
      } finally {
        if (active) {
          setIsLoadingProfile(false);
        }
      }
    };
    void loadProfileFromApi();
    return () => {
      active = false;
    };
  }, [updateLatestCv]);

  const showSuccessBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // 4. LƯU THAY ĐỔI VỀ BACKEND KHI BẤM "LƯU THÔNG TIN"
  const handleSaveResumeToBackend = async () => {
    setIsSaving(true);
    try {
      await profileAndInterviewApi.updateMyProfile({
        fullName: resume.fullName,
        avatarUrl: resume.avatarUrl,
        phone: resume.phone,
        bio: resume.headline,
        careerGoal: resume.careerObjective,
      });
      const targetFileName =
        latestCvFileName && latestCvFileName !== 'Chưa tải lên file CV'
          ? latestCvFileName
          : 'CV_Ho_So_Nang_Luc_2026.pdf';
      const saved = await profileAndInterviewApi.uploadAndParseCv(
        targetFileName,
        resume
      );
      if (saved.fileName) {
        updateLatestCv(saved.fileName);
      }
      setIsEditing(false);
      showSuccessBanner('Đã lưu thành công toàn bộ hồ sơ năng lực của bạn.');
    } finally {
      setIsSaving(false);
    }
  };

  // 5. TẢI LÊN CV (PDF) & MỞ HỘP THOẠI ĐỐI SOÁT THÔNG MINH (SMART DIFF & SYNC MODAL)
  const handleUploadCvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await profileAndInterviewApi.uploadAndParseCv(file);
      const parsedResume = mapParsedCvToStudentResume(res.cvParsedData, resume);

      // Reset lựa chọn mặc định: Họ tên [ ] (false), các mục còn lại [x] (true)
      setSyncSelection({
        syncFullName: false,
        syncHeadline: true,
        syncCareerObjective: true,
        syncSkills: true,
        syncProjects: true,
        syncExperienceAndEdu: true,
      });

      // Hiển thị Popup Đối soát Thông minh (KHÔNG ghi đè mù quáng ngay lập tức)
      setPendingSyncModal({
        open: true,
        fileName: res.fileName || file.name,
        updatedAt: res.updatedAt || 'Vừa trích xuất',
        parsedResume,
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmSmartSync = async () => {
    if (!pendingSyncModal) return;
    const mergedResume = applySmartSyncSelection(
      resume,
      pendingSyncModal.parsedResume,
      syncSelection
    );
    setIsSaving(true);
    try {
      await profileAndInterviewApi.uploadAndParseCv(
        pendingSyncModal.fileName,
        mergedResume
      );
      setResume(mergedResume);
      updateLatestCv(pendingSyncModal.fileName);
      setPendingSyncModal(null);
      showSuccessBanner('Đã lưu thành công toàn bộ hồ sơ năng lực của bạn.');
    } finally {
      setIsSaving(false);
    }
  };

  // Thao tác Khối 2: Kỹ năng công nghệ
  const handleAddSkill = () => {
    const trimmed = newSkillText.trim();
    if (!trimmed || resume.skills.includes(trimmed)) return;
    setResume((prev) => ({
      ...prev,
      skills: [...prev.skills, trimmed],
    }));
    setNewSkillText('');
  };

  const handleRemoveSkill = (sk: string) => {
    setResume((prev) => ({
      ...prev,
      skills: prev.skills.filter((item) => item !== sk),
    }));
  };

  // Thao tác Khối 3: Dự án thực tế
  const openAddProjectModal = () => {
    setProjectModalState({
      open: true,
      editingId: null,
      name: '',
      role: '',
      period: '',
      techStack: '',
      bulletsText: '',
    });
  };

  const openEditProjectModal = (proj: ResumeProjectItem) => {
    setProjectModalState({
      open: true,
      editingId: proj.id,
      name: proj.name,
      role: proj.role,
      period: proj.period,
      techStack: proj.techStack,
      bulletsText: proj.bullets.join('\n'),
    });
  };

  const handleSaveProjectModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectModalState.name.trim()) return;
    const bullets = projectModalState.bulletsText
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);

    const newItem: ResumeProjectItem = {
      id: projectModalState.editingId || `proj-${Date.now()}`,
      name: projectModalState.name.trim(),
      role: projectModalState.role.trim(),
      period: projectModalState.period.trim(),
      techStack: projectModalState.techStack.trim(),
      bullets:
        bullets.length > 0
          ? bullets
          : ['Hoàn thiện kiến trúc và triển khai tính năng cốt lõi của dự án.'],
    };

    setResume((prev) => ({
      ...prev,
      projects: projectModalState.editingId
        ? prev.projects.map((p) => (p.id === projectModalState.editingId ? newItem : p))
        : [...prev.projects, newItem],
    }));
    setProjectModalState((prev) => ({ ...prev, open: false }));
  };

  const handleDeleteProject = (id: string) => {
    setResume((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
  };

  // Thao tác Khối 4: Kinh nghiệm làm việc
  const openAddWorkExpModal = () => {
    setWorkExpModalState({
      open: true,
      editingId: null,
      company: '',
      position: '',
      period: '',
      summary: '',
    });
  };

  const openEditWorkExpModal = (exp: ResumeWorkExperienceItem) => {
    setWorkExpModalState({
      open: true,
      editingId: exp.id,
      company: exp.company,
      position: exp.position,
      period: exp.period,
      summary: exp.summary,
    });
  };

  const handleSaveWorkExpModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workExpModalState.company.trim() || !workExpModalState.position.trim()) return;
    const newItem: ResumeWorkExperienceItem = {
      id: workExpModalState.editingId || `exp-${Date.now()}`,
      company: workExpModalState.company.trim(),
      position: workExpModalState.position.trim(),
      period: workExpModalState.period.trim(),
      summary: workExpModalState.summary.trim(),
    };
    setResume((prev) => ({
      ...prev,
      workExperience: workExpModalState.editingId
        ? prev.workExperience.map((w) =>
            w.id === workExpModalState.editingId ? newItem : w
          )
        : [...prev.workExperience, newItem],
    }));
    setWorkExpModalState((prev) => ({ ...prev, open: false }));
  };

  const handleDeleteWorkExp = (id: string) => {
    setResume((prev) => ({
      ...prev,
      workExperience: prev.workExperience.filter((w) => w.id !== id),
    }));
  };

  // Thao tác Khối 5: Học vấn
  const openAddEducationModal = () => {
    setEducationModalState({
      open: true,
      editingId: null,
      school: '',
      degree: '',
      period: '',
      gpaOrHonors: '',
    });
  };

  const openEditEducationModal = (edu: ResumeEducationItem) => {
    setEducationModalState({
      open: true,
      editingId: edu.id,
      school: edu.school,
      degree: edu.degree,
      period: edu.period,
      gpaOrHonors: edu.gpaOrHonors || '',
    });
  };

  const handleSaveEducationModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!educationModalState.school.trim() || !educationModalState.degree.trim()) return;
    const newItem: ResumeEducationItem = {
      id: educationModalState.editingId || `edu-${Date.now()}`,
      school: educationModalState.school.trim(),
      degree: educationModalState.degree.trim(),
      period: educationModalState.period.trim(),
      gpaOrHonors: educationModalState.gpaOrHonors.trim() || undefined,
    };
    setResume((prev) => ({
      ...prev,
      education: educationModalState.editingId
        ? prev.education.map((ed) =>
            ed.id === educationModalState.editingId ? newItem : ed
          )
        : [...prev.education, newItem],
    }));
    setEducationModalState((prev) => ({ ...prev, open: false }));
  };

  const handleDeleteEducation = (id: string) => {
    setResume((prev) => ({
      ...prev,
      education: prev.education.filter((ed) => ed.id !== id),
    }));
  };

  // Thao tác Khối 6: Chứng chỉ & Giải thưởng
  const openAddAwardModal = () => {
    setAwardModalState({
      open: true,
      editingId: null,
      title: '',
      issuer: '',
      dateOrCode: '',
      detail: '',
    });
  };

  const openEditAwardModal = (item: ResumeAwardCertItem) => {
    setAwardModalState({
      open: true,
      editingId: item.id,
      title: item.title,
      issuer: item.issuer,
      dateOrCode: item.dateOrCode,
      detail: item.detail || '',
    });
  };

  const handleSaveAwardModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardModalState.title.trim()) return;
    const newItem: ResumeAwardCertItem = {
      id: awardModalState.editingId || `cert-${Date.now()}`,
      title: awardModalState.title.trim(),
      issuer: awardModalState.issuer.trim(),
      dateOrCode: awardModalState.dateOrCode.trim(),
      detail: awardModalState.detail.trim() || undefined,
    };
    setResume((prev) => ({
      ...prev,
      awardsAndCerts: awardModalState.editingId
        ? prev.awardsAndCerts.map((a) =>
            a.id === awardModalState.editingId ? newItem : a
          )
        : [...prev.awardsAndCerts, newItem],
    }));
    setAwardModalState((prev) => ({ ...prev, open: false }));
  };

  const handleDeleteAward = (id: string) => {
    setResume((prev) => ({
      ...prev,
      awardsAndCerts: prev.awardsAndCerts.filter((a) => a.id !== id),
    }));
  };

  // Tính toán các mục mới phát hiện để hiển thị trực quan trong Smart Sync Modal
  const newlyDetectedSkills = pendingSyncModal
    ? pendingSyncModal.parsedResume.skills.filter(
        (s) => !resume.skills.includes(s)
      )
    : [];
  const newlyDetectedProjects = pendingSyncModal
    ? pendingSyncModal.parsedResume.projects.filter(
        (p) =>
          !resume.projects.some(
            (cur) => cur.name.trim().toLowerCase() === p.name.trim().toLowerCase()
          )
      )
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* ========================================================================
          THANH THAO TÁC PHÍA TRÊN (TẢI LÊN CV PDF + CHỈNH SỬA / LƯU THÔNG TIN)
         ======================================================================== */}
      <div className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#D1FAE5] dark:bg-emerald-950/80 flex items-center justify-center text-[#059669] dark:text-[#34D399] shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono font-semibold text-[#0F172A] dark:text-[#ECFDF5] truncate">
              {latestCvFileName} <span className="text-[#475569] dark:text-[#94A3B8]">·</span>{' '}
              <span className="font-sans font-normal text-[#475569] dark:text-[#94A3B8]">
                Cập nhật ngày {latestCvUpdatedAt}
              </span>
            </div>
            <div className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
              Bản hồ sơ năng lực 6 khối chuẩn quốc tế dùng để xét duyệt tại Phòng Luyện Phỏng Vấn
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleUploadCvFile}
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {isUploading ? 'Đang phân tích CV...' : 'Tải lên / Cập nhật CV (PDF)'}
            </span>
          </button>

          {isEditing ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveResumeToBackend}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu thông tin'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Chỉnh sửa thông tin</span>
            </button>
          )}
        </div>
      </div>

      {/* BANNER THÔNG BÁO XANH NGỌC BÍCH */}
      {statusBanner && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-[#D1FAE5] dark:bg-emerald-950/90 border border-[#10B981] text-[#065F46] dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-2xs"
        >
          <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {isLoadingProfile ? (
        <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-10 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#10B981] animate-spin mx-auto" />
          <p className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
            Đang tải hồ sơ năng lực từ hệ thống...
          </p>
        </div>
      ) : (
        /* ========================================================================
            TỜ HỒ SƠ CHÍNH (PAPER-STYLE RESUME VIEW — ĐẦY ĐỦ 6 KHỐI CHUẨN QUỐC TẾ)
           ======================================================================== */
        <article
          aria-label="Hồ sơ năng lực cá nhân"
          className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] shadow-[0_4px_24px_rgba(15,23,42,0.04)] p-7 sm:p-11 space-y-8"
        >
          {/* ====================================================================
              KHỐI 1: THÔNG TIN CÁ NHÂN & MỤC TIÊU NGHỀ NGHIỆP
             ==================================================================== */}
          <header className="pb-6 border-b border-[#E2ECE7] dark:border-[#1E2D24] space-y-4">
            {isEditing ? (
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                  Khối 1: Thông tin cá nhân &amp; Mục tiêu nghề nghiệp
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      Họ và tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={resume.fullName}
                      onChange={(e) => setResume({ ...resume, fullName: e.target.value })}
                      placeholder="VD: Nguyễn Văn An"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-sm font-bold focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      Headline / Vị trí chuyên môn
                    </label>
                    <input
                      type="text"
                      value={resume.headline}
                      onChange={(e) => setResume({ ...resume, headline: e.target.value })}
                      placeholder="VD: Kỹ Sư Backend Python & Ứng Dụng AI"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-sm font-semibold focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      Email liên hệ
                    </label>
                    <input
                      type="email"
                      value={resume.email}
                      onChange={(e) => setResume({ ...resume, email: e.target.value })}
                      placeholder="email@domain.com"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      Số điện thoại
                    </label>
                    <input
                      type="text"
                      value={resume.phone}
                      onChange={(e) => setResume({ ...resume, phone: e.target.value })}
                      placeholder="0908 123 456"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      GitHub URL
                    </label>
                    <input
                      type="text"
                      value={resume.githubUrl}
                      onChange={(e) => setResume({ ...resume, githubUrl: e.target.value })}
                      placeholder="github.com/username"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] mb-1">
                      LinkedIn URL
                    </label>
                    <input
                      type="text"
                      value={resume.linkedinUrl}
                      onChange={(e) => setResume({ ...resume, linkedinUrl: e.target.value })}
                      placeholder="linkedin.com/in/username"
                      className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-mono focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <AvatarWithFallback
                  src={resume.avatarUrl}
                  name={resume.fullName || 'Học viên 3T'}
                  className="w-16 h-16 rounded-2xl shrink-0"
                />
                <div className="space-y-1.5 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#ECFDF5]">
                    {resume.fullName || 'Chưa cập nhật họ tên'}
                  </h1>
                  <p className="text-sm sm:text-base font-semibold text-[#059669] dark:text-[#34D399]">
                    {resume.headline || 'Chưa cập nhật vị trí chuyên môn'}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-[#475569] dark:text-[#94A3B8]">
                  {resume.email && (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Mail className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>{resume.email}</span>
                    </span>
                  )}
                  {resume.phone && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>{resume.phone}</span>
                      </span>
                    </>
                  )}
                  {resume.githubUrl && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Globe className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>{resume.githubUrl}</span>
                      </span>
                    </>
                  )}
                  {resume.linkedinUrl && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{resume.linkedinUrl}</span>
                    </>
                  )}
                  </div>
                </div>
              </div>
            )}

            {/* Mục tiêu nghề nghiệp (Career Objective) */}
            <div className="pt-2 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8]">
                Mục tiêu nghề nghiệp
              </div>
              {isEditing ? (
                <textarea
                  rows={3}
                  value={resume.careerObjective}
                  onChange={(e) =>
                    setResume({ ...resume, careerObjective: e.target.value })
                  }
                  placeholder="Mô tả định hướng nghề nghiệp, vị trí ứng tuyển và giá trị đóng góp..."
                  className="w-full p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-[#10B981]"
                />
              ) : (
                <p className="text-xs sm:text-sm text-[#0F172A] dark:text-[#ECFDF5] leading-relaxed">
                  {resume.careerObjective || 'Chưa cập nhật mục tiêu nghề nghiệp.'}
                </p>
              )}
            </div>
          </header>

          {/* ====================================================================
              KHỐI 2: KỸ NĂNG CÔNG NGHỆ (SKILLS)
             ==================================================================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-2">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                Kỹ năng công nghệ
              </h2>
              <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">
                {resume.skills.length} kỹ năng
              </span>
            </div>

            {resume.skills.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Chưa có kỹ năng nào được thêm. Bấm &quot;Chỉnh sửa thông tin&quot; hoặc tải CV PDF lên để cập nhật.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {resume.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5]"
                  >
                    <span>{skill}</span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        aria-label={`Xóa kỹ năng ${skill}`}
                        className="text-[#475569] hover:text-[#EF4444] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {isEditing && (
              <div className="flex items-center gap-2 pt-1 max-w-lg">
                <input
                  type="text"
                  value={newSkillText}
                  onChange={(e) => setNewSkillText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  placeholder="Nhập kỹ năng mới (VD: FastAPI, pgvector, LangGraph)..."
                  className="flex-1 px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm kỹ năng</span>
                </button>
              </div>
            )}
          </section>

          {/* ====================================================================
              KHỐI 3: DỰ ÁN THỰC TẾ (PROJECTS)
             ==================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-2">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#10B981]" />
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                  Dự án thực tế
                </h2>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={openAddProjectModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm dự án</span>
                </button>
              )}
            </div>

            {resume.projects.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Chưa có dự án thực tế nào trong hồ sơ.
              </p>
            ) : (
              <div className="space-y-5">
                {resume.projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="p-4 rounded-xl bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {proj.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                            {proj.role}
                          </span>
                          {proj.techStack && (
                            <>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]">
                                Tech Stack: {proj.techStack}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                          {proj.period}
                        </span>
                        {isEditing && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              type="button"
                              onClick={() => openEditProjectModal(proj)}
                              className="px-2.5 py-1 rounded-md bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(proj.id)}
                              className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-600 dark:text-red-400 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Xóa</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      {proj.bullets.map((b, bIdx) => (
                        <li
                          key={bIdx}
                          className="text-[#0F172A]/90 dark:text-[#ECFDF5]/90"
                        >
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ====================================================================
              KHỐI 4: KINH NGHIỆM LÀM VIỆC (WORK EXPERIENCE)
             ==================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#10B981]" />
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                  Kinh nghiệm làm việc
                </h2>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={openAddWorkExpModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm kinh nghiệm làm việc</span>
                </button>
              )}
            </div>

            {resume.workExperience.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Chưa cập nhật kinh nghiệm làm việc.
              </p>
            ) : (
              <div className="space-y-4">
                {resume.workExperience.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 rounded-xl bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                          {exp.position}
                        </h3>
                        <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                          {exp.company}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                          {exp.period}
                        </span>
                        {isEditing && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              type="button"
                              onClick={() => openEditWorkExpModal(exp)}
                              className="px-2.5 py-1 rounded-md bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWorkExp(exp.id)}
                              className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-600 dark:text-red-400 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Xóa</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-[#0F172A]/90 dark:text-[#ECFDF5]/90 leading-relaxed">
                      {exp.summary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ====================================================================
              KHỐI 5: HỌC VẤN (EDUCATION)
             ==================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#10B981]" />
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                  Học vấn
                </h2>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={openAddEducationModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm học vấn</span>
                </button>
              )}
            </div>

            {resume.education.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Chưa cập nhật thông tin học vấn.
              </p>
            ) : (
              <div className="space-y-3">
                {resume.education.map((edu) => (
                  <div
                    key={edu.id}
                    className="p-4 rounded-xl bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {edu.degree}
                      </h3>
                      <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                          {edu.school}
                        </span>
                        {edu.gpaOrHonors && <span> · {edu.gpaOrHonors}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                        {edu.period}
                      </span>
                      {isEditing && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            type="button"
                            onClick={() => openEditEducationModal(edu)}
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEducation(edu.id)}
                            className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-600 dark:text-red-400 cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ====================================================================
              KHỐI 6: CHỨNG CHỈ & GIẢI THƯỞNG (AWARDS & CERTIFICATIONS)
             ==================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#10B981]" />
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                  Chứng chỉ &amp; Giải thưởng
                </h2>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={openAddAwardModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30 text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm chứng chỉ / giải thưởng</span>
                </button>
              )}
            </div>

            {resume.awardsAndCerts.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Chưa cập nhật chứng chỉ hoặc giải thưởng.
              </p>
            ) : (
              <div className="space-y-3">
                {resume.awardsAndCerts.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border border-[#E2ECE7] dark:border-[#1E2D24] flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {item.title}
                      </h3>
                      <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                        <span className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                          {item.issuer}
                        </span>
                        {item.detail && <span> · {item.detail}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                        {item.dateOrCode}
                      </span>
                      {isEditing && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            type="button"
                            onClick={() => openEditAwardModal(item)}
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-[11px] font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAward(item.id)}
                            className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-600 dark:text-red-400 cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>
      )}

      {/* ========================================================================
          MODAL THÊM / SỬA DỰ ÁN THỰC TẾ (KHỐI 3)
         ======================================================================== */}
      {projectModalState.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                {projectModalState.editingId ? 'Cập nhật dự án thực tế' : 'Thêm dự án thực tế mới'}
              </h3>
              <button
                type="button"
                onClick={() => setProjectModalState((prev) => ({ ...prev, open: false }))}
                className="text-[#475569] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProjectModal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  Tên dự án <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={projectModalState.name}
                  onChange={(e) =>
                    setProjectModalState({ ...projectModalState, name: e.target.value })
                  }
                  placeholder="VD: Hệ thống Trợ lý AI Tra cứu Tài liệu Doanh nghiệp"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Vai trò trong dự án <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={projectModalState.role}
                    onChange={(e) =>
                      setProjectModalState({ ...projectModalState, role: e.target.value })
                    }
                    placeholder="VD: Lead AI & Backend Developer"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    Thời gian thực hiện <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={projectModalState.period}
                    onChange={(e) =>
                      setProjectModalState({ ...projectModalState, period: e.target.value })
                    }
                    placeholder="VD: 08/2026 – 11/2026"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Công nghệ sử dụng (Tech Stack)
                </label>
                <input
                  type="text"
                  value={projectModalState.techStack}
                  onChange={(e) =>
                    setProjectModalState({
                      ...projectModalState,
                      techStack: e.target.value,
                    })
                  }
                  placeholder="VD: Python, FastAPI, PostgreSQL (pgvector), Redis, Docker"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Các thành tựu đạt được (Mỗi dòng 1 ý) <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={projectModalState.bulletsText}
                  onChange={(e) =>
                    setProjectModalState({
                      ...projectModalState,
                      bulletsText: e.target.value,
                    })
                  }
                  placeholder={
                    'Xây dựng đường ống bóc tách 500+ tài liệu PDF bảo toàn bảng biểu.\nKết hợp Hybrid Search giảm độ trễ phản hồi xuống dưới 800ms.'
                  }
                  className="w-full p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProjectModalState((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold cursor-pointer"
                >
                  Lưu dự án
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL THÊM / SỬA KINH NGHIỆM LÀM VIỆC (KHỐI 4)
         ======================================================================== */}
      {workExpModalState.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                {workExpModalState.editingId
                  ? 'Cập nhật kinh nghiệm làm việc'
                  : 'Thêm kinh nghiệm làm việc'}
              </h3>
              <button
                type="button"
                onClick={() => setWorkExpModalState((prev) => ({ ...prev, open: false }))}
                className="text-[#475569] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveWorkExpModal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  Tên công ty / Tổ chức <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={workExpModalState.company}
                  onChange={(e) =>
                    setWorkExpModalState({ ...workExpModalState, company: e.target.value })
                  }
                  placeholder="VD: Công ty Phần mềm TechViet"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Vị trí công việc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={workExpModalState.position}
                    onChange={(e) =>
                      setWorkExpModalState({
                        ...workExpModalState,
                        position: e.target.value,
                      })
                    }
                    placeholder="VD: Backend Python Developer"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    Thời gian làm việc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={workExpModalState.period}
                    onChange={(e) =>
                      setWorkExpModalState({ ...workExpModalState, period: e.target.value })
                    }
                    placeholder="VD: 06/2025 – Hiện tại"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Mô tả đóng góp &amp; kết quả công việc <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={workExpModalState.summary}
                  onChange={(e) =>
                    setWorkExpModalState({ ...workExpModalState, summary: e.target.value })
                  }
                  placeholder="Mô tả trách nhiệm chính, hệ thống đã phát triển và con số kết quả đạt được..."
                  className="w-full p-3 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWorkExpModalState((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold cursor-pointer"
                >
                  Lưu kinh nghiệm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL THÊM / SỬA HỌC VẤN (KHỐI 5)
         ======================================================================== */}
      {educationModalState.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                {educationModalState.editingId ? 'Cập nhật học vấn' : 'Thêm học vấn mới'}
              </h3>
              <button
                type="button"
                onClick={() => setEducationModalState((prev) => ({ ...prev, open: false }))}
                className="text-[#475569] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEducationModal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  Tên trường Đại học / Cao đẳng <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={educationModalState.school}
                  onChange={(e) =>
                    setEducationModalState({
                      ...educationModalState,
                      school: e.target.value,
                    })
                  }
                  placeholder="VD: Trường Đại học Bách Khoa"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Bằng cấp / Chuyên ngành <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={educationModalState.degree}
                  onChange={(e) =>
                    setEducationModalState({
                      ...educationModalState,
                      degree: e.target.value,
                    })
                  }
                  placeholder="VD: Cử nhân Kỹ thuật Phần mềm — Khoa CNTT"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Niên khóa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={educationModalState.period}
                    onChange={(e) =>
                      setEducationModalState({
                        ...educationModalState,
                        period: e.target.value,
                      })
                    }
                    placeholder="VD: 2020 – 2024"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    GPA hoặc Xếp loại
                  </label>
                  <input
                    type="text"
                    value={educationModalState.gpaOrHonors}
                    onChange={(e) =>
                      setEducationModalState({
                        ...educationModalState,
                        gpaOrHonors: e.target.value,
                      })
                    }
                    placeholder="VD: GPA: 3.4 / 4.0 · Loại Giỏi"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEducationModalState((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold cursor-pointer"
                >
                  Lưu học vấn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL THÊM / SỬA CHỨNG CHỈ & GIẢI THƯỞNG (KHỐI 6)
         ======================================================================== */}
      {awardModalState.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                {awardModalState.editingId
                  ? 'Cập nhật chứng chỉ / giải thưởng'
                  : 'Thêm chứng chỉ / giải thưởng'}
              </h3>
              <button
                type="button"
                onClick={() => setAwardModalState((prev) => ({ ...prev, open: false }))}
                className="text-[#475569] hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAwardModal} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  Tên Chứng chỉ hoặc Giải thưởng <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={awardModalState.title}
                  onChange={(e) =>
                    setAwardModalState({ ...awardModalState, title: e.target.value })
                  }
                  placeholder="VD: Chứng chỉ Kỹ Sư AI Thực Chiến / TOEIC 800"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Tổ chức cấp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={awardModalState.issuer}
                    onChange={(e) =>
                      setAwardModalState({ ...awardModalState, issuer: e.target.value })
                    }
                    placeholder="VD: 3T Academy, IIG Việt Nam"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    Ngày cấp hoặc Mã xác thực <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={awardModalState.dateOrCode}
                    onChange={(e) =>
                      setAwardModalState({
                        ...awardModalState,
                        dateOrCode: e.target.value,
                      })
                    }
                    placeholder="VD: CERT-3T-2026-8891"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Chi tiết kết quả / Ghi chú thêm
                </label>
                <input
                  type="text"
                  value={awardModalState.detail}
                  onChange={(e) =>
                    setAwardModalState({ ...awardModalState, detail: e.target.value })
                  }
                  placeholder="VD: Điểm tổng kết 94/100 · Hoàn thành xuất sắc đồ án cuối khóa"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAwardModalState((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-lg border border-[#E2ECE7] dark:border-[#1E2D24] font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold cursor-pointer"
                >
                  Lưu chứng chỉ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          5. HỘP THOẠI ĐỐI SOÁT THÔNG MINH (SMART DIFF & SYNC MODAL KHI TẢI CV PDF)
         ======================================================================== */}
      {pendingSyncModal && pendingSyncModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-sync-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-[#111A15] border-2 border-[#10B981] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-start justify-between gap-3 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-[#34D399] text-[11px] font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ĐỐI SOÁT THÔNG MINH TỪ FILE CV PDF</span>
                </div>
                <h2
                  id="smart-sync-modal-title"
                  className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]"
                >
                  Chọn các mục bạn muốn đồng bộ từ &ldquo;{pendingSyncModal.fileName}&rdquo;
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  Hệ thống đã bóc tách nội dung từ file PDF. Vui lòng kiểm tra đối chiếu bên dưới và tích chọn các mục bạn muốn cập nhật vào hồ sơ năng lực.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingSyncModal(null)}
                className="text-[#475569] hover:text-[#0F172A] dark:hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 text-xs">
              {/* Mục 1: [ ] Họ và tên (Mặc định KHÔNG tích để giữ tên thật cấp chứng chỉ) */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncFullName}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncFullName: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Họ và tên
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Mặc định giữ tên hiện tại để in Chứng chỉ tốt nghiệp</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]">
                      <div className="text-[10px] text-[#64748B]">Giữ tên hiện tại:</div>
                      <div className="font-semibold text-[#0F172A] dark:text-[#ECFDF5]">
                        {resume.fullName || 'Chưa có'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-500/5 border border-[#10B981]/30">
                      <div className="text-[10px] text-[#059669] dark:text-[#34D399]">
                        Đổi theo CV mới:
                      </div>
                      <div className="font-semibold text-[#059669] dark:text-[#34D399]">
                        {pendingSyncModal.parsedResume.fullName}
                      </div>
                    </div>
                  </div>
                </div>
              </label>

              {/* Mục 2: [x] Headline / Bio */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncHeadline}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncHeadline: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Headline / Danh hiệu chuyên môn
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[#475569] dark:text-[#94A3B8]">
                    <span className="line-through opacity-75">
                      {resume.headline || 'Chưa cập nhật'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    <span className="font-semibold text-[#059669] dark:text-[#34D399]">
                      {pendingSyncModal.parsedResume.headline}
                    </span>
                  </div>
                </div>
              </label>

              {/* Mục 3: [x] Mục tiêu nghề nghiệp */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncCareerObjective}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncCareerObjective: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Mục tiêu nghề nghiệp
                  </div>
                  <p className="text-[#059669] dark:text-[#34D399] leading-relaxed bg-emerald-500/5 p-2.5 rounded-lg border border-[#10B981]/25">
                    {pendingSyncModal.parsedResume.careerObjective}
                  </p>
                </div>
              </label>

              {/* Mục 4: [x] Kỹ năng */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncSkills}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncSkills: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1.5">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Kỹ năng công nghệ: Thêm các kỹ năng mới phát hiện từ CV ({newlyDetectedSkills.length} kỹ năng mới)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(newlyDetectedSkills.length > 0
                      ? newlyDetectedSkills
                      : pendingSyncModal.parsedResume.skills
                    ).map((sk) => (
                      <span
                        key={sk}
                        className="px-2.5 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-[#34D399] font-semibold text-[11px]"
                      >
                        + {sk}
                      </span>
                    ))}
                  </div>
                </div>
              </label>

              {/* Mục 5: [x] Dự án */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncProjects}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncProjects: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Dự án thực tế: Thêm các dự án mới đọc được từ CV ({newlyDetectedProjects.length} dự án mới)
                  </div>
                  <div className="space-y-1 text-[#475569] dark:text-[#94A3B8]">
                    {(newlyDetectedProjects.length > 0
                      ? newlyDetectedProjects
                      : pendingSyncModal.parsedResume.projects.slice(0, 1)
                    ).map((p) => (
                      <div
                        key={p.id}
                        className="p-2 rounded-lg bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24]"
                      >
                        <div className="font-semibold text-[#059669] dark:text-[#34D399]">
                          + {p.name} ({p.period})
                        </div>
                        <div className="text-[11px] font-mono text-[#64748B]">
                          {p.role} · {p.techStack}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </label>

              {/* Mục 6: [x] Kinh nghiệm làm việc & Học vấn */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                <input
                  type="checkbox"
                  checked={syncSelection.syncExperienceAndEdu}
                  onChange={(e) =>
                    setSyncSelection({
                      ...syncSelection,
                      syncExperienceAndEdu: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-[#10B981] rounded cursor-pointer"
                />
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Kinh nghiệm làm việc, Học vấn &amp; Giải thưởng: Thêm các mục mới phát hiện vào hồ sơ
                  </div>
                  <p className="text-[#475569] dark:text-[#94A3B8]">
                    Bổ sung {pendingSyncModal.parsedResume.workExperience.length} mục kinh nghiệm,{' '}
                    {pendingSyncModal.parsedResume.education.length} mục học vấn và{' '}
                    {pendingSyncModal.parsedResume.awardsAndCerts.length} chứng chỉ/giải thưởng từ CV.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
              <button
                type="button"
                onClick={() => setPendingSyncModal(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E2ECE7] dark:border-[#1E2D24] bg-[#F7FBF9] dark:bg-[#090F0C] hover:border-slate-400 text-xs font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmSmartSync}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer transition-colors shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? 'Đang đồng bộ...' : 'Xác nhận đồng bộ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
