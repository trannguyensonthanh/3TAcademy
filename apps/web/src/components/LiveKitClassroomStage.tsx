import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CloudUpload,
  Disc,
  FlipHorizontal,
  Hand,
  LayoutGrid,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Play,
  Radio,
  ShieldAlert,
  Sparkles,
  Square,
  Users,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react';
import type { Track } from 'livekit-client';
import { AvatarWithFallback } from './BotanicalStickers';
import { SessionVideoPlayer } from './SessionVideoPlayer';
import type {
  LiveHandRaiseItem,
  LiveParticipantItem,
  LiveRecordingState,
} from '../services/learning.api';

export interface AttachedRemoteTrackItem {
  sid: string;
  participantIdentity: string;
  participantName: string;
  source: 'camera' | 'screen_share';
  track: Track;
}

interface LiveMediaTrackViewProps {
  track: Track;
  className?: string;
}

export const LiveMediaTrackView: React.FC<LiveMediaTrackViewProps> = ({ track, className }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    track.attach(el);
    void el.play().catch(() => {});
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className={className || 'w-full h-full object-cover'}
    />
  );
};

interface LocalMediaStreamViewProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}

export const LocalMediaStreamView: React.FC<LocalMediaStreamViewProps> = ({
  stream,
  muted = true,
  mirrored = false,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
  }, [stream]);

  if (!stream) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className || 'w-full h-full object-cover'} ${
        mirrored ? '-scale-x-100' : ''
      }`}
    />
  );
};

export interface LiveKitClassroomStageProps {
  sessionId: string;
  sessionOrder: number;
  sessionTitle: string;
  sessionStatus: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
  aiSummaryMd?: string;
  cohortCode: string;
  hostName: string;
  selfName: string;
  selfAccountId: string;
  selfRoleLabel: string;
  isHost: boolean;
  livekitConnected: boolean;
  livekitConnecting?: boolean;
  livekitRoomName?: string;
  sseConnected: boolean;
  stageViewMode: 'STAGE' | 'GRID' | 'VIDEO';
  onChangeStageViewMode: (mode: 'STAGE' | 'GRID' | 'VIDEO') => void;
  playableVideoUrl: string;
  webcamActive: boolean;
  camOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  localVideoStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  remoteVideoTracks: AttachedRemoteTrackItem[];
  activeSpeakerIdentities: string[];
  mutedIdentities: string[];
  raisedHands: LiveHandRaiseItem[];
  participants: LiveParticipantItem[];
  recordingState?: LiveRecordingState;
  recordingElapsedSec: number;
  isRecordingBusy: boolean;
  isUploadingR2: boolean;
  hostSlideLabel: string;
  hostTopicNote: string;
  floatingReactions: { id: string; label: string; leftPct: number }[];
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleScreenShare: () => void;
  onMuteParticipant: (targetIdentity?: string, muteAllStudents?: boolean) => void;
  onStartRecordingToR2: () => void;
  onStopRecordingToR2: () => void;
  onUploadVideoFileToR2: (file: File) => void;
}

function formatDurationClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const LiveKitClassroomStage: React.FC<LiveKitClassroomStageProps> = ({
  sessionOrder,
  sessionTitle,
  cohortCode,
  hostName,
  selfName,
  selfAccountId,
  selfRoleLabel,
  isHost,
  livekitConnected,
  livekitConnecting,
  livekitRoomName,
  stageViewMode,
  onChangeStageViewMode,
  playableVideoUrl,
  webcamActive,
  camOn,
  micOn,
  screenSharing,
  handRaised,
  localVideoStream,
  screenShareStream,
  remoteVideoTracks,
  activeSpeakerIdentities,
  mutedIdentities,
  raisedHands,
  participants,
  recordingState,
  recordingElapsedSec,
  isRecordingBusy,
  isUploadingR2,
  hostSlideLabel,
  hostTopicNote,
  floatingReactions,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onMuteParticipant,
  onStartRecordingToR2,
  onStopRecordingToR2,
  onUploadVideoFileToR2,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mirrorLocalCam, setMirrorLocalCam] = useState<boolean>(true);
  const [pinnedTarget, setPinnedTarget] = useState<'AUTO' | 'SELF' | 'SCREEN'>('AUTO');

  const remoteScreenTrack = remoteVideoTracks.find((t) => t.source === 'screen_share');
  const remoteCameraTracks = remoteVideoTracks.filter((t) => t.source === 'camera');
  const primaryRemoteCamera = remoteCameraTracks[0];
  const isRecording = Boolean(recordingState?.isRecording);
  const hasLocalCameraVideo = Boolean(webcamActive && camOn && localVideoStream);
  const hasLocalScreenVideo = Boolean(screenSharing && screenShareStream);

  const isParticipantMuted = (accountId: string, isParticipantHost: boolean) => {
    if (isParticipantHost) return false;
    return (
      mutedIdentities.includes('ALL_STUDENTS') ||
      mutedIdentities.includes(accountId) ||
      mutedIdentities.includes(`acc-${accountId}`)
    );
  };

  // Decide what occupies the primary 16:9 Google Meet stage
  const renderPrimaryMeetViewport = () => {
    // 1. Local Screen Share
    if (
      hasLocalScreenVideo &&
      (pinnedTarget === 'AUTO' || pinnedTarget === 'SCREEN')
    ) {
      return (
        <div className="relative w-full aspect-video bg-black overflow-hidden flex items-center justify-center">
          <LocalMediaStreamView
            stream={screenShareStream}
            muted
            mirrored={false}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-[#10B981]/60 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
            <MonitorUp className="w-4 h-4 text-[#10B981]" />
            <span>Bạn đang trình bày màn hình trực tiếp ({selfName})</span>
          </div>
          <button
            type="button"
            onClick={onToggleScreenShare}
            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
          >
            Dừng trình bày màn hình
          </button>

          {/* Picture-in-Picture Self Camera while Screen Sharing */}
          {hasLocalCameraVideo && (
            <div className="absolute bottom-4 right-4 w-44 sm:w-52 aspect-video rounded-xl overflow-hidden border-2 border-[#10B981] shadow-2xl bg-slate-950">
              <LocalMediaStreamView
                stream={localVideoStream}
                muted
                mirrored={mirrorLocalCam}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white">
                {selfName} (Camera)
              </div>
            </div>
          )}
        </div>
      );
    }

    // 2. Remote Screen Share
    if (remoteScreenTrack && pinnedTarget === 'AUTO') {
      return (
        <div className="relative w-full aspect-video bg-black overflow-hidden flex items-center justify-center">
          <LiveMediaTrackView
            track={remoteScreenTrack.track}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-[#10B981]/50 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
            <MonitorUp className="w-4 h-4 text-[#10B981]" />
            <span>Đang trình bày màn hình — {remoteScreenTrack.participantName}</span>
          </div>

          {hasLocalCameraVideo && (
            <div className="absolute bottom-4 right-4 w-44 sm:w-52 aspect-video rounded-xl overflow-hidden border-2 border-[#10B981] shadow-2xl bg-slate-950">
              <LocalMediaStreamView
                stream={localVideoStream}
                muted
                mirrored={mirrorLocalCam}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white">
                Bạn ({selfName})
              </div>
            </div>
          )}
        </div>
      );
    }

    // 3. Remote Camera (when another participant/instructor has camera on and user hasn't pinned self)
    if (primaryRemoteCamera && pinnedTarget !== 'SELF') {
      return (
        <div className="relative w-full aspect-video bg-black overflow-hidden">
          <LiveMediaTrackView
            track={primaryRemoteCamera.track}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/75 border border-white/15 text-white text-xs font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>{primaryRemoteCamera.participantName}</span>
          </div>

          {hasLocalCameraVideo && (
            <div
              onClick={() => setPinnedTarget('SELF')}
              title="Nhấn để phóng to Camera của bạn"
              className="absolute bottom-4 right-4 w-44 sm:w-52 aspect-video rounded-xl overflow-hidden border-2 border-[#10B981] shadow-2xl bg-slate-950 cursor-pointer"
            >
              <LocalMediaStreamView
                stream={localVideoStream}
                muted
                mirrored={mirrorLocalCam}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white">
                Bạn ({selfName})
              </div>
            </div>
          )}
        </div>
      );
    }

    // 4. Local Camera ON (You see your own live camera stream right on the main stage!)
    if (hasLocalCameraVideo) {
      return (
        <div className="relative w-full aspect-video bg-black overflow-hidden">
          <LocalMediaStreamView
            stream={localVideoStream}
            muted
            mirrored={mirrorLocalCam}
            className="w-full h-full object-cover"
          />

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMirrorLocalCam((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg bg-black/70 hover:bg-black/85 border border-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              title="Lật gương hình ảnh Camera"
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Lật gương</span>
            </button>
            {pinnedTarget === 'SELF' && primaryRemoteCamera && (
              <button
                type="button"
                onClick={() => setPinnedTarget('AUTO')}
                className="px-2.5 py-1.5 rounded-lg bg-black/70 hover:bg-black/85 border border-white/15 text-emerald-300 text-xs font-semibold cursor-pointer"
              >
                Bỏ ghim
              </button>
            )}
          </div>

          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/75 border border-white/15 text-white text-xs font-bold flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                micOn ? 'bg-[#10B981] animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span>
              {selfName} (Bạn · {selfRoleLabel})
            </span>
            {micOn ? (
              <Mic className="w-3.5 h-3.5 text-[#10B981]" />
            ) : (
              <MicOff className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
        </div>
      );
    }

    // 5. Default Google Meet / Zoom Camera-Off Video Stage (Clean Avatar + Quick Launch Camera/Mic/Screen Buttons)
    return (
      <div className="relative w-full aspect-video bg-gradient-to-b from-[#0E1713] to-[#080D0B] overflow-hidden flex flex-col items-center justify-center p-6 select-none">
        {/* Top subtle room info pill */}
        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-black/50 border border-slate-800 text-xs text-slate-300 font-mono">
            <Radio className="w-3.5 h-3.5 text-[#10B981]" />
            <span>
              Buổi {String(sessionOrder).padStart(2, '0')}: {sessionTitle}
            </span>
          </div>
          {(hostSlideLabel || hostTopicNote) && (
            <div className="px-3 py-1 rounded-lg bg-emerald-950/80 border border-[#10B981]/40 text-xs text-emerald-200 font-medium">
              {hostSlideLabel ? `${hostSlideLabel} · ` : ''}
              {hostTopicNote}
            </div>
          )}
        </div>

        {/* Center Google Meet Avatar + Audio Ring */}
        <div className="flex flex-col items-center gap-3 my-auto">
          <div className="relative">
            {micOn && (
              <span className="absolute -inset-2 rounded-full border-2 border-[#10B981] animate-ping opacity-40" />
            )}
            <div
              className={`p-1.5 rounded-full border-2 transition-all ${
                micOn
                  ? 'border-[#10B981] shadow-[0_0_30px_rgba(16,185,129,0.35)]'
                  : 'border-slate-700'
              }`}
            >
              <AvatarWithFallback
                name={selfName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full text-2xl"
              />
            </div>
            <span
              className={`absolute bottom-1 right-1 p-2 rounded-full border border-slate-900 ${
                micOn ? 'bg-[#10B981] text-slate-950' : 'bg-rose-600 text-white'
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </span>
          </div>

          <div className="text-center space-y-1">
            <div className="text-base sm:text-lg font-bold text-white flex items-center justify-center gap-2">
              <span>{selfName}</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-[#10B981]/30 text-emerald-300">
                {selfRoleLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Camera của bạn đang tắt · Bật Camera hoặc Chia sẻ màn hình để hiển thị trực tiếp lên sân khấu
            </p>
          </div>

          {/* Direct Google Meet Action Buttons right inside the video canvas */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onToggleCamera}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-slate-950 text-xs font-extrabold shadow-lg transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Bật Camera của tôi</span>
            </button>

            <button
              type="button"
              onClick={onToggleScreenShare}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
            >
              <MonitorUp className="w-4 h-4 text-[#10B981]" />
              <span>Trình bày / Chia sẻ màn hình</span>
            </button>

            <button
              type="button"
              onClick={onToggleMic}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                micOn
                  ? 'bg-emerald-500/20 border-[#10B981]/50 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-rose-400" />}
              <span>{micOn ? 'Đang bật Mic' : 'Bật Micro'}</span>
            </button>
          </div>
        </div>

        {/* Bottom-left participant name badge (Google Meet style) */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-400">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/60 text-slate-200 font-medium">
            <span>{selfName} (Bạn)</span>
            {handRaised && (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                · <Hand className="w-3.5 h-3.5" /> Đang giơ tay
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Chủ phòng: {hostName}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Studio Control & View Switcher Header */}
      <div className="rounded-xl bg-[#0D1512] border border-slate-800/90 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                livekitConnected
                  ? 'bg-[#10B981] animate-pulse'
                  : livekitConnecting
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-[#10B981]'
              }`}
            />
            <span>
              {livekitConnected
                ? `LiveKit Cloud SFU · ${livekitRoomName || 'Connected'}`
                : livekitConnecting
                  ? 'Đang kết nối LiveKit Cloud...'
                  : `Phòng Họp WebRTC · ${livekitRoomName || 'Sẵn sàng'}`}
            </span>
          </div>

          {isRecording && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-red-500/20 border border-red-500/50 text-red-200 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-ping" />
              <span>REC → R2 · {formatDurationClock(recordingElapsedSec)}</span>
            </div>
          )}

          {recordingState?.publicUrl && !isRecording && (
            <a
              href={recordingState.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-[#10B981]/40 text-emerald-300 text-[11px] font-mono hover:border-[#10B981]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Đã lưu bản ghi trên Cloudflare R2 ↗</span>
            </a>
          )}
        </div>

        {/* View Mode Switcher + Host Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isHost && (
            <>
              <button
                type="button"
                onClick={() => onMuteParticipant(undefined, true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-bold transition-colors cursor-pointer"
                title="Cắt micro toàn bộ học viên trong lớp"
              >
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                <span>Cắt Mic Cả Lớp</span>
              </button>

              {!isRecording ? (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStartRecordingToR2}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Disc className="w-3.5 h-3.5" />
                  <span>{isRecordingBusy ? 'Đang khởi tạo...' : 'Ghi hình lên R2'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStopRecordingToR2}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 border border-white/30 text-white text-xs font-bold animate-pulse cursor-pointer disabled:opacity-60"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Dừng &amp; Đẩy lên R2</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadVideoFileToR2(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                disabled={isUploadingR2}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                title="Tải file video bài giảng (.mp4/.webm) thẳng lên Cloudflare R2"
              >
                <CloudUpload className="w-3.5 h-3.5 text-[#10B981]" />
                <span>{isUploadingR2 ? 'Đang tải lên R2...' : 'Up Video → R2'}</span>
              </button>
            </>
          )}

          <div className="inline-flex items-center rounded-lg bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeStageViewMode('STAGE')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                stageViewMode === 'STAGE'
                  ? 'bg-[#10B981] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Sân khấu</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeStageViewMode('GRID')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                stageViewMode === 'GRID'
                  ? 'bg-[#10B981] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Lưới Meet</span>
            </button>
            {playableVideoUrl && (
              <button
                type="button"
                onClick={() => onChangeStageViewMode('VIDEO')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  stageViewMode === 'VIDEO'
                    ? 'bg-[#10B981] text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Replay R2</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODE 1: REPLAY VIDEO PLAYER */}
      {stageViewMode === 'VIDEO' && playableVideoUrl ? (
        <div className="relative">
          <SessionVideoPlayer
            src={playableVideoUrl}
            title={sessionTitle}
            compact
            watermarkText={`${selfName}${cohortCode ? ` · ${cohortCode}` : ''}`}
          />
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.leftPct}%` }}
              className="bottom-20 absolute px-3 py-1 rounded-lg bg-black/75 border border-white/20 text-xs font-bold text-white animate-bounce pointer-events-none z-20"
            >
              {r.label}
            </div>
          ))}
        </div>
      ) : stageViewMode === 'GRID' ? (
        /* MODE 2: GOOGLE MEET / ZOOM MULTI-TILE CAMERA GRID */
        <div className="rounded-2xl bg-[#0B120F] border border-slate-800 p-4 sm:p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono font-semibold text-emerald-400">
              CHẾ ĐỘ LƯỚI GOOGLE MEET ({Math.max(participants.length, 2)} THÀNH VIÊN)
            </span>
            {hostSlideLabel && (
              <span className="font-mono text-slate-300">{hostSlideLabel}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Tile 1: Local User (You) */}
            <div
              className={`relative aspect-video rounded-xl bg-slate-950 border overflow-hidden flex flex-col justify-between p-3 ${
                micOn || hasLocalCameraVideo ? 'border-2 border-[#10B981]' : 'border-slate-800'
              }`}
            >
              {hasLocalCameraVideo ? (
                <LocalMediaStreamView
                  stream={localVideoStream}
                  muted
                  mirrored={mirrorLocalCam}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="m-auto flex flex-col items-center gap-2">
                  <AvatarWithFallback
                    name={selfName}
                    className="w-16 h-16 rounded-full border-2 border-[#10B981]/50"
                  />
                  <span className="text-xs text-slate-400">{selfRoleLabel}</span>
                </div>
              )}

              <div className="relative z-10 flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold text-emerald-300">
                  Bạn ({selfName})
                </span>
                {handRaised && (
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center gap-1">
                    <Hand className="w-3 h-3" /> Giơ tay
                  </span>
                )}
              </div>

              <div className="relative z-10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onToggleCamera}
                  className="px-2 py-0.5 rounded bg-black/75 hover:bg-black text-[11px] text-slate-200 font-mono flex items-center gap-1 cursor-pointer"
                >
                  {hasLocalCameraVideo ? (
                    <>
                      <Video className="w-3 h-3 text-[#10B981]" />
                      <span>Cam ON</span>
                    </>
                  ) : (
                    <>
                      <VideoOff className="w-3 h-3 text-slate-400" />
                      <span>Bật Cam</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onToggleMic}
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    micOn ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Tile 1B: Local Screen Share Tile if sharing in Grid mode */}
            {hasLocalScreenVideo && (
              <div className="relative aspect-video rounded-xl bg-black border-2 border-[#10B981] overflow-hidden flex flex-col justify-between p-3">
                <LocalMediaStreamView
                  stream={screenShareStream}
                  muted
                  mirrored={false}
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <div className="relative z-10 flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-black/80 text-[11px] font-bold text-emerald-300">
                    Màn hình của bạn ({selfName})
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeStageViewMode('STAGE')}
                    className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 text-[10px] font-bold cursor-pointer"
                  >
                    Phóng to
                  </button>
                </div>
              </div>
            )}

            {/* Remote LiveKit Camera/Screen Tiles */}
            {remoteVideoTracks.map((rt) => {
              const isSpeaking = activeSpeakerIdentities.includes(rt.participantIdentity);
              return (
                <div
                  key={rt.sid}
                  className={`relative aspect-video rounded-xl bg-slate-950 border overflow-hidden flex flex-col justify-between p-3 ${
                    isSpeaking ? 'border-2 border-[#10B981]' : 'border-slate-800'
                  }`}
                >
                  <LiveMediaTrackView
                    track={rt.track}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold text-white">
                      {rt.participantName}{' '}
                      {rt.source === 'screen_share' ? '(Màn hình)' : ''}
                    </span>
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => onMuteParticipant(rt.participantIdentity, false)}
                        className="px-2 py-1 rounded bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MicOff className="w-3 h-3" />
                        <span>Cắt Mic</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Roster Participant Tiles */}
            {participants
              .filter((p) => String(p.accountId) !== String(selfAccountId))
              .slice(0, 8)
              .map((p) => {
                const muted = isParticipantMuted(p.accountId, p.isHost);
                const raised = raisedHands.some((h) => h.accountId === p.accountId);
                const isSpeaking = activeSpeakerIdentities.includes(`acc-${p.accountId}`);

                return (
                  <div
                    key={`grid-p-${p.accountId}`}
                    className={`relative aspect-video rounded-xl bg-[#111A15] border overflow-hidden flex flex-col justify-between p-3 group ${
                      isSpeaking
                        ? 'border-2 border-[#10B981]'
                        : p.isHost
                          ? 'border-[#10B981]/50'
                          : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          p.isHost
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {p.roleLabel}
                      </span>
                      {raised && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                          <Hand className="w-3 h-3" /> Giơ tay
                        </span>
                      )}
                    </div>

                    <div className="my-auto flex flex-col items-center gap-2">
                      <AvatarWithFallback
                        src={p.avatarUrl}
                        name={p.fullName}
                        className="w-14 h-14 rounded-full"
                      />
                      <div className="text-xs font-bold text-white text-center truncate max-w-full">
                        {p.fullName}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                          muted ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {muted ? (
                          <>
                            <MicOff className="w-3.5 h-3.5" />
                            <span>Đã cắt mic</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5" />
                            <span>Sẵn sàng</span>
                          </>
                        )}
                      </span>

                      {isHost && !p.isHost && (
                        <button
                          type="button"
                          onClick={() => onMuteParticipant(`acc-${p.accountId}`, false)}
                          className="px-2.5 py-1 rounded-md bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 text-red-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <MicOff className="w-3 h-3" />
                          <span>Cắt Mic</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* MODE 3: GOOGLE MEET / ZOOM VIDEO STAGE */
        <div className="rounded-2xl bg-[#0B120F] border border-slate-800 overflow-hidden shadow-xl relative">
          {renderPrimaryMeetViewport()}

          {/* Floating Reactions */}
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.leftPct}%` }}
              className="bottom-14 absolute px-3 py-1 rounded-lg bg-black/75 border border-white/20 text-xs font-bold text-white animate-bounce pointer-events-none z-20"
            >
              {r.label}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Participant Filmstrip (Host + Self Live Camera Tile + Quick Student Mute Controls) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Host Tile */}
        <div className="p-3.5 rounded-xl bg-[#111A15] border-2 border-[#10B981] flex items-center gap-3">
          <AvatarWithFallback name={hostName} className="w-11 h-11 rounded-full shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">{hostName}</div>
            <div className="text-[11px] text-emerald-400 font-mono">
              Giảng viên chủ trì · Host
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
            LIVE
          </span>
        </div>

        {/* Local User Tile (Always shows live mini preview when camera is on) */}
        <div
          onClick={() => {
            if (hasLocalCameraVideo) setPinnedTarget('SELF');
          }}
          className="p-3.5 rounded-xl bg-[#111A15] border border-slate-800 flex items-center justify-between gap-3 cursor-pointer hover:border-[#10B981]/60 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasLocalCameraVideo ? (
              <LocalMediaStreamView
                stream={localVideoStream}
                muted
                mirrored={mirrorLocalCam}
                className="w-16 h-11 rounded-lg bg-black object-cover border border-[#10B981] shrink-0"
              />
            ) : (
              <AvatarWithFallback name={selfName} className="w-11 h-11 rounded-full shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{selfName} (Bạn)</div>
              <div className="text-[11px] text-slate-400 truncate">
                {micOn ? 'Micro đang bật' : 'Micro đang tắt'} ·{' '}
                {hasLocalCameraVideo ? 'Camera đang bật' : 'Camera đang tắt'}
              </div>
            </div>
          </div>
          <span
            className={`p-2 rounded-lg shrink-0 ${
              micOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </span>
        </div>

        {/* Classroom Quick Moderation Tile */}
        <div className="p-3.5 rounded-xl bg-[#111A15] border border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Kiểm soát âm thanh lớp học</span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {mutedIdentities.includes('ALL_STUDENTS')
                ? 'Đã cắt mic toàn bộ học viên'
                : `${mutedIdentities.length} học viên đang bị cắt mic`}
            </div>
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={() => onMuteParticipant(undefined, true)}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-bold shrink-0 cursor-pointer"
            >
              Cắt Mic SV
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <ShieldAlert className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Host kiểm soát</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
