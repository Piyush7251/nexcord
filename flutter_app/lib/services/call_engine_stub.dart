// Lightweight Call Engine interface for Nexconn Call integration

enum CallAreaCode { sg, na }
enum CallMediaType { audio, video }

class CallInitParams {
  final String appKey;
  final CallAreaCode areaCode;
  CallInitParams({required this.appKey, required this.areaCode});
}

class JoinCallParams {
  final String callId;
  JoinCallParams({required this.callId});
}

class StartCallParams {
  final String callId;
  final List<String> calleeIds;
  final bool isGroup;
  final CallMediaType mediaType;
  StartCallParams({
    required this.callId,
    required this.calleeIds,
    this.isGroup = true,
    this.mediaType = CallMediaType.audio,
  });
}

class EndCallParams {
  final String callId;
  EndCallParams({required this.callId});
}

class MicParams {
  final String callId;
  final bool enabled;
  MicParams({required this.callId, required this.enabled});
}

class CameraParams {
  final String callId;
  final bool enabled;
  CameraParams({required this.callId, required this.enabled});
}

class NCCallEngine {
  Future<void> initialize(CallInitParams params) async {}
  Future<void> joinCall(JoinCallParams params) async {}
  Future<void> startCall(StartCallParams params) async {}
  Future<void> endCall(EndCallParams params) async {}
  Future<void> enableMicrophone(MicParams params) async {}
  Future<void> enableCamera(CameraParams params) async {}
}
