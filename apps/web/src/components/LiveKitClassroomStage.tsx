import React, { useEffect, useRef } from 'react';
import {
  CloudUpload,
  Disc,
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
  localMediaStream: MediaStream | null;
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
  transcriptPreview: {
    id?: string;
    sec: number;
    timeLabel: string;
    speaker: string;
    text: string;
    slidePage: number;
  }[];
  floatingReactions: { id: string; label: string; leftPct: number }[];
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
  aiSummaryMd,
  cohortCode,
  hostName,
  selfName,
  selfAccountId,
  selfRoleLabel,
  isHost,
  livekitConnected,
  livekitRoomName,
  stageViewMode,
  onChangeStageViewMode,
  playableVideoUrl,
  webcamActive,
  camOn,
  micOn,
  screenSharing,
  handRaised,
  localMediaStream,
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
  transcriptPreview,
  floatingReactions,
  onMuteParticipant,
  onStartRecordingToR2,
  onStopRecordingToR2,
  onUploadVideoFileToR2,
}) => {
  const localSelfVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (localSelfVideoRef.current && webcamActive && localMediaStream) {
      localSelfVideoRef.current.srcObject = localMediaStream;
    }
  }, [webcamActive, camOn, localMediaStream, stageViewMode]);

  useEffect(() => {
    if (localScreenVideoRef.current && screenSharing && screenShareStream) {
      localScreenVideoRef.current.srcObject = screenShareStream;
    }
  }, [screenSharing, screenShareStream, stageViewMode]);

  const remoteScreenTrack = remoteVideoTracks.find((t) => t.source === 'screen_share');
  const remoteCameraTracks = remoteVideoTracks.filter((t) => t.source === 'camera');
  const primaryRemoteCamera = remoteCameraTracks[0];
  const isRecording = Boolean(recordingState?.isRecording);

  const isParticipantMuted = (accountId: string, isParticipantHost: boolean) => {
    if (isParticipantHost) return false;
    return (
      mutedIdentities.includes('ALL_STUDENTS') ||
      mutedIdentities.includes(accountId) ||
      mutedIdentities.includes(`acc-${accountId}`)
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
                livekitConnected ? 'bg-[#10B981] animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {livekitConnected
                ? `LiveKit Cloud SFU · ${livekitRoomName || 'Connected'}`
                : 'LiveKit Ready · WebRTC Stage'}
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
              CHẾ ĐỘ LƯỚI PHÒNG HỌP TRỰC TUYẾN ({Math.max(participants.length, 2)} THÀNH VIÊN)
            </span>
            {hostSlideLabel && (
              <span className="font-mono text-slate-300">{hostSlideLabel}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Tile 1: Local User (You) */}
            <div
              className={`relative aspect-video rounded-xl bg-slate-950 border overflow-hidden flex flex-col justify-between p-3 ${
                micOn ? 'border-[#10B981]' : 'border-slate-800'
              }`}
            >
              {webcamActive && camOn ? (
                <video
                  ref={localSelfVideoRef}
                  autoPlay
                  playsInline
                  muted
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
                <span className="px-2 py-0.5 rounded bg-black/70 text-[11px] font-bold text-emerald-300">
                  Bạn ({selfName})
                </span>
                {handRaised && (
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center gap-1">
                    <Hand className="w-3 h-3" /> Giơ tay
                  </span>
                )}
              </div>

              <div className="relative z-10 flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-black/70 text-[11px] text-slate-200 font-mono">
                  {webcamActive && camOn ? 'Camera ON' : 'Camera OFF'}
                </span>
                <span
                  className={`p-1.5 rounded-lg ${
                    micOn ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </span>
              </div>
            </div>

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

            {/* Roster Participant Tiles (who aren't already duplicated) */}
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
                            <span>Đã tắt mic</span>
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
        /* MODE 3: SPOTLIGHT STAGE (SCREEN SHARE / LIVE STREAM / BOARD) + FILMSTRIP */
        <div className="rounded-2xl bg-[#0B120F] border border-slate-800 overflow-hidden shadow-xl relative">
          <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono text-emerald-400 font-semibold flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-[#10B981]" />
              {screenSharing
                ? `Đang chia sẻ màn hình trực tiếp — ${selfName}`
                : remoteScreenTrack
                  ? `Màn hình chia sẻ trực tiếp — ${remoteScreenTrack.participantName}`
                  : primaryRemoteCamera
                    ? `Luồng Camera LiveKit trực tiếp — ${primaryRemoteCamera.participantName}`
                    : `Sân khấu giảng dạy trực tuyến · ${hostName}`}
            </span>
            {hostSlideLabel && (
              <span className="font-mono text-[11px] px-2.5 py-0.5 rounded bg-slate-800 text-emerald-300">
                {hostSlideLabel}
              </span>
            )}
          </div>

          <div className="p-5 sm:p-6 relative min-h-[360px] flex flex-col justify-between space-y-4">
            {screenSharing && screenShareStream ? (
              <video
                ref={localScreenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-contain"
              />
            ) : remoteScreenTrack ? (
              <LiveMediaTrackView
                track={remoteScreenTrack.track}
                className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-contain"
              />
            ) : primaryRemoteCamera ? (
              <LiveMediaTrackView
                track={primaryRemoteCamera.track}
                className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-cover"
              />
            ) : webcamActive && camOn && isHost ? (
              <video
                ref={localSelfVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-cover"
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-emerald-400 font-bold">
                    BUỔI {String(sessionOrder).padStart(2, '0')} · {sessionTitle}
                  </span>
                  {playableVideoUrl && (
                    <button
                      type="button"
                      onClick={() => onChangeStageViewMode('VIDEO')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      Mở Video Bài Giảng / Bản Ghi R2 →
                    </button>
                  )}
                </div>

                {hostTopicNote && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-[#10B981]/50 text-xs sm:text-sm text-emerald-100">
                    <span className="font-bold text-emerald-300">Chủ đề đang giảng: </span>
                    {hostTopicNote}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
                  <div className="text-xs font-mono font-bold text-slate-400">
                    NỘI DUNG TRỌNG TÂM TRÊN SÂN KHẤU
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {(aiSummaryMd || '')
                      .replace(/^#{1,6}\s*/gm, '')
                      .replace(/\*\*(.*?)\*\*/g, '$1')
                      .trim() ||
                      'Phòng học LiveKit WebRTC đã sẵn sàng. Giảng viên và học viên có thể bật Camera, Micro hoặc Chia sẻ màn hình trực tiếp.'}
                  </p>
                </div>

                {transcriptPreview.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {transcriptPreview.slice(0, 4).map((cue) => (
                      <div
                        key={cue.id || cue.sec}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="font-mono text-[11px] text-emerald-400 font-bold">
                          [{cue.timeLabel}] · Slide {cue.slidePage}
                        </div>
                        <p className="text-slate-300 line-clamp-2">{cue.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Floating Reactions */}
            {floatingReactions.map((r) => (
              <div
                key={r.id}
                style={{ left: `${r.leftPct}%` }}
                className="bottom-14 absolute px-3 py-1 rounded-lg bg-black/75 border border-white/20 text-xs font-bold text-white animate-bounce pointer-events-none z-10"
              >
                {r.label}
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
              <span>
                {raisedHands.length > 0
                  ? `${raisedHands.length} học viên đang giơ tay phát biểu`
                  : 'Tất cả thành viên đang theo dõi trực tiếp'}
              </span>
              {handRaised && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold">
                  <Hand className="w-3.5 h-3.5" />
                  Bạn đang giơ tay phát biểu
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Participant Filmstrip (Host + Self + Quick Student Mute Controls) */}
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

        {/* Local User Tile */}
        <div className="p-3.5 rounded-xl bg-[#111A15] border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {webcamActive && camOn && !isHost ? (
              <video
                ref={localSelfVideoRef}
                autoPlay
                playsInline
                muted
                className="w-14 h-11 rounded-lg bg-black object-cover border border-[#10B981] shrink-0"
              />
            ) : (
              <AvatarWithFallback name={selfName} className="w-11 h-11 rounded-full shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{selfName} (Bạn)</div>
              <div className="text-[11px] text-slate-400 truncate">
                {micOn ? 'Micro đang bật' : 'Micro đang tắt'} ·{' '}
                {camOn && webcamActive ? 'Camera đang bật' : 'Camera đang tắt'}
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
