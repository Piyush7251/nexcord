import 'package:flutter/material.dart';

Color hexToColor(String hex, {Color fallback = const Color(0xFF5865F2)}) {
  final clean = hex.replaceAll('#', '').trim();
  if (clean.length == 6) {
    final v = int.tryParse('FF$clean', radix: 16);
    if (v != null) return Color(v);
  }
  if (clean.length == 8) {
    final v = int.tryParse(clean, radix: 16);
    if (v != null) return Color(v);
  }
  return fallback;
}

class NexcordUser {
  final String id;
  final String username;
  final String displayName;
  final String avatarColor;
  final String avatarUrl;
  final String bannerColor;
  final String status;
  final String customStatus;
  final String about;
  final bool isBot;

  NexcordUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.avatarColor,
    this.avatarUrl = '',
    this.bannerColor = '',
    this.status = 'offline',
    this.customStatus = '',
    this.about = '',
    this.isBot = false,
  });

  factory NexcordUser.fromJson(Map<String, dynamic> j) => NexcordUser(
        id: j['id']?.toString() ?? '',
        username: j['username']?.toString() ?? '',
        displayName: j['displayName']?.toString() ?? j['username']?.toString() ?? 'User',
        avatarColor: j['avatarColor']?.toString() ?? '#5865F2',
        avatarUrl: j['avatarUrl']?.toString() ?? '',
        bannerColor: j['bannerColor']?.toString() ?? '',
        status: j['status']?.toString() ?? 'offline',
        customStatus: j['customStatus']?.toString() ?? '',
        about: j['about']?.toString() ?? '',
        isBot: j['isBot'] == true,
      );

  Color get color => hexToColor(avatarColor);

  Color get statusColor {
    switch (status) {
      case 'online':
        return const Color(0xFF23A55A);
      case 'idle':
        return const Color(0xFFF0B232);
      case 'dnd':
        return const Color(0xFFF23F43);
      default:
        return const Color(0xFF80848E);
    }
  }
}

class ChannelCategory {
  final String id;
  final String name;

  ChannelCategory({required this.id, required this.name});

  factory ChannelCategory.fromJson(Map<String, dynamic> j) =>
      ChannelCategory(id: j['id']?.toString() ?? '', name: j['name']?.toString() ?? '');
}

class LiveBroadcastInfo {
  final String userId;
  final String title;
  final String mode;
  final String streamUrl;

  LiveBroadcastInfo({
    required this.userId,
    required this.title,
    required this.mode,
    required this.streamUrl,
  });

  factory LiveBroadcastInfo.fromJson(Map<String, dynamic> j) => LiveBroadcastInfo(
        userId: j['userId']?.toString() ?? '',
        title: j['title']?.toString() ?? 'Live Stream',
        mode: j['mode']?.toString() ?? 'esports-sim',
        streamUrl: j['streamUrl']?.toString() ?? '',
      );
}

class NexcordChannel {
  final String id;
  final String name;
  final String type; // text | voice | live | announcement
  final String? categoryId;
  final String topic;
  final String? openChannelId;
  final LiveBroadcastInfo? live;

  NexcordChannel({
    required this.id,
    required this.name,
    required this.type,
    this.categoryId,
    this.topic = '',
    this.openChannelId,
    this.live,
  });

  factory NexcordChannel.fromJson(Map<String, dynamic> j) => NexcordChannel(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? 'channel',
        type: j['type']?.toString() ?? 'text',
        categoryId: j['categoryId']?.toString(),
        topic: j['topic']?.toString() ?? '',
        openChannelId: j['openChannelId']?.toString(),
        live: j['live'] is Map<String, dynamic>
            ? LiveBroadcastInfo.fromJson(j['live'] as Map<String, dynamic>)
            : null,
      );
}

class VoiceParticipant {
  final String userId;
  final bool muted;
  final bool deafened;
  final bool video;
  final bool streaming;

  VoiceParticipant({
    required this.userId,
    this.muted = false,
    this.deafened = false,
    this.video = false,
    this.streaming = false,
  });

  factory VoiceParticipant.fromJson(Map<String, dynamic> j) => VoiceParticipant(
        userId: j['userId']?.toString() ?? '',
        muted: j['muted'] == true,
        deafened: j['deafened'] == true,
        video: j['video'] == true,
        streaming: j['streaming'] == true,
      );
}

class VoiceJoinResult {
  final String callId;
  final List<String> participants;

  VoiceJoinResult({required this.callId, required this.participants});

