import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:ai_nexconn_chat_plugin/ai_nexconn_chat_plugin.dart' as nc;
import 'package:ai_nexconn_chatui_plugin/ai_nexconn_chatui_plugin.dart';
import '../models/models.dart';
import 'api_service.dart';

class NexconnSdkService extends ChangeNotifier {
  final ApiService api;
  final EngineProvider engineProvider;

  String mode = 'idle'; // idle | sandbox | connected
  String statusDetail = 'Not connected';
  bool _sdkInitialized = false;
  String _appKey = '';
  final List<SdkLogEntry> logs = [];

  NexconnSdkService({required this.api, required this.engineProvider});

  void _addLog(String sdk, String action, String detail, {String level = 'info'}) {
    logs.insert(
      0,
      SdkLogEntry(
        timestamp: DateTime.now(),
        sdk: sdk,
        action: action,
        detail: detail,
        level: level,
      ),
    );
    if (logs.length > 80) logs.removeRange(80, logs.length);
    notifyListeners();
  }

  nc.AreaCode _resolveArea(int areaCode) {
    if (areaCode == 3) return nc.AreaCode.na;
    return nc.AreaCode.sg;
  }

  Future<void> initializeAndConnect({
    required String token,
    required NexconnConfig config,
  }) async {
    if (!config.configured || config.appKey.isEmpty || token.startsWith('demo_token_')) {
      mode = 'sandbox';
      statusDetail = 'Hybrid SDK Mode (add Nexconn App Key in SDK tab for live edge)';
      _addLog('system', 'Nexconn.sandbox', 'Running in Hybrid Demo Mode — ready for Nexconn App Key', level: 'info');
      notifyListeners();
      return;
    }

    try {
      final area = _resolveArea(config.areaCode);
      if (!_sdkInitialized || _appKey != config.appKey) {
        _appKey = config.appKey;
        final initParams = nc.InitParams(appKey: config.appKey, areaCode: area);

        await nc.NCEngine.initialize(initParams);
        await engineProvider.initialize(initParams);

        nc.NCEngine.addConnectionStatusHandler('nexcord-flutter-conn', (event) {
          _addLog('chat', 'ConnectionStatus', '${event.status}', level: 'info');
        });

        nc.NCEngine.addMessageHandler(
          'nexcord-flutter-msg',
          nc.MessageHandler(
            onMessageReceived: (event) {
              _addLog('chat', 'onMessageReceived', 'msgId=${event.message.messageId}', level: 'ok');
            },
          ),
        );

        _sdkInitialized = true;
        _addLog('chat', 'NCEngine.initialize + EngineProvider.initialize', 'appKey=${config.appKey}', level: 'ok');
      }

      final completer = Completer<void>();
      final code = await engineProvider.connect(
        nc.ConnectParams(token: token),
        handler: (userId, error) {
          if (error == null || error.isSuccess) {
            mode = 'connected';
            statusDetail = 'Connected to Nexconn Edge as $userId';
            _addLog('chat', 'EngineProvider.connect', 'Connected userId=$userId', level: 'ok');
          } else {
            mode = 'sandbox';
            statusDetail = 'Hybrid Fallback (SDK code ${error.code})';
            _addLog('chat', 'EngineProvider.connect', 'code=${error.code} ${error.message ?? ""}', level: 'warn');
          }
          notifyListeners();
          if (!completer.isCompleted) completer.complete();
        },
      );

      if (code != 0 && !completer.isCompleted) {
        mode = 'sandbox';
        statusDetail = 'Hybrid Fallback (connect returned $code)';
        _addLog('chat', 'EngineProvider.connect', 'Immediate code=$code', level: 'warn');
        notifyListeners();
      } else {
        await completer.future.timeout(const Duration(seconds: 6), onTimeout: () {});
      }
    } catch (e) {
      mode = 'sandbox';
      statusDetail = 'Hybrid Fallback ($e)';
      _addLog('system', 'Nexconn.init.warn', e.toString(), level: 'warn');
      notifyListeners();
    }
  }

  Future<void> enterLiveOpenChannel(String openChannelId) async {
    if (mode != 'connected') {
      _addLog('chat', 'OpenChannel.enterChannel', '$openChannelId (hybrid)', level: 'info');
      return;
    }
    try {
      final ch = nc.OpenChannel(openChannelId);
      await ch.enterChannel(
        nc.EnterOpenChannelParams(messageCount: 20),
        (error) {
          _addLog(
            'chat',
            'OpenChannel.enterChannel',
            '$openChannelId ok=${error?.isSuccess == true}',
            level: error?.isSuccess == true ? 'ok' : 'warn',
          );
        },
      );
    } catch (e) {
      _addLog('chat', 'OpenChannel.enterChannel', e.toString(), level: 'warn');
    }
  }

  Future<ChatMessage> sendMessage({
    required String targetKey,
    required String kind, // community | dm | live
    required String primaryId, // serverId or dmUserId or openChannelId
    String? subChannelId,
    required String text,
    String type = 'text',
    ReplyRef? replyTo,
    Map<String, dynamic>? metadata,
  }) async {
    String sdkMsgId = '';
    if (mode == 'connected') {
      try {
        final msgParams = nc.SendMessageParams(
          messageParams: nc.TextMessageParams(text: text),
        );
        final cb = nc.SendMessageCallback(
          onMessageSent: (code, msg) {
            if (code == 0 && msg != null) {
              sdkMsgId = msg.messageId ?? '';
              _addLog('chat', '$kind.sendMessage', 'msgId=$sdkMsgId', level: 'ok');
            } else {
              _addLog('chat', '$kind.sendMessage', 'code=$code', level: 'warn');
            }
          },
        );
        if (kind == 'dm') {
          await nc.DirectChannel(primaryId).sendMessage(msgParams, callback: cb);
        } else if (kind == 'live') {
          await nc.OpenChannel(primaryId).sendMessage(msgParams, callback: cb);
        } else {
          await nc.CommunitySubChannel(primaryId, subChannelId ?? 'NCDefault').sendMessage(msgParams, callback: cb);
        }
      } catch (e) {
        _addLog('chat', 'sendMessage.warn', e.toString(), level: 'warn');
      }
    } else {
      final cls = kind == 'dm'
          ? 'DirectChannel'
          : kind == 'live'
              ? 'OpenChannel'
              : 'CommunitySubChannel';
      _addLog('chat', '$cls.sendMessage', '${type == 'quickchat' ? '[QuickChat] ' : ''}$text');
    }

    return api.postMessage(
      targetKey,
      text: text,
      type: type,
      replyTo: replyTo,
      metadata: metadata,
      nexconnMessageId: sdkMsgId,
    );
  }

  void logVoiceAction(String action, String detail) {
    _addLog('call', action, detail, level: 'ok');
  }

  Future<void> disconnect() async {
    if (_sdkInitialized) {
      try {
        await engineProvider.disconnect(disablePush: false);
      } catch (_) {}
    }
    mode = 'idle';
    statusDetail = 'Disconnected';
    notifyListeners();
  }
}
