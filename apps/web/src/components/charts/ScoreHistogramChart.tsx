import React, { useState, useId } from 'react';
import { Star } from 'lucide-react';

export interface ScoreBucketItem {
  rangeLabel: string;
  bandTitle: string;
  studentCount: number;
  percentage: number;
  color: string;
  sampleNote: string;
}

interface ScoreHistogramChartProps {
  buckets: ScoreBucketItem[];
  height?: number;
}

export const ScoreHistogramChart: React.FC<ScoreHistogramChartProps> = ({
  buckets,
  height = 240,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, '');

  const svgWidth = 580;
  const svgHeight = height;
  const padLeft = 42;
  const padRight = 20;
  const padTop = 26;
  const padBottom = 44;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxCount = Math.max(10, ...buckets.map((b) => b.studentCount)) * 1.15;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxCount));
  const slotW = plotW / Math.max(1, buckets.length);
  const barW = Math.min(76, slotW * 0.64);

  const activeBucket = hoveredIdx !== null ? buckets[hoveredIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Biểu đồ phổ điểm kiểm tra của lớp"
      >
        <defs>
          <linearGradient id={`histEmerald-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Grid Lines */}
        {yTicks.map((tick) => {
          const y = padTop + plotH - (tick / maxCount) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgWidth - padRight}
                y2={y}
                stroke="currentColor"
                className="text-[#E2ECE7] dark:text-[#1E2D24]"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#64748B] dark:fill-[#94A3B8] font-mono text-[10px] tabular-nums"
              >
                {tick} HV
              </text>
            </g>
          );
        })}

        {/* Histogram Bars */}
        {buckets.map((bucket, idx) => {
          const centerX = padLeft + slotW * idx + slotW / 2;
          const barH = (bucket.studentCount / maxCount) * plotH;
          const x = centerX - barW / 2;
          const y = padTop + plotH - barH;
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={bucket.rangeLabel}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <rect
                  x={centerX - slotW / 2 + 4}
                  y={padTop}
                  width={slotW - 8}
                  height={plotH}
                  rx="8"
                  className="fill-[#10B981]/8"
                />
              )}

              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(4, barH)}
                rx="6"
                fill={
                  bucket.color === 'emerald-gradient'
                    ? `url(#histEmerald-${chartId})`
                    : bucket.color
                }
                opacity={hoveredIdx === null || isHovered ? 1 : 0.78}
                className="transition-all duration-150"
              />

              {/* Count & Percentage above bar */}
              <text
                x={centerX}
                y={y - 8}
                textAnchor="middle"
                className="fill-[#0F172A] dark:fill-[#ECFDF5] font-mono text-[10.5px] font-bold tabular-nums"
              >
                {bucket.studentCount} HV ({bucket.percentage}%)
              </text>

              {/* X-Axis Labels */}
              <text
                x={centerX}
                y={padTop + plotH + 18}
                textAnchor="middle"
                className="fill-[#0F172A] dark:fill-[#ECFDF5] font-mono text-xs font-bold"
              >
                {bucket.rangeLabel}
              </text>
              <text
                x={centerX}
                y={padTop + plotH + 33}
                textAnchor="middle"
                className="fill-[#475569] dark:fill-[#94A3B8] text-[10px]"
              >
                {bucket.bandTitle}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {activeBucket && hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-xl bg-[#0F172A] text-white p-3.5 shadow-lg border border-emerald-500/40 text-xs space-y-1"
          style={{
            left: `${Math.min(62, Math.max(5, ((hoveredIdx + 0.5) / buckets.length) * 100 - 15))}%`,
            top: '8px',
          }}
        >
          <div className="flex items-center justify-between font-mono text-emerald-300 font-bold">
            <span>Khung điểm: {activeBucket.rangeLabel}</span>
            <span>{activeBucket.percentage}% lớp</span>
          </div>
          <div className="font-bold text-white">
            {activeBucket.bandTitle} · {activeBucket.studentCount} học viên
          </div>
          <p className="text-[11px] text-slate-300 leading-snug">
            {activeBucket.sampleNote}
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HORIZONTAL BAR CHART: Các Chủ Đề / Kỹ Năng Học Viên Hỏi & Làm Sai Nhiều Nhất
// ============================================================================
export interface TopicBottleneckItem {
  skillCode: string;
  topicName: string;
  sessionLabel: string;
  wrongAnswerRatePct: number;
  discussionQuestionsCount: number;
  aiTutorQueriesCount: number;
  recommendationNote: string;
}

export const HorizontalTopicBarChart: React.FC<{
  items: TopicBottleneckItem[];
}> = ({ items }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="relative space-y-3 select-none">
      {items.map((item, idx) => {
        const isHovered = hoveredIdx === idx;
        return (
          <div
            key={item.skillCode}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              isHovered
                ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#10B981] shadow-xs'
                : 'bg-[#F7FBF9]/70 dark:bg-[#090F0C]/70 border-[#E2ECE7] dark:border-[#1E2D24]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300">
                  {item.sessionLabel}
                </span>
                <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5] truncate">
                  {item.topicName}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums shrink-0">
                <span className="text-[#EF4444] font-bold">
                  Sai trắc nghiệm: {item.wrongAnswerRatePct}%
                </span>
                <span className="text-[#059669] dark:text-[#34D399] font-semibold">
                  {item.aiTutorQueriesCount} lượt hỏi AI · {item.discussionQuestionsCount} thảo luận
                </span>
              </div>
            </div>

            {/* Interactive SVG Horizontal Bar */}
            <svg viewBox="0 0 500 14" className="w-full h-3.5 overflow-visible">
              <rect
                x="0"
                y="2"
                width="500"
                height="10"
                rx="5"
                className="fill-[#E2ECE7] dark:fill-[#1E2D24]"
              />
              <rect
                x="0"
                y="2"
                width={Math.min(500, item.wrongAnswerRatePct * 5)}
                height="10"
                rx="5"
                fill={item.wrongAnswerRatePct >= 35 ? '#EF4444' : '#F59E0B'}
              />
            </svg>

            {isHovered && (
              <div className="mt-2 pt-2 border-t border-[#E2ECE7] dark:border-[#1E2D24] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                <span>Gợi ý giảng dạy: {item.recommendationNote}</span>
                <span className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                  Mã kỹ năng: {item.skillCode}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// COMBO BAR + LINE CHART: Doanh thu học phí VietQR & Học viên ghi danh mới
// ============================================================================
export interface MonthlyRevenueEnrollmentItem {
  month: string;
  revenueMillionVnd: number;
  newEnrollments: number;
  sepayMatchedRatePct: number;
}

export const ComboBarLineChart: React.FC<{
  data: MonthlyRevenueEnrollmentItem[];
  height?: number;
}> = ({ data, height = 270 }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, '');

  const svgWidth = 680;
  const svgHeight = height;
  const padLeft = 52;
  const padRight = 48;
  const padTop = 26;
  const padBottom = 42;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxRev = Math.max(100, ...data.map((d) => d.revenueMillionVnd)) * 1.15;
  const maxStudents = Math.max(50, ...data.map((d) => d.newEnrollments)) * 1.15;
  const slotW = plotW / Math.max(1, data.length);
  const barW = Math.min(48, slotW * 0.5);

  const linePoints = data.map((d, idx) => ({
    x: padLeft + slotW * idx + slotW / 2,
    y: padTop + plotH - (d.newEnrollments / maxStudents) * plotH,
  }));

  const linePath = linePoints
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="relative w-full select-none space-y-3">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Biểu đồ kết hợp doanh thu học phí VietQR và số lượng học viên mới"
      >
        <defs>
          <linearGradient id={`comboBar-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Grid & Dual Y-Axis Labels */}
        {yTicks.map((t) => {
          const y = padTop + plotH - t * plotH;
          const revLabel = Math.round(t * maxRev);
          const stuLabel = Math.round(t * maxStudents);
          return (
            <g key={t}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgWidth - padRight}
                y2={y}
                stroke="currentColor"
                className="text-[#E2ECE7] dark:text-[#1E2D24]"
                strokeWidth="1"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#059669] dark:fill-[#34D399] font-mono text-[10px] tabular-nums"
              >
                {revLabel}tr
              </text>
              <text
                x={svgWidth - padRight + 8}
                y={y + 4}
                textAnchor="start"
                className="fill-[#0EA5E9] font-mono text-[10px] tabular-nums"
              >
                {stuLabel} HV
              </text>
            </g>
          );
        })}

        {/* Revenue Bars */}
        {data.map((d, idx) => {
          const centerX = padLeft + slotW * idx + slotW / 2;
          const barH = (d.revenueMillionVnd / maxRev) * plotH;
          const y = padTop + plotH - barH;
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={d.month}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <rect
                  x={centerX - slotW / 2 + 4}
                  y={padTop}
                  width={slotW - 8}
                  height={plotH}
                  rx="8"
                  className="fill-[#10B981]/8"
                />
              )}
              <rect
                x={centerX - barW / 2}
                y={y}
                width={barW}
                height={barH}
                rx="6"
                fill={`url(#comboBar-${chartId})`}
                opacity={hoveredIdx === null || isHovered ? 1 : 0.75}
              />
              <text
                x={centerX}
                y={padTop + plotH + 20}
                textAnchor="middle"
                className={`text-xs font-semibold ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] font-bold'
                    : 'fill-[#475569] dark:fill-[#94A3B8]'
                }`}
              >
                {d.month}
              </text>
            </g>
          );
        })}

        {/* Student Enrollment Line Overlay */}
        <path
          d={linePath}
          fill="none"
          stroke="#0EA5E9"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {linePoints.map((pt, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={`line-pt-${data[idx].month}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6 : 4.5}
                className="fill-white dark:fill-[#111A15]"
                stroke="#0EA5E9"
                strokeWidth="3"
              />
              <text
                x={pt.x}
                y={pt.y - 10}
                textAnchor="middle"
                className="fill-[#0EA5E9] font-mono text-[10px] font-bold tabular-nums"
              >
                {data[idx].newEnrollments} HV
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[#475569] dark:text-[#94A3B8]">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-[#10B981]" />
          <span>Doanh thu học phí VietQR (Triệu VNĐ — Trục trái)</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-1 rounded-full bg-[#0EA5E9]" />
          <span>Học viên ghi danh mới (Số học viên — Trục phải)</span>
        </span>
      </div>

      {/* Floating Tooltip */}
      {activeItem && hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-xl bg-[#0F172A] text-white p-3.5 shadow-lg border border-emerald-500/40 text-xs space-y-1"
          style={{
            left: `${Math.min(64, Math.max(5, ((hoveredIdx + 0.5) / data.length) * 100 - 14))}%`,
            top: '8px',
          }}
        >
          <div className="font-mono text-emerald-300 font-bold">
            {activeItem.month} · Năm học 2026
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Học phí VietQR:</span>
            <span className="font-mono font-bold text-emerald-400 tabular-nums">
              {activeItem.revenueMillionVnd}.000.000 ₫
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Ghi danh mới:</span>
            <span className="font-mono font-bold text-sky-300 tabular-nums">
              {activeItem.newEnrollments} học viên
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
            <span className="text-slate-400">Khớp lệnh tự động SePay:</span>
            <span className="font-mono font-bold text-white">
              {activeItem.sepayMatchedRatePct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COURSE RATING DISTRIBUTION CHART (`course_reviews.rating` 1-5 Sao)
// ============================================================================
export interface RatingStarDistributionItem {
  stars: number;
  count: number;
  percentage: number;
  highlightQuote: string;
}

export const CourseRatingDistributionChart: React.FC<{
  items: RatingStarDistributionItem[];
  averageRating: number;
  totalReviews: number;
}> = ({ items, averageRating, totalReviews }) => {
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center select-none">
      {/* Left Summary Box */}
      <div className="md:col-span-4 p-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-center space-y-2">
        <div className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
          Điểm hài lòng trung bình
        </div>
        <div className="text-4xl font-mono font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
          {averageRating.toFixed(1)} / 5.0
        </div>
        <div className="flex items-center justify-center gap-1 text-amber-400">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="w-4 h-4 fill-current" />
          ))}
        </div>
        <div className="text-xs font-mono text-[#475569] dark:text-[#94A3B8] tabular-nums">
          Tổng hợp từ {totalReviews} đánh giá học viên
        </div>
      </div>

      {/* Right 1-5 Star Bars */}
      <div className="md:col-span-8 space-y-2.5">
        {items.map((row) => {
          const isHovered = hoveredStars === row.stars;
          return (
            <div
              key={row.stars}
              onMouseEnter={() => setHoveredStars(row.stars)}
              onMouseLeave={() => setHoveredStars(null)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isHovered
                  ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#10B981]'
                  : 'border-transparent hover:bg-[#F7FBF9] dark:hover:bg-[#090F0C]'
              }`}
            >
              <div className="flex items-center gap-3 text-xs">
                <span className="w-14 font-mono font-bold text-[#0F172A] dark:text-[#ECFDF5] shrink-0">
                  {row.stars} sao ★
                </span>
                <div className="flex-1 h-3 rounded-full bg-[#E2ECE7] dark:bg-[#1E2D24] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#10B981]"
                    style={{ width: `${row.percentage}%` }}
                  />
                </div>
                <span className="w-24 text-right font-mono font-bold tabular-nums text-[#059669] dark:text-[#34D399] shrink-0">
                  {row.count} ({row.percentage}%)
                </span>
              </div>
              {isHovered && (
                <div className="mt-1.5 pl-16 text-[11px] text-[#475569] dark:text-[#94A3B8] italic">
                  “{row.highlightQuote}”
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
