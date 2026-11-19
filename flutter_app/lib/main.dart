import 'dart:async';
import 'package:flutter/material.dart';
import 'package:ai_nexconn_chat_plugin/ai_nexconn_chat_plugin.dart' as nc;
import 'services/call_engine_stub.dart' as call_nc;
import 'package:ai_nexconn_chatui_plugin/ai_nexconn_chatui_plugin.dart';
import 'models/models.dart';
import 'services/api_service.dart';
import 'services/nexconn_sdk_service.dart';
import 'widgets/squad_and_quickchat.dart';
import 'widgets/live_stream_stage_view.dart';
import 'widgets/voice_huddle_view.dart';
import 'screens/nexconn_chatui_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final engineProvider = EngineProvider();
  final themeProvider = NexconnThemeProvider();

  runApp(
    NexconnChatUIProviders(
      engineProvider: engineProvider,
      themeProvider: themeProvider,
      child: NexcordApp(engineProvider: engineProvider),
    ),
  );
}

class NexcordApp extends StatelessWidget {
  final EngineProvider engineProvider;
  const NexcordApp({super.key, required this.engineProvider});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nexcord',
      debugShowCheckedModeBanner: false,
      locale: nexconnChatUIDefaultLocale,
      localizationsDelegates: NexconnChatUILocalizations.localizationsDelegates,
      supportedLocales: NexconnChatUILocalizations.supportedLocales,
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF313338),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF5865F2),
          secondary: Color(0xFF23A55A),
          surface: Color(0xFF2B2D31),
          error: Color(0xFFF23F43),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF313338),
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
      ),
      home: NexcordHome(engineProvider: engineProvider),
    );
  }
}

class NexcordHome extends StatefulWidget {
  final EngineProvider engineProvider;
  const NexcordHome({super.key, required this.engineProvider});

  @override
  State<NexcordHome> createState() => _NexcordHomeState();
}

class _NexcordHomeState extends State<NexcordHome> {
  final ApiService _api = ApiService();
  late final NexconnSdkService _sdk = NexconnSdkService(api: _api, engineProvider: widget.engineProvider);

  bool _booted = false;
  NexcordUser? _me;
  List<NexcordServer> _servers = [];
  Map<String, NexcordUser> _users = {};
  List<String> _friends = [];
  List<String> _incoming = [];
  List<String> _dms = [];
  Map<String, SquadLobbyState> _squadState = {};
  NexconnConfig _config = NexconnConfig();

  // Navigation state
  String _section = 'chat'; // chat | friends | chatui | sdk
  bool _homeMode = false;
  String _activeServerId = '';
  String _activeChannelId = '';
  String _activeDmUserId = '';
  bool _showSquadBannerOverride = false;

  // Chat state
  List<ChatMessage> _messages = [];
  ReplyRef? _replyTo;
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _chatScroll = ScrollController();

  // Voice state
  String? _voiceServerId;
  String? _voiceChannelId;
  String? _voiceCallId;
  bool _micMuted = false;
  bool _deafened = false;
  bool _cameraOn = false;
  bool _screenSharing = false;

