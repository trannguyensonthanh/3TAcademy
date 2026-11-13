import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Hand,
  Heart,
  HelpCircle,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PlayCircle,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  UserPlus,
  UserX,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { useAcademy } from '../context/AcademyContext';
import { AvatarWithFallback } from '../components/BotanicalStickers';
import {
  LiveKitClassroomStage,
  type AttachedRemoteTrackItem,
} from '../components/LiveKitClassroomStage';
import {
  learningApi,
  type LiveHandRaiseItem,
  type LiveParticipantItem,
  type LiveReactionPayload,
  type LiveRecordingState,
  type LiveRoomRuntimeState,
  type LiveSessionChatMessage,
  type LiveSessionRoomPayload,
} from '../services/learning.api';
import { teachApi } from '../services/teach.api';
import { ApiHttpError } from '../services/apiClient';

interface LiveQuestionItem {
  id: string;
  author: string;
  time: string;
  question: string;
  votes: number;
  answeredByInstructor?: boolean;
}

interface FloatingReaction {
  id: string;
  senderName: string;
  label: string;
  leftPct: number;
}

const DEFAULT_ROOM_STATE: LiveRoomRuntimeState = {
  raisedHands: [],
  recentReactions: [],
  questionVotes: {},
  mutedIdentities: [],
  kickedIdentities: [],
  recording: {
    isRecording: false,
  },
  hostBroadcast: {
    activeSlideLabel: '',
    liveTopicNote: '',
    updatedAt: '',
  },
};

