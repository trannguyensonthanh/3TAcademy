import React, { useState } from 'react';

export const AVATAR_MINH_KHOA =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80';
export const AVATAR_THU_HA =
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=240&q=80';
export const AVATAR_HOANG_NAM =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80';

/**
 * Resilient Avatar component obeying the Zero-Broken-Image Policy.
 * Renders a crisp botanical/emerald monogram fallback if the image fails to load.
 */
export const AvatarWithFallback: React.FC<{
  src?: string;
  name: string;
  className?: string;
}> = ({ src, name, className = 'w-10 h-10 rounded-full' }) => {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || imgError) {
    return (
      <div
        className={`${className} inline-flex items-center justify-center bg-[#D1FAE5] dark:bg-emerald-950/80 text-[#065F46] dark:text-emerald-300 font-semibold text-xs border border-emerald-500/20 select-none shrink-0`}
        title={name}
      >
        {initials || '3T'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={`${className} object-cover border border-[#E2ECE7] dark:border-[#1E2D24] shrink-0`}
    />
  );
};

/**
 * 2D SVG Botanical Sticker 1: Streak Leaf Flame (Chuỗi 7 Ngày Học Tập Bền Bỉ)
 */
export const StreakLeafFlameSticker: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="4"
      y="4"
      width="56"
      height="56"
      rx="16"
      className="fill-[#D1FAE5]/70 dark:fill-emerald-950/70 stroke-[#10B981]/30"
      strokeWidth="1.5"
    />
    {/* Botanical Outer Leaf Flame */}
    <path
      d="M32 10C32 10 47 21.5 47 36C47 44.8366 40.2843 52 32 52C23.7157 52 17 44.8366 17 36C17 27.5 23.5 20.5 27 16.5C27 21 30 23.5 32 10Z"
      fill="#10B981"
    />
    {/* Inner Warm Amber Energy Core */}
    <path
      d="M32 23C32 23 40 30 40 38C40 42.9706 36.4183 47 32 47C27.5817 47 24 42.9706 24 38C24 32.5 28.5 28 32 23Z"
      fill="#D1FAE5"
    />
    {/* Botanical Vein Line */}
    <path
      d="M32 30V45M32 36L36 33M32 40L28 37"
      stroke="#065F46"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * 2D SVG Botanical Sticker 2: AI Tutor Companion Avatar (Trợ Giảng AI Đa Phương Thức)
 */
export const AiTutorCompanionSticker: React.FC<{ className?: string }> = ({
  className = 'w-12 h-12',
}) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle
      cx="32"
      cy="32"
      r="28"
      className="fill-[#D1FAE5] dark:fill-emerald-950 stroke-[#10B981]"
      strokeWidth="2"
    />
    {/* Botanical Sprout Antenna */}
    <path
      d="M32 16V10M32 11C32 7.5 36.5 5 40 7C39 10.5 35.5 12 32 11ZM32 12C32 9 28 6.5 24.5 8.5C25.5 11.5 28.5 13 32 12Z"
      stroke="#059669"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Visor Head */}
    <rect
      x="16"
      y="18"
      width="32"
      height="26"
      rx="10"
      fill="#0F172A"
      stroke="#10B981"
      strokeWidth="2"
    />
    {/* Friendly Eyes */}
    <circle cx="25.5" cy="30" r="2.8" fill="#34D399" />
    <circle cx="38.5" cy="30" r="2.8" fill="#34D399" />
    {/* Smile Curve */}
    <path
      d="M27.5 36.5C29 38 35 38 36.5 36.5"
      stroke="#34D399"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Collar Leaf */}
    <path
      d="M22 47C26 45 38 45 42 47"
      stroke="#059669"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * 2D SVG Botanical Sticker 3: Competency Verified Shield (Khiên Bảo Chứng Năng Lực Tốt Nghiệp)
 */
export const CompetencyVerifiedShield: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M32 6L52 14V30C52 43.5 43.2 53.6 32 58C20.8 53.6 12 43.5 12 30V14L32 6Z"
      className="fill-[#D1FAE5] dark:fill-emerald-950/90 stroke-[#10B981]"
      strokeWidth="2.5"
    />
    <path
      d="M32 12L46 17.6V29.5C46 39.8 39.8 47.7 32 51.4C24.2 47.7 18 39.8 18 29.5V17.6L32 12Z"
      fill="#10B981"
    />
    <path
      d="M25.5 31.5L30 36L39.5 26.5"
      stroke="#FFFFFF"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 2D SVG Botanical Sticker 4: Celebration Botanical Trophy (Chúc Mừng Mở Khóa Đợt Học SePay)
 */
export const CelebrationBotanicalSticker: React.FC<{ className?: string }> = ({
  className = 'w-20 h-20',
}) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle
      cx="40"
      cy="40"
      r="36"
      className="fill-[#D1FAE5] dark:fill-emerald-950/90 stroke-[#10B981]"
      strokeWidth="2"
    />
    {/* Left & Right Laurel Leaves */}
    <path
      d="M22 48C17 41 18 30 24 23M58 48C63 41 62 30 56 23"
      stroke="#059669"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Central Emerald Badge */}
    <circle cx="40" cy="39" r="17" fill="#10B981" />
    <path
      d="M32.5 39.5L37.5 44.5L48 34"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Bottom Ribbon */}
    <path
      d="M30 58H50"
      stroke="#065F46"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * 2D SVG Botanical Sticker 5: Empty State Botanical Illustration
 */
export const EmptyStateBotanicalIllustration: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="8"
      y="12"
      width="48"
      height="40"
      rx="10"
      className="fill-[#F7FBF9] dark:fill-[#111A15] stroke-[#10B981]/50"
      strokeWidth="2"
    />
    <path
      d="M32 42V26M32 28C32 23 38 20 42 23C40 28 36 29 32 28ZM32 32C32 27 26 24 22 27C24 31 28 33 32 32Z"
      stroke="#10B981"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