  factory VoiceJoinResult.fromJson(Map<String, dynamic> j) => VoiceJoinResult(
        callId: j['callId']?.toString() ?? '',
        participants: (j['participants'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

class ServerRole {
  final String id;
  final String name;
  final String color;

  ServerRole({required this.id, required this.name, required this.color});

  factory ServerRole.fromJson(Map<String, dynamic> j) => ServerRole(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        color: j['color']?.toString() ?? '#99AAB5',
      );
}

class ServerMember {
  final String userId;
  final List<String> roles;
  final String nickname;

  ServerMember({required this.userId, required this.roles, this.nickname = ''});

  factory ServerMember.fromJson(Map<String, dynamic> j) => ServerMember(
        userId: j['userId']?.toString() ?? '',
        roles: (j['roles'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
        nickname: j['nickname']?.toString() ?? '',
      );
}

class NexcordServer {
  final String id;
  final String name;
  final String iconColor;
  final String description;
  final String ownerId;
  final String inviteCode;
  final List<ChannelCategory> categories;
  final List<NexcordChannel> channels;
  final List<ServerRole> roles;
  final List<ServerMember> members;
  final Map<String, List<VoiceParticipant>> voiceStates;
  final Map<String, List<Map<String, dynamic>>> pins;

  NexcordServer({
    required this.id,
    required this.name,
    required this.iconColor,
    required this.description,
    required this.ownerId,
    required this.inviteCode,
    required this.categories,
    required this.channels,
    required this.roles,
    required this.members,
    required this.voiceStates,
    required this.pins,
  });

  factory NexcordServer.fromJson(Map<String, dynamic> j) {
    final vsRaw = j['voiceStates'] as Map<String, dynamic>? ?? {};
    final vs = <String, List<VoiceParticipant>>{};
    for (final e in vsRaw.entries) {
      vs[e.key] = (e.value as List<dynamic>? ?? [])
          .map((v) => VoiceParticipant.fromJson(v as Map<String, dynamic>))
          .toList();
    }

    final pinsRaw = j['pins'] as Map<String, dynamic>? ?? {};
    final pinsMap = <String, List<Map<String, dynamic>>>{};
    for (final e in pinsRaw.entries) {
      pinsMap[e.key] = (e.value as List<dynamic>? ?? [])
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
    }

    return NexcordServer(
      id: j['id']?.toString() ?? '',
      name: j['name']?.toString() ?? 'Server',
      iconColor: j['iconColor']?.toString() ?? '#5865F2',
      description: j['description']?.toString() ?? '',
      ownerId: j['ownerId']?.toString() ?? '',
      inviteCode: j['inviteCode']?.toString() ?? '',
      categories: (j['categories'] as List<dynamic>? ?? [])
          .map((e) => ChannelCategory.fromJson(e as Map<String, dynamic>))
          .toList(),
      channels: (j['channels'] as List<dynamic>? ?? [])
          .map((e) => NexcordChannel.fromJson(e as Map<String, dynamic>))
          .toList(),
      roles: (j['roles'] as List<dynamic>? ?? [])
          .map((e) => ServerRole.fromJson(e as Map<String, dynamic>))
          .toList(),
      members: (j['members'] as List<dynamic>? ?? [])
          .map((e) => ServerMember.fromJson(e as Map<String, dynamic>))
          .toList(),
      voiceStates: vs,
      pins: pinsMap,
    );
  }
}

class ReplyRef {
  final String id;
  final String senderId;
  final String text;

  ReplyRef({required this.id, required this.senderId, required this.text});

  factory ReplyRef.fromJson(Map<String, dynamic> j) => ReplyRef(
        id: j['id']?.toString() ?? '',
        senderId: j['senderId']?.toString() ?? '',
        text: j['text']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'senderId': senderId, 'text': text};
}

class ChatMessage {
  final String id;
  final String targetKey;
  final String senderId;
  final String text;
  final String type;
  final ReplyRef? replyTo;
  final Map<String, dynamic>? metadata;
  final Map<String, List<String>> reactions;
  final int createdAt;
  final int? editedAt;

  ChatMessage({
    required this.id,
    required this.targetKey,
    required this.senderId,
    required this.text,
    required this.type,
    this.replyTo,
    this.metadata,
    required this.reactions,
    required this.createdAt,
    this.editedAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) {
    final rxRaw = j['reactions'] as Map<String, dynamic>? ?? {};
    final rx = <String, List<String>>{};
    for (final e in rxRaw.entries) {
      rx[e.key] = (e.value as List<dynamic>? ?? []).map((u) => u.toString()).toList();
    }
    return ChatMessage(
      id: j['id']?.toString() ?? '',
      targetKey: j['targetKey']?.toString() ?? '',
      senderId: j['senderId']?.toString() ?? '',
      text: j['text']?.toString() ?? '',
      type: j['type']?.toString() ?? 'text',
      replyTo: j['replyTo'] is Map<String, dynamic>
          ? ReplyRef.fromJson(j['replyTo'] as Map<String, dynamic>)
          : null,
      metadata: j['metadata'] is Map ? Map<String, dynamic>.from(j['metadata'] as Map) : null,
      reactions: rx,
      createdAt: (j['createdAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      editedAt: (j['editedAt'] as num?)?.toInt(),
    );
  }
}

class SquadLobbyState {
  final String game;
  final String map;
  final Map<String, bool> ready;

  SquadLobbyState({
    required this.game,
    required this.map,
    required this.ready,
  });

  factory SquadLobbyState.fromJson(Map<String, dynamic> j) {
    final raw = j['ready'] as Map<String, dynamic>? ?? {};
    final r = <String, bool>{};
    for (final e in raw.entries) {
      r[e.key] = e.value == true;
    }
    return SquadLobbyState(
      game: j['game']?.toString() ?? 'VALORANT • Competitive',
      map: j['map']?.toString() ?? 'Ascent',
      ready: r,
    );
  }
}

class NexconnConfig {
  final String appKey;
  final int areaCode;
  final String apiHost;
  final bool configured;

  NexconnConfig({
    this.appKey = '',
    this.areaCode = 2,
    this.apiHost = 'api.sg-light-api.com',
    this.configured = false,
  });

  factory NexconnConfig.fromJson(Map<String, dynamic> j) => NexconnConfig(
        appKey: j['appKey']?.toString() ?? '',
        areaCode: (j['areaCode'] as num?)?.toInt() ?? 2,
        apiHost: j['apiHost']?.toString() ?? 'api.sg-light-api.com',
        configured: j['configured'] == true,
      );
}

class SdkLogEntry {
  final DateTime timestamp;
  final String sdk;
  final String action;
  final String detail;
  final String level;

  SdkLogEntry({
    required this.timestamp,
    required this.sdk,
    required this.action,
    required this.detail,
    this.level = 'info',
  });
}

class QuickChatPreset {
  final String id;
  final String category; // tactical | comms | hype | status
  final String icon;
  final String label;
  final String text;

  const QuickChatPreset({
    required this.id,
    required this.category,
    required this.icon,
    required this.label,
    required this.text,
  });
}

const List<QuickChatPreset> kQuickChatPresets = [
  QuickChatPreset(id: 't1', category: 'tactical', icon: '⚡', label: 'Rush B Site', text: '⚡ Rush B Site! Full execute now!'),
  QuickChatPreset(id: 't2', category: 'tactical', icon: '🎯', label: 'Enemy 240° NW', text: '🎯 Enemy Spotted — 240° NW!'),
  QuickChatPreset(id: 't3', category: 'tactical', icon: '🛡️', label: 'Hold Anchor', text: '🛡️ Hold Position & Anchor Site'),
  QuickChatPreset(id: 't4', category: 'tactical', icon: '🔄', label: 'Rotate A', text: '🔄 Rotating to A Site — Watch Flank!'),
  QuickChatPreset(id: 't5', category: 'tactical', icon: '💣', label: 'Plant Spike', text: '💣 Site Clear — Plant the Spike!'),
  QuickChatPreset(id: 'c1', category: 'comms', icon: '🆘', label: 'Need Backup', text: '🆘 Need Backup Immediately!'),
  QuickChatPreset(id: 'c2', category: 'comms', icon: '🔋', label: 'Ult Ready', text: '🔋 Ultimate Ready (100%) — Let’s Combo!'),
  QuickChatPreset(id: 'c3', category: 'comms', icon: '💊', label: 'Drop Heals', text: '💊 Dropping Heals / Shields Here'),
  QuickChatPreset(id: 'c4', category: 'comms', icon: '💰', label: 'Eco Round', text: '💰 Eco / Save Round — Play Picks'),
  QuickChatPreset(id: 'c5', category: 'comms', icon: '🎤', label: 'Mic Check', text: '🎤 Mic Check — Squad Ready in Voice!'),
  QuickChatPreset(id: 'h1', category: 'hype', icon: '🔥', label: 'INSANE CLUTCH', text: '🔥 INSANE CLUTCH!! What a play!'),
  QuickChatPreset(id: 'h2', category: 'hype', icon: '👑', label: 'GG WP!', text: '👑 GG WP Squad! Clean dub!'),
  QuickChatPreset(id: 'h3', category: 'hype', icon: '🚀', label: "Let's Gooo", text: '🚀 LET’S GOOOO!! Momentum is ours!'),
  QuickChatPreset(id: 'h4', category: 'hype', icon: '💎', label: 'MVP Play', text: '💎 Absolute MVP round right there!'),
  QuickChatPreset(id: 's1', category: 'status', icon: '✅', label: 'Ready Queue', text: '✅ Ready for Match Queue!'),
  QuickChatPreset(id: 's2', category: 'status', icon: '⏳', label: 'AFK 2m', text: '⏳ Stepping away 2 mins — BRB'),
  QuickChatPreset(id: 's3', category: 'status', icon: '🎧', label: 'In Voice', text: '🎧 Hopping into Squad Voice Huddle!'),
  QuickChatPreset(id: 's4', category: 'status', icon: '📺', label: 'Watch Party', text: '📺 Watching the Live Stream Stage!'),
];
