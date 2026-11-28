import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:share_plus/share_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'services/call_engine_stub.dart' as call_nc;
import 'package:ai_nexconn_chatui_plugin/ai_nexconn_chatui_plugin.dart';
import 'models/models.dart';
import 'services/api_service.dart';
import 'services/nexconn_sdk_service.dart';
import 'services/media_stream_service.dart';
import 'services/contacts_service.dart';
import 'widgets/squad_and_quickchat.dart';
import 'widgets/live_stream_stage_view.dart';
import 'widgets/voice_huddle_view.dart';
import 'widgets/media_picker_sheet.dart';

enum EmojiOnlyType { single, multiple, none }

EmojiOnlyType getEmojiOnlyType(String text) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return EmojiOnlyType.none;

  final chars = trimmed.characters.where((c) => c.trim().isNotEmpty).toList();
  if (chars.isEmpty) return EmojiOnlyType.none;

  final emojiRegex = RegExp(
    r'^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FB}\u{25FC}\u{3030}\u{303D}\u{3297}\u{3299}]+$',
    unicode: true,
  );

  final allEmoji = chars.every((c) => emojiRegex.hasMatch(c));
  if (!allEmoji) return EmojiOnlyType.none;

  if (chars.length == 1) return EmojiOnlyType.single;
  if (chars.length <= 8) return EmojiOnlyType.multiple;
  return EmojiOnlyType.none;
}

String formatChatTime(int ts) {
  final dt = DateTime.fromMillisecondsSinceEpoch(ts).toLocal();
  final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final m = dt.minute.toString().padLeft(2, '0');
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  return '$h:$m $ampm';
}

bool isSameChatDay(int a, int b) {
  final da = DateTime.fromMillisecondsSinceEpoch(a).toLocal();
  final db = DateTime.fromMillisecondsSinceEpoch(b).toLocal();
  return da.year == db.year && da.month == db.month && da.day == db.day;
}

