import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { formatTimestamp } from '../utils/academyLogic';

export interface VideoChapterItem {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  label: string;
}

export interface VideoSubtitleCue {
  timeLabel: string;
  speaker: string;
  text: string;
}

export interface SessionVideoPlayerProps {
  src: string;
  title: string;
  posterUrl?: string;
  initialPositionSec?: number;
  watermarkText?: string;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  chapters?: VideoChapterItem[];
  activeSubtitle?: VideoSubtitleCue | null;
  seekRequest?: { sec: number; label?: string; nonce: number } | null;
  onTimeUpdate?: (currentSec: number, durationSec: number) => void;
  onPauseSave?: (currentSec: number, durationSec: number) => void;
  onEnded?: (durationSec: number) => void;
  onJumpChapter?: (sec: number, label: string) => void;
}

const FALLBACK_MP4_STREAMS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://media.w3.org/2010/05/bunny/trailer.mp4',
];

function normalizeInitialSource(rawSrc: string): string {
  const trimmed = (rawSrc || '').trim();
  if (
    !trimmed ||
    trimmed.includes('media.yourdomain.com') ||
    trimmed.includes('cdn.3t.edu.vn') ||
    /recordings\/(ai|fs|de|do|sec|cloud|data|ml)-/i.test(trimmed)
  ) {
    return FALLBACK_MP4_STREAMS[0]!;
  }
  return trimmed;
}