  call_nc.NCCallEngine? _callEngine;
  bool _callSdkReady = false;

  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _sdk.addListener(_onSdkUpdate);
    _boot();
  }

  void _onSdkUpdate() {
    if (mounted) setState(() {});
  }

  Future<void> _boot() async {
    await _api.loadSaved();
    if (_api.sessionToken.isNotEmpty) {
      try {
        final res = await _api.me();
        await _afterLogin(res.user, res.nexconnToken);
      } catch (_) {
        await _api.setSession('');
      }
    }
    if (mounted) setState(() => _booted = true);
  }

  Future<void> _afterLogin(NexcordUser user, String nexconnToken) async {
    _me = user;
    final cfg = await _api.getConfig().catchError((_) => NexconnConfig());
    _config = cfg;
    await _sdk.initializeAndConnect(token: nexconnToken, config: cfg);
    await _initCallSdk(cfg);
    await _syncNow();
    await _loadMessages();
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 2500), (_) {
      _syncNow(silent: true);
      _loadMessages(silent: true);
    });
  }

  Future<void> _initCallSdk(NexconnConfig cfg) async {
    try {
      final engine = call_nc.NCCallEngine();
      await engine.initialize(call_nc.CallInitParams(
        appKey: cfg.appKey,
        areaCode: cfg.areaCode == 3 ? call_nc.CallAreaCode.na : call_nc.CallAreaCode.sg,
      ));
      _callEngine = engine;
      _callSdkReady = true;
      _sdk.logVoiceAction('NCCallEngine.initialize', 'appKey=${cfg.appKey}');
    } catch (e) {
      _callSdkReady = false;
      _sdk.logVoiceAction('NCCallEngine.initialize.warn', e.toString());
    }
  }

  Future<void> _syncNow({bool silent = false}) async {
    try {
      final res = await _api.sync();
      if (!mounted) return;
      setState(() {
        _me = res.me;
        _servers = res.servers;
        _users = res.users;
        _friends = res.friends;
        _incoming = res.incoming;
        _dms = res.dms;
        _squadState = res.squadState;
        _voiceServerId = res.voiceServerId;
        _voiceChannelId = res.voiceChannelId;

        if (_activeServerId.isEmpty || !_servers.any((s) => s.id == _activeServerId)) {
          _activeServerId = _servers.isNotEmpty ? _servers.first.id : '';
        }
        final srv = _activeServer;
        if (srv != null && (_activeChannelId.isEmpty || !srv.channels.any((c) => c.id == _activeChannelId))) {
          final squad = srv.channels.where((c) => c.name == 'squad-chat-room').firstOrNull;
          final first = squad ?? srv.channels.where((c) => c.type != 'voice').firstOrNull ?? srv.channels.firstOrNull;
          _activeChannelId = first?.id ?? '';
        }
      });
    } catch (e) {
      if (!silent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sync error: $e')));
      }
    }
  }

  NexcordServer? get _activeServer => _servers.where((s) => s.id == _activeServerId).firstOrNull;
  NexcordChannel? get _activeChannel => _activeServer?.channels.where((c) => c.id == _activeChannelId).firstOrNull;

  String get _targetKey {
    if (_me == null) return '';
    if (_homeMode && _activeDmUserId.isNotEmpty) {
      final pair = [_me!.id, _activeDmUserId]..sort();
      return 'dm:${pair[0]}:${pair[1]}';
    }
    if (_activeServerId.isNotEmpty && _activeChannelId.isNotEmpty) {
      return '$_activeServerId:$_activeChannelId';
    }
    return '';
  }

  Future<void> _loadMessages({bool silent = false}) async {
    final key = _targetKey;
    if (key.isEmpty || _section != 'chat') return;
    if (!_homeMode && _activeChannel?.type == 'voice') return;
    try {
      final list = await _api.getMessages(key);
      if (!mounted || key != _targetKey) return;
      final changed = list.length != _messages.length ||
          (list.isNotEmpty && _messages.isNotEmpty && list.last.id != _messages.last.id) ||
          !silent;
      if (changed) {
        setState(() => _messages = list);
      }
    } catch (_) {}
  }

  Future<void> _sendText(String text, {String type = 'text', Map<String, dynamic>? metadata}) async {
    final key = _targetKey;
    if (key.isEmpty || text.trim().isEmpty) return;

    final ch = _activeChannel;
    final kind = _homeMode ? 'dm' : (ch?.type == 'live' ? 'live' : 'community');
    final primaryId = _homeMode ? _activeDmUserId : (ch?.type == 'live' ? (ch?.openChannelId ?? ch!.id) : _activeServerId);

    final ref = _replyTo;
    setState(() => _replyTo = null);

    final sent = await _sdk.sendMessage(
      targetKey: key,
      kind: kind,
      primaryId: primaryId,
      subChannelId: ch?.id,
      text: text.trim(),
      type: type,
      replyTo: ref,
      metadata: metadata,
    );
    if (!mounted) return;
    setState(() {
      if (!_messages.any((m) => m.id == sent.id)) {
        _messages = [..._messages, sent];
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScroll.hasClients) _chatScroll.jumpTo(_chatScroll.position.maxScrollExtent);
    });
  }

  Future<void> _selectChannel(NexcordServer srv, NexcordChannel ch) async {
    setState(() {
      _section = 'chat';
      _homeMode = false;
      _activeServerId = srv.id;
      _activeChannelId = ch.id;
      _messages = [];
    });
    if (ch.type == 'live' && ch.openChannelId != null) {
      await _sdk.enterLiveOpenChannel(ch.openChannelId!);
    }
    if (ch.type == 'voice') {
      await _joinVoiceChannel(srv, ch);
    } else {
      await _loadMessages();
    }
  }

  Future<void> _joinVoiceChannel(NexcordServer srv, NexcordChannel ch) async {
    try {
      final res = await _api.joinVoice(srv.id, ch.id);
      final callId = res.callId;
      final others = (res.participants ?? <String>[]).where((id) => id != _me!.id).toList();

      // Start or join the NCCallEngine call for this voice channel
      if (_callSdkReady && _callEngine != null) {
        try {
          if (others.isNotEmpty) {
            await _callEngine!.joinCall(
              call_nc.JoinCallParams(callId: callId),
            );
          } else {
            await _callEngine!.startCall(
              call_nc.StartCallParams(
                callId: callId,
                calleeIds: others,
                isGroup: true,
                mediaType: call_nc.CallMediaType.audio,
              ),
            );
          }
          _sdk.logVoiceAction('NCCall.joinCall', 'callId=$callId channel=${ch.name}');
        } catch (e) {
          _sdk.logVoiceAction('NCCall.joinCall.warn', e.toString());
        }
      } else {
        _sdk.logVoiceAction('NCCall.joinVoice', 'callId=$callId channel=${ch.name} (call SDK not ready)');
      }

      setState(() {
        _voiceServerId = srv.id;
        _voiceChannelId = ch.id;
        _voiceCallId = callId;
        _micMuted = false;
        _deafened = false;
        _cameraOn = false;
      });
      await _syncNow(silent: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Voice join error: $e')));
      }
    }
  }

  Future<void> _logout() async {
    _pollTimer?.cancel();
    await _leaveVoiceChannel();
    await _sdk.disconnect();
    await _api.logout();
    if (!mounted) return;
    setState(() {
      _me = null;
      _servers = [];
      _messages = [];
      _voiceServerId = null;
      _voiceChannelId = null;
      _voiceCallId = null;
      _callEngine = null;
      _callSdkReady = false;
    });
  }

  Future<void> _leaveVoiceChannel() async {
    if (_voiceCallId != null && _callSdkReady && _callEngine != null) {
      try {
        await _callEngine!.endCall(call_nc.EndCallParams(callId: _voiceCallId!));
        _sdk.logVoiceAction('NCCall.endCall', 'callId=$_voiceCallId');
      } catch (e) {
        _sdk.logVoiceAction('NCCall.endCall.warn', e.toString());
      }
    }
    if (_voiceServerId != null && _voiceChannelId != null) {
      await _api.leaveVoice().catchError((_) {});
    }
    setState(() {
      _voiceServerId = null;
      _voiceChannelId = null;
      _voiceCallId = null;
      _micMuted = false;
      _deafened = false;
      _cameraOn = false;
      _screenSharing = false;
    });
  }

  Future<void> _toggleVoiceMic() async {
    setState(() => _micMuted = !_micMuted);
    if (_voiceServerId != null) {
      await _api.updateVoiceState(muted: _micMuted).catchError((_) {});
    }
    if (_callSdkReady && _callEngine != null && _voiceCallId != null) {
      try {
        await _callEngine!.enableMicrophone(call_nc.MicParams(callId: _voiceCallId!, enabled: !_micMuted));
        _sdk.logVoiceAction('NCCall.enableMicrophone', 'enabled=${!_micMuted}');
      } catch (e) {
        _sdk.logVoiceAction('NCCall.enableMicrophone.warn', e.toString());
      }
    }
  }

  Future<void> _toggleVoiceDeafen() async {
    setState(() => _deafened = !_deafened);
    if (_voiceServerId != null) {
      await _api.updateVoiceState(deafened: _deafened).catchError((_) {});
    }
    _sdk.logVoiceAction('NCCall.deafen', 'deafened=$_deafened');
  }

  Future<void> _toggleVoiceCamera() async {
    setState(() => _cameraOn = !_cameraOn);
    if (_voiceServerId != null) {
      await _api.updateVoiceState(video: _cameraOn).catchError((_) {});
    }
    if (_callSdkReady && _callEngine != null && _voiceCallId != null) {
      try {
        await _callEngine!.enableCamera(call_nc.CameraParams(callId: _voiceCallId!, enabled: _cameraOn));
        _sdk.logVoiceAction('NCCall.enableCamera', 'enabled=$_cameraOn');
      } catch (e) {
        _sdk.logVoiceAction('NCCall.enableCamera.warn', e.toString());
      }
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _sdk.removeListener(_onSdkUpdate);
    _msgCtrl.dispose();
    _chatScroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_booted) {
      return const Scaffold(
        backgroundColor: Color(0xFF1E1F22),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF5865F2))),
      );
    }

    if (_me == null) {
      return _AuthScreen(
        api: _api,
        onAuthenticated: _afterLogin,
      );
    }

    final srv = _activeServer;
    final ch = _activeChannel;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            if (_section == 'chat' && !_homeMode && ch != null) ...[
              Icon(
                ch.type == 'voice'
                    ? Icons.volume_up
                    : ch.type == 'live'
                        ? Icons.tv
                        : Icons.tag,
                size: 19,
                color: ch.type == 'live' ? const Color(0xFFF23F43) : const Color(0xFF949BA4),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(ch.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ] else if (_section == 'chat' && _homeMode && _activeDmUserId.isNotEmpty) ...[
              const Icon(Icons.alternate_email, size: 18, color: Color(0xFF949BA4)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _users[_activeDmUserId]?.displayName ?? _activeDmUserId,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ] else if (_section == 'friends') ...[
              const Icon(Icons.group, size: 19, color: Color(0xFF949BA4)),
              const SizedBox(width: 8),
              const Text('Friends', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ] else if (_section == 'chatui') ...[
              const Icon(Icons.forum, size: 19, color: Color(0xFF5865F2)),
              const SizedBox(width: 8),
              const Text('Nexconn Chat UI Kit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ] else ...[
              const Icon(Icons.hub, size: 19, color: Color(0xFF57F287)),
              const SizedBox(width: 8),
              const Text('Nexconn SDK Console', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ],
        ),
        actions: [
          if (_section == 'chat' && !_homeMode && ch != null && ch.type == 'text')
            IconButton(
              icon: Icon(
                Icons.sports_esports,
                color: (ch.name == 'squad-chat-room' || _showSquadBannerOverride) ? const Color(0xFF57F287) : null,
              ),
              tooltip: 'Toggle Squad Lobby',
              onPressed: () => setState(() => _showSquadBannerOverride = !_showSquadBannerOverride),
            ),
          if (_section == 'chat' && _homeMode && _activeDmUserId.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: 'Voice Call',
              onPressed: () {
                _sdk.logVoiceAction('NCCall.startCall', '1-to-1 voice call -> $_activeDmUserId');
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Calling ${_users[_activeDmUserId]?.displayName ?? _activeDmUserId} via Nexconn...')),
                );
              },
            ),
          Builder(
            builder: (ctx) => IconButton(
              icon: const Icon(Icons.people),
              tooltip: 'Members',
              onPressed: () => Scaffold.of(ctx).openEndDrawer(),
            ),
          ),
        ],
      ),
      drawer: _buildLeftDrawer(context, srv),
      endDrawer: _buildMembersDrawer(context, srv),
      body: _buildBody(srv, ch),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: const Color(0xFF1E1F22),
        selectedItemColor: const Color(0xFF5865F2),
        unselectedItemColor: const Color(0xFF949BA4),
        type: BottomNavigationBarType.fixed,
        currentIndex: _section == 'chat'
            ? 0
            : _section == 'friends'
                ? 1
                : _section == 'chatui'
                    ? 2
                    : 3,
        onTap: (idx) {
          setState(() {
            _section = ['chat', 'friends', 'chatui', 'sdk'][idx];
          });
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.discord), label: 'Discord'),
          BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Friends'),
          BottomNavigationBarItem(icon: Icon(Icons.chat_bubble), label: 'Chat UI'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_input_antenna), label: 'Nexconn SDK'),
        ],
      ),
    );
  }

  Widget _buildLeftDrawer(BuildContext context, NexcordServer? srv) {
    return Drawer(
      width: 318,
      backgroundColor: const Color(0xFF2B2D31),
      child: SafeArea(
        child: Row(
          children: [
            // Server Rail (68px)
            Container(
              width: 68,
              color: const Color(0xFF1E1F22),
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                children: [
                  _railButton(
                    active: _homeMode,
                    color: const Color(0xFF5865F2),
                    onTap: () {
                      setState(() {
                        _homeMode = true;
                        _section = _activeDmUserId.isEmpty ? 'friends' : 'chat';
                      });
                    },
                    child: const Icon(Icons.sports_esports, color: Colors.white),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8, horizontal: 18),
                    child: Divider(height: 1, color: Colors.white12),
                  ),
                  Expanded(
                    child: ListView(
                      children: _servers.map((s) {
                        final act = !_homeMode && s.id == _activeServerId;
                        final initials = s.name.split(' ').map((w) => w.isEmpty ? '' : w[0]).join().toUpperCase();
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _railButton(
                            active: act,
                            color: hexToColor(s.iconColor),
                            onTap: () {
                              Navigator.pop(context);
                              final first = s.channels.where((c) => c.type != 'voice').firstOrNull ?? s.channels.firstOrNull;
                              if (first != null) _selectChannel(s, first);
                            },
                            child: Text(
                              initials.length > 2 ? initials.substring(0, 2) : initials,
                              style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  _railButton(
                    active: false,
                    color: const Color(0xFF23A55A),
                    onTap: () => _showCreateServerDialog(context),
                    child: const Icon(Icons.add, color: Color(0xFF23A55A)),
                  ),
                ],
              ),
            ),

            // Channels / DMs Column
            Expanded(
              child: Column(
                children: [
                  Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Colors.black26)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _homeMode ? 'Direct Messages' : (srv?.name ?? 'Nexcord'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                        ),
                        if (!_homeMode && srv != null)
                          IconButton(
                            icon: const Icon(Icons.add, size: 18),
                            onPressed: () => _showCreateChannelDialog(context, srv),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: _homeMode
                        ? ListView(
                            padding: const EdgeInsets.all(8),
                            children: _dms.map((uid) {
                              final u = _users[uid];
                              final act = _activeDmUserId == uid && _section == 'chat';
                              return ListTile(
                                dense: true,
                                selected: act,
                                selectedTileColor: Colors.white12,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                leading: CircleAvatar(
                                  radius: 15,
                                  backgroundColor: u?.color ?? const Color(0xFF5865F2),
                                  child: Text((u?.displayName ?? 'U')[0].toUpperCase(), style: const TextStyle(fontSize: 12, color: Colors.white)),
                                ),
                                title: Text(u?.displayName ?? uid, style: const TextStyle(fontSize: 13.5)),
                                subtitle: u?.customStatus.isNotEmpty == true
                                    ? Text(u!.customStatus, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11))
                                    : null,
                                onTap: () {
                                  Navigator.pop(context);
                                  setState(() {
                                    _homeMode = true;
                                    _section = 'chat';
                                    _activeDmUserId = uid;
                                    _messages = [];
                                  });
                                  _loadMessages();
                                },
                              );
                            }).toList(),
                          )
                        : srv == null
                            ? const SizedBox.shrink()
                            : ListView(
                                padding: const EdgeInsets.all(8),
                                children: srv.categories.map((cat) {
                                  final chs = srv.channels.where((c) => c.categoryId == cat.id).toList();
                                  return Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.fromLTRB(6, 10, 6, 4),
                                        child: Text(
                                          cat.name.toUpperCase(),
                                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF949BA4)),
                                        ),
                                      ),
                                      ...chs.map((c) {
                                        final act = !_homeMode && c.id == _activeChannelId && _section == 'chat';
                                        final vMembers = srv.voiceStates[c.id] ?? [];
                                        return Column(
                                          children: [
                                            ListTile(
                                              dense: true,
                                              visualDensity: VisualDensity.compact,
                                              selected: act,
                                              selectedTileColor: Colors.white12,
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                                              leading: Icon(
                                                c.type == 'voice'
                                                    ? Icons.volume_up
                                                    : c.type == 'live'
                                                        ? Icons.tv
                                                        : c.type == 'announcement'
                                                            ? Icons.campaign
                                                            : Icons.tag,
                                                size: 17,
                                                color: c.type == 'live' ? const Color(0xFFF23F43) : const Color(0xFF949BA4),
                                              ),
                                              title: Text(c.name, style: const TextStyle(fontSize: 13.5)),
                                              trailing: c.type == 'live' && c.live != null
                                                  ? Container(
                                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                                      decoration: BoxDecoration(color: const Color(0xFFF23F43), borderRadius: BorderRadius.circular(3)),
                                                      child: const Text('LIVE', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800)),
                                                    )
                                                  : null,
                                              onTap: () {
                                                Navigator.pop(context);
                                                _selectChannel(srv, c);
                                              },
                                            ),
                                            if (c.type == 'voice' && vMembers.isNotEmpty)
                                              Padding(
                                                padding: const EdgeInsets.only(left: 28, bottom: 4),
                                                child: Column(
                                                  children: vMembers.map((vp) {
                                                    final vu = _users[vp.userId];
                                                    return Padding(
                                                      padding: const EdgeInsets.symmetric(vertical: 2),
                                                      child: Row(
                                                        children: [
                                                          CircleAvatar(
                                                            radius: 9,
                                                            backgroundColor: vu?.color ?? const Color(0xFF5865F2),
                                                            child: Text(
                                                              (vu?.displayName ?? 'U')[0].toUpperCase(),
                                                              style: const TextStyle(fontSize: 9, color: Colors.white),
                                                            ),
                                                          ),
                                                          const SizedBox(width: 6),
                                                          Expanded(
                                                            child: Text(vu?.displayName ?? vp.userId, style: const TextStyle(fontSize: 12)),
                                                          ),
                                                          if (vp.muted) const Icon(Icons.mic_off, size: 12, color: Color(0xFF949BA4)),
                                                        ],
                                                      ),
                                                    );
                                                  }).toList(),
                                                ),
                                              ),
                                          ],
                                        );
                                      }),
                                    ],
                                  );
                                }).toList(),
                              ),
                  ),
                  // Bottom User Profile Dock
                  Container(
                    color: const Color(0xFF232428),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 15,
                          backgroundColor: _me!.color,
                          child: Text(_me!.displayName[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_me!.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
                              Text('@${_me!.username}', style: const TextStyle(fontSize: 10.5, color: Color(0xFF949BA4))),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: Icon(_micMuted ? Icons.mic_off : Icons.mic, size: 18, color: _micMuted ? const Color(0xFFF23F43) : null),
                          onPressed: () => setState(() => _micMuted = !_micMuted),
                        ),
                        IconButton(
                          icon: const Icon(Icons.logout, size: 18),
                          tooltip: 'Log out',
                          onPressed: _logout,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _railButton({required bool active, required Color color, required VoidCallback onTap, required Widget child}) {
    return Center(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(active ? 14 : 24),
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: active ? color : const Color(0xFF313338),
            borderRadius: BorderRadius.circular(active ? 14 : 24),
          ),
          alignment: Alignment.center,
          child: child,
        ),
      ),
    );
  }

  Widget _buildMembersDrawer(BuildContext context, NexcordServer? srv) {
    if (srv == null) {
      return const Drawer(backgroundColor: Color(0xFF2B2D31), child: Center(child: Text('No server selected')));
    }
    return Drawer(
      width: 260,
      backgroundColor: const Color(0xFF2B2D31),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text('MEMBERS — ${srv.members.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: srv.members.length,
                itemBuilder: (_, i) {
                  final m = srv.members[i];
                  final u = m.userId == _me!.id ? _me! : _users[m.userId];
                  if (u == null) return const SizedBox.shrink();
                  return ListTile(
                    dense: true,
                    leading: Stack(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: u.color,
                          child: Text(u.displayName[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: u.statusColor,
                              shape: BoxShape.circle,
                              border: Border.all(color: const Color(0xFF2B2D31), width: 1.5),
                            ),
                          ),
                        ),
                      ],
                    ),
                    title: Row(
                      children: [
                        Flexible(child: Text(u.displayName, overflow: TextOverflow.ellipsis)),
                        if (u.isBot) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(color: const Color(0xFF5865F2), borderRadius: BorderRadius.circular(3)),
                            child: const Text('BOT', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ],
                    ),
                    subtitle: u.customStatus.isNotEmpty
                        ? Text(u.customStatus, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11))
                        : null,
                    onTap: () {
                      if (u.id == _me!.id) return;
                      Navigator.pop(context);
                      _api.openDm(u.id).then((_) async {
                        await _syncNow(silent: true);
                        setState(() {
                          _homeMode = true;
                          _section = 'chat';
                          _activeDmUserId = u.id;
                          _messages = [];
                        });
                        await _loadMessages();
                      });
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(NexcordServer? srv, NexcordChannel? ch) {
    if (_section == 'friends') {
      return _FriendsHub(
        friends: _friends,
        incoming: _incoming,
        users: _users,
        onAccept: (uid) async {
          await _api.acceptFriend(uid);
          await _syncNow();
        },
        onDecline: (uid) async {
          await _api.declineFriend(uid);
          await _syncNow();
        },
        onAddFriend: (uname) async {
          await _api.requestFriend(uname);
          await _syncNow();
        },
        onOpenDm: (uid) async {
          await _api.openDm(uid);
          await _syncNow();
          setState(() {
            _homeMode = true;
            _section = 'chat';
            _activeDmUserId = uid;
            _messages = [];
          });
          await _loadMessages();
        },
      );
    }

    if (_section == 'chatui') {
      return NexconnChatUIScreen(sdk: _sdk);
    }

    if (_section == 'sdk') {
      return _SdkConsoleView(
        config: _config,
        sdk: _sdk,
        onSaveCredentials: (appKey, secret, host, area) async {
          final res = await _api.saveCredentials(appKey: appKey, appSecret: secret, apiHost: host, areaCode: area);
          final nextCfg = NexconnConfig.fromJson(res['config'] as Map<String, dynamic>);
          setState(() => _config = nextCfg);
          final tok = res['nexconnToken']?.toString();
          if (tok != null && tok.isNotEmpty) {
            await _sdk.initializeAndConnect(token: tok, config: nextCfg);
          }
          return res['error']?.toString();
        },
      );
    }

    // Live Stream Stage Channel
    if (!_homeMode && srv != null && ch != null && ch.type == 'live') {
      return LiveStreamStageView(
        server: srv,
        channel: ch,
        me: _me!,
        users: _users,
        messages: _messages,
        onSendMessage: (t) => _sendText(t),
        onSendQuickChat: (preset, {zone}) {
          final txt = zone != null ? '${preset.text} [$zone]' : preset.text;
          _sendText(txt, type: 'quickchat', metadata: {'badge': 'QUICK CHAT', 'category': preset.category});
        },
        onSendHype: (em) => _api.sendLiveHype(srv.id, ch.id, em),
      );
    }

    // Voice Channel View
    if (!_homeMode && srv != null && ch != null && ch.type == 'voice') {
      return VoiceHuddleView(
        channelName: ch.name,
        callId: _voiceCallId,
        me: _me!,
        users: _users,
        participants: srv.voiceStates[ch.id] ?? [],
        micMuted: _micMuted,
        deafened: _deafened,
        cameraOn: _cameraOn,
        onToggleMic: _toggleVoiceMic,
        onToggleDeafen: _toggleVoiceDeafen,
        onToggleCamera: _toggleVoiceCamera,
        onHangup: () async {
          await _leaveVoiceChannel();
          await _syncNow(silent: true);
          final fallback = srv.channels.where((c) => c.type != 'voice').firstOrNull;
          if (fallback != null) _selectChannel(srv, fallback);
        },
      );
    }

    // Standard Text / Squad Chat / DM View
    final showSquad = !_homeMode && srv != null && ch != null && (ch.name == 'squad-chat-room' || _showSquadBannerOverride);
    return Column(
      children: [
        if (showSquad)
          SquadLobbyBannerWidget(
            server: srv!,
            me: _me!,
            users: _users,
            squadState: _squadState['${srv.id}:${ch!.id}'],
            onUpdateSquad: ({game, map, ready}) async {
              final next = await _api.updateSquadState(srv.id, ch.id, game: game, map: map, ready: ready);
              setState(() => _squadState['${srv.id}:${ch.id}'] = next);
            },
            onMapPing: (x, y, label) {
              _sendText(
                '📍 Tactical Ping at $label ($x, $y) — Eyes here!',
                type: 'quickchat',
                metadata: {'badge': 'MAP PING', 'category': 'tactical'},
              );
            },
            onJoinSquadVoice: () {
              final vc = srv.channels.where((c) => c.type == 'voice').firstOrNull;
              if (vc != null) _selectChannel(srv, vc);
            },
          ),
        Expanded(
          child: ListView.builder(
            controller: _chatScroll,
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
            itemCount: _messages.length,
            itemBuilder: (_, i) {
              final m = _messages[i];
              final u = m.senderId == _me!.id ? _me! : _users[m.senderId];
              return GestureDetector(
                onLongPress: () => _showMessageActions(m),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: m.type == 'quickchat' ? const EdgeInsets.only(left: 8) : EdgeInsets.zero,
                  decoration: m.type == 'quickchat'
                      ? const BoxDecoration(border: Border(left: BorderSide(color: Color(0xFF5865F2), width: 3)))
                      : null,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 17,
                        backgroundColor: u?.color ?? const Color(0xFF5865F2),
                        child: Text(
                          (u?.displayName ?? m.senderId)[0].toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (m.replyTo != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 2),
                                child: Text(
                                  '↩ ${_users[m.replyTo!.senderId]?.displayName ?? m.replyTo!.senderId}: ${m.replyTo!.text}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 11.5, color: Color(0xFF949BA4)),
                                ),
                              ),
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 6,
                              children: [
                                Text(
                                  u?.displayName ?? m.senderId,
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: u?.color ?? Colors.white),
                                ),
                                if (u?.isBot == true)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                    decoration: BoxDecoration(color: const Color(0xFF5865F2), borderRadius: BorderRadius.circular(3)),
                                    child: const Text('SQUAD', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold)),
                                  ),
                                if (m.type == 'quickchat')
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                    decoration: BoxDecoration(color: const Color(0x2857F287), borderRadius: BorderRadius.circular(3)),
                                    child: Text(
                                      m.metadata?['badge']?.toString() ?? 'QUICK CHAT',
                                      style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF57F287)),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(m.text, style: const TextStyle(fontSize: 14.5, color: Color(0xFFDBDEE1))),
                            if (m.reactions.isNotEmpty) ...[
                              const SizedBox(height: 5),
                              Wrap(
                                spacing: 5,
                                children: m.reactions.entries.map((e) {
                                  final mine = e.value.contains(_me!.id);
                                  return InkWell(
                                    onTap: () async {
                                      await _api.reactMessage(_targetKey, m.id, e.key);
                                      await _loadMessages();
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: mine ? const Color(0x385865F2) : const Color(0xFF2B2D31),
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(color: mine ? const Color(0xFF5865F2) : Colors.transparent),
                                      ),
                                      child: Text('${e.key} ${e.value.length}', style: const TextStyle(fontSize: 12)),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        QuickChatStripWidget(
          onSendQuickChat: (preset, {zone}) {
            final txt = zone != null ? '${preset.text} [$zone]' : preset.text;
            _sendText(txt, type: 'quickchat', metadata: {'badge': 'QUICK CHAT', 'category': preset.category});
          },
        ),
        if (_replyTo != null)
          Container(
            color: const Color(0xFF2B2D31),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Replying to ${_users[_replyTo!.senderId]?.displayName ?? _replyTo!.senderId}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFFB5BAC1)),
                  ),
                ),
                InkWell(onTap: () => setState(() => _replyTo = null), child: const Icon(Icons.close, size: 16)),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _msgCtrl,
                  decoration: InputDecoration(
                    hintText: _homeMode ? 'Message @${_users[_activeDmUserId]?.displayName ?? "user"}' : 'Message #${ch?.name ?? "channel"}',
                    filled: true,
                    fillColor: const Color(0xFF383A40),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  ),
                  onSubmitted: (v) {
                    _msgCtrl.clear();
                    _sendText(v);
                  },
                ),
              ),
              const SizedBox(width: 6),
              IconButton(
                style: IconButton.styleFrom(backgroundColor: const Color(0xFF5865F2)),
                onPressed: () {
                  final v = _msgCtrl.text;
                  _msgCtrl.clear();
                  _sendText(v);
                },
                icon: const Icon(Icons.send, color: Colors.white, size: 19),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _showMessageActions(ChatMessage m) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF2B2D31),
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: ['🔥', '❤️', '⚡', '👑', '👍', '😂'].map((em) {
                  return InkWell(
                    onTap: () async {
                      Navigator.pop(ctx);
                      await _api.reactMessage(_targetKey, m.id, em);
                      await _loadMessages();
                    },
                    child: Text(em, style: const TextStyle(fontSize: 24)),
                  );
                }).toList(),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.reply),
              title: const Text('Reply'),
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyTo = ReplyRef(id: m.id, senderId: m.senderId, text: m.text));
              },
            ),
            if (!_homeMode && _activeServer != null && _activeChannel != null)
              ListTile(
                leading: const Icon(Icons.push_pin),
                title: const Text('Pin Message'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await _api.pinMessage(_activeServer!.id, _activeChannel!.id, m);
                  await _syncNow(silent: true);
                },
              ),
            if (m.senderId == _me!.id)
              ListTile(
                leading: const Icon(Icons.delete, color: Color(0xFFF23F43)),
                title: const Text('Delete Message', style: TextStyle(color: Color(0xFFF23F43))),
                onTap: () async {
                  Navigator.pop(ctx);
                  await _api.deleteMessage(_targetKey, m.id);
                  await _loadMessages();
                },
              ),
          ],
        ),
      ),
    );
  }

  void _showCreateServerDialog(BuildContext context) {
    final nameCtrl = TextEditingController();
    final inviteCtrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF2B2D31),
        title: const Text('Create or Join Server'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'New Server Name')),
            const SizedBox(height: 10),
            TextField(controller: inviteCtrl, decoration: const InputDecoration(labelText: 'Or Invite Code (e.g. NEXCORD)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              if (inviteCtrl.text.trim().isNotEmpty) {
                await _api.joinInvite(inviteCtrl.text.trim());
              } else if (nameCtrl.text.trim().isNotEmpty) {
                await _api.createServer(nameCtrl.text.trim());
              }
              await _syncNow();
            },
            child: const Text('Go'),
          ),
        ],
      ),
    );
  }

  void _showCreateChannelDialog(BuildContext context, NexcordServer srv) {
    final nameCtrl = TextEditingController();
    String type = 'text';
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: const Color(0xFF2B2D31),
          title: const Text('Create Channel'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Channel Name')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: type,
                dropdownColor: const Color(0xFF1E1F22),
                items: const [
                  DropdownMenuItem(value: 'text', child: Text('Text Channel')),
                  DropdownMenuItem(value: 'voice', child: Text('Voice Channel')),
                  DropdownMenuItem(value: 'live', child: Text('Live Stream Stage')),
                ],
                onChanged: (v) => setS(() => type = v ?? 'text'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                await _api.createChannel(srv.id, nameCtrl.text.trim(), type, srv.categories.firstOrNull?.id);
                await _syncNow();
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthScreen extends StatefulWidget {
  final ApiService api;
  final Future<void> Function(NexcordUser user, String token) onAuthenticated;

  const _AuthScreen({required this.api, required this.onAuthenticated});

  @override
  State<_AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<_AuthScreen> {
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _demoCtrl = TextEditingController();
  late final TextEditingController _urlCtrl = TextEditingController(text: widget.api.baseUrl);
  bool _isRegister = false;
  bool _busy = false;
  String _err = '';

  Future<void> _demo() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.api.setBaseUrl(_urlCtrl.text);
      final res = await widget.api.demoLogin(_demoCtrl.text.trim().isEmpty ? null : _demoCtrl.text.trim());
      await widget.onAuthenticated(res.user, res.nexconnToken);
    } catch (e) {
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.api.setBaseUrl(_urlCtrl.text);
      final res = _isRegister
          ? await widget.api.register(_userCtrl.text.trim(), _passCtrl.text, _userCtrl.text.trim())
          : await widget.api.login(_userCtrl.text.trim(), _passCtrl.text);
      await widget.onAuthenticated(res.user, res.nexconnToken);
    } catch (e) {
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E1F22),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: const Color(0xFF313338),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: Color(0xFF5865F2),
                        child: Icon(Icons.sports_esports, color: Colors.white),
                      ),
                      SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Nexcord Flutter', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                          Text('Android & iOS • Nexconn Chat SDK', style: TextStyle(fontSize: 12, color: Color(0xFF949BA4))),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0x2023A55A),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0x6623A55A)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Instant Squad Demo Entry', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF57F287))),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _demoCtrl,
                                decoration: const InputDecoration(
                                  hintText: 'Gamer tag (optional)',
                                  isDense: true,
                                  filled: true,
                                  fillColor: Color(0xFF1E1F22),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF23A55A), foregroundColor: Colors.white),
                              onPressed: _busy ? null : _demo,
                              child: const Text('Enter Arena'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _userCtrl,
                    decoration: const InputDecoration(labelText: 'Username', filled: true, fillColor: Color(0xFF1E1F22)),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _passCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password', filled: true, fillColor: Color(0xFF1E1F22)),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _urlCtrl,
                    decoration: const InputDecoration(labelText: 'Backend Server URL', filled: true, fillColor: Color(0xFF1E1F22)),
                  ),
                  if (_err.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_err, style: const TextStyle(color: Color(0xFFFF9A9C), fontSize: 12.5)),
                  ],
                  const SizedBox(height: 14),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2), foregroundColor: Colors.white),
                    onPressed: _busy ? null : _submit,
                    child: Text(_isRegister ? 'Register Account' : 'Log In'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _isRegister = !_isRegister),
                    child: Text(_isRegister ? 'Have an account? Log In' : 'Need an account? Register'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FriendsHub extends StatefulWidget {
  final List<String> friends;
  final List<String> incoming;
  final Map<String, NexcordUser> users;
  final Future<void> Function(String userId) onAccept;
  final Future<void> Function(String userId) onDecline;
  final Future<void> Function(String username) onAddFriend;
  final Future<void> Function(String userId) onOpenDm;

  const _FriendsHub({
    required this.friends,
    required this.incoming,
    required this.users,
    required this.onAccept,
    required this.onDecline,
    required this.onAddFriend,
    required this.onOpenDm,
  });

  @override
  State<_FriendsHub> createState() => _FriendsHubState();
}

class _FriendsHubState extends State<_FriendsHub> {
  final _addCtrl = TextEditingController();
  String _feedback = '';

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _addCtrl,
                decoration: const InputDecoration(
                  hintText: 'Add friend (e.g. vex.clutch)',
                  filled: true,
                  fillColor: Color(0xFF1E1F22),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF23A55A), foregroundColor: Colors.white),
              onPressed: () async {
                try {
                  await widget.onAddFriend(_addCtrl.text.trim());
                  setState(() => _feedback = 'Friend request sent!');
                  _addCtrl.clear();
                } catch (e) {
                  setState(() => _feedback = e.toString());
                }
              },
              child: const Text('Add'),
            ),
          ],
        ),
        if (_feedback.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_feedback, style: const TextStyle(fontSize: 12, color: Color(0xFF57F287))),
          ),
        if (widget.incoming.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('INCOMING REQUESTS (${widget.incoming.length})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
          ...widget.incoming.map((uid) {
            final u = widget.users[uid];
            return ListTile(
              title: Text(u?.displayName ?? uid),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(icon: const Icon(Icons.check, color: Color(0xFF57F287)), onPressed: () => widget.onAccept(uid)),
                  IconButton(icon: const Icon(Icons.close, color: Color(0xFFF23F43)), onPressed: () => widget.onDecline(uid)),
                ],
              ),
            );
          }),
        ],
        const SizedBox(height: 16),
        Text('FRIENDS (${widget.friends.length})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
        ...widget.friends.map((uid) {
          final u = widget.users[uid];
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: u?.color ?? const Color(0xFF5865F2),
              child: Text((u?.displayName ?? 'U')[0].toUpperCase(), style: const TextStyle(color: Colors.white)),
            ),
            title: Text(u?.displayName ?? uid),
            subtitle: Text(u?.customStatus.isNotEmpty == true ? u!.customStatus : (u?.status ?? 'offline')),
            trailing: IconButton(
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () => widget.onOpenDm(uid),
            ),
          );
        }),
      ],
    );
  }
}

