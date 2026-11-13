import React, { useState, useId } from 'react';

export interface RadarSkillAxisItem {
  code: string;
  name: string;
  shortLabel?: string;
  masteryScore: number;
  evidenceCount: number;
  sourceLabel?: string;
}

interface RadarSkillChartProps {
  skills: RadarSkillAxisItem[];
  size?: number;
}

export const RadarSkillChart: React.FC<RadarSkillChartProps> = ({
  skills,
  size = 310,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, '');

  const safeSkills =
    skills.length >= 3
      ? skills
      : [
          ...skills,
          {
            code: 'SYS-DESIGN',
            name: 'Thiết kế Kiến trúc AI',
            masteryScore: 84,
            evidenceCount: 3,
            sourceLabel: 'Khóa K01',
          },
        ];

  const svgWidth = 460;
  const svgHeight = size;
  const cx = svgWidth / 2;
  const cy = svgHeight / 2 + 4;
  const maxRadius = Math.min(cx, cy) - 56;
  const rings = [20, 40, 60, 80, 100];
  const count = safeSkills.length;

  const getCoord = (idx: number, scorePct: number) => {
    const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, scorePct)) / 100) * maxRadius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle,
    };
  };

  const polygonPoints = safeSkills
    .map((sk, idx) => {
      const pt = getCoord(idx, sk.masteryScore);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  const benchmarkPoints = safeSkills
    .map((_, idx) => {
      const pt = getCoord(idx, 70);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  const activeSkill = hoveredIdx !== null ? safeSkills[hoveredIdx] : null;
  const activeCoord =
    hoveredIdx !== null ? getCoord(hoveredIdx, safeSkills[hoveredIdx].masteryScore) : null;

  return (
    <div className="relative w-full select-none flex flex-col items-center">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Biểu đồ đa giác năng lực kỹ năng"
      >
        <defs>
          <radialGradient id={`radarFill-${chartId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.18" />
          </radialGradient>
        </defs>

        {/* Concentric Polygon Grid Rings */}
        {rings.map((ringVal) => {
          const pts = safeSkills
            .map((_, idx) => {
              const p = getCoord(idx, ringVal);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <g key={ringVal}>
              <polygon
                points={pts}
                fill="none"
                stroke="currentColor"
                className="text-[#E2ECE7] dark:text-[#1E2D24]"
                strokeWidth="1"
                strokeDasharray={ringVal === 100 ? undefined : '2 2'}
              />
              <text
                x={cx + 4}
                y={cy - (ringVal / 100) * maxRadius + 10}
                className="fill-[#64748B] dark:fill-[#64748B] font-mono text-[9px] tabular-nums"
              >
                {ringVal}
              </text>
            </g>
          );
        })}

        {/* Radial Axes from Center */}
        {safeSkills.map((sk, idx) => {
          const outer = getCoord(idx, 100);
          return (
            <line
              key={`axis-${sk.code}`}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="currentColor"
              className={
                hoveredIdx === idx
                  ? 'text-[#10B981]'
                  : 'text-[#E2ECE7] dark:text-[#1E2D24]'
              }
              strokeWidth={hoveredIdx === idx ? '1.5' : '1'}
            />
          );
        })}

        {/* 70% Target Benchmark Polygon */}
        <polygon
          points={benchmarkPoints}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />

        {/* Student Mastery Polygon */}
        <polygon
          points={polygonPoints}
          fill={`url(#radarFill-${chartId})`}
          stroke="#10B981"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Vertex Dots & Axis Labels */}
        {safeSkills.map((sk, idx) => {
          const pt = getCoord(idx, sk.masteryScore);
          const labelPt = getCoord(idx, 122);
          const isHovered = hoveredIdx === idx;
          const cos = Math.cos(labelPt.angle);
          const textAnchor =
            Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';

          return (
            <g
              key={sk.code}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="10"
                  className="fill-[#10B981]/25"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 4}
                className="fill-white dark:fill-[#111A15]"
                stroke="#10B981"
                strokeWidth={isHovered ? 3 : 2.5}
              />

              {/* Axis Title & Score */}
              <text
                x={labelPt.x}
                y={labelPt.y - 4}
                textAnchor={textAnchor}
                className={`text-[11px] font-semibold ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] font-bold'
                    : 'fill-[#0F172A] dark:fill-[#ECFDF5]'
                }`}
              >
                {sk.shortLabel ||
                  (sk.name.length > 24 ? `${sk.name.slice(0, 22)}…` : sk.name)}
              </text>
              <text
                x={labelPt.x}
                y={labelPt.y + 10}
                textAnchor={textAnchor}
                className="fill-[#059669] dark:fill-[#34D399] font-mono text-[10px] font-bold tabular-nums"
              >
                {sk.masteryScore}/100 · {sk.evidenceCount} bài
              </text>

              {/* Hit Target */}
              <circle cx={pt.x} cy={pt.y} r="22" fill="transparent" />
            </g>
          );
        })}
      </svg>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#475569] dark:text-[#94A3B8] pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#10B981]/40 border border-[#10B981]" />
          <span>Điểm thành thạo hiện tại (mastery_score)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-t-2 border-dashed border-[#F59E0B]" />
          <span>Mốc chuẩn đầu ra (70/100)</span>
        </span>
      </div>

      {/* Floating Tooltip */}
      {activeSkill && activeCoord && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-xl bg-[#0F172A] text-white p-3.5 shadow-lg border border-emerald-500/40 text-xs space-y-1.5"
          style={{
            left: `${Math.min(64, Math.max(6, (activeCoord.x / svgWidth) * 100 - 15))}%`,
            top: `${Math.max(4, (activeCoord.y / svgHeight) * 100 - 26)}%`,
          }}
        >
          <div className="font-mono text-[10px] text-emerald-300 font-bold">
            MÃ KỸ NĂNG: {activeSkill.code}
          </div>
          <div className="font-bold text-white leading-snug">{activeSkill.name}</div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-slate-300">Điểm thành thạo:</span>
            <span className="font-mono font-bold text-emerald-400 tabular-nums">
              {activeSkill.masteryScore}/100
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Số bài kiểm tra minh chứng:</span>
            <span className="font-mono font-bold text-white tabular-nums">
              {activeSkill.evidenceCount} bài
            </span>
          </div>
          {activeSkill.sourceLabel && (
            <div className="text-[11px] text-slate-300 pt-0.5">
              {activeSkill.sourceLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
