import React, { useState } from 'react';

export interface DonutSegmentItem {
  label: string;
  value: number;
  countText?: string;
  color: string;
  description?: string;
}

interface DonutGaugeChartProps {
  segments: DonutSegmentItem[];
  centerLabel: string;
  centerValue: string;
  centerSubtext?: string;
  size?: number;
}

export const DonutGaugeChart: React.FC<DonutGaugeChartProps> = ({
  segments,
  centerLabel,
  centerValue,
  centerSubtext,
  size = 200,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = Math.max(
    1,
    segments.reduce((acc, item) => acc + Math.max(0, item.value), 0)
  );

  const strokeWidth = 22;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let cumulativeFraction = 0;
  const computedSegments = segments.map((seg) => {
    const fraction = Math.max(0, seg.value) / total;
    const dashLength = Math.max(0, fraction * circumference - 3);
    const dashOffset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return {
      ...seg,
      pct: Math.round(fraction * 100),
      dashArray: `${dashLength.toFixed(2)} ${(circumference - dashLength).toFixed(2)}`,
      dashOffset: dashOffset.toFixed(2),
    };
  });

  const activeSeg = hoveredIdx !== null ? computedSegments[hoveredIdx] : null;

  return (
    <div className="relative flex flex-col sm:flex-row items-center gap-6 select-none">
      {/* SVG Donut Ring */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible -rotate-90"
          role="img"
          aria-label={centerLabel}
        >
          {/* Background Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-[#E2ECE7] dark:text-[#1E2D24]"
            strokeWidth={strokeWidth}
          />

          {/* Segments */}
          {computedSegments.map((seg, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <circle
                key={seg.label}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
                className="transition-all duration-150 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        {/* Center KPI Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
          <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
            {activeSeg ? activeSeg.label : centerLabel}
          </span>
          <span className="text-2xl font-mono font-bold tabular-nums text-[#0F172A] dark:text-[#ECFDF5] mt-0.5">
            {activeSeg ? `${activeSeg.pct}%` : centerValue}
          </span>
          {(activeSeg?.countText || centerSubtext) && (
            <span className="text-[11px] font-mono text-[#059669] dark:text-[#34D399] font-semibold mt-0.5">
              {activeSeg ? activeSeg.countText : centerSubtext}
            </span>
          )}
        </div>
      </div>

      {/* Interactive Legend & Breakdown */}
      <div className="flex-1 w-full space-y-2.5">
        {computedSegments.map((seg, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isHovered
                  ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#10B981]'
                  : 'bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border-[#E2ECE7] dark:border-[#1E2D24]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-xs shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="font-bold text-[#0F172A] dark:text-[#ECFDF5] truncate">
                    {seg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
                  {seg.countText && (
                    <span className="text-[#475569] dark:text-[#94A3B8]">
                      {seg.countText}
                    </span>
                  )}
                  <span className="font-bold text-[#059669] dark:text-[#34D399]">
                    {seg.pct}%
                  </span>
                </div>
              </div>
              {seg.description && (
                <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-1 leading-snug">
                  {seg.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Tooltip */}
      {activeSeg && (
        <div className="pointer-events-none absolute -top-2 left-4 z-30 rounded-xl bg-[#0F172A] text-white px-3.5 py-2.5 shadow-lg border border-emerald-500/40 text-xs space-y-0.5 max-w-xs">
          <div className="font-bold text-emerald-300">{activeSeg.label}</div>
          <div className="font-mono text-white font-bold tabular-nums">
            Tỷ lệ: {activeSeg.pct}%{' '}
            {activeSeg.countText ? `(${activeSeg.countText})` : ''}
          </div>
          {activeSeg.description && (
            <div className="text-[11px] text-slate-300">{activeSeg.description}</div>
          )}
        </div>
      )}
    </div>
  );
};
