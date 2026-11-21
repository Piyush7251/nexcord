import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

class MediaStreamService extends ChangeNotifier {
  static final MediaStreamService instance = MediaStreamService._();
  MediaStreamService._();

  ApiService? _api;
  String _currentUserId = '';
  String _currentCallId = '';
  String? _liveStagePeerId;

  // Local media streams & renderers (managed via flutter_webrtc so PeerConnections can transmit them)
  MediaStream? _audioStream;
  MediaStream? _cameraStream;
  MediaStream? _screenStream;
  MediaStream? _outboundStream;

  RTCVideoRenderer? _cameraRenderer;
  RTCVideoRenderer? _screenRenderer;

  bool _isFrontCamera = true;
  bool _isCameraActive = false;
  bool _isCameraInitializing = false;
  String? _cameraError;

  bool _isScreenSharing = false;
  bool _isScreenInitializing = false;
  String? _screenShareError;

  bool _isMicMuted = false;
  bool _isDeafened = false;

  // WebRTC PeerConnection Mesh State
  List<Map<String, dynamic>> _iceServers = [
    {'urls': 'stun:stun.l.google.com:19302'},
    {'urls': 'stun:stun1.l.google.com:19302'},
    {'urls': 'stun:stun2.l.google.com:19302'},
    {'urls': 'stun:stun3.l.google.com:19302'},
    {'urls': 'stun:stun4.l.google.com:19302'},
    {'urls': 'stun:stun.cloudflare.com:3478'},
    {'urls': 'stun:global.stun.twilio.com:3478'},
    {
      'urls': [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:5349',
        'turns:openrelay.metered.ca:5349?transport=tcp',
      ],
      'username': 'openrelayproject',
      'credential': 'openrelayproject',
    },
  ];

  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, String> _localSid = {};
  final Map<String, String> _remoteSid = {};
  final Map<String, String> _peerStates = {};
  final Map<String, int> _peerConnectingSince = {};
  final Map<String, int> _lastHelloAt = {};
  final Set<String> _offerInFlight = {};
  final Set<String> _creatingPeer = {};
  final Set<String> _seenSignals = {};
  final Map<String, Future<void>> _signalChains = {};
  final Map<String, List<RTCIceCandidate>> _pendingCandidates = {};
  final Map<String, List<Map<String, dynamic>>> _outgoingCandBatches = {};
  final Map<String, Timer> _outgoingCandTimers = {};

  final Map<String, MediaStream> _remoteStreams = {};
  final Map<String, RTCVideoRenderer> _remoteRenderers = {};
  final Map<String, bool> _remoteHasVideoTrack = {};

  List<String> _activePeerIds = [];
  Timer? _signalPollTimer;
  Timer? _watchdogTimer;
  bool _pollingSignals = false;
  bool _iceConfigFetched = false;

  // Getters for UI
  bool get isCameraActive => _isCameraActive && _cameraStream != null;
  bool get isCameraInitializing => _isCameraInitializing;
  bool get isFrontCamera => _isFrontCamera;
  RTCVideoRenderer? get cameraRenderer => _cameraRenderer;
  String? get cameraError => _cameraError;

  bool get isScreenSharing => _isScreenSharing && _screenStream != null;
  bool get isScreenInitializing => _isScreenInitializing;
  RTCVideoRenderer? get screenRenderer => _screenRenderer;
  String? get screenShareError => _screenShareError;

  bool get isMicMuted => _isMicMuted;
  bool get isDeafened => _isDeafened;
  String get currentCallId => _currentCallId;

  RTCVideoRenderer? getRemoteRenderer(String userId) => _remoteRenderers[userId];

  String getPeerState(String userId) => _peerStates[userId] ?? 'new';

  bool hasRemoteVideo(String userId) {
    final renderer = _remoteRenderers[userId];
    if (renderer != null && (renderer.value.renderVideo || renderer.videoWidth > 0)) {
      return true;
    }
    if (_remoteHasVideoTrack[userId] == true) {
      final tracks = _remoteStreams[userId]?.getVideoTracks() ?? [];
      return tracks.any((t) => t.muted != true);
    }
    return false;
  }

  int connectedPeerCount(Iterable<String> peerIds) {
    int count = 0;
    for (final pid in peerIds) {
      if (pid != _currentUserId && getPeerState(pid) == 'connected') {
        count++;
      }
    }
    return count;
  }

  // ------------------------------------------------------------- Setup & Config
  void configure({required ApiService api, required String currentUserId}) {
    _api = api;
    _currentUserId = currentUserId;
    if (!_iceConfigFetched) {
      _iceConfigFetched = true;
      refreshIceServers();
    }
  }