export const LivestreamClassView: React.FC<{
  sessionId: string;
  isGuestEntry?: boolean;
}> = ({ sessionId, isGuestEntry = false }) => {
  const { navigate, role, currentUser } = useAcademy();

  const [roomData, setRoomData] = useState<LiveSessionRoomPayload | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(!isGuestEntry);
  const [roomError, setRoomError] = useState<{
    message: string;
    status?: number;
    code?: string;
    cohortName?: string;
    cohortCode?: string;
  } | null>(null);

  // Guest speaker entry mode (/live/guest)
  const [guestMode, setGuestMode] = useState<boolean>(isGuestEntry);
  const [joinedAsVerifiedGuest, setJoinedAsVerifiedGuest] = useState<boolean>(false);
  const [guestInviteToken, setGuestInviteToken] = useState<string>('');
  const [guestVerifyError, setGuestVerifyError] = useState<string | null>(null);
  const [isVerifyingGuest, setIsVerifyingGuest] = useState<boolean>(false);
  const [guestDisplayName, setGuestDisplayName] = useState<string>(
    currentUser?.fullName || ''
  );
  const [guestRoleHeadline, setGuestRoleHeadline] = useState<string>('');
  const [guestMeta, setGuestMeta] = useState<{
    sessionId: string;
    cohortId?: string;
    cohortName?: string;
    cohortCode?: string;
    sessionTitle: string;
    hostInstructorName: string;
    guestRoleLabel: string;
    livekit?: { roomName: string; token: string; serverUrl: string; enabled: boolean };
  } | null>(null);

  // Local Camera/Mic & Screen Share streams
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const guestVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);

  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [micOn, setMicOn] = useState<boolean>(false);
  const [camOn, setCamOn] = useState<boolean>(false);
  const [screenSharing, setScreenSharing] = useState<boolean>(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  // LiveKit remote stream tracking
  const [livekitConnected, setLivekitConnected] = useState<boolean>(false);
  const [livekitConnecting, setLivekitConnecting] = useState<boolean>(false);
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<AttachedRemoteTrackItem[]>([]);
  const [activeSpeakerIdentities, setActiveSpeakerIdentities] = useState<string[]>([]);

  // Stage mode toggle: STAGE (Màn hình chính) | GRID (Hiển thị lưới)
  const [stageViewMode, setStageViewMode] = useState<'STAGE' | 'GRID'>('STAGE');

  // Realtime collaboration state
  const [runtimeState, setRuntimeState] = useState<LiveRoomRuntimeState>(DEFAULT_ROOM_STATE);
  const [chatMessages, setChatMessages] = useState<LiveSessionChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [qaList, setQaList] = useState<LiveQuestionItem[]>([]);
  const [newQaText, setNewQaText] = useState<string>('');
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  // Right panel tabs: CHAT | QA | LIVE_SUMMARY | PARTICIPANTS
  const [rightTab, setRightTab] = useState<'CHAT' | 'QA' | 'LIVE_SUMMARY' | 'PARTICIPANTS'>('CHAT');
  const [lateJoinAiSummaryText, setLateJoinAiSummaryText] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  // Host session status & background recording state
  const [isUpdatingHostState, setIsUpdatingHostState] = useState<boolean>(false);
  const [isRecordingBusy, setIsRecordingBusy] = useState<boolean>(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const activeSessionId = guestMeta?.sessionId || roomData?.session.id || sessionId;
  const activeSession = roomData?.session;
  const activeCohort = roomData?.cohort;
  const isHost =
    Boolean(roomData?.isHost) || role === 'INSTRUCTOR' || role === 'ADMIN';

  const currentAccountId = currentUser?.id ? String(currentUser.id) : '';
  const handRaised = runtimeState.raisedHands.some(
    (h) => h.accountId === currentAccountId
  );

  const spawnFloatingReaction = useCallback((label: string, senderName: string, id?: string) => {
    const reactId = id || `${Date.now()}-${Math.random()}`;
    const leftPct = 15 + Math.floor(Math.random() * 65);
    setFloatingReactions((prev) => [
      ...prev.slice(-10),
      { id: reactId, label, senderName, leftPct },
    ]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== reactId));
    }, 2400);
  }, []);

  const stopAllLocalMediaAndRoom = useCallback(() => {
    if (localMediaStreamRef.current) {
      localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      localMediaStreamRef.current = null;
    }
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((t) => t.stop());
      localAudioStreamRef.current = null;
    }
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((t) => t.stop());
      screenShareStreamRef.current = null;
    }
    if (livekitRoomRef.current) {
      void livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    setLocalVideoStream(null);
    setScreenShareStream(null);
    setWebcamActive(false);
    setCamOn(false);
    setMicOn(false);
    setScreenSharing(false);
  }, []);

  const loadRoom = useCallback(async () => {
    if (isGuestEntry && !joinedAsVerifiedGuest) {
      setRoomLoading(false);
      return;
    }
    setRoomLoading(true);
    setRoomError(null);
    try {
      const data = await learningApi.getLiveSessionRoom(sessionId);
      setRoomData(data);
      setRuntimeState(data.roomState ?? DEFAULT_ROOM_STATE);
      setChatMessages(data.chatMessages ?? []);
      setQaList(
        (data.discussions ?? []).map((d) => ({
          id: d.id,
          author: d.authorName || 'Học viên',
          time: d.timestampLabel || d.createdAt,
          question: d.questionTitle || d.questionBody,
          votes: d.votes ?? 1,
          answeredByInstructor: d.verifiedByStaff || d.isResolved,
        }))
      );
    } catch (err) {
      if (err instanceof ApiHttpError) {
        const details = (err.details || {}) as {
          cohort?: { name?: string; code?: string };
        };
        setRoomError({
          message: err.message,
          status: err.status,
          code: err.code,
          cohortName: details.cohort?.name,
          cohortCode: details.cohort?.code,
        });
      } else {
        setRoomError({
          message: err instanceof Error ? err.message : 'Không thể kết nối phòng học trực tuyến.',
        });
      }
    } finally {
      setRoomLoading(false);
    }
  }, [sessionId, isGuestEntry, joinedAsVerifiedGuest]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  // Attach local webcam stream to guest preview video element when in guest check screen
  useEffect(() => {
    if (webcamActive && localVideoStream && guestVideoRef.current) {
      guestVideoRef.current.srcObject = localVideoStream;
    }
  }, [webcamActive, localVideoStream, guestMode]);

  // Cleanup all streams & LiveKit room on unmount
  useEffect(() => {
    return () => {
      stopAllLocalMediaAndRoom();
    };
  }, [stopAllLocalMediaAndRoom]);

  // Connect to LiveKit SFU automatically if backend returns serverUrl & token
  useEffect(() => {
    const lkInfo = joinedAsVerifiedGuest ? guestMeta?.livekit : roomData?.livekit;
    const serverUrl =
      lkInfo?.serverUrl || 'wss://project-3t-academy-live-3vunmpp5.livekit.cloud';
    if (!lkInfo?.token || !serverUrl) {
      setLivekitConnected(false);
      setLivekitConnecting(false);
      setRemoteVideoTracks([]);
      return;
    }

    let cancelled = false;
    setLivekitConnecting(true);
    const room = new Room({ adaptiveStream: true, dynacast: true });
    livekitRoomRef.current = room;

    const handleTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Video) {
        const sid = publication.trackSid || `${participant.identity}-${publication.source}`;
        const sourceType: 'camera' | 'screen_share' =
          publication.source === Track.Source.ScreenShare ? 'screen_share' : 'camera';
        setRemoteVideoTracks((prev) => [
          ...prev.filter((item) => item.sid !== sid),
          {
            sid,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity,
            source: sourceType,
            track,
          },
        ]);
      } else if (track.kind === Track.Kind.Audio && remoteAudioContainerRef.current) {
        const audioEl = track.attach();
        remoteAudioContainerRef.current.appendChild(audioEl);
      }
    };

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication
    ) => {
      track.detach();
      if (track.kind === Track.Kind.Video) {
        const sid = publication.trackSid;
        setRemoteVideoTracks((prev) => prev.filter((item) => item.sid !== sid));
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (!cancelled) {
        setActiveSpeakerIdentities(speakers.map((s) => s.identity));
      }
    });
    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (
        participant.identity === room.localParticipant.identity &&
        pub.kind === Track.Kind.Audio
      ) {
        setMicOn(false);
        setMediaNotice('Micro của bạn đã được tắt.');
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        setLivekitConnected(false);
        setLivekitConnecting(false);
        setRemoteVideoTracks([]);
        setActiveSpeakerIdentities([]);
      }
    });

    room
      .connect(serverUrl, lkInfo.token)
      .then(async () => {
        if (cancelled) return;
        setLivekitConnected(true);
        setLivekitConnecting(false);

        const camTrack = localMediaStreamRef.current?.getVideoTracks()?.[0];
        if (camTrack && camTrack.readyState === 'live' && camTrack.enabled) {
          await room.localParticipant
            .publishTrack(camTrack, { source: Track.Source.Camera })
            .catch(() => {});
        }
        const micTrack = localAudioStreamRef.current?.getAudioTracks()?.[0];
        if (micTrack && micTrack.readyState === 'live' && micTrack.enabled) {
          await room.localParticipant
            .publishTrack(micTrack, { source: Track.Source.Microphone })
            .catch(() => {});
        }
        const screenTrack = screenShareStreamRef.current?.getVideoTracks()?.[0];
        if (screenTrack && screenTrack.readyState === 'live') {
          await room.localParticipant
            .publishTrack(screenTrack, { source: Track.Source.ScreenShare })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLivekitConnected(false);
          setLivekitConnecting(false);
        }
      });

    return () => {
      cancelled = true;
      void room.disconnect();
      livekitRoomRef.current = null;
    };
  }, [roomData?.livekit, guestMeta?.livekit, joinedAsVerifiedGuest]);

  // Recording elapsed clock ticker
  useEffect(() => {
    if (!runtimeState.recording?.isRecording) {
      setRecordingElapsedSec(0);
      return;
    }
    const startMs = runtimeState.recording.startedAt
      ? Date.parse(runtimeState.recording.startedAt)
      : Date.now();
    const updateClock = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setRecordingElapsedSec(diff);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [runtimeState.recording?.isRecording, runtimeState.recording?.startedAt]);

  // Connect to Backend SSE stream for real-time Chat, Q&A, Hand Raise, Reactions, Mute & Kick
  useEffect(() => {
    if (!roomData || typeof EventSource === 'undefined') return;
    const eventsUrl = learningApi.getLiveEventsUrl(roomData.session.id);
    const source = new EventSource(eventsUrl);

    source.onopen = () => setSseConnected(true);
    source.onerror = () => setSseConnected(false);

    source.addEventListener('room_state', (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as LiveRoomRuntimeState;
        setRuntimeState(parsed);
      } catch {
        // Ignore malformed event
      }
    });

    source.addEventListener('chat_message', (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as LiveSessionChatMessage;
        setChatMessages((prev) =>
          prev.some((existing) => existing.id === msg.id) ? prev : [...prev, msg]
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('qa_created', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data) as {
          id: string;
          authorName?: string;
          timestampLabel?: string;
          createdAt?: string;
          questionTitle?: string;
          questionBody?: string;
          votes?: number;
          verifiedByStaff?: boolean;
          isResolved?: boolean;
        };
        setQaList((prev) =>
          prev.some((q) => q.id === d.id)
            ? prev
            : [
                {
                  id: d.id,
                  author: d.authorName || 'Học viên',
                  time: d.timestampLabel || d.createdAt || 'Vừa xong',
                  question: d.questionTitle || d.questionBody || '',
                  votes: d.votes ?? 1,
                  answeredByInstructor: Boolean(d.verifiedByStaff || d.isResolved),
                },
                ...prev,
              ]
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('qa_upvoted', (evt) => {
      try {
        const { threadId, votes } = JSON.parse((evt as MessageEvent).data) as {
          threadId: string;
          votes: number;
        };
        setQaList((prev) =>
          prev
            .map((q) => (q.id === String(threadId) ? { ...q, votes } : q))
            .sort((a, b) => b.votes - a.votes)
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('qa_verified', (evt) => {
      try {
        const updated = JSON.parse((evt as MessageEvent).data) as { id: string };
        setQaList((prev) =>
          prev.map((q) =>
            q.id === String(updated.id) ? { ...q, answeredByInstructor: true } : q
          )
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('hand_raise', (evt) => {
      try {
        const { raisedHands } = JSON.parse((evt as MessageEvent).data) as {
          raisedHands: LiveHandRaiseItem[];
        };
        setRuntimeState((prev) => ({ ...prev, raisedHands }));
      } catch {
        // Ignore
      }
    });

    source.addEventListener('reaction', (evt) => {
      try {
        const r = JSON.parse((evt as MessageEvent).data) as LiveReactionPayload;
        spawnFloatingReaction(r.label, r.senderName, r.id);
      } catch {
        // Ignore
      }
    });

    source.addEventListener('session_status', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
          videoUrl: string;
          playbackType: 'MP4' | 'HLS' | 'NONE';
          hostBroadcast: LiveRoomRuntimeState['hostBroadcast'];
        };
        setRuntimeState((prev) => ({
          ...prev,
          hostBroadcast: payload.hostBroadcast || prev.hostBroadcast,
        }));
        setRoomData((prev) =>
          prev
            ? {
                ...prev,
                session: {
                  ...prev.session,
                  status: payload.status,
                },
                video: {
                  ...prev.video,
                  videoUrl: payload.videoUrl || prev.video.videoUrl,
                  playbackType: payload.playbackType || prev.video.playbackType,
                },
              }
            : prev
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('participant_muted', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          mutedIdentities: string[];
          targetIdentities: string[];
          muteAllStudents: boolean;
          muted: boolean;
        };
        setRuntimeState((prev) => ({
          ...prev,
          mutedIdentities: payload.mutedIdentities || [],
        }));

        const myId = currentUser?.id ? String(currentUser.id) : '';
        const shouldMuteMe =
          !isHost &&
          payload.muted &&
          (payload.muteAllStudents ||
            payload.targetIdentities.includes(myId) ||
            payload.targetIdentities.includes(`acc-${myId}`));

        if (shouldMuteMe) {
          if (localAudioStreamRef.current) {
            localAudioStreamRef.current.getAudioTracks().forEach((t) => {
              t.enabled = false;
              t.stop();
            });
            localAudioStreamRef.current = null;
          }
          if (livekitRoomRef.current) {
            const micPub = livekitRoomRef.current.localParticipant.getTrackPublication(
              Track.Source.Microphone
            );
            if (micPub?.track) {
              void livekitRoomRef.current.localParticipant
                .unpublishTrack(micPub.track, false)
                .catch(() => {});
            }
          }
          setMicOn(false);
          setMediaNotice('Giảng viên đã tắt micro của bạn để giữ trật tự lớp học.');
        }
      } catch {
        // Ignore
      }
    });

    source.addEventListener('participant_kicked', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          kickedIdentities: string[];
          targetIdentities: string[];
          kicked: boolean;
        };
        setRuntimeState((prev) => ({
          ...prev,
          kickedIdentities: payload.kickedIdentities || [],
        }));

        // Remove kicked student from local roomData participants list
        const kickedSet = new Set(payload.kickedIdentities || []);
        setRoomData((prev) =>
          prev
            ? {
                ...prev,
                participants: prev.participants.filter(
                  (p) =>
                    p.isHost ||
                    (!kickedSet.has(p.accountId) && !kickedSet.has(`acc-${p.accountId}`))
                ),
              }
            : prev
        );

        const myId = currentUser?.id ? String(currentUser.id) : '';
        const shouldKickMe =
          !isHost &&
          payload.kicked &&
          (payload.targetIdentities.includes(myId) ||
            payload.targetIdentities.includes(`acc-${myId}`));

        if (shouldKickMe) {
          stopAllLocalMediaAndRoom();
          setRoomError({
            status: 403,
            code: 'KICKED_FROM_SESSION',
            message: 'Giảng viên đã mời bạn rời khỏi phòng học trực tuyến của buổi học này.',
          });
        }
      } catch {
        // Ignore
      }
    });

    source.addEventListener('recording_status', (evt) => {
      try {
        const recording = JSON.parse((evt as MessageEvent).data) as LiveRecordingState;
        setRuntimeState((prev) => ({
          ...prev,
          recording,
        }));
      } catch {
        // Ignore
      }
    });

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, [
    roomData?.session.id,
    spawnFloatingReaction,
    currentUser?.id,
    isHost,
    stopAllLocalMediaAndRoom,
  ]);

  // Real browser camera & microphone control
  const handleToggleCamera = async () => {
    if (camOn && localMediaStreamRef.current) {
      const videoTracks = localMediaStreamRef.current.getVideoTracks();
      videoTracks.forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      localMediaStreamRef.current = null;
      setLocalVideoStream(null);
      setWebcamActive(false);
      setCamOn(false);
      setMediaNotice('Đã tắt Camera.');

      if (livekitRoomRef.current && livekitConnected) {
        const camPub = livekitRoomRef.current.localParticipant.getTrackPublication(
          Track.Source.Camera
        );
        if (camPub?.track) {
          await livekitRoomRef.current.localParticipant
            .unpublishTrack(camPub.track, false)
            .catch(() => {});
        }
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Trình duyệt hiện tại chưa hỗ trợ mở Camera.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      localMediaStreamRef.current = stream;
      setLocalVideoStream(stream);
      setWebcamActive(true);
      setCamOn(true);
      setMediaNotice('Đã bật Camera.');

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          localMediaStreamRef.current = null;
          setLocalVideoStream(null);
          setWebcamActive(false);
          setCamOn(false);
        };
        if (livekitRoomRef.current && livekitConnected) {
          await livekitRoomRef.current.localParticipant
            .publishTrack(videoTrack, { source: Track.Source.Camera })
            .catch(() => {});
        }
      }
    } catch {
      setMediaNotice(
        'Không thể mở Camera. Vui lòng cho phép quyền Camera trên trình duyệt hoặc kiểm tra thiết bị.'
      );
    }
  };

  const handleToggleMic = async () => {
    if (micOn && localAudioStreamRef.current) {
      localAudioStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      localAudioStreamRef.current = null;
      setMicOn(false);
      setMediaNotice('Đã tắt Micro.');

      if (livekitRoomRef.current && livekitConnected) {
        const micPub = livekitRoomRef.current.localParticipant.getTrackPublication(
          Track.Source.Microphone
        );
        if (micPub?.track) {
          await livekitRoomRef.current.localParticipant
            .unpublishTrack(micPub.track, false)
            .catch(() => {});
        }
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Trình duyệt hiện tại không hỗ trợ Micro.');
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localAudioStreamRef.current = audioStream;
      setMicOn(true);
      setMediaNotice('Đã bật Micro.');

      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack && livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant
          .publishTrack(audioTrack, { source: Track.Source.Microphone })
          .catch(() => {});
      }
    } catch {
      setMediaNotice('Không tìm thấy Micro hoặc quyền truy cập bị từ chối.');
    }
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach((t) => t.stop());
        screenShareStreamRef.current = null;
      }
      setScreenShareStream(null);
      setScreenSharing(false);
      setMediaNotice('Đã dừng chia sẻ màn hình.');

      if (livekitRoomRef.current && livekitConnected) {
        const screenPub = livekitRoomRef.current.localParticipant.getTrackPublication(
          Track.Source.ScreenShare
        );
        if (screenPub?.track) {
          await livekitRoomRef.current.localParticipant
            .unpublishTrack(screenPub.track, false)
            .catch(() => {});
        }
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setMediaNotice('Trình duyệt hiện tại không hỗ trợ chia sẻ màn hình.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      screenShareStreamRef.current = displayStream;
      setScreenShareStream(displayStream);
      setScreenSharing(true);
      setStageViewMode('STAGE');
      setMediaNotice('Đang chia sẻ màn hình với cả lớp.');

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (livekitRoomRef.current && livekitConnected) {
            const screenPub = livekitRoomRef.current.localParticipant.getTrackPublication(
              Track.Source.ScreenShare
            );
            if (screenPub?.track) {
              void livekitRoomRef.current.localParticipant
                .unpublishTrack(screenPub.track, false)
                .catch(() => {});
            }
          }
          screenShareStreamRef.current = null;
          setScreenShareStream(null);
          setScreenSharing(false);
        };
        if (livekitRoomRef.current && livekitConnected) {
          await livekitRoomRef.current.localParticipant
            .publishTrack(videoTrack, { source: Track.Source.ScreenShare })
            .catch(() => {});
        }
      }
    } catch {
      setMediaNotice('Bạn đã hủy chọn cửa sổ chia sẻ màn hình.');
    }
  };

  const handleToggleHandRaise = async () => {
    const nextRaised = !handRaised;
    try {
      const res = await learningApi.setLiveHandRaise(activeSessionId, nextRaised);
      setRuntimeState((prev) => ({ ...prev, raisedHands: res.raisedHands }));
    } catch {
      setMediaNotice('Không thể cập nhật trạng thái giơ tay phát biểu.');
    }
  };

  const handleSendReaction = async (label: string) => {
    const senderName = currentUser?.fullName || guestDisplayName || 'Học viên';
    spawnFloatingReaction(label, senderName);
    try {
      await learningApi.sendLiveReaction(activeSessionId, label);
    } catch {
      // Visual reaction already displayed locally
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    try {
      const created = await learningApi.sendLiveSessionChat(activeSessionId, text);
      if (created?.id) {
        setChatMessages((prev) =>
          prev.some((existing) => existing.id === created.id) ? prev : [...prev, created]
        );
      }
    } catch {
      setMediaNotice('Không gửi được tin nhắn. Vui lòng thử lại.');
    }
  };

  const handleAskQa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQaText.trim()) return;
    const questionText = newQaText.trim();
    setNewQaText('');
    try {
      const res = await learningApi.createSessionQuestion(
        activeSessionId,
        questionText,
        0,
        questionText
      );
      const createdThread = res.thread;
      if (createdThread) {
        setQaList((prev) =>
          prev.some((q) => q.id === createdThread.id)
            ? prev
            : [
                {
                  id: createdThread.id,
                  author: createdThread.authorName || currentUser?.fullName || 'Học viên',
                  time: createdThread.timestampLabel || 'Vừa xong',
                  question: createdThread.questionTitle || questionText,
                  votes: 1,
                  answeredByInstructor: Boolean(createdThread.verifiedByStaff),
                },
                ...prev,
              ]
        );
      }
    } catch {
      setMediaNotice('Không gửi được câu hỏi lên hệ thống.');
    }
  };

  const handleUpvoteQa = async (id: string) => {
    try {
      const res = await learningApi.upvoteLiveDiscussion(id);
      setQaList((prev) =>
        prev
          .map((q) => (q.id === id ? { ...q, votes: res.votes } : q))
          .sort((a, b) => b.votes - a.votes)
      );
    } catch {
      // Ignore upvote error
    }
  };

  const handleRequestLateJoinSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const res = await learningApi.askSessionAiTutor(
        activeSessionId,
        'Tóm tắt nội dung trọng tâm của buổi học này'
      );
      if (res?.answerMd) {
        setLateJoinAiSummaryText(res.answerMd);
      }
    } catch {
      setLateJoinAiSummaryText('Không thể kết nối Trợ giảng AI vào lúc này.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleUpdateHostBroadcast = async (
    overrides?: { status?: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY'; videoR2Key?: string }
  ) => {
    setIsUpdatingHostState(true);
    try {
      const res = await teachApi.updateSessionLiveStatus(activeSessionId, {
        status: overrides?.status,
        videoR2Key: overrides?.videoR2Key,
      });
      setRuntimeState((prev) => ({ ...prev, hostBroadcast: res.hostBroadcast }));
      setRoomData((prev) =>
        prev
          ? {
               ...prev,
              session: {
                ...prev.session,
                status: res.status,
                videoR2Key: overrides?.videoR2Key ?? prev.session.videoR2Key,
              },
              video: {
                ...prev.video,
                videoUrl: res.videoUrl,
                playbackType: res.playbackType,
              },
            }
          : prev
      );
      setMediaNotice(
        overrides?.status === 'LIVE'
          ? 'Đã bắt đầu buổi học trực tuyến.'
          : overrides?.status === 'REPLAY_READY'
            ? 'Đã kết thúc buổi học trực tuyến.'
            : 'Đã cập nhật trạng thái lớp học.'
      );
    } catch {
      setMediaNotice('Không cập nhật được trạng thái buổi học.');
    } finally {
      setIsUpdatingHostState(false);
    }
  };

  // Host mutes a specific noisy student
  const handleMuteParticipant = async (targetIdentity: string, studentName?: string) => {
    try {
      const res = await teachApi.muteSessionParticipant(activeSessionId, {
        targetIdentity,
        muteAllStudents: false,
        muted: true,
      });
      setRuntimeState((prev) => ({
        ...prev,
        mutedIdentities: res.mutedIdentities,
      }));
      setMediaNotice(
        studentName
          ? `Đã tắt micro của học viên ${studentName}.`
          : 'Đã tắt micro của học viên.'
      );
    } catch {
      setMediaNotice('Không thể tắt micro của học viên này.');
    }
  };

  // Host kicks a disruptive student from the live room
  const handleKickParticipant = async (targetIdentity: string, studentName?: string) => {
    try {
      const res = await teachApi.kickSessionParticipant(activeSessionId, {
        targetIdentity,
        kicked: true,
      });
      setRuntimeState((prev) => ({
        ...prev,
        kickedIdentities: res.kickedIdentities,
      }));
      const kickedSet = new Set(res.kickedIdentities);
      setRoomData((prev) =>
        prev
          ? {
              ...prev,
              participants: prev.participants.filter(
                (p) =>
                  p.isHost ||
                  (!kickedSet.has(p.accountId) && !kickedSet.has(`acc-${p.accountId}`))
              ),
            }
          : prev
      );
      setMediaNotice(
        studentName
          ? `Đã mời ${studentName} ra khỏi phòng học.`
          : 'Đã mời học viên ra khỏi phòng học.'
      );
    } catch {
      setMediaNotice('Không thể mời học viên này ra khỏi phòng.');
    }
  };

  // Start recording in background
  const handleStartRecording = async () => {
    setIsRecordingBusy(true);
    try {
      const res = await teachApi.startSessionRecording(activeSessionId);
      setRuntimeState((prev) => ({
        ...prev,
        recording: res.recording,
      }));

      const captureStream =
        screenShareStreamRef.current || localMediaStreamRef.current;
      if (
        captureStream &&
        typeof MediaRecorder !== 'undefined' &&
        captureStream.getTracks().length > 0
      ) {
        try {
          recordedChunksRef.current = [];
          const recorder = new MediaRecorder(captureStream);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              recordedChunksRef.current.push(ev.data);
            }
          };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch {
          // Ignore if browser codec doesn't match stream tracks
        }
      }

      setMediaNotice('Đã bắt đầu ghi hình buổi học.');
    } catch {
      setMediaNotice('Không thể bắt đầu ghi hình buổi học.');
    } finally {
      setIsRecordingBusy(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read blob'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // Stop recording & automatically upload/save in background without technical URLs in UI
  const handleStopRecording = async () => {
    setIsRecordingBusy(true);
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        await new Promise<void>((resolve) => {
          const rec = mediaRecorderRef.current!;
          rec.onstop = () => resolve();
          rec.stop();
        });
      }
      mediaRecorderRef.current = null;

      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        recordedChunksRef.current = [];
        const base64Data = await blobToBase64(blob);
        const uploaded = await teachApi.uploadSessionRecordingToR2(
          activeSessionId,
          {
            fileName: `live-session-${activeSessionId}-${Date.now()}.webm`,
            contentType: 'video/webm',
            base64Data,
            markReplayReady: true,
          }
        );
        setRuntimeState((prev) => ({
          ...prev,
          recording: uploaded.recording,
        }));
        setRoomData((prev) =>
          prev
            ? {
                ...prev,
                session: {
                  ...prev.session,
                  status: uploaded.status,
                  videoR2Key: uploaded.videoUrl,
                },
                video: {
                  ...prev.video,
                  videoUrl: uploaded.videoUrl,
                  playbackType: 'MP4',
                },
              }
            : prev
        );
        setMediaNotice(
          'Đã dừng ghi hình và lưu bản ghi buổi học. Học viên có thể xem lại trong phần Video bài giảng.'
        );
        return;
      }

      const stopped = await teachApi.stopSessionRecording(activeSessionId, {
        markReplayReady: true,
      });
      setRuntimeState((prev) => ({
        ...prev,
        recording: stopped.recording,
      }));
      setRoomData((prev) =>
        prev
          ? {
              ...prev,
              session: {
                ...prev.session,
                status: stopped.status,
                videoR2Key: stopped.r2PublicUrl,
              },
              video: {
                ...prev.video,
                videoUrl: stopped.videoUrl,
                playbackType: stopped.playbackType,
              },
            }
          : prev
      );
      setMediaNotice(
        'Đã dừng ghi hình và lưu bản ghi buổi học. Học viên có thể xem lại trong phần Video bài giảng.'
      );
    } catch {
      setMediaNotice('Không thể lưu bản ghi buổi học.');
    } finally {
      setIsRecordingBusy(false);
    }
  };

  const handleVerifyAndJoinGuestStage = async () => {
    setIsVerifyingGuest(true);
    setGuestVerifyError(null);
    try {
      const verified = await learningApi.verifyGuestSpeakerToken(
        guestInviteToken,
        sessionId === 'guest' ? undefined : sessionId,
        guestDisplayName || undefined,
        guestRoleHeadline || undefined
      );
      if (!verified.valid) {
        setGuestVerifyError('Mã mời diễn giả không hợp lệ hoặc đã hết hạn.');
        return;
      }
      setGuestMeta({
        sessionId: verified.sessionId,
        cohortId: verified.cohortId,
        cohortName: verified.cohortName,
        cohortCode: verified.cohortCode,
        sessionTitle: verified.sessionTitle,
        hostInstructorName: verified.hostInstructorName,
        guestRoleLabel: verified.guestRoleLabel,
        livekit: verified.livekit,
      });
      if (!guestDisplayName) {
        setGuestDisplayName('Diễn giả Khách mời');
      }
      setJoinedAsVerifiedGuest(true);
      setGuestMode(false);
    } catch {
      setGuestVerifyError('Mã mời diễn giả không hợp lệ hoặc đã hết hạn.');
    } finally {
      setIsVerifyingGuest(false);
    }
  };

  // Deduplicated participant list for the right-hand "Thành viên" tab
  const uniqueParticipants = useMemo(() => {
    const raw = roomData?.participants ?? [];
    const seen = new Set<string>();
    const result: LiveParticipantItem[] = [];
    for (const p of raw) {
      const key = `${p.accountId}-${p.fullName.trim().toLowerCase()}`;
      if (seen.has(key) || (p.accountId && seen.has(p.accountId))) continue;
      seen.add(key);
      if (p.accountId) seen.add(p.accountId);
      result.push(p);
    }
    return result;
  }, [roomData?.participants]);

  // ============================================================================
  // 1. MÀN HÌNH THAM GIA CHO DIỄN GIẢ KHÁCH MỜI (/live/guest)
  // ============================================================================
  if (guestMode) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <UserPlus className="w-4 h-4" />
              <span>Tham gia với tư cách Diễn giả khách mời</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Quay lại
            </button>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Vào Phòng học Trực tuyến 3T Academy
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Nhập mã mời từ Giảng viên (nếu có) và kiểm tra Camera, Micro trước khi vào lớp.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Mã mời Khách mời (để trống nếu vào buổi học đang diễn ra)
              </label>
              <input
                type="text"
                value={guestInviteToken}
                onChange={(e) => setGuestInviteToken(e.target.value)}
                placeholder="Dán mã mời từ giảng viên (tùy chọn)..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Họ và tên hiển thị:
              </label>
              <input
                type="text"
                value={guestDisplayName}
                onChange={(e) => setGuestDisplayName(e.target.value)}
                placeholder="Nhập họ tên của bạn..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 text-sm text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Chức danh / Đơn vị công tác:
              </label>
              <input
                type="text"
                value={guestRoleHeadline}
                onChange={(e) => setGuestRoleHeadline(e.target.value)}
                placeholder="VD: Chuyên gia AI / Kỹ sư Dữ liệu"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 text-sm text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              {webcamActive && (
                <video
                  ref={guestVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-44 rounded-lg object-cover border border-emerald-500 bg-slate-900"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    name={guestDisplayName || 'Khách mời'}
                    className="w-10 h-10 rounded-full ring-2 ring-emerald-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {guestDisplayName || 'Diễn giả Khách mời'}
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400">
                      {guestRoleHeadline || 'Khách mời danh dự'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleCamera()}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      camOn
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {camOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                    <span>{camOn ? 'Camera: Đang bật' : 'Bật Camera'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleMic()}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      micOn
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{micOn ? 'Mic: Đang bật' : 'Bật Mic'}</span>
                  </button>
                </div>
              </div>

              {mediaNotice && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{mediaNotice}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleVerifyAndJoinGuestStage()}
            disabled={isVerifyingGuest}
            className="w-full py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
          >
            {isVerifyingGuest ? 'Đang kiểm tra thông tin...' : 'Tham gia phòng học ngay →'}
          </button>
          {guestVerifyError && (
            <p className="text-xs text-rose-600 text-center">{guestVerifyError}</p>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. LOADING STATE
  // ============================================================================
  if (roomLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Đang vào phòng học trực tuyến...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. ERROR / 403 ACCESS CHECK / KICKED STATE
  // ============================================================================
  if (roomError && !joinedAsVerifiedGuest) {
    const isKicked = roomError.code === 'KICKED_FROM_SESSION';
    const isForbidden =
      roomError.status === 403 || roomError.code === 'NOT_ENROLLED_IN_COHORT';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4 shadow-sm">
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
            {isKicked
              ? 'ĐÃ RỜI KHỎI PHÒNG HỌC'
              : isForbidden
                ? 'CHƯA GHI DANH LỚP HỌC NÀY'
                : 'KHÔNG THỂ KẾT NỐI PHÒNG HỌC'}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {isKicked
              ? 'Bạn đã được mời ra khỏi phòng học trực tuyến'
              : isForbidden
                ? `Bạn chưa đăng ký lớp ${roomError.cohortName || 'này'}`
                : 'Không thể tải phòng học trực tuyến'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {isKicked
              ? roomError.message
              : isForbidden
                ? `Phòng học trực tuyến chỉ dành cho Học viên chính thức của lớp${
                    roomError.cohortCode ? ` (${roomError.cohortCode})` : ''
                  }, Giảng viên phụ trách hoặc Khách mời có mã tham gia.`
                : roomError.message}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {!isForbidden && !isKicked ? (
              <button
                type="button"
                onClick={() => void loadRoom()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử kết nối lại</span>
              </button>
            ) : !isKicked ? (
              <button
                type="button"
                onClick={() => navigate('/courses')}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Xem Khóa học &amp; Đăng ký →
              </button>
            ) : null}
            {!isKicked && (
              <button
                type="button"
                onClick={() => setGuestMode(true)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Tham gia với tư cách Khách mời
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Về trang học tập
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. MAIN LIVE CLASSROOM WORKSPACE (Clean Light Theme & Human Language)
  // ============================================================================
  const sessionTitle = activeSession?.title || guestMeta?.sessionTitle || `Buổi ${sessionId}`;
  const sessionOrder = activeSession?.sessionOrder || 1;
  const sessionStatus = activeSession?.status || 'LIVE';
  const cohortName = activeCohort?.name || guestMeta?.cohortName || 'Lớp học 3T Academy';
  const cohortCode = activeCohort?.code || guestMeta?.cohortCode || '';
  const hostName = activeSession?.hostInstructorName || guestMeta?.hostInstructorName || 'Giảng viên';
  const playableVideoUrl = roomData?.video?.videoUrl || '';
  const selfName = currentUser?.fullName || guestDisplayName || 'Thành viên';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between pb-16">
      {/* Hidden audio output container for remote audio tracks */}
      <div ref={remoteAudioContainerRef} className="hidden" />

      {/* Clean Top Header */}
      <header className="px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {sessionStatus === 'LIVE' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Đang diễn ra</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold shrink-0">
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
              <span>{sessionStatus === 'REPLAY_READY' ? 'Đã kết thúc' : 'Chưa bắt đầu'}</span>
            </span>
          )}

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {cohortName} · Buổi {sessionOrder}: {sessionTitle}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {cohortCode ? `${cohortCode} · ` : ''}
              Giảng viên: <strong className="font-semibold text-slate-700 dark:text-slate-200">{hostName}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Instructor quick session state action if not yet LIVE */}
          {isHost && sessionStatus !== 'LIVE' && (
            <button
              type="button"
              disabled={isUpdatingHostState}
              onClick={() => void handleUpdateHostBroadcast({ status: 'LIVE' })}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              Bắt đầu buổi học
            </button>
          )}

          {isHost && sessionStatus === 'LIVE' && (
            <button
              type="button"
              disabled={isUpdatingHostState}
              onClick={() => void handleUpdateHostBroadcast({ status: 'REPLAY_READY' })}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              Kết thúc buổi học
            </button>
          )}

          {/* Link to dedicated Video Lecture screen ONLY if a recorded video exists */}
          {playableVideoUrl && activeSession?.cohortId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/learn/${activeSession.cohortId}/session/${activeSession.id}`)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xem video bài giảng</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setRightTab('PARTICIPANTS')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer tabular-nums"
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>{uniqueParticipants.length} thành viên</span>
          </button>
        </div>
      </header>

      {/* Main 2-Column Workspace: Left Video Stage (8 cols) + Right Panel (4 cols) */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: VIDEO STAGE & MEETING CONTROL BAR */}
        <div className="lg:col-span-8 space-y-4">
          <LiveKitClassroomStage
            sessionId={activeSessionId}
            sessionOrder={sessionOrder}
            sessionTitle={sessionTitle}
            sessionStatus={sessionStatus}
            cohortCode={cohortCode}
            hostName={hostName}
            selfName={selfName}
            selfAccountId={currentAccountId}
            selfRoleLabel={
              isHost
                ? 'Giảng viên phụ trách'
                : joinedAsVerifiedGuest
                  ? 'Diễn giả khách mời'
                  : 'Học viên'
            }
            isHost={isHost}
            livekitConnected={livekitConnected}
            livekitConnecting={livekitConnecting}
            stageViewMode={stageViewMode}
            onChangeStageViewMode={setStageViewMode}
            webcamActive={webcamActive}
            camOn={camOn}
            micOn={micOn}
            screenSharing={screenSharing}
            handRaised={handRaised}
            localVideoStream={localVideoStream}
            screenShareStream={screenShareStream}
            remoteVideoTracks={remoteVideoTracks}
            activeSpeakerIdentities={activeSpeakerIdentities}
            mutedIdentities={runtimeState.mutedIdentities || []}
            raisedHands={runtimeState.raisedHands}
            participants={uniqueParticipants}
            recordingState={runtimeState.recording}
            recordingElapsedSec={recordingElapsedSec}
            isRecordingBusy={isRecordingBusy}
            floatingReactions={floatingReactions}
            onToggleCamera={() => void handleToggleCamera()}
            onToggleMic={() => void handleToggleMic()}
            onToggleScreenShare={() => void handleToggleScreenShare()}
            onMuteParticipant={(targetIdentity, studentName) =>
              void handleMuteParticipant(targetIdentity, studentName)
            }
            onKickParticipant={(targetIdentity, studentName) =>
              void handleKickParticipant(targetIdentity, studentName)
            }
            onStartRecording={() => void handleStartRecording()}
            onStopRecording={() => void handleStopRecording()}
          />

          {mediaNotice && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <span>{mediaNotice}</span>
              <button
                type="button"
                onClick={() => setMediaNotice(null)}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* BOTTOM MEETING CONTROL BAR */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleMic()}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  micOn
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                {micOn ? (
                  <Mic className="w-4 h-4 text-emerald-600" />
                ) : (
                  <MicOff className="w-4 h-4 text-rose-500" />
                )}
                <span>{micOn ? 'Tắt Mic' : 'Bật Mic'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleCamera()}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  camOn
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                {camOn ? (
                  <Video className="w-4 h-4 text-emerald-600" />
                ) : (
                  <VideoOff className="w-4 h-4 text-rose-500" />
                )}
                <span>{camOn ? 'Tắt Camera' : 'Bật Camera'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleScreenShare()}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  screenSharing
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                <MonitorUp className="w-4 h-4" />
                <span>{screenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}</span>
              </button>

              {/* ONLY Students see "Giơ tay phát biểu" — Instructor NEVER raises hand */}
              {!isHost && (
                <button
                  type="button"
                  onClick={() => void handleToggleHandRaise()}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    handRaised
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <Hand className="w-4 h-4" />
                  <span>{handRaised ? 'Hạ tay xuống' : 'Giơ tay phát biểu'}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => void handleSendReaction('❤️ Thả tim')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                >
                  ❤️ Tim
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendReaction('👏 Vỗ tay')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-semibold text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                >
                  👏 Vỗ tay
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendReaction('🌟 Dễ hiểu')}
                  className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                >
                  🌟 Dễ hiểu
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    role === 'INSTRUCTOR'
                      ? '/teach'
                      : role === 'ADMIN'
                        ? '/admin'
                        : activeSession?.cohortId
                          ? `/app/cohorts/${activeSession.cohortId}`
                          : '/app'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Rời phòng học</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT INTERACTIVE PANEL (4 COLS) */}
        <aside className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col overflow-hidden">
          <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setRightTab('CHAT')}
              className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                rightTab === 'CHAT'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Trò chuyện</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('QA')}
              className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                rightTab === 'QA'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Hỏi đáp ({qaList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('LIVE_SUMMARY')}
              className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                rightTab === 'LIVE_SUMMARY'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Tài liệu</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('PARTICIPANTS')}
              className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                rightTab === 'PARTICIPANTS'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Thành viên</span>
            </button>
          </div>

          {/* TAB 1: TRÒ CHUYỆN */}
          {rightTab === 'CHAT' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[480px]">
              <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
                {chatMessages.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
                    Chưa có tin nhắn nào. Hãy gửi lời chào tới giảng viên và cả lớp!
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {msg.senderName || msg.sender}{' '}
                          {(msg.isStaff || msg.roleLabel) && (
                            <span className="ml-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              · {msg.roleLabel || msg.senderRole}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                          {msg.timeLabel || msg.time}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleSendChat}
                className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Nhắn tin trao đổi cùng lớp học..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  aria-label="Gửi tin nhắn"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: HỎI ĐÁP */}
          {rightTab === 'QA' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[480px]">
              <div className="space-y-3 overflow-y-auto max-h-[360px] pr-1">
                {qaList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
                    Chưa có câu hỏi nào trong buổi học này.
                  </div>
                ) : (
                  qaList.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {item.author} · {item.time}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleUpvoteQa(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer shrink-0 tabular-nums"
                        >
                          <Heart className="w-3 h-3 fill-current" />
                          <span>{item.votes}</span>
                        </button>
                      </div>
                      <p className="text-slate-900 dark:text-white font-medium leading-relaxed">
                        {item.question}
                      </p>
                      {item.answeredByInstructor && (
                        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Giảng viên đã giải đáp</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleAskQa}
                className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
              >
                <input
                  type="text"
                  value={newQaText}
                  onChange={(e) => setNewQaText(e.target.value)}
                  placeholder="Đặt câu hỏi cho Giảng viên..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Gửi câu hỏi
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: TÀI LIỆU & TÓM TẮT BUỔI HỌC */}
          {rightTab === 'LIVE_SUMMARY' && (
            <div className="p-4 space-y-4 min-h-[480px] overflow-y-auto max-h-[540px]">
              <button
                type="button"
                onClick={() => void handleRequestLateJoinSummary()}
                disabled={isGeneratingSummary}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {isGeneratingSummary
                    ? 'Đang tổng hợp nội dung buổi học...'
                    : 'Tóm tắt nhanh nội dung buổi học'}
                </span>
              </button>

              {lateJoinAiSummaryText && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-slate-800 dark:text-emerald-100 leading-relaxed whitespace-pre-line">
                  {lateJoinAiSummaryText}
                </div>
              )}

              {activeSession?.aiSummaryMd && !lateJoinAiSummaryText && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    Nội dung trọng tâm buổi học:
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {activeSession.aiSummaryMd.replace(/^#+\s*/gm, '')}
                  </p>
                </div>
              )}

              {roomData?.attachments && roomData.attachments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tài liệu đính kèm:
                  </div>
                  {roomData.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 flex items-center justify-between gap-2 text-xs transition-colors"
                    >
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {att.title}
                      </span>
                      <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </a>
                  ))}
                </div>
              )}

              {roomData?.transcript && roomData.transcript.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Các phần chính trong bài giảng:
                  </div>
                  {roomData.transcript.map((line, idx) => (
                    <div
                      key={line.id || idx}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span>Mốc {line.timeLabel}</span>
                        <span>Trang {line.slidePage}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: THÀNH VIÊN TRONG LỚP & ĐIỀU PHỐI HỌC VIÊN */}
          {rightTab === 'PARTICIPANTS' && (
            <div className="p-4 space-y-4 min-h-[480px] overflow-y-auto max-h-[540px]">
              {runtimeState.raisedHands.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Hand className="w-3.5 h-3.5 text-amber-600" />
                    <span>Học viên đang giơ tay ({runtimeState.raisedHands.length})</span>
                  </div>
                  {runtimeState.raisedHands.map((h) => (
                    <div
                      key={h.accountId}
                      className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-amber-900 dark:text-amber-200">
                        {h.fullName}
                      </span>
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        Xin phát biểu
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Danh sách thành viên ({uniqueParticipants.length})
                  </div>
                </div>

                {uniqueParticipants.map((p) => {
                  const isMe =
                    p.accountId === currentAccountId ||
                    (isHost && p.isHost);
                  const isMutedStudent =
                    !p.isHost &&
                    ((runtimeState.mutedIdentities || []).includes(p.accountId) ||
                      (runtimeState.mutedIdentities || []).includes(`acc-${p.accountId}`));

                  return (
                    <div
                      key={p.accountId}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarWithFallback
                          name={p.fullName}
                          className="w-8 h-8 rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {p.fullName}
                            {isMe ? ' (Bạn)' : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.isHost ? 'Giảng viên phụ trách' : p.roleLabel || 'Học viên'}
                            {isMutedStudent ? ' · Đã tắt mic' : ''}
                          </div>
                        </div>
                      </div>

                      {p.isHost ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                          Giảng viên
                        </span>
                      ) : isHost ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void handleMuteParticipant(`acc-${p.accountId}`, p.fullName)
                            }
                            title="Tắt micro của học viên này"
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-amber-700 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <MicOff className="w-3 h-3 text-amber-600" />
                            <span>Tắt mic</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleKickParticipant(`acc-${p.accountId}`, p.fullName)
                            }
                            title="Mời học viên này ra khỏi phòng"
                            className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <UserX className="w-3 h-3" />
                            <span>Mời ra ngoài</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
