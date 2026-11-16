import React, { useState } from 'react';
import { Compass } from 'lucide-react';

export interface RadarSkillVertex {
  code: string;
  name: string;
  masteryScore: number; // 0 - 100
  targetScore?: number; // default 80
  evidenceCount?: number;
}

interface RadarSkillChartProps {
  skills: RadarSkillVertex[];
  size?: number;
}

export const RadarSkillChart: React.FC<RadarSkillChartProps> = ({
  skills,
  size = 330,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!skills || skills.length === 0) {
    return (
      <div className="w-full py-10 px-4 rounded-xl bg-[#F8FAFC] dark:bg-[#090F0C] border border-dashed border-[#CBD5E1] dark:border-[#1E2D24] flex flex-col items-center justify-center text-center space-y-2.5">
        <div className="w-11 h-11 rounded-full bg-[#E6F7EF] dark:bg-[#0D281D] flex items-center justify-center text-[#059669] dark:text-[#34D399]">
          <Compass className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
          Chưa có dữ liệu điểm năng lực
        </div>
        <p className="text-xs text-[#475569] dark:text-[#94A3B8] max-w-sm leading-relaxed">
          Biểu đồ đa giác năng lực sẽ tự động hình thành ngay sau khi bạn đăng ký khóa học và hoàn thành bài kiểm tra đầu tiên.
        </p>
      </div>
    );
  }

  // If the student only has 1 or 2 skills recorded so far, pad with neutral axes (0 score) so a polygon can be drawn cleanly
  const items: RadarSkillVertex[] =
    skills.length >= 3
      ? skills.slice(0, 6)
      : [
          ...skills,
          ...(skills.length === 1
            ? [
                { code: 'PENDING-1', name: 'Kỹ năng tiếp theo', masteryScore: 0, evidenceCount: 0 },
                { code: 'PENDING-2', name: 'Kỹ năng chuyên sâu', masteryScore: 0, evidenceCount: 0 },
              ]
            : [
                { code: 'PENDING-1', name: 'Kỹ năng tiếp theo', masteryScore: 0, evidenceCount: 0 },
              ]),
        ];

  const count = items.length;
  const center = size / 2;
  const radius = size * 0.33;
  const levels = [25, 50, 75, 100];

  const getCoordinates = (index: number, valuePct: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, valuePct)) / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      angle,
    };
  };

  // Concentric grid polygons
  const levelPolygons = levels.map((lvl) => {
    const pts = items.map((_, i) => {
      const c = getCoordinates(i, lvl);
      return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    });
    return { lvl, points: pts.join(' ') };
  });

  // Target graduation polygon (80% benchmark)
  const targetPoints = items
    .map((s, i) => {
      const c = getCoordinates(i, s.targetScore ?? 80);
      return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    })
    .join(' ');

  // Student mastery polygon
  const studentCoords = items.map((s, i) => getCoordinates(i, s.masteryScore));
  const studentPoints = studentCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const shortSkillLabel = (name: string) => {
    if (name.length <= 22) return name;
    return name.slice(0, 20) + '…';
  };

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg
        width="100%"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible max-w-[360px]"
      >
        <defs>
          <radialGradient id="skillRadarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.16" />
          </radialGradient>
        </defs>

        {/* Grid concentric rings */}
        {levelPolygons.map(({ lvl, points }) => (
          <g key={lvl}>
            <polygon
              points={points}
              fill="none"
              stroke="currentColor"
              className="text-[#E2ECE7] dark:text-[#1E2D24]"
              strokeWidth={lvl === 100 ? 1.5 : 1}
              strokeDasharray={lvl === 75 ? '3 3' : undefined}
            />
            <text
              x={center + 4}
              y={center - (lvl / 100) * radius + 10}
              className="fill-[#94A3B8] dark:fill-[#64748B] text-[9px] font-mono"
            >
              {lvl}
            </text>
          </g>
        ))}

        {/* Axis spokes */}
        {items.map((_, i) => {
          const outer = getCoordinates(i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="currentColor"
              className="text-[#E2ECE7] dark:text-[#1E2D24]"
              strokeWidth="1"
            />
          );
        })}

        {/* Target Graduation Benchmark Polygon (80/100) */}
        <polygon
          points={targetPoints}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.75"
        />

        {/* Student Mastery Polygon */}
        <polygon
          points={studentPoints}
          fill="url(#skillRadarFill)"
          stroke="#10B981"
          strokeWidth="2.5"
          className="transition-all duration-500"
        />

        {/* Vertex nodes & outer labels */}
        {items.map((skill, i) => {
          const pt = studentCoords[i];
          const labelPos = getCoordinates(i, 126);
          const isHovered = hoveredIdx === i;
          const textAnchor =
            Math.abs(labelPos.x - center) < 12
              ? 'middle'
              : labelPos.x > center
              ? 'start'
              : 'end';

          return (
            <g
              key={skill.code}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={10}
                  className="fill-[#10B981]/20 animate-ping"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6 : 4.5}
                className="fill-[#10B981] stroke-white dark:stroke-[#111A15] transition-all duration-200"
                strokeWidth="2"
              />

              {/* Axis Label */}
              <text
                x={labelPos.x}
                y={labelPos.y - 4}
                textAnchor={textAnchor}
                className={`text-[10.5px] font-semibold transition-colors ${
                  isHovered
                    ? 'fill-[#059669] dark:fill-[#34D399] font-bold'
                    : 'fill-[#0F172A] dark:fill-[#ECFDF5]'
                }`}
              >
                {shortSkillLabel(skill.name)}
              </text>
              <text
                x={labelPos.x}
                y={labelPos.y + 10}
                textAnchor={textAnchor}
                className="fill-[#059669] dark:fill-[#34D399] text-[10px] font-mono font-bold"
              >
                {skill.masteryScore}/100
                {skill.evidenceCount !== undefined && skill.evidenceCount > 0
                  ? ` · ${skill.evidenceCount} bài`
                  : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#10B981]/40 border-2 border-[#10B981]" />
          <span className="font-medium">Điểm thành thạo hiện tại</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-b-2 border-dashed border-[#F59E0B]" />
          <span className="font-medium">Mốc chuẩn tốt nghiệp (80/100)</span>
        </div>
      </div>
    </div>
  );
};
