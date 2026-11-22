import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../models/models.dart';
import '../services/media_stream_service.dart';

class VoiceHuddleView extends StatefulWidget {
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
  State<VoiceHuddleView> createState() => _VoiceHuddleViewState();
}

class _VoiceHuddleViewState extends State<VoiceHuddleView> {
  bool _showVolumeBar = false;
  Timer? _autoHideTimer;

  @override
  void initState() {
    super.initState();
    if (widget.screenSharing) {
      _triggerVolumeBar(seconds: 4);
    }
  }

  @override
  void didUpdateWidget(VoiceHuddleView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.screenSharing && widget.screenSharing) {
      // Screen sharing just started: briefly show volume bar then auto-hide
      _triggerVolumeBar(seconds: 4);
    }
  }

  @override
  void dispose() {
    _autoHideTimer?.cancel();
    super.dispose();
  }

  void _triggerVolumeBar({int seconds = 5}) {
    _autoHideTimer?.cancel();
    if (mounted) {
      setState(() {
        _showVolumeBar = true;
      });
    }
    _autoHideTimer = Timer(Duration(seconds: seconds), () {
      if (mounted) {
        setState(() {
          _showVolumeBar = false;
        });
      }
    });
  }

  void _resetHideTimer({int seconds = 5}) {
    if (!_showVolumeBar) return;
    _autoHideTimer?.cancel();
    _autoHideTimer = Timer(Duration(seconds: seconds), () {
      if (mounted) {
        setState(() {
          _showVolumeBar = false;
        });
      }
    });
  }

  void _dismissVolumeBar() {
    _autoHideTimer?.cancel();
    if (mounted) {
      setState(() {
        _showVolumeBar = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaStreamService.instance;
    final ids = <String>{widget.me.id, ...widget.participants.map((p) => p.userId)}.toList();
    final remoteIds = ids.where((id) => id != widget.me.id).toList();
    final connectedRemotes = media.connectedPeerCount(remoteIds);
    final totalCount = ids.length;
    final connectedCount = 1 + connectedRemotes;
    final isAllConnected = totalCount > 1 && connectedRemotes == remoteIds.length;
    final anyFailed = remoteIds.any((id) => media.getPeerState(id) == 'failed');

    final statusLabel = totalCount <= 1
        ? 'Waiting for squad (1/1)'
        : isAllConnected
            ? 'P2P Connected ($connectedCount/$totalCount)'
            : anyFailed
                ? 'Connection failed ($connectedCount/$totalCount)'
                : 'Connecting ($connectedCount/$totalCount)';

    final statusColor = totalCount <= 1
        ? const Color(0xFF949BA4)
        : isAllConnected
            ? const Color(0xFF57F287)
            : anyFailed
                ? const Color(0xFFED4245)
                : const Color(0xFFF0B232);

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
                      'VOICE CONNECTED / #${widget.channelName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF57F287)),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFED4245),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    onPressed: widget.onHangup,
                    icon: const Icon(Icons.call_end, size: 13),
                    label: const Text('Leave', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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
                    final isMe = uid == widget.me.id;
                    final u = isMe ? widget.me : widget.users[uid];
                    final vp = widget.participants.where((p) => p.userId == uid).firstOrNull;
                    final muted = isMe ? widget.micMuted : (vp?.muted ?? false);
                    final deaf = isMe ? widget.deafened : (vp?.deafened ?? false);

                    final showLiveCamera = isMe && isCamActive && media.cameraRenderer != null;
                    final showLiveScreen = isMe && isSharing && media.screenRenderer != null;

                    final remoteRenderer = !isMe ? media.getRemoteRenderer(uid) : null;
                    final hasLiveRemoteFrames = !isMe && media.hasRemoteVideo(uid);
                    final isRemoteVideoExpected = !isMe && ((vp?.video ?? false) || (vp?.streaming ?? false) || hasLiveRemoteFrames);
                    final canMountRemoteView = !isMe && remoteRenderer != null && remoteRenderer.srcObject != null && isRemoteVideoExpected;
                    final showRemoteVideo = canMountRemoteView && hasLiveRemoteFrames;

                    return Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF1B1D23),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: (showLiveCamera || showRemoteVideo)
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
                          // Local or Remote Video Layer
                          if (showLiveScreen)
                            RTCVideoView(
                              media.screenRenderer!,
                              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                            )
                          else if (showLiveCamera)
                            RTCVideoView(
                              media.cameraRenderer!,
                              mirror: media.isFrontCamera,
                              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                            )
                          else if (canMountRemoteView)
                            Opacity(
                              opacity: showRemoteVideo ? 1.0 : 0.0,
                              child: RTCVideoView(
                                remoteRenderer,
                                objectFit: (vp?.streaming ?? false)
                                    ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
                                    : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                              ),
                            ),

                          // Avatar / Fallback Layer when no live video frames are visible
                          if (!showLiveScreen && !showLiveCamera && !showRemoteVideo)
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
                                  if (isMe && widget.cameraOn && !showLiveCamera) ...[
                                    const SizedBox(height: 6),
                                    const Text('Starting Camera...', style: TextStyle(fontSize: 10.5, color: Color(0xFF57F287))),
                                  ],
                                  if (isMe && widget.screenSharing && !showLiveScreen) ...[
                                    const SizedBox(height: 6),
                                    const Text('Starting Screen...', style: TextStyle(fontSize: 10.5, color: Color(0xFF5865F2))),
                                  ],
                                  if (!isMe && isRemoteVideoExpected && !hasLiveRemoteFrames) ...[
                                    const SizedBox(height: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.black54,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Text(
                                        'Connecting video...',
                                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: Color(0xFFFEE75C)),
                                      ),
                                    ),
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
                                  if ((vp?.streaming ?? false) || (isMe && isSharing))
                                    Container(
                                      margin: const EdgeInsets.only(right: 4),
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF23F43),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: const Text('LIVE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white)),
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
              const SizedBox(height: 6),

              // Game / Stream Audio Volume Boost Bar (Appears on hold mic, auto-hides after a few seconds)
              AnimatedSize(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeInOut,
                child: _showVolumeBar
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _buildGameAudioVolumeBar(context, media),
                          const SizedBox(height: 8),
                        ],
                      )
                    : const SizedBox.shrink(),
              ),

              // Control Dock
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _dockBtn(
                    icon: widget.micMuted ? Icons.mic_off : Icons.mic,
                    active: !widget.micMuted,
                    onTap: widget.onToggleMic,
                    onLongPress: () {
                      HapticFeedback.mediumImpact().catchError((_) {});
                      _triggerVolumeBar(seconds: 6);
                    },
                    tooltip: 'Tap: Mute/Unmute | Hold: Volume Bar',
                  ),
                  const SizedBox(width: 10),
                  _dockBtn(
                    icon: widget.deafened ? Icons.headset_off : Icons.headphones,
                    active: !widget.deafened,
                    onTap: widget.onToggleDeafen,
                  ),
                  const SizedBox(width: 10),
                  _dockBtn(
                    icon: isCamActive ? Icons.videocam : Icons.videocam_off,
                    active: isCamActive,
                    onTap: widget.onToggleCamera,
                  ),
                  const SizedBox(width: 10),
                  _dockBtn(
                    icon: isSharing ? Icons.stop_screen_share_rounded : Icons.screen_share_rounded,
                    active: isSharing,
                    onTap: widget.onToggleScreenShare,
                  ),
                  const SizedBox(width: 10),
                  IconButton(
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFFF23F43),
                      padding: const EdgeInsets.all(12),
                    ),
                    onPressed: widget.onHangup,
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

  Widget _buildGameAudioVolumeBar(BuildContext context, MediaStreamService media) {
    final vol = media.gameAudioVolume;
    final percent = (vol * 100).toInt();
    final isGameMode = media.isGameAudioMode;
    final accentColor = isGameMode ? const Color(0xFF5865F2) : const Color(0xFF57F287);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 2),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFF1B1D23),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isGameMode ? const Color(0xFF5865F2).withValues(alpha: 0.5) : Colors.white10,
          width: 1.2,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                isGameMode ? Icons.sports_esports_rounded : Icons.volume_up_rounded,
                size: 17,
                color: accentColor,
              ),
              const SizedBox(width: 6),
              Text(
                isGameMode ? 'Game / Stream Audio' : 'Voice & Audio Volume',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1.5),
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: accentColor.withValues(alpha: 0.4), width: 1),
                ),
                child: Text(
                  '$percent%',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: accentColor),
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: _dismissVolumeBar,
                borderRadius: BorderRadius.circular(12),
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(Icons.close, size: 16, color: Color(0xFF949BA4)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            isGameMode
                ? 'Amplifies phone game sound so squad hears clearly even at low phone volume.'
                : 'Adjust microphone and stream audio gain level. (Auto-hides in a few seconds)',
            style: const TextStyle(fontSize: 9.5, color: Color(0xFF949BA4)),
          ),
          Row(
            children: [
              const Icon(Icons.volume_mute_rounded, size: 15, color: Color(0xFF949BA4)),
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    activeTrackColor: accentColor,
                    inactiveTrackColor: Colors.white12,
                    thumbColor: accentColor,
                    overlayColor: accentColor.withValues(alpha: 0.2),
                    trackHeight: 3.5,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  ),
                  child: Slider(
                    value: vol,
                    min: 0.0,
                    max: 2.5,
                    divisions: 25,
                    onChanged: (val) {
                      media.setGameAudioVolume(val);
                      _resetHideTimer(seconds: 5);
                    },
                  ),
                ),
              ),
              Icon(Icons.volume_up_rounded, size: 15, color: accentColor),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _presetChip('50%', 0.5, vol, media),
              _presetChip('100%', 1.0, vol, media),
              _presetChip('150%', 1.5, vol, media),
              _presetChip('200%', 2.0, vol, media),
              _presetChip('250%', 2.5, vol, media),
              InkWell(
                onTap: () {
                  media.setGameAudioMode(!isGameMode);
                  _resetHideTimer(seconds: 5);
                },
                borderRadius: BorderRadius.circular(6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                  decoration: BoxDecoration(
                    color: isGameMode
                        ? const Color(0xFF5865F2).withValues(alpha: 0.2)
                        : Colors.white10,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isGameMode ? const Color(0xFF5865F2) : Colors.white24,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.bolt_rounded,
                        size: 12,
                        color: isGameMode ? const Color(0xFF5865F2) : const Color(0xFF949BA4),
                      ),
                      const SizedBox(width: 2),
                      Text(
                        isGameMode ? 'AEC Bypass ON' : 'AEC Normal',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: isGameMode ? const Color(0xFF5865F2) : const Color(0xFF949BA4),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _presetChip(String label, double targetVal, double currentVal, MediaStreamService media) {
    final isSelected = (currentVal - targetVal).abs() < 0.05;
    return InkWell(
      onTap: () {
        media.setGameAudioVolume(targetVal);
        _resetHideTimer(seconds: 5);
      },
      borderRadius: BorderRadius.circular(5),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF5865F2) : Colors.white10,
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
            color: isSelected ? const Color(0xFF5865F2) : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 9.5,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : const Color(0xFF949BA4),
          ),
        ),
      ),
    );
  }

  Widget _dockBtn({
    required IconData icon,
    required bool active,
    required VoidCallback onTap,
    VoidCallback? onLongPress,
    String? tooltip,
  }) {
    final btn = Material(
      color: active ? const Color(0xFF35373C) : const Color(0xFF1E1F22),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: active ? Border.all(color: const Color(0xFF57F287), width: 1.5) : null,
          ),
          child: Icon(
            icon,
            size: 20,
            color: active ? Colors.white : const Color(0xFF949BA4),
          ),
        ),
      ),
    );

    if (tooltip != null && tooltip.isNotEmpty) {
      return Tooltip(message: tooltip, child: btn);
    }
    return btn;
  }
}
