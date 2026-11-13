import { CertificateRecord } from '../types/domain';

function stringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) & 0xff;
  }
  return arr;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Wraps a rendered high-resolution JPEG image into a standards-compliant A4 Landscape PDF (%PDF-1.4)
 */
function buildA4LandscapePdfFromJpeg(jpegBytes: Uint8Array, pixelWidth: number, pixelHeight: number): Blob {
  // A4 Landscape dimensions in PostScript points (1 pt = 1/72 inch)
  const pageWidthPt = 841.89;
  const pageHeightPt = 595.28;

  const header = stringToUint8Array('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const obj1 = stringToUint8Array('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const obj2 = stringToUint8Array('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  const obj3 = stringToUint8Array(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );
  const obj4Start = stringToUint8Array(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  const obj4End = stringToUint8Array('\nendstream\nendobj\n');

  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  const obj5 = stringToUint8Array(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  const offsets: number[] = [];
  let currentOffset = header.length;

  offsets.push(currentOffset);
  currentOffset += obj1.length;

  offsets.push(currentOffset);
  currentOffset += obj2.length;

  offsets.push(currentOffset);
  currentOffset += obj3.length;

  offsets.push(currentOffset);
  currentOffset += obj4Start.length + jpegBytes.length + obj4End.length;

  offsets.push(currentOffset);
  currentOffset += obj5.length;

  const xrefOffset = currentOffset;
  let xrefStr = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xrefStr += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = stringToUint8Array(xrefStr);

  const chunks = [header, obj1, obj2, obj3, obj4Start, jpegBytes, obj4End, obj5, xrefBytes];
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const mergedBuffer = new ArrayBuffer(totalLength);
  const mergedView = new Uint8Array(mergedBuffer);
  let pos = 0;
  for (const chunk of chunks) {
    mergedView.set(chunk, pos);
    pos += chunk.length;
  }

  return new Blob([mergedBuffer], {
    type: 'application/pdf',
  });
}

function drawCornerOrnament(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + dirY * size);
  ctx.lineTo(x, y);
  ctx.lineTo(x + dirX * size, y);
  ctx.stroke();

  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x + dirX * 14, y + dirY * (size - 10));
  ctx.lineTo(x + dirX * 14, y + dirY * 14);
  ctx.lineTo(x + dirX * (size - 10), y + dirY * 14);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillRect(x + dirX * 6 - 4, y + dirY * 6 - 4, 8, 8);
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, currentY);
  }
  return currentY;
}

function drawStylizedQrMatrix(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seedText: string) {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  const cells = 15;
  const padding = 10;
  const cellSize = (size - padding * 2) / cells;
  ctx.fillStyle = '#0F172A';

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (r === 0 || r === 3 || c === 0 || c === 3 || (r >= 1 && r <= 2 && c >= 1 && c <= 2)) {
          ctx.fillRect(x + padding + (c0 + c) * cellSize, y + padding + (r0 + r) * cellSize, cellSize - 0.5, cellSize - 0.5);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, cells - 4);
  drawFinder(cells - 4, 0);

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inFinder =
        (r < 5 && c < 5) ||
        (r < 5 && c >= cells - 5) ||
        (r >= cells - 5 && c < 5);
      if (inFinder) continue;
      const hash = (seedText.charCodeAt((r * cells + c) % seedText.length) + r * 17 + c * 31) % 3;
      if (hash !== 0) {
        ctx.fillRect(
          x + padding + c * cellSize,
          y + padding + r * cellSize,
          cellSize - 1,
          cellSize - 1
        );
      }
    }
  }
  ctx.restore();
}

export function getAcademicClassification(score: number): {
  vi: string;
  en: string;
} {
  if (score >= 90) {
    return { vi: 'XUẤT SẮC (HIGH DISTINCTION)', en: 'With High Distinction' };
  }
  if (score >= 80) {
    return { vi: 'GIỎI (DISTINCTION)', en: 'With Distinction' };
  }
  return { vi: 'KHÁ (MERIT)', en: 'With Merit' };
}

/**
 * Renders the Graduation Diploma ("Bằng Khen / Chứng Chỉ Tốt Nghiệp") and triggers a PDF file download.
 * Returns the generated filename.
 */