String formatChatDateDivider(int ts) {
  final dt = DateTime.fromMillisecondsSinceEpoch(ts).toLocal();
  final now = DateTime.now();
  if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
    return 'Today';
  }
  final yest = now.subtract(const Duration(days: 1));
  if (dt.year == yest.year && dt.month == yest.month && dt.day == yest.day) {
    return 'Yesterday';
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('Firebase.initializeApp warning: $e');
  }
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
        scaffoldBackgroundColor: const Color(0xFF2A2D35),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF5865F2),
          secondary: Color(0xFF23A55A),
          surface: Color(0xFF22242A),
          error: Color(0xFFF23F43),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF22242A),
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: const Color(0xFF16171B),
          indicatorColor: const Color(0x385865F2),
          height: 64,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return TextStyle(
              fontSize: 11.5,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? Colors.white : const Color(0xFF9097A3),
            );
          }),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFF18191F),
          contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
  NexconnConfig _config = NexconnConfig();

  // Navigation state
  String _section = 'chat'; // chat | friends | voice | settings
  bool _homeMode = false;
  String _activeServerId = '';
  String _activeChannelId = '';
  String _activeDmUserId = '';

  // Chat state
  List<ChatMessage> _messages = [];
  ReplyRef? _replyTo;
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _chatScroll = ScrollController();
  bool _showScrollToBottom = false;
  bool _hasComposerText = false;
  final Set<String> _collapsedCategories = <String>{};

  // Voice & Direct Call state
  String? _voiceServerId;
  String? _voiceChannelId;
  String? _voiceCallId;
  DirectCallInfo? _directCall;
  bool _directCallStageOpen = false;
  String? _activeDirectMediaCallId;
  Timer? _ringTimer;
  Timer? _callElapsedTimer;
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
    MediaStreamService.instance.addListener(_onMediaUpdate);
    _msgCtrl.addListener(() {
      final hasText = _msgCtrl.text.trim().isNotEmpty;
      if (hasText != _hasComposerText && mounted) {
        setState(() => _hasComposerText = hasText);
      }
    });
    _chatScroll.addListener(() {
      if (!_chatScroll.hasClients) return;
      final dist = _chatScroll.position.maxScrollExtent - _chatScroll.offset;
      final shouldShow = dist > 260;
      if (shouldShow != _showScrollToBottom && mounted) {
        setState(() => _showScrollToBottom = shouldShow);
      }
    });
    _boot();
  }

  void _onMediaUpdate() {
    final media = MediaStreamService.instance;
    if (!mounted) return;
    if (_screenSharing != media.isScreenSharing) {
      setState(() => _screenSharing = media.isScreenSharing);
      if (_voiceServerId != null) {
        _api.updateVoiceState(streaming: _screenSharing).catchError((_) {});
      }
    }
    if (_cameraOn != media.isCameraActive) {
      setState(() => _cameraOn = media.isCameraActive);
      if (_voiceServerId != null) {
        _api.updateVoiceState(video: _cameraOn).catchError((_) {});
      }
    }
  }

  void _onSdkUpdate() {
    if (mounted) setState(() {});
  }

  Future<void> _boot() async {
    await _api.loadSaved();
    if (_api.sessionToken.isNotEmpty) {
      final cached = await _api.getCachedUser();
      if (cached != null) {
        _me = cached;
      }
      try {
        final res = await _api.me();
        await _api.cacheUser(res.user);
        await _afterLogin(res.user, res.nexconnToken);
      } on ApiException catch (e) {
        if (e.statusCode == 401) {
          // Auth token is expired or invalid on the server
          await _api.setSession('');
          _me = null;
        } else {
          // 502/503/server waking up - keep session and bootstrap with cached user
          if (cached != null) {
            await _afterLogin(cached, cached.id);
          }
        }
      } catch (_) {
        // Offline / network timeout on startup - keep session and bootstrap with cached user
        if (cached != null) {
          await _afterLogin(cached, cached.id);
        }
      }
    }
    if (mounted) setState(() => _booted = true);
  }

  Future<void> _afterLogin(NexcordUser user, String nexconnToken) async {
    _me = user;
    await _api.cacheUser(user);
    MediaStreamService.instance.configure(api: _api, currentUserId: user.id);
    final cfg = await _api.getConfig().catchError((_) => NexconnConfig());
    _config = cfg;
    await _sdk.initializeAndConnect(token: nexconnToken, config: cfg);
    await _initCallSdk(cfg);
    await _syncNow();
    await _loadMessages();
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
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
      final prevDirect = _directCall;
      final nextDirect = res.activeDirectCall;
      setState(() {
        _me = res.me;
        _servers = res.servers;
        _users = Map<String, NexcordUser>.from(res.users);
        if (nextDirect?.caller != null) {
          _users[nextDirect!.caller!.id] = nextDirect.caller!;
        }
        if (nextDirect?.callee != null) {
          _users[nextDirect!.callee!.id] = nextDirect.callee!;
        }
        _friends = res.friends;
        _incoming = res.incoming;
        _dms = res.dms;
        _voiceServerId = res.voiceServerId;
        _voiceChannelId = res.voiceChannelId;
        _directCall = nextDirect;

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

      final meId = _me?.id ?? '';
      if (meId.isNotEmpty) {
        MediaStreamService.instance.configure(api: _api, currentUserId: meId);

        // Ringtone / haptic feedback for incoming direct call
        if (nextDirect != null && nextDirect.status == 'ringing' && nextDirect.calleeId == meId) {
          if (_ringTimer == null) {
            HapticFeedback.vibrate();
            SystemSound.play(SystemSoundType.alert);
            _ringTimer = Timer.periodic(const Duration(milliseconds: 2500), (_) {
              if (!mounted) return;
              HapticFeedback.vibrate();
              SystemSound.play(SystemSoundType.alert);
            });
          }
        } else {
          _ringTimer?.cancel();
          _ringTimer = null;
        }

        // Synchronize active 1:1 personal call with WebRTC MediaStreamService
        if (nextDirect != null && nextDirect.status == 'connected') {
          _callElapsedTimer ??= Timer.periodic(const Duration(seconds: 1), (_) {
            if (mounted) setState(() {});
          });
          final peerId = nextDirect.callerId == meId ? nextDirect.calleeId : nextDirect.callerId;
          if (_activeDirectMediaCallId != nextDirect.callId) {
            _activeDirectMediaCallId = nextDirect.callId;
            if (mounted && !_directCallStageOpen) {
              setState(() => _directCallStageOpen = true);
            }
            await MediaStreamService.instance.startVoiceSession(
              callId: nextDirect.callId,
              peerIds: [peerId],
              micMuted: _micMuted,
              deafened: _deafened,
            );
            if (nextDirect.mediaType == 'video' && !MediaStreamService.instance.isCameraActive) {
              final hasCam = await _requestCameraPermission(showDialogOnDenied: false);
              if (hasCam) {
                await MediaStreamService.instance.startCamera(front: true);
                if (mounted) {
                  setState(() => _cameraOn = MediaStreamService.instance.isCameraActive);
                }
              }
            }
          } else {
            await MediaStreamService.instance.syncActivePeers([peerId], callId: nextDirect.callId);
          }
        } else if (nextDirect == null && (prevDirect != null || _activeDirectMediaCallId != null)) {
          _ringTimer?.cancel();
          _ringTimer = null;
          _callElapsedTimer?.cancel();
          _callElapsedTimer = null;
          _activeDirectMediaCallId = null;
          if (mounted) {
            setState(() {
              _directCallStageOpen = false;
              _micMuted = false;
              _deafened = false;
              _cameraOn = false;
              _screenSharing = false;
            });
          }
          if (_voiceServerId == null) {
            await MediaStreamService.instance.stopVoiceSession();
          }
        }

        final liveCh = !_homeMode ? _activeChannel : null;
        if (liveCh != null && liveCh.type == 'live' && liveCh.live != null) {
          if (liveCh.live!.userId != meId) {
            MediaStreamService.instance.setLiveStagePeer(liveCh.live!.userId, callId: 'live_${liveCh.id}');
          } else {
            await MediaStreamService.instance.startLiveStageSession(callId: 'live_${liveCh.id}', peerIds: []);
          }
        } else {
          MediaStreamService.instance.setLiveStagePeer(null);
        }

        if (_voiceServerId != null && _voiceChannelId != null) {
          final vSrv = _servers.where((s) => s.id == _voiceServerId).firstOrNull;
          final vMembers = vSrv?.voiceStates[_voiceChannelId] ?? [];
          final peerIds = vMembers.map((v) => v.userId).where((id) => id != meId).toList();
          await MediaStreamService.instance.syncActivePeers(peerIds, callId: _voiceCallId ?? '');
        }
      }
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

  Future<bool> _requestMicPermission({bool showDialogOnDenied = true}) async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return true;
    final res = await Permission.microphone.request();
    if (res.isGranted) return true;
    if (showDialogOnDenied && mounted) {
      _showPermissionDeniedDialog('Microphone', 'Nexcord needs microphone access for squad audio and voice channels.');
    }
    return false;
  }

  Future<bool> _requestCameraPermission({bool showDialogOnDenied = true}) async {
    final status = await Permission.camera.status;
    if (status.isGranted) return true;
    final res = await Permission.camera.request();
    if (res.isGranted) return true;
    if (showDialogOnDenied && mounted) {
      _showPermissionDeniedDialog('Camera', 'Nexcord needs camera access for live video calls and stream previews.');
    }
    return false;
  }

  Future<bool> _requestScreenSharePermission() async {
    final status = await Permission.notification.status;
    if (!status.isGranted) {
      await Permission.notification.request();
    }
    return true;
  }

  void _showPermissionDeniedDialog(String permissionName, String rationale) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF2B2D31),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Row(
          children: [
            const Icon(Icons.security_rounded, color: Color(0xFFF23F43)),
            const SizedBox(width: 10),
            Text('$permissionName Permission', style: const TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: Text(
          '$rationale\n\nPlease grant $permissionName permission in Android app settings to continue.',
          style: const TextStyle(color: Color(0xFFDBDEE1), fontSize: 13.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF949BA4))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2)),
            onPressed: () {
              Navigator.pop(ctx);
              openAppSettings();
            },
            child: const Text('Open App Settings', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _joinVoiceChannel(NexcordServer srv, NexcordChannel ch) async {
    final hasMic = await _requestMicPermission();
    if (!hasMic) return;
    try {
      final res = await _api.joinVoice(srv.id, ch.id);
      final callId = res.callId;
      final others = res.participants.where((id) => id != _me!.id).toList();

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
      await MediaStreamService.instance.startVoiceSession(
        callId: callId,
        peerIds: others,
        micMuted: false,
        deafened: false,
      );
      await _syncNow(silent: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Voice join error: $e')));
      }
    }
  }

  Future<void> _logout() async {
    _pollTimer?.cancel();
    _ringTimer?.cancel();
    _ringTimer = null;
    _callElapsedTimer?.cancel();
    _callElapsedTimer = null;
    if (_directCall != null) {
      await _api.endDirectCall(_directCall!.callId, reason: 'hangup').catchError((_) {});
    }
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
      _directCall = null;
      _directCallStageOpen = false;
      _activeDirectMediaCallId = null;
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
    final leavingServerId = _voiceServerId;
    if (_voiceServerId != null && _voiceChannelId != null) {
      await _api.leaveVoice().catchError((_) {});
    }
    await MediaStreamService.instance.stopVoiceSession();

    final targetServer = _servers.where((s) => s.id == (leavingServerId ?? _activeServerId)).firstOrNull 
        ?? _activeServer 
        ?? _servers.firstOrNull;

    NexcordChannel? textCh;
    if (targetServer != null) {
      textCh = targetServer.channels.where((c) => c.type != 'voice' && c.name == 'general').firstOrNull
          ?? targetServer.channels.where((c) => c.type != 'voice').firstOrNull
          ?? targetServer.channels.firstOrNull;
    }

    setState(() {
      _voiceServerId = null;
      _voiceChannelId = null;
      _voiceCallId = null;
      _micMuted = false;
      _deafened = false;
      _cameraOn = false;
      _screenSharing = false;
      _section = 'chat';
      _homeMode = false;
      if (targetServer != null && textCh != null) {
        _activeServerId = targetServer.id;
        _activeChannelId = textCh.id;
      }
    });

    if (targetServer != null && textCh != null) {
      await _selectChannel(targetServer, textCh);
    }
    await _syncNow(silent: true);
  }

  String _formatErr(Object e) =>
      e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');

  bool get _isInTextOrDmChat =>
      _section == 'chat' &&
      !_directCallStageOpen &&
      (_homeMode
          ? _activeDmUserId.isNotEmpty
          : (_activeServer != null &&
              _activeChannel != null &&
              _activeChannel!.type != 'voice' &&
              _activeChannel!.type != 'live'));

  Future<void> _startDirectCall({
    String? targetUserId,
    String? phone,
    bool video = false,
    String contactName = '',
    bool rethrowError = false,
  }) async {
    final hasMic = await _requestMicPermission();
    if (!hasMic) {
      if (rethrowError) throw Exception('Microphone permission is required for calling.');
      return;
    }
    if (video) {
      final hasCam = await _requestCameraPermission();
      if (!hasCam) {
        if (rethrowError) throw Exception('Camera permission is required for video calling.');
        return;
      }
    }

    try {
      if (_voiceServerId != null) {
        await _leaveVoiceChannel();
      }
      final dc = await _api.startDirectCall(
        targetUserId: targetUserId,
        phone: phone,
        mediaType: video ? 'video' : 'audio',
        contactName: contactName,
      );
      if (!mounted) return;
      setState(() {
        _directCall = dc;
        _directCallStageOpen = false;
        _micMuted = false;
        _deafened = false;
        _cameraOn = video;
        if (dc.callee != null) {
          _users = Map<String, NexcordUser>.from(_users)..[dc.callee!.id] = dc.callee!;
        }
      });
      _sdk.logVoiceAction('DirectCall.start', 'callId=${dc.callId} video=$video');
    } catch (e) {
      if (rethrowError) rethrow;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_formatErr(e))),
        );
      }
    }
  }

  Future<void> _acceptDirectCall(DirectCallInfo call, {required bool asVideo}) async {
    final hasMic = await _requestMicPermission();
    if (!hasMic) return;
    if (asVideo) {
      final hasCam = await _requestCameraPermission();
      if (!hasCam) return;
    }

    _ringTimer?.cancel();
    _ringTimer = null;

    try {
      if (_voiceServerId != null) {
        await _leaveVoiceChannel();
      }
      final accepted = await _api.acceptDirectCall(
        call.callId,
        mediaType: asVideo ? 'video' : 'audio',
      );
      final meId = _me?.id ?? '';
      final peerId = accepted.callerId == meId ? accepted.calleeId : accepted.callerId;
      _activeDirectMediaCallId = accepted.callId;
      if (mounted) {
        setState(() {
          _directCall = accepted;
          _directCallStageOpen = true;
          _micMuted = false;
          _deafened = false;
          _users = Map<String, NexcordUser>.from(_users);
          if (accepted.caller != null) _users[accepted.caller!.id] = accepted.caller!;
          if (accepted.callee != null) _users[accepted.callee!.id] = accepted.callee!;
        });
      }
      await MediaStreamService.instance.startVoiceSession(
        callId: accepted.callId,
        peerIds: [peerId],
        micMuted: false,
        deafened: false,
      );
      if (asVideo) {
        await MediaStreamService.instance.startCamera(front: true);
        if (mounted) {
          setState(() => _cameraOn = MediaStreamService.instance.isCameraActive);
        }
      }
      _sdk.logVoiceAction('DirectCall.accept', 'callId=${accepted.callId} video=$asVideo');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_formatErr(e))),
        );
      }
    }
  }

  Future<void> _endDirectCall({String? reason}) async {
    final dc = _directCall;
    _ringTimer?.cancel();
    _ringTimer = null;
    _callElapsedTimer?.cancel();
    _callElapsedTimer = null;
    _activeDirectMediaCallId = null;

    if (mounted) {
      setState(() {
        _directCall = null;
        _directCallStageOpen = false;
        _micMuted = false;
        _deafened = false;
        _cameraOn = false;
        _screenSharing = false;
      });
    }

    if (dc != null) {
      final r = reason ?? (dc.status == 'ringing' && dc.calleeId == _me?.id ? 'declined' : 'hangup');
      await _api.endDirectCall(dc.callId, reason: r).catchError((_) {});
      _sdk.logVoiceAction('DirectCall.end', 'callId=${dc.callId} reason=$r');
    }
    if (_voiceServerId == null) {
      await MediaStreamService.instance.stopVoiceSession();
    }
  }

  Widget _buildDirectCallBanner(DirectCallInfo call) {
    final meId = _me?.id ?? '';
    final isCaller = call.callerId == meId;
    final peerId = isCaller ? call.calleeId : call.callerId;
    final peerUser = _users[peerId] ?? (isCaller ? call.callee : call.caller);
    final displayName = (peerUser?.displayName.isNotEmpty == true)
        ? peerUser!.displayName
        : (call.contactLabel.isNotEmpty ? call.contactLabel : peerId);
    final relationLabel = call.isFriend ? 'friend' : 'contact';
    final isIncomingRinging = !isCaller && call.status == 'ringing';
    final isOutgoingRinging = isCaller && call.status == 'ringing';
    final isConnected = call.status == 'connected';
    final isVideo = call.mediaType == 'video';

    String subtitle;
    if (isIncomingRinging) {
      subtitle = 'Incoming ${isVideo ? 'video' : 'voice'} call';
    } else if (isOutgoingRinging) {
      subtitle = 'Calling $displayName...';
    } else {
      final base = call.answeredAt ?? call.createdAt ?? DateTime.now().millisecondsSinceEpoch;
      final elapsed = ((DateTime.now().millisecondsSinceEpoch - base) ~/ 1000).clamp(0, 86400);
      final mm = (elapsed ~/ 60).toString().padLeft(2, '0');
      final ss = (elapsed % 60).toString().padLeft(2, '0');
      subtitle = '${isVideo ? 'Video' : 'Voice'} call • $mm:$ss';
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF111622),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isIncomingRinging
              ? const Color(0x6B1FA855)
              : isConnected
                  ? const Color(0x595865F2)
                  : Colors.white.withValues(alpha: 0.10),
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x7304070F), blurRadius: 20, offset: Offset(0, 8)),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: isConnected ? () => setState(() => _directCallStageOpen = true) : null,
              behavior: HitTestBehavior.opaque,
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isIncomingRinging || isConnected
                            ? const Color(0x991FA855)
                            : Colors.white24,
                        width: 2,
                      ),
                    ),
                    child: CircleAvatar(
                      radius: 19,
                      backgroundColor: peerUser?.color ?? const Color(0xFF5865F2),
                      child: Text(
                        displayName.isNotEmpty ? displayName[0].toUpperCase() : 'F',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                    ),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '$displayName, $relationLabel',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFFF3F5FA),
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF9BA5BC),
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          if (isIncomingRinging) ...[
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1FA855),
                foregroundColor: Colors.white,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                elevation: 0,
              ),
              onPressed: () => _acceptDirectCall(call, asVideo: isVideo),
              icon: Icon(isVideo ? Icons.videocam_rounded : Icons.call_rounded, size: 16),
              label: const Text('Join', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
            ),
            if (isVideo) ...[
              const SizedBox(width: 6),
              InkWell(
                onTap: () => _acceptDirectCall(call, asVideo: false),
                borderRadius: BorderRadius.circular(99),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: const Color(0x2E1FA855),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0x611FA855)),
                  ),
                  child: const Icon(Icons.call_rounded, color: Color(0xFF57F287), size: 16),
                ),
              ),
            ],
            const SizedBox(width: 6),
            InkWell(
              onTap: () => _endDirectCall(reason: 'declined'),
              borderRadius: BorderRadius.circular(99),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0x2EF23F43),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0x59F23F43)),
                ),
                child: const Icon(Icons.close_rounded, color: Color(0xFFFF6B6E), size: 17),
              ),
            ),
          ] else if (isOutgoingRinging) ...[
            InkWell(
              onTap: () => _endDirectCall(reason: 'hangup'),
              borderRadius: BorderRadius.circular(99),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: const Color(0x2EF23F43),
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: const Color(0x61F23F43)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.call_end_rounded, color: Color(0xFFFF7B7E), size: 15),
                    SizedBox(width: 5),
                    Text('Cancel', style: TextStyle(color: Color(0xFFFF7B7E), fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
          ] else ...[
            InkWell(
              onTap: _toggleVoiceMic,
              borderRadius: BorderRadius.circular(99),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: _micMuted ? const Color(0x2EF23F43) : Colors.white.withValues(alpha: 0.07),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _micMuted ? const Color(0x59F23F43) : Colors.white.withValues(alpha: 0.12),
                  ),
                ),
                child: Icon(
                  _micMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                  color: _micMuted ? const Color(0xFFFF6B6E) : const Color(0xFFE4E8F3),
                  size: 16,
                ),
              ),
            ),
            const SizedBox(width: 6),
            InkWell(
              onTap: () => setState(() => _directCallStageOpen = true),
              borderRadius: BorderRadius.circular(99),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0x2E5865F2),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0x595865F2)),
                ),
                child: const Icon(Icons.open_in_full_rounded, color: Color(0xFFA9B2FF), size: 15),
              ),
            ),
            const SizedBox(width: 6),
            InkWell(
              onTap: () => _endDirectCall(reason: 'hangup'),
              borderRadius: BorderRadius.circular(99),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0x2EF23F43),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0x59F23F43)),
                ),
                child: const Icon(Icons.call_end_rounded, color: Color(0xFFFF6B6E), size: 16),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _toggleVoiceMic() async {
    if (_micMuted) {
      final hasMic = await _requestMicPermission();
      if (!hasMic) return;
    }
    setState(() => _micMuted = !_micMuted);
    MediaStreamService.instance.setMicMuted(_micMuted);
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
    MediaStreamService.instance.setDeafened(_deafened);
    if (_voiceServerId != null) {
      await _api.updateVoiceState(deafened: _deafened).catchError((_) {});
    }
    _sdk.logVoiceAction('NCCall.deafen', 'deafened=$_deafened');
  }

  Future<void> _toggleVoiceCamera() async {
    final media = MediaStreamService.instance;
    if (!media.isCameraActive) {
      final hasCam = await _requestCameraPermission();
      if (!hasCam) return;
      final ok = await media.startCamera(front: true);
      if (!ok) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(media.cameraError ?? 'Failed to open camera.')),
          );
        }
        return;
      }
      setState(() => _cameraOn = true);
    } else {
      await media.stopCamera();
      setState(() => _cameraOn = false);
    }
    if (_voiceServerId != null) {
      await _api.updateVoiceState(video: _cameraOn).catchError((_) {});
    }
    _sdk.logVoiceAction('Camera', 'cameraOn=$_cameraOn');
  }

  Future<void> _toggleScreenShare() async {
    final media = MediaStreamService.instance;
    if (!media.isScreenSharing) {
      final ok = await media.startScreenShare();
      if (!ok) {
        if (mounted && media.screenShareError != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(media.screenShareError!)),
          );
        }
        return;
      }
      setState(() {
        _screenSharing = true;
        _cameraOn = media.isCameraActive;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF23A55A),
            content: Row(
              children: [
                Icon(Icons.screen_share_rounded, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Expanded(child: Text('Screen broadcast active in voice channel! 📺')),
              ],
            ),
          ),
        );
      }
    } else {
      await media.stopScreenShare();
      setState(() => _screenSharing = false);
    }
    if (_voiceServerId != null) {
      await _api.updateVoiceState(streaming: _screenSharing, video: _cameraOn).catchError((_) {});
    }
    _sdk.logVoiceAction('ScreenShare', 'sharing=$_screenSharing');
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _ringTimer?.cancel();
    _callElapsedTimer?.cancel();
    _sdk.removeListener(_onSdkUpdate);
    MediaStreamService.instance.removeListener(_onMediaUpdate);
    _msgCtrl.dispose();
    _chatScroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_booted) {
      return Scaffold(
        backgroundColor: const Color(0xFF121318),
        body: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.25),
              radius: 0.9,
              colors: [Color(0xFF242A52), Color(0xFF121318)],
            ),
          ),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF5865F2), Color(0xFF7C3AED)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: const [
                      BoxShadow(color: Color(0x665865F2), blurRadius: 24, offset: Offset(0, 8)),
                    ],
                  ),
                  child: const Icon(Icons.sports_esports_rounded, color: Colors.white, size: 38),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Nexcord',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.5),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Connecting to Nexconn Real-Time Edge...',
                  style: TextStyle(fontSize: 12.5, color: Color(0xFF9097A3)),
                ),
                const SizedBox(height: 22),
                const SizedBox(
                  width: 140,
                  child: LinearProgressIndicator(
                    minHeight: 3.5,
                    borderRadius: BorderRadius.all(Radius.circular(99)),
                    backgroundColor: Colors.white12,
                    color: Color(0xFF5865F2),
                  ),
                ),
              ],
            ),
          ),
        ),
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
    final pinList = (!_homeMode && srv != null && ch != null) ? (srv.pins[ch.id] ?? const []) : const <Map<String, dynamic>>[];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: Colors.white.withValues(alpha: 0.06)),
        ),
        title: Row(
          children: [
            if (_section == 'chat' && !_homeMode && ch != null) ...[
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: ch.type == 'live' ? const Color(0x28F23F43) : Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  ch.type == 'voice'
                      ? Icons.volume_up_rounded
                      : ch.type == 'live'
                          ? Icons.tv_rounded
                          : Icons.tag_rounded,
                  size: 18,
                  color: ch.type == 'live' ? const Color(0xFFF23F43) : const Color(0xFFB5BAC1),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      ch.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, letterSpacing: -0.2),
                    ),
                    Text(
                      ch.topic.isNotEmpty ? ch.topic : (srv?.name ?? 'Squad Channel'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF9097A3)),
                    ),
                  ],
                ),
              ),
            ] else if (_section == 'chat' && !_homeMode && srv == null) ...[
              const Icon(Icons.sports_esports_rounded, size: 20, color: Color(0xFF5865F2)),
              const SizedBox(width: 8),
              const Text('Nexcord Arena', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold)),
            ] else if (_section == 'chat' && _homeMode && _activeDmUserId.isNotEmpty) ...[
              Stack(
                children: [
                  CircleAvatar(
                    radius: 15,
                    backgroundColor: _users[_activeDmUserId]?.color ?? const Color(0xFF5865F2),
                    child: Text(
                      (_users[_activeDmUserId]?.displayName ?? _activeDmUserId)[0].toUpperCase(),
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 9,
                      height: 9,
                      decoration: BoxDecoration(
                        color: _users[_activeDmUserId]?.statusColor ?? const Color(0xFF80848E),
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFF22242A), width: 1.5),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _users[_activeDmUserId]?.displayName ?? _activeDmUserId,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      _users[_activeDmUserId]?.customStatus.isNotEmpty == true
                          ? _users[_activeDmUserId]!.customStatus
                          : (_users[_activeDmUserId]?.status ?? 'offline'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF9097A3)),
                    ),
                  ],
                ),
              ),
            ] else if (_section == 'friends') ...[
              const Icon(Icons.people_alt_rounded, size: 20, color: Color(0xFF5865F2)),
              const SizedBox(width: 8),
              const Text('Friends & DMs', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold)),
            ] else if (_section == 'voice') ...[
              const Icon(Icons.headset_mic_rounded, size: 20, color: Color(0xFF23A55A)),
              const SizedBox(width: 8),
              const Text('Voice Lounges', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold)),
            ] else ...[
              const Icon(Icons.account_circle_rounded, size: 20, color: Color(0xFF5865F2)),
              const SizedBox(width: 8),
              const Text('Profile & Settings', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold)),
            ],
          ],
        ),
        actions: [
          if (_section == 'chat' && !_homeMode && srv != null && ch != null && ch.type != 'voice' && ch.type != 'live')
            IconButton(
              icon: Badge(
                isLabelVisible: pinList.isNotEmpty,
                label: Text('${pinList.length}'),
                backgroundColor: const Color(0xFF5865F2),
                child: const Icon(Icons.push_pin_outlined, size: 20),
              ),
              tooltip: 'Pinned Messages',
              onPressed: () => _showPinnedMessagesSheet(context, srv, ch),
            ),
          if (_section == 'chat' && !_homeMode && srv != null)
            IconButton(
              icon: const Icon(Icons.person_add_alt_1_rounded, color: Color(0xFF5865F2), size: 21),
              tooltip: 'Invite & Share Server',
              onPressed: () => _showShareServerSheet(context, srv),
            ),
          if (_section == 'chat' && _homeMode && _activeDmUserId.isNotEmpty) ...[
            IconButton(
              icon: const Icon(Icons.call_rounded, color: Color(0xFF23A55A)),
              tooltip: 'Voice Call',
              onPressed: () => _startDirectCall(targetUserId: _activeDmUserId, video: false),
            ),
            IconButton(
              icon: const Icon(Icons.videocam_rounded, color: Color(0xFF8EA1FF)),
              tooltip: 'Video Call',
              onPressed: () => _startDirectCall(targetUserId: _activeDmUserId, video: true),
            ),
          ],
          if (_section == 'chat' && !_homeMode && srv != null)
            Builder(
              builder: (ctx) => IconButton(
                icon: const Icon(Icons.group_rounded),
                tooltip: 'Server Members',
                onPressed: () => Scaffold.of(ctx).openEndDrawer(),
              ),
            ),
        ],
      ),
      drawer: _buildLeftDrawer(context, srv),
      endDrawer: _buildMembersDrawer(context, srv),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        child: KeyedSubtree(
          key: ValueKey('$_section:$_homeMode:$_activeServerId:$_activeChannelId:$_activeDmUserId:$_directCallStageOpen:${_directCall?.callId ?? ''}'),
          child: _buildBody(srv, ch),
        ),
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_directCall != null && !_directCallStageOpen && !_isInTextOrDmChat)
            _buildDirectCallBanner(_directCall!),
          _buildActiveVoiceBar(srv),
          Container(
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.07))),
            ),
            child: NavigationBar(
              selectedIndex: _section == 'chat'
                  ? 0
                  : _section == 'friends'
                      ? 1
                      : _section == 'voice'
                          ? 2
                          : 3,
              onDestinationSelected: (idx) {
                HapticFeedback.selectionClick();
                setState(() {
                  _directCallStageOpen = false;
                  _section = ['chat', 'friends', 'voice', 'settings'][idx];
                });
              },
              destinations: [
                const NavigationDestination(
                  icon: Icon(Icons.forum_outlined, color: Color(0xFF9097A3)),
                  selectedIcon: Icon(Icons.forum_rounded, color: Colors.white),
                  label: 'Arena',
                ),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: _incoming.isNotEmpty,
                    label: Text('${_incoming.length}'),
                    backgroundColor: const Color(0xFFF23F43),
                    child: const Icon(Icons.people_alt_outlined, color: Color(0xFF9097A3)),
                  ),
                  selectedIcon: Badge(
                    isLabelVisible: _incoming.isNotEmpty,
                    label: Text('${_incoming.length}'),
                    backgroundColor: const Color(0xFFF23F43),
                    child: const Icon(Icons.people_alt_rounded, color: Colors.white),
                  ),
                  label: 'Friends',
                ),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: _voiceChannelId != null,
                    smallSize: 8,
                    backgroundColor: const Color(0xFF57F287),
                    child: const Icon(Icons.headset_mic_outlined, color: Color(0xFF9097A3)),
                  ),
                  selectedIcon: const Icon(Icons.headset_mic_rounded, color: Colors.white),
                  label: 'Voice',
                ),
                NavigationDestination(
                  icon: CircleAvatar(
                    radius: 11,
                    backgroundColor: _me!.color,
                    child: Text(
                      _me!.displayName.isNotEmpty ? _me!.displayName[0].toUpperCase() : 'U',
                      style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                  selectedIcon: Container(
                    padding: const EdgeInsets.all(1.5),
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: CircleAvatar(
                      radius: 10.5,
                      backgroundColor: _me!.color,
                      child: Text(
                        _me!.displayName.isNotEmpty ? _me!.displayName[0].toUpperCase() : 'U',
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ),
                  ),
                  label: 'You',
                ),
              ],
            ),
          ),
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
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.asset(
                        'assets/nexconn_logo.png',
                        width: 32,
                        height: 32,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(Icons.hub_rounded, color: Colors.white),
                      ),
                    ),
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
                            child: s.iconUrl.isNotEmpty
                                ? ClipRRect(
                                    borderRadius: BorderRadius.circular(act ? 14 : 20),
                                    child: Image.network(
                                      s.iconUrl,
                                      width: 44,
                                      height: 44,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Text(
                                        initials.length > 2 ? initials.substring(0, 2) : initials,
                                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                                      ),
                                    ),
                                  )
                                : Text(
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
                    child: const Icon(Icons.add_rounded, color: Colors.white, size: 24),
                  ),
                  const SizedBox(height: 8),
                  _railButton(
                    active: false,
                    color: const Color(0xFF5865F2),
                    onTap: () => _showJoinServerDialog(context),
                    child: const Icon(Icons.explore_rounded, color: Colors.white, size: 22),
                  ),
                ],
              ),
            ),

            // Channels / DMs Column
            Expanded(
              child: Column(
                children: [
                  Container(
                    height: 52,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Colors.black26)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () {
                              if (!_homeMode && srv != null) {
                                _showShareServerSheet(context, srv);
                              }
                            },
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    _homeMode ? 'Direct Messages' : (srv?.name ?? 'Nexcord'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.bold, color: Colors.white),
                                  ),
                                ),
                                if (!_homeMode && srv != null)
                                  const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: Color(0xFF949BA4)),
                              ],
                            ),
                          ),
                        ),
                        if (!_homeMode && srv != null) ...[
                          IconButton(
                            icon: const Icon(Icons.settings_rounded, size: 18, color: Color(0xFF949BA4)),
                            tooltip: 'Server Settings',
                            onPressed: () => _showServerSettingsSheet(context, srv),
                          ),
                          IconButton(
                            icon: const Icon(Icons.share_rounded, size: 18, color: Color(0xFF5865F2)),
                            tooltip: 'Share Server Link & ID',
                            onPressed: () => _showShareServerSheet(context, srv),
                          ),
                          IconButton(
                            icon: const Icon(Icons.add_rounded, size: 20, color: Color(0xFF949BA4)),
                            tooltip: 'Create Channel',
                            onPressed: () => _showCreateChannelDialog(context, srv),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (!_homeMode && srv != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
                      child: InkWell(
                        onTap: () => _showShareServerSheet(context, srv),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                          decoration: BoxDecoration(
                            color: const Color(0x285865F2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0x555865F2)),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.person_add_alt_1_rounded, size: 15, color: Color(0xFF5865F2)),
                              SizedBox(width: 8),
                              Text(
                                'Share Server Link & ID',
                                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF5865F2)),
                              ),
                            ],
                          ),
                        ),
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
                            ? Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.sports_esports_rounded, size: 36, color: Color(0xFF5865F2)),
                                    const SizedBox(height: 10),
                                    const Text(
                                      'No server selected yet',
                                      style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Create a gaming server or join with an invite code.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(fontSize: 12, color: Color(0xFF9097A3)),
                                    ),
                                    const SizedBox(height: 12),
                                    ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF5865F2),
                                        foregroundColor: Colors.white,
                                      ),
                                      onPressed: () {
                                        Navigator.pop(context);
                                        _showCreateServerDialog(context);
                                      },
                                      icon: const Icon(Icons.add_rounded, size: 16),
                                      label: const Text('Create Server', style: TextStyle(fontSize: 12.5)),
                                    ),
                                  ],
                                ),
                              )
                            : ListView(
                                padding: const EdgeInsets.all(8),
                                children: srv.categories.map((cat) {
                                  final chs = srv.channels.where((c) => c.categoryId == cat.id).toList();
                                  final collapsed = _collapsedCategories.contains(cat.id);
                                  return Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      InkWell(
                                        borderRadius: BorderRadius.circular(4),
                                        onTap: () {
                                          setState(() {
                                            if (collapsed) {
                                              _collapsedCategories.remove(cat.id);
                                            } else {
                                              _collapsedCategories.add(cat.id);
                                            }
                                          });
                                        },
                                        child: Padding(
                                          padding: const EdgeInsets.fromLTRB(4, 10, 6, 4),
                                          child: Row(
                                            children: [
                                              Icon(
                                                collapsed ? Icons.chevron_right_rounded : Icons.expand_more_rounded,
                                                size: 15,
                                                color: const Color(0xFF9097A3),
                                              ),
                                              const SizedBox(width: 2),
                                              Expanded(
                                                child: Text(
                                                  cat.name.toUpperCase(),
                                                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: Color(0xFF9097A3)),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      if (!collapsed)
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
                          icon: const Icon(Icons.settings_rounded, size: 18, color: Color(0xFF949BA4)),
                          tooltip: 'Profile & Settings',
                          onPressed: () {
                            Navigator.pop(context);
                            setState(() => _section = 'settings');
                          },
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
    return SizedBox(
      height: 48,
      width: 68,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 0,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: active ? 4 : 0,
              height: active ? 34 : 0,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.horizontal(right: Radius.circular(4)),
              ),
            ),
          ),
          InkWell(
            onTap: () {
              HapticFeedback.selectionClick();
              onTap();
            },
            borderRadius: BorderRadius.circular(active ? 14 : 24),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: active ? color : const Color(0xFF2A2D35),
                borderRadius: BorderRadius.circular(active ? 14 : 24),
                boxShadow: active
                    ? [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 3))]
                    : null,
              ),
              alignment: Alignment.center,
              child: child,
            ),
          ),
        ],
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
    if (_directCallStageOpen && _directCall != null) {
      final dc = _directCall!;
      final meId = _me!.id;
      final peerId = dc.callerId == meId ? dc.calleeId : dc.callerId;
      final peerUser = _users[peerId] ?? (dc.callerId == meId ? dc.callee : dc.caller);
      final peerName = (peerUser?.displayName.isNotEmpty == true)
          ? peerUser!.displayName
          : (dc.contactLabel.isNotEmpty ? dc.contactLabel : peerId);
      final relation = dc.isFriend ? 'friend' : 'contact';
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF111622),
              border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
            ),
            child: Row(
              children: [
                Icon(
                  dc.mediaType == 'video' ? Icons.videocam_rounded : Icons.call_rounded,
                  size: 16,
                  color: const Color(0xFF57F287),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '$peerName, $relation',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5),
                  ),
                ),
                TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: Colors.white.withValues(alpha: 0.08),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: () => setState(() => _directCallStageOpen = false),
                  icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 17),
                  label: const Text('Back to Chat', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          Expanded(
            child: VoiceHuddleView(
              channelName: '$peerName ($relation)',
              callId: dc.callId,
              me: _me!,
              users: _users,
              participants: [
                VoiceParticipant(
                  userId: meId,
                  muted: _micMuted,
                  deafened: _deafened,
                  video: _cameraOn,
                  streaming: _screenSharing,
                ),
                VoiceParticipant(
                  userId: peerId,
                  video: dc.mediaType == 'video',
                ),
              ],
              micMuted: _micMuted,
              deafened: _deafened,
              cameraOn: _cameraOn,
              screenSharing: _screenSharing,
              onToggleMic: _toggleVoiceMic,
              onToggleDeafen: _toggleVoiceDeafen,
              onToggleCamera: _toggleVoiceCamera,
              onToggleScreenShare: _toggleScreenShare,
              onHangup: () => _endDirectCall(reason: 'hangup'),
            ),
          ),
        ],
      );
    }

    if (_section == 'friends') {
      return _FriendsHub(
        friends: _friends,
        incoming: _incoming,
        dms: _dms,
        users: _users,
        me: _me!,
        api: _api,
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
        onCallUser: (uid, video, {contactName}) => _startDirectCall(
          targetUserId: uid,
          video: video,
          contactName: contactName ?? '',
        ),
        onCallPhone: (phone, video) => _startDirectCall(
          phone: phone,
          video: video,
          rethrowError: true,
        ),
      );
    }

    if (_section == 'voice') {
      return _buildVoiceSection(srv);
    }

    if (_section == 'settings') {
      return _buildUserProfileSettingsScreen();
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
        onStartLive: ({required mode, required title}) async {
          await _api.startLive(srv.id, ch.id, mode: mode, title: title);
          await _syncNow();
        },
        onStopLive: () async {
          await _api.stopLive(srv.id, ch.id);
          await _syncNow();
        },
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
        screenSharing: _screenSharing,
        onToggleMic: _toggleVoiceMic,
        onToggleDeafen: _toggleVoiceDeafen,
        onToggleCamera: _toggleVoiceCamera,
        onToggleScreenShare: _toggleScreenShare,
        onHangup: () async {
          await _leaveVoiceChannel();
        },
      );
    }

    // Zero-Server Mobile Onboarding Hub
    if (!_homeMode && srv == null) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0x265865F2),
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: const Color(0x665865F2)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.auto_awesome_rounded, size: 13, color: Color(0xFFA5B4FC)),
                    SizedBox(width: 6),
                    Text(
                      'WELCOME TO NEXCORD ARENA',
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFFA5B4FC), letterSpacing: 0.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Launch Your Squad Hub',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.4),
              ),
              const SizedBox(height: 8),
              const Text(
                'Create a gaming server with tactical radar pings, 60 FPS live streams, and voice huddles — or join an existing squad.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13.5, color: Color(0xFF9097A3), height: 1.45),
              ),
              const SizedBox(height: 22),
              _buildArenaOnboardingCard(
                icon: Icons.add_box_rounded,
                iconBg: const Color(0x285865F2),
                iconColor: const Color(0xFF8EA1FF),
                title: 'Create a Squad Server',
                subtitle: 'Includes #squad-chat-room, Live Stage & Voice Lounge',
                highlight: true,
                onTap: () => _showCreateServerDialog(context),
              ),
              const SizedBox(height: 12),
              _buildArenaOnboardingCard(
                icon: Icons.explore_rounded,
                iconBg: const Color(0x2823A55A),
                iconColor: const Color(0xFF57F287),
                title: 'Join via Invite or ID',
                subtitle: 'Paste a Server ID or invite code from your squadmates',
                onTap: () => _showJoinServerDialog(context),
              ),
              const SizedBox(height: 12),
              _buildArenaOnboardingCard(
                icon: Icons.people_alt_rounded,
                iconBg: const Color(0x28F0B232),
                iconColor: const Color(0xFFFFD166),
                title: 'Find Friends & DMs',
                subtitle: 'Connect 1-on-1 with friends by username',
                onTap: () => setState(() => _section = 'friends'),
              ),
            ],
          ),
        ),
      );
    }

    // Standard Text / Squad Chat / DM View
    return Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              RefreshIndicator(
                color: const Color(0xFF5865F2),
                backgroundColor: const Color(0xFF22242A),
                onRefresh: () => _loadMessages(),
                child: ListView.builder(
                  controller: _chatScroll,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                  itemCount: _messages.length + 1,
                  itemBuilder: (_, idx) {
                    if (idx == 0) {
                      final dmUser = _homeMode ? _users[_activeDmUserId] : null;
                      return Container(
                        padding: const EdgeInsets.fromLTRB(4, 10, 4, 18),
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.07))),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 54,
                              height: 54,
                              decoration: BoxDecoration(
                                color: dmUser != null ? dmUser.color : const Color(0xFF343741),
                                shape: BoxShape.circle,
                              ),
                              alignment: Alignment.center,
                              child: dmUser != null
                                  ? Text(
                                      dmUser.displayName[0].toUpperCase(),
                                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                                    )
                                  : const Icon(Icons.tag_rounded, size: 28, color: Colors.white),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              dmUser != null ? dmUser.displayName : 'Welcome to #${ch?.name ?? "channel"}!',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.3),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              dmUser != null
                                  ? 'Direct conversation with @${dmUser.username} powered by Nexconn SDK.'
                                  : (ch?.topic.isNotEmpty == true ? ch!.topic : 'Start of #${ch?.name ?? "channel"}. Swipe right on any message to reply, or long-press for actions.'),
                              style: const TextStyle(fontSize: 13, color: Color(0xFF9097A3), height: 1.4),
                            ),
                          ],
                        ),
                      );
                    }

                    final i = idx - 1;
                    final m = _messages[i];
                    final prev = i > 0 ? _messages[i - 1] : null;
                    final showDateSep = prev == null || !isSameChatDay(prev.createdAt, m.createdAt);
                    final grouped = !showDateSep &&
                        prev.senderId == m.senderId &&
                        (m.createdAt - prev.createdAt) < 300000 &&
                        m.replyTo == null;
                    final u = m.senderId == _me!.id ? _me! : _users[m.senderId];

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (showDateSep)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Row(
                              children: [
                                Expanded(child: Divider(color: Colors.white.withValues(alpha: 0.08), height: 1)),
                                Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 10),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.05),
                                    borderRadius: BorderRadius.circular(99),
                                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                                  ),
                                  child: Text(
                                    formatChatDateDivider(m.createdAt),
                                    style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF9097A3)),
                                  ),
                                ),
                                Expanded(child: Divider(color: Colors.white.withValues(alpha: 0.08), height: 1)),
                              ],
                            ),
                          ),
                        Dismissible(
                          key: ValueKey('swipe_${m.id}'),
                          direction: DismissDirection.startToEnd,
                          dismissThresholds: const {DismissDirection.startToEnd: 0.22},
                          confirmDismiss: (_) async {
                            HapticFeedback.lightImpact();
                            setState(() => _replyTo = ReplyRef(id: m.id, senderId: m.senderId, text: m.text));
                            return false;
                          },
                          background: Container(
                            alignment: Alignment.centerLeft,
                            padding: const EdgeInsets.only(left: 12),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: const Color(0x385865F2),
                                shape: BoxShape.circle,
                                border: Border.all(color: const Color(0xFF5865F2)),
                              ),
                              child: const Icon(Icons.reply_rounded, size: 16, color: Colors.white),
                            ),
                          ),
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onLongPress: () {
                              HapticFeedback.mediumImpact();
                              _showMessageActions(m);
                            },
                            child: Container(
                              margin: EdgeInsets.only(bottom: grouped ? 3 : 8, top: grouped ? 0 : 3),
                              padding: m.type == 'quickchat' ? const EdgeInsets.only(left: 8, top: 3, bottom: 3) : EdgeInsets.zero,
                              decoration: m.type == 'quickchat'
                                  ? BoxDecoration(
                                      color: const Color(0x125865F2),
                                      borderRadius: BorderRadius.circular(4),
                                      border: const Border(left: BorderSide(color: Color(0xFF5865F2), width: 3)),
                                    )
                                  : null,
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (!grouped)
                                    CircleAvatar(
                                      radius: 17,
                                      backgroundColor: u?.color ?? const Color(0xFF5865F2),
                                      child: Text(
                                        (u?.displayName ?? m.senderId)[0].toUpperCase(),
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                      ),
                                    )
                                  else
                                    const SizedBox(width: 34),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        if (m.replyTo != null)
                                          Container(
                                            margin: const EdgeInsets.only(bottom: 3),
                                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: Colors.white.withValues(alpha: 0.04),
                                              borderRadius: BorderRadius.circular(5),
                                              border: const Border(left: BorderSide(color: Color(0xFF5865F2), width: 2)),
                                            ),
                                            child: Text(
                                              '↩ ${_users[m.replyTo!.senderId]?.displayName ?? m.replyTo!.senderId}: ${m.replyTo!.text}',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontSize: 11.5, color: Color(0xFF9097A3)),
                                            ),
                                          ),
                                        if (!grouped) ...[
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
                                              Text(
                                                formatChatTime(m.createdAt),
                                                style: const TextStyle(fontSize: 10.5, color: Color(0xFF9097A3)),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 2),
                                        ],
                                        if (m.type == 'gif' || (m.text.startsWith('http') && m.text.contains('.gif')))
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4, bottom: 2),
                                            child: ClipRRect(
                                              borderRadius: BorderRadius.circular(10),
                                              child: Container(
                                                constraints: const BoxConstraints(maxWidth: 240, maxHeight: 180),
                                                color: const Color(0xFF16171B),
                                                child: Builder(builder: (_) {
                                                  final rawUrl = (m.metadata?['url'] as String?) ?? m.text;
                                                  final isHttp = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
                                                  if (!isHttp) {
                                                    return const Padding(
                                                      padding: EdgeInsets.all(12),
                                                      child: Row(
                                                        mainAxisSize: MainAxisSize.min,
                                                        children: [
                                                          Icon(Icons.gif_box_rounded, size: 20, color: Color(0xFF5865F2)),
                                                          SizedBox(width: 6),
                                                          Text('GIF Animation', style: TextStyle(color: Colors.white70, fontSize: 12)),
                                                        ],
                                                      ),
                                                    );
                                                  }
                                                  return Image.network(
                                                    rawUrl,
                                                    fit: BoxFit.cover,
                                                    errorBuilder: (_, __, ___) => const Padding(
                                                      padding: EdgeInsets.all(12),
                                                      child: Row(
                                                        mainAxisSize: MainAxisSize.min,
                                                        children: [
                                                          Icon(Icons.broken_image, size: 18, color: Colors.grey),
                                                          SizedBox(width: 6),
                                                          Text('GIF unavailable', style: TextStyle(color: Colors.grey, fontSize: 12)),
                                                        ],
                                                      ),
                                                    ),
                                                  );
                                                }),
                                              ),
                                            ),
                                          )
                                        else if (m.type == 'sticker')
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4, bottom: 2),
                                            child: ClipRRect(
                                              borderRadius: BorderRadius.circular(12),
                                              child: Container(
                                                width: 110,
                                                height: 110,
                                                padding: const EdgeInsets.all(8),
                                                decoration: BoxDecoration(
                                                  color: const Color(0x1F5865F2),
                                                  borderRadius: BorderRadius.circular(12),
                                                ),
                                                child: Builder(builder: (_) {
                                                  final rawUrl = (m.metadata?['url'] as String?) ?? m.text;
                                                  final isHttp = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
                                                  if (!isHttp) {
                                                    return Center(
                                                      child: Column(
                                                        mainAxisSize: MainAxisSize.min,
                                                        children: [
                                                          const Icon(Icons.sticky_note_2_rounded, color: Color(0xFF5865F2), size: 36),
                                                          const SizedBox(height: 4),
                                                          Text(
                                                            (m.metadata?['name'] as String?) ?? m.text,
                                                            style: const TextStyle(fontSize: 10, color: Colors.white70),
                                                            maxLines: 1,
                                                            overflow: TextOverflow.ellipsis,
                                                          ),
                                                        ],
                                                      ),
                                                    );
                                                  }
                                                  return Image.network(
                                                    rawUrl,
                                                    fit: BoxFit.contain,
                                                    errorBuilder: (_, __, ___) => const Center(
                                                      child: Icon(Icons.broken_image, color: Colors.grey),
                                                    ),
                                                  );
                                                }),
                                              ),
                                            ),
                                          )
                                        else
                                          Builder(builder: (_) {
                                            final emojiType = getEmojiOnlyType(m.text);
                                            final double fontSize = emojiType == EmojiOnlyType.single
                                                ? 44.0
                                                : emojiType == EmojiOnlyType.multiple
                                                    ? 28.0
                                                    : 14.5;
                                            final double height = emojiType == EmojiOnlyType.single
                                                ? 1.15
                                                : emojiType == EmojiOnlyType.multiple
                                                    ? 1.25
                                                    : 1.38;
                                            return Padding(
                                              padding: EdgeInsets.symmetric(
                                                vertical: emojiType == EmojiOnlyType.single
                                                    ? 4.0
                                                    : (emojiType == EmojiOnlyType.multiple ? 2.0 : 0.0),
                                              ),
                                              child: RichText(
                                                text: TextSpan(
                                                  style: TextStyle(
                                                    fontSize: fontSize,
                                                    height: height,
                                                    letterSpacing: emojiType == EmojiOnlyType.multiple ? 2.0 : null,
                                                    color: const Color(0xFFE3E5E8),
                                                  ),
                                                  children: [
                                                    TextSpan(text: m.text),
                                                    if (m.editedAt != null)
                                                      const TextSpan(
                                                        text: '  (edited)',
                                                        style: TextStyle(fontSize: 10.5, color: Color(0xFF9097A3), letterSpacing: 0),
                                                      ),
                                                  ],
                                                ),
                                              ),
                                            );
                                          }),
                                        if (m.reactions.isNotEmpty) ...[
                                          const SizedBox(height: 5),
                                          Wrap(
                                            spacing: 5,
                                            runSpacing: 4,
                                            children: m.reactions.entries.map((e) {
                                              final mine = e.value.contains(_me!.id);
                                              return InkWell(
                                                borderRadius: BorderRadius.circular(8),
                                                onTap: () async {
                                                  HapticFeedback.selectionClick();
                                                  await _api.reactMessage(_targetKey, m.id, e.key);
                                                  await _loadMessages();
                                                },
                                                child: Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                                  decoration: BoxDecoration(
                                                    color: mine ? const Color(0x385865F2) : const Color(0xFF22242A),
                                                    borderRadius: BorderRadius.circular(8),
                                                    border: Border.all(
                                                      color: mine ? const Color(0xFF5865F2) : Colors.white.withValues(alpha: 0.08),
                                                    ),
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
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              if (_showScrollToBottom)
                Positioned(
                  bottom: 10,
                  right: 14,
                  child: Material(
                    color: const Color(0xEE18191F),
                    shape: StadiumBorder(side: BorderSide(color: const Color(0xFF5865F2).withValues(alpha: 0.65))),
                    elevation: 6,
                    child: InkWell(
                      customBorder: const StadiumBorder(),
                      onTap: () {
                        if (_chatScroll.hasClients) {
                          _chatScroll.animateTo(
                            _chatScroll.position.maxScrollExtent,
                            duration: const Duration(milliseconds: 260),
                            curve: Curves.easeOutCubic,
                          );
                        }
                      },
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.arrow_downward_rounded, size: 15, color: Color(0xFF8EA1FF)),
                            SizedBox(width: 5),
                            Text('Latest', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (_directCall != null) _buildDirectCallBanner(_directCall!),
        QuickChatStripWidget(
          onSendQuickChat: (preset, {zone}) {
            final txt = zone != null ? '${preset.text} [$zone]' : preset.text;
            _sendText(txt, type: 'quickchat', metadata: {'badge': 'QUICK CHAT', 'category': preset.category});
          },
        ),
        if (_replyTo != null)
          Container(
            margin: const EdgeInsets.fromLTRB(8, 2, 8, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: const BoxDecoration(
              color: Color(0xFF1D1F25),
              borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
              border: Border(left: BorderSide(color: Color(0xFF5865F2), width: 3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.reply_rounded, size: 15, color: Color(0xFF5865F2)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Replying to ${_users[_replyTo!.senderId]?.displayName ?? _replyTo!.senderId}: ${_replyTo!.text}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: Color(0xFFBEC3CC)),
                  ),
                ),
                InkWell(
                  onTap: () => setState(() => _replyTo = null),
                  child: const Padding(
                    padding: EdgeInsets.all(2),
                    child: Icon(Icons.close_rounded, size: 16, color: Color(0xFF9097A3)),
                  ),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF343741),
                  padding: const EdgeInsets.all(9),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.emoji_emotions_outlined, color: Color(0xFFBEC3CC), size: 22),
                tooltip: 'Emojis, GIFs & Stickers',
                onPressed: _openMediaPicker,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: _msgCtrl,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  decoration: InputDecoration(
                    hintText: _homeMode ? 'Message @${_users[_activeDmUserId]?.displayName ?? "user"}' : 'Message #${ch?.name ?? "channel"}',
                    hintStyle: const TextStyle(color: Color(0xFF9097A3), fontSize: 14),
                    filled: true,
                    fillColor: const Color(0xFF343741),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                  ),
                  onSubmitted: (v) {
                    if (v.trim().isEmpty) return;
                    _msgCtrl.clear();
                    _sendText(v);
                  },
                ),
              ),
              const SizedBox(width: 6),
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                decoration: BoxDecoration(
                  color: _hasComposerText ? const Color(0xFF5865F2) : const Color(0xFF343741),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: _hasComposerText
                      ? const [BoxShadow(color: Color(0x555865F2), blurRadius: 10, offset: Offset(0, 3))]
                      : null,
                ),
                child: IconButton(
                  onPressed: _hasComposerText
                      ? () {
                          HapticFeedback.lightImpact();
                          final v = _msgCtrl.text;
                          _msgCtrl.clear();
                          _sendText(v);
                        }
                      : null,
                  icon: Icon(
                    Icons.send_rounded,
                    color: _hasComposerText ? Colors.white : const Color(0xFF6D727E),
                    size: 19,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildArenaOnboardingCard({
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool highlight = false,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: highlight ? const Color(0x1E5865F2) : const Color(0xFF22242A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: highlight ? const Color(0x665865F2) : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 3),
                  Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF9097A3))),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFF9097A3)),
          ],
        ),
      ),
    );
  }

  void _openMediaPicker() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF2B2D31),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return FractionallySizedBox(
          heightFactor: 0.70,
          child: MediaPickerSheet(
            onSelectEmoji: (emoji) {
              if (Navigator.of(ctx).canPop()) {
                Navigator.of(ctx).pop();
              }
              setState(() {
                _msgCtrl.text = '${_msgCtrl.text}$emoji';
                _msgCtrl.selection = TextSelection.fromPosition(
                  TextPosition(offset: _msgCtrl.text.length),
                );
              });
            },
            onSelectGif: (gif) {
              if (Navigator.of(ctx).canPop()) {
                Navigator.of(ctx).pop();
              }
              _sendText(
                gif.url,
                type: 'gif',
                metadata: {
                  'title': gif.title,
                  'url': gif.url,
                },
              );
            },
            onSelectSticker: (sticker) {
              if (Navigator.of(ctx).canPop()) {
                Navigator.of(ctx).pop();
              }
              _sendText(
                sticker.url,
                type: 'sticker',
                metadata: {
                  'name': sticker.name,
                  'url': sticker.url,
                  'pack': sticker.pack,
                },
              );
            },
          ),
        );
      },
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
              padding: const EdgeInsets.fromLTRB(10, 14, 10, 10),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: Row(
                  children: [
                    '🔥', '❤️', '⚡', '👑', '👍', '😂', '🎉', '💀',
                    '👀', '💯', '👏', '✨', '💎', '🏆', '🎮', '⚔️',
                    '🥺', '😭', '😎', '🥳', '🙌', '💪', '🚀', '🎯'
                  ].map((em) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () async {
                          Navigator.pop(ctx);
                          await _api.reactMessage(_targetKey, m.id, em);
                          await _loadMessages();
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(4.0),
                          child: Text(em, style: const TextStyle(fontSize: 25)),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            const Divider(color: Color(0xFF383A40), height: 1),
            ListTile(
              leading: const Icon(Icons.reply_rounded),
              title: const Text('Reply'),
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyTo = ReplyRef(id: m.id, senderId: m.senderId, text: m.text));
              },
            ),
            ListTile(
              leading: const Icon(Icons.copy_rounded),
              title: const Text('Copy Text'),
              onTap: () {
                Navigator.pop(ctx);
                Clipboard.setData(ClipboardData(text: m.text));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Message copied to clipboard! 📋')),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.share_rounded),
              title: const Text('Share Message'),
              onTap: () {
                Navigator.pop(ctx);
                Share.share(m.text);
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
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Message pinned to channel! 📌')),
                    );
                  }
                },
              ),
            if (m.senderId == _me!.id && m.type == 'text')
              ListTile(
                leading: const Icon(Icons.edit_rounded, color: Color(0xFF8EA1FF)),
                title: const Text('Edit Message'),
                onTap: () {
                  Navigator.pop(ctx);
                  _showEditMessageDialog(m);
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

  void _showEditMessageDialog(ChatMessage m) {
    final editCtrl = TextEditingController(text: m.text);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF22242A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Edit Message', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold)),
        content: TextField(
          controller: editCtrl,
          autofocus: true,
          maxLines: 4,
          minLines: 1,
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFF16171B),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF9097A3))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2), foregroundColor: Colors.white),
            onPressed: () async {
              final next = editCtrl.text.trim();
              Navigator.pop(ctx);
              if (next.isEmpty || next == m.text) return;
              await _api.editMessage(_targetKey, m.id, next);
              await _loadMessages();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showPinnedMessagesSheet(BuildContext context, NexcordServer srv, NexcordChannel ch) {
    final pins = srv.pins[ch.id] ?? const <Map<String, dynamic>>[];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF22242A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  const Icon(Icons.push_pin_rounded, color: Color(0xFFFEE75C), size: 19),
                  const SizedBox(width: 8),
                  Text(
                    'Pinned Messages (${pins.length})',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (pins.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 28),
                  child: Center(
                    child: Text(
                      'No pinned messages yet.\nLong-press any message in this channel to pin it.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF9097A3), fontSize: 13),
                    ),
                  ),
                )
              else
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.5),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: pins.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, idx) {
                      final p = pins[idx];
                      final sid = p['senderId']?.toString() ?? '';
                      final pu = _users[sid];
                      final ts = (p['createdAt'] as num?)?.toInt() ?? 0;
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF16171B),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 11,
                                  backgroundColor: pu?.color ?? const Color(0xFF5865F2),
                                  child: Text(
                                    (pu?.displayName ?? (sid.isNotEmpty ? sid : 'U'))[0].toUpperCase(),
                                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    pu?.displayName ?? sid,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
                                  ),
                                ),
                                if (ts > 0)
                                  Text(formatChatTime(ts), style: const TextStyle(fontSize: 11, color: Color(0xFF9097A3))),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              p['text']?.toString() ?? '',
                              style: const TextStyle(fontSize: 13.5, color: Color(0xFFDBDEE1)),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showShareServerSheet(BuildContext context, NexcordServer srv) {
    final inviteLink = 'https://nexcord-a85i.onrender.com/#/server/${srv.id}';
    final inviteCode = srv.inviteCode.isNotEmpty ? srv.inviteCode : srv.id;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF2B2D31),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final sentMap = <String, bool>{};
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 20,
                  right: 20,
                  top: 14,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: hexToColor(srv.iconColor),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            srv.name.split(' ').map((w) => w.isEmpty ? '' : w[0]).take(2).join().toUpperCase(),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.white),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                srv.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${srv.members.length} members • ${srv.channels.length} channels',
                                style: const TextStyle(fontSize: 12, color: Color(0xFF949BA4)),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Color(0xFF949BA4)),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        icon: const Icon(Icons.share_rounded, size: 20),
                        label: const Text('Share Server (WhatsApp, Telegram...)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF5865F2),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: () {
                          Share.share(
                            '🚀 Join my server "${srv.name}" on Nexcord!\n\n'
                            '🔗 Server Link: $inviteLink\n'
                            '🆔 Server ID: ${srv.id}\n'
                            '🔑 Invite Code: $inviteCode',
                            subject: 'Join ${srv.name} on Nexcord',
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('SERVER INVITE LINK', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1F22),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              inviteLink,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: Color(0xFF00A8FC)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF5865F2),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: inviteLink));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Server invite link copied! 📋')),
                              );
                            },
                            child: const Text('Copy Link', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E1F22),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('SERVER ID', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                      const SizedBox(height: 2),
                                      Text(srv.id, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.copy_rounded, size: 18, color: Color(0xFF5865F2)),
                                  tooltip: 'Copy Server ID',
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                  onPressed: () {
                                    Clipboard.setData(ClipboardData(text: srv.id));
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Server ID "${srv.id}" copied! 📋')),
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E1F22),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('INVITE CODE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                      const SizedBox(height: 2),
                                      Text(inviteCode, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF57F287))),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.copy_rounded, size: 18, color: Color(0xFF57F287)),
                                  tooltip: 'Copy Invite Code',
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                  onPressed: () {
                                    Clipboard.setData(ClipboardData(text: inviteCode));
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Invite Code "$inviteCode" copied! 📋')),
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (_friends.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      const Text('INVITE FRIENDS DIRECTLY', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
                      const SizedBox(height: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 160),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: _friends.length,
                          separatorBuilder: (_, __) => const Divider(height: 1, color: Colors.white10),
                          itemBuilder: (c, idx) {
                            final fid = _friends[idx];
                            final fu = _users[fid];
                            final alreadySent = sentMap[fid] == true;
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                radius: 15,
                                backgroundColor: fu?.color ?? const Color(0xFF5865F2),
                                child: Text((fu?.displayName ?? fid)[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                              ),
                              title: Text(fu?.displayName ?? fid, style: const TextStyle(fontSize: 13.5, color: Colors.white, fontWeight: FontWeight.w600)),
                              subtitle: Text(fu?.status ?? 'offline', style: TextStyle(fontSize: 11, color: fu?.status == 'online' ? const Color(0xFF57F287) : const Color(0xFF949BA4))),
                              trailing: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: alreadySent ? const Color(0xFF23A55A) : const Color(0xFF5865F2),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  minimumSize: Size.zero,
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                ),
                                onPressed: alreadySent
                                    ? null
                                    : () async {
                                        setModalState(() => sentMap[fid] = true);
                                        try {
                                          await _api.postMessage(
                                            fid,
                                            text: 'Hey! Join my server "${srv.name}" on Nexcord: $inviteLink (Server ID: ${srv.id})',
                                          );
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(content: Text('Invite sent to ${fu?.displayName ?? fid}! ✉️')),
                                          );
                                        } catch (e) {
                                          setModalState(() => sentMap[fid] = false);
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(content: Text('Failed to send: $e')),
                                          );
                                        }
                                      },
                                child: Text(alreadySent ? 'Sent ✓' : 'Invite', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold)),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showServerSettingsSheet(BuildContext context, NexcordServer srv) {
    final nameCtrl = TextEditingController(text: srv.name);
    final descCtrl = TextEditingController(text: srv.description);
    final iconUrlCtrl = TextEditingController(text: srv.iconUrl);
    final bannerUrlCtrl = TextEditingController(text: srv.bannerUrl);
    String selectedColor = srv.iconColor.isNotEmpty ? srv.iconColor : '#5865F2';
    int currentTab = 0; // 0 = Overview, 1 = Members & Roles
    bool saving = false;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF2B2D31),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final isOwner = srv.ownerId == _me!.id;
            final canPromote = isOwner || (srv.myPermissions?.canPromote == true);

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 20,
                  right: 20,
                  top: 14,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(ctx).size.height * 0.82,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.white24,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          const Icon(Icons.settings_rounded, color: Color(0xFF5865F2), size: 22),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '${srv.name} — Settings',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close_rounded, color: Color(0xFF949BA4)),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      // Tab Bar
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () => setSheetState(() => currentTab = 0),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  border: Border(
                                    bottom: BorderSide(
                                      color: currentTab == 0 ? const Color(0xFF5865F2) : Colors.transparent,
                                      width: 2.5,
                                    ),
                                  ),
                                ),
                                child: Text(
                                  'Overview & Profile',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: currentTab == 0 ? Colors.white : const Color(0xFF949BA4),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: InkWell(
                              onTap: () => setSheetState(() => currentTab = 1),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  border: Border(
                                    bottom: BorderSide(
                                      color: currentTab == 1 ? const Color(0xFF5865F2) : Colors.transparent,
                                      width: 2.5,
                                    ),
                                  ),
                                ),
                                child: Text(
                                  'Members & Roles (${srv.members.length})',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: currentTab == 1 ? Colors.white : const Color(0xFF949BA4),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Expanded(
                        child: currentTab == 0
                            ? ListView(
                                children: [
                                  // Live Preview Card
                                  Container(
                                    margin: const EdgeInsets.only(bottom: 16),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1E1F22),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: Colors.white10),
                                    ),
                                    clipBehavior: Clip.antiAlias,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        if (bannerUrlCtrl.text.trim().isNotEmpty)
                                          Image.network(
                                            bannerUrlCtrl.text.trim(),
                                            height: 60,
                                            width: double.infinity,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) => Container(height: 30, color: hexToColor(selectedColor)),
                                          )
                                        else
                                          Container(height: 30, color: hexToColor(selectedColor)),
                                        Padding(
                                          padding: const EdgeInsets.all(12),
                                          child: Row(
                                            children: [
                                              ClipRRect(
                                                borderRadius: BorderRadius.circular(10),
                                                child: iconUrlCtrl.text.trim().isNotEmpty
                                                    ? Image.network(
                                                        iconUrlCtrl.text.trim(),
                                                        width: 44,
                                                        height: 44,
                                                        fit: BoxFit.cover,
                                                        errorBuilder: (_, __, ___) => Container(
                                                          width: 44,
                                                          height: 44,
                                                          color: hexToColor(selectedColor),
                                                          alignment: Alignment.center,
                                                          child: Text(
                                                            (nameCtrl.text.isNotEmpty ? nameCtrl.text[0] : 'S').toUpperCase(),
                                                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                                                          ),
                                                        ),
                                                      )
                                                    : Container(
                                                        width: 44,
                                                        height: 44,
                                                        color: hexToColor(selectedColor),
                                                        alignment: Alignment.center,
                                                        child: Text(
                                                          (nameCtrl.text.isNotEmpty ? nameCtrl.text[0] : 'S').toUpperCase(),
                                                          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                                                        ),
                                                      ),
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      nameCtrl.text.isNotEmpty ? nameCtrl.text : 'Server Name',
                                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.white),
                                                    ),
                                                    if (descCtrl.text.isNotEmpty)
                                                      Text(
                                                        descCtrl.text,
                                                        maxLines: 2,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: const TextStyle(fontSize: 11.5, color: Color(0xFF949BA4)),
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
                                  // Name Field
                                  const Text('SERVER NAME', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: nameCtrl,
                                    onChanged: (_) => setSheetState(() {}),
                                    style: const TextStyle(color: Colors.white, fontSize: 14),
                                    decoration: InputDecoration(
                                      filled: true,
                                      fillColor: const Color(0xFF1E1F22),
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  // Description Field
                                  const Text('SERVER DESCRIPTION', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: descCtrl,
                                    maxLines: 2,
                                    onChanged: (_) => setSheetState(() {}),
                                    style: const TextStyle(color: Colors.white, fontSize: 13),
                                    decoration: InputDecoration(
                                      hintText: 'What is this server about?',
                                      hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                                      filled: true,
                                      fillColor: const Color(0xFF1E1F22),
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  // Icon URL Field
                                  const Text('SERVER ICON URL (IMAGE / PICTURE)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: iconUrlCtrl,
                                    onChanged: (_) => setSheetState(() {}),
                                    style: const TextStyle(color: Colors.white, fontSize: 13),
                                    decoration: InputDecoration(
                                      hintText: 'https://example.com/logo.png',
                                      hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                                      filled: true,
                                      fillColor: const Color(0xFF1E1F22),
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  // Banner URL Field
                                  const Text('SERVER BANNER URL (OPTIONAL)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4))),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: bannerUrlCtrl,
                                    onChanged: (_) => setSheetState(() {}),
                                    style: const TextStyle(color: Colors.white, fontSize: 13),
                                    decoration: InputDecoration(
                                      hintText: 'https://example.com/banner.png',
                                      hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                                      filled: true,
                                      fillColor: const Color(0xFF1E1F22),
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                    ),
                                  ),
                                  const SizedBox(height: 18),
                                  // Save Button
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF5865F2),
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(vertical: 13),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                    ),
                                    onPressed: saving
                                        ? null
                                        : () async {
                                            setSheetState(() => saving = true);
                                            try {
                                              await _api.updateServer(
                                                srv.id,
                                                name: nameCtrl.text.trim(),
                                                description: descCtrl.text.trim(),
                                                iconUrl: iconUrlCtrl.text.trim(),
                                                bannerUrl: bannerUrlCtrl.text.trim(),
                                                iconColor: selectedColor,
                                              );
                                              await _syncNow();
                                              Navigator.pop(ctx);
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                const SnackBar(content: Text('Server settings updated! ✨')),
                                              );
                                            } catch (e) {
                                              setSheetState(() => saving = false);
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(content: Text('Failed to update: $e')),
                                              );
                                            }
                                          },
                                    child: Text(saving ? 'Saving...' : 'Save Changes', style: const TextStyle(fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              )
                            : ListView(
                                children: [
                                  // Role hierarchy banner
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    margin: const EdgeInsets.only(bottom: 12),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1E1F22),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: Colors.white10),
                                    ),
                                    child: Text(
                                      isOwner
                                          ? '👑 You are the Leader. You can promote members to Co-Leader, Elder, or demote them.'
                                          : canPromote
                                              ? '⭐ You are a Co-Leader. You can promote members to Elder or demote to Member.'
                                              : 'Server member hierarchy and permissions.',
                                      style: const TextStyle(fontSize: 12, color: Color(0xFFB5BAC1)),
                                    ),
                                  ),
                                  ...srv.members.map((m) {
                                    final u = m.userId == _me!.id ? _me! : _users[m.userId];
                                    final uName = u?.displayName ?? m.userId;
                                    final isOwnerTarget = m.userId == srv.ownerId;
                                    final isSelf = m.userId == _me!.id;

                                    // Determine role: leader, co-leader, elder, or member
                                    final currentRole = isOwnerTarget
                                        ? 'leader'
                                        : m.roles.contains('co-leader')
                                            ? 'co-leader'
                                            : m.roles.contains('elder')
                                                ? 'elder'
                                                : 'member';

                                    final roleBadge = isOwnerTarget
                                        ? '👑 Leader'
                                        : currentRole == 'co-leader'
                                            ? '⭐ Co-Leader'
                                            : currentRole == 'elder'
                                                ? '🛡️ Elder'
                                                : '👤 Member';

                                    final badgeColor = isOwnerTarget
                                        ? const Color(0xFFFEE75C)
                                        : currentRole == 'co-leader'
                                            ? const Color(0xFFEB459E)
                                            : currentRole == 'elder'
                                                ? const Color(0xFF57F287)
                                                : const Color(0xFF949BA4);

                                    return Container(
                                      margin: const EdgeInsets.only(bottom: 8),
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF1E1F22),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          CircleAvatar(
                                            radius: 16,
                                            backgroundColor: u?.color ?? const Color(0xFF5865F2),
                                            child: Text((uName.isNotEmpty ? uName[0] : 'U').toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(uName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5, color: Colors.white)),
                                                Text(roleBadge, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: badgeColor)),
                                              ],
                                            ),
                                          ),
                                          if (!isOwnerTarget && !isSelf && canPromote)
                                            PopupMenuButton<String>(
                                              tooltip: 'Change Role',
                                              icon: const Icon(Icons.shield_outlined, size: 19, color: Color(0xFF949BA4)),
                                              color: const Color(0xFF2B2D31),
                                              onSelected: (newRole) async {
                                                try {
                                                  await _api.setMemberRole(srv.id, m.userId, newRole);
                                                  await _syncNow();
                                                  setSheetState(() {});
                                                  ScaffoldMessenger.of(context).showSnackBar(
                                                    SnackBar(content: Text('Updated $uName to $newRole! 🛡️')),
                                                  );
                                                } catch (e) {
                                                  ScaffoldMessenger.of(context).showSnackBar(
                                                    SnackBar(content: Text('Failed: $e')),
                                                  );
                                                }
                                              },
                                              itemBuilder: (context) => [
                                                if (isOwner)
                                                  const PopupMenuItem(
                                                    value: 'co-leader',
                                                    child: Text('⭐ Promote to Co-Leader', style: TextStyle(color: Color(0xFFEB459E), fontWeight: FontWeight.bold)),
                                                  ),
                                                const PopupMenuItem(
                                                  value: 'elder',
                                                  child: Text('🛡️ Promote to Elder', style: TextStyle(color: Color(0xFF57F287), fontWeight: FontWeight.bold)),
                                                ),
                                                const PopupMenuItem(
                                                  value: 'member',
                                                  child: Text('👤 Set as Regular Member', style: TextStyle(color: Colors.white70)),
                                                ),
                                              ],
                                            ),
                                        ],
                                      ),
                                    );
                                  }),
                                ],
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showJoinServerDialog(BuildContext context) {
    final codeCtrl = TextEditingController();
    bool joining = false;
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF2B2D31),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.explore_rounded, color: Color(0xFF5865F2), size: 24),
              SizedBox(width: 10),
              Text('Join a Server', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter an invite link, Server ID, or invite code to join a friend\'s server.',
                style: TextStyle(color: Color(0xFFB5BAC1), fontSize: 13),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: codeCtrl,
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'INVITE LINK OR SERVER ID',
                  labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4)),
                  hintText: 'e.g. s_general or NEXCORD',
                  hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                  filled: true,
                  fillColor: const Color(0xFF1E1F22),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF5865F2), width: 1.5)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF949BA4))),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF5865F2),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: joining
                  ? null
                  : () async {
                      final raw = codeCtrl.text.trim();
                      if (raw.isEmpty) return;
                      setDialogState(() => joining = true);
                      try {
                        final joined = await _api.joinInvite(raw);
                        await _syncNow();
                        if (context.mounted) Navigator.pop(ctx);
                        setState(() {
                          _homeMode = false;
                          _activeServerId = joined.id;
                          _section = 'chat';
                          final firstCh = joined.channels.firstOrNull;
                          if (firstCh != null) _selectChannel(joined, firstCh);
                        });
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Joined "${joined.name}"! 🎉')),
                          );
                        }
                      } catch (e) {
                        setDialogState(() => joining = false);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Could not join: $e'), backgroundColor: const Color(0xFFDA373C)),
                          );
                        }
                      }
                    },
              child: joining
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Join Server', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveVoiceBar(NexcordServer? srv) {
    if (_voiceChannelId == null) return const SizedBox.shrink();
    final vChannel = _servers
        .expand((s) => s.channels)
        .where((c) => c.id == _voiceChannelId)
        .firstOrNull;
    final vServer = _servers
        .where((s) => s.id == _voiceServerId)
        .firstOrNull;

    return Container(
      height: 48,
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF23A55A), Color(0xFF1E824C)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(color: Color(0x5523A55A), blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.volume_up_rounded, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: InkWell(
              onTap: () {
                setState(() => _section = 'voice');
              },
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Connected: ${vChannel?.name ?? "Voice Room"}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  Text(
                    vServer?.name ?? 'Voice Channel',
                    style: const TextStyle(color: Colors.white70, fontSize: 10.5),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            icon: Icon(_micMuted ? Icons.mic_off_rounded : Icons.mic_rounded, color: Colors.white, size: 19),
            tooltip: _micMuted ? 'Unmute' : 'Mute',
            onPressed: _toggleVoiceMic,
          ),
          IconButton(
            icon: const Icon(Icons.call_end_rounded, color: Color(0xFFF23F43), size: 19),
            tooltip: 'Disconnect',
            style: IconButton.styleFrom(backgroundColor: Colors.white24),
            onPressed: () async {
              await _leaveVoiceChannel();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildVoiceSection(NexcordServer? currentSrv) {
    if (_voiceChannelId != null) {
      final vServer = _servers.where((s) => s.id == _voiceServerId).firstOrNull ?? currentSrv;
      final vChannel = vServer?.channels.where((c) => c.id == _voiceChannelId).firstOrNull;
      if (vServer != null && vChannel != null) {
        return VoiceHuddleView(
          channelName: vChannel.name,
          callId: _voiceCallId,
          me: _me!,
          users: _users,
          participants: vServer.voiceStates[vChannel.id] ?? [],
          micMuted: _micMuted,
          deafened: _deafened,
          cameraOn: _cameraOn,
          screenSharing: _screenSharing,
          onToggleMic: _toggleVoiceMic,
          onToggleDeafen: _toggleVoiceDeafen,
          onToggleCamera: _toggleVoiceCamera,
          onToggleScreenShare: _toggleScreenShare,
          onHangup: () async {
            await _leaveVoiceChannel();
          },
        );
      }
    }

    final allVoiceChannels = <({NexcordServer server, NexcordChannel channel, List<VoiceParticipant> members})>[];
    for (final s in _servers) {
      for (final c in s.channels) {
        if (c.type == 'voice') {
          allVoiceChannels.add((
            server: s,
            channel: c,
            members: s.voiceStates[c.id] ?? [],
          ));
        }
      }
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF5865F2), Color(0xFF23A55A)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(color: Color(0x445865F2), blurRadius: 12, offset: Offset(0, 4)),
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black26,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.headset_mic_rounded, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Voice Channels & Audio Lounges', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                    SizedBox(height: 3),
                    Text('Join low-latency voice channels with friends across servers.', style: TextStyle(fontSize: 12, color: Colors.white70)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF2B2D31),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.verified_user_rounded, color: Color(0xFF57F287), size: 18),
                  SizedBox(width: 8),
                  Text('DEVICE PERMISSIONS & HARDWARE ACCESS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF5865F2)),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      onPressed: () async {
                        final ok = await _requestMicPermission();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: ok ? const Color(0xFF23A55A) : const Color(0xFFED4245),
                              content: Text(ok ? '✓ Microphone access granted!' : '✗ Microphone access denied'),
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.mic, size: 16, color: Color(0xFF57F287)),
                      label: const Text('Test Mic', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF5865F2)),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      onPressed: () async {
                        final ok = await _requestCameraPermission();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: ok ? const Color(0xFF23A55A) : const Color(0xFFED4245),
                              content: Text(ok ? '✓ Camera access granted!' : '✗ Camera access denied'),
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.videocam, size: 16, color: Color(0xFFFEE75C)),
                      label: const Text('Test Camera', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFF5865F2)),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      onPressed: () async {
                        final ok = await _requestScreenSharePermission();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: ok ? const Color(0xFF23A55A) : const Color(0xFFED4245),
                              content: Text(ok ? '✓ Screen sharing / Media projection ready!' : '✗ Permission required'),
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.screen_share, size: 16, color: Color(0xFF5865F2)),
                      label: const Text('Screen Share', style: TextStyle(fontSize: 11)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('ACTIVE VOICE CHANNELS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
        const SizedBox(height: 10),
        if (allVoiceChannels.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF2B2D31),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: Text('No voice channels found. Create one from the server menu!', style: TextStyle(color: Color(0xFF949BA4))),
            ),
          )
        else
          ...allVoiceChannels.map((item) {
            final isConnectedHere = _voiceChannelId == item.channel.id;
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF2B2D31),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isConnectedHere ? const Color(0xFF23A55A) : Colors.white10,
                  width: isConnectedHere ? 1.5 : 1,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: hexToColor(item.server.iconColor),
                          child: Text(
                            item.server.name.isNotEmpty ? item.server.name[0].toUpperCase() : 'S',
                            style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(item.server.name, style: const TextStyle(fontSize: 12, color: Color(0xFF949BA4), fontWeight: FontWeight.w600)),
                        const Spacer(),
                        if (isConnectedHere)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0x3323A55A),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('CONNECTED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF23A55A))),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.volume_up_rounded, color: Colors.white, size: 22),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            item.channel.name,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        ),
                        ElevatedButton.icon(
                          icon: Icon(
                            isConnectedHere ? Icons.meeting_room_rounded : Icons.login_rounded,
                            size: 16,
                          ),
                          label: Text(isConnectedHere ? 'Open Stage' : 'Join Voice'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: isConnectedHere ? const Color(0xFF23A55A) : const Color(0xFF5865F2),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          onPressed: () {
                            if (!isConnectedHere) {
                              _selectChannel(item.server, item.channel);
                            }
                            setState(() => _section = 'voice');
                          },
                        ),
                      ],
                    ),
                    if (item.members.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: item.members.map((m) {
                          final mu = _users[m.userId];
                          return Chip(
                            avatar: CircleAvatar(
                              backgroundColor: mu?.color ?? const Color(0xFF5865F2),
                              child: Text(
                                (mu?.displayName ?? m.userId)[0].toUpperCase(),
                                style: const TextStyle(fontSize: 10, color: Colors.white),
                              ),
                            ),
                            label: Text(mu?.displayName ?? m.userId, style: const TextStyle(fontSize: 11)),
                            backgroundColor: const Color(0xFF1E1F22),
                            visualDensity: VisualDensity.compact,
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  Widget _buildUserProfileSettingsScreen() {
    final me = _me;
    if (me == null) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF2B2D31),
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [
              BoxShadow(color: Colors.black26, blurRadius: 10, offset: Offset(0, 4)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 80,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      hexToColor(me.bannerColor, fallback: const Color(0xFF5865F2)),
                      const Color(0xFF2B2D31),
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Transform.translate(
                      offset: const Offset(0, -32),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Stack(
                            children: [
                              CircleAvatar(
                                radius: 36,
                                backgroundColor: const Color(0xFF2B2D31),
                                child: CircleAvatar(
                                  radius: 32,
                                  backgroundColor: me.color,
                                  child: Text(
                                    me.displayName.isNotEmpty ? me.displayName[0].toUpperCase() : 'U',
                                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                                  ),
                                ),
                              ),
                              Positioned(
                                right: 4,
                                bottom: 4,
                                child: Container(
                                  width: 16,
                                  height: 16,
                                  decoration: BoxDecoration(
                                    color: me.status == 'online'
                                        ? const Color(0xFF23A55A)
                                        : me.status == 'idle'
                                            ? const Color(0xFFFEE75C)
                                            : me.status == 'dnd'
                                                ? const Color(0xFFF23F43)
                                                : const Color(0xFF80848E),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: const Color(0xFF2B2D31), width: 3),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const Spacer(),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.edit_rounded, size: 16),
                            label: const Text('Edit Status'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white24),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: _showEditProfileDialog,
                          ),
                        ],
                      ),
                    ),
                    Transform.translate(
                      offset: const Offset(0, -20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            me.displayName,
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                          Text(
                            '@${me.username}',
                            style: const TextStyle(fontSize: 13, color: Color(0xFF949BA4)),
                          ),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E1F22),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                const Text('🎮 ', style: TextStyle(fontSize: 14)),
                                Expanded(
                                  child: Text(
                                    me.customStatus.isNotEmpty ? me.customStatus : 'Playing Nexcord Mobile',
                                    style: const TextStyle(fontSize: 12.5, color: Color(0xFFDBDEE1)),
                                  ),
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
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text('ONLINE STATUS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(color: const Color(0xFF2B2D31), borderRadius: BorderRadius.circular(14)),
          child: Column(
            children: [
              _buildStatusOption('online', 'Online', const Color(0xFF23A55A), me.status == 'online'),
              const Divider(height: 1, indent: 44, color: Colors.white10),
              _buildStatusOption('idle', 'Idle', const Color(0xFFFEE75C), me.status == 'idle'),
              const Divider(height: 1, indent: 44, color: Colors.white10),
              _buildStatusOption('dnd', 'Do Not Disturb', const Color(0xFFF23F43), me.status == 'dnd'),
              const Divider(height: 1, indent: 44, color: Colors.white10),
              _buildStatusOption('offline', 'Invisible', const Color(0xFF80848E), me.status == 'offline'),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('SERVERS & COMMUNITY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(color: const Color(0xFF2B2D31), borderRadius: BorderRadius.circular(14)),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.share_rounded, color: Color(0xFF5865F2)),
                title: const Text('Share Active Server Link & ID'),
                subtitle: Text(_activeServer?.name ?? 'Select a server to share'),
                trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF949BA4)),
                onTap: () {
                  final s = _activeServer;
                  if (s != null) {
                    _showShareServerSheet(context, s);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select a server first!')));
                  }
                },
              ),
              const Divider(height: 1, indent: 56, color: Colors.white10),
              ListTile(
                leading: const Icon(Icons.add_circle_outline_rounded, color: Color(0xFF23A55A)),
                title: const Text('Create New Server'),
                trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF949BA4)),
                onTap: () => _showCreateServerDialog(context),
              ),
              const Divider(height: 1, indent: 56, color: Colors.white10),
              ListTile(
                leading: const Icon(Icons.explore_rounded, color: Color(0xFF00A8FC)),
                title: const Text('Join Server with ID or Link'),
                trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF949BA4)),
                onTap: () => _showJoinServerDialog(context),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('APP & ADVANCED', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF949BA4), letterSpacing: 0.5)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(color: const Color(0xFF2B2D31), borderRadius: BorderRadius.circular(14)),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.cloud_done_rounded, color: Color(0xFF57F287)),
                title: const Text('Server Backend'),
                subtitle: const Text('https://nexcord-a85i.onrender.com'),
                trailing: const Icon(Icons.check_circle, color: Color(0xFF23A55A), size: 18),
              ),
              if (_me?.isAdmin == true) ...[
                const Divider(height: 1, indent: 56, color: Colors.white10),
                ExpansionTile(
                  leading: const Icon(Icons.developer_mode_rounded, color: Color(0xFFE67E22)),
                  title: const Text('Nexconn SDK Developer Tools'),
                  subtitle: const Text('SDK Console & Diagnostics'),
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          ElevatedButton.icon(
                            icon: const Icon(Icons.terminal_rounded),
                            label: const Text('Open SDK Console'),
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E1F22), foregroundColor: Colors.white),
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => Scaffold(
                                    appBar: AppBar(title: const Text('Nexconn SDK Console')),
                                    body: _SdkConsoleView(
                                      config: _config,
                                      sdk: _sdk,
                                      onSaveCredentials: (k, s, h, a) async {
                                        final res = await _api.saveCredentials(appKey: k, appSecret: s, apiHost: h, areaCode: a);
                                        final nextCfg = NexconnConfig.fromJson(res['config'] as Map<String, dynamic>);
                                        setState(() => _config = nextCfg);
                                        return res['error']?.toString();
                                      },
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            icon: const Icon(Icons.logout_rounded, size: 20),
            label: const Text('Log Out of Nexcord', style: TextStyle(fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDA373C),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: const Color(0xFF313338),
                  title: const Text('Log Out', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  content: const Text('Are you sure you want to log out of Nexcord?', style: TextStyle(color: Color(0xFFB5BAC1))),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel', style: TextStyle(color: Color(0xFF949BA4)))),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDA373C), foregroundColor: Colors.white),
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Log Out'),
                    ),
                  ],
                ),
              );
              if (confirm == true) await _logout();
            },
          ),
        ),
        const SizedBox(height: 30),
      ],
    );
  }

  Widget _buildStatusOption(String key, String label, Color color, bool selected) {
    return ListTile(
      leading: Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      title: Text(label, style: TextStyle(fontWeight: selected ? FontWeight.bold : FontWeight.normal, color: Colors.white)),
      trailing: selected ? const Icon(Icons.check_rounded, color: Color(0xFF5865F2), size: 20) : null,
      onTap: () async {
        try {
          await _api.updateMe({'status': key});
          await _syncNow();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      },
    );
  }

  void _showEditProfileDialog() {
    final me = _me;
    if (me == null) return;
    final statusCtrl = TextEditingController(text: me.customStatus);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF2B2D31),
        title: const Text('Set Custom Status', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: statusCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'What\'s on your mind? (e.g. In a match 🎯)',
            hintStyle: TextStyle(color: Colors.white38),
            filled: true,
            fillColor: Color(0xFF1E1F22),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2), foregroundColor: Colors.white),
            onPressed: () async {
              Navigator.pop(ctx);
              await _api.updateMe({'customStatus': statusCtrl.text.trim()});
              await _syncNow();
            },
            child: const Text('Save'),
          ),
        ],
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
  // Mode: 'otp' | 'pass'
  String _mode = 'otp';

  // OTP State
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _otpNameCtrl = TextEditingController();
  bool _otpSent = false;
  int _cooldown = 0;
  Timer? _cooldownTimer;

  // Password / Demo State
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _demoCtrl = TextEditingController();
  bool _isRegister = false;
  bool _obscurePass = true;

  // Server URL
  late final TextEditingController _urlCtrl = TextEditingController(text: widget.api.baseUrl);
  bool _showUrlConfig = false;

  bool _busy = false;
  String _err = '';
  String _info = '';

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _cooldown = 30;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_cooldown > 0) {
          _cooldown--;
        } else {
          timer.cancel();
        }
      });
    });
  }

  String _countryCode = '+91';
  String _otpChannel = 'sms';
  String? _devOtp;
  String? _firebaseVerificationId;
  bool _usedFirebase = false;

  void _openCountryPicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF2B2D31),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        final list = [
          (code: '+91', name: 'India', flag: '🇮🇳'),
          (code: '+1', name: 'USA / Canada', flag: '🇺🇸'),
          (code: '+44', name: 'United Kingdom', flag: '🇬🇧'),
          (code: '+971', name: 'UAE', flag: '🇦🇪'),
          (code: '+966', name: 'Saudi Arabia', flag: '🇸🇦'),
          (code: '+49', name: 'Germany', flag: '🇩🇪'),
          (code: '+33', name: 'France', flag: '🇫🇷'),
          (code: '+61', name: 'Australia', flag: '🇦🇺'),
          (code: '+65', name: 'Singapore', flag: '🇸🇬'),
          (code: '+81', name: 'Japan', flag: '🇯🇵'),
          (code: '+55', name: 'Brazil', flag: '🇧🇷'),
          (code: '+234', name: 'Nigeria', flag: '🇳🇬'),
          (code: '+92', name: 'Pakistan', flag: '🇵🇰'),
          (code: '+880', name: 'Bangladesh', flag: '🇧🇩'),
          (code: '+977', name: 'Nepal', flag: '🇳🇵'),
          (code: '+60', name: 'Malaysia', flag: '🇲🇾'),
          (code: '+62', name: 'Indonesia', flag: '🇮🇩'),
          (code: '+7', name: 'Russia / KZ', flag: '🇷🇺'),
          (code: '+39', name: 'Italy', flag: '🇮🇹'),
          (code: '+34', name: 'Spain', flag: '🇪🇸'),
        ];
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  'Select Country / Dial Code',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
              const Divider(color: Color(0xFF383A40)),
              Expanded(
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (context, index) {
                    final c = list[index];
                    final isSel = c.code == _countryCode;
                    return ListTile(
                      leading: Text(c.flag, style: const TextStyle(fontSize: 24)),
                      title: Text(c.name, style: const TextStyle(color: Colors.white)),
                      trailing: Text(
                        c.code,
                        style: TextStyle(
                          color: isSel ? const Color(0xFF5865F2) : const Color(0xFF949BA4),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      selected: isSel,
                      selectedTileColor: const Color(0x285865F2),
                      onTap: () {
                        setState(() => _countryCode = c.code);
                        Navigator.pop(ctx);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _cleanPhone() {
    final raw = _phoneCtrl.text.trim().replaceAll(RegExp(r'\D'), '');
    if (raw == '123456789' || raw == '91123456789') return '123456789';
    final prefix = _countryCode.replaceAll(RegExp(r'\D'), '');
    if (raw.startsWith(prefix) && raw.length > prefix.length + 5) {
      return raw;
    }
    return '$prefix$raw';
  }

  Future<void> _sendOtp() async {
    final rawDigits = _phoneCtrl.text.trim().replaceAll(RegExp(r'\D'), '');
    final isAdmin = rawDigits == '123456789' || rawDigits == '91123456789';
    if (!isAdmin) {
      if (_countryCode == '+91') {
        final isRepeating = RegExp(r'^(\d)\1{9}$').hasMatch(rawDigits);
        final isTenDigitIndian = RegExp(r'^[6-9]\d{9}$').hasMatch(rawDigits);
        if (!isTenDigitIndian || isRepeating) {
          setState(() => _err = 'The phone number entered is incorrect. Please check your 10-digit number and try again later.');
          return;
        }
      } else {
        if (rawDigits.length < 7 || rawDigits.length > 15) {
          setState(() => _err = 'The phone number entered is incorrect. Please check the international number (7-15 digits) and try again later.');
          return;
        }
      }
    }
    setState(() {
      _busy = true;
      _err = '';
      _info = '';
    });

    final clean = _cleanPhone();
    final phoneParam = isAdmin ? '123456789' : '+$clean';

    if (!isAdmin) {
      // 1. Try Google Firebase Phone Auth first (10,000 FREE SMS / month, instant delivery)
      try {
        final completer = Completer<bool>();
        await FirebaseAuth.instance.verifyPhoneNumber(
          phoneNumber: phoneParam,
          timeout: const Duration(seconds: 60),
          verificationCompleted: (PhoneAuthCredential credential) async {
            if (credential.smsCode != null) {
              _otpCtrl.text = credential.smsCode!;
            }
            try {
              final userCred = await FirebaseAuth.instance.signInWithCredential(credential);
              final idToken = await userCred.user?.getIdToken();
              if (idToken != null && mounted) {
                await widget.api.setBaseUrl(_urlCtrl.text.trim());
                final res = await widget.api.firebaseLogin(
                  phone: phoneParam,
                  idToken: idToken,
                  displayName: _otpNameCtrl.text.trim().isEmpty ? null : _otpNameCtrl.text.trim(),
                );
                await widget.onAuthenticated(res.user, res.nexconnToken);
              }
            } catch (e) {
              debugPrint('Android SMS auto-retrieval sign in: $e');
            }
          },
          verificationFailed: (FirebaseAuthException e) {
            debugPrint('Firebase verification failed: ${e.message}');
            if (!completer.isCompleted) completer.complete(false);
          },
          codeSent: (String verificationId, int? resendToken) {
            _firebaseVerificationId = verificationId;
            _usedFirebase = true;
            if (!completer.isCompleted) completer.complete(true);
          },
          codeAutoRetrievalTimeout: (String verificationId) {
            _firebaseVerificationId = verificationId;
          },
        );

        final ok = await completer.future.timeout(const Duration(seconds: 15), onTimeout: () => false);
        if (ok) {
          if (mounted) {
            setState(() {
              _otpSent = true;
              _info = 'Verification code sent via Google SMS to $phoneParam';
            });
            _startCooldown();
          }
          return;
        }
      } catch (fbErr) {
        debugPrint('Firebase phone auth initiation warning: $fbErr, falling back to Carrier SMS');
      }
    }

    // Fallback Carrier SMS Gateway (dispatches real SMS directly to mobile carrier)
    try {
      await widget.api.setBaseUrl(_urlCtrl.text.trim());
      final res = await widget.api.sendOtp(phoneParam, channel: _otpChannel);
      _usedFirebase = false;
      setState(() {
        _otpSent = true;
        _info = res['message']?.toString() ?? 'Verification code sent to $phoneParam';
        if (isAdmin) {
          _otpCtrl.text = '123456';
        }
        if (res['devOtp'] != null) {
          _devOtp = res['devOtp'].toString();
        }
      });
      _startCooldown();
    } catch (e) {
      setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyOtp() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length < 4) {
      setState(() => _err = 'Please enter the 6-digit verification code');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.api.setBaseUrl(_urlCtrl.text.trim());
      final clean = _cleanPhone();
      final phoneParam = clean == '123456789' ? '123456789' : '+$clean';

      if (_usedFirebase && _firebaseVerificationId != null) {
        try {
          final credential = PhoneAuthProvider.credential(
            verificationId: _firebaseVerificationId!,
            smsCode: otp,
          );
          final userCred = await FirebaseAuth.instance.signInWithCredential(credential);
          final idToken = await userCred.user?.getIdToken();
          if (idToken != null) {
            final res = await widget.api.firebaseLogin(
              phone: phoneParam,
              idToken: idToken,
              displayName: _otpNameCtrl.text.trim().isEmpty ? null : _otpNameCtrl.text.trim(),
            );
            await widget.onAuthenticated(res.user, res.nexconnToken);
            return;
          }
        } catch (fbErr) {
          debugPrint('Firebase sign in error: $fbErr, trying server fallback');
        }
      }

      final res = await widget.api.verifyOtp(
        phone: phoneParam,
        otp: otp,
        displayName: _otpNameCtrl.text.trim().isEmpty ? null : _otpNameCtrl.text.trim(),
      );
      await widget.onAuthenticated(res.user, res.nexconnToken);
    } catch (e) {
      setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _demo() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.api.setBaseUrl(_urlCtrl.text.trim());
      final res = await widget.api.demoLogin(_demoCtrl.text.trim().isEmpty ? null : _demoCtrl.text.trim());
      await widget.onAuthenticated(res.user, res.nexconnToken);
    } catch (e) {
      setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitPassword() async {
    final user = _userCtrl.text.trim();
    final pass = _passCtrl.text;
    if (user.isEmpty || pass.isEmpty) {
      setState(() => _err = 'Please fill in all fields');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.api.setBaseUrl(_urlCtrl.text.trim());
      final res = _isRegister
          ? await widget.api.register(user, pass, user)
          : await widget.api.login(user, pass);
      await widget.onAuthenticated(res.user, res.nexconnToken);
    } catch (e) {
      setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0E1017),
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(-0.5, -0.6),
            radius: 1.2,
            colors: [Color(0xFF232956), Color(0xFF0E1017)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 440),
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: const Color(0xFF22242A),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black54,
                      blurRadius: 28,
                      offset: Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Logo & Brand Header
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Color(0xFF5865F2), Color(0xFF7C3AED)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x665865F2),
                                blurRadius: 12,
                                offset: Offset(0, 4),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: Image.asset(
                              'assets/nexconn_logo.png',
                              width: 48,
                              height: 48,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(Icons.sports_esports_rounded, color: Colors.white, size: 26),
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Nexcord',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                  color: Colors.white,
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Gaming, Squad Chat & Live Streams',
                                style: TextStyle(fontSize: 12, color: Color(0xFF9097A3)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // 1-Click Instant Guest Entry Strip (always accessible upfront!)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0x1F23A55A), Color(0x145865F2)],
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0x5557F287)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.bolt_rounded, color: Color(0xFF57F287), size: 17),
                                  SizedBox(width: 4),
                                  Text(
                                    'INSTANT GUEST ACCESS',
                                    style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF57F287), fontSize: 11.5, letterSpacing: 0.4),
                                  ),
                                ],
                              ),
                              Text('No signup needed', style: TextStyle(fontSize: 11, color: Color(0xFF9097A3))),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _demoCtrl,
                                  style: const TextStyle(color: Colors.white, fontSize: 13.5),
                                  onSubmitted: (_) => _demo(),
                                  decoration: InputDecoration(
                                    hintText: 'Gamer tag (optional)',
                                    hintStyle: const TextStyle(color: Color(0xFF6D6F78)),
                                    isDense: true,
                                    filled: true,
                                    fillColor: const Color(0xFF16171B),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                      borderSide: const BorderSide(color: Color(0xFF343741)),
                                    ),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                      borderSide: const BorderSide(color: Color(0xFF343741)),
                                    ),
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF23A55A),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                                ),
                                onPressed: _busy ? null : _demo,
                                icon: const Icon(Icons.flash_on_rounded, size: 16),
                                label: const Text('Enter Arena', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Mode Switcher Tabs
                    Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF16171B),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      padding: const EdgeInsets.all(4),
                      child: Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _mode = 'otp';
                                _err = '';
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                decoration: BoxDecoration(
                                  color: _mode == 'otp' ? const Color(0xFF5865F2) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.phone_android_rounded,
                                      size: 16,
                                      color: _mode == 'otp' ? Colors.white : const Color(0xFF9097A3),
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: FittedBox(
                                        fit: BoxFit.scaleDown,
                                        child: Text(
                                          'Mobile OTP',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13,
                                            color: _mode == 'otp' ? Colors.white : const Color(0xFF9097A3),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _mode = 'pass';
                                _err = '';
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                decoration: BoxDecoration(
                                  color: _mode == 'pass' ? const Color(0xFF5865F2) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.key_rounded,
                                      size: 16,
                                      color: _mode == 'pass' ? Colors.white : const Color(0xFF9097A3),
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: FittedBox(
                                        fit: BoxFit.scaleDown,
                                        child: Text(
                                          'Account Login',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13,
                                            color: _mode == 'pass' ? Colors.white : const Color(0xFF9097A3),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                  // Error Banner
                  if (_err.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0x22F23F43),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0x66F23F43)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline_rounded, color: Color(0xFFF23F43), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _err,
                              style: const TextStyle(color: Color(0xFFFF9A9C), fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  // Info Banner
                  if (_info.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0x2223A55A),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0x6623A55A)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle_outline_rounded, color: Color(0xFF57F287), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _info,
                              style: const TextStyle(color: Color(0xFF57F287), fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  // Tab 1: Mobile OTP Login
                  if (_mode == 'otp') ...[
                    if (!_otpSent) ...[
                      const Text(
                        'Enter Your Mobile Number',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'A 6-digit verification code will be sent to your phone.',
                        style: TextStyle(fontSize: 12.5, color: Color(0xFF949BA4)),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          InkWell(
                            onTap: _openCountryPicker,
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E1F22),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFF383A40)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    _countryCode,
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.arrow_drop_down, color: Color(0xFF949BA4), size: 18),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _phoneCtrl,
                              keyboardType: TextInputType.phone,
                              style: const TextStyle(color: Colors.white, fontSize: 15),
                              decoration: InputDecoration(
                                hintText: _countryCode == '+91' ? '9876543210' : 'Mobile number',
                                hintStyle: const TextStyle(color: Color(0xFF6D6F78)),
                                filled: true,
                                fillColor: const Color(0xFF1E1F22),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: const BorderSide(color: Color(0xFF383A40)),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: const BorderSide(color: Color(0xFF383A40)),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: const BorderSide(color: Color(0xFF5865F2)),
                                ),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF5865F2),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          elevation: 2,
                        ),
                        onPressed: _busy ? null : _sendOtp,
                        child: _busy
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.send_rounded, size: 18),
                                  const SizedBox(width: 8),
                                  const Text(
                                    'Send SMS Verification Code',
                                    style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                      ),
                    ] else ...[
                      // OTP Verification Step
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Enter Verification Code',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                          TextButton(
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            onPressed: () => setState(() {
                              _otpSent = false;
                              _err = '';
                              _info = '';
                            }),
                            child: const Text('Change Number', style: TextStyle(fontSize: 12, color: Color(0xFF5865F2))),
                          ),
                        ],
                      ),
                      Text(
                        'Sent via SMS message to +${_cleanPhone()}',
                        style: const TextStyle(fontSize: 12.5, color: Color(0xFF949BA4)),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _otpCtrl,
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        maxLength: 6,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 12,
                          color: Color(0xFF57F287),
                        ),
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: '••••••',
                          hintStyle: const TextStyle(color: Color(0xFF6D6F78), letterSpacing: 10),
                          filled: true,
                          fillColor: const Color(0xFF1E1F22),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF383A40)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF383A40)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF57F287)),
                          ),
                          contentPadding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                      const SizedBox(height: 10),
                      // Optional Gamer Tag / Display Name
                      TextField(
                        controller: _otpNameCtrl,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        decoration: InputDecoration(
                          labelText: 'Your Gamer Tag (Optional)',
                          labelStyle: const TextStyle(color: Color(0xFF949BA4), fontSize: 13),
                          filled: true,
                          fillColor: const Color(0xFF1E1F22),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF383A40)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF383A40)),
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        ),
                      ),
                      if (_devOtp != null) ...[
                        const SizedBox(height: 8),
                        GestureDetector(
                          onTap: () {
                            _otpCtrl.text = _devOtp!;
                            setState(() {});
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                            decoration: BoxDecoration(
                              color: const Color(0x2857F287),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: const Color(0xFF57F287)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.key_rounded, size: 14, color: Color(0xFF57F287)),
                                const SizedBox(width: 6),
                                Text(
                                  'Tap to fill OTP: $_devOtp',
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF57F287), fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      // Quick Test Auto-fill Button
                      GestureDetector(
                        onTap: () {
                          _otpCtrl.text = '123456';
                          setState(() {});
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                          decoration: BoxDecoration(
                            color: const Color(0x185865F2),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: const Color(0x445865F2)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.bolt_rounded, size: 14, color: Color(0xFF8EA1E1)),
                              SizedBox(width: 4),
                              Text(
                                'Tap to auto-fill test code 123456',
                                style: TextStyle(fontSize: 11.5, color: Color(0xFF8EA1E1), fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF23A55A),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          elevation: 2,
                        ),
                        onPressed: _busy ? null : _verifyOtp,
                        child: _busy
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.check_rounded, size: 18),
                                  SizedBox(width: 8),
                                  Text(
                                    'Verify & Enter Nexcord',
                                    style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          onPressed: _cooldown > 0 || _busy ? null : _sendOtp,
                          child: Text(
                            _cooldown > 0 ? 'Resend code in ${_cooldown}s' : 'Resend SMS Code',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: _cooldown > 0 ? const Color(0xFF6D6F78) : const Color(0xFF5865F2),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ] else ...[
                    // Tab 2: Account Login / Register
                    TextField(
                      controller: _userCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'Username',
                        prefixIcon: const Icon(Icons.person_outline_rounded, size: 18, color: Color(0xFF9097A3)),
                        labelStyle: const TextStyle(color: Color(0xFF949BA4), fontSize: 13),
                        filled: true,
                        fillColor: const Color(0xFF16171B),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF343741)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF343741)),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _passCtrl,
                      obscureText: _obscurePass,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      onSubmitted: (_) => _submitPassword(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18, color: Color(0xFF9097A3)),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePass ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                            size: 18,
                            color: const Color(0xFF9097A3),
                          ),
                          onPressed: () => setState(() => _obscurePass = !_obscurePass),
                        ),
                        labelStyle: const TextStyle(color: Color(0xFF949BA4), fontSize: 13),
                        filled: true,
                        fillColor: const Color(0xFF16171B),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF343741)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF343741)),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF5865F2),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: _busy ? null : _submitPassword,
                      child: Text(
                        _isRegister ? 'Create Squad Account' : 'Log In to Nexcord',
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _isRegister = !_isRegister),
                      child: Text(
                        _isRegister ? 'Already have an account? Log In' : 'Need an account? Register free',
                        style: const TextStyle(color: Color(0xFF5865F2), fontSize: 13),
                      ),
                    ),
                  ],

                  // Server URL Config Collapsible
                  const Divider(color: Color(0xFF383A40), height: 30),
                  GestureDetector(
                    onTap: () => setState(() => _showUrlConfig = !_showUrlConfig),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.cloud_outlined, size: 14, color: Color(0xFF949BA4)),
                        const SizedBox(width: 6),
                        Text(
                          _urlCtrl.text.replaceFirst('https://', '').replaceFirst('http://', ''),
                          style: const TextStyle(fontSize: 12, color: Color(0xFF949BA4)),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          _showUrlConfig ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                          size: 16,
                          color: const Color(0xFF949BA4),
                        ),
                      ],
                    ),
                  ),
                  if (_showUrlConfig) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: _urlCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 12.5),
                      decoration: InputDecoration(
                        labelText: 'Backend Server URL',
                        labelStyle: const TextStyle(color: Color(0xFF949BA4), fontSize: 12),
                        isDense: true,
                        filled: true,
                        fillColor: const Color(0xFF1E1F22),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      ),
                    ),
                  ],
                ],
              ),
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
  final List<String> dms;
  final Map<String, NexcordUser> users;
  final NexcordUser me;
  final ApiService api;
  final Future<void> Function(String userId) onAccept;
  final Future<void> Function(String userId) onDecline;
  final Future<void> Function(String identifier) onAddFriend;
  final Future<void> Function(String userId) onOpenDm;
  final Future<void> Function(String userId, bool video, {String? contactName}) onCallUser;
  final Future<void> Function(String phone, bool video) onCallPhone;

  const _FriendsHub({
    required this.friends,
    required this.incoming,
    required this.dms,
    required this.users,
    required this.me,
    required this.api,
    required this.onAccept,
    required this.onDecline,
    required this.onAddFriend,
    required this.onOpenDm,
    required this.onCallUser,
    required this.onCallPhone,
  });

  @override
  State<_FriendsHub> createState() => _FriendsHubState();
}