class _SdkConsoleView extends StatefulWidget {
  final NexconnConfig config;
  final NexconnSdkService sdk;
  final Future<String?> Function(String appKey, String secret, String host, int area) onSaveCredentials;

  const _SdkConsoleView({
    required this.config,
    required this.sdk,
    required this.onSaveCredentials,
  });

  @override
  State<_SdkConsoleView> createState() => _SdkConsoleViewState();
}

class _SdkConsoleViewState extends State<_SdkConsoleView> {
  late final TextEditingController _keyCtrl = TextEditingController(text: widget.config.appKey);
  final _secCtrl = TextEditingController();
  int _area = 2;
  String _host = 'api.sg-light-api.com';
  String _msg = '';

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFF232428), borderRadius: BorderRadius.circular(8)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.sdk.mode == 'connected' ? '● LIVE NEXCONN EDGE' : '● HYBRID SDK MODE',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: widget.sdk.mode == 'connected' ? const Color(0xFF57F287) : const Color(0xFF8EA1E1),
                ),
              ),
              const SizedBox(height: 4),
              Text(widget.sdk.statusDetail, style: const TextStyle(fontSize: 12.5, color: Color(0xFFB5BAC1))),
              const SizedBox(height: 6),
              const Text('ai_nexconn_chat_plugin ^26.2.11 • ai_nexconn_chatui_plugin ^26.2.11', style: TextStyle(fontSize: 11, color: Color(0xFF949BA4))),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(controller: _keyCtrl, decoration: const InputDecoration(labelText: 'Nexconn App Key', filled: true, fillColor: Color(0xFF1E1F22))),
        const SizedBox(height: 8),
        TextField(controller: _secCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Nexconn App Secret', filled: true, fillColor: Color(0xFF1E1F22))),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          value: _host,
          dropdownColor: const Color(0xFF1E1F22),
          items: const [
            DropdownMenuItem(value: 'api.sg-light-api.com', child: Text('Singapore (api.sg-light-api.com)')),
            DropdownMenuItem(value: 'api.us-light-api.com', child: Text('North America (api.us-light-api.com)')),
            DropdownMenuItem(value: 'api.sau-light-api.com', child: Text('Saudi Arabia (api.sau-light-api.com)')),
          ],
          onChanged: (v) {
            if (v == null) return;
            setState(() {
              _host = v;
              _area = v.contains('us-') ? 3 : 2;
            });
          },
        ),
        const SizedBox(height: 10),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2), foregroundColor: Colors.white),
          onPressed: () async {
            final err = await widget.onSaveCredentials(_keyCtrl.text.trim(), _secCtrl.text.trim(), _host, _area);
            setState(() => _msg = err == null ? 'Saved & reconnected!' : 'Warning: $err');
          },
          child: const Text('Save & Connect Nexconn'),
        ),
        if (_msg.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(_msg, style: const TextStyle(color: Color(0xFF57F287), fontSize: 12))),
        const SizedBox(height: 16),
        const Text('LIVE SDK CALL TRACE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
        const SizedBox(height: 6),
        ...widget.sdk.logs.map((l) => Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFF141518), borderRadius: BorderRadius.circular(6)),
              child: Text('[${l.sdk.toUpperCase()}] ${l.action}: ${l.detail}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11.5)),
            )),
      ],
    );
  }
}
