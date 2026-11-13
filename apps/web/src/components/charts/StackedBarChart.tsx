import React, { useState } from 'react';

export interface StackedBarSegmentDef {
  key: string;
  label: string;
  color: string;
}

export interface StackedBarDatum {
  label: string;
  subLabel?: string;
  subtitle?: string;
  values: Record<string, number>;
}

interface StackedBarChartProps {
  data: StackedBarDatum[];
  segments: StackedBarSegmentDef[];
  unit?: string;
  height?: number;
}

export const StackedBarChart: React.FC<StackedBarChartProps> = ({
  data,
  segments,
  unit = 'HV',
  height = 260,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const svgWidth = 640;
  const svgHeight = height;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 46;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const totals = data.map((d) =>
    segments.reduce((acc, s) => acc + (d.values[s.key] || 0), 0)
  );
  const maxTotal = Math.max(10, ...totals);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxTotal));
  const colSlotW = plotW / Math.max(1, data.length);
  const barWidth = Math.min(48, colSlotW * 0.54);

  const activeDatum = hoveredIdx !== null ? data[hoveredIdx] : null;
  const activeTotal = hoveredIdx !== null ? totals[hoveredIdx] : 0;

  return (
    <div className="relative w-full select-none space-y-3">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Biểu đồ cột chồng thống kê tiến độ"
      >
        {/* Horizontal Grid Lines */}
        {yTicks.map((tick) => {
          const y = padTop + plotH - (tick / maxTotal) * plotH;
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
                {tick}
              </text>
            </g>
          );
        })}

        {/* Stacked Bars */}
        {data.map((datum, idx) => {
          const centerX = padLeft + colSlotW * idx + colSlotW / 2;
          const x = centerX - barWidth / 2;
          let currentBottomY = padTop + plotH;
          const isHovered = hoveredIdx === idx;
          const totalVal = totals[idx];

          return (
            <g
              key={datum.label}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Hover column highlight */}
              {isHovered && (
                <rect
                  x={centerX - colSlotW / 2 + 4}
                  y={padTop}
                  width={colSlotW - 8}
                  height={plotH}
                  rx="8"
                  className="fill-[#10B981]/8"
                />
              )}

              {segments.map((seg, segIdx) => {
                const val = datum.values[seg.key] || 0;
                const barH = (val / maxTotal) * plotH;
                const y = currentBottomY - barH;
                currentBottomY = y;
                const isTopSegment = segIdx === segments.length - 1;

                return (
                  <rect
                    key={seg.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(0, barH)}
                    rx={isTopSegment ? 5 : 0}
                    fill={seg.color}
                    opacity={hoveredIdx === null || isHovered ? 1 : 0.72}
                    className="transition-opacity duration-150"
                  />
                );
              })}

              {/* Total Label Above Stacked Bar */}
              <text
                x={centerX}
                y={currentBottomY - 7}
                textAnchor="middle"
                className="fill-[#0F172A] dark:fill-[#ECFDF5] font-mono text-[10px] font-bold tabular-nums"
              >
                {totalVal} {unit}
              </text>

              {/* X-Axis Label */}
              <text
                x={centerX}
                y={padTop + plotH + 18}
                textAnchor="middle"
                className={`text-[11px] font-semibold ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] font-bold'
                    : 'fill-[#0F172A] dark:fill-[#ECFDF5]'
                }`}
              >
                {datum.label}
              </text>
              {datum.subLabel && (
                <text
                  x={centerX}
                  y={padTop + plotH + 33}
                  textAnchor="middle"
                  className="fill-[#64748B] font-mono text-[9.5px]"
                >
                  {datum.subLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-[#475569] dark:text-[#94A3B8]">
        {segments.map((seg) => (
          <div key={seg.key} className="inline-flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="font-medium">{seg.label}</span>
          </div>
        ))}
      </div>

      {/* Floating Tooltip */}
      {activeDatum && hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-xl bg-[#0F172A] text-white p-3.5 shadow-lg border border-emerald-500/40 text-xs space-y-1.5"
          style={{
            left: `${Math.min(65, Math.max(5, ((hoveredIdx + 0.5) / data.length) * 100 - 15))}%`,
            top: '8px',
          }}
        >
          <div className="flex items-center justify-between font-mono text-[11px] text-emerald-300 font-bold">
            <span>{activeDatum.label}</span>
            <span>
              Tổng: {activeTotal} {unit}
            </span>
          </div>
          {activeDatum.subtitle && (
            <div className="text-[11px] text-slate-300 font-medium leading-snug pb-1 border-b border-slate-800">
              {activeDatum.subtitle}
            </div>
          )}
          <div className="space-y-1 pt-0.5">
            {segments.map((seg) => {
              const v = activeDatum.values[seg.key] || 0;
              const pct = activeTotal > 0 ? Math.round((v / activeTotal) * 100) : 0;
              return (
                <div
                  key={seg.key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-slate-200">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{seg.label}:</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-white">
                    {v} {unit} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
