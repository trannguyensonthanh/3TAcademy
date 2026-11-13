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
} from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useAcademy } from '../context/AcademyContext';
import { AvatarWithFallback } from '../components/BotanicalStickers';
import { SessionVideoPlayer } from '../components/SessionVideoPlayer';
import {
  learningApi,
  type LiveHandRaiseItem,
  type LiveParticipantItem,
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
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const guestVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveSelfVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStageVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStageVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);

  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [micOn, setMicOn] = useState<boolean>(false);
  const [camOn, setCamOn] = useState<boolean>(false);
  const [screenSharing, setScreenSharing] = useState<boolean>(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  // LiveKit remote stream tracking
  const [livekitConnected, setLivekitConnected] = useState<boolean>(false);
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState<boolean>(false);

  // Stage mode toggle when recording video exists alongside live stage
  const [stageViewMode, setStageViewMode] = useState<'STAGE' | 'VIDEO'>('STAGE');

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

  // Host broadcast controls (for INSTRUCTOR / ADMIN)
  const [hostSlideDraft, setHostSlideDraft] = useState<string>('');
  const [hostNoteDraft, setHostNoteDraft] = useState<string>('');
  const [replayUrlDraft, setReplayUrlDraft] = useState<string>('');
  const [hostActionFeedback, setHostActionFeedback] = useState<string | null>(null);
  const [isUpdatingHostState, setIsUpdatingHostState] = useState<boolean>(false);

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

  // Attach local webcam stream whenever video elements mount
  useEffect(() => {
    if (webcamActive && localMediaStreamRef.current) {
      if (guestVideoRef.current) {
        guestVideoRef.current.srcObject = localMediaStreamRef.current;
      }
      if (liveSelfVideoRef.current) {
        liveSelfVideoRef.current.srcObject = localMediaStreamRef.current;
      }
    }
  }, [webcamActive, guestMode, roomData]);

  // Attach local screen share stream whenever screenSharing toggles
  useEffect(() => {
    if (screenSharing && screenShareStreamRef.current && screenStageVideoRef.current) {
      screenStageVideoRef.current.srcObject = screenShareStreamRef.current;
    }
  }, [screenSharing, stageViewMode]);

  // Cleanup all streams & LiveKit room on unmount
  useEffect(() => {
    return () => {
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
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
    if (!lkInfo?.enabled || !lkInfo.serverUrl || !lkInfo.token) {
      setLivekitConnected(false);
      return;
    }

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    livekitRoomRef.current = room;

    const attachRemoteTrack = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && remoteStageVideoRef.current) {
        track.attach(remoteStageVideoRef.current);
        setHasRemoteVideoTrack(true);
      } else if (track.kind === Track.Kind.Audio && remoteAudioContainerRef.current) {
        const audioEl = track.attach();
        remoteAudioContainerRef.current.appendChild(audioEl);
      }
    };

    room.on(RoomEvent.TrackSubscribed, attachRemoteTrack);
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
      if (track.kind === Track.Kind.Video) {
        setHasRemoteVideoTrack(false);
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        setLivekitConnected(false);
        setHasRemoteVideoTrack(false);
      }
    });

    room
      .connect(lkInfo.serverUrl, lkInfo.token)
      .then(() => {
        if (!cancelled) {
          setLivekitConnected(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLivekitConnected(false);
        }
      });

    return () => {
      cancelled = true;
      void room.disconnect();
      livekitRoomRef.current = null;
    };
  }, [roomData?.livekit, guestMeta?.livekit, joinedAsVerifiedGuest]);

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

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, [roomData?.session.id, spawnFloatingReaction]);

  // Real browser camera & microphone control
  const handleToggleCamera = async () => {
    if (localMediaStreamRef.current && webcamActive) {
      const nextCam = !camOn;
      localMediaStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nextCam;
      });
      setCamOn(nextCam);
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setCameraEnabled(nextCam).catch(() => {});
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Trình duyệt hiện tại chưa hỗ trợ API Camera/Mic.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localMediaStreamRef.current = stream;
      setWebcamActive(true);
      setCamOn(true);
      setMicOn(true);
      setMediaNotice('Đã bật Camera & Micro trực tiếp trên trình duyệt.');
      if (guestVideoRef.current) guestVideoRef.current.srcObject = stream;
      if (liveSelfVideoRef.current) liveSelfVideoRef.current.srcObject = stream;
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setCameraEnabled(true).catch(() => {});
        await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }
    } catch {
      setMediaNotice('Chưa cấp quyền Camera/Micro hoặc không tìm thấy thiết bị vật lý.');
    }
  };

  const handleToggleMic = async () => {
    if (localMediaStreamRef.current) {
      const nextMic = !micOn;
      localMediaStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = nextMic;
      });
      setMicOn(nextMic);
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(nextMic).catch(() => {});
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Trình duyệt hiện tại không hỗ trợ Micro.');
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localMediaStreamRef.current = audioStream;
      setMicOn(true);
      setMediaNotice('Đã bật Micro thành công.');
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(true).catch(() => {});
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
      setScreenSharing(false);
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setScreenShareEnabled(false).catch(() => {});
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setMediaNotice('Trình duyệt hiện tại không hỗ trợ chia sẻ màn hình (getDisplayMedia).');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenShareStreamRef.current = displayStream;
      setScreenSharing(true);
      setStageViewMode('STAGE');
      setMediaNotice('Đang chia sẻ màn hình trực tiếp lên sân khấu.');

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setScreenSharing(false);
          screenShareStreamRef.current = null;
        };
      }
      if (livekitRoomRef.current && livekitConnected) {
        await livekitRoomRef.current.localParticipant.setScreenShareEnabled(true).catch(() => {});
      }
    } catch {
      setMediaNotice('Bạn đã hủy chia sẻ màn hình hoặc trình duyệt từ chối quyền.');
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

          {/* MAIN STAGE: Video Mode OR Live WebRTC / Topic Stage */}
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
                  className="bottom-20 absolute px-3 py-1 rounded-lg bg-black/70 border border-white/20 text-xs font-bold text-white animate-bounce pointer-events-none z-20"
                >
                  {r.label}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-xl relative">
              <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-emerald-400 font-semibold">
                  {screenSharing
                    ? `Đang chia sẻ màn hình trực tiếp — ${selfName}`
                    : hasRemoteVideoTrack
                      ? `Luồng phát trực tiếp từ ${hostName}`
                      : `Bảng trình bày trực tuyến · ${hostName}`}
                </span>
                {runtimeState.hostBroadcast.activeSlideLabel && (
                  <span className="font-mono text-[11px] text-slate-300">
                    {runtimeState.hostBroadcast.activeSlideLabel}
                  </span>
                )}
              </div>

              <div className="p-5 sm:p-6 relative min-h-[340px] flex flex-col justify-between space-y-4">
                {screenSharing ? (
                  <video
                    ref={screenShareStreamRef.current ? screenStageVideoRef : undefined}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-contain"
                  />
                ) : hasRemoteVideoTrack ? (
                  <video
                    ref={remoteStageVideoRef}
                    autoPlay
                    playsInline
                    className="w-full aspect-video rounded-xl bg-black border border-[#10B981]/60 object-contain"
                  />
                ) : (
                  <>
                    {/* Hidden element ready to receive remote LiveKit video if it arrives */}
                    <video ref={remoteStageVideoRef} autoPlay playsInline className="hidden" />
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs text-emerald-400 font-bold">
                          BUỔI {String(sessionOrder).padStart(2, '0')} · {sessionTitle}
                        </span>
                        {playableVideoUrl && (
                          <button
                            type="button"
                            onClick={() => setStageViewMode('VIDEO')}
                            className="px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                          >
                            Phát Video Bài Giảng →
                          </button>
                        )}
                      </div>

                      {runtimeState.hostBroadcast.liveTopicNote && (
                        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-[#10B981]/50 text-xs sm:text-sm text-emerald-100">
                          <span className="font-bold text-emerald-300">Chủ đề đang giảng: </span>
                          {runtimeState.hostBroadcast.liveTopicNote}
                        </div>
                      )}

                      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                        <div className="text-xs font-mono font-bold text-slate-400">
                          NỘI DUNG TRỌNG TÂM BUỔI HỌC
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                          {activeSession?.aiSummaryMd ||
                            'Giảng viên đang chuẩn bị trình chiếu nội dung buổi học. Bạn có thể đặt câu hỏi hoặc bật chia sẻ màn hình / phát video bài giảng.'}
                        </p>
                      </div>

                      {roomData?.transcript && roomData.transcript.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {roomData.transcript.slice(0, 4).map((cue) => (
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
                  </>
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
                    {runtimeState.raisedHands.length > 0
                      ? `${runtimeState.raisedHands.length} thành viên đang giơ tay phát biểu`
                      : 'Chưa có thành viên nào giơ tay phát biểu'}
                  </span>
                  {handRaised && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold">
                      <Hand className="w-3.5 h-3.5" />
                      Bạn đang giơ tay xin phát biểu
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Camera Cards: Host + Local Student/Guest */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-xl bg-[#111A15] border-2 border-[#10B981] flex items-center gap-3">
              <AvatarWithFallback
                name={hostName}
                className="w-11 h-11 rounded-full shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{hostName}</div>
                <div className="text-[11px] text-emerald-400 font-semibold">
                  Giảng viên phụ trách · {sessionStatus === 'LIVE' ? 'Đang điều phối lớp' : 'Chủ phòng'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#111A15] border border-[#1E2D24] space-y-2">
              {webcamActive && camOn ? (
                <video
                  ref={liveSelfVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-24 rounded-lg object-cover border border-[#10B981]"
                />
              ) : (
                <div className="flex items-center gap-3">
                  <AvatarWithFallback name={selfName} className="w-11 h-11 rounded-full shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{selfName}</div>
                    <div className="text-[11px] text-emerald-300 truncate">
                      {isHost ? 'Giảng viên / Chủ phòng' : joinedAsVerifiedGuest ? 'Diễn giả khách mời' : 'Học viên'} · Mic {micOn ? 'Bật' : 'Tắt'} · Cam {camOn ? 'Bật' : 'Tắt'}
                    </div>
                  </div>
                </div>
              )}
              {mediaNotice && (
                <div className="text-[11px] text-emerald-300 truncate">{mediaNotice}</div>
              )}
            </div>
          </div>

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
                <div className="text-xs font-bold text-slate-300">
                  Danh sách lớp học ({participantList.length})
                </div>
                {participantList.map((p) => (
                  <div
                    key={p.accountId}
                    className="p-2.5 rounded-xl bg-[#090F0C] border border-[#1E2D24] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarWithFallback name={p.fullName} className="w-7 h-7 rounded-full shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{p.fullName}</div>
                        <div className="text-[11px] text-slate-400">{p.roleLabel}</div>
                      </div>
                    </div>
                    {p.isHost && (
                      <span className="font-mono text-[10px] font-bold text-emerald-400 shrink-0">
                        HOST
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
