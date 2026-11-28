import type { ChatMessage, DirectCallSession, NexconnConfig, Server, SquadLobbyState, SyncPayload, User } from '../types';

const PRODUCTION_API = 'https://nexcord-a85i.onrender.com';

export function getApiBase(): string {
  const saved = localStorage.getItem('nexcord_api_base');
  if (saved) return saved.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const isCapacitor =
      !!(window as any).Capacitor ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && !window.location.port);
    if (isCapacitor) {
      return PRODUCTION_API;
    }
  }
  return '';
}

export function setApiBase(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) localStorage.removeItem('nexcord_api_base');
  else localStorage.setItem('nexcord_api_base', clean);
}

export function getApkDownloadUrl(): string {
  const base = getApiBase();
  return `${base}/api/download/apk`;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : '';
}

function setCookie(name: string, val: string, days = 90) {
  if (typeof document === 'undefined') return;
  if (!val) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } else {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(val)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

let sessionToken = '';

export function getSessionToken(): string {
  if (sessionToken) return sessionToken;
  if (typeof window !== 'undefined') {
    const urlSession = new URLSearchParams(window.location.search).get('session');
    if (urlSession) {
      setSessionToken(urlSession);
      return urlSession;
    }
    const fromStorage =
      localStorage.getItem('nexcord_session') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('nexcord_session') ||
      sessionStorage.getItem('auth_token');
    if (fromStorage) {
      sessionToken = fromStorage;
      setCookie('nexcord_session', fromStorage);
      setCookie('auth_token', fromStorage);
      return fromStorage;
    }
    const fromCookie = getCookie('nexcord_session') || getCookie('auth_token');
    if (fromCookie) {
      sessionToken = fromCookie;
      localStorage.setItem('nexcord_session', fromCookie);
      localStorage.setItem('auth_token', fromCookie);
      return fromCookie;
    }
  }
  return '';
}

export function setSessionToken(tok: string): void {
  sessionToken = tok;
  if (typeof window !== 'undefined') {
    if (tok) {
      sessionStorage.setItem('nexcord_session', tok);
      sessionStorage.setItem('auth_token', tok);
      // Persist across sessions and browser tabs
      if (!new URLSearchParams(window.location.search).get('session')) {
        localStorage.setItem('nexcord_session', tok);
        localStorage.setItem('auth_token', tok);
      }
      setCookie('nexcord_session', tok);
      setCookie('auth_token', tok);
    } else {
      sessionStorage.removeItem('nexcord_session');
      sessionStorage.removeItem('auth_token');
      localStorage.removeItem('nexcord_session');
      localStorage.removeItem('auth_token');
      setCookie('nexcord_session', '');
      setCookie('auth_token', '');
    }
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Auth-Token'] = token;
  }
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  if (!res.ok) {
    const err: any = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.cooldownSeconds = json.cooldownSeconds;
    err.cooldownUntil = json.cooldownUntil;
    throw err;
  }
  return json as T;
}

export const api = {
  health: () => req<{ ok: boolean; nexconnConfigured: boolean }>('/api/health'),
  getConfig: () => req<NexconnConfig>('/api/config'),
  saveCredentials: (payload: { appKey: string; appSecret: string; apiHost: string; areaCode: number }) =>
    req<{ config: NexconnConfig; nexconnToken: string | null; error: string | null }>('/api/config/credentials', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  sendOtp: (phone: string, channel: 'whatsapp' | 'sms' = 'whatsapp') =>
    req<{
      ok: boolean;
      phone: string;
      channel?: string;
      provider?: string;
      devOtp?: string;
      message: string;
      cooldownSeconds?: number;
      nextCooldownSeconds?: number;
      cooldownUntil?: number;
    }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, channel }),
    }),
  verifyOtp: (phone: string, otp: string, displayName?: string) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, displayName }),
    }),
  firebaseLogin: (payload: { phone: string; idToken: string; displayName?: string }) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendWebRtcSignal: (to: string, signal: any, callId?: string) =>
    req<{ ok: boolean }>('/api/webrtc/signal', {
      method: 'POST',
      body: JSON.stringify({ to, signal, callId }),
    }),
  getWebRtcSignals: () => req<{ signals: Array<{ from: string; signal: any; callId: string }> }>('/api/webrtc/signals'),
  getWebRtcConfig: () => req<{ iceServers: RTCIceServer[]; turnConfigured: boolean }>('/api/webrtc/config'),
  uploadFile: (file: { name: string; type: string; size: number; data: string }) =>
    req<{ url: string; name: string; type: string; size: number; isImage: boolean }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify(file),
    }),

  register: (username: string, password: string, displayName: string) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    }),
  login: (username: string, password: string) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  demoLogin: (displayName?: string) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<{ user: User; nexconnToken: string }>('/api/me'),
  refreshNexconnToken: () => req<{ nexconnToken: string }>('/api/me/token', { method: 'POST' }),
  updateMe: (patch: Partial<User>) =>
    req<{ user: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  sync: () => req<SyncPayload>('/api/sync'),
  lookupUsers: (ids: string[]) =>
    req<{ users: Record<string, User> }>('/api/users/lookup', { method: 'POST', body: JSON.stringify({ ids }) }),

  createServer: (name: string, template: 'gaming' | 'standard' = 'gaming') =>
    req<{ server: Server }>('/api/servers', { method: 'POST', body: JSON.stringify({ name, template }) }),
  updateServer: (id: string, patch: { name?: string; description?: string; iconColor?: string; iconUrl?: string; bannerUrl?: string }) =>
    req<{ server: Server }>(`/api/servers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteServer: (id: string) => req<{ ok: boolean }>(`/api/servers/${id}`, { method: 'DELETE' }),
  leaveServer: (id: string) => req<{ ok: boolean }>(`/api/servers/${id}/leave`, { method: 'POST' }),
  regenInvite: (id: string) => req<{ inviteCode: string }>(`/api/servers/${id}/invite/regenerate`, { method: 'POST' }),
  joinInvite: (code: string) =>
    req<{ server: Server }>(`/api/invites/${encodeURIComponent(code)}/join`, { method: 'POST' }),

  createChannel: (serverId: string, body: { name: string; type: string; categoryId: string | null; topic?: string }) =>
    req(`/api/servers/${serverId}/channels`, { method: 'POST', body: JSON.stringify(body) }),
  deleteChannel: (serverId: string, channelId: string) =>
    req(`/api/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' }),
  createCategory: (serverId: string, name: string) =>
    req(`/api/servers/${serverId}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),

  createRole: (serverId: string, body: { name: string; color: string; permissions: Record<string, boolean> }) =>
    req(`/api/servers/${serverId}/roles`, { method: 'POST', body: JSON.stringify(body) }),
  deleteRole: (serverId: string, roleId: string) =>
    req(`/api/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' }),
  updateMember: (serverId: string, userId: string, patch: { roles?: string[]; nickname?: string }) =>
    req(`/api/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setMemberRole: (serverId: string, userId: string, role: string) =>
    req(`/api/servers/${serverId}/members/${userId}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
  kickMember: (serverId: string, userId: string) =>
    req(`/api/servers/${serverId}/members/${userId}/kick`, { method: 'POST' }),

  pinMessage: (serverId: string, channelId: string, message: { id: string; senderId: string; text: string; createdAt: number; attachments?: any[] }) =>
    req(`/api/servers/${serverId}/pins`, { method: 'POST', body: JSON.stringify({ channelId, message }) }),
  unpinMessage: (serverId: string, channelId: string, messageId: string) =>
    req(`/api/servers/${serverId}/pins/${channelId}/${messageId}`, { method: 'DELETE' }),
  pinDmMessage: (targetKey: string, message: { id: string; senderId: string; text: string; createdAt: number; attachments?: any[] }) =>
    req(`/api/pins/dm/${encodeURIComponent(targetKey)}`, { method: 'POST', body: JSON.stringify({ message }) }),
  unpinDmMessage: (targetKey: string, messageId: string) =>
    req(`/api/pins/dm/${encodeURIComponent(targetKey)}/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),

  updateSquadState: (serverId: string, channelId: string, patch: { game?: string; map?: string; ready?: boolean }) =>
    req<{ state: SquadLobbyState }>(`/api/squad/${serverId}/${channelId}`, { method: 'POST', body: JSON.stringify(patch) }),

  ensureLive: (serverId: string, channelId: string) =>
    req<{ openChannelId: string; code: number }>(`/api/servers/${serverId}/channels/${channelId}/live/ensure`, { method: 'POST' }),
  startLive: (serverId: string, channelId: string, body: { streamUrl?: string; title?: string; mode?: string; callId?: string }) =>
    req(`/api/servers/${serverId}/channels/${channelId}/live/start`, { method: 'POST', body: JSON.stringify(body) }),
  stopLive: (serverId: string, channelId: string) =>
    req(`/api/servers/${serverId}/channels/${channelId}/live/stop`, { method: 'POST' }),
  joinLive: (serverId: string, channelId: string) =>
    req<{ ok: boolean; channelId: string; viewers: string[] }>(`/api/servers/${serverId}/channels/${channelId}/live/join`, { method: 'POST' }),
  leaveLive: (serverId: string, channelId: string) =>
    req<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}/live/leave`, { method: 'POST' }),
  getLiveViewers: (serverId: string, channelId: string) =>
    req<{ channelId: string; viewers: string[] }>(`/api/servers/${serverId}/channels/${channelId}/live/viewers`),

  getMessages: (targetKey: string) =>
    req<{ messages: ChatMessage[] }>(`/api/messages/${encodeURIComponent(targetKey)}`),
  postMessage: (targetKey: string, body: Partial<ChatMessage>) =>
    req<{ message: ChatMessage }>(`/api/messages/${encodeURIComponent(targetKey)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  editMessage: (targetKey: string, msgId: string, text: string) =>
    req<{ message: ChatMessage }>(`/api/messages/${encodeURIComponent(targetKey)}/${msgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  deleteMessage: (targetKey: string, msgId: string) =>
    req<{ ok: boolean }>(`/api/messages/${encodeURIComponent(targetKey)}/${msgId}`, { method: 'DELETE' }),
  reactMessage: (targetKey: string, msgId: string, emoji: string) =>
    req<{ message: ChatMessage }>(`/api/messages/${encodeURIComponent(targetKey)}/${msgId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  sendTyping: (targetKey: string) =>
    req('/api/typing', { method: 'POST', body: JSON.stringify({ targetKey }) }),
  sendLiveHype: (serverId: string, channelId: string, emoji: string, text?: string) =>
    req('/api/live-hype', { method: 'POST', body: JSON.stringify({ serverId, channelId, emoji, text }) }),

  joinVoice: (serverId: string, channelId: string) =>
    req<{ callId: string; participants: string[] }>('/api/voice/join', {
      method: 'POST',
      body: JSON.stringify({ serverId, channelId }),
    }),
  setVoiceCallId: (callId: string) =>
    req('/api/voice/call', { method: 'POST', body: JSON.stringify({ callId }) }),
  requestVoiceInvite: () => req('/api/voice/request-invite', { method: 'POST' }),
  updateVoiceState: (patch: { muted?: boolean; deafened?: boolean; video?: boolean; streaming?: boolean }) =>
    req('/api/voice/state', { method: 'POST', body: JSON.stringify(patch) }),
  leaveVoice: () => req('/api/voice/leave', { method: 'POST' }),

  startDirectCall: (payload: { targetUserId?: string; phone?: string; mediaType?: 'audio' | 'video'; contactName?: string }) =>
    req<{ call: DirectCallSession }>('/api/calls/start', { method: 'POST', body: JSON.stringify(payload) }),
  acceptDirectCall: (callId: string, mediaType?: 'audio' | 'video') =>
    req<{ call: DirectCallSession }>('/api/calls/accept', { method: 'POST', body: JSON.stringify({ callId, mediaType }) }),
  endDirectCall: (callId?: string, reason?: string) =>
    req<{ ok: boolean }>('/api/calls/end', { method: 'POST', body: JSON.stringify({ callId, reason }) }),
  getActiveDirectCall: () => req<{ call: DirectCallSession | null }>('/api/calls/active'),

  requestFriend: (payload: { username?: string; phone?: string; userId?: string }) =>
    req<{ ok: boolean; user: User }>('/api/friends/request', { method: 'POST', body: JSON.stringify(payload) }),
  matchContacts: (payload: { phoneNumbers?: string[]; contacts?: { name: string; phone: string }[] }) =>
    req<{
      matches: Array<{
        user: User;
        contactName: string;
        phone: string;
        isFriend: boolean;
        hasPendingOutgoing: boolean;
        hasPendingIncoming: boolean;
        isOnline?: boolean;
      }>;
    }>('/api/contacts/match', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  acceptFriend: (userId: string) =>
    req('/api/friends/accept', { method: 'POST', body: JSON.stringify({ userId }) }),
  declineFriend: (userId: string) =>
    req('/api/friends/decline', { method: 'POST', body: JSON.stringify({ userId }) }),
  removeFriend: (userId: string) => req(`/api/friends/${userId}`, { method: 'DELETE' }),
  openDm: (userId: string) => req('/api/dms/open', { method: 'POST', body: JSON.stringify({ userId }) }),
  closeDm: (userId: string) => req('/api/dms/close', { method: 'POST', body: JSON.stringify({ userId }) }),

  // Admin Console API
  adminGetOverview: () => req<any>('/api/admin/overview'),
  adminGetLogs: (params: { limit?: number; tag?: string; level?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.tag) q.set('tag', params.tag);
    if (params.level) q.set('level', params.level);
    if (params.search) q.set('search', params.search);
    return req<{ logs: any[]; total: number }>(`/api/admin/logs?${q.toString()}`);
  },
  adminClearLogs: () => req<{ ok: boolean }>('/api/admin/logs', { method: 'DELETE' }),
  adminGetConfig: () => req<any>('/api/admin/config'),
  adminSaveConfig: (payload: any) =>
    req<{ ok: boolean; message: string; fast2smsVerified: boolean; walletBalance?: string }>('/api/admin/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminTestApi: (type: 'fast2sms' | 'nexconn', apiKey?: string) =>
    req<any>('/api/admin/test-api', { method: 'POST', body: JSON.stringify({ type, apiKey }) }),
  adminGetUsers: () => req<{ users: any[]; total: number }>('/api/admin/users'),
  adminToggleUserAdmin: (userId: string) =>
    req<{ ok: boolean; user: User }>(`/api/admin/users/${userId}/toggle-admin`, { method: 'POST' }),
  adminDeleteUser: (userId: string) =>
    req<{ ok: boolean; message: string }>(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  adminGetServers: () => req<{ servers: any[]; total: number }>('/api/admin/servers'),
  adminDeleteServer: (serverId: string) =>
    req<{ ok: boolean; message: string }>(`/api/admin/servers/${serverId}`, { method: 'DELETE' }),
  adminBroadcast: (title: string, message: string) =>
    req<{ ok: boolean; message: string; recipients?: number }>('/api/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title, message }),
    }),
};
