import type { ChatMessage, NexconnConfig, Server, SquadLobbyState, SyncPayload, User } from '../types';

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const DEFAULT_MOBILE_API = isAndroid ? 'http://10.0.2.2:3001' : 'http://localhost:3001';

export function getApiBase(): string {
  const saved = localStorage.getItem('nexcord_api_base');
  if (saved) return saved.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol;
    if (proto === 'capacitor:' || proto === 'file:') {
      return DEFAULT_MOBILE_API;
    }
  }
  return '';
}

export function setApiBase(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) localStorage.removeItem('nexcord_api_base');
  else localStorage.setItem('nexcord_api_base', clean);
}

let sessionToken = localStorage.getItem('nexcord_session') || '';

export function getSessionToken(): string {
  return sessionToken;
}

export function setSessionToken(tok: string): void {
  sessionToken = tok;
  if (tok) localStorage.setItem('nexcord_session', tok);
  else localStorage.removeItem('nexcord_session');
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
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

  sendOtp: (phone: string) =>
    req<{ ok: boolean; phone: string; devOtp?: string; message: string }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string, displayName?: string) =>
    req<{ session: string; user: User; nexconnToken: string }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, displayName }),
    }),
  sendWebRtcSignal: (to: string, signal: any, callId?: string) =>
    req<{ ok: boolean }>('/api/webrtc/signal', {
      method: 'POST',
      body: JSON.stringify({ to, signal, callId }),
    }),
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
  updateServer: (id: string, patch: { name?: string; description?: string; iconColor?: string }) =>
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
  kickMember: (serverId: string, userId: string) =>
    req(`/api/servers/${serverId}/members/${userId}/kick`, { method: 'POST' }),

  pinMessage: (serverId: string, channelId: string, message: { id: string; senderId: string; text: string; createdAt: number }) =>
    req(`/api/servers/${serverId}/pins`, { method: 'POST', body: JSON.stringify({ channelId, message }) }),
  unpinMessage: (serverId: string, channelId: string, messageId: string) =>
    req(`/api/servers/${serverId}/pins/${channelId}/${messageId}`, { method: 'DELETE' }),

  updateSquadState: (serverId: string, channelId: string, patch: { game?: string; map?: string; ready?: boolean }) =>
    req<{ state: SquadLobbyState }>(`/api/squad/${serverId}/${channelId}`, { method: 'POST', body: JSON.stringify(patch) }),

  ensureLive: (serverId: string, channelId: string) =>
    req<{ openChannelId: string; code: number }>(`/api/servers/${serverId}/channels/${channelId}/live/ensure`, { method: 'POST' }),
  startLive: (serverId: string, channelId: string, body: { streamUrl?: string; title?: string; mode?: string; callId?: string }) =>
    req(`/api/servers/${serverId}/channels/${channelId}/live/start`, { method: 'POST', body: JSON.stringify(body) }),
  stopLive: (serverId: string, channelId: string) =>
    req(`/api/servers/${serverId}/channels/${channelId}/live/stop`, { method: 'POST' }),

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
};
