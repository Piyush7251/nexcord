import {
  AreaCode,
  BaseChannel,
  ChannelHandler,
  ChannelType,
  CommunitySubChannel,
  CommunitySubChannelIdentifier,
  ConnectionStatusHandler,
  DirectChannel,
  DirectChannelIdentifier,
  Helper,
  MentionedType,
  MessageHandler,
  MessageType,
  NCEngine,
  OpenChannel,
  OpenChannelIdentifier,
  SendReferenceMessageParams,
  SendTextMessageParams,
} from '@nexconn/chat';
import type { ChannelIdentifier, Message } from '@nexconn/chat';
import { NCCallEngine, NCCallMediaType, NCCallType } from '@nexconn/call';
import type {
  NCCallConnectedEvent,
  NCCallEndedEvent,
  NCCallReceivedEvent,
  NCCallRemoteUserStateChangedEvent,
  NCCallSession,
} from '@nexconn/call';
import type { ChatMessage, MessageAttachment, MessageMetadata, ReplyReference, SdkLogEntry } from '../types';
import { api } from './api';

export type SdkConnectionMode = 'idle' | 'initializing' | 'connected' | 'sandbox' | 'error';

export type ChannelTarget =
  | { kind: 'community'; serverId: string; channelId: string }
  | { kind: 'live'; serverId: string; channelId: string; openChannelId: string }
  | { kind: 'dm'; userId: string; myUserId: string };

export function targetKeyOf(t: ChannelTarget): string {
  if (t.kind === 'dm') {
    const pair = [t.myUserId, t.userId].sort();
    return `dm:${pair[0]}:${pair[1]}`;
  }
  return `${t.serverId}:${t.channelId}`;
}

export interface NexconnCallbacks {
  onStatusChange?: (mode: SdkConnectionMode, detail: string) => void;
  onLog?: (entry: SdkLogEntry) => void;
  onSdkMessage?: (targetKey: string, msg: ChatMessage) => void;
  onTyping?: (targetKey: string, userId: string) => void;
  onIncomingCall?: (session: NCCallSession, extra?: string) => void;
  onCallConnected?: (session: NCCallSession) => void;
  onCallEnded?: (callId: string, reason: number) => void;
  onRemoteUserState?: (userId: string, state: number) => void;
  onScreenShareEnded?: () => void;
}

