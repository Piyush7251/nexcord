import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  CornerUpLeft,
  Download,
  Edit3,
  Gamepad2,
  Hash,
  Headphones,
  ImagePlus,
  Maximize2,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneCall,
  PhoneOff,
  Pin,
  PinOff,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  Shield,
  Smartphone,
  Smile,
  Sparkles,
  Trash2,
  Tv,
  Upload,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  CallSessionState,
  Channel,
  ChatMessage,
  DirectCallSession,
  LiveHypeBurst,
  NexconnConfig,
  PinnedMessageSnapshot,
  QuickChatPreset,
  ReplyReference,
  SdkLogEntry,
  Server,
  User,
} from './types';
import { api, getApiBase, getApkDownloadUrl, getSessionToken, setSessionToken } from './services/api';
import { nexconn, targetKeyOf } from './services/nexconn';
import type { ChannelTarget, SdkConnectionMode } from './services/nexconn';
import { playRingtonePulse } from './services/soundboard';
import { Avatar } from './components/Avatar';
import { QuickChatBar } from './components/QuickChatBar';
import { LiveStreamStage } from './components/LiveStreamStage';
import { IncomingCallModal, PersonalCallBanner, VoiceCallStage } from './components/VoiceCallStage';
import {
  AuthScreen,
  CreateChannelModal,
  CreateServerModal,
  QuickSwitcherModal,
  SdkConsoleModal,
  ServerSettingsModal,
  UserProfileModal,
  UserSettingsModal,
} from './components/Modals';
import { AdminPanel } from './components/AdminPanel';
import { MediaPickerDrawer } from './components/MediaPickerDrawer';
import type { GifItem, StickerItem } from './data/mediaLibrary';
import './App.css';

const QUICK_EMOJIS = [
  '🔥', '❤️', '😂', '⚡', '👑', '👍', '🎯', '🚀',
  '🎉', '💀', '👀', '💯', '👏', '✨', '💎', '🏆',
  '🎮', '⚔️', '🥺', '😭', '😎', '🥳', '🙌', '💪'
];

const INITIAL_CALL: CallSessionState = {
  status: 'idle',
  callId: '',
  isGroup: false,
  mediaType: 'audio',
  peerIds: [],
  micMuted: false,
  cameraEnabled: false,
  deafened: false,
  screenSharing: false,
  gameAudioMode: false,
  gameAudioVolume: 1.5,
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (isSameCalendarDay(ts, now.getTime())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(ts, yesterday.getTime())) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function getEmojiOnlyCategory(text: string): 'single' | 'multiple' | 'none' {
  if (!text) return 'none';
  const trimmed = text.trim();
  if (!trimmed) return 'none';

  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = [...segmenter.segment(trimmed)].filter((s) => s.segment.trim().length > 0);
    if (segments.length === 0) return 'none';

    const emojiGraphemeRegex = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\p{Emoji_Modifier}]+$/u;
    const isAllEmojis = segments.every(
      (s) => emojiGraphemeRegex.test(s.segment) || /^\p{Regional_Indicator}{2}$/u.test(s.segment)
    );

    if (!isAllEmojis) return 'none';
    if (segments.length === 1) return 'single';
    if (segments.length <= 8) return 'multiple';
    return 'none';
  } catch {
    return 'none';
  }
}

