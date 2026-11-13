import React, { useState, useId } from 'react';

export interface SmoothAreaDataPoint {
  label: string;
  subLabel?: string;
  value: number;
  secondaryValue?: number;
  detailText?: string;
}

interface SmoothAreaLineChartProps {
  data: SmoothAreaDataPoint[];
  thresholdValue?: number;
  thresholdLabel?: string;
  unit?: string;
  secondaryUnit?: string;
  primarySeriesLabel?: string;
  secondarySeriesLabel?: string;
  minY?: number;
  maxY?: number;
  height?: number;
}

function buildSmoothSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const ctrlX1 = curr.x + (next.x - curr.x) * 0.42;
    const ctrlY1 = curr.y;
    const ctrlX2 = curr.x + (next.x - curr.x) * 0.58;
    const ctrlY2 = next.y;
    path += ` C ${ctrlX1.toFixed(1)} ${ctrlY1.toFixed(1)}, ${ctrlX2.toFixed(1)} ${ctrlY2.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
}

export const SmoothAreaLineChart: React.FC<SmoothAreaLineChartProps> = ({
  data,
  thresholdValue = 70,
  thresholdLabel = 'Mốc đạt chuẩn 70%',
  unit = '%',
  secondaryUnit = 'ms',
  primarySeriesLabel = 'Điểm bài kiểm tra',
  secondarySeriesLabel,
  minY = 0,
  maxY = 100,
  height = 260,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, '');

  const svgWidth = 640;
  const svgHeight = height;
  const padLeft = 44;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 42;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const yRange = Math.max(1, maxY - minY);
  const toY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + plotH - ((clamped - minY) / yRange) * plotH;
  };
  const toX = (idx: number) => {
    if (data.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (data.length - 1)) * plotW;
  };

  const points = data.map((d, idx) => ({
    x: toX(idx),
    y: toY(d.value),
    raw: d,
  }));

  const hasSecondary = data.some((d) => typeof d.secondaryValue === 'number');
  const maxSecondary = hasSecondary
    ? Math.max(...data.map((d) => d.secondaryValue || 0), 100) * 1.15
    : 1000;
  const secondaryPoints = hasSecondary
    ? data.map((d, idx) => ({
        x: toX(idx),
        y:
          padTop +
          plotH -
          ((Math.max(0, d.secondaryValue || 0) / maxSecondary) * plotH),
      }))
    : [];

  const linePath = buildSmoothSvgPath(points);
  const secondaryPath = hasSecondary ? buildSmoothSvgPath(secondaryPoints) : '';
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(minY + t * yRange));
  const thresholdY =
    thresholdValue !== undefined && thresholdValue >= minY && thresholdValue <= maxY
      ? toY(thresholdValue)
      : null;

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={primarySeriesLabel}
      >
        <defs>
          <linearGradient id={`emeraldArea-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.34" />
            <stop offset="65%" stopColor="#10B981" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id={`emeraldStroke-${chartId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid Lines & Y-Axis Labels */}
        {yTicks.map((tick) => {
          const y = toY(tick);
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
                strokeDasharray={tick === minY ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#64748B] dark:fill-[#94A3B8] font-mono text-[10px] tabular-nums"
              >
                {tick}
                {unit}
              </text>
            </g>
          );
        })}

        {/* Vertical Subtle Coordinate Guides */}
        {points.map((pt, idx) => (
          <line
            key={`vgrid-${data[idx].label}`}
            x1={pt.x}
            y1={padTop}
            x2={pt.x}
            y2={padTop + plotH}
            stroke="currentColor"
            className={
              hoveredIdx === idx
                ? 'text-[#10B981]'
                : 'text-[#E2ECE7]/50 dark:text-[#1E2D24]/60'
            }
            strokeWidth={hoveredIdx === idx ? '1.5' : '1'}
            strokeDasharray={hoveredIdx === idx ? '2 2' : undefined}
          />
        ))}

        {/* Threshold Reference Line (e.g., 70% Passing Score) */}
        {thresholdY !== null && (
          <g>
            <line
              x1={padLeft}
              y1={thresholdY}
              x2={svgWidth - padRight}
              y2={thresholdY}
              stroke="#F59E0B"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <rect
              x={svgWidth - padRight - 118}
              y={thresholdY - 17}
              width="118"
              height="15"
              rx="4"
              className="fill-amber-50 dark:fill-amber-950/90"
            />
            <text
              x={svgWidth - padRight - 59}
              y={thresholdY - 6}
              textAnchor="middle"
              className="fill-[#D97706] dark:fill-amber-300 font-mono text-[9.5px] font-bold"
            >
              {thresholdLabel}
            </text>
          </g>
        )}

        {/* Smooth Emerald Area Fill */}
        {areaPath && <path d={areaPath} fill={`url(#emeraldArea-${chartId})`} />}

        {/* Smooth Emerald Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={`url(#emeraldStroke-${chartId})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Optional Secondary Line (e.g., Latency ms or Secondary Trend) */}
        {hasSecondary && secondaryPath && (
          <path
            d={secondaryPath}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        )}

        {/* Data Nodes & X-Axis Labels */}
        {points.map((pt, idx) => {
          const isHovered = hoveredIdx === idx;
          const passed =
            thresholdValue !== undefined ? pt.raw.value >= thresholdValue : true;
          const colWidth = plotW / Math.max(1, points.length - 1);

          return (
            <g key={pt.raw.label}>
              {/* Value label above node */}
              <text
                x={pt.x}
                y={pt.y - 11}
                textAnchor="middle"
                className={`font-mono text-[10px] font-bold tabular-nums transition-opacity ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] opacity-100'
                    : 'fill-[#475569] dark:fill-[#94A3B8] opacity-85'
                }`}
              >
                {pt.raw.value}
                {unit}
              </text>

              {/* Outer Halo on Hover */}
              {isHovered && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="9"
                  className="fill-[#10B981]/20"
                />
              )}

              {/* Primary Data Circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 4}
                className="fill-white dark:fill-[#111A15] transition-all"
                stroke={passed ? '#10B981' : '#F59E0B'}
                strokeWidth={isHovered ? 3 : 2.5}
              />

              {/* Secondary Data Circle if present */}
              {hasSecondary && secondaryPoints[idx] && (
                <circle
                  cx={secondaryPoints[idx].x}
                  cy={secondaryPoints[idx].y}
                  r={isHovered ? 4.5 : 3}
                  className="fill-white dark:fill-[#111A15]"
                  stroke="#0EA5E9"
                  strokeWidth="2"
                />
              )}

              {/* X-Axis Label */}
              <text
                x={pt.x}
                y={padTop + plotH + 18}
                textAnchor="middle"
                className={`text-[11px] font-semibold ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] font-bold'
                    : 'fill-[#475569] dark:fill-[#94A3B8]'
                }`}
              >
                {pt.raw.label}
              </text>

              {pt.raw.subLabel && (
                <text
                  x={pt.x}
                  y={padTop + plotH + 32}
                  textAnchor="middle"
                  className="fill-[#64748B] dark:fill-[#64748B] font-mono text-[9.5px]"
                >
                  {pt.raw.subLabel}
                </text>
              )}

              {/* Interactive Hit Column */}
              <rect
                x={pt.x - colWidth / 2}
                y={padTop}
                width={colWidth}
                height={plotH + padBottom}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {activePoint && hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute z-30 w-60 rounded-xl bg-[#0F172A] text-white p-3 shadow-lg border border-emerald-500/40 text-xs space-y-1 transition-all"
          style={{
            left: `${Math.min(72, Math.max(6, (activePoint.x / svgWidth) * 100 - 14))}%`,
            top: `${Math.max(4, (activePoint.y / svgHeight) * 100 - 28)}%`,
          }}
        >
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-emerald-300 font-bold">
            <span>{activePoint.raw.label}</span>
            {activePoint.raw.subLabel && <span>{activePoint.raw.subLabel}</span>}
          </div>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-300">{primarySeriesLabel}:</span>
            <span className="font-mono tabular-nums text-white">
              {activePoint.raw.value}
              {unit}
            </span>
          </div>
          {hasSecondary && typeof activePoint.raw.secondaryValue === 'number' && (
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-sky-300">
                {secondarySeriesLabel || 'Chỉ số phụ'}:
              </span>
              <span className="font-mono tabular-nums text-sky-200">
                {activePoint.raw.secondaryValue} {secondaryUnit}
              </span>
            </div>
          )}
          {thresholdValue !== undefined && (
            <div className="text-[11px] text-slate-300 pt-0.5 border-t border-slate-800">
              {activePoint.raw.value >= thresholdValue ? (
                <span className="text-emerald-400 font-semibold">
                  ✓ Vượt mốc chuẩn +{activePoint.raw.value - thresholdValue}
                  {unit}
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">
                  • Cần cải thiện thêm {thresholdValue - activePoint.raw.value}
                  {unit}
                </span>
              )}
            </div>
          )}
          {activePoint.raw.detailText && (
            <div className="text-[11px] text-slate-300 leading-snug">
              {activePoint.raw.detailText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
