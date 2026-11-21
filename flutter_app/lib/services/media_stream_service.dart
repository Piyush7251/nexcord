import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

class MediaStreamService extends ChangeNotifier {
  static final MediaStreamService instance = MediaStreamService._();
  MediaStreamService._();

  // Camera state
  List<CameraDescription> _cameras = [];
  CameraController? _cameraController;
  int _selectedCameraIndex = 0;
  bool _isCameraActive = false;
  bool _isCameraInitializing = false;
  String? _cameraError;

  // Screen share (WebRTC MediaProjection) state
  RTCVideoRenderer? _screenRenderer;
  MediaStream? _screenStream;
  bool _isScreenSharing = false;
  bool _isScreenInitializing = false;
  String? _screenShareError;

  bool get isCameraActive => _isCameraActive && _cameraController != null && _cameraController!.value.isInitialized;
  bool get isCameraInitializing => _isCameraInitializing;
  CameraController? get cameraController => _cameraController;
  String? get cameraError => _cameraError;

  bool get isScreenSharing => _isScreenSharing && _screenStream != null;
  bool get isScreenInitializing => _isScreenInitializing;
  RTCVideoRenderer? get screenRenderer => _screenRenderer;
  String? get screenShareError => _screenShareError;

  // ------------------------------------------------------------- Camera Methods
  Future<bool> startCamera({bool front = true}) async {
    if (_isCameraActive && _cameraController != null && _cameraController!.value.isInitialized) {
      return true;
    }
    _isCameraInitializing = true;
    _cameraError = null;
    notifyListeners();

    try {
      if (_cameras.isEmpty) {
        _cameras = await availableCameras();
      }
      if (_cameras.isEmpty) {
        _cameraError = 'No camera found on this device.';
        _isCameraInitializing = false;
        notifyListeners();
        return false;
      }

      int idx = 0;
      if (front) {
        idx = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.front);
        if (idx == -1) idx = 0;
      } else {
        idx = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.back);
        if (idx == -1) idx = 0;
      }
      _selectedCameraIndex = idx;

      await _cameraController?.dispose();
      _cameraController = CameraController(
        _cameras[_selectedCameraIndex],
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _cameraController!.initialize();
      _isCameraActive = true;
      _isCameraInitializing = false;
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
    if (_cameras.length < 2 || !_isCameraActive) return;
    _selectedCameraIndex = (_selectedCameraIndex + 1) % _cameras.length;
    _isCameraInitializing = true;
    notifyListeners();

    try {
      await _cameraController?.dispose();
      _cameraController = CameraController(
        _cameras[_selectedCameraIndex],
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await _cameraController!.initialize();
      _isCameraActive = true;
    } catch (e) {
      _cameraError = 'Flip failed: $e';
    } finally {
      _isCameraInitializing = false;
      notifyListeners();
    }
  }

  Future<void> stopCamera() async {
    if (!_isCameraActive && _cameraController == null) return;
    try {
      await _cameraController?.dispose();
    } catch (_) {}
    _cameraController = null;
    _isCameraActive = false;
    _isCameraInitializing = false;
    notifyListeners();
  }

  // ------------------------------------------------------------- Screen Share
  Future<bool> startScreenShare() async {
    if (_isScreenSharing && _screenStream != null) return true;
    _isScreenInitializing = true;
    _screenShareError = null;
    notifyListeners();

    try {
      if (_screenRenderer == null) {
        _screenRenderer = RTCVideoRenderer();
        await _screenRenderer!.initialize();
      }

      final stream = await navigator.mediaDevices.getDisplayMedia({
        'video': {
          'cursor': 'always',
          'frameRate': 30,
        },
        'audio': false,
      });

      _screenStream = stream;
      _screenRenderer!.srcObject = stream;
      _isScreenSharing = true;
      _isScreenInitializing = false;

      // Handle user stopping share from Android notification drawer
      for (final track in stream.getVideoTracks()) {
        track.onEnded = () {
          stopScreenShare();
        };
      }

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
    try {
      _screenStream?.getTracks().forEach((t) => t.stop());
      await _screenStream?.dispose();
      _screenStream = null;
      if (_screenRenderer != null) {
        _screenRenderer!.srcObject = null;
      }
    } catch (_) {}
    _isScreenSharing = false;
    _isScreenInitializing = false;
    notifyListeners();
  }

  @override
  void dispose() {
    stopCamera();
    stopScreenShare();
    _screenRenderer?.dispose();
    super.dispose();
  }
}
