import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileCheck2,
  QrCode,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CertificateRecord } from '../types/domain';
import { exportCertificateToPdf, getAcademicClassification } from '../utils/certificatePdfExport';

interface GraduationCertificateDiplomaProps {
  certificate: CertificateRecord;
  showActionHeader?: boolean;
  onExportSuccess?: (fileName: string) => void;
}

export const GraduationCertificateDiploma: React.FC<GraduationCertificateDiplomaProps> = ({
  certificate,
  showActionHeader = true,
  onExportSuccess,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFileName, setExportedFileName] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const classification = getAcademicClassification(certificate.finalScore);

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const fileName = await exportCertificateToPdf(certificate);
      setExportedFileName(fileName);
      if (onExportSuccess) {
        onExportSuccess(fileName);
      }
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Không thể xuất file PDF chứng chỉ. Vui lòng thử lại.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {showActionHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-950 text-white px-5 py-4 rounded-xl border border-emerald-800 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Bằng Tốt Nghiệp &amp; Khen Thưởng
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-800/90 border border-emerald-600 text-[11px] font-mono font-bold text-emerald-200">
                  {certificate.certificateCode}
                </span>
              </div>
              <p className="text-xs text-emerald-200/90 mt-0.5">
                Khổ A4 ngang, định dạng in ấn và chữ ký số xác thực.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting}
            data-testid="export-certificate-pdf-btn"
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Đang xuất PDF...' : 'Xuất Bằng Tốt Nghiệp PDF'}
          </button>
        </div>
      )}

      {exportedFileName && (
        <div
          data-testid="pdf-export-success-banner"
          className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex flex-wrap items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 font-semibold">
            <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Đã xuất thành công Bằng Tốt Nghiệp định dạng PDF chuẩn in ấn:{' '}
            <strong className="font-mono text-emerald-950">{exportedFileName}</strong>
          </span>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
          >
            Tải lại bản PDF
          </button>
        </div>
      )}

      {exportError && (
        <div className="px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          {exportError}
        </div>
      )}

      {/* Ceremonial "Bằng Khen / Bằng Tốt Nghiệp" Visual Frame */}
      <div
        data-testid="graduation-diploma-card"
        className="relative rounded-xl bg-[#FFFDF7] p-3 sm:p-5 shadow-md border-4 border-[#064E3B]"
      >
        {/* Outer Gold Frame */}
        <div className="relative border-2 border-amber-700 p-1.5 sm:p-2.5 bg-gradient-to-br from-[#FFFDF8] via-[#FEF9EC] to-[#FDF4DC]">
          {/* Inner Pinstripe Frame */}
          <div className="relative border border-amber-600/70 px-5 py-7 sm:px-10 sm:py-9">
            {/* 4 Corner Ornaments */}
            <div className="w-5 h-5 border-t-2 border-l-2 border-amber-700 absolute top-2 left-2 pointer-events-none" />
            <div className="w-5 h-5 border-t-2 border-r-2 border-amber-700 absolute top-2 right-2 pointer-events-none" />
            <div className="w-5 h-5 border-b-2 border-l-2 border-amber-700 absolute bottom-2 left-2 pointer-events-none" />
            <div className="w-5 h-5 border-b-2 border-r-2 border-amber-700 absolute bottom-2 right-2 pointer-events-none" />

            {/* Top Official Header: Bilingual Institutional & National Motto */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border-b border-amber-700/25 pb-5">
              <div className="md:col-span-5 text-center">
                <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-950">
                  HỌC VIỆN CÔNG NGHỆ & AI THỰC CHIẾN 3T ACADEMY
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mt-0.5">
                  HỘI ĐỒNG ĐÀO TẠO & KHẢO THÍ CẤP CAO
                </p>
                <div className="w-28 h-0.5 bg-amber-700/60 mx-auto mt-1.5" />
              </div>

              <div className="md:col-span-2 flex justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-950 border-2 border-amber-500 shadow-sm flex flex-col items-center justify-center text-amber-300">
                  <Award className="w-6 h-6 text-amber-400" />
                  <span className="text-[9px] font-black tracking-widest uppercase">3T SEAL</span>
                </div>
              </div>

              <div className="md:col-span-5 text-center">
                <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </p>
                <p className="text-xs font-serif font-bold text-slate-800 mt-0.5">
                  Độc lập - Tự do - Hạnh phúc
                </p>
                <div className="w-28 h-0.5 bg-slate-800/70 mx-auto mt-1.5" />
              </div>
            </div>

            {/* Ceremonial Title */}
            <div className="text-center mt-6 mb-5">
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-800 font-bold mb-1">
                CERTIFICATE OF GRADUATION & ACADEMIC EXCELLENCE
              </p>
              <h1 className="text-2xl sm:text-4xl font-serif font-black tracking-normal text-red-900 uppercase">
                BẰNG CHỨNG NHẬN TỐT NGHIỆP
              </h1>
              <p className="text-xs sm:text-sm font-serif italic text-slate-700 mt-2 max-w-2xl mx-auto">
                Hội đồng Đào tạo & Khảo thí Học viện 3T Academy trân trọng trao tặng cho học viên:
              </p>
            </div>

            {/* Recipient Full Name & Identity */}
            <div className="text-center my-5 py-3 px-4 bg-white/80 border-y border-amber-600/30">
              <div
                data-testid="certificate-recipient-name"
                className="text-2xl sm:text-4xl font-serif font-black text-emerald-950 tracking-normal uppercase"
              >
                {certificate.studentName}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                <span>
                  Email: <strong className="text-slate-900">{certificate.studentEmail}</strong>
                </span>
                <span>•</span>
                <span>
                  Lớp: <strong className="font-mono text-slate-900">{certificate.cohortCode}</strong>
                </span>
                <span>•</span>
                <span>
                  Số hiệu: <strong className="font-mono text-amber-900">{certificate.certificateCode}</strong>
                </span>
              </div>
            </div>

            {/* Course Title & Classification */}
            <div className="text-center space-y-3 my-5">
              <p className="text-xs sm:text-sm font-serif italic text-slate-700">
                Đã hoàn thành xuất sắc chương trình đào tạo & đồ án tốt nghiệp khóa học:
              </p>
              <h2 className="text-lg sm:text-2xl font-serif font-bold text-slate-900 max-w-3xl mx-auto leading-normal tracking-normal">
                “{certificate.courseTitle}”
              </h2>

              {/* Classification & Final Score Ribbon */}
              <div className="inline-flex flex-wrap items-center justify-center gap-3 px-5 py-2.5 rounded-lg bg-amber-100/90 border-2 border-amber-600 text-amber-950 shadow-2xs mt-2">
                <span className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold uppercase">
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  Xếp loại: {classification.vi}
                </span>
                <span className="text-amber-700 font-bold">|</span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-950">
                  Điểm: {certificate.finalScore}/100
                </span>
              </div>
            </div>

            {/* Mastered Competencies Grid */}
            {certificate.skillsMastered && certificate.skillsMastered.length > 0 && (
              <div className="mt-6 pt-5 border-t border-amber-700/25">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    Bảng Kết Quả Thẩm Định Năng Lực Chuyên Môn (Verified Competencies)
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600">
                    Đạt chuẩn đầu ra doanh nghiệp
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {certificate.skillsMastered.map((skill) => (
                    <div
                      key={skill.code}
                      className="p-3 rounded-lg bg-white border border-amber-700/25 shadow-2xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-800">
                            {skill.code}
                          </span>
                          <span className="text-xs font-extrabold text-emerald-700">
                            {skill.score}/100
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 leading-snug mt-1">
                          {skill.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Official Signatures, Red Stamp Seal & Cryptographic Verification */}
            <div className="mt-8 pt-6 border-t-2 border-amber-700/30 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              {/* Column 1: QR & Cryptographic Hash */}
              <div className="bg-white/90 p-3.5 rounded-lg border border-amber-700/30 flex items-start gap-3">
                <div className="w-16 h-16 rounded border-2 border-amber-700 bg-white flex flex-col items-center justify-center shrink-0">
                  <QrCode className="w-11 h-11 text-slate-900" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-900 uppercase">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Chứng Thực Chữ Ký Số
                  </div>
                  <p className="text-[11px] font-mono font-bold text-amber-900 mt-0.5">
                    Mã số: {certificate.certificateCode}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Cấp ngày: <strong>{certificate.issuedAt}</strong>
                  </p>
                  <p
                    className="text-[10px] font-mono text-slate-500 truncate mt-1"
                    title={certificate.verificationSignature}
                  >
                    {certificate.verificationSignature}
                  </p>
                </div>
              </div>

              {/* Column 2: Head Instructor Signature */}
              <div className="text-center">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                  TRƯỞNG BAN GIẢNG HUẤN CHUYÊN MÔN
                </p>
                <p className="text-[11px] italic text-slate-500 font-serif">(Chữ ký điện tử đã xác thực)</p>
                <div className="my-3 text-xl font-serif italic font-bold text-blue-900 select-none">
                  Trần Minh Khoa
                </div>
                <p className="text-xs font-extrabold text-slate-900">TS. Trần Minh Khoa</p>
                <p className="text-[11px] text-slate-600">Giảng viên Trưởng bộ môn AI & Data</p>
              </div>

              {/* Column 3: Official Academy Seal Stamp & Director Signature */}
              <div className="text-center relative">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-900">
                  CHỦ TỊCH HỘI ĐỒNG CẤP CHỨNG CHỈ
                </p>
                <p className="text-[11px] italic text-slate-500 font-serif">(Ký tên và đóng dấu pháp nhân)</p>

                <div className="relative flex items-center justify-center my-2">
                  {/* Red Circular Official Seal */}
                  <div className="w-20 h-20 rounded-full border-2 border-red-700/80 flex flex-col items-center justify-center text-red-700/90 -rotate-12 bg-red-50/30 select-none">
                    <span className="text-[8px] font-black uppercase tracking-tighter">3T ACADEMY VN</span>
                    <span className="text-[10px] font-black uppercase border-y border-red-700/60 px-1 my-0.5">
                      ĐÃ XÁC THỰC
                    </span>
                    <span className="text-[7px] font-bold uppercase">OFFICIAL SEAL</span>
                  </div>
                  <div className="ml-2 text-xl font-serif italic font-bold text-red-900 select-none whitespace-nowrap">
                    Trần Nguyễn Sơn Thành
                  </div>
                </div>

                <p className="text-xs font-extrabold text-slate-900">Trần Nguyễn Sơn Thành</p>
                <p className="text-[11px] text-slate-600">Chủ tịch Hội đồng Cấp chứng chỉ 3T Academy</p>
              </div>
            </div>

            {/* Bottom Action Bar Inside Certificate */}
            <div className="mt-6 pt-4 border-t border-amber-700/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-600">
              <span>
                Văn bằng được bảo vệ quyền riêng tư chính chủ và lưu trữ gốc tại Sổ đăng bộ Văn bằng Học viện 3T Academy.
              </span>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-amber-200 font-bold text-xs flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Đang xuất file PDF...' : 'Tải Xuống Bằng Khen PDF (.pdf)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