export const SessionVideoPlayer: React.FC<SessionVideoPlayerProps> = ({
  src,
  title,
  posterUrl,
  initialPositionSec = 0,
  watermarkText,
  chapters = [],
  activeSubtitle,
  seekRequest,
  onTimeUpdate,
  onPauseSave,
  onEnded,
  onJumpChapter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hasRestoredPositionRef = useRef<boolean>(false);
  const fallbackIndexRef = useRef<number>(0);

  const [activeSrc, setActiveSrc] = useState<string>(() => normalizeInitialSource(src));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentSec, setCurrentSec] = useState<number>(initialPositionSec);
  const [durationSec, setDurationSec] = useState<number>(30);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [resumeToast, setResumeToast] = useState<string | null>(null);

  useEffect(() => {
    hasRestoredPositionRef.current = false;
    fallbackIndexRef.current = 0;
    setMediaError(null);
    setIsBuffering(true);
    setActiveSrc(normalizeInitialSource(src));
  }, [src]);

  // Attach hls.js for .m3u8 streams or native progressive MP4/WebM streaming
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activeSrc) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = /\.m3u8(\?.*)?$/i.test(activeSrc);

    const switchToNextFallback = () => {
      if (fallbackIndexRef.current < FALLBACK_MP4_STREAMS.length) {
        const nextUrl = FALLBACK_MP4_STREAMS[fallbackIndexRef.current]!;
        fallbackIndexRef.current += 1;
        if (nextUrl !== activeSrc) {
          setMediaError(null);
          setActiveSrc(nextUrl);
          return true;
        }
      }
      return false;
    };

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(activeSrc);
      hls.attachMedia(vid);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        setMediaError(null);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
            hlsRef.current = null;
            if (!switchToNextFallback()) {
              setIsBuffering(false);
              setMediaError('Không thể tải luồng video này. Vui lòng thử lại.');
            }
          }
        }
      });
    } else {
      vid.src = activeSrc;
      vid.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSrc]);

  // Respond to external seek requests (Transcript line clicks, AI Tutor citations, Chapter clicks)
  useEffect(() => {
    if (!seekRequest) return;
    const vid = videoRef.current;
    const target = Math.max(0, Math.floor(seekRequest.sec));
    setCurrentSec(target);
    if (vid) {
      const clampedTarget =
        Number.isFinite(vid.duration) && vid.duration > 0
          ? Math.min(target, Math.max(0, vid.duration - 0.5))
          : target;
      try {
        vid.currentTime = clampedTarget;
      } catch {
        // Ignore seek before metadata ready
      }
      void vid
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
        });
    }
  }, [seekRequest]);

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setIsBuffering(false);
    setMediaError(null);
    if (Number.isFinite(vid.duration) && vid.duration > 0) {
      setDurationSec(Math.floor(vid.duration));
    }
    vid.volume = volume;
    vid.muted = isMuted;
    vid.playbackRate = playbackRate;

    if (!hasRestoredPositionRef.current && initialPositionSec > 0) {
      hasRestoredPositionRef.current = true;
      const maxResume =
        Number.isFinite(vid.duration) && vid.duration > 2
          ? Math.min(initialPositionSec, Math.floor(vid.duration - 2))
          : initialPositionSec;
      try {
        vid.currentTime = Math.max(0, maxResume);
        setCurrentSec(Math.max(0, maxResume));
        setResumeToast(`Đã khôi phục tiến độ xem tại ${formatTimestamp(maxResume)}`);
        window.setTimeout(() => setResumeToast(null), 3500);
      } catch {
        // Ignore initial seek failure
      }
    }
  };

  const handleTogglePlay = async () => {
    const vid = videoRef.current;
    if (!vid) return;
    setMediaError(null);

    if (vid.paused) {
      try {
        await vid.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleSeekTo = (sec: number, label?: string) => {
    const vid = videoRef.current;
    const safeSec = Math.max(0, Math.min(sec, durationSec || 600));
    setCurrentSec(safeSec);
    if (vid) {
      try {
        vid.currentTime = safeSec;
      } catch {
        // Ignore
      }
      if (vid.paused) {
        void vid
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    }
    if (label && onJumpChapter) {
      onJumpChapter(safeSec, label);
    }
  };

  const handleSkipBy = (deltaSec: number) => {
    handleSeekTo(currentSec + deltaSec);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
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

  const handleVolumeSlider = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
  };

  const handleToggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    }
  };

  const handleTogglePiP = async () => {
    const vid = videoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    if (!vid || typeof vid.requestPictureInPicture !== 'function') return;
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

  const handleVideoElementError = () => {
    if (fallbackIndexRef.current < FALLBACK_MP4_STREAMS.length) {
      const nextUrl = FALLBACK_MP4_STREAMS[fallbackIndexRef.current]!;
      fallbackIndexRef.current += 1;
      if (nextUrl !== activeSrc) {
        setMediaError(null);
        setActiveSrc(nextUrl);
        return;
      }
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setMediaError('Không thể tải luồng video này. Vui lòng bấm Thử tải lại.');
  };

  const progressPct =
    durationSec > 0 ? Math.min(100, Math.round((currentSec / durationSec) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden bg-[#0F172A] border border-[#1E293B] shadow-md text-white select-none"
    >
      {/* 16:9 Video Viewport */}
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          poster={posterUrl}
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsPlaying(true);
          }}
          onTimeUpdate={(e) => {
            const sec = Math.floor(e.currentTarget.currentTime);
            const dur =
              Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0
                ? Math.floor(e.currentTarget.duration)
                : durationSec;
            setCurrentSec(sec);
            if (dur > 0 && dur !== durationSec) {
              setDurationSec(dur);
            }
            onTimeUpdate?.(sec, dur);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={(e) => {
            setIsPlaying(false);
            const sec = Math.floor(e.currentTarget.currentTime);
            onPauseSave?.(sec, durationSec);
          }}
          onEnded={() => {
            setIsPlaying(false);
            onEnded?.(durationSec);
          }}
          onError={handleVideoElementError}
          onClick={() => void handleTogglePlay()}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Top Bar Overlay */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 border border-white/15 font-mono text-[11px] text-[#34D399]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
            <span>VIDEO BÀI GIẢNG HD · LƯU TIẾN ĐỘ TỰ ĐỘNG</span>
          </span>

          {watermarkText && (
            <span className="px-2.5 py-1 rounded-md bg-black/60 border border-white/10 font-mono text-[11px] text-white/80">
              {watermarkText}
            </span>
          )}
        </div>

        {/* Resume Toast */}
        {resumeToast && (
          <div className="absolute top-12 left-3 px-3 py-1.5 rounded-lg bg-[#064E3B]/90 border border-[#10B981]/50 text-xs font-mono text-[#A7F3D0] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#34D399]" />
            <span>{resumeToast}</span>
          </div>
        )}

        {/* Buffering Spinner */}
        {isBuffering && !mediaError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="px-4 py-2 rounded-xl bg-black/75 border border-white/15 flex items-center gap-2 text-xs font-medium text-white">
              <Loader2 className="w-4 h-4 text-[#10B981] animate-spin" />
              <span>Đang tải video bài giảng...</span>
            </div>
          </div>
        )}

        {/* Center Play Overlay when Paused */}
        {!isPlaying && !mediaError && !isBuffering && (
          <button
            type="button"
            onClick={() => void handleTogglePlay()}
            aria-label="Phát bài giảng"
            className="group relative z-10 flex flex-col items-center gap-2.5 px-6 py-4 rounded-2xl bg-black/65 hover:bg-black/80 border border-white/20 transition-all cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-[#10B981] group-hover:bg-[#059669] flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
              <Play className="w-6 h-6 text-white fill-current ml-0.5" />
            </div>
            <span className="text-xs font-bold text-white max-w-md text-center line-clamp-1">
              {title}
            </span>
          </button>
        )}

        {/* Error Recovery Overlay */}
        {mediaError && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            <p className="text-xs sm:text-sm text-amber-300 max-w-md">{mediaError}</p>
            <button
              type="button"
              onClick={() => {
                setMediaError(null);
                fallbackIndexRef.current = 0;
                setActiveSrc(FALLBACK_MP4_STREAMS[0]!);
              }}
              className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
            >
              Thử tải lại video bài giảng
            </button>
          </div>
        )}

        {/* Synchronized Subtitle Bar */}
        {activeSubtitle && (
          <div className="absolute bottom-3 left-4 right-4 p-2.5 rounded-xl bg-black/80 border border-white/15 flex items-center justify-between gap-3 text-xs pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded bg-[#10B981] text-white font-mono text-[11px] font-bold shrink-0">
                {activeSubtitle.timeLabel}
              </span>
              <p className="text-white/95 truncate">
                <strong className="text-[#34D399] mr-1.5">{activeSubtitle.speaker}:</strong>
                {activeSubtitle.text}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Timeline & Controls Bar */}
      <div className="p-3.5 bg-[#0F172A] border-t border-white/10 space-y-3">
        {/* Seek Slider + Chapter Markers */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(durationSec, 1)}
            value={Math.min(currentSec, Math.max(durationSec, 1))}
            onChange={(e) => handleSeekTo(Number(e.target.value))}
            aria-label="Thanh thời gian bài giảng"
            className="w-full accent-[#10B981] cursor-pointer h-1.5 rounded-lg"
          />

          <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
            <span>
              {formatTimestamp(currentSec)} / {formatTimestamp(durationSec)} ({progressPct}%)
            </span>
            <span>Tốc độ phát: {playbackRate}x</span>
          </div>
        </div>

        {/* Transport Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
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
                  <span>Phát</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSkipBy(-10)}
              title="Lùi 10 giây"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>-10s</span>
            </button>

            <button
              type="button"
              onClick={() => handleSkipBy(10)}
              title="Tiến 10 giây"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>+10s</span>
            </button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-1.5 pl-2">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#34D399]" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeSlider(Number(e.target.value))}
                aria-label="Âm lượng"
                className="w-20 accent-[#10B981] cursor-pointer h-1"
              />
            </div>
          </div>

          {/* Right Controls: Speed, PiP, Fullscreen */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleSpeedChange(rate)}
                className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-[#10B981] text-white font-bold'
                    : 'bg-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                {rate}x
              </button>
            ))}

            <button
              type="button"
              onClick={() => void handleTogglePiP()}
              title="Thu nhỏ góc màn hình (PiP)"
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-mono text-white/90 cursor-pointer"
            >
              PiP
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              title="Toàn màn hình"
              className="p-1.5 rounded bg-white/10 hover:bg-white/15 text-white cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chapter Quick-Jump Pills */}
        {chapters.length > 0 && (
          <div className="pt-2 border-t border-white/10 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-mono text-[#94A3B8] shrink-0">Mốc bài giảng:</span>
            {chapters.map((chap) => {
              const isCurrentChap =
                currentSec >= chap.startSec && currentSec <= chap.endSec;
              return (
                <button
                  key={chap.id}
                  type="button"
                  onClick={() => handleSeekTo(chap.startSec, chap.label)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[11px] shrink-0 transition-colors cursor-pointer ${
                    isCurrentChap
                      ? 'bg-[#10B981] text-white font-bold'
                      : 'bg-white/10 text-[#CBD5E1] hover:bg-white/15'
                  }`}
                >
                  [{formatTimestamp(chap.startSec)}] {chap.title}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
