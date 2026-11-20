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
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  private audioContainer: HTMLDivElement | null = null;
  private audioContext: AudioContext | null = null;
  private isDeafened: boolean = false;

  setCallbacks(cb: NexconnCallbacks) {
    this.callbacks = { ...this.callbacks, ...cb };
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
    if (this.mode === 'connected' && this.callEngine) {
      try {
        this.callEngine.setLocalVideoView({ videoElement });
        this.log('call', 'NCCallEngine.setLocalVideoView', 'Bound local HTMLVideoElement', 'info');
      } catch {
        // fallback below
      }
    }
    const stream = this.getLocalStream();
    if (stream && videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
      videoElement.play().catch(() => {});
    }
  }

  bindRemoteVideo(userId: string, videoElement: HTMLVideoElement | null) {
    if (!videoElement) {
      this.remoteVideoElements.delete(userId);
      return;
    }
    this.remoteVideoElements.set(userId, videoElement);
    const existingStream = this.remoteStreams.get(userId);
    if (existingStream && videoElement.srcObject !== existingStream) {
      videoElement.srcObject = existingStream;
      videoElement.play().catch(() => {});
    }

    if (this.mode === 'connected' && this.callEngine) {
      try {
        this.callEngine.setRemoteVideoView([{ userId, videoElement }]);
        this.log('call', 'NCCallEngine.setRemoteVideoView', `userId=${userId}`, 'info');
      } catch {
        // ignore
      }
    }
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
    if (typeof window === 'undefined') return;
    try {
      let audio = this.remoteAudioElements.get(userId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.style.display = 'none';

        if (!this.audioContainer) {
          this.audioContainer = document.getElementById('nexcord-remote-audio-container') as HTMLDivElement;
          if (!this.audioContainer) {
            this.audioContainer = document.createElement('div');
            this.audioContainer.id = 'nexcord-remote-audio-container';
            this.audioContainer.style.display = 'none';
            document.body.appendChild(this.audioContainer);
          }
        }
        this.audioContainer.appendChild(audio);
        this.remoteAudioElements.set(userId, audio);
      }

      audio.muted = this.isDeafened;
      if (audio.srcObject !== stream) {
        audio.srcObject = stream;
      }
      const p = audio.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn(`[VoiceChat] Autoplay audio for ${userId} waiting for interaction:`, err);
        });
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
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ];
  }

  async connectToPeer(remoteUserId: string, callId: string) {
    if (typeof window === 'undefined' || !window.RTCPeerConnection) return;
    if (this.peers.has(remoteUserId)) return;

    try {
      this.unlockAudio();
      let stream = this.getBroadcastStream();
      if (stream.getAudioTracks().length === 0) {
        const mic = await this.ensureLocalMedia(true, false);
        if (mic) {
          mic.getAudioTracks().forEach((t) => {
            if (t.readyState === 'live' && !stream.getAudioTracks().some((x) => x.id === t.id)) {
              stream.addTrack(t);
            }
          });
        }
      }

      const pc = new RTCPeerConnection({
        iceServers: this.getIceServers(),
      });
      this.peers.set(remoteUserId, pc);

      pc.onconnectionstatechange = () => {
        this.log('call', 'WebRTC.connectionState', `peer=${remoteUserId} state=${pc.connectionState}`, pc.connectionState === 'connected' ? 'ok' : 'info');
      };

      stream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, stream);
        } catch {}
      });

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        this.remoteStreams.set(remoteUserId, remoteStream);
        this.playRemoteAudio(remoteUserId, remoteStream);
        const el = this.remoteVideoElements.get(remoteUserId);
        if (el) {
          el.srcObject = remoteStream;
          el.play().catch(() => {});
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          api.sendWebRtcSignal(remoteUserId, { type: 'candidate', candidate: event.candidate }, callId).catch(() => {});
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await api.sendWebRtcSignal(remoteUserId, { type: 'offer', sdp: offer }, callId).catch(() => {});
      this.log('call', 'WebRTC.offerSent', `to=${remoteUserId}`, 'ok');
    } catch (err: any) {
      this.log('call', 'WebRTC.connectError', err?.message || 'P2P setup failed', 'warn');
    }
  }

  async handleWebRtcSignal(fromUserId: string, signal: any, callId: string) {
    if (typeof window === 'undefined' || !window.RTCPeerConnection || !signal) return;

    try {
      this.unlockAudio();
      let pc = this.peers.get(fromUserId);
      if (!pc) {
        let stream = this.getBroadcastStream();
        if (stream.getAudioTracks().length === 0) {
          const mic = await this.ensureLocalMedia(true, false);
          if (mic) {
            mic.getAudioTracks().forEach((t) => {
              if (t.readyState === 'live' && !stream.getAudioTracks().some((x) => x.id === t.id)) {
                stream.addTrack(t);
              }
            });
          }
        }

        const newPc = new RTCPeerConnection({
          iceServers: this.getIceServers(),
        });
        this.peers.set(fromUserId, newPc);
        pc = newPc;

        newPc.onconnectionstatechange = () => {
          this.log('call', 'WebRTC.connectionState', `peer=${fromUserId} state=${newPc.connectionState}`, newPc.connectionState === 'connected' ? 'ok' : 'info');
        };

        stream.getTracks().forEach((track) => {
          try {
            newPc.addTrack(track, stream);
          } catch {}
        });

        newPc.ontrack = (event) => {
          const remoteStream = event.streams[0] || new MediaStream([event.track]);
          this.remoteStreams.set(fromUserId, remoteStream);
          this.playRemoteAudio(fromUserId, remoteStream);
          const el = this.remoteVideoElements.get(fromUserId);
          if (el) {
            el.srcObject = remoteStream;
            el.play().catch(() => {});
          }
        };

        newPc.onicecandidate = (event) => {
          if (event.candidate) {
            api.sendWebRtcSignal(fromUserId, { type: 'candidate', candidate: event.candidate }, callId).catch(() => {});
          }
        };
      }

      // Ensure all current outgoing tracks (screen & audio) are present on pc
      const activeStream = this.getBroadcastStream();
      if (pc && activeStream) {
        const senders = pc.getSenders();
        activeStream.getTracks().forEach((t) => {
          const sender = senders.find((s) => s.track?.kind === t.kind);
          if (sender) {
            if (sender.track !== t) {
              sender.replaceTrack(t).catch(() => {});
            }
          } else {
            try {
              pc!.addTrack(t, activeStream);
            } catch {}
          }
        });
      }

      const drainCandidates = async () => {
        const queued = this.pendingCandidates.get(fromUserId) || [];
        for (const cand of queued) {
          try {
            await pc!.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
        this.pendingCandidates.delete(fromUserId);
      };

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await api.sendWebRtcSignal(fromUserId, { type: 'answer', sdp: answer }, callId).catch(() => {});
        this.log('call', 'WebRTC.answerSent', `to=${fromUserId}`, 'ok');
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await drainCandidates();
        this.log('call', 'WebRTC.connected', `from=${fromUserId}`, 'ok');
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          const queued = this.pendingCandidates.get(fromUserId) || [];
          queued.push(signal.candidate);
          this.pendingCandidates.set(fromUserId, queued);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch {
            const queued = this.pendingCandidates.get(fromUserId) || [];
            queued.push(signal.candidate);
            this.pendingCandidates.set(fromUserId, queued);
          }
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
    if (this.mode === 'connected' && this.callEngine) {
      await this.callEngine.enableMicrophone(enabled).catch(() => {});
    }
    this.log('call', 'NCCallEngine.enableMicrophone', `enabled=${enabled}`, 'info');
  }

  async toggleCamera(enabled: boolean) {
    if (enabled) {
      await this.ensureLocalMedia(true, true);
    } else if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => {
        t.stop();
      });
    }
    if (this.mode === 'connected' && this.callEngine) {
      await this.callEngine.enableCamera(enabled).catch(() => {});
    }
    this.log('call', 'NCCallEngine.enableCamera', `enabled=${enabled}`, 'info');
  }

  setScreenStream(stream: MediaStream | null) {
    if (this.screenStream && this.screenStream !== stream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
    }
    this.screenStream = stream;
    const videoTrack = stream?.getVideoTracks()[0] || null;

    this.peers.forEach((pc) => {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');
      if (videoTrack) {
        if (videoSender) {
          videoSender.replaceTrack(videoTrack).catch(() => {});
        } else {
          try {
            pc.addTrack(videoTrack, stream!);
          } catch {}
        }
      } else {
        const camTrack = this.localStream?.getVideoTracks().find((t) => t.readyState === 'live') || null;
        if (videoSender) {
          videoSender.replaceTrack(camTrack).catch(() => {});
        }
      }
    });
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

      if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
        try {
          if (isMobile) {
            // Android Chrome: never request audio: true as it causes immediate rejection
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          } else {
            try {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            } catch {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            }
          }
        } catch (displayErr) {
          console.warn('Native getDisplayMedia rejected or unsupported on this device', displayErr);
          if (isMobile) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
              });
            } catch (camErr) {
              console.warn('Mobile camera fallback failed', camErr);
            }
          }
        }
      } else if (isMobile) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        } catch (camErr) {
          console.warn('Mobile camera fallback failed', camErr);
        }
      }

      if (stream) {
        this.setScreenStream(stream);
        const vt = stream.getVideoTracks()[0];
        if (vt) {
          vt.onended = () => {
            this.setScreenStream(null);
          };
        }
        this.log('call', 'ScreenShare.start', 'Started screen capture stream', 'ok');
        return stream;
      }
      return null;
    } catch (e: any) {
      this.log('call', 'ScreenShare.denied', e?.message || 'Permission dismissed', 'warn');
      return null;
    }
  }

  async ensureLocalMedia(audio: boolean, video: boolean): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
    try {
      if (this.localStream) {
        const hasVideo = this.localStream.getVideoTracks().some((t) => t.readyState === 'live');
        const hasAudio = this.localStream.getAudioTracks().some((t) => t.readyState === 'live');
        if ((!video || hasVideo) && (!audio || hasAudio)) return this.localStream;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
      });
      this.localStream?.getTracks().forEach((t) => t.stop());
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      console.warn('[VoiceChat] getUserMedia error:', err);
      if (audio && !video) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream?.getTracks().forEach((t) => t.stop());
          this.localStream = fallbackStream;
          return fallbackStream;
        } catch (fbErr) {
          console.warn('[VoiceChat] Fallback getUserMedia error:', fbErr);
        }
      }
      return null;
    }
  }

  stopMediaTracks() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    for (const pc of this.peers.values()) {
      try {
        pc.close();
      } catch {}
    }
    this.peers.clear();
    this.pendingCandidates.clear();
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