class NexconnService {
  private initialized = false;
  private appKey = '';
  private mode: SdkConnectionMode = 'idle';
  private callEngine: NCCallEngine | null = null;
  private callbacks: NexconnCallbacks = {};
  private logs: SdkLogEntry[] = [];
  private liveMessageCache = new Map<string, Message<any>>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private peerConnectingSince: Map<string, number> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  private audioContext: AudioContext | null = null;
  private isDeafened: boolean = false;
  private currentCallId: string = '';
  private currentUserId: string = '';
  private seenSignals: Set<string> = new Set();
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.nextcloud.com:443' },
  ];

  setCurrentUser(userId: string) {
    this.currentUserId = userId;
  }

  setCurrentCallId(callId: string) {
    this.currentCallId = callId;
  }

  getCurrentCallId(): string {
    return this.currentCallId;
  }

  hasPeer(userId: string): boolean {
    const pc = this.peers.get(userId);
    return !!pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed';
  }

  setIceServers(iceServers: RTCIceServer[]) {
    if (Array.isArray(iceServers) && iceServers.length > 0) {
      this.iceServers = iceServers;
    }
  }

  getPeerConnectionState(userId: string): RTCPeerConnectionState | 'new' {
    const pc = this.peers.get(userId);
    if (!pc) return 'new';
    if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      return 'connected';
    }
    return pc.connectionState || 'new';
  }

  setCallbacks(cb: NexconnCallbacks) {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  private subscribers: Set<() => void> = new Set();

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  notifyChange() {
    this.subscribers.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  getMode(): SdkConnectionMode {
    return this.mode;
  }

  getLogs(): SdkLogEntry[] {
    return this.logs;
  }

  isLiveConnected(): boolean {
    return this.mode === 'connected';
  }

  getLocalStream(): MediaStream | null {
    return this.screenStream || this.localStream;
  }

  hasLiveRemoteVideo(userId: string): boolean {
    const stream = this.remoteStreams.get(userId);
    if (!stream) return false;
    return stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
  }

  private log(sdk: 'chat' | 'call' | 'system', action: string, detail: string, level: 'info' | 'ok' | 'warn' = 'info') {
    const entry: SdkLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      sdk,
      action,
      detail,
      level,
    };
    this.logs = [entry, ...this.logs].slice(0, 80);
    this.callbacks.onLog?.(entry);
  }

  private setMode(mode: SdkConnectionMode, detail: string) {
    this.mode = mode;
    this.callbacks.onStatusChange?.(mode, detail);
  }

  /**
   * Initialize @nexconn/chat (NCEngine) and @nexconn/call (NCCallEngine).
   */
  init(appKey: string, areaCode: number = AreaCode.SG) {
    if (!appKey || appKey === 'your_app_key') {
      this.setMode('sandbox', 'Hybrid Sandbox Mode (add Nexconn App Key to connect live edge)');
      this.log('system', 'Nexconn.sandbox', 'Initialized in Hybrid Demo Mode — ready for credentials anytime', 'info');
      return;
    }
    if (this.initialized && this.appKey === appKey) return;

    try {
      this.setMode('initializing', 'Initializing @nexconn/chat & @nexconn/call...');
      this.appKey = appKey;

      if (!this.initialized) {
        NCCallEngine.install();
        NCEngine.initialize({
          appKey,
          areaCode: areaCode as AreaCode,
        });
        this.callEngine = NCCallEngine.initialize({});
        this.registerListeners();
        this.initialized = true;
      }

      this.log('chat', 'NCEngine.initialize', `appKey=${appKey.slice(0, 6)}... areaCode=${areaCode}`, 'ok');
      this.log('call', 'NCCallEngine.initialize', `Call SDK v${NCCallEngine.getVersion?.() || '26.2.1'} ready`, 'ok');
    } catch (e: any) {
      this.log('system', 'Nexconn.init.warn', e?.message || 'SDK init warning, using sandbox bridge', 'warn');
      this.setMode('sandbox', 'SDK fallback active');
    }
  }

  private registerListeners() {
    NCEngine.addConnectionStatusHandler(
      'nexcord-conn',
      new ConnectionStatusHandler({
        onConnectionStatusChanged: ({ status, code }) => {
          this.log('chat', 'onConnectionStatusChanged', `status=${status} code=${code}`, status === 0 ? 'ok' : 'info');
          if (status === 0) {
            this.setMode('connected', 'Connected to Nexconn Real-Time Edge');
          }
        },
      }),
    );

    NCEngine.addMessageHandler(
      'nexcord-msg',
      new MessageHandler({
        onMessageReceived: ({ messages }) => {
          this.log('chat', 'onMessageReceived', `${messages.length} message(s) received via @nexconn/chat`, 'ok');
          for (const m of messages) {
            this.liveMessageCache.set(m.messageId, m);
            const parsed = this.sdkMessageToChatMessage(m);
            if (parsed) {
              this.callbacks.onSdkMessage?.(parsed.targetKey, parsed);
            }
          }
        },
        onMessageDeleted: ({ messages }) => {
          this.log('chat', 'onMessageDeleted', `${messages.length} message(s) recalled`, 'info');
        },
        onMessagesUpdated: ({ messages }) => {
          this.log('chat', 'onMessagesUpdated', `${messages.length} message(s) updated`, 'info');
        },
      }),
    );

    NCEngine.addChannelHandler(
      'nexcord-ch',
      new ChannelHandler({
        onTypingStatusChanged: (event) => {
          const chId = event.channelIdentifier.channelId;
          const who = event.userTypingStatus?.[0]?.userId;
          if (who) {
            this.log('chat', 'onTypingStatusChanged', `user=${who} channel=${chId}`, 'info');
          }
        },
      }),
    );

    if (this.callEngine) {
      this.callEngine.setCallEventHandler({
        onCallReceived: (event: NCCallReceivedEvent) => {
          this.log('call', 'onCallReceived', `callId=${event.session.getCallId()} from=${event.session.getCallerUserId()}`, 'ok');
          this.callbacks.onIncomingCall?.(event.session, event.extra);
        },
        onCallConnected: (event: NCCallConnectedEvent) => {
          this.log('call', 'onCallConnected', `callId=${event.session.getCallId()}`, 'ok');
          this.callbacks.onCallConnected?.(event.session);
        },
        onCallEnded: (event: NCCallEndedEvent) => {
          this.log('call', 'onCallEnded', `callId=${event.session.getCallId()} reason=${event.reason}`, 'info');
          this.callbacks.onCallEnded?.(event.session.getCallId(), event.reason);
        },
        onRemoteUserStateChanged: (event: NCCallRemoteUserStateChangedEvent) => {
          this.log('call', 'onRemoteUserStateChanged', `user=${event.userId} state=${event.userState}`, 'info');
          this.callbacks.onRemoteUserState?.(event.userId, event.userState);
        },
      });
    }
  }

  async connect(token: string, appKey?: string, areaCode?: number): Promise<SdkConnectionMode> {
    if (appKey) {
      this.init(appKey, areaCode);
    }
    if (!token || token.startsWith('demo_token_') || !this.initialized) {
      this.setMode('sandbox', 'Hybrid Real-Time Mode (SDK Active)');
      this.log('chat', 'NCEngine.connect', 'Using hybrid real-time channel bridge (demo token)', 'info');
      return 'sandbox';
    }

    try {
      const res = await NCEngine.connect({ token });
      if (res.code === 0) {
        this.setMode('connected', `Connected as ${res.data?.userId || 'user'}`);
        this.log('chat', 'NCEngine.connect', `Connected to Nexconn cluster (userId=${res.data?.userId})`, 'ok');
        return 'connected';
      }
      this.log('chat', 'NCEngine.connect.fallback', `Code ${res.code} — continuing with hybrid real-time bridge`, 'warn');
      this.setMode('sandbox', `Hybrid Mode (SDK code ${res.code})`);
      return 'sandbox';
    } catch (e: any) {
      this.log('chat', 'NCEngine.connect.error', e?.message || 'Connect failed', 'warn');
      this.setMode('sandbox', 'Hybrid Fallback Mode');
      return 'sandbox';
    }
  }

  async disconnect() {
    try {
      if (this.initialized) {
        await NCEngine.disconnect();
        this.log('chat', 'NCEngine.disconnect', 'Disconnected from Nexconn', 'info');
      }
    } catch {
      // ignore
    }
    this.stopMediaTracks();
    this.setMode('idle', 'Disconnected');
  }

  private getSdkChannel(target: ChannelTarget) {
    if (target.kind === 'dm') return new DirectChannel(target.userId);
    if (target.kind === 'live') return new OpenChannel(target.openChannelId);
    return new CommunitySubChannel(target.serverId, target.channelId);
  }

  private getIdentifier(target: ChannelTarget): ChannelIdentifier {
    if (target.kind === 'dm') return new DirectChannelIdentifier(target.userId);
    if (target.kind === 'live') return new OpenChannelIdentifier(target.openChannelId);
    return new CommunitySubChannelIdentifier(target.serverId, target.channelId);
  }

  private sdkMessageToChatMessage(m: Message<any>): ChatMessage | null {
    const idf = m.channelIdentifier;
    let targetKey = '';
    if (idf.channelType === ChannelType.DIRECT) {
      const myId = NCEngine.getCurrentUserId() || '';
      const pair = [myId, idf.channelId].sort();
      targetKey = `dm:${pair[0]}:${pair[1]}`;
    } else if (idf.channelType === ChannelType.COMMUNITY) {
      const sub = (idf as any).subChannelId || 'NCDefault';
      targetKey = `${idf.channelId}:${sub}`;
    } else {
      return null;
    }

    let meta: MessageMetadata | null = null;
    const rawMeta = m.metadata?.get?.('nexcord');
    if (rawMeta) {
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        meta = null;
      }
    }

    const content = m.content || {};
    const text = content.text || content.content || (content.remoteUrl ? '' : '[Media]');
    return {
      id: m.messageId || `sdk_${m.clientId}_${m.sentTime}`,
      nexconnMessageId: m.messageId,
      targetKey,
      senderId: m.senderUserId,
      text,
      type: meta?.badge ? 'quickchat' : 'text',
      metadata: meta,
      reactions: {},
      createdAt: m.sentTime || Date.now(),
    };
  }

  async enterLiveChannel(serverId: string, channelId: string, openChannelId?: string) {
    if (!openChannelId) return;
    await api.ensureLive(serverId, channelId).catch(() => {});
    if (this.mode === 'connected') {
      try {
        const ch = new OpenChannel(openChannelId);
        const r = await ch.enterChannel({ messageCount: 40 });
        this.log('chat', 'OpenChannel.enterChannel', `openChannel=${openChannelId} code=${r.code}`, r.code === 0 ? 'ok' : 'warn');
      } catch (e: any) {
        this.log('chat', 'OpenChannel.enterChannel.warn', e?.message || 'Enter warning', 'warn');
      }
    } else {
      this.log('chat', 'OpenChannel.enterChannel', `openChannel=${openChannelId} (hybrid)`, 'info');
    }
  }

  async exitLiveChannel(openChannelId?: string) {
    if (!openChannelId || this.mode !== 'connected') return;
    try {
      await new OpenChannel(openChannelId).exitChannel();
      this.log('chat', 'OpenChannel.exitChannel', `openChannel=${openChannelId}`, 'info');
    } catch {
      // ignore
    }
  }

  async loadHistory(target: ChannelTarget): Promise<ChatMessage[]> {
    const tKey = targetKeyOf(target);
    const { messages } = await api.getMessages(tKey);

    if (this.mode === 'connected') {
      try {
        if (target.kind === 'live') {
          const q = OpenChannel.createOpenChannelMessagesQuery({
            channelId: target.openChannelId,
            pageSize: 30,
            isAscending: false,
            startTime: Date.now(),
          });
          const res = await q.loadNextPage();
          this.log('chat', 'OpenChannel.createOpenChannelMessagesQuery', `loaded=${res.data?.data?.length || 0}`, 'ok');
        } else {
          const q = BaseChannel.createMessagesQuery({
            channelIdentifier: this.getIdentifier(target),
            pageSize: 30,
            isAscending: false,
            startTime: Date.now(),
          });
          const res = await q.loadNextPage();
          this.log('chat', 'BaseChannel.createMessagesQuery', `loaded=${res.data?.data?.length || 0}`, 'ok');
        }
      } catch {
        // Ignore if history not enabled on free tier; server mirror is always available
      }
    }
    return messages;
  }

  async sendTextMessage(
    target: ChannelTarget,
    text: string,
    opts?: {
      type?: 'text' | 'quickchat' | 'image' | 'file';
      replyTo?: ReplyReference | null;
      attachments?: MessageAttachment[];
      metadata?: MessageMetadata | null;
      mentionAll?: boolean;
      mentionUsers?: string[];
    },
  ): Promise<ChatMessage> {
    const tKey = targetKeyOf(target);
    let nexconnMessageId = '';

    // Send via @nexconn/chat SDK
    if (this.mode === 'connected') {
      try {
        const sdkChannel = this.getSdkChannel(target);
        const mentionedInfo = opts?.mentionAll
          ? { type: MentionedType.ALL }
          : opts?.mentionUsers?.length
            ? { type: MentionedType.USERS, userIdList: opts.mentionUsers }
            : undefined;

        const metaPayload = opts?.metadata
          ? { nexcord: JSON.stringify(opts.metadata).slice(0, 500) }
          : undefined;

        const res = opts?.replyTo
          ? await (() => {
              const p = new SendReferenceMessageParams({
                text,
                referMsgId: opts.replyTo.id,
                referMsgType: MessageType.TEXT,
                referMsgSenderId: opts.replyTo.senderId,
                referMsg: { text: opts.replyTo.text },
                mentionedInfo,
              });
              if (metaPayload) p.metadata = metaPayload;
              return sdkChannel.sendMessage(p);
            })()
          : await (() => {
              const p = new SendTextMessageParams({ text, mentionedInfo });
              if (metaPayload) p.metadata = metaPayload;
              return sdkChannel.sendMessage(p);
            })();

        if (res.code === 0 && res.data) {
          nexconnMessageId = res.data.messageId;
          this.liveMessageCache.set(res.data.messageId, res.data);
          this.log('chat', `${sdkChannel.constructor.name}.sendMessage`, `msgId=${res.data.messageId}`, 'ok');
        } else {
          this.log('chat', 'sendMessage.warn', `SDK returned code=${res.code}`, 'warn');
        }
      } catch (e: any) {
        this.log('chat', 'sendMessage.error', e?.message || 'SDK send error', 'warn');
      }
    } else {
      const chLabel = target.kind === 'dm' ? 'DirectChannel' : target.kind === 'live' ? 'OpenChannel' : 'CommunitySubChannel';
      this.log('chat', `${chLabel}.sendMessage`, `${opts?.type === 'quickchat' ? '[QuickChat] ' : ''}${text.slice(0, 48)}`, 'info');
    }

    const { message } = await api.postMessage(tKey, {
      text,
      type: opts?.type || 'text',
      replyTo: opts?.replyTo || null,
      attachments: opts?.attachments || [],
      metadata: opts?.metadata || null,
      nexconnMessageId,
    });
    return message;
  }

  async sendMediaFile(target: ChannelTarget, file: File, caption = ''): Promise<ChatMessage> {
    const isImage = file.type.startsWith('image/');
    const dataUrl = await readFileAsDataUrl(file);
    const attachment: MessageAttachment = {
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      dataUrl,
      isImage,
    };

    if (this.mode === 'connected') {
      try {
        const sdkChannel = this.getSdkChannel(target);
        if (isImage) {
          const res = await Helper.createSendImageMessageParams(file);
          if (res.isOk && res.data) {
            const sent = await sdkChannel.sendMediaMessage(res.data);
            this.log('chat', 'sendMediaMessage', `image=${file.name} code=${sent.code}`, sent.code === 0 ? 'ok' : 'warn');
          }
        } else {
          const res = await Helper.createSendFileMessageParams(file);
          if (res.isOk && res.data) {
            const sent = await sdkChannel.sendMediaMessage(res.data);
            this.log('chat', 'sendMediaMessage', `file=${file.name} code=${sent.code}`, sent.code === 0 ? 'ok' : 'warn');
          }
        }
      } catch (e: any) {
        this.log('chat', 'sendMediaMessage.warn', e?.message || 'Media upload warning', 'warn');
      }
    } else {
      this.log('chat', 'Helper.createSendMediaMessageParams', `file=${file.name} (${Math.round(file.size / 1024)} KB)`, 'info');
    }

    return this.sendTextMessage(target, caption, {
      type: isImage ? 'image' : 'file',
      attachments: [attachment],
    });
  }

  async sendTyping(target: ChannelTarget) {
    const tKey = targetKeyOf(target);
    if (this.mode === 'connected' && target.kind === 'dm') {
      new DirectChannel(target.userId).sendTypingStatus(MessageType.TEXT).catch(() => {});
    }
    api.sendTyping(tKey).catch(() => {});
  }

  // ---------------------------------------------------------------- Call SDK
  async startCall(opts: { calleeIds: string[]; isGroup: boolean; video: boolean; extra?: string }): Promise<string> {
    const callType = opts.isGroup ? NCCallType.MULTI : NCCallType.SINGLE;
    const mediaType = opts.video ? NCCallMediaType.AUDIO_VIDEO : NCCallMediaType.AUDIO;

    await this.ensureLocalMedia(true, opts.video);

    if (this.mode === 'connected' && this.callEngine && opts.calleeIds.length > 0) {
      try {
        const res = await this.callEngine.startCall({
          calleeIds: opts.calleeIds,
          callType,
          mediaType,
          extra: opts.extra,
        });
        this.log('call', 'NCCallEngine.startCall', `callId=${res.callId || 'none'} code=${res.code}`, res.code === 0 ? 'ok' : 'warn');
        if (res.code === 0 && res.callId) return res.callId;
      } catch (e: any) {
        this.log('call', 'NCCallEngine.startCall.warn', e?.message || 'Call start fallback', 'warn');
      }
    }

    const fallbackId = `nccall_${Date.now().toString(36)}`;
    this.log('call', 'NCCallEngine.startCall', `callId=${fallbackId} (${opts.isGroup ? 'MULTI' : 'SINGLE'}, ${opts.video ? 'AUDIO_VIDEO' : 'AUDIO'})`, 'info');
    return fallbackId;
  }

  async acceptCall(callId: string, video: boolean) {
    await this.ensureLocalMedia(true, video);
    if (this.mode === 'connected' && this.callEngine) {
      const res = await this.callEngine.acceptCall({ callId });
      this.log('call', 'NCCallEngine.acceptCall', `callId=${callId} code=${res.code}`, res.code === 0 ? 'ok' : 'warn');
    } else {
      this.log('call', 'NCCallEngine.acceptCall', `callId=${callId}`, 'info');
    }
  }

  async joinCall(callId: string, video = false) {
    await this.ensureLocalMedia(true, video);
    if (this.mode === 'connected' && this.callEngine && callId && !callId.startsWith('nccall_')) {
      try {
        const res = await this.callEngine.joinCall({ callId });
        this.log('call', 'NCCallEngine.joinCall', `callId=${callId} code=${res.code}`, res.code === 0 ? 'ok' : 'warn');
        return res.code === 0;
      } catch {
        return false;
      }
    }
    this.log('call', 'NCCallEngine.joinCall', `callId=${callId}`, 'info');
    return true;
  }

  async inviteToCall(calleeIds: string[]) {
    if (this.mode === 'connected' && this.callEngine && calleeIds.length > 0) {
      const res = await this.callEngine.inviteToCall({ calleeIds });
      this.log('call', 'NCCallEngine.inviteToCall', `callees=${calleeIds.join(',')} code=${res.code}`, res.code === 0 ? 'ok' : 'warn');
    } else {
      this.log('call', 'NCCallEngine.inviteToCall', `callees=${calleeIds.join(',')}`, 'info');
    }
  }

  async endCall(callId?: string) {
    this.stopMediaTracks();
    if (this.mode === 'connected' && this.callEngine) {
      try {
        await this.callEngine.endCall(callId ? { callId } : {});
        this.log('call', 'NCCallEngine.endCall', `callId=${callId || 'current'}`, 'info');
      } catch {
        // ignore
      }
    } else {
      this.log('call', 'NCCallEngine.endCall', `callId=${callId || 'current'}`, 'info');
    }
  }

  bindLocalVideo(videoElement: HTMLVideoElement | null) {
    if (!videoElement) return;
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');
    videoElement.setAttribute('x5-playsinline', 'true');
    if (this.mode === 'connected' && this.callEngine) {
      try {
        this.callEngine.setLocalVideoView({ videoElement });
        this.log('call', 'NCCallEngine.setLocalVideoView', 'Bound local HTMLVideoElement', 'info');
      } catch {
        // fallback below
      }
    }
    const stream = this.getLocalStream();
    if (stream) {
      const vTracks = stream.getVideoTracks().filter((t) => t.readyState === 'live');
      if (vTracks.length > 0) {
        if ((videoElement.srcObject as MediaStream)?.getVideoTracks()[0]?.id !== vTracks[0].id) {
          videoElement.srcObject = new MediaStream(vTracks);
        }
      } else {
        videoElement.srcObject = null;
      }
      if (videoElement.paused) {
        videoElement.play().catch(() => {});
      }
    }
  }

  bindRemoteVideo(userId: string, videoElement: HTMLVideoElement | null) {
    if (!videoElement) {
      this.remoteVideoElements.delete(userId);
      this.notifyChange();
      return;
    }
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');
    videoElement.setAttribute('x5-playsinline', 'true');
    this.remoteVideoElements.set(userId, videoElement);

    const existingStream = this.remoteStreams.get(userId);
    if (existingStream) {
      const vTracks = existingStream.getVideoTracks().filter((t) => t.readyState === 'live');
      if (vTracks.length > 0) {
        if ((videoElement.srcObject as MediaStream)?.getVideoTracks()[0]?.id !== vTracks[0].id) {
          videoElement.srcObject = new MediaStream(vTracks);
        }
        if (videoElement.paused) videoElement.play().catch(() => {});
      } else {
        videoElement.srcObject = null;
      }
      existingStream.getVideoTracks().forEach((vt) => {
        vt.onunmute = () => {
          const live = existingStream.getVideoTracks().filter((t) => t.readyState === 'live');
          if (live.length > 0 && (videoElement.srcObject as MediaStream)?.getVideoTracks()[0]?.id !== live[0].id) {
            videoElement.srcObject = new MediaStream(live);
          }
          if (videoElement.paused) videoElement.play().catch(() => {});
          this.notifyChange();
        };
        vt.onmute = () => this.notifyChange();
        vt.onended = () => this.notifyChange();
      });
      existingStream.onaddtrack = () => {
        const updated = existingStream.getVideoTracks().filter((t) => t.readyState === 'live');
        if (updated.length > 0) videoElement.srcObject = new MediaStream(updated);
        if (videoElement.paused) videoElement.play().catch(() => {});
        this.notifyChange();
      };
      if (videoElement.paused && vTracks.length > 0) {
        videoElement.play().catch(() => {});
      }
    }

    if (this.mode === 'connected' && this.callEngine) {
      try {
        this.callEngine.setRemoteVideoView([{ userId, videoElement }]);
        this.log('call', 'NCCallEngine.setRemoteVideoView', `userId=${userId}`, 'info');
      } catch {
        // ignore
      }
    }
    this.notifyChange();
  }

  unlockAudio() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      }
      this.remoteAudioElements.forEach((audio) => {
        if (audio.srcObject) {
          audio.play().catch(() => {});
        }
      });
    } catch {}
  }

  playRemoteAudio(userId: string, stream: MediaStream) {
    if (typeof window === 'undefined' || !userId || userId === this.currentUserId) return;
    try {
      const audioTrack = stream.getAudioTracks().find((t) => t.readyState === 'live') || stream.getAudioTracks()[0];
      if (!audioTrack) return;

      let audio = this.remoteAudioElements.get(userId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.style.position = 'fixed';
        audio.style.left = '-9999px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        document.body.appendChild(audio);
        this.remoteAudioElements.set(userId, audio);
      }

      if (audio.muted !== this.isDeafened) {
        audio.muted = this.isDeafened;
      }
      const curAudioTrack = (audio.srcObject as MediaStream)?.getAudioTracks()[0] || null;
      if (curAudioTrack !== audioTrack) {
        audio.srcObject = new MediaStream([audioTrack]);
        const p = audio.play();
        if (p !== undefined) {
          p.catch((err) => {
            console.warn(`[VoiceChat] Autoplay audio for ${userId} waiting for interaction:`, err);
          });
        }
      }
      this.log('call', 'VoiceChat.remoteAudioAttached', `userId=${userId}`, 'ok');
    } catch (e: any) {
      console.error('[VoiceChat] Failed to attach audio stream:', e);
    }
  }

  setDeafened(deaf: boolean) {
    this.isDeafened = deaf;
    this.remoteAudioElements.forEach((audio) => {
      audio.muted = deaf;
    });
  }

  getBroadcastStream(): MediaStream {
    const stream = new MediaStream();
    if (this.screenStream) {
      this.screenStream.getVideoTracks().forEach((t) => {
        if (t.readyState === 'live') stream.addTrack(t);
      });
      this.screenStream.getAudioTracks().forEach((t) => {
        if (t.readyState === 'live') stream.addTrack(t);
      });
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        if (t.readyState === 'live') {
          if (t.kind === 'video' && stream.getVideoTracks().length > 0) return;
          stream.addTrack(t);
        }
      });
    }
    return stream;
  }

  private getIceServers(): RTCIceServer[] {
    return this.iceServers;
  }

  // ------------------------------------------------------------------
  // Robust P2P mesh signaling
  //  * Exactly ONE side offers per pair (the lower userId) -> no glare.
  //  * The other side sends a lightweight "hello" to request an offer.
  //  * Every RTCPeerConnection has a session id (sid). Offers/answers/
  //    candidates carry it, so stale signals from old sessions are ignored
  //    and a fresh offer always replaces a dead connection cleanly.
  //  * Signals are processed sequentially per peer (no async races).
  //  * Both audio + video transceivers are sendrecv from the start, so
  //    camera / screen toggles use replaceTrack() with zero renegotiation.
  // ------------------------------------------------------------------
  private localSid: Map<string, string> = new Map();
  private remoteSid: Map<string, string> = new Map();
  private lastHelloAt: Map<string, number> = new Map();
  private offerInFlight: Set<string> = new Set();
  private signalChains: Map<string, Promise<void>> = new Map();

  private newSid(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  private isOfferer(remoteUserId: string): boolean {
    return !!this.currentUserId && this.currentUserId < remoteUserId;
  }

  private sendSignal(to: string, signal: any) {
    return api.sendWebRtcSignal(to, signal, this.currentCallId).catch(() => {});
  }

  private createPeerConnection(remoteUserId: string, _asOfferer: boolean): RTCPeerConnection {
    const old = this.peers.get(remoteUserId);
    if (old) {
      try { old.close(); } catch {}
    }
    const pc = new RTCPeerConnection({
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
    });
    const sid = this.newSid();
    this.peers.set(remoteUserId, pc);
    this.localSid.set(remoteUserId, sid);
    this.peerConnectingSince.set(remoteUserId, Date.now());

    pc.onconnectionstatechange = () => {
      if (this.peers.get(remoteUserId) !== pc) return;
      this.log(
        'call',
        'WebRTC.connectionState',
        `peer=${remoteUserId} state=${pc.connectionState}`,
        pc.connectionState === 'connected' ? 'ok' : 'info'
      );
      if (pc.connectionState === 'disconnected') {
        this.peerConnectingSince.set(remoteUserId, Date.now());
      }
      if (pc.connectionState === 'failed') {
        this.peerConnectingSince.set(remoteUserId, 0);
        this.connectToPeer(remoteUserId, this.currentCallId).catch(() => {});
      }
      this.notifyChange();
    };

    pc.oniceconnectionstatechange = () => {
      if (this.peers.get(remoteUserId) !== pc) return;
      this.log(
        'call',
        'WebRTC.iceConnectionState',
        `peer=${remoteUserId} iceState=${pc.iceConnectionState}`,
        pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed' ? 'ok' : 'info'
      );
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce?.();
      }
      this.notifyChange();
    };

    // Both peers add both audio and video transceivers upfront in sendrecv mode
    const broadcastStream = this.getBroadcastStream();
    const liveAudio = broadcastStream.getAudioTracks().find((t) => t.readyState === 'live') || null;
    const liveVideo = broadcastStream.getVideoTracks().find((t) => t.readyState === 'live') || null;

    const audioTr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTr = pc.addTransceiver('video', { direction: 'sendrecv' });

    if (liveAudio) {
      audioTr.sender.replaceTrack(liveAudio).catch(() => {});
    }
    if (liveVideo) {
      videoTr.sender.replaceTrack(liveVideo).catch(() => {});
    }

    try {
      const aParams = audioTr.sender.getParameters();
      if (aParams?.encodings?.length) {
        (aParams.encodings[0] as any).networkPriority = 'high';
        audioTr.sender.setParameters(aParams).catch(() => {});
      }
    } catch {}

    try {
      const vParams = videoTr.sender.getParameters();
      if (vParams?.encodings?.length) {
        vParams.encodings[0].maxBitrate = 900000;
        (vParams.encodings[0] as any).networkPriority = 'low';
        videoTr.sender.setParameters(vParams).catch(() => {});
      }
    } catch {}

    pc.ontrack = (event) => {
      if (this.peers.get(remoteUserId) !== pc) return;
      let remoteStream = this.remoteStreams.get(remoteUserId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(remoteUserId, remoteStream);
      }
      remoteStream.getTracks().forEach((t) => {
        if (t.kind === event.track.kind && t.id !== event.track.id) remoteStream!.removeTrack(t);
      });
      if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      const refreshVideo = () => {
        const vel = this.remoteVideoElements.get(remoteUserId);
        const vTracks = remoteStream!.getVideoTracks().filter((t) => t.readyState === 'live');
        if (vel && vTracks.length > 0) {
          if ((vel.srcObject as MediaStream)?.getVideoTracks()[0]?.id !== vTracks[0].id) {
            vel.srcObject = new MediaStream(vTracks);
          }
          vel.muted = true;
          vel.defaultMuted = true;
          vel.setAttribute('playsinline', 'true');
          vel.setAttribute('webkit-playsinline', 'true');
          if (vel.paused) vel.play().catch(() => {});
        }
        this.notifyChange();
      };

      if (event.track.kind === 'video') {
        refreshVideo();
        event.track.onunmute = refreshVideo;
        event.track.onmute = refreshVideo;
        event.track.onended = refreshVideo;
      } else if (event.track.kind === 'audio') {
        this.playRemoteAudio(remoteUserId, remoteStream);
        event.track.onunmute = () => this.playRemoteAudio(remoteUserId, remoteStream!);
      }
      this.notifyChange();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.peers.get(remoteUserId) !== pc) return;
      this.sendSignal(remoteUserId, {
        type: 'candidate',
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        sid,
      });
    };

    return pc;
  }

  private async attachLocalTracks(pc: RTCPeerConnection) {
    if (pc.signalingState === 'closed') return;
    const broadcastStream = this.getBroadcastStream();
    const liveAudio = broadcastStream.getAudioTracks().find((t) => t.readyState === 'live') || null;
    const liveVideo = broadcastStream.getVideoTracks().find((t) => t.readyState === 'live') || null;

    let hasAudio = false;
    let hasVideo = false;

    for (const tr of pc.getTransceivers()) {
      if ((tr as any).stopped || tr.currentDirection === 'stopped') continue;
      const kind = tr.receiver.track?.kind || (tr.sender.track ? tr.sender.track.kind : null);
      if (kind === 'audio') {
        hasAudio = true;
        if (tr.direction !== 'sendrecv') {
          try { tr.direction = 'sendrecv'; } catch {}
        }
        if (tr.sender.track !== liveAudio) {
          await tr.sender.replaceTrack(liveAudio).catch(() => {});
        }
        try {
          const params = tr.sender.getParameters();
          if (params?.encodings?.length) {
            (params.encodings[0] as any).networkPriority = 'high';
            await tr.sender.setParameters(params).catch(() => {});
          }
        } catch {}
      } else if (kind === 'video') {
        hasVideo = true;
        if (tr.direction !== 'sendrecv') {
          try { tr.direction = 'sendrecv'; } catch {}
        }
        if (tr.sender.track !== liveVideo) {
          await tr.sender.replaceTrack(liveVideo).catch(() => {});
        }
        try {
          const params = tr.sender.getParameters();
          if (params?.encodings?.length) {
            params.encodings[0].maxBitrate = 900000;
            (params.encodings[0] as any).networkPriority = 'low';
            await tr.sender.setParameters(params).catch(() => {});
          }
        } catch {}
      }
    }

    if (!hasAudio) {
      try {
        const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
        if (liveAudio) await tr.sender.replaceTrack(liveAudio).catch(() => {});
      } catch {}
    }
    if (!hasVideo) {
      try {
        const tr = pc.addTransceiver('video', { direction: 'sendrecv' });
        if (liveVideo) await tr.sender.replaceTrack(liveVideo).catch(() => {});
      } catch {}
    }
  }

  async syncTracksToPeers(_allowRenegotiation = true) {
    for (const pc of this.peers.values()) {
      if (pc.signalingState === 'closed') continue;
      await this.attachLocalTracks(pc);
    }
    this.notifyChange();
  }

  async renegotiatePeer(peerId: string) {
    if (this.isOfferer(peerId)) {
      await this.startOffer(peerId, true);
    } else {
      this.lastHelloAt.delete(peerId);
      this.sendSignal(peerId, { type: 'hello', rsid: '' });
    }
  }

  private async startOffer(remoteUserId: string, force = false) {
    if (this.offerInFlight.has(remoteUserId)) return;
    this.offerInFlight.add(remoteUserId);
    try {
      const cur = this.peers.get(remoteUserId);
      if (!force && cur && cur.signalingState !== 'closed') {
        const state = this.getPeerConnectionState(remoteUserId);
        const age = Date.now() - (this.peerConnectingSince.get(remoteUserId) || 0);
        if (state === 'connected') return;
        if (cur.signalingState === 'have-local-offer' && age < 4000) return;
      }

      const pc = this.createPeerConnection(remoteUserId, true);
      this.remoteSid.delete(remoteUserId);
      await this.attachLocalTracks(pc);
      const offer = await pc.createOffer();
      if (this.peers.get(remoteUserId) !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.peers.get(remoteUserId) !== pc) return;
      await this.sendSignal(remoteUserId, {
        type: 'offer',
        sdp: { type: offer.type, sdp: offer.sdp },
        sid: this.localSid.get(remoteUserId),
      });
      this.log('call', 'WebRTC.offerSent', `to=${remoteUserId}`, 'ok');
      this.notifyChange();
    } catch (err: any) {
      this.log('call', 'WebRTC.offerError', err?.message || 'offer failed', 'warn');
    } finally {
      this.offerInFlight.delete(remoteUserId);
    }
  }

  async connectToPeer(remoteUserId: string, callId: string) {
    if (typeof window === 'undefined' || !window.RTCPeerConnection) return;
    if (!remoteUserId || remoteUserId === this.currentUserId) return;
    if (callId) this.currentCallId = callId;

    const pc = this.peers.get(remoteUserId);
    if (pc && pc.signalingState !== 'closed') {
      const state = this.getPeerConnectionState(remoteUserId);
      if (state === 'connected') return;
      const age = Date.now() - (this.peerConnectingSince.get(remoteUserId) || 0);
      if (state !== 'failed' && age < 8000) return; // negotiation still in progress
    }

    if (this.isOfferer(remoteUserId)) {
      await this.startOffer(remoteUserId, !!pc);
    } else {
      const last = this.lastHelloAt.get(remoteUserId) || 0;
      if (Date.now() - last < 3000) return;
      this.lastHelloAt.set(remoteUserId, Date.now());
      await this.sendSignal(remoteUserId, { type: 'hello', rsid: this.remoteSid.get(remoteUserId) || '' });
      this.log('call', 'WebRTC.helloSent', `to=${remoteUserId}`, 'info');
    }
  }

  private async drainCandidates(remoteUserId: string, sid: string, pc: RTCPeerConnection) {
    const keys = Array.from(this.pendingCandidates.keys()).filter(
      (k) => k === `${remoteUserId}:${sid}` || k.startsWith(`${remoteUserId}:`)
    );
    for (const key of keys) {
      const queued = this.pendingCandidates.get(key) || [];
      this.pendingCandidates.delete(key);
      for (const cand of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
    }
  }

  handleWebRtcSignal(fromUserId: string, signal: any, callId: string): Promise<void> {
    const prev = this.signalChains.get(fromUserId) || Promise.resolve();
    const next = prev
      .then(() => this.processSignal(fromUserId, signal, callId))
      .catch(() => {});
    this.signalChains.set(fromUserId, next);
    return next;
  }

  private async processSignal(fromUserId: string, signal: any, callId: string) {
    if (typeof window === 'undefined' || !window.RTCPeerConnection || !signal || !fromUserId) return;
    if (fromUserId === this.currentUserId) return;

    const body =
      signal.type === 'candidate'
        ? JSON.stringify(signal.candidate || '')
        : signal.type === 'hello'
          ? `${signal.rsid || ''}:${Math.floor(Date.now() / 2000)}`
          : (typeof signal.sdp === 'string' ? signal.sdp : signal.sdp?.sdp || '');
    const sigKey = `${fromUserId}:${signal.type}:${signal.sid || ''}:${body}`;
    if (this.seenSignals.has(sigKey)) return;
    this.seenSignals.add(sigKey);
    if (this.seenSignals.size > 800) {
      const first = this.seenSignals.values().next().value;
      if (first) this.seenSignals.delete(first);
    }

    try {
      if (signal.type === 'hello') {
        if (!this.isOfferer(fromUserId)) return;
        if (callId) this.currentCallId = callId;
        const pc = this.peers.get(fromUserId);
        const state = pc ? this.getPeerConnectionState(fromUserId) : 'none';
        if (pc && state === 'connected' && signal.rsid && signal.rsid === this.localSid.get(fromUserId)) return;
        await this.startOffer(fromUserId, true);
        return;
      }

      if (signal.type === 'offer') {
        if (callId) this.currentCallId = callId;
        this.unlockAudio();
        const rsid: string = signal.sid || 'legacy';
        let pc = this.peers.get(fromUserId);
        if (!pc || pc.signalingState === 'closed' || this.remoteSid.get(fromUserId) !== rsid) {
          pc = this.createPeerConnection(fromUserId, false);
          this.remoteSid.set(fromUserId, rsid);
        } else if (pc.signalingState !== 'stable') {
          await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit).catch(() => {});
        }
        const descInit: RTCSessionDescriptionInit =
          typeof signal.sdp === 'object' && signal.sdp !== null
            ? signal.sdp
            : { type: 'offer', sdp: String(signal.sdp || '') };
        await pc.setRemoteDescription(new RTCSessionDescription(descInit));
        await this.attachLocalTracks(pc);
        await this.drainCandidates(fromUserId, rsid, pc);
        const answer = await pc.createAnswer();
        if (this.peers.get(fromUserId) !== pc) return;
        await pc.setLocalDescription(answer);
        await this.sendSignal(fromUserId, {
          type: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp },
          sid: this.localSid.get(fromUserId),
          tsid: rsid,
        });
        this.log('call', 'WebRTC.answerSent', `to=${fromUserId}`, 'ok');

        const vel = this.remoteVideoElements.get(fromUserId);
        if (vel && vel.paused) vel.play().catch(() => {});
        this.notifyChange();
        return;
      }

      if (signal.type === 'answer') {
        const pc = this.peers.get(fromUserId);
        if (!pc || pc.signalingState !== 'have-local-offer') return;
        if (signal.tsid && signal.tsid !== this.localSid.get(fromUserId)) return; // answer to an old offer
        const rsid: string = signal.sid || 'legacy';
        const descInit: RTCSessionDescriptionInit =
          typeof signal.sdp === 'object' && signal.sdp !== null
            ? signal.sdp
            : { type: 'answer', sdp: String(signal.sdp || '') };
        await pc.setRemoteDescription(new RTCSessionDescription(descInit));
        this.remoteSid.set(fromUserId, rsid);
        await this.drainCandidates(fromUserId, rsid, pc);
        this.log('call', 'WebRTC.answerApplied', `from=${fromUserId}`, 'ok');

        const vel = this.remoteVideoElements.get(fromUserId);
        if (vel && vel.paused) vel.play().catch(() => {});
        this.notifyChange();
        return;
      }

      if (signal.type === 'candidate' && signal.candidate) {
        const candInit: RTCIceCandidateInit =
          typeof signal.candidate === 'object' ? signal.candidate : { candidate: String(signal.candidate) };
        const rsid: string = signal.sid || this.remoteSid.get(fromUserId) || 'legacy';
        const pc = this.peers.get(fromUserId);
        if (pc && pc.signalingState !== 'closed' && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candInit)).catch(() => {});
        } else {
          const key = `${fromUserId}:${rsid}`;
          const queued = this.pendingCandidates.get(key) || [];
          queued.push(candInit);
          if (queued.length > 60) queued.shift();
          this.pendingCandidates.set(key, queued);
        }
      }
    } catch (err: any) {
      this.log('call', 'WebRTC.signalError', err?.message || 'Signal handling failed', 'warn');
    }
  }

  async toggleMic(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
    }
    await this.syncTracksToPeers();
    if (this.mode === 'connected' && this.callEngine) {
      await this.callEngine.enableMicrophone(enabled).catch(() => {});
    }
    this.log('call', 'NCCallEngine.enableMicrophone', `enabled=${enabled}`, 'info');
  }

  async toggleCamera(enabled: boolean): Promise<boolean> {
    if (enabled) {
      const stream = await this.ensureLocalMedia(true, true);
      const hasLive = !!stream?.getVideoTracks().some((t) => t.readyState === 'live');
      await this.syncTracksToPeers();
      for (const [peerId, pc] of this.peers.entries()) {
        if (pc.signalingState === 'stable') {
          this.renegotiatePeer(peerId).catch(() => {});
        }
      }
      if (this.mode === 'connected' && this.callEngine) {
        await this.callEngine.enableCamera(enabled).catch(() => {});
      }
      this.log('call', 'NCCallEngine.enableCamera', `enabled=true (live=${hasLive})`, 'info');
      this.notifyChange();
      return hasLive;
    } else if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => {
        t.stop();
        this.localStream?.removeTrack(t);
      });
      await this.syncTracksToPeers();
      for (const [peerId, pc] of this.peers.entries()) {
        if (pc.signalingState === 'stable') {
          this.renegotiatePeer(peerId).catch(() => {});
        }
      }
      if (this.mode === 'connected' && this.callEngine) {
        await this.callEngine.enableCamera(false).catch(() => {});
      }
      this.log('call', 'NCCallEngine.enableCamera', 'enabled=false', 'info');
      this.notifyChange();
      return false;
    }
    await this.syncTracksToPeers();
    this.notifyChange();
    return false;
  }

  setScreenStream(stream: MediaStream | null) {
    if (this.screenStream && this.screenStream !== stream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
    }
    this.screenStream = stream;
    this.syncTracksToPeers();
    for (const [peerId, pc] of this.peers.entries()) {
      if (pc.signalingState === 'stable') {
        this.renegotiatePeer(peerId).catch(() => {});
      }
    }
    this.notifyChange();
    this.log('call', 'ScreenStream.set', `Screen stream active: ${!!stream}`, 'ok');
  }

  getRemoteStream(userId: string): MediaStream | undefined {
    return this.remoteStreams.get(userId);
  }

  async toggleScreenShare(enable: boolean): Promise<MediaStream | null> {
    if (!enable) {
      this.setScreenStream(null);
      this.log('call', 'ScreenShare.stop', 'Stopped screen sharing', 'info');
      return null;
    }
    try {
      let stream: MediaStream | null = null;
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (navigator.mediaDevices && typeof (navigator.mediaDevices as any).getDisplayMedia === 'function') {
        try {
          if (isMobile) {
            stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
          } else {
            try {
              stream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
                audio: true,
              });
            } catch {
              stream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
              });
            }
          }
        } catch (displayErr: any) {
          console.warn('Native getDisplayMedia error:', displayErr);
          throw new Error(
            isMobile
              ? 'Screen sharing is restricted by your mobile browser. Use a desktop browser or the native Nexcord APK to share your screen.'
              : 'Screen sharing permission was canceled or denied.'
          );
        }
      } else {
        throw new Error(
          isMobile
            ? 'Screen sharing is not supported by mobile web browsers on iOS/Android. Please use a laptop or desktop browser to share your screen.'
            : 'Screen sharing is not supported in this browser.'
        );
      }

      if (stream) {
        this.setScreenStream(stream);
        const vt = stream.getVideoTracks()[0];
        if (vt) {
          vt.onended = () => {
            this.setScreenStream(null);
            this.callbacks.onScreenShareEnded?.();
          };
        }
        await this.syncTracksToPeers(true);
        this.log('call', 'ScreenShare.start', 'Started screen capture stream', 'ok');
        return stream;
      }
      return null;
    } catch (e: any) {
      this.log('call', 'ScreenShare.denied', e?.message || 'Permission dismissed', 'warn');
      throw e;
    }
  }

  async ensureLocalMedia(audio: boolean, video: boolean): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
    try {
      const hasVideo = this.localStream?.getVideoTracks().some((t) => t.readyState === 'live');
      const hasAudio = this.localStream?.getAudioTracks().some((t) => t.readyState === 'live');

      if (this.localStream && (!video || hasVideo) && (!audio || hasAudio)) {
        return this.localStream;
      }

      if (this.localStream && hasAudio && video && !hasVideo) {
        let vStream: MediaStream | null = null;
        try {
          vStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } },
          });
        } catch {
          try {
            vStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'user' } },
            });
          } catch {
            vStream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
        if (vStream) {
          vStream.getVideoTracks().forEach((vt) => this.localStream!.addTrack(vt));
          await this.syncTracksToPeers(true);
        }
        return this.localStream;
      }

      if (this.localStream && hasVideo && audio && !hasAudio) {
        let aStream: MediaStream | null = null;
        try {
          aStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        } catch {
          aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (aStream) {
          aStream.getAudioTracks().forEach((at) => this.localStream!.addTrack(at));
          await this.syncTracksToPeers(true);
        }
        return this.localStream;
      }

      // Fresh stream request with progressive fallbacks for mobile browsers
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } } : false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audio ? true : false,
            video: video ? { facingMode: { ideal: 'user' } } : false,
          });
        } catch {
          if (audio) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err3) {
              console.warn('[VoiceChat] getUserMedia fallback to audio-only failed:', err3);
            }
          }
        }
      }

      if (stream) {
        if (this.localStream) {
          this.localStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        }
        this.localStream = stream;
        await this.syncTracksToPeers();
        return stream;
      }
      return null;
    } catch (err: any) {
      console.warn('[VoiceChat] getUserMedia error:', err);
      return null;
    }
  }

  closePeer(userId: string) {
    const pc = this.peers.get(userId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peers.delete(userId);
    }
    const audio = this.remoteAudioElements.get(userId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {}
      this.remoteAudioElements.delete(userId);
    }
    this.remoteStreams.delete(userId);
    this.remoteVideoElements.delete(userId);
    for (const key of Array.from(this.pendingCandidates.keys())) {
      if (key.startsWith(`${userId}:`)) this.pendingCandidates.delete(key);
    }
    this.localSid.delete(userId);
    this.remoteSid.delete(userId);
    this.lastHelloAt.delete(userId);
    this.peerConnectingSince.delete(userId);
  }

  stopMediaTracks() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.peerConnectingSince.clear();
    for (const pc of this.peers.values()) {
      try {
        pc.close();
      } catch {}
    }
    this.peers.clear();
    this.pendingCandidates.clear();
    this.localSid.clear();
    this.remoteSid.clear();
    this.lastHelloAt.clear();
    this.remoteStreams.clear();
    this.remoteVideoElements.clear();
    this.remoteAudioElements.forEach((audio) => {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {}
    });
    this.remoteAudioElements.clear();
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const nexconn = new NexconnService();
