export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  bannerColor?: string;
  status: UserStatus;
  customStatus?: string;
  about?: string;
  createdAt: number;
  isBot?: boolean;
}

export interface RolePermissions {
  admin?: boolean;
  manageChannels?: boolean;
  manageServer?: boolean;
  kick?: boolean;
  owner?: boolean;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: RolePermissions;
}

export interface Member {
  userId: string;
  roles: string[];
  joinedAt: number;
  nickname?: string;
}

export interface Category {
  id: string;
  name: string;
}

export type ChannelKind = 'text' | 'voice' | 'live' | 'announcement';

export interface LiveBroadcastState {
  userId: string;
  streamUrl: string;
  title: string;
  mode: 'esports-sim' | 'embed' | 'webrtc';
  callId: string;
  startedAt: number;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelKind;
  categoryId: string | null;
  topic?: string;
  openChannelId?: string;
  live?: LiveBroadcastState | null;
  slowmode?: number;
}

export interface VoiceParticipant {
  userId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  streaming?: boolean;
  joinedAt: number;
}

export interface PinnedMessageSnapshot {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  pinnedBy?: string;
  pinnedAt?: number;
}

export interface Server {
  id: string;
  name: string;
  iconColor: string;
  iconUrl?: string;
  description?: string;
  ownerId: string;
  inviteCode: string;
  createdAt: number;
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  members: Member[];
  pins: Record<string, PinnedMessageSnapshot[]>;
  voiceStates: Record<string, VoiceParticipant[]>;
  myPermissions: RolePermissions;
  joinedAt?: number;
}

export interface MessageAttachment {
  name: string;
  size: number;
  mimeType: string;
  dataUrl: string;
  isImage?: boolean;
}

export interface ReplyReference {
  id: string;
  senderId: string;
  text: string;
}

export interface MessageMetadata {
  category?: string;
  badge?: string;
  coords?: { x: number; y: number; label: string };
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  nexconnMessageId?: string;
  targetKey: string;
  senderId: string;
  text: string;
  type: 'text' | 'quickchat' | 'image' | 'file' | 'system';
  replyTo?: ReplyReference | null;
  attachments?: MessageAttachment[];
  metadata?: MessageMetadata | null;
  reactions: Record<string, string[]>;
  createdAt: number;
  editedAt?: number | null;
}

export interface SquadLobbyState {
  game: string;
  map: string;
  ready: Record<string, boolean>;
}

export interface SyncPayload {
  me: User;
  servers: Server[];
  friends: string[];
  incoming: string[];
  outgoing: string[];
  dms: string[];
  users: Record<string, User>;
  myVoice: { serverId: string; channelId: string } | null;
  squadState: Record<string, SquadLobbyState>;
}

export interface NexconnConfig {
  appKey: string;
  areaCode: number;
  apiHost: string;
  configured: boolean;
  fast2smsConfigured: boolean;
}

export type QuickChatCategory = 'tactical' | 'comms' | 'hype' | 'status';

export interface QuickChatPreset {
  id: string;
  category: QuickChatCategory;
  icon: string;
  label: string;
  text: string;
  hotkey?: string;
}

export interface CallSessionState {
  status: 'idle' | 'ringing_in' | 'calling' | 'connected';
  callId: string;
  isGroup: boolean;
  mediaType: 'audio' | 'video';
  peerIds: string[];
  callerId?: string;
  targetLabel?: string;
  startedAt?: number;
  micMuted: boolean;
  cameraEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
}

export interface SdkLogEntry {
  id: string;
  ts: number;
  sdk: 'chat' | 'call' | 'system';
  action: string;
  detail: string;
  level: 'info' | 'ok' | 'warn';
}

export interface LiveHypeBurst {
  id: string;
  emoji: string;
  text?: string;
  userId: string;
  displayName: string;
  x: number;
}
