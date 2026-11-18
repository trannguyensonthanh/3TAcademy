import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { catalogApi } from '../services/catalog.api';
import { CertificateRecord } from '../types/domain';
import { GraduationCertificateDiploma } from '../components/GraduationCertificateDiploma';

interface CertificateVerifyViewProps {
  initialCode?: string;
}

export const CertificateVerifyView: React.FC<CertificateVerifyViewProps> = ({ initialCode = '' }) => {
  const { navigate } = useAcademy();
  const [codeInput, setCodeInput] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedCode, setSearchedCode] = useState('');
  const [verifyState, setVerifyState] = useState<{
    found: boolean;
    message?: string;
    certificate: CertificateRecord | null;
  } | null>(null);

  const runVerification = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setSearchedCode(trimmed);
    try {
      const res = await catalogApi.verifyCertificateByCode(trimmed);
      setVerifyState({
        found: Boolean(res.found && res.certificate),
        message: res.message,
        certificate: res.certificate,
      });
    } catch (err) {
      setVerifyState({
        found: false,
        message: err instanceof Error ? err.message : 'Không thể tra cứu văn bằng lúc này.',
        certificate: null,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode.trim()) {
      setCodeInput(initialCode.trim());
      void runVerification(initialCode.trim());
    }
  }, [initialCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    navigate(`/certificates/verify/${encodeURIComponent(trimmed)}`);
    void runVerification(trimmed);
  };

  const cert = verifyState?.certificate;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#10B981] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Về trang chủ 3T Academy
        </button>
        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-bold">
          Cổng Tra Cứu Sổ Đăng Bộ Văn Bằng Số (HMAC-SHA256)
        </span>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-8 shadow-sm space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold text-[#0F172A] dark:text-[#ECFDF5] flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#10B981]" />
            Xác Thực Bằng Tốt Nghiệp Điện Tử
          </h1>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
            Nhập mã số chứng chỉ trên văn bằng (hoặc quét mã QR trên Bằng Tốt Nghiệp PDF) để kiểm tra chữ ký số HMAC-SHA256 và trạng thái hiệu lực theo thời gian thực.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Ví dụ: 3T-CERT-2026-PY0041"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-sm font-mono text-[#0F172A] dark:text-[#ECFDF5] focus:outline-none focus:border-[#10B981]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !codeInput.trim()}
            className="px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white text-sm font-bold transition-colors cursor-pointer shrink-0"
          >
            {isLoading ? 'Đang xác thực...' : 'Kiểm tra văn bằng'}
          </button>
        </form>
      </div>

      {verifyState && !verifyState.found && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 p-6 flex items-start gap-4">
          <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200">
              Không tìm thấy văn bằng hợp lệ cho mã &ldquo;{searchedCode}&rdquo;
            </h2>
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {verifyState.message ||
                'Mã số chứng chỉ không tồn tại trong Sổ đăng bộ Văn bằng của 3T Academy. Vui lòng kiểm tra lại chính xác từng ký tự.'}
            </p>
          </div>
        </div>
      )}

      {verifyState && verifyState.found && cert && (
        <div className="space-y-6">
          {cert.isRevoked ? (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 p-6 flex items-start gap-4">
              <ShieldAlert className="w-7 h-7 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h2 className="text-lg font-extrabold text-rose-900 dark:text-rose-200">
                  CẢNH BÁO: VĂN BẰNG ĐÃ BỊ THU HỒI HIỆU LỰC
                </h2>
                <p className="text-sm text-rose-800 dark:text-rose-300">
                  Văn bằng mã số <strong className="font-mono">{cert.certificateCode}</strong> của{' '}
                  <strong>{cert.studentName}</strong> đã bị Hội đồng Khảo thí thu hồi.
                  {cert.revokedReason ? ` Lý do: ${cert.revokedReason}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-extrabold text-emerald-950 dark:text-emerald-200">
                    Văn Bằng Chính Thức Hợp Lệ · Chữ Ký Số HMAC-SHA256 Khớp 100%
                  </h2>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                    Cấp cho học viên <strong>{cert.studentName}</strong> ({cert.studentEmail}) · Lớp{' '}
                    <strong className="font-mono">{cert.cohortCode}</strong> · Ngày cấp {cert.issuedAt}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-mono font-bold">
                VALID SIGNATURE
              </span>
            </div>
          )}

          {!cert.isRevoked && <GraduationCertificateDiploma certificate={cert} />}
        </div>
      )}
    </div>
  );
};