class _FriendsHubState extends State<_FriendsHub> with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl = TabController(length: 5, vsync: this);
  final _addCtrl = TextEditingController();
  final _dialPhoneCtrl = TextEditingController();
  final _scanPhonesCtrl = TextEditingController();
  String _feedback = '';
  bool _showAddBar = false;
  bool _dialBusy = false;
  String _dialFeedback = '';
  bool _scanningContacts = false;
  String _contactStatus = '';
  List<ContactMatch> _contactMatches = [];

  @override
  void dispose() {
    _tabCtrl.dispose();
    _addCtrl.dispose();
    _dialPhoneCtrl.dispose();
    _scanPhonesCtrl.dispose();
    super.dispose();
  }

  Future<void> _syncDeviceContacts() async {
    setState(() {
      _scanningContacts = true;
      _contactStatus = '';
    });
    try {
      final entries = await ContactsService.instance.loadDeviceContacts();
      if (entries.isEmpty) {
        if (mounted) {
          setState(() => _contactStatus = 'No phone numbers found in device contacts.');
        }
        return;
      }
      final matches = await widget.api.matchContacts(
        contacts: entries.map((e) => e.toMap()).toList(),
      );
      if (mounted) {
        setState(() {
          _contactMatches = matches;
          _contactStatus =
              'Matched ${matches.length} contact(s) on Nexcord out of ${entries.length} device numbers.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _contactStatus = e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');
        });
      }
    } finally {
      if (mounted) setState(() => _scanningContacts = false);
    }
  }

  Future<void> _scanManualPhones() async {
    final raw = _scanPhonesCtrl.text.trim();
    if (raw.isEmpty) return;
    final nums = raw
        .split(RegExp(r'[\n,;]+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (nums.isEmpty) return;
    setState(() {
      _scanningContacts = true;
      _contactStatus = '';
    });
    try {
      final matches = await widget.api.matchContacts(phoneNumbers: nums);
      if (mounted) {
        setState(() {
          _contactMatches = matches;
          _contactStatus = 'Scanned ${nums.length} number(s): found ${matches.length} user(s) on Nexcord.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _contactStatus = e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');
        });
      }
    } finally {
      if (mounted) setState(() => _scanningContacts = false);
    }
  }

  Widget _buildUserCallRow({
    required String uid,
    required NexcordUser? u,
    required bool isOnline,
    required String subtitle,
  }) {
    final display = u?.displayName ?? uid;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: u?.color ?? const Color(0xFF5865F2),
            child: Text(
              display.isNotEmpty ? display[0].toUpperCase() : 'U',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
          if (isOnline)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: const Color(0xFF23A55A),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF313338), width: 2),
                ),
              ),
            ),
        ],
      ),
      title: Text(display, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
      subtitle: Text(
        subtitle,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 12, color: isOnline ? const Color(0xFF57F287) : const Color(0xFF949BA4)),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.call_rounded, color: Color(0xFF23A55A), size: 20),
            tooltip: 'Voice Call',
            onPressed: () => widget.onCallUser(uid, false),
          ),
          IconButton(
            icon: const Icon(Icons.videocam_rounded, color: Color(0xFF8EA1FF), size: 20),
            tooltip: 'Video Call',
            onPressed: () => widget.onCallUser(uid, true),
          ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF5865F2), size: 20),
            tooltip: 'Message',
            onPressed: () => widget.onOpenDm(uid),
          ),
        ],
      ),
      onTap: () => widget.onOpenDm(uid),
    );
  }

  Widget _buildContactsTab() {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0x221FA855), Color(0x1E5865F2)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0x331FA855),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.perm_phone_msg_rounded, color: Color(0xFF57F287), size: 22),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Call Friends from Phone Contacts',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14.5),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Dial any friend’s phone number or sync your Android contacts for 1-tap voice & video calling across app and web.',
                      style: TextStyle(color: Color(0xFFB5BAC1), fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1D28),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DIRECT PHONE NUMBER CALL',
                style: TextStyle(color: Color(0xFF949BA4), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _dialPhoneCtrl,
                keyboardType: TextInputType.phone,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Enter phone number (e.g. +91 98765 43210)',
                  hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
                  prefixIcon: const Icon(Icons.dialpad_rounded, color: Color(0xFF949BA4), size: 18),
                  filled: true,
                  fillColor: const Color(0xFF10131C),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1FA855),
                        foregroundColor: Colors.white,
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      onPressed: _dialBusy
                          ? null
                          : () async {
                              final phone = _dialPhoneCtrl.text.trim();
                              if (phone.isEmpty) return;
                              setState(() {
                                _dialBusy = true;
                                _dialFeedback = '';
                              });
                              try {
                                await widget.onCallPhone(phone, false);
                                if (mounted) {
                                  setState(() => _dialFeedback = 'Calling $phone...');
                                }
                              } catch (e) {
                                if (mounted) {
                                  setState(() {
                                    _dialFeedback = e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');
                                  });
                                }
                              } finally {
                                if (mounted) setState(() => _dialBusy = false);
                              }
                            },
                      icon: const Icon(Icons.call_rounded, size: 17),
                      label: const Text('Voice Call', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF5865F2),
                        foregroundColor: Colors.white,
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      onPressed: _dialBusy
                          ? null
                          : () async {
                              final phone = _dialPhoneCtrl.text.trim();
                              if (phone.isEmpty) return;
                              setState(() {
                                _dialBusy = true;
                                _dialFeedback = '';
                              });
                              try {
                                await widget.onCallPhone(phone, true);
                                if (mounted) {
                                  setState(() => _dialFeedback = 'Video calling $phone...');
                                }
                              } catch (e) {
                                if (mounted) {
                                  setState(() {
                                    _dialFeedback = e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');
                                  });
                                }
                              } finally {
                                if (mounted) setState(() => _dialBusy = false);
                              }
                            },
                      icon: const Icon(Icons.videocam_rounded, size: 18),
                      label: const Text('Video Call', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
              if (_dialFeedback.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  _dialFeedback,
                  style: TextStyle(
                    fontSize: 12,
                    color: _dialFeedback.startsWith('Calling') || _dialFeedback.startsWith('Video calling')
                        ? const Color(0xFF57F287)
                        : const Color(0xFFFF7B7E),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1D28),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'PHONE CONTACTS SYNC',
                      style: TextStyle(color: Color(0xFF949BA4), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                    ),
                  ),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF5865F2),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    ),
                    onPressed: _scanningContacts ? null : _syncDeviceContacts,
                    icon: _scanningContacts
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.contacts_rounded, size: 15),
                    label: Text(
                      _scanningContacts ? 'Syncing...' : 'Sync Phone Contacts',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _scanPhonesCtrl,
                      keyboardType: TextInputType.text,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'Or paste numbers (comma separated)',
                        hintStyle: const TextStyle(color: Colors.white38, fontSize: 12.5),
                        filled: true,
                        fillColor: const Color(0xFF10131C),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2B2E3B),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: _scanningContacts ? null : _scanManualPhones,
                    child: const Text('Scan', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              if (_contactStatus.isNotEmpty) ...[
                const SizedBox(height: 9),
                Text(_contactStatus, style: const TextStyle(fontSize: 12, color: Color(0xFF57F287))),
              ],
            ],
          ),
        ),
        if (_contactMatches.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(
            'AVAILABLE TO CALL (${_contactMatches.length})',
            style: const TextStyle(color: Color(0xFF949BA4), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5),
          ),
          const SizedBox(height: 6),
          ..._contactMatches.map((m) {
            final u = m.user;
            final showHandle = m.contactName != u.displayName ? ' (@${u.displayName})' : '';
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF161923),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
              ),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                leading: Stack(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: u.color,
                      child: Text(
                        m.contactName.isNotEmpty ? m.contactName[0].toUpperCase() : 'C',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (m.isOnline)
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          width: 11,
                          height: 11,
                          decoration: BoxDecoration(
                            color: const Color(0xFF23A55A),
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFF161923), width: 2),
                          ),
                        ),
                      ),
                  ],
                ),
                title: Text(
                  '${m.contactName}$showHandle',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
                subtitle: Text(
                  m.phone,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Color(0xFF949BA4), fontSize: 11.5),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1FA855),
                        foregroundColor: Colors.white,
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () => widget.onCallUser(u.id, false, contactName: m.contactName),
                      icon: const Icon(Icons.call_rounded, size: 14),
                      label: const Text('Call', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                    IconButton(
                      icon: const Icon(Icons.videocam_rounded, color: Color(0xFF8EA1FF), size: 19),
                      tooltip: 'Video Call',
                      onPressed: () => widget.onCallUser(u.id, true, contactName: m.contactName),
                    ),
                    IconButton(
                      icon: const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF949BA4), size: 18),
                      tooltip: 'Message',
                      onPressed: () => widget.onOpenDm(u.id),
                    ),
                    if (!m.isFriend && !m.hasPendingOutgoing)
                      TextButton(
                        style: TextButton.styleFrom(
                          foregroundColor: const Color(0xFF8EA1FF),
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: () async {
                          try {
                            await widget.api.requestFriendById(u.id);
                            if (mounted) {
                              setState(() {
                                _contactMatches = _contactMatches
                                    .map((x) => x.user.id == u.id
                                        ? ContactMatch(
                                            user: x.user,
                                            contactName: x.contactName,
                                            phone: x.phone,
                                            isFriend: x.isFriend,
                                            hasPendingOutgoing: true,
                                            isOnline: x.isOnline,
                                          )
                                        : x)
                                    .toList();
                                _contactStatus = 'Friend request sent to ${m.contactName}!';
                              });
                            }
                          } catch (e) {
                            if (mounted) {
                              setState(() {
                                _contactStatus = e.toString().replaceFirst(RegExp(r'^(ApiException\(\d+\): |Exception: )'), '');
                              });
                            }
                          }
                        },
                        child: const Text('+ Add', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                  ],
                ),
              ),
            );
          }),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final onlineFriends = widget.friends.where((id) => widget.users[id]?.status == 'online').toList();

    return Column(
      children: [
        Container(
          color: const Color(0xFF1E1F22),
          child: Column(
            children: [
              TabBar(
                controller: _tabCtrl,
                isScrollable: true,
                indicatorColor: const Color(0xFF5865F2),
                labelColor: Colors.white,
                unselectedLabelColor: const Color(0xFF949BA4),
                labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                tabs: [
                  Tab(text: 'DMs (${widget.dms.length})'),
                  Tab(text: 'Online (${onlineFriends.length})'),
                  Tab(text: 'All (${widget.friends.length})'),
                  const Tab(text: 'Contacts'),
                  Tab(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('Pending'),
                        if (widget.incoming.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFFF23F43), borderRadius: BorderRadius.circular(10)),
                            child: Text('${widget.incoming.length}', style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => setState(() => _showAddBar = !_showAddBar),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2B2D31),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.person_add_alt_1_rounded, size: 16, color: Color(0xFF23A55A)),
                              const SizedBox(width: 8),
                              Text(
                                _showAddBar ? 'Close Add Friend' : 'Add Friend by Username or Phone',
                                style: const TextStyle(fontSize: 12.5, color: Color(0xFFDBDEE1), fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (_showAddBar)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _addCtrl,
                          autofocus: true,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                          decoration: InputDecoration(
                            hintText: 'Username (e.g. vex.clutch) or phone (+91...)',
                            hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
                            filled: true,
                            fillColor: const Color(0xFF2B2D31),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF23A55A),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () async {
                          final un = _addCtrl.text.trim();
                          if (un.isEmpty) return;
                          try {
                            await widget.onAddFriend(un);
                            setState(() {
                              _feedback = 'Friend request sent to $un!';
                              _showAddBar = false;
                            });
                            _addCtrl.clear();
                          } catch (e) {
                            setState(() => _feedback = 'Error: $e');
                          }
                        },
                        child: const Text('Send', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
              if (_feedback.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                  child: Text(_feedback, style: const TextStyle(fontSize: 11, color: Color(0xFF57F287))),
                ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              widget.dms.isEmpty
                  ? const Center(
                      child: Text('No direct messages yet. Start chatting with friends!', style: TextStyle(color: Color(0xFF949BA4))),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: widget.dms.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, color: Colors.white10),
                      itemBuilder: (ctx, i) {
                        final uid = widget.dms[i];
                        final u = widget.users[uid];
                        final isOnline = u?.status == 'online';
                        return _buildUserCallRow(
                          uid: uid,
                          u: u,
                          isOnline: isOnline,
                          subtitle: u?.customStatus.isNotEmpty == true
                              ? u!.customStatus
                              : (isOnline ? 'Online' : 'Offline'),
                        );
                      },
                    ),
              onlineFriends.isEmpty
                  ? const Center(
                      child: Text('No friends currently online.', style: TextStyle(color: Color(0xFF949BA4))),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: onlineFriends.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, color: Colors.white10),
                      itemBuilder: (ctx, i) {
                        final uid = onlineFriends[i];
                        final u = widget.users[uid];
                        return _buildUserCallRow(
                          uid: uid,
                          u: u,
                          isOnline: true,
                          subtitle: u?.customStatus.isNotEmpty == true ? u!.customStatus : 'Online',
                        );
                      },
                    ),
              widget.friends.isEmpty
                  ? const Center(
                      child: Text('You haven\'t added any friends yet.', style: TextStyle(color: Color(0xFF949BA4))),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: widget.friends.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, color: Colors.white10),
                      itemBuilder: (ctx, i) {
                        final uid = widget.friends[i];
                        final u = widget.users[uid];
                        final isOnline = u?.status == 'online';
                        return _buildUserCallRow(
                          uid: uid,
                          u: u,
                          isOnline: isOnline,
                          subtitle: u?.customStatus.isNotEmpty == true
                              ? u!.customStatus
                              : (isOnline ? 'Online' : 'Offline'),
                        );
                      },
                    ),
              _buildContactsTab(),
              widget.incoming.isEmpty
                  ? const Center(
                      child: Text('No pending friend requests.', style: TextStyle(color: Color(0xFF949BA4))),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: widget.incoming.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, color: Colors.white10),
                      itemBuilder: (ctx, i) {
                        final uid = widget.incoming[i];
                        final u = widget.users[uid];
                        return ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          leading: CircleAvatar(
                            radius: 20,
                            backgroundColor: u?.color ?? const Color(0xFF5865F2),
                            child: Text((u?.displayName ?? uid)[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                          title: Text(u?.displayName ?? uid, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                          subtitle: const Text('Incoming friend request', style: TextStyle(fontSize: 12, color: Color(0xFF949BA4))),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.check_circle_rounded, color: Color(0xFF23A55A), size: 28),
                                tooltip: 'Accept',
                                onPressed: () => widget.onAccept(uid),
                              ),
                              IconButton(
                                icon: const Icon(Icons.cancel_rounded, color: Color(0xFFF23F43), size: 28),
                                tooltip: 'Decline',
                                onPressed: () => widget.onDecline(uid),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ],
          ),
        ),
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
