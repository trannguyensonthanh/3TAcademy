import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Film,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTimestamp } from '../utils/academyLogic';

export interface VideoChapterItem {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  label: string;
}

export interface SessionVideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  initialPositionSec?: number;
  seekRequest?: { sec: number; label?: string; nonce: number } | null;
  watermarkText?: string;
  chapters?: VideoChapterItem[];
  activeSubtitle?: { timeLabel: string; speaker: string; text: string } | null;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onTimeUpdate?: (sec: number, durationSec: number) => void;
  onDurationReady?: (durationSec: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onPauseSave?: (sec: number) => void;
  onEnded?: (durationSec: number) => void;
  onJumpChapter?: (sec: number, title: string) => void;
}

export const SessionVideoPlayer: React.FC<SessionVideoPlayerProps> = ({
  src,
  title,
  poster,
  initialPositionSec = 0,
  seekRequest,
  watermarkText,
  chapters = [],
  activeSubtitle,
  compact = false,
  emptyTitle = 'Video bài giảng chưa được tải lên',
  emptyDescription = 'Giảng viên chưa gắn video bản ghi cho buổi học này hoặc buổi học đang ở trạng thái sắp diễn ra.',
  onTimeUpdate,
  onDurationReady,
  onPlayStateChange,
  onPauseSave,
  onEnded,
  onJumpChapter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const appliedInitialRef = useRef<string>('');

  const [currentSec, setCurrentSec] = useState<number>(Math.max(0, Math.floor(initialPositionSec)));
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [subtitlesOn, setSubtitlesOn] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [watermarkCornerIndex, setWatermarkCornerIndex] = useState<number>(0);

  const normalizedSrc = (src || '').trim();

  useEffect(() => {
    setPlaybackError(null);
    setIsPlaying(false);
    setIsBuffering(Boolean(normalizedSrc));
    appliedInitialRef.current = '';
  }, [normalizedSrc, retryCount]);

  useEffect(() => {
    if (!watermarkText) return;
    const timer = window.setInterval(() => {
      setWatermarkCornerIndex((prev) => (prev + 1) % 4);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [watermarkText]);

  useEffect(() => {
    if (!seekRequest || !videoRef.current || !normalizedSrc) return;
    const targetSec = Math.max(0, Math.floor(seekRequest.sec));
    const vid = videoRef.current;
    try {
      const clamped =
        vid.duration && Number.isFinite(vid.duration)
          ? Math.min(targetSec, Math.max(0, Math.floor(vid.duration) - 1))
          : targetSec;
      vid.currentTime = clamped;
      setCurrentSec(clamped);
      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch {
      // Ignore seek before metadata ready
    }
  }, [seekRequest, normalizedSrc]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleTogglePlay = () => {
    const vid = videoRef.current;
    if (!vid || !normalizedSrc) return;
    if (vid.paused) {
      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          setPlaybackError('Trình duyệt chặn tự động phát. Hãy bấm Play trực tiếp trên video.');
        });
      }
    } else {
      vid.pause();
    }
  };

  const handleRelativeSeek = (deltaSec: number) => {
    const vid = videoRef.current;
    if (!vid || !normalizedSrc) return;
    const maxBound = durationSec > 0 ? durationSec : vid.duration || 0;
    const nextSec = Math.max(0, Math.min(maxBound || Number.MAX_SAFE_INTEGER, Math.floor(vid.currentTime + deltaSec)));
    vid.currentTime = nextSec;
    setCurrentSec(nextSec);
    onTimeUpdate?.(nextSec, maxBound);
  };

  const handleScrubChange = (nextSec: number) => {
    const vid = videoRef.current;
    setCurrentSec(nextSec);
    if (vid && normalizedSrc) {
      vid.currentTime = nextSec;
    }
    onTimeUpdate?.(nextSec, durationSec);
  };

  const handleSpeedSelect = (rate: 1 | 1.25 | 1.5) => {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen denial
    }
  };

  const handleTogglePiP = async () => {
    const vid = videoRef.current;
    if (!vid || typeof document === 'undefined' || !('pictureInPictureEnabled' in document)) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await vid.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP unsupported
    }
  };

  const watermarkCornerClasses = [
    'top-4 right-5',
    'bottom-16 right-5',
    'bottom-16 left-5',
    'top-4 left-5',
  ][watermarkCornerIndex];

  const activeChapter =
    chapters.find((c) => currentSec >= c.startSec && currentSec <= c.endSec) ?? chapters[0];

  if (!normalizedSrc) {
    return (
      <div className="rounded-2xl bg-[#090F0C] text-white border border-slate-800 overflow-hidden p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto">
          <Film className="w-6 h-6 text-[#10B981]" />
        </div>
        <h3 className="text-base font-bold text-white">{emptyTitle}</h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-2xl bg-[#090F0C] text-white border border-slate-800 overflow-hidden shadow-md"
    >
      <div className="relative bg-black">
        <video
          key={`${normalizedSrc}-${retryCount}`}
          ref={videoRef}
          src={normalizedSrc}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          onLoadStart={() => setIsBuffering(true)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            setPlaybackError(null);
          }}
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            setIsBuffering(false);
            const rawDur =
              vid.duration && Number.isFinite(vid.duration) ? Math.floor(vid.duration) : 0;
            if (rawDur > 0) {
              setDurationSec(rawDur);
              onDurationReady?.(rawDur);
            }
            vid.playbackRate = playbackSpeed;
            vid.volume = volume;
            vid.muted = isMuted;

            const initKey = `${normalizedSrc}:${initialPositionSec}`;
            if (initialPositionSec > 0 && appliedInitialRef.current !== initKey) {
              appliedInitialRef.current = initKey;
              const safeStart =
                rawDur > 2 ? Math.min(initialPositionSec, rawDur - 1) : initialPositionSec;
              vid.currentTime = safeStart;
              setCurrentSec(safeStart);
            }
          }}
          onTimeUpdate={(e) => {
            const vid = e.currentTarget;
            const sec = Math.floor(vid.currentTime || 0);
            const dur =
              vid.duration && Number.isFinite(vid.duration)
                ? Math.floor(vid.duration)
                : durationSec;
            setCurrentSec(sec);
            if (dur > 0 && dur !== durationSec) {
              setDurationSec(dur);
            }
            onTimeUpdate?.(sec, dur);
          }}
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            onPlayStateChange?.(true);
          }}
          onPause={(e) => {
            setIsPlaying(false);
            onPlayStateChange?.(false);
            onPauseSave?.(Math.floor(e.currentTarget.currentTime || 0));
          }}
          onEnded={(e) => {
            setIsPlaying(false);
            onPlayStateChange?.(false);
            const dur = Math.floor(e.currentTarget.duration || durationSec || 0);
            onEnded?.(dur);
          }}
          onError={() => {
            setIsBuffering(false);
            setIsPlaying(false);
            setPlaybackError(
              'Không thể tải luồng video từ đường dẫn hiện tại. Hãy kiểm tra kết nối mạng hoặc thử tải lại.'
            );
          }}
          className={`w-full aspect-video bg-black object-contain ${
            compact ? 'max-h-[380px]' : ''
          }`}
        />

        {/* Buffering indicator */}
        {isBuffering && !playbackError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
            <div className="px-3.5 py-2 rounded-lg bg-black/80 border border-slate-700 text-xs font-mono text-emerald-300 flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin" />
              <span>Đang tải luồng video...</span>
            </div>
          </div>
        )}

        {/* Playback error fallback */}
        {playbackError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center space-y-3 z-20">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <div className="text-sm font-bold text-white">Không phát được video</div>
            <p className="text-xs text-slate-300 max-w-md">{playbackError}</p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
            >
              Thử tải lại video
            </button>
          </div>
        )}

        {/* Top overlay */}
        {!compact && (title || activeChapter) && (
          <div className="pointer-events-none absolute top-3 left-4 flex flex-wrap items-center gap-2 z-10">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-black/70 border border-[#10B981]/50 text-emerald-300 font-mono text-xs font-semibold tabular-nums">
              <span>{formatTimestamp(currentSec)}</span>
              {activeChapter ? (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[280px]">{activeChapter.title}</span>
                </>
              ) : title ? (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[280px]">{title}</span>
                </>
              ) : null}
            </span>
          </div>
        )}

        {/* Moving Copyright Watermark */}
        {watermarkText && (
          <div
            aria-label="Dòng chữ bảo vệ bản quyền hiển thị email học viên"
            className={`pointer-events-none select-none absolute ${watermarkCornerClasses} transition-all duration-1000 px-2.5 py-1 rounded bg-black/45 text-white/50 font-mono text-[11px] z-10`}
          >
            {watermarkText}
          </div>
        )}

        {/* Vietnamese Subtitle Overlay */}
        {subtitlesOn && activeSubtitle && !playbackError && (
          <div className="pointer-events-none absolute bottom-14 inset-x-4 flex justify-center z-10">
            <div className="max-w-2xl px-4 py-2 rounded-lg bg-black/80 text-center text-xs sm:text-sm text-emerald-100 border border-white/15">
              <span className="font-semibold text-emerald-400">
                [{activeSubtitle.timeLabel}] {activeSubtitle.speaker}:
              </span>{' '}
              “{activeSubtitle.text}”
            </div>
          </div>
        )}
      </div>

      {/* Interactive Scrubber + Controls + Chapters */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
        {/* Range scrubber */}
        <div className="space-y-1">
          <input
            type="range"
            aria-label="Thanh tua thời lượng video"
            min={0}
            max={Math.max(durationSec, currentSec, 1)}
            value={Math.min(currentSec, Math.max(durationSec, currentSec, 1))}
            onChange={(e) => handleScrubChange(Number(e.target.value))}
            className="w-full accent-[#10B981] cursor-pointer h-1.5"
          />
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>{formatTimestamp(currentSec)}</span>
            <span>{durationSec > 0 ? formatTimestamp(durationSec) : '--:--'}</span>
          </div>
        </div>

        {/* Chapters row */}
        {chapters.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {chapters.map((chap) => {
              const isCurrent = currentSec >= chap.startSec && currentSec <= chap.endSec;
              return (
                <button
                  key={chap.id}
                  type="button"
                  onClick={() => {
                    handleScrubChange(chap.startSec);
                    videoRef.current?.play()?.catch(() => {});
                    onJumpChapter?.(chap.startSec, chap.title);
                  }}
                  className={`p-2 rounded-lg text-left border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-emerald-950/90 border-[#10B981] text-emerald-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono text-[10px] text-emerald-400">{chap.label}</div>
                  <div className="text-[11px] font-semibold truncate">{chap.title}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm dừng</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Phát bài giảng</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleRelativeSeek(-10)}
              aria-label="Lùi 10 giây"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>-10s</span>
            </button>

            <button
              type="button"
              onClick={() => handleRelativeSeek(10)}
              aria-label="Tua tới 10 giây"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-200 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>+10s</span>
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#10B981]" />
                )}
              </button>
              <input
                type="range"
                aria-label="Âm lượng"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-14 accent-[#10B981] cursor-pointer h-1"
              />
            </div>

            {/* Speed selector */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {([1, 1.25, 1.5] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleSpeedSelect(rate)}
                  className={`px-2 py-0.5 rounded font-mono font-bold cursor-pointer ${
                    playbackSpeed === rate
                      ? 'bg-[#10B981] text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeSubtitle !== undefined && (
              <button
                type="button"
                onClick={() => setSubtitlesOn((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                  subtitlesOn
                    ? 'bg-emerald-950 border-[#10B981] text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>{subtitlesOn ? 'Phụ đề: Bật' : 'Phụ đề: Tắt'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePiP}
              aria-label="Thu nhỏ video nổi"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
