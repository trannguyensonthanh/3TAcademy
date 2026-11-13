import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from 'livekit-client';
import {
  Grid,
  Hand,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Radio,
  Sparkles,
  Square,
  UserX,
  Users,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { AvatarWithFallback } from './BotanicalStickers';
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
  cohortCode: string;
  hostName: string;
  selfName: string;
  selfAccountId: string;
  selfRoleLabel: string;
  isHost: boolean;
  livekitConnected: boolean;
  livekitConnecting?: boolean;
  stageViewMode: 'STAGE' | 'GRID';
  onChangeStageViewMode: (mode: 'STAGE' | 'GRID') => void;
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
  floatingReactions: { id: string; label: string; leftPct: number }[];
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleScreenShare: () => void;
  onMuteParticipant: (targetIdentity: string, studentName?: string) => void;
  onKickParticipant: (targetIdentity: string, studentName?: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

const formatDurationClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const LiveKitClassroomStage: React.FC<LiveKitClassroomStageProps> = ({
  sessionOrder,
  sessionTitle,
  hostName,
  selfName,
  selfAccountId,
  selfRoleLabel,
  isHost,
  stageViewMode,
  onChangeStageViewMode,
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
  floatingReactions,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onMuteParticipant,
  onKickParticipant,
  onStartRecording,
  onStopRecording,
}) => {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [mirrorSelfCamera, setMirrorSelfCamera] = useState<boolean>(true);
  const [pinnedTrackSid, setPinnedTrackSid] = useState<string | null>(null);

  const hasLocalCameraVideo = Boolean(webcamActive && camOn && localVideoStream);
  const hasLocalScreenVideo = Boolean(screenSharing && screenShareStream);

  const remoteScreenTrack = useMemo(
    () => remoteVideoTracks.find((t) => t.source === 'screen_share'),
    [remoteVideoTracks]
  );
  const remoteCameraTracks = useMemo(
    () => remoteVideoTracks.filter((t) => t.source === 'camera'),
    [remoteVideoTracks]
  );

  const pinnedRemoteTrack = useMemo(
    () => remoteVideoTracks.find((t) => t.sid === pinnedTrackSid),
    [remoteVideoTracks, pinnedTrackSid]
  );

  const primaryRemoteCamera = pinnedRemoteTrack || remoteCameraTracks[0];
  const isRecording = Boolean(recordingState?.isRecording);

  // Deduplicate participants so the current user (especially Instructor) never appears twice
  const otherParticipants = useMemo(() => {
    const seen = new Set<string>();
    if (selfAccountId) {
      seen.add(String(selfAccountId));
      seen.add(`acc-${selfAccountId}`);
    }
    const normalizedSelfName = selfName.trim().toLowerCase();

    return participants.filter((p) => {
      const pid = String(p.accountId || '').trim();
      if (pid && (seen.has(pid) || seen.has(`acc-${pid}`))) {
        return false;
      }
      if (isHost && p.isHost) {
        return false;
      }
      if (pid === selfAccountId) {
        return false;
      }
      if (p.fullName.trim().toLowerCase() === normalizedSelfName && p.isHost === isHost) {
        return false;
      }
      if (pid) seen.add(pid);
      return true;
    });
  }, [participants, selfAccountId, selfName, isHost]);

  const handleToggleFullscreen = () => {
    const el = stageContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div
      ref={stageContainerRef}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between"
    >
      {/* Top Bar of the Video Frame */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              Buổi {sessionOrder}
            </span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="truncate">{sessionTitle}</span>
          </div>

          {isRecording && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-semibold tabular-nums shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Đang ghi hình · {formatDurationClock(recordingElapsedSec)}</span>
            </div>
          )}
        </div>

        {/* Right Controls: Recording (Host only) + View Mode Switcher + Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          {isHost && (
            <>
              {!isRecording ? (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStartRecording}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Radio className="w-3.5 h-3.5 text-rose-600" />
                  <span>{isRecordingBusy ? 'Đang chuẩn bị...' : 'Ghi hình buổi học'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStopRecording}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{isRecordingBusy ? 'Đang lưu...' : 'Dừng ghi hình'}</span>
                </button>
              )}
            </>
          )}

          <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onChangeStageViewMode('STAGE')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                stageViewMode === 'STAGE'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Màn hình chính</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeStageViewMode('GRID')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                stageViewMode === 'GRID'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Hiển thị lưới ({1 + otherParticipants.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            title="Toàn màn hình"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hand-Raise Banner when students raise their hands */}
      {raisedHands.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <Hand className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{raisedHands.map((h) => h.fullName).join(', ')}</strong> đang giơ tay xin phát biểu
            </span>
          </div>
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            Học viên có thể bật mic trực tiếp để trao đổi
          </span>
        </div>
      )}

      {/* =====================================================================
          MODE 1: GRID VIEW (Hiển thị lưới các thành viên trong lớp)
      ===================================================================== */}
      {stageViewMode === 'GRID' ? (
        <div className="p-4 bg-slate-900 min-h-[460px] flex flex-col justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 flex-1">
            {/* Tile 1: Yourself (Instructor or Student) */}
            <div
              className={`relative rounded-xl bg-slate-800 border ${
                micOn ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-700'
              } overflow-hidden min-h-[210px] flex items-center justify-center group`}
            >
              {hasLocalScreenVideo ? (
                <LocalMediaStreamView
                  stream={screenShareStream}
                  muted
                  className="w-full h-full object-contain bg-black"
                />
              ) : hasLocalCameraVideo ? (
                <LocalMediaStreamView
                  stream={localVideoStream}
                  muted
                  mirrored={mirrorSelfCamera}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2.5 p-4 text-center">
                  <div className="relative">
                    {micOn && (
                      <span className="absolute -inset-2 rounded-full border-2 border-emerald-400/60 animate-ping" />
                    )}
                    <AvatarWithFallback
                      name={selfName}
                      className="w-16 h-16 rounded-full ring-2 ring-slate-600 text-lg"
                    />
                  </div>
                  <div className="text-sm font-semibold text-white">{selfName} (Bạn)</div>
                  <div className="text-xs text-slate-400">{selfRoleLabel}</div>
                </div>
              )}

              {hasLocalCameraVideo && (
                <button
                  type="button"
                  onClick={() => setMirrorSelfCamera((v) => !v)}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-black/60 hover:bg-black/80 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  Lật gương
                </button>
              )}

              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-xs">
                <span className="font-medium text-white truncate">
                  {selfName} (Bạn) · {isHost ? 'Giảng viên' : 'Học viên'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {handRaised && !isHost && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px]">
                      Đang giơ tay
                    </span>
                  )}
                  {micOn ? (
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Remote Video Tracks (if any other participant has camera/screen on) */}
            {remoteVideoTracks.map((rt) => {
              const isSpeaking = activeSpeakerIdentities.includes(rt.participantIdentity);
              const isMuted = mutedIdentities.includes(rt.participantIdentity);
              return (
                <div
                  key={rt.sid}
                  className={`relative rounded-xl bg-slate-800 border ${
                    isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-slate-700'
                  } overflow-hidden min-h-[210px] flex items-center justify-center group`}
                >
                  <LiveMediaTrackView
                    track={rt.track}
                    className={
                      rt.source === 'screen_share'
                        ? 'w-full h-full object-contain bg-black'
                        : 'w-full h-full object-cover'
                    }
                  />

                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedTrackSid(rt.sid);
                        onChangeStageViewMode('STAGE');
                      }}
                      className="px-2.5 py-1 rounded-md bg-black/70 hover:bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                    >
                      Ghim lên màn hình chính
                    </button>
                    {isHost && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onMuteParticipant(rt.participantIdentity, rt.participantName)
                          }
                          className="px-2.5 py-1 rounded-md bg-amber-600/90 hover:bg-amber-600 text-white text-[11px] font-medium cursor-pointer"
                        >
                          Tắt mic
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onKickParticipant(rt.participantIdentity, rt.participantName)
                          }
                          className="px-2.5 py-1 rounded-md bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-medium cursor-pointer"
                        >
                          Mời ra ngoài
                        </button>
                      </>
                    )}
                  </div>

                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-xs">
                    <span className="font-medium text-white truncate">
                      {rt.participantName}
                      {rt.source === 'screen_share' ? ' (Đang chia sẻ màn hình)' : ''}
                    </span>
                    {isMuted ? (
                      <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Other Participants without active camera */}
            {otherParticipants
              .filter(
                (p) =>
                  !remoteVideoTracks.some(
                    (rt) =>
                      rt.participantIdentity === `acc-${p.accountId}` ||
                      rt.participantIdentity === p.accountId
                  )
              )
              .map((p) => {
                const pid = `acc-${p.accountId}`;
                const isMuted =
                  mutedIdentities.includes(pid) || mutedIdentities.includes(p.accountId);
                const isRaisingHand = raisedHands.some((h) => h.accountId === p.accountId);

                return (
                  <div
                    key={p.accountId}
                    className={`relative rounded-xl bg-slate-800/90 border ${
                      isRaisingHand ? 'border-amber-400' : 'border-slate-700/80'
                    } overflow-hidden min-h-[210px] flex flex-col items-center justify-center p-4 group`}
                  >
                    <AvatarWithFallback
                      name={p.fullName}
                      className="w-16 h-16 rounded-full ring-2 ring-slate-600 mb-2.5 text-lg"
                    />
                    <div className="text-sm font-semibold text-white text-center truncate max-w-full">
                      {p.fullName}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.isHost ? 'Giảng viên' : p.roleLabel || 'Học viên'}
                    </div>

                    {/* Instructor Moderation Controls on Hover for Students */}
                    {isHost && !p.isHost && (
                      <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onMuteParticipant(pid, p.fullName)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-700 hover:bg-amber-600 text-white text-xs font-medium transition-colors cursor-pointer"
                          title="Tắt micro của học viên này nếu gây ồn"
                        >
                          <MicOff className="w-3 h-3" />
                          <span>Tắt mic</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onKickParticipant(pid, p.fullName)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium transition-colors cursor-pointer"
                          title="Mời học viên này ra khỏi phòng học"
                        >
                          <UserX className="w-3 h-3" />
                          <span>Mời ra ngoài</span>
                        </button>
                      </div>
                    )}

                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/55 text-xs">
                      <span className="text-slate-200 truncate">{p.fullName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isRaisingHand && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px]">
                            <Hand className="w-2.5 h-2.5" />
                            <span>Giơ tay</span>
                          </span>
                        )}
                        {isMuted && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* =====================================================================
           MODE 2: SPEAKER / MAIN STAGE VIEW (Màn hình chính 16:9)
        ===================================================================== */
        <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
          {/* Case A: Local Screen Share is active */}
          {hasLocalScreenVideo ? (
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <LocalMediaStreamView
                stream={screenShareStream}
                muted
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-md">
                <MonitorUp className="w-3.5 h-3.5" />
                <span>Bạn đang chia sẻ màn hình</span>
              </div>

              {/* Picture-in-Picture Camera while sharing screen */}
              {hasLocalCameraVideo && (
                <div className="absolute bottom-4 right-4 w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800 z-20">
                  <LocalMediaStreamView
                    stream={localVideoStream}
                    muted
                    mirrored={mirrorSelfCamera}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                    {selfName} (Bạn)
                  </div>
                </div>
              )}
            </div>
          ) : remoteScreenTrack ? (
            /* Case B: Remote Participant is sharing screen */
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <LiveMediaTrackView
                track={remoteScreenTrack.track}
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-semibold">
                <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>{remoteScreenTrack.participantName} đang chia sẻ màn hình</span>
              </div>

              {primaryRemoteCamera && (
                <div className="absolute bottom-4 right-4 w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800 z-20">
                  <LiveMediaTrackView
                    track={primaryRemoteCamera.track}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                    {primaryRemoteCamera.participantName}
                  </div>
                </div>
              )}
            </div>
          ) : hasLocalCameraVideo ? (
            /* Case C: Local Camera is ON -> Full 16:9 Live Video */
            <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
              <LocalMediaStreamView
                stream={localVideoStream}
                muted
                mirrored={mirrorSelfCamera}
                className="w-full h-full object-cover"
              />

              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMirrorSelfCamera((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium backdrop-blur-xs transition-colors cursor-pointer"
                >
                  {mirrorSelfCamera ? 'Lật gương: Bật' : 'Lật gương: Tắt'}
                </button>
              </div>

              {primaryRemoteCamera && (
                <div className="absolute bottom-14 right-4 w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800 z-20">
                  <LiveMediaTrackView
                    track={primaryRemoteCamera.track}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                    {primaryRemoteCamera.participantName}
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white text-xs font-medium">
                <span>
                  {selfName} (Bạn) · {isHost ? 'Giảng viên' : 'Học viên'}
                </span>
                {micOn ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
            </div>
          ) : primaryRemoteCamera ? (
            /* Case D: Remote Participant Camera is ON */
            <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
              <LiveMediaTrackView
                track={primaryRemoteCamera.track}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white text-xs font-medium">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{primaryRemoteCamera.participantName}</span>
              </div>
            </div>
          ) : (
            /* Case E: Camera & Screen Share are OFF -> Clean, natural Video Standby Screen */
            <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-slate-800 to-slate-900">
              <div className="relative mb-4">
                {micOn && (
                  <>
                    <span className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping" />
                    <span className="absolute -inset-2 rounded-full border-2 border-emerald-400/60 animate-pulse" />
                  </>
                )}
                <AvatarWithFallback
                  name={selfName}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-slate-700 shadow-xl text-2xl"
                />
                <span
                  className={`absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md ${
                    micOn ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white">{selfName}</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {isHost
                  ? 'Giảng viên phụ trách · Camera đang tắt'
                  : `Học viên · Giảng viên: ${hostName}`}
              </p>

              {/* Quick Media Actions right in the center */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 z-20">
                <button
                  type="button"
                  onClick={onToggleCamera}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Bật Camera</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleScreenShare}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  <MonitorUp className="w-4 h-4 text-emerald-300" />
                  <span>Chia sẻ màn hình</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleMic}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-colors cursor-pointer ${
                    micOn
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                  }`}
                >
                  {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span>{micOn ? 'Đang bật Mic' : 'Bật Mic'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Reaction Bubbles */}
          {floatingReactions.length > 0 && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  style={{ left: `${r.leftPct}%` }}
                  className="absolute bottom-14 animate-bounce bg-slate-900/85 border border-white/20 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-lg flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact Participant Strip at the bottom ONLY if there are other members in the room */}
      {stageViewMode === 'STAGE' && otherParticipants.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Trong phòng ({1 + otherParticipants.length}):</span>
            </span>

            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              {otherParticipants.slice(0, 6).map((p) => {
                const pid = `acc-${p.accountId}`;
                const isRaisingHand = raisedHands.some((h) => h.accountId === p.accountId);
                return (
                  <div
                    key={p.accountId}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs shrink-0"
                  >
                    <AvatarWithFallback name={p.fullName} className="w-5 h-5 rounded-full text-[10px]" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {p.fullName}
                    </span>
                    {p.isHost && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        (Giảng viên)
                      </span>
                    )}
                    {isRaisingHand && (
                      <Hand className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    {isHost && !p.isHost && (
                      <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => onMuteParticipant(pid, p.fullName)}
                          title="Tắt mic học viên này"
                          className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/50 text-slate-500 hover:text-amber-600 cursor-pointer"
                        >
                          <MicOff className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onKickParticipant(pid, p.fullName)}
                          title="Mời ra khỏi phòng"
                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-500 hover:text-rose-600 cursor-pointer"
                        >
                          <UserX className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {otherParticipants.length > 6 && (
            <button
              type="button"
              onClick={() => onChangeStageViewMode('GRID')}
              className="text-xs font-semibold text-emerald-600 hover:underline shrink-0 cursor-pointer"
            >
              Xem tất cả ({1 + otherParticipants.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
};