function renderMessageText(text: string): React.ReactNode {
  // Simple lightweight **bold** and #channel highlight
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function downloadFile(dataUrl: string, filename: string) {
  try {
    if (dataUrl.startsWith('data:')) {
      const parts = dataUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'downloaded-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'downloaded-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.open(dataUrl, '_blank');
  }
}

export function App() {
  const [me, setMe] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [incomingReq, setIncomingReq] = useState<string[]>([]);
  const [outgoingReq, setOutgoingReq] = useState<string[]>([]);
  const [dms, setDms] = useState<string[]>([]);
  const [myVoice, setMyVoice] = useState<{ serverId: string; channelId: string } | null>(null);

  // Navigation
  const [viewMode, setViewMode] = useState<'home' | 'server'>('home');
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [activeDmUserId, setActiveDmUserId] = useState<string>('');
  const [friendsTab, setFriendsTab] = useState<'online' | 'all' | 'contacts' | 'pending' | 'add'>('online');
  const [contactMatches, setContactMatches] = useState<Array<{
    user: User;
    contactName: string;
    phone: string;
    isFriend: boolean;
    hasPendingOutgoing: boolean;
    hasPendingIncoming: boolean;
    isOnline?: boolean;
  }>>([]);
  const [contactInput, setContactInput] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<string | null>(null);
  const [dialPhone, setDialPhone] = useState('');
  const [dialFeedback, setDialFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [showMemberList, setShowMemberList] = useState(true);
  const [showPinsDrawer, setShowPinsDrawer] = useState(false);
  const [dmPins, setDmPins] = useState<Record<string, PinnedMessageSnapshot[]>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; name: string } | null>(null);

  // Chat state
  const [messagesByKey, setMessagesByKey] = useState<Record<string, ChatMessage[]>>({});
  const [unreadByKey, setUnreadByKey] = useState<Record<string, number>>({});
  const [typingByKey, setTypingByKey] = useState<Record<string, Record<string, { name: string; at: number }>>>({});
  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyReference | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [emojiMenuMsgId, setEmojiMenuMsgId] = useState<string | null>(null);
  const [showComposerEmoji, setShowComposerEmoji] = useState(false);

  // Friends add input
  const [addFriendInput, setAddFriendInput] = useState('');
  const [addFriendFeedback, setAddFriendFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Live Hype Bursts
  const [hypeBursts, setHypeBursts] = useState<LiveHypeBurst[]>([]);

  // SDK & Config
  const [config, setConfig] = useState<NexconnConfig>({ appKey: '', areaCode: 2, apiHost: 'api.sg-light-api.com', configured: false });
  const [sdkMode, setSdkMode] = useState<SdkConnectionMode>('idle');
  const [sdkDetail, setSdkDetail] = useState('Initializing...');
  const [sdkLogs, setSdkLogs] = useState<SdkLogEntry[]>([]);

  // Voice / Call
  const [callState, setCallState] = useState<CallSessionState>(INITIAL_CALL);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; callerId: string; isVideo: boolean } | null>(null);
  const [activeDirectCall, setActiveDirectCall] = useState<DirectCallSession | null>(null);
  const [directCallExpanded, setDirectCallExpanded] = useState(false);

  // Modals
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [createServerTab, setCreateServerTab] = useState<'create' | 'join'>('create');
  const [createChannelCat, setCreateChannelCat] = useState<string | null | undefined>(undefined);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [friendFilter, setFriendFilter] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const activeTargetKeyRef = useRef('');
  const myVoiceRef = useRef<{ serverId: string; channelId: string } | null>(null);
  const meRef = useRef<User | null>(null);

  useEffect(() => {
    myVoiceRef.current = myVoice;
  }, [myVoice]);

  useEffect(() => {
    meRef.current = me;
    if (me?.id) {
      nexconn.setCurrentUser(me.id);
    }
  }, [me]);

  const maybeConnectToPeer = useCallback((peerId: string, callId: string) => {
    const myId = meRef.current?.id;
    if (!myId || !peerId || myId === peerId) return;
    nexconn.connectToPeer(peerId, callId).catch(() => {});
  }, []);

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) || null,
    [servers, activeServerId],
  );
  const activeChannel = useMemo(
    () => activeServer?.channels.find((c) => c.id === activeChannelId) || null,
    [activeServer, activeChannelId],
  );

  const isLiveStageActive = viewMode === 'server' && activeChannel?.type === 'live';

  // Live stage viewer presence tracking
  useEffect(() => {
    if (!me || viewMode !== 'server' || !activeServer || !activeChannel || activeChannel.type !== 'live') {
      return;
    }
    const srvId = activeServer.id;
    const chId = activeChannel.id;
    api.joinLive(srvId, chId).catch(() => {});

    return () => {
      api.leaveLive(srvId, chId).catch(() => {});
    };
  }, [me, viewMode, activeServer?.id, activeChannel?.id, activeChannel?.type]);

  // WebRTC Signal Polling Fallback (ensures signals are never lost even if SSE buffers behind proxy/Cloudflare)
  useEffect(() => {
    if (!me) return;
    const isCallActive =
      callState.status === 'connected' ||
      callState.status === 'calling' ||
      !!activeDirectCall ||
      !!myVoice ||
      isLiveStageActive;
    if (!isCallActive) return;

    const timer = setInterval(async () => {
      try {
        const res = await api.getWebRtcSignals();
        if (res?.signals && res.signals.length > 0) {
          for (const s of res.signals) {
            nexconn.handleWebRtcSignal(s.from, s.signal, s.callId);
          }
        }
      } catch {}
    }, 250);

    return () => clearInterval(timer);
  }, [me, callState.status, activeDirectCall, myVoice, isLiveStageActive]);

  // Self-healing WebRTC watchdog (reconnects stalled or failed peer connections)
  useEffect(() => {
    if (!me || (!myVoice && callState.status !== 'connected')) return;
    const callId = nexconn.getCurrentCallId() || callState.callId;
    if (!callId) return;

    const timer = setInterval(() => {
      const myId = meRef.current?.id;
      if (!myId) return;
      callState.peerIds.forEach((pid) => {
        if (pid !== myId && nexconn.getPeerConnectionState(pid) !== 'connected') {
          // connectToPeer is idempotent: it only (re)negotiates when the link is missing, stalled or failed
          nexconn.connectToPeer(pid, callId).catch(() => {});
        }
      });
    }, 2500);

    return () => clearInterval(timer);
  }, [me, myVoice, callState.status, callState.callId, callState.peerIds]);

  // Ringtone pulse while a 1:1 direct call is ringing
  useEffect(() => {
    if (!me || !activeDirectCall || activeDirectCall.status !== 'ringing') return;
    const kind = activeDirectCall.callerId === me.id ? 'outgoing' : 'incoming';
    playRingtonePulse(kind);
    const timer = setInterval(() => playRingtonePulse(kind), 2600);
    return () => clearInterval(timer);
  }, [me, activeDirectCall?.callId, activeDirectCall?.status, activeDirectCall?.callerId]);

  const activeTarget: ChannelTarget | null = useMemo(() => {
    if (!me) return null;
    if (viewMode === 'home') {
      if (!activeDmUserId) return null;
      return { kind: 'dm', userId: activeDmUserId, myUserId: me.id };
    }
    if (!activeServer || !activeChannel || activeChannel.type === 'voice') return null;
    if (activeChannel.type === 'live') {
      return {
        kind: 'live',
        serverId: activeServer.id,
        channelId: activeChannel.id,
        openChannelId: activeChannel.openChannelId || activeChannel.id,
      };
    }
    return { kind: 'community', serverId: activeServer.id, channelId: activeChannel.id };
  }, [me, viewMode, activeDmUserId, activeServer, activeChannel]);

  const activeTargetKey = activeTarget ? targetKeyOf(activeTarget) : '';
  activeTargetKeyRef.current = activeTargetKey;

  const activeMessages = useMemo(() => {
    const list = messagesByKey[activeTargetKey] || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter((m) => m.text.toLowerCase().includes(q));
  }, [messagesByKey, activeTargetKey, searchQuery]);

  const currentPins: PinnedMessageSnapshot[] = useMemo(() => {
    if (activeServer && activeChannel && activeServer.pins) {
      return activeServer.pins[activeChannel.id] || [];
    }
    if (viewMode === 'home' && activeTargetKey && dmPins) {
      return dmPins[activeTargetKey] || [];
    }
    return [];
  }, [activeServer, activeChannel, viewMode, activeTargetKey, dmPins]);

  // ---------------------------------------------------------------- sync & boot
  const runSync = useCallback(async () => {
    const data = await api.sync();
    setMe(data.me);
    if (data.me) nexconn.setCurrentUser(data.me.id);
    setServers(data.servers);
    setUsers(data.users);
    setFriends(data.friends);
    setIncomingReq(data.incoming);
    setOutgoingReq(data.outgoing);
    setDms(data.dms);
    setDmPins(data.dmPins || {});
    setMyVoice(data.myVoice);

    const dc = data.activeDirectCall || null;
    setActiveDirectCall(dc);
    if (dc) {
      setUsers((prev) => {
        const next = { ...prev };
        if (dc.caller) next[dc.caller.id] = dc.caller;
        if (dc.callee) next[dc.callee.id] = dc.callee;
        return next;
      });
      if (dc.status === 'connected' && data.me) {
        const peerId = dc.callerId === data.me.id ? dc.calleeId : dc.callerId;
        const peerUser = dc.callerId === data.me.id ? dc.callee : dc.caller;
        nexconn.setCurrentCallId(dc.callId);
        if (!nexconn.hasPeer(peerId)) {
          maybeConnectToPeer(peerId, dc.callId);
        }
        setCallState((prev) => {
          if (prev.callId === dc.callId && prev.status === 'connected') return prev;
          return {
            ...prev,
            status: 'connected',
            callId: dc.callId,
            isGroup: false,
            mediaType: dc.mediaType,
            peerIds: [peerId],
            targetLabel: peerUser?.displayName || dc.contactLabel || peerId,
            startedAt: prev.startedAt || dc.answeredAt || Date.now(),
          };
        });
      }
    } else {
      setDirectCallExpanded(false);
      setCallState((prev) => {
        if (prev.callId.startsWith('dc_')) {
          nexconn.endCall(prev.callId).catch(() => {});
          return INITIAL_CALL;
        }
        return prev;
      });
    }

    if (data.myVoice) {
      const srv = data.servers.find((s) => s.id === data.myVoice?.serverId);
      if (srv) {
        const vMembers = srv.voiceStates[data.myVoice.channelId] || [];
        const peerIds = vMembers.map((v) => v.userId).filter((id) => id !== data.me?.id);
        setCallState((prev) => {
          if (prev.status === 'connected') {
            return { ...prev, peerIds };
          }
          return prev;
        });
        peerIds.forEach((pid) => {
          if (!nexconn.hasPeer(pid)) {
            maybeConnectToPeer(pid, nexconn.getCurrentCallId());
          }
        });
      }
    }

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlSrv = urlParams?.get('serverId');
    const urlCh = urlParams?.get('channelId');

    setActiveServerId((prev) => {
      if (urlSrv && data.servers.some((s) => s.id === urlSrv)) return urlSrv;
      if (prev && data.servers.some((s) => s.id === prev)) return prev;
      return data.servers[0]?.id || '';
    });
    setActiveChannelId((prev) => {
      const targetSrv = data.servers.find((s) => s.id === (urlSrv || activeServerId)) || data.servers[0];
      if (!targetSrv) return '';
      if (urlCh && targetSrv.channels.some((c) => c.id === urlCh)) return urlCh;
      if (prev && targetSrv.channels.some((c) => c.id === prev)) return prev;
      const squad = targetSrv.channels.find((c) => c.name === 'squad-chat-room');
      return squad?.id || targetSrv.channels.find((c) => c.type !== 'voice')?.id || targetSrv.channels[0]?.id || '';
    });
    if (urlSrv || urlCh) {
      setViewMode('server');
    }
  }, [activeServerId]);

  const bootstrapSession = useCallback(
    async (nexconnToken: string) => {
      const cfg = await api.getConfig().catch(() => ({ appKey: '', areaCode: 2, apiHost: 'api.sg-light-api.com', configured: false }));
      setConfig(cfg);
      await nexconn.connect(nexconnToken, cfg.appKey, cfg.areaCode);
      const rtcConfig = await api.getWebRtcConfig().catch(() => null);
      if (rtcConfig?.iceServers?.length) nexconn.setIceServers(rtcConfig.iceServers);
      await runSync();
    },
    [runSync],
  );

  // Wire Nexconn SDK callbacks
  useEffect(() => {
    nexconn.setCallbacks({
      onStatusChange: (mode, detail) => {
        setSdkMode(mode);
        setSdkDetail(detail);
      },
      onLog: (entry) => {
        setSdkLogs((prev) => [entry, ...prev].slice(0, 80));
      },
      onSdkMessage: (tKey, msg) => {
        setMessagesByKey((prev) => {
          const cur = prev[tKey] || [];
          if (cur.some((m) => m.id === msg.id || (msg.nexconnMessageId && m.nexconnMessageId === msg.nexconnMessageId))) {
            return prev;
          }
          return { ...prev, [tKey]: [...cur, msg] };
        });
      },
      onIncomingCall: (session) => {
        setIncomingCall({
          callId: session.getCallId(),
          callerId: session.getCallerUserId(),
          isVideo: session.getMediaType() === 1,
        });
      },
      onCallConnected: (session) => {
        setCallState((prev) => ({
          ...prev,
          status: 'connected',
          callId: session.getCallId(),
          startedAt: prev.startedAt || Date.now(),
        }));
      },
      onCallEnded: () => {
        setIncomingCall(null);
        setCallState(INITIAL_CALL);
      },
      onScreenShareEnded: async () => {
        setCallState((prev) => ({ ...prev, screenSharing: false }));
        await api.updateVoiceState({ streaming: false }).catch(() => {});
      },
    });
  }, []);

  // Unlock mobile browser Web Audio on first user interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      nexconn.unlockAudio();
    };
    window.addEventListener('click', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    window.addEventListener('touchend', handleFirstInteraction, { passive: true });
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('touchend', handleFirstInteraction);
      window.removeEventListener('pointerdown', handleFirstInteraction);
    };
  }, []);

  // Check existing session on startup
  useEffect(() => {
    (async () => {
      const tok = getSessionToken();
      if (!tok) {
        setAuthReady(true);
        return;
      }
      try {
        const res = await api.me();
        setMe(res.user);
        try {
          localStorage.setItem('nexcord_cached_user', JSON.stringify(res.user));
        } catch {}
        await bootstrapSession(res.nexconnToken);
      } catch (err: any) {
        // ONLY clear session if server explicitly rejected with 401 Unauthorized
        if (err?.status === 401) {
          setSessionToken('');
          try {
            localStorage.removeItem('nexcord_cached_user');
          } catch {}
        } else {
          console.warn('Network issue during startup; preserving session token & loading cached state:', err);
          try {
            const cached = localStorage.getItem('nexcord_cached_user');
            if (cached) {
              setMe(JSON.parse(cached));
            }
          } catch {}
        }
      } finally {
        setAuthReady(true);
      }
    })();
  }, [bootstrapSession]);

  // SSE Realtime Subscription
  useEffect(() => {
    if (!me) return;
    const tok = getSessionToken();
    const url = `${getApiBase()}/api/events?token=${encodeURIComponent(tok)}`;
    const es = new EventSource(url);

    es.addEventListener('sync', () => {
      runSync().catch(() => {});
    });
    es.addEventListener('presence', () => {
      runSync().catch(() => {});
    });
    es.addEventListener('config', (e: MessageEvent) => {
      try {
        setConfig(JSON.parse(e.data));
      } catch {
        // ignore
      }
    });

    es.addEventListener('webrtc-signal', (e: MessageEvent) => {
      try {
        const { from, signal, callId } = JSON.parse(e.data);
        nexconn.handleWebRtcSignal(from, signal, callId);
      } catch (err) {
        console.warn('webrtc-signal parse error', err);
      }
    });
    es.addEventListener('direct-call', (e: MessageEvent) => {
      try {
        const call = JSON.parse(e.data) as DirectCallSession;
        setActiveDirectCall(call);
        setUsers((prev) => {
          const next = { ...prev };
          if (call.caller) next[call.caller.id] = call.caller;
          if (call.callee) next[call.callee.id] = call.callee;
          return next;
        });
        if (call.status === 'connected') {
          const myId = meRef.current?.id || '';
          const peerId = call.callerId === myId ? call.calleeId : call.callerId;
          const peerUser = call.callerId === myId ? call.callee : call.caller;
          nexconn.setCurrentCallId(call.callId);
          nexconn.connectToPeer(peerId, call.callId).catch(() => {});
          setCallState((prev) => ({
            ...prev,
            status: 'connected',
            callId: call.callId,
            isGroup: false,
            mediaType: call.mediaType,
            peerIds: [peerId],
            targetLabel: peerUser?.displayName || call.contactLabel || peerId,
            startedAt: prev.startedAt || call.answeredAt || Date.now(),
            cameraEnabled: call.mediaType === 'video' ? prev.cameraEnabled : false,
          }));
        }
      } catch {}
    });
    es.addEventListener('direct-call-ended', (e: MessageEvent) => {
      try {
        const { callId } = JSON.parse(e.data);
        setActiveDirectCall((prev) => (prev && (!callId || prev.callId === callId) ? null : prev));
        setIncomingCall((prev) => (prev && (!callId || prev.callId === callId) ? null : prev));
        setDirectCallExpanded(false);
        setCallState((prev) => {
          if (!callId || prev.callId === callId || prev.callId.startsWith('dc_')) {
            nexconn.endCall(prev.callId).catch(() => {});
            return INITIAL_CALL;
          }
          return prev;
        });
      } catch {}
    });
    es.addEventListener('live-viewers', (e: MessageEvent) => {
      try {
        const { channelId, viewers } = JSON.parse(e.data);
        setServers((prev) =>
          prev.map((s) => ({
            ...s,
            channels: s.channels.map((ch) =>
              ch.id === channelId
                ? {
                    ...ch,
                    liveViewers: viewers,
                    live: ch.live ? { ...ch.live, viewers } : ch.live,
                  }
                : ch
            ),
          }))
        );
      } catch {}
    });
    es.addEventListener('voice-join', (e: MessageEvent) => {
      try {
        const { userId, serverId, channelId, callId } = JSON.parse(e.data);
        if (
          myVoiceRef.current &&
          myVoiceRef.current.serverId === serverId &&
          myVoiceRef.current.channelId === channelId
        ) {
          setCallState((prev) => {
            const peers = Array.from(new Set([...prev.peerIds, userId]));
            return { ...prev, peerIds: peers };
          });
          maybeConnectToPeer(userId, callId);
        }
      } catch {}
    });
    es.addEventListener('voice-leave', (e: MessageEvent) => {
      try {
        const { userId } = JSON.parse(e.data);
        nexconn.closePeer(userId);
        setCallState((prev) => ({
          ...prev,
          peerIds: prev.peerIds.filter((id) => id !== userId),
        }));
      } catch {}
    });
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const { targetKey, message } = JSON.parse(e.data) as { targetKey: string; message: ChatMessage };
        setMessagesByKey((prev) => {
          const cur = prev[targetKey] || [];
          if (cur.some((m) => m.id === message.id)) return prev;
          return { ...prev, [targetKey]: [...cur, message] };
        });
        if (targetKey !== activeTargetKeyRef.current && message.senderId !== me.id) {
          setUnreadByKey((prev) => ({ ...prev, [targetKey]: (prev[targetKey] || 0) + 1 }));
        }
      } catch {
        // ignore
      }
    });
    es.addEventListener('broadcast', (e: MessageEvent) => {
      try {
        const { title, message } = JSON.parse(e.data);
        alert(`📢 ${title}\n\n${message}`);
      } catch {
        // ignore
      }
    });
    es.addEventListener('message-update', (e: MessageEvent) => {
      try {
        const { targetKey, message } = JSON.parse(e.data) as { targetKey: string; message: ChatMessage };
        setMessagesByKey((prev) => ({
          ...prev,
          [targetKey]: (prev[targetKey] || []).map((m) => (m.id === message.id ? message : m)),
        }));
      } catch {
        // ignore
      }
    });
    es.addEventListener('message-delete', (e: MessageEvent) => {
      try {
        const { targetKey, messageId } = JSON.parse(e.data) as { targetKey: string; messageId: string };
        setMessagesByKey((prev) => ({
          ...prev,
          [targetKey]: (prev[targetKey] || []).filter((m) => m.id !== messageId),
        }));
      } catch {
        // ignore
      }
    });
    es.addEventListener('typing', (e: MessageEvent) => {
      try {
        const { targetKey, userId, displayName } = JSON.parse(e.data);
        setTypingByKey((prev) => ({
          ...prev,
          [targetKey]: { ...(prev[targetKey] || {}), [userId]: { name: displayName, at: Date.now() } },
        }));
      } catch {
        // ignore
      }
    });
    es.addEventListener('live-hype', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const burst: LiveHypeBurst = {
          id: `${Date.now()}_${Math.random()}`,
          emoji: payload.emoji,
          text: payload.text,
          userId: payload.userId,
          displayName: payload.displayName,
          x: 15 + Math.floor(Math.random() * 70),
        };
        setHypeBursts((prev) => [...prev.slice(-18), burst]);
        setTimeout(() => {
          setHypeBursts((prev) => prev.filter((b) => b.id !== burst.id));
        }, 2600);
      } catch {
        // ignore
      }
    });

    return () => es.close();
  }, [me, runSync]);

  // Prune stale typing indicators
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 3500;
      setTypingByKey((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [k, map] of Object.entries(prev)) {
          const kept: Record<string, { name: string; at: number }> = {};
          for (const [uid, info] of Object.entries(map)) {
            if (info.at > cutoff) kept[uid] = info;
            else changed = true;
          }
          next[k] = kept;
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Check URL hash for direct admin routing
  useEffect(() => {
    if (me?.isAdmin && (window.location.hash === '#admin' || window.location.hash === '#admin-panel')) {
      setShowAdminModal(true);
    }
  }, [me]);

  // Load history when switching channels or DMs
  useEffect(() => {
    if (!activeTarget) return;
    const tKey = targetKeyOf(activeTarget);
    setUnreadByKey((prev) => {
      if (!prev[tKey]) return prev;
      const next = { ...prev };
      delete next[tKey];
      return next;
    });

    let cancelled = false;
    (async () => {
      if (activeTarget.kind === 'live') {
        await nexconn.enterLiveChannel(activeTarget.serverId, activeTarget.channelId, activeTarget.openChannelId);
      }
      const history = await nexconn.loadHistory(activeTarget);
      if (!cancelled) {
        setMessagesByKey((prev) => ({ ...prev, [tKey]: history }));
      }
    })();

    return () => {
      cancelled = true;
      if (activeTarget.kind === 'live') {
        nexconn.exitLiveChannel(activeTarget.openChannelId);
      }
    };
  }, [activeTarget]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 260) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollBottom(false);
    }
  }, [activeMessages.length]);

  useEffect(() => {
    setShowScrollBottom(false);
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [activeTargetKey]);

  // Ctrl+K Quick Switcher & Escape dismissals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      } else if (e.key === 'Escape') {
        if (fullscreenImage) setFullscreenImage(null);
        else if (emojiMenuMsgId) setEmojiMenuMsgId(null);
        else if (showServerMenu) setShowServerMenu(false);
        else if (replyTo) setReplyTo(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenImage, emojiMenuMsgId, showServerMenu, replyTo]);

  // ---------------------------------------------------------------- Auth actions
  const handleLogin = async (username: string, password: string) => {
    const res = await api.login(username, password);
    setSessionToken(res.session);
    setMe(res.user);
    await bootstrapSession(res.nexconnToken);
  };

  const handleRegister = async (username: string, password: string, displayName: string) => {
    const res = await api.register(username, password, displayName);
    setSessionToken(res.session);
    setMe(res.user);
    await bootstrapSession(res.nexconnToken);
  };

  const handleVerifyOtp = async (phone: string, otp: string, displayName?: string) => {
    const res = await api.verifyOtp(phone, otp, displayName);
    setSessionToken(res.session);
    setMe(res.user);
    await bootstrapSession(res.nexconnToken);
  };

  const handleFirebaseLogin = async (phone: string, idToken: string, displayName?: string) => {
    const res = await api.firebaseLogin({ phone, idToken, displayName });
    setSessionToken(res.session);
    setMe(res.user);
    await bootstrapSession(res.nexconnToken);
  };

  const handleDemoLogin = async (displayName?: string) => {
    const res = await api.demoLogin(displayName);
    setSessionToken(res.session);
    setMe(res.user);
    await bootstrapSession(res.nexconnToken);
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    await nexconn.disconnect();
    setSessionToken('');
    setMe(null);
    setServers([]);
    setShowUserSettings(false);
  };

  // ---------------------------------------------------------------- Navigation actions
  const selectServer = (srv: Server) => {
    setViewMode('server');
    setActiveServerId(srv.id);
    const squad = srv.channels.find((c) => c.name === 'squad-chat-room');
    const first = squad || srv.channels.find((c) => c.type !== 'voice') || srv.channels[0];
    setActiveChannelId(first?.id || '');
    setShowPinsDrawer(false);
    setMobileNavOpen(false);
  };

  const selectChannel = async (srv: Server, ch: Channel) => {
    setViewMode('server');
    setActiveServerId(srv.id);
    setActiveChannelId(ch.id);
    setShowPinsDrawer(false);
    setMobileNavOpen(false);
    if (ch.type === 'voice') {
      await joinVoiceChannel(srv, ch);
    }
  };

  const openDm = async (userId: string) => {
    await api.openDm(userId);
    await runSync();
    setViewMode('home');
    setActiveDmUserId(userId);
    setMobileNavOpen(false);
  };

  // ---------------------------------------------------------------- Chat actions
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeTarget || !composerText.trim()) return;
    const text = composerText.trim();
    const ref = replyTo;
    setComposerText('');
    if (composerTextareaRef.current) {
      composerTextareaRef.current.style.height = 'auto';
    }
    setReplyTo(null);
    const mentionAll = text.includes('@everyone') || text.includes('@here');
    const msg = await nexconn.sendTextMessage(activeTarget, text, {
      replyTo: ref,
      mentionAll,
    });
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollBottom(false);
    });
  };

  const handleSendGif = async (gif: GifItem) => {
    if (!activeTarget) return;
    setShowComposerEmoji(false);
    const msg = await nexconn.sendTextMessage(activeTarget, gif.url, {
      type: 'gif',
      metadata: { title: gif.title, url: gif.url },
    });
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
  };

  const handleSendSticker = async (sticker: StickerItem) => {
    if (!activeTarget) return;
    setShowComposerEmoji(false);
    const msg = await nexconn.sendTextMessage(activeTarget, sticker.name, {
      type: 'sticker',
      metadata: { name: sticker.name, url: sticker.url, pack: sticker.pack },
    });
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
  };

  const handleSelectEmoji = (emoji: string) => {
    setComposerText((prev) => prev + emoji);
  };

  const handleSendQuickChat = async (preset: QuickChatPreset, zone?: string) => {
    if (!activeTarget) return;
    const text = zone ? `${preset.text} [${zone}]` : preset.text;
    const msg = await nexconn.sendTextMessage(activeTarget, text, {
      type: 'quickchat',
      metadata: { category: preset.category, badge: 'QUICK CHAT' },
    });
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeTarget) return;
    await uploadSingleFile(file);
  };

  const uploadSingleFile = async (file: File) => {
    if (!activeTarget) return;
    const msg = await nexconn.sendMediaFile(activeTarget, file, composerText.trim());
    setComposerText('');
    if (composerTextareaRef.current) {
      composerTextareaRef.current.style.height = 'auto';
    }
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
  };

  const handleComposerChange = (val: string, el?: HTMLTextAreaElement | null) => {
    setComposerText(val);
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
    }
    if (activeTarget && Date.now() - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = Date.now();
      nexconn.sendTyping(activeTarget);
    }
  };

  const saveEdit = async (msgId: string) => {
    if (!activeTargetKey || !editingText.trim()) return;
    const { message } = await api.editMessage(activeTargetKey, msgId, editingText.trim());
    setMessagesByKey((prev) => ({
      ...prev,
      [activeTargetKey]: (prev[activeTargetKey] || []).map((m) => (m.id === msgId ? message : m)),
    }));
    setEditingMsgId(null);
  };

  const deleteMsg = async (msgId: string) => {
    if (!activeTargetKey) return;
    await api.deleteMessage(activeTargetKey, msgId);
    setMessagesByKey((prev) => ({
      ...prev,
      [activeTargetKey]: (prev[activeTargetKey] || []).filter((m) => m.id !== msgId),
    }));
  };

  const toggleReact = async (msgId: string, emoji: string) => {
    if (!activeTargetKey) return;
    setEmojiMenuMsgId(null);
    const { message } = await api.reactMessage(activeTargetKey, msgId, emoji);
    setMessagesByKey((prev) => ({
      ...prev,
      [activeTargetKey]: (prev[activeTargetKey] || []).map((m) => (m.id === msgId ? message : m)),
    }));
  };

  const togglePinMessage = async (m: ChatMessage) => {
    const isPinned = currentPins.some((p) => p.id === m.id);
    const snapshot: PinnedMessageSnapshot = {
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      createdAt: m.createdAt,
      attachments: m.attachments || [],
    };
    if (isPinned) {
      if (activeServer && activeChannel) {
        await api.unpinMessage(activeServer.id, activeChannel.id, m.id).catch(() => {});
      } else if (activeTargetKey) {
        await api.unpinDmMessage(activeTargetKey, m.id).catch(() => {});
      }
    } else {
      if (activeServer && activeChannel) {
        await api.pinMessage(activeServer.id, activeChannel.id, snapshot).catch(() => {});
      } else if (activeTargetKey) {
        await api.pinDmMessage(activeTargetKey, snapshot).catch(() => {});
      }
      setShowPinsDrawer(true);
    }
    await runSync();
  };

  // ---------------------------------------------------------------- Voice & Call actions
  const joinVoiceChannel = async (srv: Server, ch: Channel) => {
    nexconn.unlockAudio();
    const rtcConfig = await api.getWebRtcConfig().catch(() => null);
    if (rtcConfig?.iceServers?.length) nexconn.setIceServers(rtcConfig.iceServers);
    const media = await nexconn.ensureLocalMedia(true, false);
    if (!media?.getAudioTracks().some((track) => track.readyState === 'live')) {
      const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true;
      if (!isSecure) {
        window.alert('Microphone access requires a secure HTTPS connection on mobile browsers. Please open https://nexcord-a85i.onrender.com to use voice and video.');
      } else {
        window.alert('Microphone access is required to join voice. Check this site’s microphone permission in your mobile browser settings and try again.');
      }
      return;
    }
    const res = await api.joinVoice(srv.id, ch.id);
    const peers = res.participants.filter((id) => id !== me?.id);
    let callId = res.callId;
    if (!callId) {
      callId = await nexconn.startCall({
        calleeIds: peers,
        isGroup: true,
        video: false,
        extra: JSON.stringify({ serverId: srv.id, channelId: ch.id }),
      });
      await api.setVoiceCallId(callId);
    } else {
      await nexconn.joinCall(callId, false);
    }
    nexconn.setCurrentCallId(callId);
    peers.forEach((peerId) => {
      maybeConnectToPeer(peerId, callId);
    });
    setMyVoice({ serverId: srv.id, channelId: ch.id });
    setCallState({
      status: 'connected',
      callId,
      isGroup: true,
      mediaType: 'audio',
      peerIds: peers,
      targetLabel: ch.name,
      startedAt: Date.now(),
      micMuted: false,
      cameraEnabled: false,
      deafened: false,
      screenSharing: false,
    });
    await runSync();
  };

  const autoJoinDoneRef = useRef(false);
  useEffect(() => {
    if (!me || autoJoinDoneRef.current || myVoice) return;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (urlParams?.get('autoJoin') === '1') {
      const srvId = urlParams.get('serverId');
      const chId = urlParams.get('channelId');
      const targetSrv = servers.find((s) => s.id === srvId);
      const targetCh = targetSrv?.channels.find((c) => c.id === chId);
      if (targetSrv && targetCh) {
        autoJoinDoneRef.current = true;
        joinVoiceChannel(targetSrv, targetCh).catch(() => {});
      }
    }
  }, [me, servers, myVoice]);

  const startDirectCall = async (
    userId: string,
    video: boolean,
    opts?: { phone?: string; contactName?: string },
  ) => {
    nexconn.unlockAudio();
    const media = await nexconn.ensureLocalMedia(true, video);
    if (!media?.getAudioTracks().some((track) => track.readyState === 'live')) {
      const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true;
      if (!isSecure) {
        window.alert('Voice & Video require a secure HTTPS connection on mobile browsers. Please open https://nexcord-a85i.onrender.com.');
      } else {
        window.alert('Microphone access is required to start a call. Check this site’s microphone permission in your mobile browser settings and try again.');
      }
      return;
    }

    const res = await api.startDirectCall({
      ...(userId ? { targetUserId: userId } : {}),
      ...(opts?.phone ? { phone: opts.phone } : {}),
      mediaType: video ? 'video' : 'audio',
      contactName: opts?.contactName || '',
    });
    const dc = res.call;
    const peerId = dc.calleeId;
    const peerUser = dc.callee || users[peerId];
    setActiveDirectCall(dc);
    if (peerUser) {
      setUsers((prev) => ({ ...prev, [peerUser.id]: peerUser }));
    }
    setDirectCallExpanded(false);
    nexconn.setCurrentCallId(dc.callId);

    // Best-effort Nexconn Call SDK telemetry if connected
    nexconn
      .startCall({
        calleeIds: [peerId],
        isGroup: false,
        video,
      })
      .catch(() => {});

    setCallState({
      status: 'calling',
      callId: dc.callId,
      isGroup: false,
      mediaType: video ? 'video' : 'audio',
      peerIds: [peerId],
      targetLabel: peerUser?.displayName || opts?.contactName || peerId,
      startedAt: Date.now(),
      micMuted: false,
      cameraEnabled: video,
      deafened: false,
      screenSharing: false,
    });
    await runSync().catch(() => {});
  };

  const acceptDirectCallSession = async (call: DirectCallSession, asVideo: boolean) => {
    nexconn.unlockAudio();
    const media = await nexconn.ensureLocalMedia(true, asVideo);
    if (!media?.getAudioTracks().some((track) => track.readyState === 'live')) {
      const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true;
      if (!isSecure) {
        window.alert('Microphone access requires a secure HTTPS connection on mobile browsers. Please open https://nexcord-a85i.onrender.com.');
      } else {
        window.alert('Microphone access is required to join the call. Please allow mic permission in browser settings.');
      }
      return;
    }
    const res = await api.acceptDirectCall(call.callId, asVideo ? 'video' : 'audio');
    const accepted = res.call;
    const peerId = accepted.callerId === me?.id ? accepted.calleeId : accepted.callerId;
    const peerUser = accepted.callerId === me?.id ? accepted.callee : accepted.caller;
    if (peerUser) {
      setUsers((prev) => ({ ...prev, [peerUser.id]: peerUser }));
    }
    setActiveDirectCall(accepted);
    setIncomingCall(null);
    setDirectCallExpanded(true);
    nexconn.setCurrentCallId(accepted.callId);
    await nexconn.acceptCall(accepted.callId, asVideo);
    nexconn.connectToPeer(peerId, accepted.callId).catch(() => {});
    setCallState({
      status: 'connected',
      callId: accepted.callId,
      isGroup: false,
      mediaType: asVideo ? 'video' : 'audio',
      peerIds: [peerId],
      targetLabel: peerUser?.displayName || accepted.contactLabel || peerId,
      startedAt: accepted.answeredAt || Date.now(),
      micMuted: false,
      cameraEnabled: asVideo,
      deafened: false,
      screenSharing: false,
    });
  };

  const hangupCall = async () => {
    const dcId = activeDirectCall?.callId || (callState.callId.startsWith('dc_') ? callState.callId : '');
    if (dcId) {
      const reason = activeDirectCall?.status === 'ringing' && activeDirectCall.callerId !== me?.id ? 'declined' : 'ended';
      await api.endDirectCall(dcId, reason).catch(() => {});
      setActiveDirectCall(null);
      setDirectCallExpanded(false);
    }
    await nexconn.endCall(callState.callId || dcId);
    if (myVoice) {
      await api.leaveVoice().catch(() => {});
      setMyVoice(null);
    }
    setCallState(INITIAL_CALL);
    await runSync();
  };

  const toggleMic = async () => {
    const nextMuted = !callState.micMuted;
    await nexconn.toggleMic(!nextMuted);
    setCallState((prev) => ({ ...prev, micMuted: nextMuted }));
    if (myVoice) await api.updateVoiceState({ muted: nextMuted }).catch(() => {});
  };

  const toggleDeafen = async () => {
    const nextDeaf = !callState.deafened;
    setCallState((prev) => ({ ...prev, deafened: nextDeaf, micMuted: nextDeaf ? true : prev.micMuted }));
    if (nextDeaf) await nexconn.toggleMic(false);
    nexconn.setDeafened(nextDeaf);
    if (myVoice) await api.updateVoiceState({ deafened: nextDeaf, muted: nextDeaf ? true : callState.micMuted }).catch(() => {});
  };

  const toggleCamera = async () => {
    const nextCam = !callState.cameraEnabled;
    const active = await nexconn.toggleCamera(nextCam);
    setCallState((prev) => ({ ...prev, cameraEnabled: active }));
    if (myVoice) await api.updateVoiceState({ video: active }).catch(() => {});
    await runSync();
  };

  const toggleScreenShare = async () => {
    const nextShare = !callState.screenSharing;
    if (!nextShare) {
      await nexconn.toggleScreenShare(false).catch(() => {});
      setCallState((prev) => ({ ...prev, screenSharing: false }));
      if (myVoice) await api.updateVoiceState({ streaming: false }).catch(() => {});
      return;
    }
    try {
      const stream = await nexconn.toggleScreenShare(true);
      const active = !!stream;
      setCallState((prev) => ({
        ...prev,
        screenSharing: active,
        gameAudioMode: active ? true : prev.gameAudioMode,
        gameAudioVolume: active ? 1.5 : prev.gameAudioVolume,
      }));
      if (myVoice) await api.updateVoiceState({ streaming: active }).catch(() => {});
    } catch (err: any) {
      window.alert(err?.message || 'Screen sharing is not supported or was canceled on this device.');
    }
  };

  const setGameAudioVolume = (vol: number) => {
    nexconn.setGameAudioVolume(vol);
    setCallState((prev) => ({ ...prev, gameAudioVolume: vol }));
  };

  const setGameAudioMode = (enabled: boolean) => {
    nexconn.setGameAudioMode(enabled);
    setCallState((prev) => ({ ...prev, gameAudioMode: enabled }));
  };

  // ---------------------------------------------------------------- Render Guards
  if (!authReady) {
    return (
      <div className="nc-loading-screen">
        <div className="nc-loading-logo-box">
          <Gamepad2 size={34} />
        </div>
        <div className="nc-loading-title">Nexcord</div>
        <div className="nc-loading-sub">Connecting to Nexconn Real-Time Edge...</div>
        <div className="nc-loading-bar"><span /></div>
      </div>
    );
  }

  if (!me) {
    return (
      <AuthScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onDemoLogin={handleDemoLogin}
        onVerifyOtp={handleVerifyOtp}
        onFirebaseLogin={handleFirebaseLogin}
      />
    );
  }

  const activeVoiceChannel = myVoice
    ? servers.find((s) => s.id === myVoice.serverId)?.channels.find((c) => c.id === myVoice.channelId) || null
    : null;
  const activeVoiceServer = myVoice ? servers.find((s) => s.id === myVoice.serverId) || null : null;

  const isViewingVoiceStage =
    (viewMode === 'server' && activeChannel?.type === 'voice') ||
    (directCallExpanded && activeDirectCall?.status === 'connected');

  const typingUsers = Object.entries(typingByKey[activeTargetKey] || {})
    .filter(([uid]) => uid !== me.id)
    .map(([, v]) => v.name);

  const dmUser = activeDmUserId ? users[activeDmUserId] : null;

  return (
    <div className="nc-shell">
      {mobileNavOpen && <div className="nc-mobile-backdrop" onClick={() => setMobileNavOpen(false)} />}

      {/* 1. LEFTMOST SERVER RAIL */}
      <nav className={`nc-server-rail ${mobileNavOpen ? 'open' : ''}`} aria-label="Servers">
        <div className="nc-rail-item-wrap">
          {viewMode === 'home' && <span className="nc-rail-pill active" />}
          <button
            type="button"
            className={`nc-rail-icon home ${viewMode === 'home' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('home');
              setActiveDmUserId('');
              setMobileNavOpen(false);
            }}
            title="Direct Messages & Friends"
          >
            <Gamepad2 size={24} />
            {incomingReq.length > 0 && <span className="nc-badge">{incomingReq.length}</span>}
          </button>
        </div>

        <div className="nc-rail-sep" />

        {servers.map((srv) => {
          const isAct = viewMode === 'server' && activeServerId === srv.id;
          const unreadCount = srv.channels.reduce((sum, ch) => sum + (unreadByKey[`${srv.id}:${ch.id}`] || 0), 0);
          const initials = srv.name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <div key={srv.id} className="nc-rail-item-wrap">
              {(isAct || unreadCount > 0) && <span className={`nc-rail-pill ${isAct ? 'active' : ''}`} />}
              <button
                type="button"
                className={`nc-rail-icon ${isAct ? 'active' : ''}`}
                style={{ background: isAct ? srv.iconColor : undefined }}
                onClick={() => selectServer(srv)}
                title={srv.name}
              >
                {srv.iconUrl ? <img src={srv.iconUrl} alt={srv.name} /> : <span>{initials}</span>}
                {unreadCount > 0 && <span className="nc-badge">{unreadCount}</span>}
              </button>
            </div>
          );
        })}

        <div className="nc-rail-item-wrap">
          <button
            type="button"
            className="nc-rail-icon add"
            onClick={() => {
              setCreateServerTab('create');
              setShowCreateServer(true);
            }}
            title="Create a Squad Server (+)"
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="nc-rail-item-wrap">
          <button
            type="button"
            className="nc-rail-icon contacts"
            onClick={() => {
              setCreateServerTab('join');
              setShowCreateServer(true);
            }}
            title="Join a Server with Invite / ID"
          >
            <Compass size={20} />
          </button>
        </div>

        <div className="nc-rail-spacer" />

        <div className="nc-rail-item-wrap">
          <a
            href={getApkDownloadUrl()}
            download="Nexcord-Flutter.apk"
            className="nc-rail-icon apk-rail-btn"
            title="Download Nexcord Android App (v1.1 APK)"
            style={{ textDecoration: 'none', color: '#57f287' }}
          >
            <Smartphone size={20} />
          </a>
        </div>

        {me?.isAdmin && (
          <div className="nc-rail-item-wrap">
            <button
              type="button"
              className="nc-rail-icon admin-rail-btn"
              onClick={() => setShowAdminModal(true)}
              title="Admin Command Center 🛡️ (APIs, Telemetry, Logs & Controls)"
            >
              <Shield size={22} />
            </button>
          </div>
        )}

        {me?.isAdmin ? (
          <div className="nc-rail-item-wrap">
            <button
              type="button"
              className={`nc-rail-icon sdk ${sdkMode}`}
              onClick={() => setShowSdkModal(true)}
              title={`Nexconn SDK (${sdkMode}) — Admin Console`}
            >
              <Activity size={20} />
            </button>
          </div>
        ) : (
          <div className="nc-rail-item-wrap">
            <button
              type="button"
              className="nc-rail-icon settings"
              onClick={() => setShowUserSettings(true)}
              title="User Settings & Audio Config"
            >
              <Settings size={20} />
            </button>
          </div>
        )}
      </nav>

      {/* 2. CHANNEL / DM SIDEBAR */}
      <aside className={`nc-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        {viewMode === 'home' ? (
          <>
            <div className="nc-sidebar-head">
              <button type="button" className="nc-quick-search-btn" onClick={() => setShowQuickSwitcher(true)}>
                <span>Find or start a conversation</span>
                <kbd className="desktop-only">Ctrl+K</kbd>
              </button>
              <button
                type="button"
                className="nc-icon-btn mobile-only nc-sidebar-close-btn"
                onClick={() => setMobileNavOpen(false)}
                title="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="nc-sidebar-scroll">
              <button
                type="button"
                className={`nc-nav-row ${!activeDmUserId ? 'active' : ''}`}
                onClick={() => {
                  setActiveDmUserId('');
                  setMobileNavOpen(false);
                }}
              >
                <Users size={18} />
                <span>Friends</span>
                {incomingReq.length > 0 && <span className="nc-mini-badge">{incomingReq.length}</span>}
              </button>

              <div className="nc-cat-head">
                <span>DIRECT MESSAGES</span>
              </div>

              {dms.map((uid) => {
                const u = users[uid];
                const dKey = targetKeyOf({ kind: 'dm', userId: uid, myUserId: me.id });
                const unread = unreadByKey[dKey] || 0;
                return (
                  <div
                    key={uid}
                    className={`nc-dm-row ${activeDmUserId === uid ? 'active' : ''}`}
                    onClick={() => {
                      setActiveDmUserId(uid);
                      setMobileNavOpen(false);
                    }}
                  >
                    <Avatar user={u} size={30} showStatus />
                    <div className="nc-dm-meta">
                      <div className="nc-dm-name">{u?.displayName || uid}</div>
                      {u?.customStatus && <div className="nc-dm-sub">{u.customStatus}</div>}
                    </div>
                    {unread > 0 && <span className="nc-mini-badge">{unread}</span>}
                    <button
                      type="button"
                      className="nc-dm-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        api.closeDm(uid).then(runSync);
                        if (activeDmUserId === uid) setActiveDmUserId('');
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : activeServer ? (
          <>
            <div className="nc-sidebar-head server" onClick={() => setShowServerMenu((v) => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                {activeServer.iconUrl ? (
                  <img
                    src={activeServer.iconUrl}
                    alt={activeServer.name}
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: activeServer.iconColor || 'var(--blurple)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {activeServer.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <span className="nc-srv-title">{activeServer.name}</span>
                  {activeServer.description ? (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeServer.description}
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: copiedServerId ? '#3BA55C' : 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.9 }}>
                      {copiedServerId ? '✓ Copied ID to clipboard!' : `ID: ${activeServer.id}`}
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown size={16} />
              <button
                type="button"
                className="nc-icon-btn mobile-only nc-sidebar-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileNavOpen(false);
                }}
                title="Close Drawer"
              >
                <X size={18} />
              </button>
              {showServerMenu && (
                <div className="nc-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeServer.id);
                      setCopiedServerId(true);
                      setTimeout(() => setCopiedServerId(false), 2000);
                      setShowServerMenu(false);
                    }}
                  >
                    <Copy size={14} /> Copy Server ID ({activeServer.id})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeServer.inviteCode);
                      setShowServerMenu(false);
                    }}
                  >
                    <Copy size={14} /> Copy Invite Code ({activeServer.inviteCode})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowServerMenu(false);
                      setShowServerSettings(true);
                    }}
                  >
                    <Settings size={14} /> Server Settings & Invites
                  </button>
                  {activeServer.myPermissions.manageChannels && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowServerMenu(false);
                        setCreateChannelCat(activeServer.categories[0]?.id || null);
                      }}
                    >
                      <Plus size={14} /> Create Channel
                    </button>
                  )}
                  {activeServer.ownerId !== me.id && (
                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        setShowServerMenu(false);
                        await api.leaveServer(activeServer.id);
                        await runSync();
                      }}
                    >
                      Leave Server
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="nc-sidebar-scroll">
              {activeServer.categories.map((cat) => {
                const collapsed = !!collapsedCats[cat.id];
                const channels = activeServer.channels.filter((c) => c.categoryId === cat.id);
                return (
                  <div key={cat.id} className="nc-cat-group">
                    <div className="nc-cat-head">
                      <button
                        type="button"
                        className="nc-cat-toggle"
                        onClick={() => setCollapsedCats((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                      >
                        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        <span>{cat.name}</span>
                      </button>
                      {activeServer.myPermissions.manageChannels && (
                        <button
                          type="button"
                          className="nc-cat-add"
                          onClick={() => setCreateChannelCat(cat.id)}
                          title="Create Channel"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>

                    {!collapsed &&
                      channels.map((ch) => {
                        const isAct = activeChannelId === ch.id;
                        const cKey = `${activeServer.id}:${ch.id}`;
                        const unread = unreadByKey[cKey] || 0;
                        const vMembers = activeServer.voiceStates[ch.id] || [];

                        return (
                          <div key={ch.id}>
                            <button
                              type="button"
                              className={`nc-ch-row ${isAct ? 'active' : ''} ${unread > 0 ? 'unread' : ''}`}
                              onClick={() => selectChannel(activeServer, ch)}
                            >
                              {ch.type === 'voice' ? (
                                <Volume2 size={17} className="nc-ch-ico" />
                              ) : ch.type === 'live' ? (
                                <Tv size={17} className="nc-ch-ico live" />
                              ) : ch.type === 'announcement' ? (
                                <Megaphone size={17} className="nc-ch-ico" />
                              ) : (
                                <Hash size={17} className="nc-ch-ico" />
                              )}
                              <span className="nc-ch-name">{ch.name}</span>
                              {ch.type === 'live' && ch.live && <span className="nc-live-mini">LIVE</span>}
                              {unread > 0 && <span className="nc-mini-badge">{unread}</span>}
                            </button>

                            {ch.type === 'voice' && vMembers.length > 0 && (
                              <div className="nc-voice-members-nested">
                                {vMembers.map((vp) => {
                                  const vu = users[vp.userId];
                                  return (
                                    <div key={vp.userId} className="nc-voice-nested-row">
                                      <Avatar user={vu} size={22} speaking={!vp.muted} />
                                      <span>{vu?.displayName || vp.userId}</span>
                                      <div className="nc-voice-nested-icons">
                                        {vp.streaming && <span className="nc-live-mini">LIVE</span>}
                                        {vp.muted && <MicOff size={12} />}
                                        {vp.deafened && <VolumeX size={12} />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="nc-sidebar-scroll nc-empty-side">
            <p>Join or create a server to start chatting!</p>
            <button type="button" className="nc-btn primary sm" onClick={() => setShowCreateServer(true)}>
              Create Server
            </button>
          </div>
        )}

        {/* Active Voice Connection Panel */}
        {callState.status !== 'idle' && (
          <div className="nc-voice-bar">
            <div className="nc-voice-bar-info">
              <div className="nc-voice-bar-status">
                <Radio size={13} />
                <span>Voice Connected</span>
              </div>
              <div className="nc-voice-bar-sub">
                {activeVoiceChannel ? `${activeVoiceChannel.name} / ${activeVoiceServer?.name}` : callState.targetLabel}
              </div>
            </div>
            <div className="nc-voice-bar-btns">
              <button type="button" className="nc-icon-btn sm" onClick={toggleCamera} title="Toggle Video">
                <Video size={15} />
              </button>
              <button type="button" className="nc-icon-btn sm" onClick={toggleScreenShare} title="Share Screen">
                <MonitorUp size={15} />
              </button>
              <button type="button" className="nc-icon-btn sm danger" onClick={hangupCall} title="Disconnect">
                <PhoneOff size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom User Profile Dock */}
        <div className="nc-user-dock">
          <div className="nc-user-dock-left" onClick={() => setShowUserSettings(true)}>
            <Avatar user={me} size={32} showStatus />
            <div className="nc-user-dock-meta">
              <div className="nc-user-dock-name">{me.displayName}</div>
              <div className="nc-user-dock-sub">{me.customStatus || `@${me.username}`}</div>
            </div>
          </div>
          <div className="nc-user-dock-btns">
            <button
              type="button"
              className={`nc-icon-btn sm ${callState.micMuted ? 'danger' : ''}`}
              onClick={toggleMic}
              title={callState.micMuted ? 'Unmute' : 'Mute'}
            >
              {callState.micMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              className={`nc-icon-btn sm ${callState.deafened ? 'danger' : ''}`}
              onClick={toggleDeafen}
              title={callState.deafened ? 'Undeafen' : 'Deafen'}
            >
              {callState.deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
            </button>
            <button type="button" className="nc-icon-btn sm" onClick={() => setShowUserSettings(true)} title="User Settings">
              <Settings size={16} />
            </button>
            {me.isAdmin && (
              <button
                type="button"
                className="nc-icon-btn sm"
                style={{ color: '#FEE75C' }}
                onClick={() => setShowAdminModal(true)}
                title="Admin Command Center 🛡️"
              >
                <Shield size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* 3. MAIN CONTENT AREA */}
      <main className="nc-main">
        {/* Top Bar */}
        <header className="nc-topbar">
          <div className="nc-topbar-left">
            <button
              type="button"
              className="nc-icon-btn mobile-only"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            {viewMode === 'home' && !activeDmUserId && (
              <>
                <Users size={20} className="nc-muted" />
                <h2>Friends</h2>
                <div className="nc-friends-tabs">
                  {(['online', 'all', 'contacts', 'pending', 'add'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`nc-friend-tab ${friendsTab === t ? 'active' : ''} ${t === 'add' ? 'add-btn' : ''} ${t === 'contacts' ? 'contacts-btn' : ''}`}
                      onClick={() => setFriendsTab(t)}
                    >
                      {t === 'add' ? 'Add Friend' : t === 'contacts' ? 'Phone Contacts' : t[0].toUpperCase() + t.slice(1)}
                      {t === 'pending' && incomingReq.length > 0 && <span className="nc-mini-badge">{incomingReq.length}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {viewMode === 'home' && dmUser && (
              <>
                <AtSign size={20} className="nc-muted" />
                <h2>{dmUser.displayName}</h2>
                <span className={`nc-pill-status status-${dmUser.status}`}>{dmUser.status}</span>
                {dmUser.customStatus && <span className="nc-topic">{dmUser.customStatus}</span>}
              </>
            )}

            {viewMode === 'server' && activeChannel && (
              <>
                {activeChannel.type === 'voice' ? (
                  <Volume2 size={20} className="nc-muted" />
                ) : activeChannel.type === 'live' ? (
                  <Tv size={20} className="nc-live-ico" />
                ) : (
                  <Hash size={20} className="nc-muted" />
                )}
                <h2>{activeChannel.name}</h2>
                {activeChannel.topic && <span className="nc-topic">{activeChannel.topic}</span>}
              </>
            )}
          </div>

          <div className="nc-topbar-actions">
            {viewMode === 'home' && dmUser && (
              <>
                <button
                  type="button"
                  className="nc-icon-btn"
                  onClick={() =>
                    startDirectCall(dmUser.id, false).catch((err: any) =>
                      window.alert(err?.message || 'Could not start call'),
                    )
                  }
                  title="Start Voice Call (Nexconn Call SDK)"
                >
                  <Phone size={18} />
                </button>
                <button
                  type="button"
                  className="nc-icon-btn"
                  onClick={() =>
                    startDirectCall(dmUser.id, true).catch((err: any) =>
                      window.alert(err?.message || 'Could not start video call'),
                    )
                  }
                  title="Start Video Call (Nexconn Call SDK)"
                >
                  <Video size={18} />
                </button>
              </>
            )}

            {((viewMode === 'server' && activeChannel && activeChannel.type !== 'voice' && activeChannel.type !== 'live') ||
              (viewMode === 'home' && dmUser)) && (
              <button
                type="button"
                className={`nc-icon-btn ${showPinsDrawer ? 'active' : ''}`}
                onClick={() => setShowPinsDrawer((v) => !v)}
                title={showPinsDrawer ? 'Close Pinned Messages' : 'Pinned Messages'}
                style={{ position: 'relative' }}
              >
                <Pin size={18} />
                {currentPins.length > 0 && (
                  <span className="nc-pin-badge-count">{currentPins.length}</span>
                )}
              </button>
            )}

            {viewMode === 'server' && activeChannel && activeChannel.type !== 'voice' && activeChannel.type !== 'live' && (
              <button
                type="button"
                className={`nc-icon-btn ${showSearch ? 'active' : ''} desktop-only`}
                onClick={() => setShowSearch((v) => !v)}
                title="Search Channel Messages"
              >
                <Search size={18} />
              </button>
            )}

            {viewMode === 'server' && (
              <button
                type="button"
                className={`nc-icon-btn ${showMemberList ? 'active' : ''} desktop-only`}
                onClick={() => setShowMemberList((v) => !v)}
                title="Toggle Member List"
              >
                <Users size={18} />
              </button>
            )}
          </div>
        </header>

        {showSearch && (
          <div className="nc-search-bar">
            <Search size={15} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter messages in this channel..."
              autoFocus
            />
            {searchQuery && (
              <button type="button" className="nc-icon-btn sm" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="nc-content-row">
          <div className="nc-stage">
            {/* Case A: Friends Dashboard */}
            {viewMode === 'home' && !activeDmUserId && (
              <div className="nc-friends-view">
                {friendsTab === 'add' ? (
                  <div className="nc-add-friend-box">
                    <h3>ADD FRIEND</h3>
                    <p>You can add friends by their mobile phone number (e.g. <code>+91 98765 43210</code>) or username.</p>
                    <form
                      className="nc-add-friend-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setAddFriendFeedback(null);
                        try {
                          const r = await api.requestFriend({ username: addFriendInput, phone: addFriendInput });
                          setAddFriendFeedback({ ok: true, text: `Success! Sent friend request to ${r.user.displayName}.` });
                          setAddFriendInput('');
                          await runSync();
                        } catch (err: any) {
                          setAddFriendFeedback({ ok: false, text: err?.message || 'Could not add friend' });
                        }
                      }}
                    >
                      <input
                        value={addFriendInput}
                        onChange={(e) => setAddFriendInput(e.target.value)}
                        placeholder="Enter friend's phone number or username"
                      />
                      <button type="submit" className="nc-btn primary">
                        Send Friend Request
                      </button>
                    </form>
                    {addFriendFeedback && (
                      <div className={addFriendFeedback.ok ? 'nc-ok-banner' : 'nc-error-banner'}>
                        {addFriendFeedback.text}
                      </div>
                    )}

                    <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Phone size={15} color="#5865F2" />
                        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f2f3f5', letterSpacing: 0.5 }}>
                          FIND FRIENDS FROM PHONE CONTACTS
                        </h4>
                      </div>
                      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#949ba4' }}>
                        Check if people from your phone contacts are already on Nexcord and connect with them.
                      </p>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!contactInput.trim()) return;
                          setContactFeedback(null);
                          setContactBusy(true);
                          try {
                            const nums = contactInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
                            const res = await api.matchContacts({ phoneNumbers: nums });
                            setContactMatches(res.matches);
                            setContactFeedback(`Scanned ${nums.length} numbers: found ${res.matches.length} matching friends on Nexcord!`);
                          } catch (err: any) {
                            setContactFeedback(err?.message || 'Failed to check contacts.');
                          } finally {
                            setContactBusy(false);
                          }
                        }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={contactInput}
                            onChange={(e) => setContactInput(e.target.value)}
                            placeholder="Enter phone numbers (e.g. +91 98765 43210, +91 72518 80344)"
                            style={{ flex: 1 }}
                          />
                          <button type="submit" className="nc-btn secondary" disabled={contactBusy || !contactInput.trim()}>
                            {contactBusy ? 'Checking...' : 'Check Contacts'}
                          </button>
                        </div>
                      </form>

                      {contactFeedback && (
                        <div className="nc-ok-banner" style={{ margin: '10px 0', fontSize: 12 }}>
                          {contactFeedback}
                        </div>
                      )}

                      {contactMatches.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#949ba4', marginBottom: 4 }}>
                            FOUND ON NEXCORD ({contactMatches.length})
                          </div>
                          {contactMatches.map((m) => (
                            <div key={m.user.id} className="nc-friend-row">
                              <Avatar user={m.user} size={34} showStatus />
                              <div className="nc-friend-info">
                                <strong>{m.contactName} {m.contactName !== m.user.displayName ? `(@${m.user.displayName})` : ''}</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{m.phone}</span>
                              </div>
                              <div className="nc-friend-btns">
                                <button
                                  type="button"
                                  className="nc-btn xs green"
                                  onClick={() =>
                                    startDirectCall(m.user.id, false, { contactName: m.contactName }).catch((err: any) =>
                                      setContactFeedback(err?.message || 'Could not start call'),
                                    )
                                  }
                                  title="Voice Call"
                                >
                                  <PhoneCall size={13} />
                                  <span>Call</span>
                                </button>
                                <button
                                  type="button"
                                  className="nc-icon-btn sm"
                                  onClick={() =>
                                    startDirectCall(m.user.id, true, { contactName: m.contactName }).catch((err: any) =>
                                      setContactFeedback(err?.message || 'Could not start video call'),
                                    )
                                  }
                                  title="Video Call"
                                >
                                  <Video size={15} />
                                </button>
                                {m.isFriend ? (
                                  <button type="button" className="nc-btn xs secondary" onClick={() => openDm(m.user.id)}>
                                    <MessageSquare size={13} />
                                    <span>Message</span>
                                  </button>
                                ) : m.hasPendingOutgoing ? (
                                  <span className="nc-muted" style={{ fontSize: 12 }}>Request Sent ⏳</span>
                                ) : m.hasPendingIncoming ? (
                                  <button type="button" className="nc-btn xs green" onClick={() => api.acceptFriend(m.user.id).then(runSync)}>
                                    <Check size={13} />
                                    <span>Accept</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="nc-btn xs primary"
                                    onClick={async () => {
                                      await api.requestFriend({ userId: m.user.id });
                                      await runSync();
                                      setContactMatches((prev) =>
                                        prev.map((x) => (x.user.id === m.user.id ? { ...x, hasPendingOutgoing: true } : x)),
                                      );
                                    }}
                                  >
                                    <span>Add Friend</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : friendsTab === 'contacts' ? (
                  <div className="nc-contacts-view">
                    <div className="nc-contacts-hero">
                      <div className="nc-contacts-icon">
                        <PhoneCall size={22} />
                      </div>
                      <div>
                        <h3>Call Friends Directly from Phone Contacts</h3>
                        <p>Dial any phone number directly or import your phone contacts to voice &amp; video call across app and website.</p>
                      </div>
                    </div>

                    <div className="nc-contact-dial-card">
                      <div className="nc-list-subhead" style={{ marginTop: 0 }}>DIRECT PHONE NUMBER CALL</div>
                      <form
                        className="nc-add-friend-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!dialPhone.trim()) return;
                          setDialFeedback(null);
                          startDirectCall('', false, { phone: dialPhone.trim() })
                            .then(() => setDialFeedback({ ok: true, text: `Calling ${dialPhone.trim()}...` }))
                            .catch((err: any) => setDialFeedback({ ok: false, text: err?.message || 'Call failed' }));
                        }}
                      >
                        <input
                          type="tel"
                          value={dialPhone}
                          onChange={(e) => setDialPhone(e.target.value)}
                          placeholder="Enter contact phone number (e.g. +91 98765 43210)"
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="submit" className="nc-btn green sm" disabled={!dialPhone.trim()}>
                            <PhoneCall size={14} />
                            <span>Voice Call</span>
                          </button>
                          <button
                            type="button"
                            className="nc-btn primary sm"
                            disabled={!dialPhone.trim()}
                            onClick={() => {
                              if (!dialPhone.trim()) return;
                              setDialFeedback(null);
                              startDirectCall('', true, { phone: dialPhone.trim() })
                                .then(() => setDialFeedback({ ok: true, text: `Video calling ${dialPhone.trim()}...` }))
                                .catch((err: any) => setDialFeedback({ ok: false, text: err?.message || 'Call failed' }));
                            }}
                          >
                            <Video size={14} />
                            <span>Video</span>
                          </button>
                        </div>
                      </form>
                      {dialFeedback && (
                        <div className={dialFeedback.ok ? 'nc-ok-banner' : 'nc-error-banner'} style={{ marginTop: 8 }}>
                          {dialFeedback.text}
                        </div>
                      )}
                    </div>

                    <div className="nc-contact-dial-card" style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div className="nc-list-subhead" style={{ margin: 0 }}>SCAN OR PICK PHONE CONTACTS</div>
                        {typeof navigator !== 'undefined' && 'contacts' in navigator && (
                          <button
                            type="button"
                            className="nc-btn primary xs"
                            disabled={contactBusy}
                            onClick={async () => {
                              setContactFeedback(null);
                              setContactBusy(true);
                              try {
                                const picked = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
                                const list = (picked || [])
                                  .flatMap((c: any) =>
                                    (c.tel || []).map((t: string) => ({
                                      name: c.name?.[0] || '',
                                      phone: String(t || '').trim(),
                                    })),
                                  )
                                  .filter((x: any) => x.phone);
                                if (list.length > 0) {
                                  const res = await api.matchContacts({ contacts: list });
                                  setContactMatches(res.matches);
                                  setContactFeedback(`Matched ${res.matches.length} contacts on Nexcord out of ${list.length} selected.`);
                                }
                              } catch (err: any) {
                                setContactFeedback(err?.message || 'Contact picker cancelled or unavailable.');
                              } finally {
                                setContactBusy(false);
                              }
                            }}
                          >
                            <Users size={13} />
                            <span>Pick Phone Contacts</span>
                          </button>
                        )}
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!contactInput.trim()) return;
                          setContactFeedback(null);
                          setContactBusy(true);
                          try {
                            const nums = contactInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
                            const res = await api.matchContacts({ phoneNumbers: nums });
                            setContactMatches(res.matches);
                            setContactFeedback(`Scanned ${nums.length} numbers: found ${res.matches.length} people on Nexcord!`);
                          } catch (err: any) {
                            setContactFeedback(err?.message || 'Failed to check contacts.');
                          } finally {
                            setContactBusy(false);
                          }
                        }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                      >
                        <input
                          value={contactInput}
                          onChange={(e) => setContactInput(e.target.value)}
                          placeholder="Paste phone numbers (comma or newline separated)"
                          className="nc-contact-scan-input"
                        />
                        <button type="submit" className="nc-btn secondary sm" disabled={contactBusy || !contactInput.trim()}>
                          {contactBusy ? 'Scanning...' : 'Find Contacts'}
                        </button>
                      </form>

                      {contactFeedback && (
                        <div className="nc-ok-banner" style={{ marginTop: 10, fontSize: 12 }}>
                          {contactFeedback}
                        </div>
                      )}

                      {contactMatches.length > 0 ? (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div className="nc-list-subhead">AVAILABLE TO CALL ({contactMatches.length})</div>
                          {contactMatches.map((m) => (
                            <div key={m.user.id} className="nc-friend-row">
                              <Avatar user={m.user} size={38} showStatus />
                              <div className="nc-friend-info">
                                <strong>
                                  {m.contactName} {m.contactName !== m.user.displayName ? `(@${m.user.displayName})` : ''}
                                </strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{m.phone}</span>
                              </div>
                              <div className="nc-friend-btns">
                                <button
                                  type="button"
                                  className="nc-btn xs green"
                                  onClick={() =>
                                    startDirectCall(m.user.id, false, { contactName: m.contactName }).catch((err: any) =>
                                      setContactFeedback(err?.message || 'Could not start call'),
                                    )
                                  }
                                  title="Voice Call"
                                >
                                  <PhoneCall size={13} />
                                  <span>Call</span>
                                </button>
                                <button
                                  type="button"
                                  className="nc-icon-btn sm"
                                  onClick={() =>
                                    startDirectCall(m.user.id, true, { contactName: m.contactName }).catch((err: any) =>
                                      setContactFeedback(err?.message || 'Could not start video call'),
                                    )
                                  }
                                  title="Video Call"
                                >
                                  <Video size={16} />
                                </button>
                                <button type="button" className="nc-icon-btn sm" onClick={() => openDm(m.user.id)} title="Message">
                                  <MessageSquare size={16} />
                                </button>
                                {!m.isFriend && !m.hasPendingOutgoing && (
                                  <button
                                    type="button"
                                    className="nc-btn xs primary"
                                    onClick={async () => {
                                      await api.requestFriend({ userId: m.user.id });
                                      await runSync();
                                      setContactMatches((prev) =>
                                        prev.map((x) => (x.user.id === m.user.id ? { ...x, hasPendingOutgoing: true } : x)),
                                      );
                                    }}
                                  >
                                    <UserPlus size={12} />
                                    <span>Add</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="nc-empty-state" style={{ padding: '18px 8px' }}>
                          Scan numbers above or pick from your phone contacts to call anyone on Nexcord immediately.
                        </div>
                      )}
                    </div>
                  </div>
                ) : friendsTab === 'pending' ? (
                  <div className="nc-friend-list">
                    <div className="nc-list-subhead">INCOMING REQUESTS — {incomingReq.length}</div>
                    {incomingReq.map((uid) => {
                      const u = users[uid];
                      return (
                        <div key={uid} className="nc-friend-row">
                          <Avatar user={u} size={36} showStatus />
                          <div className="nc-friend-info">
                            <strong>{u?.displayName || uid}</strong>
                            <span>Incoming Friend Request</span>
                          </div>
                          <div className="nc-friend-btns">
                            <button
                              type="button"
                              className="nc-icon-btn ok"
                              onClick={() => api.acceptFriend(uid).then(runSync)}
                              title="Accept"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="nc-icon-btn danger"
                              onClick={() => api.declineFriend(uid).then(runSync)}
                              title="Decline"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {outgoingReq.length > 0 && (
                      <>
                        <div className="nc-list-subhead">OUTGOING REQUESTS — {outgoingReq.length}</div>
                        {outgoingReq.map((uid) => {
                          const u = users[uid];
                          return (
                            <div key={uid} className="nc-friend-row">
                              <Avatar user={u} size={36} showStatus />
                              <div className="nc-friend-info">
                                <strong>{u?.displayName || uid}</strong>
                                <span>Outgoing Friend Request</span>
                              </div>
                              <button
                                type="button"
                                className="nc-icon-btn danger"
                                onClick={() => api.declineFriend(uid).then(runSync)}
                                title="Cancel"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {incomingReq.length === 0 && outgoingReq.length === 0 && (
                      <div className="nc-empty-hero">
                        <div className="nc-empty-hero-ico"><UserPlus size={26} /></div>
                        <h4>No pending friend requests</h4>
                        <p>Share your gamer tag or phone number to squad up with friends.</p>
                        <button type="button" className="nc-btn primary sm" onClick={() => setFriendsTab('add')}>
                          <UserPlus size={14} /> Add a Friend
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="nc-friend-list">
                    <div className="nc-friend-filter-bar">
                      <Search size={15} className="nc-muted" />
                      <input
                        value={friendFilter}
                        onChange={(e) => setFriendFilter(e.target.value)}
                        placeholder="Search friends by name or username..."
                      />
                      {friendFilter && (
                        <button type="button" className="nc-icon-btn sm" onClick={() => setFriendFilter('')}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {(() => {
                      const q = friendFilter.trim().toLowerCase();
                      const list = friends.filter((uid) => {
                        const u = users[uid];
                        const statusOk = friendsTab === 'online' ? u?.status !== 'offline' : true;
                        if (!statusOk) return false;
                        if (!q) return true;
                        return (
                          (u?.displayName || '').toLowerCase().includes(q) ||
                          (u?.username || '').toLowerCase().includes(q)
                        );
                      });
                      return (
                        <>
                          <div className="nc-list-subhead">
                            {friendsTab.toUpperCase()} — {list.length}
                          </div>
                          {list.map((uid) => {
                            const u = users[uid];
                            return (
                              <div key={uid} className="nc-friend-row" onClick={() => openDm(uid)} style={{ cursor: 'pointer' }}>
                                <Avatar user={u} size={38} showStatus />
                                <div className="nc-friend-info">
                                  <strong>{u?.displayName || uid}</strong>
                                  <span>{u?.customStatus || (u?.status === 'online' ? 'Online' : u?.status || 'offline')}</span>
                                </div>
                                <div className="nc-friend-btns" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" className="nc-icon-btn" onClick={() => openDm(uid)} title="Message">
                                    <MessageSquare size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="nc-icon-btn"
                                    onClick={() =>
                                      startDirectCall(uid, false).catch((err: any) =>
                                        window.alert(err?.message || 'Could not start call'),
                                      )
                                    }
                                    title="Voice Call"
                                  >
                                    <Phone size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="nc-icon-btn"
                                    onClick={() =>
                                      startDirectCall(uid, true).catch((err: any) =>
                                        window.alert(err?.message || 'Could not start video call'),
                                      )
                                    }
                                    title="Video Call"
                                  >
                                    <Video size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {list.length === 0 && (
                            <div className="nc-empty-hero">
                              <div className="nc-empty-hero-ico"><Users size={26} /></div>
                              <h4>{q ? 'No matching friends found' : friendsTab === 'online' ? 'No squadmates online right now' : 'Your squad list is empty'}</h4>
                              <p>
                                {q
                                  ? 'Try a different search term or add someone new.'
                                  : 'Add friends by username or phone number, or launch your first gaming server!'}
                              </p>
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button type="button" className="nc-btn primary sm" onClick={() => setFriendsTab('add')}>
                                  <UserPlus size={14} /> Add Friend
                                </button>
                                <button
                                  type="button"
                                  className="nc-btn secondary sm"
                                  onClick={() => {
                                    setCreateServerTab('create');
                                    setShowCreateServer(true);
                                  }}
                                >
                                  <Plus size={14} /> Create Squad Server
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Case A2: Zero-Server / Empty Arena Onboarding Hub */}
            {viewMode === 'server' && !activeServer && (
              <div className="nc-empty-arena-hub">
                <div className="nc-empty-arena-badge">
                  <Sparkles size={13} /> WELCOME TO NEXCORD ARENA
                </div>
                <h2>Ready to Launch Your Squad Hub?</h2>
                <p>
                  Create a gaming server with tactical mini-map pings, live 60 FPS esports streams, and 1-click voice huddles — or join an existing squad with an invite code.
                </p>
                <div className="nc-empty-arena-grid">
                  <button
                    type="button"
                    className="nc-arena-action-card primary"
                    onClick={() => {
                      setCreateServerTab('create');
                      setShowCreateServer(true);
                    }}
                  >
                    <div className="nc-arena-card-ico purple"><Plus size={22} /></div>
                    <strong>Create a Squad Server</strong>
                    <span>Pre-configured with #squad-chat-room, Live Arena &amp; Voice Lounge</span>
                  </button>
                  <button
                    type="button"
                    className="nc-arena-action-card"
                    onClick={() => {
                      setCreateServerTab('join');
                      setShowCreateServer(true);
                    }}
                  >
                    <div className="nc-arena-card-ico green"><Compass size={22} /></div>
                    <strong>Join via Invite or ID</strong>
                    <span>Enter a Server ID or invite code shared by your teammates</span>
                  </button>
                  <button
                    type="button"
                    className="nc-arena-action-card"
                    onClick={() => {
                      setViewMode('home');
                      setFriendsTab('add');
                    }}
                  >
                    <div className="nc-arena-card-ico yellow"><Users size={22} /></div>
                    <strong>Find Friends &amp; DMs</strong>
                    <span>Connect with friends by phone number or gamer tag</span>
                  </button>
                </div>
              </div>
            )}

            {/* Case B: Live Stream Stage Channel (Spectator Chat Overlay + OpenChannel) */}
            {viewMode === 'server' && activeServer && activeChannel?.type === 'live' && (
              <LiveStreamStage
                server={activeServer}
                channel={activeChannel}
                me={me}
                users={users}
                messages={activeMessages}
                hypeBursts={hypeBursts}
                onSendMessage={async (text) => {
                  if (!activeTarget) return;
                  const msg = await nexconn.sendTextMessage(activeTarget, text);
                  setMessagesByKey((prev) => {
                    const cur = prev[activeTargetKey] || [];
                    if (cur.some((m) => m.id === msg.id)) return prev;
                    return { ...prev, [activeTargetKey]: [...cur, msg] };
                  });
                }}
                onSendQuickChat={handleSendQuickChat}
                onSendHype={(emoji, text) => api.sendLiveHype(activeServer.id, activeChannel.id, emoji, text)}
                onStartLive={async (payload) => {
                  await api.startLive(activeServer.id, activeChannel.id, payload);
                  await runSync();
                }}
                onStopLive={async () => {
                  await api.stopLive(activeServer.id, activeChannel.id);
                  await runSync();
                }}
              />
            )}

            {/* Case C: Voice / Video Call Stage */}
            {isViewingVoiceStage && (
              <VoiceCallStage
                serverId={viewMode === 'server' && activeServer ? activeServer.id : undefined}
                channel={viewMode === 'server' ? activeChannel : null}
                voiceParticipants={
                  viewMode === 'server' && activeServer && activeChannel
                    ? activeServer.voiceStates[activeChannel.id] || []
                    : []
                }
                callState={callState}
                me={me}
                users={users}
                onToggleMic={toggleMic}
                onToggleDeafen={toggleDeafen}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={toggleScreenShare}
                onHangup={hangupCall}
                onMinimize={directCallExpanded ? () => setDirectCallExpanded(false) : undefined}
                onInviteUser={(uid) => nexconn.inviteToCall([uid])}
                onSetGameAudioVolume={setGameAudioVolume}
                onSetGameAudioMode={setGameAudioMode}
              />
            )}

            {/* Case D: Standard Text / Squad Chat Room / DM Chat */}
            {activeTarget && activeChannel?.type !== 'live' && !isViewingVoiceStage && (
              <div
                className="nc-chat-stage"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    if (!isDraggingFile) setIsDraggingFile(true);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setIsDraggingFile(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) uploadSingleFile(dropped);
                }}
              >
                {isDraggingFile && (
                  <div className="nc-dropzone-overlay" onClick={() => setIsDraggingFile(false)}>
                    <div className="nc-dropzone-card">
                      <Upload size={34} />
                      <h4>Drop to Upload</h4>
                      <p>Share instantly to {viewMode === 'home' && dmUser ? `@${dmUser.displayName}` : `#${activeChannel?.name}`}</p>
                    </div>
                  </div>
                )}

                <div
                  ref={messagesScrollRef}
                  className="nc-messages-scroll"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                    setShowScrollBottom(dist > 280);
                  }}
                >
                  <div className="nc-welcome-header">
                    <div className="nc-welcome-ico">
                      {viewMode === 'home' && dmUser ? (
                        <Avatar user={dmUser} size={64} />
                      ) : (
                        <Hash size={34} />
                      )}
                    </div>
                    <h3>
                      {viewMode === 'home' && dmUser
                        ? dmUser.displayName
                        : `Welcome to #${activeChannel?.name || 'channel'}!`}
                    </h3>
                    <p>
                      {viewMode === 'home' && dmUser
                        ? `This is the beginning of your direct message history with @${dmUser.username} via Nexconn Chat SDK.`
                        : activeChannel?.topic || `This is the start of #${activeChannel?.name}. Coordinate callouts, media, and squad plays here.`}
                    </p>
                  </div>

                  {activeMessages.map((m, idx) => {
                    const prev = activeMessages[idx - 1];
                    const showDateSep = !prev || !isSameCalendarDay(prev.createdAt, m.createdAt);
                    const grouped =
                      !showDateSep &&
                      prev &&
                      prev.senderId === m.senderId &&
                      m.createdAt - prev.createdAt < 300000 &&
                      !m.replyTo;
                    const sender = m.senderId === me.id ? me : users[m.senderId];
                    const member = activeServer?.members.find((x) => x.userId === m.senderId);
                    const topRole = member?.roles
                      .map((rid) => activeServer?.roles.find((r) => r.id === rid))
                      .find(Boolean);

                    return (
                      <React.Fragment key={m.id}>
                        {showDateSep && (
                          <div className="nc-date-divider">
                            <span>{formatDateDivider(m.createdAt)}</span>
                          </div>
                        )}
                        <div
                          id={`msg-${m.id}`}
                          className={`nc-msg-row ${grouped ? 'grouped' : ''} ${m.type === 'quickchat' ? 'quickchat' : ''} ${currentPins.some((p) => p.id === m.id) ? 'pinned-msg-row' : ''}`}
                        >
                        {!grouped ? (
                          <Avatar
                            user={sender}
                            name={m.senderId}
                            size={40}
                            className="nc-msg-avatar"
                            onClick={() => sender && setProfileUser(sender)}
                          />
                        ) : (
                          <span className="nc-msg-time-gutter">{formatTime(m.createdAt)}</span>
                        )}

                        <div className="nc-msg-content">
                          {m.replyTo && (
                            <div className="nc-msg-reply-line">
                              <CornerUpLeft size={12} />
                              <strong>{users[m.replyTo.senderId]?.displayName || m.replyTo.senderId}</strong>
                              <span>{m.replyTo.text}</span>
                            </div>
                          )}

                          {!grouped && (
                            <div className="nc-msg-header">
                              <span
                                className="nc-msg-author"
                                style={{ color: topRole?.color || sender?.avatarColor || '#f2f3f5' }}
                                onClick={() => sender && setProfileUser(sender)}
                              >
                                {member?.nickname || sender?.displayName || m.senderId}
                              </span>
                              {sender?.isBot && <span className="nc-bot-tag">SQUAD</span>}
                              {m.type === 'quickchat' && (
                                <span className="nc-qc-badge">{m.metadata?.badge || 'QUICK CHAT'}</span>
                              )}
                              {currentPins.some((p) => p.id === m.id) && (
                                <span className="nc-msg-pinned-indicator">📌 Pinned</span>
                              )}
                              <span className="nc-msg-ts">{formatTime(m.createdAt)}</span>
                            </div>
                          )}

                          {editingMsgId === m.id ? (
                            <div className="nc-edit-box">
                              <input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(m.id);
                                  if (e.key === 'Escape') setEditingMsgId(null);
                                }}
                                autoFocus
                              />
                              <div className="nc-edit-hint">Enter to save • Esc to cancel</div>
                            </div>
                          ) : m.type === 'gif' || (Boolean(m.text?.startsWith('http')) && Boolean(m.text?.includes('.gif'))) ? (
                            <div className="nc-msg-gif-card">
                              <img src={m.metadata?.url || m.text} alt={m.metadata?.title || 'GIF'} className="nc-msg-gif-img" loading="lazy" />
                            </div>
                          ) : m.type === 'sticker' ? (
                            <div className="nc-msg-sticker-card">
                              <img src={m.metadata?.url || m.text} alt={m.metadata?.name || 'Sticker'} className="nc-msg-sticker-img" loading="lazy" />
                            </div>
                          ) : (
                            <div className={`nc-msg-text ${(() => {
                              const cat = getEmojiOnlyCategory(m.text);
                              return cat === 'single' ? 'emoji-single' : cat === 'multiple' ? 'emoji-multiple' : '';
                            })()}`}>
                              {renderMessageText(m.text)}
                              {m.editedAt && <span className="nc-edited">(edited)</span>}
                            </div>
                          )}

                          {m.attachments && m.attachments.length > 0 && (
                            <div className="nc-attachments">
                              {m.attachments.map((att, ai) =>
                                att.isImage ? (
                                  <div
                                    key={ai}
                                    className="nc-att-img-card"
                                    onClick={() => setFullscreenImage({ url: att.dataUrl, name: att.name || 'image.png' })}
                                    title="Click to view full screen"
                                  >
                                    <img src={att.dataUrl} alt={att.name} className="nc-att-img" />
                                    <div className="nc-att-img-actions">
                                      <button
                                        type="button"
                                        className="nc-att-btn"
                                        title="View Fullscreen"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFullscreenImage({ url: att.dataUrl, name: att.name || 'image.png' });
                                        }}
                                      >
                                        <Maximize2 size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="nc-att-btn"
                                        title="Download Image"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadFile(att.dataUrl, att.name || 'image.png');
                                        }}
                                      >
                                        <Download size={15} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <a key={ai} href={att.dataUrl} download={att.name} className="nc-att-file">
                                    <Paperclip size={15} />
                                    <span>{att.name}</span>
                                    <small>{Math.max(1, Math.round(att.size / 1024))} KB</small>
                                  </a>
                                ),
                              )}
                            </div>
                          )}

                          {Object.keys(m.reactions || {}).length > 0 && (
                            <div className="nc-reactions-row">
                              {Object.entries(m.reactions).map(([emoji, list]) => {
                                const mine = list.includes(me.id);
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`nc-reaction-pill ${mine ? 'mine' : ''}`}
                                    onClick={() => toggleReact(m.id, emoji)}
                                  >
                                    <span>{emoji}</span>
                                    <span>{list.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Hover Message Actions */}
                        <div className="nc-msg-actions">
                          <div className="nc-msg-action-wrap">
                            <button
                              type="button"
                              onClick={() => setEmojiMenuMsgId(emojiMenuMsgId === m.id ? null : m.id)}
                              title="Add Reaction"
                            >
                              <Smile size={15} />
                            </button>
                            {emojiMenuMsgId === m.id && (
                              <div className="nc-emoji-pop">
                                {QUICK_EMOJIS.map((em) => (
                                  <button key={em} type="button" onClick={() => toggleReact(m.id, em)}>
                                    {em}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyTo({ id: m.id, senderId: m.senderId, text: m.text.slice(0, 90) })}
                            title="Reply"
                          >
                            <CornerUpLeft size={15} />
                          </button>
                          <button
                            type="button"
                            className={currentPins.some((p) => p.id === m.id) ? 'active pin-active' : ''}
                            onClick={() => togglePinMessage(m)}
                            title={currentPins.some((p) => p.id === m.id) ? 'Unpin Message' : 'Pin Message'}
                          >
                            {currentPins.some((p) => p.id === m.id) ? (
                              <PinOff size={15} style={{ color: '#FEE75C' }} />
                            ) : (
                              <Pin size={15} />
                            )}
                          </button>
                          {m.senderId === me.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(m.id);
                                setEditingText(m.text);
                              }}
                              title="Edit"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}
                          {(m.senderId === me.id || activeServer?.myPermissions.manageChannels) && (
                            <button type="button" onClick={() => deleteMsg(m.id)} title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Floating Jump to Latest Pill */}
                {showScrollBottom && (
                  <button
                    type="button"
                    className="nc-jump-bottom-pill"
                    onClick={() => {
                      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                      setShowScrollBottom(false);
                    }}
                  >
                    <ArrowDown size={14} />
                    <span>Jump to Latest</span>
                  </button>
                )}

                {/* Inline Personal Call Banner (matches incoming/active floating card directly above composer) */}
                {activeDirectCall && !isViewingVoiceStage && (
                  <PersonalCallBanner
                    call={activeDirectCall}
                    me={me}
                    users={users}
                    micMuted={callState.micMuted}
                    onAcceptAudio={() => acceptDirectCallSession(activeDirectCall, false)}
                    onAcceptVideo={() => acceptDirectCallSession(activeDirectCall, true)}
                    onDeclineOrEnd={hangupCall}
                    onToggleMic={toggleMic}
                    onExpandStage={() => setDirectCallExpanded(true)}
                  />
                )}

                {/* In-Match Quick Chat Bar */}
                <QuickChatBar
                  onSendQuickChat={handleSendQuickChat}
                  defaultOpen={activeChannel?.name === 'squad-chat-room'}
                />

                {/* Typing Indicator & Reply Preview */}
                {typingUsers.length > 0 && (
                  <div className="nc-typing-bar">
                    <span className="nc-typing-wave" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                    <span>
                      <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </span>
                  </div>
                )}

                {replyTo && (
                  <div className="nc-reply-banner">
                    <div className="nc-reply-banner-text">
                      <CornerUpLeft size={13} style={{ color: 'var(--blurple)', flexShrink: 0 }} />
                      <span>
                        Replying to <strong>{users[replyTo.senderId]?.displayName || replyTo.senderId}</strong>:{' '}
                        <em>{replyTo.text}</em>
                      </span>
                    </div>
                    <button type="button" className="nc-icon-btn sm" onClick={() => setReplyTo(null)} title="Cancel Reply (Esc)">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <form className={`nc-composer ${replyTo ? 'has-reply' : ''}`} onSubmit={handleSend}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    onChange={handleUploadFile}
                  />
                  <button
                    type="button"
                    className="nc-icon-btn nc-upload-trigger"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload Image or File (or drag & drop)"
                  >
                    <ImagePlus size={20} />
                  </button>
                  <textarea
                    ref={composerTextareaRef}
                    rows={1}
                    value={composerText}
                    onChange={(e) => handleComposerChange(e.target.value, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      viewMode === 'home' && dmUser
                        ? `Message @${dmUser.displayName}`
                        : `Message #${activeChannel?.name || 'channel'} • Shift+Enter for new line`
                    }
                  />
                  <div className="nc-composer-right">
                    <button
                      type="button"
                      className={`nc-icon-btn ${showComposerEmoji ? 'active' : ''}`}
                      onClick={() => setShowComposerEmoji((v) => !v)}
                      title="Emojis, GIFs & Stickers"
                    >
                      <Smile size={20} />
                    </button>
                    <MediaPickerDrawer
                      isOpen={showComposerEmoji}
                      onClose={() => setShowComposerEmoji(false)}
                      onSelectEmoji={handleSelectEmoji}
                      onSelectGif={handleSendGif}
                      onSelectSticker={handleSendSticker}
                    />
                    <button type="submit" className={`nc-send-btn ${composerText.trim() ? 'ready' : ''}`} disabled={!composerText.trim()}>
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* 4. RIGHT DRAWER: PINS OR MEMBER LIST */}
          {showPinsDrawer && (
            <>
              <div className="nc-drawer-backdrop" onClick={() => setShowPinsDrawer(false)} />
              <aside className="nc-right-drawer pins-drawer">
                <div className="nc-drawer-head">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Pin size={15} style={{ color: '#FEE75C' }} />
                    <strong>PINNED MESSAGES ({currentPins.length})</strong>
                  </span>
                  <button type="button" className="nc-icon-btn sm" onClick={() => setShowPinsDrawer(false)}>
                    <X size={15} />
                  </button>
                </div>
                <div className="nc-drawer-scroll">
                  {currentPins.length === 0 ? (
                    <div className="nc-empty-state">
                      <Pin size={28} style={{ opacity: 0.35, marginBottom: 8 }} />
                      <div>No pinned messages yet.</div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                        Hover over any message and click the Pin icon to pin it here.
                      </div>
                    </div>
                  ) : (
                    currentPins.map((p) => {
                      const u = users[p.senderId];
                      return (
                        <div key={p.id} className="nc-pin-card">
                          <div className="nc-pin-head">
                            <Avatar user={u} size={22} />
                            <strong className="nc-pin-author">{u?.displayName || p.senderId}</strong>
                            <span className="nc-pin-time">{formatTime(p.createdAt)}</span>
                            <button
                              type="button"
                              className="nc-icon-btn sm"
                              onClick={() => {
                                if (activeServer && activeChannel) {
                                  api.unpinMessage(activeServer.id, activeChannel.id, p.id).then(runSync);
                                } else if (activeTargetKey) {
                                  api.unpinDmMessage(activeTargetKey, p.id).then(runSync);
                                }
                              }}
                              title="Unpin Message"
                            >
                              <X size={13} />
                            </button>
                          </div>
                          {p.text && <p className="nc-pin-text">{p.text}</p>}
                          {p.attachments && p.attachments.length > 0 && (
                            <div className="nc-pin-attachments">
                              {p.attachments.map((att: any, ai: number) =>
                                att.isImage ? (
                                  <img
                                    key={ai}
                                    src={att.dataUrl}
                                    alt={att.name}
                                    className="nc-pin-thumb"
                                    onClick={() => setFullscreenImage({ url: att.dataUrl, name: att.name || 'image.png' })}
                                  />
                                ) : (
                                  <div key={ai} className="nc-pin-file-chip">
                                    <Paperclip size={12} />
                                    <span>{att.name}</span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            className="nc-btn xs secondary nc-pin-jump-btn"
                            onClick={() => {
                              const el = document.getElementById(`msg-${p.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('nc-msg-highlight');
                                setTimeout(() => el.classList.remove('nc-msg-highlight'), 2000);
                              }
                            }}
                          >
                            Jump to Message
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>
            </>
          )}

          {viewMode === 'server' && activeServer && showMemberList && !showPinsDrawer && activeChannel?.type !== 'live' && (
            <aside className="nc-right-drawer members">
              <div className="nc-drawer-scroll">
                {(() => {
                  const leaders = activeServer.members.filter((m) => m.userId === activeServer.ownerId || m.roles.includes('leader'));
                  const coLeaders = activeServer.members.filter((m) => !leaders.includes(m) && m.roles.includes('co-leader'));
                  const elders = activeServer.members.filter((m) => !leaders.includes(m) && !coLeaders.includes(m) && m.roles.includes('elder'));
                  const regularMembers = activeServer.members.filter((m) => !leaders.includes(m) && !coLeaders.includes(m) && !elders.includes(m));

                  const renderMember = (m: Server['members'][number]) => {
                    const u = m.userId === me.id ? me : users[m.userId];
                    if (!u) return null;
                    const isLeader = m.userId === activeServer.ownerId || m.roles.includes('leader');
                    const isCoLeader = m.roles.includes('co-leader');
                    const isElder = m.roles.includes('elder');
                    const role = m.roles.map((r) => activeServer.roles.find((x) => x.id === r)).find(Boolean);

                    return (
                      <div key={m.userId} className="nc-member-row" onClick={() => setProfileUser(u)}>
                        <Avatar user={u} size={32} showStatus />
                        <div className="nc-member-meta">
                          <div className="nc-member-name" style={{ color: role?.color }}>
                            <span>{m.nickname || u.displayName}</span>
                            {isLeader && <span title="Group Leader" style={{ marginLeft: 4, fontSize: 13 }}>👑</span>}
                            {isCoLeader && <span title="Co-Leader" style={{ marginLeft: 4, fontSize: 12 }}>⭐</span>}
                            {isElder && <span title="Elder" style={{ marginLeft: 4, fontSize: 12 }}>🛡️</span>}
                            {u.isBot && <span className="nc-bot-tag">BOT</span>}
                          </div>
                          {u.customStatus && <div className="nc-member-sub">{u.customStatus}</div>}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {leaders.length > 0 && (
                        <>
                          <div className="nc-member-group-head" style={{ color: '#fee75c' }}>👑 LEADERS — {leaders.length}</div>
                          {leaders.map(renderMember)}
                        </>
                      )}
                      {coLeaders.length > 0 && (
                        <>
                          <div className="nc-member-group-head" style={{ color: '#eb459e' }}>⭐ CO-LEADERS — {coLeaders.length}</div>
                          {coLeaders.map(renderMember)}
                        </>
                      )}
                      {elders.length > 0 && (
                        <>
                          <div className="nc-member-group-head" style={{ color: '#57f287' }}>🛡️ ELDERS — {elders.length}</div>
                          {elders.map(renderMember)}
                        </>
                      )}
                      {regularMembers.length > 0 && (
                        <>
                          <div className="nc-member-group-head">MEMBERS — {regularMembers.length}</div>
                          {regularMembers.map(renderMember)}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </aside>
          )}
        </div>

        {/* Global Floating Personal Call Banner when outside a text/DM chat stage (e.g., Friends, Live, Empty Hub) */}
        {activeDirectCall && !isViewingVoiceStage && !(activeTarget && activeChannel?.type !== 'live') && (
          <div className="nc-global-call-dock">
            <PersonalCallBanner
              call={activeDirectCall}
              me={me}
              users={users}
              micMuted={callState.micMuted}
              onAcceptAudio={() => acceptDirectCallSession(activeDirectCall, false)}
              onAcceptVideo={() => acceptDirectCallSession(activeDirectCall, true)}
              onDeclineOrEnd={hangupCall}
              onToggleMic={toggleMic}
              onExpandStage={() => setDirectCallExpanded(true)}
            />
          </div>
        )}

        {/* Mobile Active Voice Mini-Bar (when browsing text channels while connected to voice) */}
        {callState.status !== 'idle' && !activeDirectCall && !isViewingVoiceStage && (
          <div className="nc-mobile-voice-strip mobile-only">
            <div
              className="nc-mobile-voice-info"
              onClick={() => {
                if (activeVoiceServer && activeVoiceChannel) {
                  setViewMode('server');
                  setActiveServerId(activeVoiceServer.id);
                  setActiveChannelId(activeVoiceChannel.id);
                }
              }}
            >
              <Radio size={14} className="ok-ico" />
              <span>
                {activeVoiceChannel
                  ? `${activeVoiceChannel.name} • Voice Connected`
                  : `${callState.targetLabel || 'Call'} • Connected`}
              </span>
            </div>
            <div className="nc-mobile-voice-actions">
              <button
                type="button"
                className={`nc-icon-btn sm ${callState.micMuted ? 'danger' : ''}`}
                onClick={toggleMic}
                title={callState.micMuted ? 'Unmute' : 'Mute'}
              >
                {callState.micMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                className={`nc-icon-btn sm ${callState.deafened ? 'danger' : ''}`}
                onClick={toggleDeafen}
                title={callState.deafened ? 'Undeafen' : 'Deafen'}
              >
                {callState.deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
              </button>
              <button
                type="button"
                className="nc-icon-btn sm danger"
                onClick={hangupCall}
                title="Disconnect"
              >
                <PhoneOff size={16} />
              </button>
            </div>
          </div>
        )}

        {/* 5. DISCORD-STYLE MOBILE BOTTOM NAVIGATION BAR */}
        <nav className="nc-mobile-bottom-bar mobile-only" aria-label="Mobile Navigation">
          <button
            type="button"
            className={`nc-m-tab ${mobileNavOpen ? 'active' : ''}`}
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            <Hash size={20} />
            <span>Channels</span>
          </button>

          <button
            type="button"
            className={`nc-m-tab ${viewMode === 'home' && !mobileNavOpen ? 'active' : ''}`}
            onClick={() => {
              setViewMode('home');
              setActiveDmUserId('');
              setMobileNavOpen(false);
            }}
          >
            <Users size={20} />
            <span>Friends</span>
            {incomingReq.length > 0 && <span className="nc-m-badge">{incomingReq.length}</span>}
          </button>

          {activeServer && (
            <button
              type="button"
              className={`nc-m-tab ${viewMode === 'server' && (activeChannel?.type === 'live' || activeChannel?.name.includes('squad')) ? 'active' : ''}`}
              onClick={() => {
                setViewMode('server');
                const liveOrSquad =
                  activeServer.channels.find((c) => c.type === 'live') ||
                  activeServer.channels.find((c) => c.name.includes('squad')) ||
                  activeServer.channels[0];
                if (liveOrSquad) selectChannel(activeServer, liveOrSquad);
                setMobileNavOpen(false);
              }}
            >
              <Gamepad2 size={20} />
              <span>Arena</span>
            </button>
          )}

          <button
            type="button"
            className="nc-m-tab"
            onClick={() => setProfileUser(me)}
          >
            <Avatar user={me} size={22} showStatus />
            <span>You</span>
          </button>
        </nav>
      </main>

      {/* MODALS */}
      {showSdkModal && (
        <SdkConsoleModal
          config={config}
          sdkMode={sdkMode}
          sdkDetail={sdkDetail}
          logs={sdkLogs}
          onSaveCredentials={async (payload) => {
            const res = await api.saveCredentials(payload);
            setConfig(res.config);
            if (res.nexconnToken) {
              await nexconn.connect(res.nexconnToken, res.config.appKey, res.config.areaCode);
            }
            return { error: res.error };
          }}
          onClose={() => setShowSdkModal(false)}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          initialTab={createServerTab}
          onCreate={async (name, template) => {
            const { server } = await api.createServer(name, template);
            await runSync();
            selectServer(server);
          }}
          onJoinInvite={async (code) => {
            const { server } = await api.joinInvite(code);
            await runSync();
            selectServer(server);
          }}
          onClose={() => setShowCreateServer(false)}
        />
      )}

      {createChannelCat !== undefined && activeServer && (
        <CreateChannelModal
          server={activeServer}
          defaultCategoryId={createChannelCat}
          onCreate={async (payload) => {
            await api.createChannel(activeServer.id, payload);
            await runSync();
          }}
          onClose={() => setCreateChannelCat(undefined)}
        />
      )}

      {showServerSettings && activeServer && (
        <ServerSettingsModal
          server={activeServer}
          me={me}
          users={users}
          onUpdateServer={async (patch) => {
            await api.updateServer(activeServer.id, patch);
            await runSync();
          }}
          onCreateRole={async (name, color, perms) => {
            await api.createRole(activeServer.id, { name, color, permissions: perms });
            await runSync();
          }}
          onDeleteRole={async (roleId) => {
            await api.deleteRole(activeServer.id, roleId);
            await runSync();
          }}
          onSetRole={async (uid, roleId) => {
            await api.setMemberRole(activeServer.id, uid, roleId);
            await runSync();
          }}
          onRegenInvite={async () => {
            await api.regenInvite(activeServer.id);
            await runSync();
          }}
          onDeleteServer={async () => {
            await api.deleteServer(activeServer.id);
            await runSync();
          }}
          onClose={() => setShowServerSettings(false)}
        />
      )}

      {showUserSettings && (
        <UserSettingsModal
          me={me}
          onUpdateMe={async (patch) => {
            const { user } = await api.updateMe(patch);
            setMe(user);
            await runSync();
          }}
          onLogout={handleLogout}
          onClose={() => setShowUserSettings(false)}
        />
      )}

      {showQuickSwitcher && (
        <QuickSwitcherModal
          servers={servers}
          dms={dms}
          users={users}
          onSelectChannel={(sid, cid) => {
            const s = servers.find((x) => x.id === sid);
            const ch = s?.channels.find((c) => c.id === cid);
            if (s && ch) selectChannel(s, ch);
          }}
          onSelectDm={(uid) => openDm(uid)}
          onClose={() => setShowQuickSwitcher(false)}
        />
      )}

      {profileUser && (
        <UserProfileModal
          user={profileUser}
          me={me}
          server={viewMode === 'server' ? activeServer : null}
          isFriend={friends.includes(profileUser.id)}
          onStartDm={(uid) => openDm(uid)}
          onStartCall={(uid, video) => startDirectCall(uid, video)}
          onAddFriend={async (uid) => {
            await api.requestFriend({ userId: uid });
            await runSync();
          }}
          onSetRole={async (uid, roleId) => {
            if (!activeServer) return;
            await api.setMemberRole(activeServer.id, uid, roleId);
            await runSync();
          }}
          onToggleRole={async (uid, roleId) => {
            if (!activeServer) return;
            const m = activeServer.members.find((x) => x.userId === uid);
            if (!m) return;
            const next = m.roles.includes(roleId)
              ? m.roles.filter((r) => r !== roleId)
              : [...m.roles, roleId];
            await api.updateMember(activeServer.id, uid, { roles: next });
            await runSync();
          }}
          onKick={async (uid) => {
            if (!activeServer) return;
            await api.kickMember(activeServer.id, uid);
            await runSync();
          }}
          onOpenSettings={() => setShowUserSettings(true)}
          onLogout={handleLogout}
          onClose={() => setProfileUser(null)}
        />
      )}

      {!activeDirectCall && incomingCall && (
        <IncomingCallModal
          caller={users[incomingCall.callerId]}
          callerId={incomingCall.callerId}
          isVideo={incomingCall.isVideo}
          onAcceptAudio={async () => {
            const c = incomingCall;
            setIncomingCall(null);
            nexconn.unlockAudio();
            await nexconn.ensureLocalMedia(true, false);
            await nexconn.acceptCall(c.callId, false);
            nexconn.connectToPeer(c.callerId, c.callId).catch(() => {});
            setCallState({
              status: 'connected',
              callId: c.callId,
              isGroup: false,
              mediaType: 'audio',
              peerIds: [c.callerId],
              targetLabel: users[c.callerId]?.displayName || c.callerId,
              startedAt: Date.now(),
              micMuted: false,
              cameraEnabled: false,
              deafened: false,
              screenSharing: false,
            });
          }}
          onAcceptVideo={async () => {
            const c = incomingCall;
            setIncomingCall(null);
            nexconn.unlockAudio();
            await nexconn.ensureLocalMedia(true, true);
            await nexconn.acceptCall(c.callId, true);
            nexconn.connectToPeer(c.callerId, c.callId).catch(() => {});
            setCallState({
              status: 'connected',
              callId: c.callId,
              isGroup: false,
              mediaType: 'video',
              peerIds: [c.callerId],
              targetLabel: users[c.callerId]?.displayName || c.callerId,
              startedAt: Date.now(),
              micMuted: false,
              cameraEnabled: true,
              deafened: false,
              screenSharing: false,
            });
          }}
          onDecline={async () => {
            const c = incomingCall;
            setIncomingCall(null);
            await nexconn.endCall(c.callId);
          }}
        />
      )}

      {showAdminModal && me?.isAdmin && (
        <AdminPanel
          currentUser={me}
          onClose={() => setShowAdminModal(false)}
        />
      )}

      {fullscreenImage && (
        <div
          className="nc-lightbox-overlay"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="nc-lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <div className="nc-lightbox-title">
              <span className="nc-lightbox-name">{fullscreenImage.name}</span>
            </div>
            <div className="nc-lightbox-actions">
              <button
                type="button"
                className="nc-lightbox-btn primary"
                onClick={() => downloadFile(fullscreenImage.url, fullscreenImage.name)}
                title="Download this picture"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
              <button
                type="button"
                className="nc-lightbox-btn close"
                onClick={() => setFullscreenImage(null)}
                title="Close Fullscreen (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="nc-lightbox-content" onClick={() => setFullscreenImage(null)}>
            <img
              src={fullscreenImage.url}
              alt={fullscreenImage.name}
              className="nc-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
