import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../models/models.dart';
import '../services/media_stream_service.dart';

class VoiceHuddleView extends StatelessWidget {
  final String channelName;
  final String? callId;
  final NexcordUser me;
  final Map<String, NexcordUser> users;
  final List<VoiceParticipant> participants;
  final bool micMuted;
  final bool deafened;
  final bool cameraOn;
  final bool screenSharing;
  final VoidCallback onToggleMic;
  final VoidCallback onToggleDeafen;
  final VoidCallback onToggleCamera;
  final VoidCallback onToggleScreenShare;
  final VoidCallback onHangup;

  const VoiceHuddleView({
    super.key,
    required this.channelName,
    this.callId,
    required this.me,
    required this.users,
    required this.participants,
    required this.micMuted,
    required this.deafened,
    required this.cameraOn,
    this.screenSharing = false,
    required this.onToggleMic,
    required this.onToggleDeafen,
    required this.onToggleCamera,
    required this.onToggleScreenShare,
    required this.onHangup,
  });

  @override
  Widget build(BuildContext context) {
    final media = MediaStreamService.instance;
    final ids = <String>{me.id, ...participants.map((p) => p.userId)}.toList();

    return AnimatedBuilder(
      animation: media,
      builder: (context, _) {
        final isCamActive = media.isCameraActive;
        final isSharing = media.isScreenSharing;

        return Container(
          color: const Color(0xFF0D0E12),
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              // Header
              Row(
                children: [
                  const Icon(Icons.circle, size: 10, color: Color(0xFF57F287)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'VOICE CONNECTED / #$channelName',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF57F287)),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E1F22),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Text(
                      '${ids.length} in channel',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF949BA4)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Participant Grid
              Expanded(
                child: GridView.builder(
                  itemCount: ids.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 0.95,
                  ),
                  itemBuilder: (_, i) {
                    final uid = ids[i];
                    final isMe = uid == me.id;
                    final u = isMe ? me : users[uid];
                    final vp = participants.where((p) => p.userId == uid).firstOrNull;
                    final muted = isMe ? micMuted : (vp?.muted ?? false);
                    final deaf = isMe ? deafened : (vp?.deafened ?? false);

                    final showLiveCamera = isMe && isCamActive && media.cameraController != null;
                    final showLiveScreen = isMe && isSharing && media.screenRenderer != null;

                    return Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF1B1D23),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: showLiveCamera
                              ? const Color(0xFF57F287)
                              : showLiveScreen
                                  ? const Color(0xFF5865F2)
                                  : !muted
                                      ? const Color(0x8857F287)
                                      : Colors.white10,
                          width: 2,
                        ),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          // Video content or Avatar
                          if (showLiveCamera)
                            FittedBox(
                              fit: BoxFit.cover,
                              child: SizedBox(
                                width: media.cameraController!.value.previewSize?.height ?? 100,
                                height: media.cameraController!.value.previewSize?.width ?? 100,
                                child: CameraPreview(media.cameraController!),
                              ),
                            )
                          else if (showLiveScreen)
                            RTCVideoView(
                              media.screenRenderer!,
                              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                            )
                          else
                            Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  CircleAvatar(
                                    radius: 34,
                                    backgroundColor: u?.color ?? const Color(0xFF5865F2),
                                    child: Text(
                                      (u?.displayName ?? uid).substring(0, 1).toUpperCase(),
                                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                                    ),
                                  ),
                                  if (isMe && cameraOn && !showLiveCamera) ...[
                                    const SizedBox(height: 6),
                                    const Text('Starting Camera...', style: TextStyle(fontSize: 10.5, color: Color(0xFF57F287))),
                                  ],
                                  if (isMe && screenSharing && !showLiveScreen) ...[
                                    const SizedBox(height: 6),
                                    const Text('Starting Screen...', style: TextStyle(fontSize: 10.5, color: Color(0xFF5865F2))),
                                  ],
                                ],
                              ),
                            ),

                          // Flip Camera Button if Camera Active
                          if (showLiveCamera)
                            Positioned(
                              top: 8,
                              right: 8,
                              child: InkWell(
                                onTap: () => media.flipCamera(),
                                child: Container(
                                  padding: const EdgeInsets.all(5),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.flip_camera_android_rounded, size: 18, color: Colors.white),
                                ),
                              ),
                            ),

                          // Name and Status Badge
                          Positioned(
                            left: 8,
                            right: 8,
                            bottom: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${u?.displayName ?? uid}${isMe ? " (You)" : ""}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  if (deaf) const Icon(Icons.headset_off, size: 14, color: Color(0xFFF23F43)),
                                  const SizedBox(width: 4),
                                  Icon(
                                    muted ? Icons.mic_off : Icons.mic,
                                    size: 14,
                                    color: muted ? const Color(0xFFF23F43) : const Color(0xFF57F287),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 10),

              // Control Dock
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _dockBtn(micMuted ? Icons.mic_off : Icons.mic, !micMuted, onToggleMic),
                  const SizedBox(width: 10),
                  _dockBtn(deafened ? Icons.headset_off : Icons.headphones, !deafened, onToggleDeafen),
                  const SizedBox(width: 10),
                  _dockBtn(isCamActive ? Icons.videocam : Icons.videocam_off, isCamActive, onToggleCamera),
                  const SizedBox(width: 10),
                  _dockBtn(isSharing ? Icons.stop_screen_share_rounded : Icons.screen_share_rounded, isSharing, onToggleScreenShare),
                  const SizedBox(width: 10),
                  IconButton(
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFFF23F43),
                      padding: const EdgeInsets.all(12),
                    ),
                    onPressed: onHangup,
                    icon: const Icon(Icons.call_end, color: Colors.white),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _dockBtn(IconData icon, bool active, VoidCallback onTap) {
    return IconButton(
      style: IconButton.styleFrom(
        backgroundColor: active ? const Color(0xFF35373C) : const Color(0xFF1E1F22),
        foregroundColor: active ? Colors.white : const Color(0xFF949BA4),
        padding: const EdgeInsets.all(12),
        side: active ? const BorderSide(color: Color(0xFF57F287), width: 1.5) : BorderSide.none,
      ),
      onPressed: onTap,
      icon: Icon(icon, size: 20),
    );
  }
}
