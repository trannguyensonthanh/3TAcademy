import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from 'livekit-client';
import {
  ArrowUpRight,
  Grid,
  Hand,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
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
  onMuteParticipant,
  onKickParticipant,
  onStartRecording,
  onStopRecording,
}) => {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [mirrorSelfCamera, setMirrorSelfCamera] = useState<boolean>(true);
  const [pinnedTrackSid, setPinnedTrackSid] = useState<string | null>(null);
  // Allows a student to optionally expand their own PiP camera to the main stage and minimize back
  const [focusSelfOnMainStage, setFocusSelfOnMainStage] = useState<boolean>(false);

  const hasLocalCameraVideo = Boolean(webcamActive && camOn && localVideoStream);
  const hasLocalScreenVideo = Boolean(screenSharing && screenShareStream);

  // Reset self-focus if student turns off their camera
  useEffect(() => {
    if (!hasLocalCameraVideo && !hasLocalScreenVideo) {
      setFocusSelfOnMainStage(false);
    }
  }, [hasLocalCameraVideo, hasLocalScreenVideo]);

  const remoteScreenTrack = useMemo(
    () => remoteVideoTracks.find((t) => t.source === 'screen_share'),
    [remoteVideoTracks]
  );
  const remoteCameraTracks = useMemo(
    () => remoteVideoTracks.filter((t) => t.source === 'camera'),
    [remoteVideoTracks]
  );

  // Identify Instructor's participant record & remote camera track
  const hostParticipant = useMemo(
    () => participants.find((p) => p.isHost),
    [participants]
  );

  const hostRemoteCameraTrack = useMemo(() => {
    if (!hostParticipant) return remoteCameraTracks[0];
    const hostId = String(hostParticipant.accountId);
    return (
      remoteCameraTracks.find(
        (t) =>
          t.participantIdentity === `acc-${hostId}` ||
          t.participantIdentity === hostId ||
          t.participantName.trim().toLowerCase() ===
            hostParticipant.fullName.trim().toLowerCase()
      ) || remoteCameraTracks[0]
    );
  }, [remoteCameraTracks, hostParticipant]);

  const pinnedRemoteTrack = useMemo(
    () => remoteVideoTracks.find((t) => t.sid === pinnedTrackSid),
    [remoteVideoTracks, pinnedTrackSid]
  );

  const primaryRemoteCamera = pinnedRemoteTrack || hostRemoteCameraTrack || remoteCameraTracks[0];
  const isRecording = Boolean(recordingState?.isRecording);

  // Check if Instructor is currently speaking via LiveKit active speakers
  const isHostSpeaking = useMemo(() => {
    if (isHost) return micOn;
    if (!hostParticipant) return false;
    const hostId = String(hostParticipant.accountId);
    return (
      activeSpeakerIdentities.includes(`acc-${hostId}`) ||
      activeSpeakerIdentities.includes(hostId)
    );
  }, [isHost, micOn, hostParticipant, activeSpeakerIdentities]);

  // Deduplicate participants so the current user never appears twice
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
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between"
    >
      {/* Top Header Strip inside Video Stage */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0">
            {isHost ? 'Màn hình Giảng viên' : `Giảng viên: ${hostName}`}
          </span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
            Buổi {sessionOrder}: {sessionTitle}
          </span>

          {isRecording && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-semibold tabular-nums shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Đang ghi hình · {formatDurationClock(recordingElapsedSec)}</span>
            </div>
          )}
        </div>

        {/* Right Stage Mode & Fullscreen Switcher */}
        <div className="flex items-center gap-2">
          {isHost && (
            <>
              {!isRecording ? (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStartRecording}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Radio className="w-3.5 h-3.5 text-rose-600" />
                  <span>{isRecordingBusy ? 'Đang chuẩn bị...' : 'Ghi hình'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isRecordingBusy}
                  onClick={onStopRecording}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{isRecordingBusy ? 'Đang lưu...' : 'Dừng ghi'}</span>
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

      {/* Hand-Raise Notification Banner */}
      {raisedHands.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <Hand className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{raisedHands.map((h) => h.fullName).join(', ')}</strong> đang giơ tay phát biểu
            </span>
          </div>
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            {isHost
              ? 'Giảng viên có thể mời học viên bật mic trao đổi trực tiếp'
              : 'Giảng viên đã nhận được tín hiệu giơ tay của bạn'}
          </span>
        </div>
      )}

      {/* =====================================================================
          MODE 1: GRID VIEW (Hiển thị lưới Google Meet / Zoom)
          Giảng viên đứng đầu tiên, tiếp theo là các thành viên trong lớp
      ===================================================================== */}
      {stageViewMode === 'GRID' ? (
        <div className="p-4 bg-slate-900 min-h-[460px] flex flex-col justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 flex-1">
            {/* If User is Student, show Instructor Tile FIRST in Grid so Instructor is always prominent */}
            {!isHost && hostParticipant && (
              <div
                className={`relative rounded-xl bg-slate-800 border-2 ${
                  isHostSpeaking
                    ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                    : 'border-emerald-600/70'
                } overflow-hidden min-h-[210px] flex items-center justify-center group`}
              >
                {remoteScreenTrack &&
                (remoteScreenTrack.participantIdentity === `acc-${hostParticipant.accountId}` ||
                  remoteScreenTrack.participantIdentity === String(hostParticipant.accountId)) ? (
                  <LiveMediaTrackView
                    track={remoteScreenTrack.track}
                    className="w-full h-full object-contain bg-black"
                  />
                ) : hostRemoteCameraTrack ? (
                  <LiveMediaTrackView
                    track={hostRemoteCameraTrack.track}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2.5 p-4 text-center">
                    <AvatarWithFallback
                      name={hostParticipant.fullName}
                      className="w-16 h-16 rounded-full ring-2 ring-emerald-500 text-lg"
                    />
                    <div className="text-sm font-bold text-white">{hostParticipant.fullName}</div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold">
                      Giảng viên phụ trách
                    </span>
                  </div>
                )}

                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-xs">
                  <span className="font-semibold text-white truncate">
                    {hostParticipant.fullName} (Giảng viên)
                  </span>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
              </div>
            )}

            {/* Tile: Yourself (Instructor or Student) */}
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

            {/* Remote Video Tracks of other participants */}
            {remoteVideoTracks
              .filter((rt) => {
                if (!isHost && hostParticipant) {
                  const hostId = String(hostParticipant.accountId);
                  if (
                    rt.participantIdentity === `acc-${hostId}` ||
                    rt.participantIdentity === hostId
                  ) {
                    return false;
                  }
                }
                return true;
              })
              .map((rt) => {
                const isSpeaking = activeSpeakerIdentities.includes(rt.participantIdentity);
                const isMuted = mutedIdentities.includes(rt.participantIdentity);
                return (
                  <div
                    key={rt.sid}
                    className={`relative rounded-xl bg-slate-800 border ${
                      isSpeaking
                        ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                        : 'border-slate-700'
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
                        Ghim màn hình chính
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
              .filter((p) => {
                if (!isHost && p.isHost) return false;
                return !remoteVideoTracks.some(
                  (rt) =>
                    rt.participantIdentity === `acc-${p.accountId}` ||
                    rt.participantIdentity === p.accountId
                );
              })
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
           MODE 2: GOOGLE MEET / ZOOM SPEAKER STAGE (Màn hình chính 16:9)
           - Học viên: Màn hình chính luôn ưu tiên hiển thị Giảng viên (bài trình chiếu
             hoặc camera của Giảng viên). Camera/Mic của Học viên hiển thị ở góc dưới
             (Picture-in-Picture) đúng chuẩn Google Meet / Zoom.
           - Giảng viên: Hiển thị màn hình chia sẻ / camera của Giảng viên và có thể
             quan sát học viên ở góc hoặc chuyển sang chế độ Lưới.
        ===================================================================== */
        <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
          {/* 1. Remote Screen Share (e.g. Instructor presenting slides/code to students) */}
          {remoteScreenTrack && !focusSelfOnMainStage ? (
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <LiveMediaTrackView
                track={remoteScreenTrack.track}
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-semibold">
                <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>{remoteScreenTrack.participantName} đang trình bày màn hình</span>
              </div>
            </div>
          ) : hasLocalScreenVideo ? (
            /* 2. Local Screen Share (Instructor or Student presenting their screen) */
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <LocalMediaStreamView
                stream={screenShareStream}
                muted
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-md">
                <MonitorUp className="w-3.5 h-3.5" />
                <span>Bạn đang chia sẻ màn hình với lớp học</span>
              </div>
            </div>
          ) : !isHost && !focusSelfOnMainStage ? (
            /* 3. STUDENT VIEW: Main 16:9 Stage ALWAYS shows the INSTRUCTOR (or pinned speaker) */
            primaryRemoteCamera ? (
              <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                <LiveMediaTrackView
                  track={primaryRemoteCamera.track}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white text-xs font-medium">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{primaryRemoteCamera.participantName} · Giảng viên</span>
                </div>
              </div>
            ) : (
              /* Instructor's camera is currently off -> Student sees the Instructor's main stage */
              <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950">
                <div className="relative mb-4">
                  {isHostSpeaking && (
                    <>
                      <span className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping" />
                      <span className="absolute -inset-2 rounded-full border-2 border-emerald-400/60 animate-pulse" />
                    </>
                  )}
                  <AvatarWithFallback
                    name={hostName}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-emerald-500/40 shadow-xl text-2xl"
                  />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold shadow-sm whitespace-nowrap">
                    Giảng viên
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-white mt-1">{hostName}</h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-md">
                  Giảng viên phụ trách lớp · Màn hình giảng dạy chính
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Sử dụng thanh điều khiển bên dưới để bật Micro, Camera, Chia sẻ màn hình hoặc Giơ tay phát biểu
                </p>
              </div>
            )
          ) : isHost && hasLocalCameraVideo ? (
            /* 4. INSTRUCTOR VIEW (or Student who clicked Expand on their PiP): Local Camera on Main Stage */
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

              <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white text-xs font-medium">
                <span>
                  {selfName} (Bạn) · {isHost ? 'Giảng viên chủ trì' : 'Học viên'}
                </span>
                {micOn ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
            </div>
          ) : !isHost && focusSelfOnMainStage && hasLocalCameraVideo ? (
            /* Student expanded their own camera onto main stage */
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
                  className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium backdrop-blur-xs cursor-pointer"
                >
                  {mirrorSelfCamera ? 'Lật gương: Bật' : 'Lật gương: Tắt'}
                </button>
                <button
                  type="button"
                  onClick={() => setFocusSelfOnMainStage(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Quay lại màn hình Giảng viên</span>
                </button>
              </div>
              <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white text-xs font-medium">
                <span>{selfName} (Camera của bạn)</span>
              </div>
            </div>
          ) : primaryRemoteCamera ? (
            /* 5. Instructor with camera off, viewing an active Student camera */
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
            /* 6. Instructor View when Instructor's Camera & Screen Share are currently OFF */
            <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950">
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

              <h3 className="text-lg sm:text-xl font-bold text-white">{selfName} (Bạn)</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Giảng viên phụ trách · Camera và trình chiếu đang tắt
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Sử dụng thanh công cụ phía dưới để bật Camera, Micro hoặc Chia sẻ màn hình bài giảng cho học viên
              </p>
            </div>
          )}

          {/* =================================================================
              PICTURE-IN-PICTURE (PiP) CORNER TILE (Google Meet / Zoom Standard)
              - Đối với Học viên: Khi xem màn hình Giảng viên ở chính giữa, góc dưới
                bên phải luôn hiển thị khung hình của chính Học viên (Camera hoặc trạng thái Mic)
                để Học viên kiểm soát hình ảnh cá nhân mà không che khuất Giảng viên.
              - Đối với Giảng viên: Hiển thị khung hình nhỏ khi đang chia sẻ màn hình
                hoặc hiển thị camera học viên đang phát biểu.
          ================================================================= */}
          {!isHost && !focusSelfOnMainStage && (
            <div className="absolute bottom-4 right-4 z-20">
              {hasLocalCameraVideo ? (
                <div className="relative w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800 group">
                  <LocalMediaStreamView
                    stream={localVideoStream}
                    muted
                    mirrored={mirrorSelfCamera}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFocusSelfOnMainStage(true)}
                    title="Phóng to camera của bạn lên màn hình chính"
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-black/65 hover:bg-emerald-600 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                    <span className="truncate">{selfName} (Bạn)</span>
                    {micOn ? (
                      <Mic className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <MicOff className="w-3 h-3 text-rose-400 shrink-0" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/85 border border-white/15 backdrop-blur-xs shadow-lg text-xs text-white">
                  <AvatarWithFallback name={selfName} className="w-7 h-7 rounded-full text-[11px]" />
                  <div className="leading-tight">
                    <div className="font-semibold text-[11px]">{selfName} (Bạn)</div>
                    <div className="text-[10px] text-slate-300 flex items-center gap-1">
                      {micOn ? (
                        <span className="text-emerald-400">Mic đang bật</span>
                      ) : (
                        <span className="text-slate-400">Mic đang tắt</span>
                      )}
                      <span>·</span>
                      <span>{camOn ? 'Cam bật' : 'Cam tắt'}</span>
                    </div>
                  </div>
                  <div className="ml-1 flex items-center gap-1">
                    {micOn ? (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    {camOn ? (
                      <Video className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <VideoOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* For Instructor: PiP corner when sharing screen or when a student has camera on */}
          {isHost && (hasLocalScreenVideo || (hasLocalCameraVideo && primaryRemoteCamera)) && (
            <div className="absolute bottom-4 right-4 z-20">
              {hasLocalScreenVideo && hasLocalCameraVideo ? (
                <div className="relative w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800">
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
              ) : primaryRemoteCamera ? (
                <div className="relative w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border-2 border-white/80 shadow-xl bg-slate-800">
                  <LiveMediaTrackView
                    track={primaryRemoteCamera.track}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                    {primaryRemoteCamera.participantName}
                  </div>
                </div>
              ) : null}
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

      {/* Compact Participant Strip at the bottom of the stage */}
      {stageViewMode === 'STAGE' && otherParticipants.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Thành viên trong lớp ({1 + otherParticipants.length}):</span>
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
                    <AvatarWithFallback
                      name={p.fullName}
                      className="w-5 h-5 rounded-full text-[10px]"
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {p.fullName}
                    </span>
                    {p.isHost && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        (Giảng viên)
                      </span>
                    )}
                    {isRaisingHand && <Hand className="w-3.5 h-3.5 text-amber-500" />}
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
