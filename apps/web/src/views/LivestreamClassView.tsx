import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Video,
  VideoOff,
  VolumeX,
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

  // Room state hydrated from Backend GET /live/sessions/:sessionId
  const [roomData, setRoomData] = useState<LiveSessionRoomPayload | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(!isGuestEntry);
  const [roomError, setRoomError] = useState<{
    message: string;
    status?: number;
    code?: string;
    cohortName?: string;
    cohortCode?: string;
  } | null>(null);

  // Guest speaker 1-click entry mode (/live/guest)
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

  // Stage mode toggle: STAGE | GRID | VIDEO
  const [stageViewMode, setStageViewMode] = useState<'STAGE' | 'GRID' | 'VIDEO'>('STAGE');

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

  // Host broadcast & R2 recording controls (for INSTRUCTOR / ADMIN)
  const [hostSlideDraft, setHostSlideDraft] = useState<string>('');
  const [hostNoteDraft, setHostNoteDraft] = useState<string>('');
  const [replayUrlDraft, setReplayUrlDraft] = useState<string>('');
  const [hostActionFeedback, setHostActionFeedback] = useState<string | null>(null);
  const [isUpdatingHostState, setIsUpdatingHostState] = useState<boolean>(false);
  const [isRecordingBusy, setIsRecordingBusy] = useState<boolean>(false);
  const [isUploadingR2, setIsUploadingR2] = useState<boolean>(false);
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
      setHostSlideDraft(data.roomState?.hostBroadcast?.activeSlideLabel || '');
      setHostNoteDraft(data.roomState?.hostBroadcast?.liveTopicNote || '');
      setReplayUrlDraft(data.session.videoR2Key || '');
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
      if (data.video?.videoUrl && data.session.status === 'REPLAY_READY') {
        setStageViewMode('VIDEO');
      } else {
        setStageViewMode('STAGE');
      }
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
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (livekitRoomRef.current) {
        void livekitRoomRef.current.disconnect();
      }
    };
  }, []);

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

        // If user already turned on camera, mic, or screen share before room finished connecting, publish them now
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

  // Connect to Backend SSE stream for real-time Chat, Q&A, Hand Raise, Reactions & Session Status
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
          verifiedByStaff?: boolean;
          isResolved?: boolean;
        };
        setQaList((prev) => {
          if (prev.some((item) => item.id === d.id)) return prev;
          return [
            {
              id: d.id,
              author: d.authorName || 'Học viên',
              time: d.timestampLabel || d.createdAt || 'Vừa xong',
              question: d.questionTitle || d.questionBody || '',
              votes: 1,
              answeredByInstructor: Boolean(d.verifiedByStaff || d.isResolved),
            },
            ...prev,
          ];
        });
      } catch {
        // Ignore
      }
    });

    source.addEventListener('qa_verified', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data) as {
          id: string;
          verifiedByStaff?: boolean;
          isResolved?: boolean;
        };
        setQaList((prev) =>
          prev.map((q) =>
            q.id === d.id
              ? { ...q, answeredByInstructor: Boolean(d.verifiedByStaff || d.isResolved) }
              : q
          )
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('qa_upvoted', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          threadId: string;
          votes: number;
        };
        setQaList((prev) =>
          prev
            .map((q) => (q.id === payload.threadId ? { ...q, votes: payload.votes } : q))
            .sort((a, b) => b.votes - a.votes)
        );
      } catch {
        // Ignore
      }
    });

    source.addEventListener('hand_raise', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          raisedHands: LiveHandRaiseItem[];
        };
        setRuntimeState((prev) => ({
          ...prev,
          raisedHands: payload.raisedHands || [],
        }));
      } catch {
        // Ignore
      }
    });

    source.addEventListener('reaction', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          id: string;
          senderName: string;
          label: string;
        };
        spawnFloatingReaction(payload.label, payload.senderName, payload.id);
      } catch {
        // Ignore
      }
    });

    source.addEventListener('host_broadcast', (evt) => {
      try {
        const hostBroadcast = JSON.parse((evt as MessageEvent).data) as LiveRoomRuntimeState['hostBroadcast'];
        setRuntimeState((prev) => ({ ...prev, hostBroadcast }));
      } catch {
        // Ignore
      }
    });

    source.addEventListener('session_status', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          status: 'LIVE' | 'SCHEDULED' | 'REPLAY_READY';
          videoUrl?: string;
          playbackType?: 'MP4' | 'HLS' | 'NONE';
          hostBroadcast?: LiveRoomRuntimeState['hostBroadcast'];
        };
        setRoomData((prev) =>
          prev
            ? {
                ...prev,
                session: { ...prev.session, status: payload.status },
                video:
                  payload.videoUrl !== undefined
                    ? {
                        ...prev.video,
                        videoUrl: payload.videoUrl,
                        playbackType: payload.playbackType ?? prev.video.playbackType,
                      }
                    : prev.video,
              }
            : prev
        );
        if (payload.hostBroadcast) {
          setRuntimeState((prev) => ({ ...prev, hostBroadcast: payload.hostBroadcast! }));
        }
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
            });
          }
          if (localMediaStreamRef.current) {
            localMediaStreamRef.current.getAudioTracks().forEach((t) => {
              t.enabled = false;
            });
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
          setMediaNotice('Giảng viên đã cắt micro của bạn để đảm bảo chất lượng lớp học.');
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
  }, [roomData?.session.id, spawnFloatingReaction, currentUser?.id, isHost]);

  // Real browser camera & microphone control (Google Meet style)
  const handleToggleCamera = async () => {
    // Turn off camera if currently on
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
      setMediaNotice('Trình duyệt hiện tại chưa hỗ trợ API Camera (getUserMedia).');
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
      if (stageViewMode === 'VIDEO') {
        setStageViewMode('STAGE');
      }
      setMediaNotice('Đã bật Camera trực tiếp trên sân khấu phòng họp.');

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
        'Không thể mở Camera. Vui lòng kiểm tra quyền truy cập Camera trên thanh địa chỉ trình duyệt hoặc tắt ứng dụng khác đang chiếm webcam.'
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
      setMediaNotice('Đã bật Micro trực tiếp.');

      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack && livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant
          .publishTrack(audioTrack, { source: Track.Source.Microphone })
          .catch(() => {});
      }
    } catch {
      setMediaNotice('Không tìm thấy thiết bị Micro hoặc quyền truy cập bị từ chối.');
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
      setMediaNotice('Trình duyệt hiện tại không hỗ trợ chia sẻ màn hình (getDisplayMedia).');
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
      setMediaNotice('Đang trình bày / chia sẻ màn hình trực tiếp lên sân khấu.');

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
      setMediaNotice('Bạn đã hủy chọn cửa sổ chia sẻ màn hình hoặc trình duyệt từ chối quyền.');
    }
  };

  const handleToggleHandRaise = async () => {
    const nextRaised = !handRaised;
    try {
      const res = await learningApi.setLiveHandRaise(activeSessionId, nextRaised);
      setRuntimeState((prev) => ({ ...prev, raisedHands: res.raisedHands }));
    } catch {
      // Ignore network failure on guest
    }
  };

  const handleSendReaction = async (label: string) => {
    const senderName = currentUser?.fullName || guestDisplayName || 'Thành viên';
    try {
      await learningApi.sendLiveReaction(activeSessionId, label);
    } catch {
      spawnFloatingReaction(label, senderName);
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
      setMediaNotice('Không gửi được tin nhắn. Hãy kiểm tra kết nối máy chủ.');
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
    setHostActionFeedback(null);
    try {
      const res = await teachApi.updateSessionLiveStatus(activeSessionId, {
        status: overrides?.status,
        videoR2Key: overrides?.videoR2Key ?? (replayUrlDraft.trim() || undefined),
        activeSlideLabel: hostSlideDraft.trim(),
        liveTopicNote: hostNoteDraft.trim(),
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
      setHostActionFeedback(
        overrides?.status === 'LIVE'
          ? 'Đã bật trạng thái ĐANG DẠY TRỰC TUYẾN (LIVE) cho cả lớp.'
          : overrides?.status === 'REPLAY_READY'
            ? 'Đã kết thúc ca Live và lưu bản ghi xem lại (REPLAY_READY).'
            : 'Đã đồng bộ ghi chú giảng dạy tới toàn bộ học viên trong phòng.'
      );
      window.setTimeout(() => setHostActionFeedback(null), 4000);
    } catch {
      setHostActionFeedback('Không cập nhật được trạng thái phòng học.');
    } finally {
      setIsUpdatingHostState(false);
    }
  };

  const handleMuteParticipant = async (
    targetIdentity?: string,
    muteAllStudents = false
  ) => {
    try {
      const res = await teachApi.muteSessionParticipant(activeSessionId, {
        targetIdentity,
        muteAllStudents,
        muted: true,
      });
      setRuntimeState((prev) => ({
        ...prev,
        mutedIdentities: res.mutedIdentities,
      }));
      setHostActionFeedback(
        muteAllStudents
          ? 'Đã cắt micro của toàn bộ học viên trong lớp.'
          : 'Đã cắt micro của học viên được chọn.'
      );
      window.setTimeout(() => setHostActionFeedback(null), 3500);
    } catch {
      setHostActionFeedback('Không thể gửi lệnh cắt micro.');
    }
  };

  const handleStartRecordingToR2 = async () => {
    setIsRecordingBusy(true);
    setHostActionFeedback(null);
    try {
      const res = await teachApi.startSessionRecording(activeSessionId);
      setRuntimeState((prev) => ({
        ...prev,
        recording: res.recording,
      }));

      // If instructor has an active screen share or camera stream, also capture locally via MediaRecorder
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

      setHostActionFeedback(
        'Đã bắt đầu ghi hình buổi học (Cloudflare R2 · edutech-storage).'
      );
    } catch {
      setHostActionFeedback('Không thể bắt đầu ghi hình lên Cloudflare R2.');
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

  const handleStopRecordingToR2 = async () => {
    setIsRecordingBusy(true);
    setHostActionFeedback(null);
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
        setReplayUrlDraft(uploaded.videoUrl);
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
        setHostActionFeedback(
          `Đã đẩy trực tiếp bản ghi lên Cloudflare R2: ${uploaded.videoUrl}`
        );
        return;
      }

      const stopped = await teachApi.stopSessionRecording(activeSessionId, {
        markReplayReady: true,
      });
      setReplayUrlDraft(stopped.r2PublicUrl);
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
      setHostActionFeedback(
        `Đã dừng ghi hình và lưu thông tin bản ghi R2: ${stopped.r2PublicUrl}`
      );
    } catch {
      setHostActionFeedback('Không thể dừng hoặc lưu bản ghi lên R2.');
    } finally {
      setIsRecordingBusy(false);
    }
  };

  const handleUploadVideoFileToR2 = async (file: File) => {
    setIsUploadingR2(true);
    setHostActionFeedback('Đang tải file video trực tiếp lên Cloudflare R2...');
    try {
      const base64Data = await blobToBase64(file);
      const uploaded = await teachApi.uploadSessionRecordingToR2(
        activeSessionId,
        {
          fileName: file.name,
          contentType: file.type || 'video/mp4',
          base64Data,
          markReplayReady: true,
        }
      );
      setReplayUrlDraft(uploaded.videoUrl);
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
      setHostActionFeedback(
        `Đã tải video lên Cloudflare R2 thành công: ${uploaded.videoUrl}`
      );
    } catch {
      setHostActionFeedback('Không thể tải file video lên Cloudflare R2.');
    } finally {
      setIsUploadingR2(false);
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

  // ============================================================================
  // 1. MÀN HÌNH THAM GIA CHO DIỄN GIẢ KHÁCH MỜI (/live/guest)
  // ============================================================================
  if (guestMode) {
    return (
      <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl bg-[#111A15] border border-[#1E2D24] p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[#34D399] text-xs font-mono font-bold">
              <UserPlus className="w-4 h-4" />
              <span>CỔNG DIỄN GIẢ KHÁCH MỜI</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Quay lại
            </button>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Tham gia Phòng học Trực tuyến 3T Academy
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Nhập mã mời do Giảng viên cấp (nếu có), kiểm tra Camera &amp; Micro trước khi bước vào lớp.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mã mời Khách mời (JWT / để trống nếu tham gia ca LIVE hiện tại)
              </label>
              <input
                type="text"
                value={guestInviteToken}
                onChange={(e) => setGuestInviteToken(e.target.value)}
                placeholder="Dán mã mời từ giảng viên (tùy chọn)..."
                className="w-full px-4 py-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] focus:border-[#10B981] text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tên hiển thị của bạn trên sân khấu lớp học:
              </label>
              <input
                type="text"
                value={guestDisplayName}
                onChange={(e) => setGuestDisplayName(e.target.value)}
                placeholder="Nhập họ tên của bạn..."
                className="w-full px-4 py-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] focus:border-[#10B981] text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Đơn vị công tác / Chuyên môn chia sẻ:
              </label>
              <input
                type="text"
                value={guestRoleHeadline}
                onChange={(e) => setGuestRoleHeadline(e.target.value)}
                placeholder="VD: Principal AI Architect"
                className="w-full px-4 py-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] focus:border-[#10B981] text-sm text-white focus:outline-none"
              />
            </div>

            {/* Quick Mic & Real Camera Check */}
            <div className="p-4 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-3">
              {webcamActive && (
                <video
                  ref={guestVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-44 rounded-lg object-cover border border-[#10B981]"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    name={guestDisplayName || 'Khách mời'}
                    className="w-10 h-10 rounded-full ring-2 ring-[#10B981]"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-white">{guestDisplayName || 'Diễn giả Khách mời'}</div>
                    <div className="text-emerald-400">
                      {guestRoleHeadline || 'Diễn giả Khách mời Doanh nghiệp'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleCamera()}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      camOn
                        ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                        : 'bg-[#10B981] text-white'
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
                        ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                        : 'bg-white/10 text-slate-200 border border-white/15'
                    }`}
                  >
                    {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{micOn ? 'Mic: Đang bật' : 'Bật Mic'}</span>
                  </button>
                </div>
              </div>

              {mediaNotice && <p className="text-[11px] text-emerald-300">{mediaNotice}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleVerifyAndJoinGuestStage()}
            disabled={isVerifyingGuest}
            className="w-full py-3.5 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold shadow-md transition-colors cursor-pointer disabled:opacity-60"
          >
            {isVerifyingGuest
              ? 'Đang xác thực Token Diễn giả...'
              : 'Vào thẳng Phòng học Trực tuyến ngay →'}
          </button>
          {guestVerifyError && (
            <p className="text-xs text-red-400 text-center">{guestVerifyError}</p>
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
      <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-semibold text-white">
            Đang kết nối phòng học trực tuyến &amp; xác thực quyền lớp học...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. ERROR / REAL 403 ACCESS CHECK
  // ============================================================================
  if (roomError && !joinedAsVerifiedGuest) {
    const isForbidden = roomError.status === 403 || roomError.code === 'NOT_ENROLLED_IN_COHORT';
    return (
      <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl bg-[#111A15] border border-[#1E2D24] p-8 text-center space-y-4">
          <div className="text-xs font-mono font-bold text-amber-400">
            {isForbidden
              ? '403 FORBIDDEN · CHƯA GHI DANH ĐỢT HỌC'
              : `LỖI KẾT NỐI PHÒNG HỌC${roomError.status ? ` (${roomError.status})` : ''}`}
          </div>
          <h1 className="text-xl font-bold text-white">
            {isForbidden
              ? `Bạn chưa ghi danh vào ${roomError.cohortName || 'đợt học này'}`
              : 'Không thể tải phòng học trực tuyến'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {isForbidden
              ? `Phòng học trực tuyến Livestream chỉ mở cho Học viên chính thức của đợt học${
                  roomError.cohortCode ? ` (${roomError.cohortCode})` : ''
                }, Giảng viên phụ trách hoặc Diễn giả khách mời có mã mời hợp lệ.`
              : roomError.message}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {!isForbidden ? (
              <button
                type="button"
                onClick={() => void loadRoom()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử kết nối lại</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/courses')}
                className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Xem Khóa học &amp; Ghi danh →
              </button>
            )}
            <button
              type="button"
              onClick={() => setGuestMode(true)}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-emerald-300 cursor-pointer"
            >
              Vào bằng Mã Khách mời
            </button>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="px-4 py-2.5 rounded-xl border border-[#1E2D24] text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              Về Cổng Học Tập
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. MAIN LIVE CLASSROOM WORKSPACE
  // ============================================================================
  const sessionTitle = activeSession?.title || guestMeta?.sessionTitle || `Buổi ${sessionId}`;
  const sessionOrder = activeSession?.sessionOrder || 1;
  const sessionStatus = activeSession?.status || 'LIVE';
  const cohortName = activeCohort?.name || guestMeta?.cohortName || 'Lớp học 3T Academy';
  const cohortCode = activeCohort?.code || guestMeta?.cohortCode || '';
  const hostName = activeSession?.hostInstructorName || guestMeta?.hostInstructorName || 'Giảng viên';
  const playableVideoUrl = roomData?.video?.videoUrl || '';
  const participantList: LiveParticipantItem[] = roomData?.participants ?? [];
  const participantDisplayCount = roomData?.participantCount || participantList.length || 1;
  const selfName = currentUser?.fullName || guestDisplayName || 'Thành viên';

  return (
    <div className="min-h-screen bg-[#090F0C] text-[#ECFDF5] flex flex-col justify-between pb-20">
      {/* Hidden audio output container for LiveKit remote audio tracks */}
      <div ref={remoteAudioContainerRef} className="hidden" />

      {/* Top Header of Live Classroom */}
      <header className="px-6 py-3.5 bg-[#111A15] border-b border-[#1E2D24] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {sessionStatus === 'LIVE' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-500/20 border border-[#EF4444]/60 text-[#EF4444] font-mono text-xs font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
              <span>ĐANG LIVE</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-[#10B981]/40 text-[#34D399] font-mono text-xs font-bold shrink-0">
              <Radio className="w-3.5 h-3.5" />
              <span>{sessionStatus === 'REPLAY_READY' ? 'ĐÃ CÓ BẢN GHI' : 'CHƯA BẮT ĐẦU'}</span>
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white truncate">
              {cohortName} · Buổi {sessionOrder}: {sessionTitle}
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              {cohortCode ? `${cohortCode} · ` : ''}
              Giảng viên: {hostName} · {sseConnected ? 'Đồng bộ thời gian thực' : 'Đang kết nối'}
              {livekitConnected ? ' · LiveKit WebRTC' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {playableVideoUrl && (
            <div className="flex items-center rounded-lg bg-[#090F0C] border border-[#1E2D24] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStageViewMode('STAGE')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  stageViewMode === 'STAGE'
                    ? 'bg-[#10B981] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sân khấu Live
              </button>
              <button
                type="button"
                onClick={() => setStageViewMode('VIDEO')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  stageViewMode === 'VIDEO'
                    ? 'bg-[#10B981] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Video bài giảng
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRightTab('PARTICIPANTS')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-emerald-300 cursor-pointer tabular-nums"
          >
            <Users className="w-3.5 h-3.5 text-[#10B981]" />
            <span>{participantDisplayCount} thành viên</span>
          </button>
        </div>
      </header>

      {/* Main 2-Column Live Stage + Right Interactive Panel */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SÂN KHẤU CHÍNH (8 CỘT) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Host Live Control Bar (ONLY shown to INSTRUCTOR / ADMIN) */}
          {isHost && (
            <div className="rounded-2xl bg-[#111A15] border border-[#10B981]/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Radio className="w-4 h-4 text-[#10B981]" />
                  <span>Bảng điều khiển Giảng viên (Phát sóng &amp; Lưu bản ghi)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sessionStatus !== 'LIVE' ? (
                    <button
                      type="button"
                      disabled={isUpdatingHostState}
                      onClick={() => void handleUpdateHostBroadcast({ status: 'LIVE' })}
                      className="px-3.5 py-1.5 rounded-lg bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                    >
                      Bắt đầu phát LIVE
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isUpdatingHostState}
                      onClick={() =>
                        void handleUpdateHostBroadcast({
                          status: 'REPLAY_READY',
                          videoR2Key: replayUrlDraft.trim() || undefined,
                        })
                      }
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-60"
                    >
                      Kết thúc Live &amp; Chuyển sang Replay
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <input
                  type="text"
                  value={hostSlideDraft}
                  onChange={(e) => setHostSlideDraft(e.target.value)}
                  placeholder="Slide / Phần đang giảng (VD: Slide 12)"
                  className="px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-white focus:border-[#10B981] focus:outline-none"
                />
                <input
                  type="text"
                  value={hostNoteDraft}
                  onChange={(e) => setHostNoteDraft(e.target.value)}
                  placeholder="Ghi chú chủ đề đang giảng cho cả lớp..."
                  className="px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-white focus:border-[#10B981] focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replayUrlDraft}
                    onChange={(e) => setReplayUrlDraft(e.target.value)}
                    placeholder="URL video / R2 key bản ghi..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-white font-mono focus:border-[#10B981] focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    disabled={isUpdatingHostState}
                    onClick={() => void handleUpdateHostBroadcast()}
                    className="px-3 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-bold cursor-pointer shrink-0 disabled:opacity-60"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>

              {hostActionFeedback && (
                <p className="text-xs font-semibold text-emerald-300">✓ {hostActionFeedback}</p>
              )}
            </div>
          )}

          {/* PROFESSIONAL LIVEKIT + R2 CLASSROOM STAGE COMPONENT */}
          <LiveKitClassroomStage
            sessionId={activeSessionId}
            sessionOrder={sessionOrder}
            sessionTitle={sessionTitle}
            sessionStatus={sessionStatus}
            aiSummaryMd={activeSession?.aiSummaryMd}
            cohortCode={cohortCode}
            hostName={hostName}
            selfName={selfName}
            selfAccountId={currentAccountId}
            selfRoleLabel={
              isHost
                ? 'Giảng viên / Chủ phòng'
                : joinedAsVerifiedGuest
                  ? 'Diễn giả khách mời'
                  : 'Học viên'
            }
            isHost={isHost}
            livekitConnected={livekitConnected}
            livekitConnecting={livekitConnecting}
            livekitRoomName={roomData?.livekit?.roomName}
            sseConnected={sseConnected}
            stageViewMode={stageViewMode}
            onChangeStageViewMode={setStageViewMode}
            playableVideoUrl={playableVideoUrl}
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
            participants={participantList}
            recordingState={runtimeState.recording}
            recordingElapsedSec={recordingElapsedSec}
            isRecordingBusy={isRecordingBusy}
            isUploadingR2={isUploadingR2}
            hostSlideLabel={runtimeState.hostBroadcast.activeSlideLabel}
            hostTopicNote={runtimeState.hostBroadcast.liveTopicNote}
            floatingReactions={floatingReactions}
            onToggleCamera={() => void handleToggleCamera()}
            onToggleMic={() => void handleToggleMic()}
            onToggleScreenShare={() => void handleToggleScreenShare()}
            onMuteParticipant={(targetIdentity, muteAll) =>
              void handleMuteParticipant(targetIdentity, muteAll)
            }
            onStartRecordingToR2={() => void handleStartRecordingToR2()}
            onStopRecordingToR2={() => void handleStopRecordingToR2()}
            onUploadVideoFileToR2={(file) => void handleUploadVideoFileToR2(file)}
          />

          {mediaNotice && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-950/60 border border-[#10B981]/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
              <span>{mediaNotice}</span>
              <button
                type="button"
                onClick={() => setMediaNotice(null)}
                className="text-[11px] font-mono text-emerald-400 hover:underline cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* THANH ĐIỀU KHIỂN PHÍA DƯỚI */}
          <div className="rounded-2xl bg-[#111A15] border border-[#1E2D24] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleMic()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  micOn
                    ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-rose-400" />}
                <span>{micOn ? 'Tắt Mic' : 'Bật Mic'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleCamera()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  camOn
                    ? 'bg-emerald-500/20 text-emerald-300 border border-[#10B981]/50'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4 text-rose-400" />}
                <span>{camOn ? 'Tắt Camera' : 'Bật Camera'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleScreenShare()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  screenSharing
                    ? 'bg-[#10B981] text-white'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <MonitorUp className="w-4 h-4" />
                <span>{screenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleHandRaise()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  handRaised
                    ? 'bg-[#F59E0B] text-slate-950'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Hand className="w-4 h-4" />
                <span>{handRaised ? 'Hạ tay xuống' : 'Giơ tay phát biểu'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-[#090F0C] border border-[#1E2D24]">
                <button
                  type="button"
                  onClick={() => void handleSendReaction('❤️ Thả tim')}
                  className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-rose-300 cursor-pointer"
                >
                  ❤️ Tim
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendReaction('👏 Vỗ tay')}
                  className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-amber-300 cursor-pointer"
                >
                  👏 Vỗ tay
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendReaction('🌟 Dễ hiểu')}
                  className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-emerald-300 cursor-pointer"
                >
                  🌟 Hay
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{isHost ? 'Về Cổng Giảng Viên' : 'Rời lớp'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* CỘT TƯƠNG TÁC BÊN PHẢI (4 CỘT — 4 TAB) */}
        <aside className="lg:col-span-4 rounded-2xl bg-[#111A15] border border-[#1E2D24] flex flex-col overflow-hidden">
          <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#090F0C] border-b border-[#1E2D24]">
            <button
              type="button"
              onClick={() => setRightTab('CHAT')}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                rightTab === 'CHAT' ? 'bg-[#10B981] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('QA')}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                rightTab === 'QA' ? 'bg-[#10B981] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Hỏi ({qaList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('LIVE_SUMMARY')}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                rightTab === 'LIVE_SUMMARY'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Tài liệu</span>
            </button>

            <button
              type="button"
              onClick={() => setRightTab('PARTICIPANTS')}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                rightTab === 'PARTICIPANTS'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Lớp</span>
            </button>
          </div>

          {/* TAB 1: CHAT */}
          {rightTab === 'CHAT' && (
            <div className="p-4 flex flex-col justify-between space-y-4 min-h-[480px]">
              <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
                {chatMessages.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-slate-400 text-center">
                    Chưa có tin nhắn nào trong ca học này. Hãy gửi lời chào tới giảng viên và cả lớp!
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">
                          {msg.senderName || msg.sender}{' '}
                          {(msg.isStaff || msg.roleLabel) && (
                            <span className="ml-1 font-mono text-[10px] text-emerald-300">
                              · {msg.roleLabel || msg.senderRole}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {msg.timeLabel || msg.time}
                        </span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-[#1E2D24]">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Nhắn trao đổi cùng cả lớp..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="submit"
                  aria-label="Gửi tin nhắn"
                  className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
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
                  <div className="p-4 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-slate-400 text-center">
                    Chưa có câu hỏi Q&amp;A nào trong buổi học này.
                  </div>
                ) : (
                  qaList.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-emerald-300 truncate">
                          {item.author} · {item.time}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleUpvoteQa(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono font-bold cursor-pointer shrink-0 tabular-nums"
                        >
                          <Heart className="w-3 h-3 fill-current" />
                          <span>{item.votes}</span>
                        </button>
                      </div>
                      <p className="text-white font-medium leading-relaxed">{item.question}</p>
                      {item.answeredByInstructor && (
                        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Giảng viên đã giải đáp</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAskQa} className="flex gap-2 pt-2 border-t border-[#1E2D24]">
                <input
                  type="text"
                  value={newQaText}
                  onChange={(e) => setNewQaText(e.target.value)}
                  placeholder="Đặt câu hỏi cho Giảng viên..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#090F0C] border border-[#1E2D24] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Gửi câu hỏi
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: TÀI LIỆU & TÓM TẮT AI */}
          {rightTab === 'LIVE_SUMMARY' && (
            <div className="p-4 space-y-4 min-h-[480px] overflow-y-auto max-h-[540px]">
              <button
                type="button"
                onClick={() => void handleRequestLateJoinSummary()}
                disabled={isGeneratingSummary}
                className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {isGeneratingSummary
                    ? 'Trợ giảng AI đang tổng hợp nội dung...'
                    : 'Tóm tắt nhanh trọng tâm buổi học (Trợ giảng AI)'}
                </span>
              </button>

              {lateJoinAiSummaryText && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-[#10B981]/50 text-xs text-emerald-100 leading-relaxed whitespace-pre-line">
                  {lateJoinAiSummaryText}
                </div>
              )}

              {roomData?.attachments && roomData.attachments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300">Tài liệu buổi học:</div>
                  {roomData.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3 rounded-xl bg-[#090F0C] border border-[#1E2D24] hover:border-[#10B981] flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate font-semibold text-white">{att.title}</span>
                      <Download className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    </a>
                  ))}
                </div>
              )}

              {roomData?.transcript && roomData.transcript.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300">Mốc nội dung bài giảng:</div>
                  {roomData.transcript.map((line, idx) => (
                    <div
                      key={line.id || idx}
                      className="p-3 rounded-xl bg-[#090F0C] border border-[#1E2D24] space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-emerald-400">
                        <span>[{line.timeLabel}]</span>
                        <span>Slide {line.slidePage}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{line.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: THÀNH VIÊN & GIƠ TAY */}
          {rightTab === 'PARTICIPANTS' && (
            <div className="p-4 space-y-4 min-h-[480px] overflow-y-auto max-h-[540px]">
              {runtimeState.raisedHands.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Hand className="w-3.5 h-3.5" />
                    <span>Đang giơ tay phát biểu ({runtimeState.raisedHands.length})</span>
                  </div>
                  {runtimeState.raisedHands.map((h) => (
                    <div
                      key={h.accountId}
                      className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-amber-200">{h.fullName}</span>
                      <span className="font-mono text-[10px] text-amber-400">Xin phát biểu</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-300">
                    Danh sách lớp học ({participantList.length})
                  </div>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => void handleMuteParticipant(undefined, true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-[11px] font-bold cursor-pointer"
                    >
                      <VolumeX className="w-3 h-3" />
                      <span>Cắt Mic Cả Lớp</span>
                    </button>
                  )}
                </div>
                {participantList.map((p) => {
                  const isMutedStudent =
                    !p.isHost &&
                    ((runtimeState.mutedIdentities || []).includes('ALL_STUDENTS') ||
                      (runtimeState.mutedIdentities || []).includes(p.accountId) ||
                      (runtimeState.mutedIdentities || []).includes(`acc-${p.accountId}`));
                  return (
                    <div
                      key={p.accountId}
                      className="p-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarWithFallback
                          name={p.fullName}
                          className="w-7 h-7 rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{p.fullName}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.roleLabel}
                            {isMutedStudent ? ' · Đã cắt mic' : ''}
                          </div>
                        </div>
                      </div>
                      {p.isHost ? (
                        <span className="font-mono text-[10px] font-bold text-emerald-400 shrink-0">
                          HOST
                        </span>
                      ) : isHost ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleMuteParticipant(`acc-${p.accountId}`, false)
                          }
                          className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <MicOff className="w-3 h-3" />
                          <span>Cắt Mic</span>
                        </button>
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
