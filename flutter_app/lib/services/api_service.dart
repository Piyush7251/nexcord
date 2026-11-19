import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

class SyncResult {
  final NexcordUser me;
  final List<NexcordServer> servers;
  final List<String> friends;
  final List<String> incoming;
  final List<String> outgoing;
  final List<String> dms;
  final Map<String, NexcordUser> users;
  final Map<String, SquadLobbyState> squadState;
  final String? voiceServerId;
  final String? voiceChannelId;

  SyncResult({
    required this.me,
    required this.servers,
    required this.friends,
    required this.incoming,
    required this.outgoing,
    required this.dms,
    required this.users,
    required this.squadState,
    this.voiceServerId,
    this.voiceChannelId,
  });
}

class ApiService {
  static const _kSessionKey = 'nexcord_flutter_session';
  static const _kBaseUrlKey = 'nexcord_flutter_api_base';

  String sessionToken = '';
  String baseUrl = defaultBaseUrl();

  static String defaultBaseUrl() {
    if (kIsWeb) return 'http://localhost:3001';
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:3001';
    } catch (_) {}
    return 'http://localhost:3001';
  }

  Future<void> loadSaved() async {
    final prefs = await SharedPreferences.getInstance();
    sessionToken = prefs.getString(_kSessionKey) ?? '';
    final savedBase = prefs.getString(_kBaseUrlKey);
    if (savedBase != null && savedBase.trim().isNotEmpty) {
      baseUrl = savedBase.trim().replaceAll(RegExp(r'/+$'), '');
    }
  }

  Future<void> setBaseUrl(String url) async {
    final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
    baseUrl = clean.isEmpty ? defaultBaseUrl() : clean;
    final prefs = await SharedPreferences.getInstance();
    if (clean.isEmpty) {
      await prefs.remove(_kBaseUrlKey);
    } else {
      await prefs.setString(_kBaseUrlKey, baseUrl);
    }
  }

  Future<void> setSession(String tok) async {
    sessionToken = tok;
    final prefs = await SharedPreferences.getInstance();
    if (tok.isEmpty) {
      await prefs.remove(_kSessionKey);
    } else {
      await prefs.setString(_kSessionKey, tok);
    }
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        if (sessionToken.isNotEmpty) 'Authorization': 'Bearer $sessionToken',
      };

  Future<Map<String, dynamic>> _req(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$baseUrl$path');
    late http.Response res;
    if (method == 'GET') {
      res = await http.get(uri, headers: _headers()).timeout(const Duration(seconds: 10));
    } else if (method == 'POST') {
      res = await http.post(uri, headers: _headers(), body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 10));
    } else if (method == 'PATCH') {
      res = await http.patch(uri, headers: _headers(), body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 10));
    } else if (method == 'DELETE') {
      res = await http.delete(uri, headers: _headers()).timeout(const Duration(seconds: 10));
    } else {
      throw UnsupportedError('Unsupported method $method');
    }

    final decoded = res.body.isNotEmpty ? jsonDecode(res.body) : <String, dynamic>{};
    final map = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    if (res.statusCode >= 400) {
      throw Exception(map['error']?.toString() ?? 'Request failed (${res.statusCode})');
    }
    return map;
  }

  Future<NexconnConfig> getConfig() async {
    final j = await _req('GET', '/api/config');
    return NexconnConfig.fromJson(j);
  }

  Future<Map<String, dynamic>> saveCredentials({
    required String appKey,
    required String appSecret,
    required String apiHost,
    required int areaCode,
  }) =>
      _req('POST', '/api/config/credentials', {
        'appKey': appKey,
        'appSecret': appSecret,
        'apiHost': apiHost,
        'areaCode': areaCode,
      });

  Future<({String session, NexcordUser user, String nexconnToken})> demoLogin([String? displayName]) async {
    final j = await _req('POST', '/api/auth/demo', {if (displayName != null) 'displayName': displayName});
    final tok = j['session']?.toString() ?? '';
    await setSession(tok);
    return (
      session: tok,
      user: NexcordUser.fromJson(j['user'] as Map<String, dynamic>),
      nexconnToken: j['nexconnToken']?.toString() ?? '',
    );
  }

  Future<({String session, NexcordUser user, String nexconnToken})> login(String username, String password) async {
    final j = await _req('POST', '/api/auth/login', {'username': username, 'password': password});
    final tok = j['session']?.toString() ?? '';
    await setSession(tok);
    return (
      session: tok,
      user: NexcordUser.fromJson(j['user'] as Map<String, dynamic>),
      nexconnToken: j['nexconnToken']?.toString() ?? '',
    );
  }

  Future<({String session, NexcordUser user, String nexconnToken})> register(
      String username, String password, String displayName) async {
    final j = await _req('POST', '/api/auth/register', {
      'username': username,
      'password': password,
      'displayName': displayName,
    });
    final tok = j['session']?.toString() ?? '';
    await setSession(tok);
    return (
      session: tok,
      user: NexcordUser.fromJson(j['user'] as Map<String, dynamic>),
      nexconnToken: j['nexconnToken']?.toString() ?? '',
    );
  }

  Future<({NexcordUser user, String nexconnToken})> me() async {
    final j = await _req('GET', '/api/me');
    return (
      user: NexcordUser.fromJson(j['user'] as Map<String, dynamic>),
      nexconnToken: j['nexconnToken']?.toString() ?? '',
    );
  }

  Future<void> logout() async {
    await _req('POST', '/api/auth/logout').catchError((_) => <String, dynamic>{});
    await setSession('');
  }

  Future<void> updateMe(Map<String, dynamic> patch) async {
    await _req('PATCH', '/api/me', patch);
  }

  Future<SyncResult> sync() async {
    final j = await _req('GET', '/api/sync');
    final usersMap = <String, NexcordUser>{};
    final usersRaw = j['users'] as Map<String, dynamic>? ?? {};
    for (final e in usersRaw.entries) {
      usersMap[e.key] = NexcordUser.fromJson(e.value as Map<String, dynamic>);
    }
    final squadMap = <String, SquadLobbyState>{};
    final squadRaw = j['squadState'] as Map<String, dynamic>? ?? {};
    for (final e in squadRaw.entries) {
      squadMap[e.key] = SquadLobbyState.fromJson(e.value as Map<String, dynamic>);
    }
    final mv = j['myVoice'] as Map<String, dynamic>?;
    return SyncResult(
      me: NexcordUser.fromJson(j['me'] as Map<String, dynamic>),
      servers: (j['servers'] as List<dynamic>? ?? [])
          .map((s) => NexcordServer.fromJson(s as Map<String, dynamic>))
          .toList(),
      friends: (j['friends'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      incoming: (j['incoming'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      outgoing: (j['outgoing'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      dms: (j['dms'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      users: usersMap,
      squadState: squadMap,
      voiceServerId: mv?['serverId']?.toString(),
      voiceChannelId: mv?['channelId']?.toString(),
    );
  }

  Future<List<ChatMessage>> getMessages(String targetKey) async {
    final j = await _req('GET', '/api/messages/${Uri.encodeComponent(targetKey)}');
    return (j['messages'] as List<dynamic>? ?? [])
        .map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
        .toList();
  }

  Future<ChatMessage> postMessage(
    String targetKey, {
    required String text,
    String type = 'text',
    ReplyRef? replyTo,
    Map<String, dynamic>? metadata,
    String nexconnMessageId = '',
  }) async {
    final j = await _req('POST', '/api/messages/${Uri.encodeComponent(targetKey)}', {
      'text': text,
      'type': type,
      if (replyTo != null) 'replyTo': replyTo.toJson(),
      if (metadata != null) 'metadata': metadata,
      if (nexconnMessageId.isNotEmpty) 'nexconnMessageId': nexconnMessageId,
    });
    return ChatMessage.fromJson(j['message'] as Map<String, dynamic>);
  }

  Future<void> editMessage(String targetKey, String msgId, String text) =>
      _req('PATCH', '/api/messages/${Uri.encodeComponent(targetKey)}/$msgId', {'text': text});

  Future<void> deleteMessage(String targetKey, String msgId) =>
      _req('DELETE', '/api/messages/${Uri.encodeComponent(targetKey)}/$msgId');

  Future<void> reactMessage(String targetKey, String msgId, String emoji) =>
      _req('POST', '/api/messages/${Uri.encodeComponent(targetKey)}/$msgId/react', {'emoji': emoji});

  Future<void> pinMessage(String serverId, String channelId, ChatMessage msg) =>
      _req('POST', '/api/servers/$serverId/pins', {
        'channelId': channelId,
        'message': {
          'id': msg.id,
          'senderId': msg.senderId,
          'text': msg.text,
          'createdAt': msg.createdAt,
        },
      });

  Future<SquadLobbyState> updateSquadState(
      String serverId, String channelId, {String? game, String? map, bool? ready}) async {
    final j = await _req('POST', '/api/squad/$serverId/$channelId', {
      if (game != null) 'game': game,
      if (map != null) 'map': map,
      if (ready != null) 'ready': ready,
    });
    return SquadLobbyState.fromJson(j['state'] as Map<String, dynamic>);
  }

  Future<void> sendLiveHype(String serverId, String channelId, String emoji, [String? text]) =>
      _req('POST', '/api/live-hype', {
        'serverId': serverId,
        'channelId': channelId,
        'emoji': emoji,
        if (text != null) 'text': text,
      });

  Future<void> joinVoice(String serverId, String channelId) =>
      _req('POST', '/api/voice/join', {'serverId': serverId, 'channelId': channelId});

  Future<void> updateVoiceState({bool? muted, bool? deafened, bool? video, bool? streaming}) =>
      _req('POST', '/api/voice/state', {
        if (muted != null) 'muted': muted,
        if (deafened != null) 'deafened': deafened,
        if (video != null) 'video': video,
        if (streaming != null) 'streaming': streaming,
      });

  Future<void> leaveVoice() => _req('POST', '/api/voice/leave');

  Future<void> requestFriend(String username) => _req('POST', '/api/friends/request', {'username': username});
  Future<void> acceptFriend(String userId) => _req('POST', '/api/friends/accept', {'userId': userId});
  Future<void> declineFriend(String userId) => _req('POST', '/api/friends/decline', {'userId': userId});
  Future<void> openDm(String userId) => _req('POST', '/api/dms/open', {'userId': userId});

  Future<NexcordServer> createServer(String name, {String template = 'gaming'}) async {
    final j = await _req('POST', '/api/servers', {'name': name, 'template': template});
    return NexcordServer.fromJson(j['server'] as Map<String, dynamic>);
  }

  Future<NexcordServer> joinInvite(String code) async {
    final j = await _req('POST', '/api/invites/${Uri.encodeComponent(code)}/join');
    return NexcordServer.fromJson(j['server'] as Map<String, dynamic>);
  }

  Future<void> createChannel(String serverId, String name, String type, String? categoryId) =>
      _req('POST', '/api/servers/$serverId/channels', {
        'name': name,
        'type': type,
        'categoryId': categoryId,
      });
}