  Future<void> refreshIceServers() async {
    final api = _api;
    if (api == null) return;
    try {
      final list = await api.getWebRtcIceServers();
      if (list.isNotEmpty) {
        _iceServers = list;
      }
    } catch (_) {}
  }

  // ------------------------------------------------------------- Local Audio
  Future<bool> ensureLocalAudio() async {
    try {
      final micPerm = await Permission.microphone.request();
      if (!micPerm.isGranted) return false;

      if (_audioStream != null && _audioStream!.getAudioTracks().isNotEmpty) {
        _applyMicMuteState();
        return true;
      }

      MediaStream? stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          'audio': {
            'echoCancellation': true,
            'noiseSuppression': true,
            'autoGainControl': true,
          },
          'video': false,
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': false,
        });
      }

      _audioStream = stream;
      _applyMicMuteState();
      try {
        await Helper.setSpeakerphoneOn(!_isDeafened);
      } catch (_) {}
      await syncTracksToPeers(renegotiate: false);
      return true;
    } catch (e) {
      debugPrint('[MediaStreamService] ensureLocalAudio failed: $e');
      return false;
    }
  }

  void setMicMuted(bool muted) {
    _isMicMuted = muted;
    _applyMicMuteState();
    notifyListeners();
  }

  void _applyMicMuteState() {
    if (_audioStream == null) return;
    for (final track in _audioStream!.getAudioTracks()) {
      track.enabled = !_isMicMuted;
    }
  }

  void setDeafened(bool deafened) {
    _isDeafened = deafened;
    for (final stream in _remoteStreams.values) {
      for (final track in stream.getAudioTracks()) {
        track.enabled = !_isDeafened;
      }
    }
    Helper.setSpeakerphoneOn(!_isDeafened).catchError((_) {});
    notifyListeners();
  }

  // ------------------------------------------------------------- Camera Methods
  Future<bool> startCamera({bool front = true}) async {
    if (_isCameraActive && _cameraStream != null) {
      return true;
    }
    _isCameraInitializing = true;
    _cameraError = null;
    notifyListeners();

    try {
      final status = await Permission.camera.request();
      if (!status.isGranted) {
        _cameraError = 'Camera permission was denied. Please grant camera access in settings.';
        _isCameraInitializing = false;
        notifyListeners();
        return false;
      }

      if (_cameraRenderer == null) {
        _cameraRenderer = RTCVideoRenderer();
        await _cameraRenderer!.initialize();
      }

      MediaStream? stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          'audio': false,
          'video': {
            'facingMode': front ? 'user' : 'environment',
            'width': {'ideal': 640},
            'height': {'ideal': 480},
            'frameRate': {'ideal': 24},
          },
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          'audio': false,
          'video': true,
        });
      }

      _cameraStream = stream;
      _cameraRenderer!.srcObject = stream;
      _isFrontCamera = front;
      _isCameraActive = true;
      _isCameraInitializing = false;

      await syncTracksToPeers(renegotiate: true);
      notifyListeners();
      return true;
    } catch (e) {
      _cameraError = 'Camera initialization failed: $e';
      _isCameraActive = false;
      _isCameraInitializing = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> flipCamera() async {
    if (!_isCameraActive || _cameraStream == null) return;
    final videoTracks = _cameraStream!.getVideoTracks();
    if (videoTracks.isEmpty) return;
    _isCameraInitializing = true;
    notifyListeners();

    try {
      await Helper.switchCamera(videoTracks.first);
      _isFrontCamera = !_isFrontCamera;
    } catch (e) {
      _cameraError = 'Flip failed: $e';
    } finally {
      _isCameraInitializing = false;
      notifyListeners();
    }
  }

  Future<void> stopCamera() async {
    if (!_isCameraActive && _cameraStream == null) return;
    final oldStream = _cameraStream;
    _cameraStream = null;
    _isCameraActive = false;
    _isCameraInitializing = false;
    if (_cameraRenderer != null) {
      _cameraRenderer!.srcObject = null;
    }
    notifyListeners();

    // Detach/replace video track on peers before disposing camera tracks
    await syncTracksToPeers(renegotiate: true);
    try {
      oldStream?.getTracks().forEach((t) => t.stop());
      await oldStream?.dispose();
    } catch (_) {}
  }

  // ------------------------------------------------------------- Screen Share
  Future<bool> startScreenShare() async {
    if (_isScreenSharing && _screenStream != null) return true;
    _isScreenInitializing = true;
    _screenShareError = null;
    notifyListeners();

    try {
      if (await Permission.notification.isDenied) {
        await Permission.notification.request();
      }

      if (_screenRenderer == null) {
        _screenRenderer = RTCVideoRenderer();
        await _screenRenderer!.initialize();
      }

      final stream = await navigator.mediaDevices.getDisplayMedia({
        'video': {
          'cursor': 'always',
          'frameRate': 24,
        },
        'audio': false,
      });

      _screenStream = stream;
      _screenRenderer!.srcObject = stream;
      _isScreenSharing = true;
      _isScreenInitializing = false;

      for (final track in stream.getVideoTracks()) {
        track.onEnded = () {
          stopScreenShare();
        };
      }

      await syncTracksToPeers(renegotiate: true);
      notifyListeners();
      return true;
    } catch (e) {
      _screenShareError = 'Screen share cancelled or permission denied: $e';
      _isScreenSharing = false;
      _isScreenInitializing = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> stopScreenShare() async {
    if (!_isScreenSharing && _screenStream == null) return;
    final oldStream = _screenStream;
    _screenStream = null;
    _isScreenSharing = false;
    _isScreenInitializing = false;
    if (_screenRenderer != null) {
      _screenRenderer!.srcObject = null;
    }
    notifyListeners();

    await syncTracksToPeers(renegotiate: true);
    try {
      oldStream?.getTracks().forEach((t) => t.stop());
      await oldStream?.dispose();
    } catch (_) {}
  }

  // ------------------------------------------------------------- WebRTC Voice/Live Lifecycle
  Future<void> startVoiceSession({
    required String callId,
    required List<String> peerIds,
    bool micMuted = false,
    bool deafened = false,
  }) async {
    _currentCallId = callId;
    _isMicMuted = micMuted;
    _isDeafened = deafened;

    await refreshIceServers();
    await ensureLocalAudio();
    _ensureTimers();
    await syncActivePeers(peerIds, callId: callId);
    notifyListeners();
  }

  Future<void> startLiveStageSession({
    required String callId,
    required List<String> peerIds,
  }) async {
    if (callId.isNotEmpty) {
      _currentCallId = callId;
    }
    final isNew = _signalPollTimer == null;
    _ensureTimers();
    if (isNew) {
      await refreshIceServers();
    }
    if (peerIds.isNotEmpty) {
      await syncActivePeers(peerIds, callId: _currentCallId);
    }
  }

  void setLiveStagePeer(String? peerId, {String callId = ''}) {
    _liveStagePeerId = peerId;
    if (peerId != null && peerId.isNotEmpty && peerId != _currentUserId) {
      if (callId.isNotEmpty && _currentCallId.isEmpty) {
        _currentCallId = callId;
      }
      _ensureTimers();
      if (!_activePeerIds.contains(peerId)) {
        _activePeerIds = [..._activePeerIds, peerId];
      }
      connectToPeer(peerId, _currentCallId);
    }
  }

  Future<void> syncActivePeers(List<String> peerIds, {String callId = ''}) async {
    if (callId.isNotEmpty) _currentCallId = callId;
    final filtered = peerIds.where((id) => id.isNotEmpty && id != _currentUserId).toSet();
    if (_liveStagePeerId != null && _liveStagePeerId!.isNotEmpty && _liveStagePeerId != _currentUserId) {
      filtered.add(_liveStagePeerId!);
    }
    _activePeerIds = filtered.toList();

    if (_activePeerIds.isNotEmpty) {
      _ensureTimers();
    }

    // Close peers no longer active
    final currentKeys = _peers.keys.toList();
    for (final existingId in currentKeys) {
      if (!filtered.contains(existingId)) {
        await closePeer(existingId);
      }
    }

    // Ensure connections to all active peers
    for (final pid in _activePeerIds) {
      await connectToPeer(pid, _currentCallId);
    }
  }

  Future<void> stopVoiceSession() async {
    _signalPollTimer?.cancel();
    _signalPollTimer = null;
    _watchdogTimer?.cancel();
    _watchdogTimer = null;
    _activePeerIds = [];
    _liveStagePeerId = null;
    _currentCallId = '';

    for (final t in _outgoingCandTimers.values) {
      t.cancel();
    }
    _outgoingCandTimers.clear();
    _outgoingCandBatches.clear();

    final peerKeys = _peers.keys.toList();
    for (final pid in peerKeys) {
      await closePeer(pid);
    }

    _pendingCandidates.clear();
    _seenSignals.clear();
    _signalChains.clear();
    _offerInFlight.clear();
    _creatingPeer.clear();

    await stopCamera();
    await stopScreenShare();

    final audio = _audioStream;
    _audioStream = null;
    try {
      audio?.getTracks().forEach((t) => t.stop());
      await audio?.dispose();
    } catch (_) {}

    final out = _outboundStream;
    _outboundStream = null;
    try {
      await out?.dispose();
    } catch (_) {}

    notifyListeners();
  }

  void _ensureTimers() {
    _signalPollTimer ??= Timer.periodic(const Duration(milliseconds: 300), (_) {
      _pollSignals();
    });
    _watchdogTimer ??= Timer.periodic(const Duration(milliseconds: 2500), (_) {
      _runWatchdog();
    });
  }

  Future<void> _pollSignals() async {
    if (_pollingSignals) return;
    final api = _api;
    if (api == null || _currentUserId.isEmpty) return;
    _pollingSignals = true;
    try {
      final signals = await api.getWebRtcSignals();
      for (final item in signals) {
        final from = item['from']?.toString() ?? '';
        final rawSig = item['signal'];
        final callId = item['callId']?.toString() ?? '';
        if (from.isNotEmpty && rawSig is Map) {
          handleWebRtcSignal(from, Map<String, dynamic>.from(rawSig), callId);
        }
      }
    } catch (_) {
    } finally {
      _pollingSignals = false;
    }
  }

  void _runWatchdog() {
    if (_currentUserId.isEmpty) return;
    for (final pid in List<String>.from(_activePeerIds)) {
      if (pid == _currentUserId) continue;
      if (getPeerState(pid) != 'connected') {
        connectToPeer(pid, _currentCallId);
      }
    }
  }

  // ------------------------------------------------------------- WebRTC Internals
  String _newSid() {
    final r = math.Random().nextInt(0xFFFFFF).toRadixString(36);
    return '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}_$r';
  }

  bool _isOfferer(String remoteUserId) {
    return _currentUserId.isNotEmpty && _currentUserId.compareTo(remoteUserId) < 0;
  }

  MediaStreamTrack? get _activeAudioTrack {
    final tracks = _audioStream?.getAudioTracks() ?? [];
    return tracks.isNotEmpty ? tracks.first : null;
  }

  MediaStreamTrack? get _activeVideoTrack {
    if (_isScreenSharing && _screenStream != null) {
      final tracks = _screenStream!.getVideoTracks();
      if (tracks.isNotEmpty) return tracks.first;
    }
    if (_isCameraActive && _cameraStream != null) {
      final tracks = _cameraStream!.getVideoTracks();
      if (tracks.isNotEmpty) return tracks.first;
    }
    return null;
  }

  Future<MediaStream> _getOutboundStream() async {
    if (_outboundStream != null) return _outboundStream!;
    _outboundStream = await createLocalMediaStream('nexcord_outbound_${_currentUserId.isEmpty ? 'me' : _currentUserId}');
    return _outboundStream!;
  }

  Future<void> _sendSignal(String toUserId, Map<String, dynamic> signal) async {
    final api = _api;
    if (api == null) return;
    try {
      await api.sendWebRtcSignal(toUserId, signal, _currentCallId);
    } catch (_) {}
  }

  void _queueCandidate(String remoteUserId, RTCIceCandidate candidate, String sid) {
    final candStr = candidate.candidate ?? '';
    if (candStr.isEmpty) return;

    final map = <String, dynamic>{
      'candidate': candStr,
      'sdpMid': candidate.sdpMid,
      'sdpMLineIndex': candidate.sdpMLineIndex,
    };

    final key = '$remoteUserId:$sid';
    final list = _outgoingCandBatches.putIfAbsent(key, () => []);
    list.add(map);

    if (_outgoingCandTimers[key]?.isActive == true) return;
    _outgoingCandTimers[key] = Timer(const Duration(milliseconds: 140), () {
      _outgoingCandTimers.remove(key);
      final batch = _outgoingCandBatches.remove(key);
      if (batch != null && batch.isNotEmpty) {
        _sendSignal(remoteUserId, {
          'type': 'candidates',
          'candidates': batch,
          'sid': sid,
        });
      }
    });
  }

  Future<RTCPeerConnection> _createPeerConnection(String remoteUserId, {required bool asOfferer}) async {
    final old = _peers.remove(remoteUserId);
    if (old != null) {
      try {
        await old.close();
        await old.dispose();
      } catch (_) {}
    }

    final pc = await createPeerConnection({
      'iceServers': _iceServers,
      'sdpSemantics': 'unified-plan',
      'iceCandidatePoolSize': 4,
      'bundlePolicy': 'max-bundle',
    });

    final sid = _newSid();
    _peers[remoteUserId] = pc;
    _localSid[remoteUserId] = sid;
    _peerStates[remoteUserId] = 'connecting';
    _peerConnectingSince[remoteUserId] = DateTime.now().millisecondsSinceEpoch;

    pc.onConnectionState = (RTCPeerConnectionState state) {
      if (_peers[remoteUserId] != pc) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _peerStates[remoteUserId] = 'connected';
        _peerConnectingSince[remoteUserId] = 0;
        Helper.setSpeakerphoneOn(!_isDeafened).catchError((_) {});
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        _peerStates[remoteUserId] = 'disconnected';
        _peerConnectingSince[remoteUserId] = DateTime.now().millisecondsSinceEpoch;
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _peerStates[remoteUserId] = 'failed';
        _peerConnectingSince[remoteUserId] = 0;
        if (_isOfferer(remoteUserId)) {
          _startOffer(remoteUserId, force: true, iceRestart: true);
        } else {
          _sendSignal(remoteUserId, {'type': 'hello', 'rsid': ''});
        }
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        _peerStates[remoteUserId] = 'closed';
      } else {
        _peerStates[remoteUserId] = 'connecting';
      }
      notifyListeners();
    };

    pc.onIceConnectionState = (RTCIceConnectionState state) {
      if (_peers[remoteUserId] != pc) return;
      if (state == RTCIceConnectionState.RTCIceConnectionStateConnected ||
          state == RTCIceConnectionState.RTCIceConnectionStateCompleted) {
        _peerStates[remoteUserId] = 'connected';
        _peerConnectingSince[remoteUserId] = 0;
        Helper.setSpeakerphoneOn(!_isDeafened).catchError((_) {});
      } else if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
        _peerStates[remoteUserId] = 'failed';
        if (_isOfferer(remoteUserId)) {
          _startOffer(remoteUserId, force: true, iceRestart: true);
        } else {
          _sendSignal(remoteUserId, {'type': 'hello', 'rsid': ''});
        }
      }
      notifyListeners();
    };

    pc.onIceCandidate = (RTCIceCandidate candidate) {
      if (_peers[remoteUserId] != pc) return;
      _queueCandidate(remoteUserId, candidate, sid);
    };

    pc.onTrack = (RTCTrackEvent event) async {
      if (_peers[remoteUserId] != pc) return;
      await _handleRemoteTrack(remoteUserId, event);
    };

    pc.onAddStream = (MediaStream stream) async {
      if (_peers[remoteUserId] != pc) return;
      _remoteStreams[remoteUserId] = stream;
      for (final at in stream.getAudioTracks()) {
        at.enabled = !_isDeafened;
      }
      if (stream.getVideoTracks().isNotEmpty) {
        await _attachRemoteVideoRenderer(remoteUserId, stream, stream.getVideoTracks().first);
      }
      notifyListeners();
    };

    if (asOfferer) {
      final outbound = await _getOutboundStream();
      final liveAudio = _activeAudioTrack;
      final liveVideo = _activeVideoTrack;

      final audioTr = await pc.addTransceiver(
        kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
        init: RTCRtpTransceiverInit(
          direction: TransceiverDirection.SendRecv,
          streams: [outbound],
        ),
      );
      if (liveAudio != null) {
        await audioTr.sender.replaceTrack(liveAudio).catchError((_) {});
      }

      final videoTr = await pc.addTransceiver(
        kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
        init: RTCRtpTransceiverInit(
          direction: TransceiverDirection.SendRecv,
          streams: [outbound],
        ),
      );
      if (liveVideo != null) {
        await videoTr.sender.replaceTrack(liveVideo).catchError((_) {});
      }
    }

    return pc;
  }

  Future<void> _handleRemoteTrack(String remoteUserId, RTCTrackEvent event) async {
    final track = event.track;
    MediaStream? stream;
    if (event.streams.isNotEmpty) {
      stream = event.streams.first;
    } else {
      stream = _remoteStreams[remoteUserId] ?? await createLocalMediaStream('remote_$remoteUserId');
      try {
        await stream.addTrack(track);
      } catch (_) {}
    }
    _remoteStreams[remoteUserId] = stream;

    if (track.kind == 'audio') {
      track.enabled = !_isDeafened;
      Helper.setSpeakerphoneOn(!_isDeafened).catchError((_) {});
      track.onUnMute = () {
        track.enabled = !_isDeafened;
        notifyListeners();
      };
    } else if (track.kind == 'video') {
      _remoteHasVideoTrack[remoteUserId] = true;
      await _attachRemoteVideoRenderer(remoteUserId, stream, track);
      track.onUnMute = () {
        _attachRemoteVideoRenderer(remoteUserId, stream!, track);
        notifyListeners();
      };
      track.onMute = () => notifyListeners();
      track.onEnded = () {
        _remoteHasVideoTrack[remoteUserId] = false;
        notifyListeners();
      };
    }
    notifyListeners();
  }

  Future<void> _attachRemoteVideoRenderer(
    String remoteUserId,
    MediaStream stream,
    MediaStreamTrack track,
  ) async {
    var renderer = _remoteRenderers[remoteUserId];
    if (renderer == null) {
      renderer = RTCVideoRenderer();
      await renderer.initialize();
      renderer.onResize = () => notifyListeners();
      renderer.onFirstFrameRendered = () => notifyListeners();
      _remoteRenderers[remoteUserId] = renderer;
    }
    await renderer.setSrcObject(stream: stream, trackId: track.id).catchError((_) {});
    notifyListeners();
  }

  Future<void> _attachLocalTracks(RTCPeerConnection pc) async {
    if (pc.signalingState == RTCSignalingState.RTCSignalingStateClosed) return;
    final outbound = await _getOutboundStream();
    final liveAudio = _activeAudioTrack;
    final liveVideo = _activeVideoTrack;

    bool hasAudio = false;
    bool hasVideo = false;

    final transceivers = await pc.getTransceivers();
    for (final tr in transceivers) {
      if (tr.stoped) continue;
      final kind = tr.receiver.track?.kind ?? tr.sender.track?.kind;
      if (kind == 'audio' && !hasAudio) {
        hasAudio = true;
        await tr.setDirection(TransceiverDirection.SendRecv).catchError((_) {});
        if (tr.sender.track?.id != liveAudio?.id) {
          await tr.sender.replaceTrack(liveAudio).catchError((_) {});
          if (liveAudio != null) {
            await tr.sender.setStreams([outbound]).catchError((_) {});
          }
        }
      } else if (kind == 'video' && !hasVideo) {
        hasVideo = true;
        await tr.setDirection(TransceiverDirection.SendRecv).catchError((_) {});
        if (tr.sender.track?.id != liveVideo?.id) {
          await tr.sender.replaceTrack(liveVideo).catchError((_) {});
          if (liveVideo != null) {
            await tr.sender.setStreams([outbound]).catchError((_) {});
          }
        }
      }
    }

    if (!hasAudio) {
      try {
        final tr = await pc.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
          init: RTCRtpTransceiverInit(
            direction: TransceiverDirection.SendRecv,
            streams: [outbound],
          ),
        );
        if (liveAudio != null) {
          await tr.sender.replaceTrack(liveAudio).catchError((_) {});
        }
      } catch (_) {}
    }
    if (!hasVideo) {
      try {
        final tr = await pc.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          init: RTCRtpTransceiverInit(
            direction: TransceiverDirection.SendRecv,
            streams: [outbound],
          ),
        );
        if (liveVideo != null) {
          await tr.sender.replaceTrack(liveVideo).catchError((_) {});
        }
      } catch (_) {}
    }
  }

  Future<void> syncTracksToPeers({bool renegotiate = true}) async {
    for (final entry in _peers.entries.toList()) {
      final pc = entry.value;
      if (pc.signalingState == RTCSignalingState.RTCSignalingStateClosed) continue;
      await _attachLocalTracks(pc);
      if (renegotiate && pc.signalingState == RTCSignalingState.RTCSignalingStateStable) {
        renegotiatePeer(entry.key);
      }
    }
    notifyListeners();
  }

  Future<void> renegotiatePeer(String peerId) async {
    if (_isOfferer(peerId)) {
      await _startOffer(peerId, force: true);
    } else {
      _lastHelloAt.remove(peerId);
      await _sendSignal(peerId, {'type': 'hello', 'rsid': ''});
    }
  }

  Future<void> connectToPeer(String remoteUserId, String callId) async {
    if (remoteUserId.isEmpty || remoteUserId == _currentUserId) return;
    if (callId.isNotEmpty) _currentCallId = callId;
    if (_creatingPeer.contains(remoteUserId)) return;

    final pc = _peers[remoteUserId];
    if (pc != null && pc.signalingState != RTCSignalingState.RTCSignalingStateClosed) {
      final state = getPeerState(remoteUserId);
      if (state == 'connected') return;
      final age = DateTime.now().millisecondsSinceEpoch - (_peerConnectingSince[remoteUserId] ?? 0);
      if (state != 'failed' && age < 8000) return;
    }

    if (_isOfferer(remoteUserId)) {
      await _startOffer(remoteUserId, force: pc != null);
    } else {
      final last = _lastHelloAt[remoteUserId] ?? 0;
      if (DateTime.now().millisecondsSinceEpoch - last < 3000) return;
      _lastHelloAt[remoteUserId] = DateTime.now().millisecondsSinceEpoch;
      await _sendSignal(remoteUserId, {
        'type': 'hello',
        'rsid': _remoteSid[remoteUserId] ?? '',
      });
    }
  }

  Future<void> _startOffer(String remoteUserId, {bool force = false, bool iceRestart = false}) async {
    if (_offerInFlight.contains(remoteUserId)) return;
    _offerInFlight.add(remoteUserId);
    try {
      var pc = _peers[remoteUserId];
      if (!force && pc != null && pc.signalingState != RTCSignalingState.RTCSignalingStateClosed) {
        final state = getPeerState(remoteUserId);
        final age = DateTime.now().millisecondsSinceEpoch - (_peerConnectingSince[remoteUserId] ?? 0);
        if (state == 'connected') return;
        if (pc.signalingState == RTCSignalingState.RTCSignalingStateHaveLocalOffer && age < 4000) {
          return;
        }
      }

      if (pc == null || pc.signalingState == RTCSignalingState.RTCSignalingStateClosed) {
        _creatingPeer.add(remoteUserId);
        try {
          pc = await _createPeerConnection(remoteUserId, asOfferer: true);
          _remoteSid.remove(remoteUserId);
        } finally {
          _creatingPeer.remove(remoteUserId);
        }
      }

      if (!_currentCallId.startsWith('live_')) {
        await ensureLocalAudio();
      }
      await _attachLocalTracks(pc);
      final constraints = <String, dynamic>{
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': true,
        if (iceRestart) 'iceRestart': true,
      };
      final offer = await pc.createOffer(constraints);
      if (_peers[remoteUserId] != pc) return;
      await pc.setLocalDescription(offer);
      if (_peers[remoteUserId] != pc) return;

      await _sendSignal(remoteUserId, {
        'type': 'offer',
        'sdp': {'type': offer.type ?? 'offer', 'sdp': offer.sdp ?? ''},
        'sid': _localSid[remoteUserId] ?? '',
        'seq': DateTime.now().millisecondsSinceEpoch,
      });
      notifyListeners();
    } catch (e) {
      debugPrint('[MediaStreamService] _startOffer error: $e');
    } finally {
      _offerInFlight.remove(remoteUserId);
    }
  }

  void handleWebRtcSignal(String fromUserId, Map<String, dynamic> signal, String callId) {
    final prev = _signalChains[fromUserId] ?? Future.value();
    final next = prev.then((_) => _processSignal(fromUserId, signal, callId)).catchError((_) {});
    _signalChains[fromUserId] = next;
  }

  Future<void> _drainCandidates(String remoteUserId, String sid, RTCPeerConnection pc) async {
    final keys = _pendingCandidates.keys
        .where((k) => k == '$remoteUserId:$sid' || k.startsWith('$remoteUserId:'))
        .toList();
    for (final key in keys) {
      final list = _pendingCandidates.remove(key) ?? [];
      for (final cand in list) {
        try {
          await pc.addCandidate(cand);
        } catch (_) {}
      }
    }
  }

  Future<void> _processSignal(String fromUserId, Map<String, dynamic> signal, String callId) async {
    if (fromUserId.isEmpty || fromUserId == _currentUserId) return;
    final type = signal['type']?.toString() ?? '';
    if (type.isEmpty) return;

    final String body;
    if (type == 'candidate') {
      body = jsonEncode(signal['candidate'] ?? '');
    } else if (type == 'candidates') {
      body = jsonEncode(signal['candidates'] ?? []);
    } else if (type == 'hello') {
      body = '${signal['rsid'] ?? ''}:${DateTime.now().millisecondsSinceEpoch ~/ 2000}';
    } else {
      final rawSdp = signal['sdp'];
      body = rawSdp is Map ? (rawSdp['sdp']?.toString() ?? '') : (rawSdp?.toString() ?? '');
    }

    final sigKey = '$fromUserId:$type:${signal['sid'] ?? ''}:${signal['seq'] ?? ''}:$body';
    if (_seenSignals.contains(sigKey)) return;
    _seenSignals.add(sigKey);
    if (_seenSignals.length > 800) {
      _seenSignals.remove(_seenSignals.first);
    }

    try {
      if (type == 'hello') {
        if (!_isOfferer(fromUserId)) return;
        if (callId.isNotEmpty) _currentCallId = callId;
        final pc = _peers[fromUserId];
        final state = getPeerState(fromUserId);
        final rsid = signal['rsid']?.toString() ?? '';
        if (pc != null && state == 'connected' && rsid.isNotEmpty && rsid == _localSid[fromUserId]) {
          return;
        }
        await _startOffer(fromUserId, force: true);
        return;
      }

      if (type == 'offer') {
        if (callId.isNotEmpty) _currentCallId = callId;
        final rsid = (signal['sid']?.toString().isNotEmpty == true) ? signal['sid'].toString() : 'legacy';
        var pc = _peers[fromUserId];
        final prevRsid = _remoteSid[fromUserId];
        if (pc == null ||
            pc.signalingState == RTCSignalingState.RTCSignalingStateClosed ||
            pc.signalingState != RTCSignalingState.RTCSignalingStateStable ||
            (prevRsid != null && prevRsid != rsid)) {
          _creatingPeer.add(fromUserId);
          try {
            pc = await _createPeerConnection(fromUserId, asOfferer: false);
          } finally {
            _creatingPeer.remove(fromUserId);
          }
        }
        _remoteSid[fromUserId] = rsid;

        final rawSdp = signal['sdp'];
        final sdpStr = rawSdp is Map ? (rawSdp['sdp']?.toString() ?? '') : (rawSdp?.toString() ?? '');
        if (sdpStr.isEmpty) return;

        await pc.setRemoteDescription(RTCSessionDescription(sdpStr, 'offer'));
        if (!_currentCallId.startsWith('live_')) {
          await ensureLocalAudio();
        }
        await _attachLocalTracks(pc);
        await _drainCandidates(fromUserId, rsid, pc);

        final answer = await pc.createAnswer({});
        if (_peers[fromUserId] != pc) return;
        await pc.setLocalDescription(answer);

        await _sendSignal(fromUserId, {
          'type': 'answer',
          'sdp': {'type': answer.type ?? 'answer', 'sdp': answer.sdp ?? ''},
          'sid': _localSid[fromUserId] ?? '',
          'tsid': rsid,
        });
        notifyListeners();
        return;
      }

      if (type == 'answer') {
        final pc = _peers[fromUserId];
        if (pc == null || pc.signalingState != RTCSignalingState.RTCSignalingStateHaveLocalOffer) return;
        final tsid = signal['tsid']?.toString() ?? '';
        if (tsid.isNotEmpty && tsid != _localSid[fromUserId]) return;

        final rsid = (signal['sid']?.toString().isNotEmpty == true) ? signal['sid'].toString() : 'legacy';
        final rawSdp = signal['sdp'];
        final sdpStr = rawSdp is Map ? (rawSdp['sdp']?.toString() ?? '') : (rawSdp?.toString() ?? '');
        if (sdpStr.isEmpty) return;

        await pc.setRemoteDescription(RTCSessionDescription(sdpStr, 'answer'));
        _remoteSid[fromUserId] = rsid;
        await _drainCandidates(fromUserId, rsid, pc);
        notifyListeners();
        return;
      }

      if (type == 'candidate' || type == 'candidates') {
        final rawList = (type == 'candidates' && signal['candidates'] is List)
            ? (signal['candidates'] as List)
            : (signal['candidate'] != null ? [signal['candidate']] : []);
        final rsid = (signal['sid']?.toString().isNotEmpty == true)
            ? signal['sid'].toString()
            : (_remoteSid[fromUserId] ?? 'legacy');
        final pc = _peers[fromUserId];
        final remoteDesc = pc != null ? await pc.getRemoteDescription() : null;

        for (final raw in rawList) {
          if (raw == null) continue;
          String candStr = '';
          String? sdpMid;
          int? sdpMLineIndex;
          if (raw is Map) {
            candStr = raw['candidate']?.toString() ?? '';
            sdpMid = raw['sdpMid']?.toString();
            final rawIdx = raw['sdpMLineIndex'];
            if (rawIdx is int) {
              sdpMLineIndex = rawIdx;
            } else if (rawIdx != null) {
              sdpMLineIndex = int.tryParse(rawIdx.toString());
            }
          } else {
            candStr = raw.toString();
          }
          if (candStr.isEmpty) continue;

          final cand = RTCIceCandidate(candStr, sdpMid, sdpMLineIndex);
          if (pc != null &&
              pc.signalingState != RTCSignalingState.RTCSignalingStateClosed &&
              remoteDesc != null) {
            await pc.addCandidate(cand).catchError((_) {});
          } else {
            final key = '$fromUserId:$rsid';
            final queued = _pendingCandidates.putIfAbsent(key, () => []);
            queued.add(cand);
            if (queued.length > 100) queued.removeAt(0);
          }
        }
      }
    } catch (e) {
      debugPrint('[MediaStreamService] _processSignal error: $e');
    }
  }

  Future<void> closePeer(String userId) async {
    final pc = _peers.remove(userId);
    _localSid.remove(userId);
    _remoteSid.remove(userId);
    _peerStates.remove(userId);
    _peerConnectingSince.remove(userId);
    _remoteHasVideoTrack.remove(userId);
    _remoteStreams.remove(userId);
    if (pc != null) {
      try {
        await pc.close();
        await pc.dispose();
      } catch (_) {}
    }
    final renderer = _remoteRenderers.remove(userId);
    if (renderer != null) {
      try {
        renderer.srcObject = null;
        await renderer.dispose();
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    stopVoiceSession();
    _cameraRenderer?.dispose();
    _screenRenderer?.dispose();
    super.dispose();
  }
}