export async function exportCertificateToPdf(cert: CertificateRecord): Promise<string> {
  const width = 2000;
  const height = 1414; // A4 Landscape ratio (1.414 : 1)

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo bộ dựng đồ họa PDF trên trình duyệt.');
  }

  // 1. Warm Ivory Archival Paper Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#FFFDF7');
  bgGrad.addColorStop(0.5, '#FEF9EC');
  bgGrad.addColorStop(1, '#FDF5DF');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle radial watermark pattern in center
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.045)';
  ctx.lineWidth = 2;
  for (let r = 120; r <= 480; r += 45) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Ceremonial Double-Frame Borders (Bằng Khen style)
  // Outer Emerald/Navy Frame
  ctx.strokeStyle = '#064E3B';
  ctx.lineWidth = 10;
  ctx.strokeRect(42, 42, width - 84, height - 84);

  // Middle Gold Foil Frame
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, width - 120, height - 120);

  // Inner Fine Pinstripe Frame
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(72, 72, width - 144, height - 144);

  // 4 Ornamental Corners
  drawCornerOrnament(ctx, 84, 84, 1, 1, 70, '#B45309');
  drawCornerOrnament(ctx, width - 84, 84, -1, 1, 70, '#B45309');
  drawCornerOrnament(ctx, 84, height - 84, 1, -1, 70, '#B45309');
  drawCornerOrnament(ctx, width - 84, height - 84, -1, -1, 70, '#B45309');

  // 3. Top Header: Left Academy Identity & Right National Motto
  ctx.textAlign = 'center';

  // Top emblem crest in center
  ctx.save();
  ctx.fillStyle = '#064E3B';
  ctx.beginPath();
  ctx.arc(width / 2, 145, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#FEF3C7';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('3T', width / 2, 153);
  ctx.restore();

  // Left: Academy Governing Body
  ctx.textAlign = 'center';
  ctx.fillStyle = '#064E3B';
  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.fillText('HỌC VIỆN CÔNG NGHỆ & AI THỰC CHIẾN 3T ACADEMY', 470, 132);
  ctx.fillStyle = '#92400E';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('HỘI ĐỒNG ĐÀO TẠO & KHẢO THÍ CẤP CAO', 470, 158);
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(330, 172);
  ctx.lineTo(610, 172);
  ctx.stroke();

  // Right: National Formal Motto
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.fillText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', width - 470, 132);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText('Độc lập - Tự do - Hạnh phúc', width - 470, 158);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width - 590, 172);
  ctx.lineTo(width - 350, 172);
  ctx.stroke();

  // 4. Main Ceremonial Title (Bằng Khen / Bằng Tốt Nghiệp)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#991B1B';
  ctx.font = 'bold 46px "Playfair Display", "Merriweather", "Times New Roman", serif';
  ctx.fillText('BẰNG CHỨNG NHẬN TỐT NGHIỆP', width / 2, 265);

  ctx.fillStyle = '#B45309';
  ctx.font = 'bold 19px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('CERTIFICATE OF GRADUATION & ACADEMIC EXCELLENCE', width / 2, 302);

  // Decorative divider
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 260, 322);
  ctx.lineTo(width / 2 + 260, 322);
  ctx.stroke();

  // 5. Recipient Presentation
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 21px "Merriweather", Georgia, serif';
  ctx.fillText(
    'Chủ tịch Hội đồng Đào tạo & Khảo thí Học viện 3T Academy trân trọng trao tặng bằng tốt nghiệp cho học viên:',
    width / 2,
    368
  );

  // Graduate Full Name
  ctx.fillStyle = '#064E3B';
  ctx.font = 'bold 56px "Playfair Display", "Merriweather", "Times New Roman", serif';
  ctx.fillText(cert.studentName.toUpperCase(), width / 2, 445);

  // Student Email & Cohort Meta
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText(
    `Email: ${cert.studentEmail}   •   Khóa học: ${cert.cohortCode}`,
    width / 2,
    484
  );

  // 6. Course Achievement Section
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 21px "Merriweather", Georgia, serif';
  ctx.fillText('Đã hoàn thành xuất sắc chương trình đào tạo & bảo vệ thành công đồ án tốt nghiệp khóa học:', width / 2, 535);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 32px "Playfair Display", "Merriweather", "Times New Roman", serif';
  const afterCourseY = drawWrappedText(ctx, `“${cert.courseTitle}”`, width / 2, 588, 1520, 44);

  // 7. Classification & Score Ribbon Box
  const classification = getAcademicClassification(cert.finalScore);
  const badgeY = afterCourseY + 26;
  const badgeW = 920;
  const badgeH = 58;
  const badgeX = (width - badgeW) / 2;

  ctx.fillStyle = '#FEF3C7';
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

  ctx.fillStyle = '#92400E';
  ctx.font = 'bold 21px Arial, sans-serif';
  ctx.fillText(
    `XẾP LOẠI TỐT NGHIỆP: ${classification.vi}   |   ĐIỂM TỔNG KẾT: ${cert.finalScore}/100 ĐIỂM`,
    width / 2,
    badgeY + 36
  );

  // 8. Verified Competencies Table (Bảng Năng Lực Chuyên Môn Đã Xác Thực)
  const skillsStartY = badgeY + 86;
  ctx.fillStyle = '#064E3B';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('BẢNG KẾT QUẢ THẨM ĐỊNH NĂNG LỰC CHUYÊN MÔN (VERIFIED COMPETENCIES)', width / 2, skillsStartY);

  const skills = cert.skillsMastered && cert.skillsMastered.length > 0
    ? cert.skillsMastered.slice(0, 4)
    : [
        { code: 'CORE-01', name: 'Năng lực Thực hành Chuyên sâu & Giải quyết Bài toán', score: cert.finalScore },
      ];

  const cardGap = 24;
  const totalWidth = 1640;
  const startX = (width - totalWidth) / 2;
  const cardWidth = (totalWidth - cardGap * (skills.length - 1)) / skills.length;
  const cardY = skillsStartY + 18;
  const cardHeight = 118;

  skills.forEach((skill, idx) => {
    const cx = startX + idx * (cardWidth + cardGap);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, cardY, cardWidth, cardHeight);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cardY, cardWidth, cardHeight);

    // Top accent bar
    ctx.fillStyle = '#059669';
    ctx.fillRect(cx, cardY, cardWidth, 6);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText(`MÃ KỸ NĂNG: ${skill.code}`, cx + 16, cardY + 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(`${skill.score}/100`, cx + cardWidth - 16, cardY + 33);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 16px Arial, sans-serif';
    drawWrappedText(ctx, skill.name, cx + 16, cardY + 66, cardWidth - 32, 22);
  });

  // 9. Footer: 3 Columns (QR & Cryptographic Signature | Official Red Seal & Instructor | Academy Director)
  const footerY = 985;

  // Left Column: QR & Blockchain/SHA256 Digital Verification
  drawStylizedQrMatrix(ctx, 180, footerY, 150, cert.certificateCode + cert.verificationSignature);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('XÁC THỰC SỐ & CHỐNG GIẢ MẠO', 352, footerY + 28);

  ctx.fillStyle = '#B45309';
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.fillText(`Số hiệu: ${cert.certificateCode}`, 352, footerY + 58);

  ctx.fillStyle = '#334155';
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText(`Ngày cấp bằng: ${cert.issuedAt}`, 352, footerY + 86);

  ctx.fillStyle = '#64748B';
  ctx.font = '13px "Courier New", monospace';
  const shortSig =
    cert.verificationSignature.length > 42
      ? cert.verificationSignature.slice(0, 42) + '...'
      : cert.verificationSignature;
  ctx.fillText(shortSig, 352, footerY + 114);
  ctx.fillText(`Tra cứu chính chủ: 3tacademy.vn/verify/${cert.certificateCode}`, 352, footerY + 138);

  // Center Column: Instructor Signature
  ctx.textAlign = 'center';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('TRƯỞNG BAN GIẢNG HUẤN CHUYÊN MÔN', 1120, footerY + 28);
  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillText('(Ký và ghi rõ họ tên)', 1120, footerY + 50);

  // Stylized signature
  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'italic bold 30px Georgia, serif';
  ctx.fillText('Trần Minh Khoa', 1120, footerY + 110);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText('TS. Trần Minh Khoa', 1120, footerY + 152);
  ctx.fillStyle = '#475569';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Giảng viên Trưởng bộ môn AI & Data', 1120, footerY + 176);

  // Right Column: Official Academy Red Stamp & Director Signature
  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText(`TP. Hồ Chí Minh, ngày cấp ${cert.issuedAt}`, 1600, footerY + 4);

  ctx.fillStyle = '#991B1B';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('CHỦ TỊCH HỘI ĐỒNG CẤP CHỨNG CHỈ', 1600, footerY + 28);
  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillText('(Ký tên và đóng dấu pháp nhân)', 1600, footerY + 50);

  // Official Red Circular Seal Stamp
  ctx.save();
  ctx.translate(1485, footerY + 108);
  ctx.rotate(-0.14);
  ctx.strokeStyle = 'rgba(185, 28, 28, 0.82)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(185, 28, 28, 0.85)';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('3T ACADEMY VIETNAM', 0, -22);
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('ĐÃ XÁC THỰC', 0, 4);
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('OFFICIAL SEAL', 0, 22);
  ctx.restore();

  // Director stylized signature
  ctx.fillStyle = '#991B1B';
  ctx.font = 'italic bold 28px "Playfair Display", "Merriweather", Georgia, serif';
  ctx.fillText('Trần Nguyễn Sơn Thành', 1600, footerY + 110);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('Trần Nguyễn Sơn Thành', 1600, footerY + 152);
  ctx.fillStyle = '#475569';
  ctx.font = '14px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('Chủ tịch Hội đồng Cấp chứng chỉ 3T Academy', 1600, footerY + 176);

  // Bottom Registry Footnote
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText(
    'Văn bằng này được cấp phát hợp lệ kèm chữ ký số SHA-256 và lưu trữ gốc tại Sổ đăng bộ Văn bằng Quốc gia của Học viện 3T Academy.',
    width / 2,
    height - 96
  );

  // Convert Canvas to high-quality JPEG and wrap inside an A4 Landscape PDF
  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const base64Jpeg = dataUrl.split(',')[1];
  const jpegBytes = base64ToUint8Array(base64Jpeg);
  const pdfBlob = buildA4LandscapePdfFromJpeg(jpegBytes, width, height);

  const safeCode = cert.certificateCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Bang_Tot_Nghiep_3T_Academy_${safeCode}.pdf`;

  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 5000);

  return fileName;
}
