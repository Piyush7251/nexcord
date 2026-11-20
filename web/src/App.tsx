import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Edit3,
  Gamepad2,
  Hash,
  Headphones,
  ImagePlus,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneOff,
  Pin,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  Trash2,
  Tv,
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
  LiveHypeBurst,
  NexconnConfig,
  QuickChatPreset,
  ReplyReference,
  SdkLogEntry,
  Server,
  SquadLobbyState,
  User,
} from './types';
import { api, getApiBase, getSessionToken, setSessionToken } from './services/api';
import { nexconn, targetKeyOf } from './services/nexconn';
import type { ChannelTarget, SdkConnectionMode } from './services/nexconn';
import { Avatar } from './components/Avatar';
import { QuickChatBar } from './components/QuickChatBar';
import { SquadLobbyBanner } from './components/SquadLobbyBanner';
import { LiveStreamStage } from './components/LiveStreamStage';
import { IncomingCallModal, VoiceCallStage } from './components/VoiceCallStage';
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
import './App.css';

const QUICK_EMOJIS = ['🔥', '❤️', '😂', '⚡', '👑', '👍', '🎯', '🚀'];

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
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

export function App() {
  const [me, setMe] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [incomingReq, setIncomingReq] = useState<string[]>([]);
  const [outgoingReq, setOutgoingReq] = useState<string[]>([]);
  const [dms, setDms] = useState<string[]>([]);
  const [squadState, setSquadState] = useState<Record<string, SquadLobbyState>>({});
  const [myVoice, setMyVoice] = useState<{ serverId: string; channelId: string } | null>(null);

  // Navigation
  const [viewMode, setViewMode] = useState<'home' | 'server'>('home');
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [activeDmUserId, setActiveDmUserId] = useState<string>('');
  const [friendsTab, setFriendsTab] = useState<'online' | 'all' | 'pending' | 'add' | 'contacts'>('online');
  const [contactMatches, setContactMatches] = useState<Array<{
    user: User;
    contactName: string;
    phone: string;
    isFriend: boolean;
    hasPendingOutgoing: boolean;
    hasPendingIncoming: boolean;
  }>>([]);
  const [manualContactsInput, setManualContactsInput] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [showMemberList, setShowMemberList] = useState(true);
  const [showPinsDrawer, setShowPinsDrawer] = useState(false);
  const [showSquadBannerOverride, setShowSquadBannerOverride] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Modals
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [createChannelCat, setCreateChannelCat] = useState<string | null | undefined>(undefined);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);
  const activeTargetKeyRef = useRef('');

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) || null,
    [servers, activeServerId],
  );
  const activeChannel = useMemo(
    () => activeServer?.channels.find((c) => c.id === activeChannelId) || null,
    [activeServer, activeChannelId],
  );

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

  // ---------------------------------------------------------------- sync & boot
  const runSync = useCallback(async () => {
    const data = await api.sync();
    setMe(data.me);
    setServers(data.servers);
    setUsers(data.users);
    setFriends(data.friends);
    setIncomingReq(data.incoming);
    setOutgoingReq(data.outgoing);
    setDms(data.dms);
    setSquadState(data.squadState || {});
    setMyVoice(data.myVoice);

    setActiveServerId((prev) => {
      if (prev && data.servers.some((s) => s.id === prev)) return prev;
      return data.servers[0]?.id || '';
    });
    setActiveChannelId((prev) => {
      const targetSrv = data.servers.find((s) => s.id === activeServerId) || data.servers[0];
      if (!targetSrv) return '';
      if (prev && targetSrv.channels.some((c) => c.id === prev)) return prev;
      const squad = targetSrv.channels.find((c) => c.name === 'squad-chat-room');
      return squad?.id || targetSrv.channels.find((c) => c.type !== 'voice')?.id || targetSrv.channels[0]?.id || '';
    });
  }, [activeServerId]);

  const bootstrapSession = useCallback(
    async (nexconnToken: string) => {
      const cfg = await api.getConfig().catch(() => ({ appKey: '', areaCode: 2, apiHost: 'api.sg-light-api.com', configured: false }));
      setConfig(cfg);
      await nexconn.connect(nexconnToken, cfg.appKey, cfg.areaCode);
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
    });
  }, []);

  // Unlock mobile browser Web Audio on first user interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      nexconn.unlockAudio();
    };
    window.addEventListener('click', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
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
        await bootstrapSession(res.nexconnToken);
      } catch {
        setSessionToken('');
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
    es.addEventListener('squad', (e: MessageEvent) => {
      try {
        const { key, state } = JSON.parse(e.data);
        setSquadState((prev) => ({ ...prev, [key]: state }));
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeTargetKey]);

  // Ctrl+K Quick Switcher
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const handleMapPing = async (x: number, y: number, label: string) => {
    if (!activeTarget) return;
    const msg = await nexconn.sendTextMessage(activeTarget, `📍 Tactical Ping at **${label}** (${x}, ${y}) — Eyes here!`, {
      type: 'quickchat',
      metadata: { category: 'tactical', badge: 'MAP PING', coords: { x, y, label } },
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
    const msg = await nexconn.sendMediaFile(activeTarget, file, composerText.trim());
    setComposerText('');
    setMessagesByKey((prev) => {
      const cur = prev[activeTargetKey] || [];
      if (cur.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [activeTargetKey]: [...cur, msg] };
    });
  };

  const handleComposerChange = (val: string) => {
    setComposerText(val);
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

  // ---------------------------------------------------------------- Voice & Call actions
  const joinVoiceChannel = async (srv: Server, ch: Channel) => {
    nexconn.unlockAudio();
    await nexconn.ensureLocalMedia(true, false);
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
    peers.forEach((peerId) => {
      nexconn.connectToPeer(peerId, callId).catch(() => {});
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

  const startDirectCall = async (userId: string, video: boolean) => {
    nexconn.unlockAudio();
    await nexconn.ensureLocalMedia(true, video);
    const u = users[userId];
    const callId = await nexconn.startCall({
      calleeIds: [userId],
      isGroup: false,
      video,
    });
    nexconn.connectToPeer(userId, callId).catch(() => {});
    setCallState({
      status: 'connected',
      callId,
      isGroup: false,
      mediaType: video ? 'video' : 'audio',
      peerIds: [userId],
      targetLabel: u?.displayName || userId,
      startedAt: Date.now(),
      micMuted: false,
      cameraEnabled: video,
      deafened: false,
      screenSharing: false,
    });
  };

  const hangupCall = async () => {
    await nexconn.endCall(callState.callId);
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
    await nexconn.toggleCamera(nextCam);
    setCallState((prev) => ({ ...prev, cameraEnabled: nextCam }));
    if (myVoice) await api.updateVoiceState({ video: nextCam }).catch(() => {});
  };

  const toggleScreenShare = async () => {
    const nextShare = !callState.screenSharing;
    const stream = await nexconn.toggleScreenShare(nextShare);
    const active = nextShare && !!stream;
    setCallState((prev) => ({ ...prev, screenSharing: active }));
    if (myVoice) await api.updateVoiceState({ streaming: active }).catch(() => {});
  };

  // ---------------------------------------------------------------- Render Guards
  if (!authReady) {
    return (
      <div className="nc-loading-screen">
        <Gamepad2 size={36} />
        <span>Loading Nexcord...</span>
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
      />
    );
  }

  const isSquadRoom = activeChannel?.name === 'squad-chat-room' || showSquadBannerOverride;
  const activeVoiceChannel = myVoice
    ? servers.find((s) => s.id === myVoice.serverId)?.channels.find((c) => c.id === myVoice.channelId) || null
    : null;
  const activeVoiceServer = myVoice ? servers.find((s) => s.id === myVoice.serverId) || null : null;

  const isViewingVoiceStage =
    (viewMode === 'server' && activeChannel?.type === 'voice') ||
    (viewMode === 'home' && callState.status !== 'idle' && callState.peerIds.includes(activeDmUserId));

  const typingUsers = Object.entries(typingByKey[activeTargetKey] || {})
    .filter(([uid]) => uid !== me.id)
    .map(([, v]) => v.name);

  const dmUser = activeDmUserId ? users[activeDmUserId] : null;
  const currentPins = activeServer && activeChannel ? activeServer.pins[activeChannel.id] || [] : [];

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
            onClick={() => setShowCreateServer(true)}
            title="Create a Group / Server (+)"
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="nc-rail-item-wrap">
          <button
            type="button"
            className={`nc-rail-icon contacts ${viewMode === 'home' && friendsTab === 'contacts' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('home');
              setActiveDmUserId('');
              setFriendsTab('contacts');
            }}
            title="Contacts Suggestions & Sync"
          >
            <Phone size={19} />
          </button>
        </div>

        <div className="nc-rail-spacer" />

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

        <div className="nc-rail-item-wrap">
          <button
            type="button"
            className={`nc-rail-icon sdk ${sdkMode}`}
            onClick={() => setShowSdkModal(true)}
            title={`Nexconn SDK (${sdkMode}) — Click to inspect or configure`}
          >
            <Activity size={20} />
          </button>
        </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                <span className="nc-srv-title">{activeServer.name}</span>
                <span style={{ fontSize: '11px', color: copiedServerId ? '#3BA55C' : 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.9 }}>
                  {copiedServerId ? '✓ Copied ID to clipboard!' : `ID: ${activeServer.id}`}
                </span>
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
                  {(['online', 'all', 'pending', 'add', 'contacts'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`nc-friend-tab ${friendsTab === t ? 'active' : ''} ${t === 'add' ? 'add-btn' : ''} ${t === 'contacts' ? 'contacts-btn' : ''}`}
                      onClick={() => setFriendsTab(t)}
                    >
                      {t === 'add' ? 'Add Friend' : t === 'contacts' ? '📱 Contacts' : t[0].toUpperCase() + t.slice(1)}
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
                  onClick={() => startDirectCall(dmUser.id, false)}
                  title="Start Voice Call (Nexconn Call SDK)"
                >
                  <Phone size={18} />
                </button>
                <button
                  type="button"
                  className="nc-icon-btn"
                  onClick={() => startDirectCall(dmUser.id, true)}
                  title="Start Video Call (Nexconn Call SDK)"
                >
                  <Video size={18} />
                </button>
              </>
            )}

            {viewMode === 'server' && activeChannel && activeChannel.type !== 'voice' && activeChannel.type !== 'live' && (
              <>
                <button
                  type="button"
                  className={`nc-icon-btn ${isSquadRoom ? 'active' : ''}`}
                  onClick={() => setShowSquadBannerOverride((v) => !v)}
                  title="Toggle Squad Room Lobby & Tactical Map"
                >
                  <Gamepad2 size={18} />
                </button>
                <button
                  type="button"
                  className={`nc-icon-btn ${showPinsDrawer ? 'active' : ''} desktop-only`}
                  onClick={() => setShowPinsDrawer((v) => !v)}
                  title="Pinned Messages"
                >
                  <Pin size={18} />
                </button>
                <button
                  type="button"
                  className={`nc-icon-btn ${showSearch ? 'active' : ''} desktop-only`}
                  onClick={() => setShowSearch((v) => !v)}
                  title="Search Channel Messages"
                >
                  <Search size={18} />
                </button>
              </>
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

            <button
              type="button"
              className={`nc-sdk-header-pill ${sdkMode} desktop-only`}
              onClick={() => setShowSdkModal(true)}
              title="Open Nexconn Chat & Call SDK Console"
            >
              <span className="nc-sdk-dot" />
              <span>{sdkMode === 'connected' ? 'Nexconn Live' : 'Nexconn SDK'}</span>
            </button>
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
                  </div>
                ) : friendsTab === 'contacts' ? (
                  <div className="nc-contacts-view">
                    <div className="nc-contacts-hero">
                      <div className="nc-contacts-icon">
                        <Phone size={28} />
                      </div>
                      <div>
                        <h3>Sync Contacts & Find Friends</h3>
                        <p>Grant permission or check phone numbers to discover which of your friends and contacts are already on Nexcord.</p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="nc-btn primary"
                        disabled={contactBusy}
                        onClick={async () => {
                          setContactFeedback(null);
                          setContactBusy(true);
                          try {
                            if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as any).contacts) {
                              const props = ['name', 'tel'];
                              const contacts = await (navigator as any).contacts.select(props, { multiple: true });
                              const list = contacts.map((c: any) => ({
                                name: Array.isArray(c.name) ? c.name[0] : c.name || '',
                                phone: Array.isArray(c.tel) ? c.tel[0] : c.tel || '',
                              })).filter((c: any) => c.phone);
                              const res = await api.matchContacts({ contacts: list });
                              setContactMatches(res.matches);
                              setContactFeedback(`Found ${res.matches.length} contacts registered on Nexcord!`);
                            } else {
                              setContactFeedback('Mobile device Contacts API not directly supported in this browser window. You can check phone numbers below!');
                            }
                          } catch (err: any) {
                            setContactFeedback(err?.message || 'Contact access cancelled.');
                          } finally {
                            setContactBusy(false);
                          }
                        }}
                      >
                        <Phone size={15} />
                        <span>{contactBusy ? 'Scanning Contacts...' : '📱 Request Contact Access (Device)'}</span>
                      </button>
                    </div>

                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!manualContactsInput.trim()) return;
                        setContactFeedback(null);
                        setContactBusy(true);
                        try {
                          const nums = manualContactsInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
                          const res = await api.matchContacts({ phoneNumbers: nums });
                          setContactMatches(res.matches);
                          setContactFeedback(`Scanned ${nums.length} numbers: found ${res.matches.length} matching friends on Nexcord!`);
                        } catch (err: any) {
                          setContactFeedback(err?.message || 'Failed to check contacts.');
                        } finally {
                          setContactBusy(false);
                        }
                      }}
                      className="nc-contacts-form"
                    >
                      <label className="nc-field">
                        <span>CHECK MOBILE NUMBERS (COMMA OR LINE SEPARATED)</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={manualContactsInput}
                            onChange={(e) => setManualContactsInput(e.target.value)}
                            placeholder="e.g. +91 98765 43210, +91 72518 80344"
                          />
                          <button type="submit" className="nc-btn secondary" disabled={contactBusy}>
                            Check
                          </button>
                        </div>
                      </label>
                    </form>

                    {contactFeedback && (
                      <div className="nc-ok-banner" style={{ margin: '12px 0' }}>
                        {contactFeedback}
                      </div>
                    )}

                    <div className="nc-contacts-list">
                      <div className="nc-list-subhead">
                        SUGGESTED FRIENDS FROM CONTACTS ({contactMatches.length})
                      </div>
                      {contactMatches.length === 0 ? (
                        <div className="nc-empty-state">
                          No registered contacts found yet. Share the app with your friends to connect!
                        </div>
                      ) : (
                        contactMatches.map((m) => (
                          <div key={m.user.id} className="nc-friend-row">
                            <Avatar user={m.user} size={36} showStatus />
                            <div className="nc-friend-info">
                              <strong>{m.contactName} {m.contactName !== m.user.displayName ? `(@${m.user.displayName})` : ''}</strong>
                              <span style={{ color: 'var(--text-muted)' }}>{m.phone}</span>
                            </div>
                            <div className="nc-friend-btns">
                              {m.isFriend ? (
                                <button type="button" className="nc-btn xs secondary" onClick={() => openDm(m.user.id)}>
                                  <MessageSquare size={13} />
                                  <span>Message</span>
                                </button>
                              ) : m.hasPendingOutgoing ? (
                                <span className="nc-muted" style={{ fontSize: 13 }}>Request Sent ⏳</span>
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
                                  <UserPlus size={13} />
                                  <span>Add Friend</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
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
                      <div className="nc-empty-state">No pending friend requests.</div>
                    )}
                  </div>
                ) : (
                  <div className="nc-friend-list">
                    {(() => {
                      const list = friends.filter((uid) =>
                        friendsTab === 'online' ? users[uid]?.status !== 'offline' : true,
                      );
                      return (
                        <>
                          <div className="nc-list-subhead">
                            {friendsTab.toUpperCase()} — {list.length}
                          </div>
                          {list.map((uid) => {
                            const u = users[uid];
                            return (
                              <div key={uid} className="nc-friend-row">
                                <Avatar user={u} size={36} showStatus />
                                <div className="nc-friend-info">
                                  <strong>{u?.displayName || uid}</strong>
                                  <span>{u?.customStatus || u?.status || 'offline'}</span>
                                </div>
                                <div className="nc-friend-btns">
                                  <button type="button" className="nc-icon-btn" onClick={() => openDm(uid)} title="Message">
                                    <MessageSquare size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="nc-icon-btn"
                                    onClick={() => startDirectCall(uid, false)}
                                    title="Voice Call"
                                  >
                                    <Phone size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="nc-icon-btn"
                                    onClick={() => startDirectCall(uid, true)}
                                    title="Video Call"
                                  >
                                    <Video size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {list.length === 0 && (
                            <div className="nc-empty-state">No friends to show here yet.</div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
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
                onInviteUser={(uid) => nexconn.inviteToCall([uid])}
              />
            )}

            {/* Case D: Standard Text / Squad Chat Room / DM Chat */}
            {activeTarget && activeChannel?.type !== 'live' && !isViewingVoiceStage && (
              <div className="nc-chat-stage">
                {viewMode === 'server' && activeServer && activeChannel && isSquadRoom && (
                  <SquadLobbyBanner
                    server={activeServer}
                    channelId={activeChannel.id}
                    me={me}
                    users={users}
                    squadState={squadState[`${activeServer.id}:${activeChannel.id}`]}
                    onUpdateSquad={async (patch) => {
                      const res = await api.updateSquadState(activeServer.id, activeChannel.id, patch);
                      setSquadState((prev) => ({
                        ...prev,
                        [`${activeServer.id}:${activeChannel.id}`]: res.state,
                      }));
                    }}
                    onMapPing={handleMapPing}
                    onJoinSquadVoice={() => {
                      const vc = activeServer.channels.find((c) => c.type === 'voice');
                      if (vc) selectChannel(activeServer, vc);
                    }}
                  />
                )}

                <div className="nc-messages-scroll">
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
                        : activeChannel?.topic || `This is the start of #${activeChannel?.name}.`}
                    </p>
                  </div>

                  {activeMessages.map((m, idx) => {
                    const prev = activeMessages[idx - 1];
                    const grouped =
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
                      <div
                        key={m.id}
                        className={`nc-msg-row ${grouped ? 'grouped' : ''} ${m.type === 'quickchat' ? 'quickchat' : ''}`}
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
                          ) : (
                            <div className="nc-msg-text">
                              {renderMessageText(m.text)}
                              {m.editedAt && <span className="nc-edited">(edited)</span>}
                            </div>
                          )}

                          {m.attachments && m.attachments.length > 0 && (
                            <div className="nc-attachments">
                              {m.attachments.map((att, ai) =>
                                att.isImage ? (
                                  <img key={ai} src={att.dataUrl} alt={att.name} className="nc-att-img" />
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
                          {viewMode === 'server' && activeServer && activeChannel && (
                            <button
                              type="button"
                              onClick={() =>
                                api
                                  .pinMessage(activeServer.id, activeChannel.id, {
                                    id: m.id,
                                    senderId: m.senderId,
                                    text: m.text,
                                    createdAt: m.createdAt,
                                  })
                                  .then(runSync)
                              }
                              title="Pin Message"
                            >
                              <Pin size={15} />
                            </button>
                          )}
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
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* In-Match Quick Chat Bar */}
                <QuickChatBar
                  onSendQuickChat={handleSendQuickChat}
                  defaultOpen={activeChannel?.name === 'squad-chat-room'}
                />

                {/* Typing Indicator & Reply Preview */}
                {typingUsers.length > 0 && (
                  <div className="nc-typing-bar">
                    <span className="nc-typing-dots">•••</span>
                    <span>
                      <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </span>
                  </div>
                )}

                {replyTo && (
                  <div className="nc-reply-banner">
                    <span>
                      Replying to <strong>{users[replyTo.senderId]?.displayName || replyTo.senderId}</strong>:{' '}
                      {replyTo.text}
                    </span>
                    <button type="button" className="nc-icon-btn sm" onClick={() => setReplyTo(null)}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <form className="nc-composer" onSubmit={handleSend}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    onChange={handleUploadFile}
                  />
                  <button
                    type="button"
                    className="nc-icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload Image or File (Nexconn Helper)"
                  >
                    <ImagePlus size={20} />
                  </button>
                  <input
                    value={composerText}
                    onChange={(e) => handleComposerChange(e.target.value)}
                    placeholder={
                      viewMode === 'home' && dmUser
                        ? `Message @${dmUser.displayName}`
                        : `Message #${activeChannel?.name || 'channel'} (try @everyone or Alt+1..5 for Quick Chat)`
                    }
                  />
                  <div className="nc-composer-right">
                    <button
                      type="button"
                      className="nc-icon-btn"
                      onClick={() => setShowComposerEmoji((v) => !v)}
                      title="Emoji"
                    >
                      <Smile size={20} />
                    </button>
                    {showComposerEmoji && (
                      <div className="nc-emoji-pop composer">
                        {QUICK_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              setComposerText((p) => p + em);
                              setShowComposerEmoji(false);
                            }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="submit" className="nc-send-btn" disabled={!composerText.trim()}>
                      <Send size={17} />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* 4. RIGHT DRAWER: PINS OR MEMBER LIST */}
          {viewMode === 'server' && activeServer && showPinsDrawer && (
            <aside className="nc-right-drawer">
              <div className="nc-drawer-head">
                <span>PINNED MESSAGES ({currentPins.length})</span>
                <button type="button" className="nc-icon-btn sm" onClick={() => setShowPinsDrawer(false)}>
                  <X size={15} />
                </button>
              </div>
              <div className="nc-drawer-scroll">
                {currentPins.length === 0 ? (
                  <div className="nc-empty-state">No pinned messages in this channel yet.</div>
                ) : (
                  currentPins.map((p) => {
                    const u = users[p.senderId];
                    return (
                      <div key={p.id} className="nc-pin-card">
                        <div className="nc-pin-head">
                          <Avatar user={u} size={22} />
                          <strong>{u?.displayName || p.senderId}</strong>
                          <button
                            type="button"
                            className="nc-icon-btn sm"
                            onClick={() =>
                              activeChannel &&
                              api.unpinMessage(activeServer.id, activeChannel.id, p.id).then(runSync)
                            }
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <p>{p.text}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          )}

          {viewMode === 'server' && activeServer && showMemberList && !showPinsDrawer && activeChannel?.type !== 'live' && (
            <aside className="nc-right-drawer members">
              <div className="nc-drawer-scroll">
                {(() => {
                  const onlineMembers = activeServer.members.filter((m) => {
                    const u = m.userId === me.id ? me : users[m.userId];
                    return u && u.status !== 'offline';
                  });
                  const offlineMembers = activeServer.members.filter((m) => {
                    const u = m.userId === me.id ? me : users[m.userId];
                    return !u || u.status === 'offline';
                  });
                  const renderMember = (m: Server['members'][number]) => {
                    const u = m.userId === me.id ? me : users[m.userId];
                    if (!u) return null;
                    const role = m.roles.map((r) => activeServer.roles.find((x) => x.id === r)).find(Boolean);
                    return (
                      <div key={m.userId} className="nc-member-row" onClick={() => setProfileUser(u)}>
                        <Avatar user={u} size={32} showStatus />
                        <div className="nc-member-meta">
                          <div className="nc-member-name" style={{ color: role?.color }}>
                            <span>{m.nickname || u.displayName}</span>
                            {u.isBot && <span className="nc-bot-tag">BOT</span>}
                          </div>
                          {u.customStatus && <div className="nc-member-sub">{u.customStatus}</div>}
                        </div>
                      </div>
                    );
                  };
                  return (
                    <>
                      <div className="nc-member-group-head">ONLINE — {onlineMembers.length}</div>
                      {onlineMembers.map(renderMember)}
                      {offlineMembers.length > 0 && (
                        <>
                          <div className="nc-member-group-head">OFFLINE — {offlineMembers.length}</div>
                          {offlineMembers.map(renderMember)}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </aside>
          )}
        </div>

        {/* Mobile Active Voice Mini-Bar (when browsing text channels while connected to voice) */}
        {callState.status !== 'idle' && !isViewingVoiceStage && (
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

      {incomingCall && (
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
    </div>
  );
}

export default App;
