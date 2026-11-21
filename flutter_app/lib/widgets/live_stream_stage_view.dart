import 'dart:async';
import 'dart:math' as math;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../models/models.dart';
import '../services/media_stream_service.dart';
import 'squad_and_quickchat.dart';

class _Bullet {
  final String id;
  final String sender;
  final Color color;
  final String text;
  final double top;
  final DateTime createdAt;

  _Bullet({
    required this.id,
    required this.sender,
    required this.color,
    required this.text,
    required this.top,
    required this.createdAt,
  });
}

class _Hype {
  final String id;
  final String emoji;
  final double leftFraction;
  final DateTime createdAt;

  _Hype({
    required this.id,
    required this.emoji,
    required this.leftFraction,
    required this.createdAt,
  });
}

class LiveStreamStageView extends StatefulWidget {
  final NexcordServer server;
  final NexcordChannel channel;
  final NexcordUser me;
  final Map<String, NexcordUser> users;
  final List<ChatMessage> messages;
  final Future<void> Function(String text) onSendMessage;
  final void Function(QuickChatPreset preset, {String? zone}) onSendQuickChat;
  final Future<void> Function(String emoji) onSendHype;
  final Future<void> Function({required String mode, required String title})? onStartLive;
  final Future<void> Function()? onStopLive;

  const LiveStreamStageView({
    super.key,
    required this.server,
    required this.channel,
    required this.me,
    required this.users,
    required this.messages,
    required this.onSendMessage,
    required this.onSendQuickChat,
    required this.onSendHype,
    this.onStartLive,
    this.onStopLive,
  });

  @override
  State<LiveStreamStageView> createState() => _LiveStreamStageViewState();
}

class _LiveStreamStageViewState extends State<LiveStreamStageView> with SingleTickerProviderStateMixin {
  late final AnimationController _anim;
  final TextEditingController _hudCtrl = TextEditingController();
  final TextEditingController _chatCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  final List<_Bullet> _bullets = [];
  final List<_Hype> _hypes = [];
  Timer? _pruneTimer;

  bool _showDanmaku = true;
  bool _showHudOverlay = true;
  bool _startingLive = false;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
    _pruneTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      final now = DateTime.now();
      if (!mounted) return;
      setState(() {
        _bullets.removeWhere((b) => now.difference(b.createdAt).inMilliseconds > 6000);
        _hypes.removeWhere((h) => now.difference(h.createdAt).inMilliseconds > 2600);
      });
    });
  }

  @override
  void didUpdateWidget(covariant LiveStreamStageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.messages.length > oldWidget.messages.length) {
      final diff = widget.messages.length - oldWidget.messages.length;
      final newOnes = widget.messages.sublist(widget.messages.length - diff);
      if (_showDanmaku) {
        for (final latest in newOnes) {
          final u = widget.users[latest.senderId];
          _bullets.add(_Bullet(
            id: '${latest.id}_${DateTime.now().millisecondsSinceEpoch}',
            sender: u?.displayName ?? 'Spectator',
            color: u?.color ?? const Color(0xFF5865F2),
            text: latest.text,
            top: 20 + math.Random().nextDouble() * 80,
            createdAt: DateTime.now(),
          ));
        }
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollCtrl.hasClients) {
            _scrollCtrl.jumpTo(_scrollCtrl.position.maxScrollExtent);
          }
        });
      }
    }
  }

  @override
  void dispose() {
    _pruneTimer?.cancel();
    _anim.dispose();
    _hudCtrl.dispose();
    _chatCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _triggerHype(String emoji) {
    setState(() {
      _hypes.add(_Hype(
        id: '${DateTime.now().microsecondsSinceEpoch}',
        emoji: emoji,
        leftFraction: 0.15 + math.Random().nextDouble() * 0.65,
        createdAt: DateTime.now(),
      ));
    });
    widget.onSendHype(emoji);
  }

  Future<void> _handleStartCamera() async {
    setState(() => _startingLive = true);
    final media = MediaStreamService.instance;
    final ok = await media.startCamera(front: true);
    if (!ok) {
      setState(() => _startingLive = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(media.cameraError ?? 'Failed to open camera.')),
        );
      }
      return;
    }
    if (widget.onStartLive != null) {
      await widget.onStartLive!(mode: 'camera', title: '${widget.me.displayName}\'s Mobile Live');
    }
    setState(() => _startingLive = false);
  }

  Future<void> _handleStartScreenShare() async {
    setState(() => _startingLive = true);
    final media = MediaStreamService.instance;
    final ok = await media.startScreenShare();
    if (!ok) {
      setState(() => _startingLive = false);
      if (mounted && media.screenShareError != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(media.screenShareError!)),
        );
      }
      return;
    }
    if (widget.onStartLive != null) {
      await widget.onStartLive!(mode: 'screenshare', title: '${widget.me.displayName}\'s Screen Share');
    }
    setState(() => _startingLive = false);
  }

  Future<void> _handleStopLive() async {
    final media = MediaStreamService.instance;
    await media.stopCamera();
    await media.stopScreenShare();
    if (widget.onStopLive != null) {
      await widget.onStopLive!();
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaStreamService.instance;
    final live = widget.channel.live;

    return AnimatedBuilder(
      animation: media,
      builder: (context, _) {
        return Column(
          children: [
            // Stream Controls Strip
            Container(
              color: const Color(0xFF14161D),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: live != null ? const Color(0xFFF23F43) : const Color(0xFF4E5058),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      live != null ? 'LIVE' : 'OFFLINE',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      live?.title ?? '#${widget.channel.name} — Stage',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                    ),
                  ),
                  InkWell(
                    onTap: () => setState(() => _showDanmaku = !_showDanmaku),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: _showDanmaku ? const Color(0xFF5865F2) : const Color(0xFF2B2D31),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: const Text('Danmaku', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: () => setState(() => _showHudOverlay = !_showHudOverlay),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: _showHudOverlay ? const Color(0xFF5865F2) : const Color(0xFF2B2D31),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: const Text('HUD', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ),

            // Video Viewport Area
            SizedBox(
              height: 245,
              width: double.infinity,
              child: _buildStageViewport(media, live),
            ),

            // Spectator Chat Feed
            Expanded(
              child: ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.all(10),
                itemCount: widget.messages.length,
                itemBuilder: (_, i) {
                  final m = widget.messages[i];
                  final u = widget.users[m.senderId];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: u?.color ?? const Color(0xFF5865F2),
                          child: Text(
                            (u?.displayName ?? 'S').substring(0, 1).toUpperCase(),
                            style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(
                                text: '${u?.displayName ?? m.senderId} ',
                                style: TextStyle(color: u?.color ?? Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              if (m.type == 'quickchat')
                                const TextSpan(
                                  text: '[QUICK] ',
                                  style: TextStyle(color: Color(0xFF57F287), fontWeight: FontWeight.w800, fontSize: 11),
                                ),
                              TextSpan(text: m.text, style: const TextStyle(fontSize: 13, color: Color(0xFFDBDEE1))),
                            ]),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            QuickChatStripWidget(onSendQuickChat: widget.onSendQuickChat),

            // Chat input bar
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _chatCtrl,
                      decoration: InputDecoration(
                        hintText: 'Spectator chat in #${widget.channel.name}...',
                        filled: true,
                        fillColor: const Color(0xFF383A40),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                      ),
                      onSubmitted: (v) async {
                        if (v.trim().isEmpty) return;
                        final t = v.trim();
                        _chatCtrl.clear();
                        await widget.onSendMessage(t);
                      },
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton(
                    style: IconButton.styleFrom(backgroundColor: const Color(0xFF5865F2)),
                    onPressed: () async {
                      if (_chatCtrl.text.trim().isEmpty) return;
                      final t = _chatCtrl.text.trim();
                      _chatCtrl.clear();
                      await widget.onSendMessage(t);
                    },
                    icon: const Icon(Icons.send, size: 18, color: Colors.white),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStageViewport(MediaStreamService media, LiveBroadcastInfo? live) {
    final isMyStream = live != null && live.userId == widget.me.id;
    final isOwner = widget.server.ownerId == widget.me.id;
    final canStream = isOwner || (widget.server.myPermissions?.canStream == true) || (widget.server.myPermissions?.admin == true);

    if (live != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          // Live Video Layer
          if (isMyStream && media.isCameraActive && media.cameraController != null)
            FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: media.cameraController!.value.previewSize?.height ?? 100,
                height: media.cameraController!.value.previewSize?.width ?? 100,
                child: CameraPreview(media.cameraController!),
              ),
            )
          else if (isMyStream && media.isScreenSharing && media.screenRenderer != null)
            RTCVideoView(
              media.screenRenderer!,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
            )
          else
            AnimatedBuilder(
              animation: _anim,
              builder: (_, __) => CustomPaint(
                painter: _EsportsStagePainter(progress: _anim.value),
                size: Size.infinite,
              ),
            ),

          // Active Stream Top Controls (Flip Cam, End Stream)
          Positioned(
            top: 10,
            left: 10,
            right: 10,
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xCCF23F43),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.circle, size: 8, color: Colors.white),
                      const SizedBox(width: 5),
                      Text(
                        isMyStream ? 'YOU ARE STREAMING' : 'BROADCASTING',
                        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                if (isMyStream && media.isCameraActive)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InkWell(
                      onTap: () => media.flipCamera(),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.flip_camera_android_rounded, size: 18, color: Colors.white),
                      ),
                    ),
                  ),
                if (isMyStream || isOwner)
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF23F43),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    onPressed: _handleStopLive,
                    icon: const Icon(Icons.stop_circle_rounded, size: 16),
                    label: const Text('End Stream', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
          ),

          // Danmaku Bullets
          if (_showDanmaku)
            ..._bullets.map((b) {
              final elapsed = DateTime.now().difference(b.createdAt).inMilliseconds / 5500.0;
              final xOffset = 1.0 - elapsed.clamp(0.0, 1.0) * 2.2;
              return Positioned(
                top: b.top,
                left: MediaQuery.of(context).size.width * xOffset,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${b.sender}: ', style: TextStyle(color: b.color, fontSize: 11.5, fontWeight: FontWeight.bold)),
                      Text(b.text, style: const TextStyle(color: Colors.white, fontSize: 11.5)),
                    ],
                  ),
                ),
              );
            }),

          // Floating Hype Bursts
          ..._hypes.map((h) {
            final elapsed = DateTime.now().difference(h.createdAt).inMilliseconds / 2400.0;
            return Positioned(
              left: MediaQuery.of(context).size.width * h.leftFraction,
              bottom: 42 + elapsed * 150,
              child: Opacity(
                opacity: (1.0 - elapsed).clamp(0.0, 1.0),
                child: Text(h.emoji, style: const TextStyle(fontSize: 28)),
              ),
            );
          }),

          // Translucent Spectator HUD Overlay
          if (_showHudOverlay)
            Positioned(
              right: 8,
              bottom: 8,
              child: Container(
                width: 210,
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: const Color(0xBA111214),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white12),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SPECTATOR HUD • OpenChannel',
                      style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Color(0xFFA5B2FF)),
                    ),
                    const SizedBox(height: 4),
                    ...widget.messages.reversed.take(3).toList().reversed.map((m) {
                      final u = widget.users[m.senderId];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(
                              text: '${u?.displayName ?? m.senderId}: ',
                              style: TextStyle(color: u?.color ?? Colors.lightBlueAccent, fontWeight: FontWeight.bold),
                            ),
                            TextSpan(text: m.text, style: const TextStyle(color: Colors.white)),
                          ]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),

          // Hype Emoji Dock
          Positioned(
            left: 8,
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xB8111214),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: ['🔥', '⚡', '👑', '💯'].map((em) {
                  return InkWell(
                    onTap: () => _triggerHype(em),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      child: Text(em, style: const TextStyle(fontSize: 16)),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      );
    }

    // When no stream is live:
    if (canStream) {
      return Container(
        color: const Color(0xFF1E1F22),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.sensors_rounded, size: 36, color: Color(0xFF5865F2)),
            const SizedBox(height: 8),
            const Text(
              'Live Stage Broadcasting',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 4),
            Text(
              'As Leader or Co-Leader, you can broadcast your screen or camera live to everyone in #${widget.channel.name}.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: Color(0xFF949BA4)),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF5865F2),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _startingLive ? null : _handleStartCamera,
                  icon: const Icon(Icons.videocam_rounded, size: 18),
                  label: Text(_startingLive ? 'Starting...' : 'Share Camera', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF23A55A),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _startingLive ? null : _handleStartScreenShare,
                  icon: const Icon(Icons.screen_share_rounded, size: 18),
                  label: Text(_startingLive ? 'Starting...' : 'Share Screen', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
                ),
              ],
            ),
          ],
        ),
      );
    }

    // Spectator mode when offline
    return Container(
      color: const Color(0xFF1E1F22),
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.tv_off_rounded, size: 38, color: Color(0xFF4E5058)),
          const SizedBox(height: 8),
          const Text(
            'Stage is Currently Offline',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            'Waiting for a Group Leader or Co-Leader to go live in #${widget.channel.name}. Chat and cheer below!',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: Color(0xFF949BA4)),
          ),
        ],
      ),
    );
  }
}

class _EsportsStagePainter extends CustomPainter {
  final double progress;

  _EsportsStagePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final bgPaint = Paint()..color = const Color(0xFF0D0F17);
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    final gridPaint = Paint()
      ..color = const Color(0x1F5865F2)
      ..strokeWidth = 1.0;

    const step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final glowPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          const Color(0xFF5865F2).withValues(alpha: 0.35),
          Colors.transparent,
        ],
      ).createShader(Rect.fromCircle(center: Offset(size.width / 2, size.height / 2), radius: size.width * 0.45));

    canvas.drawCircle(Offset(size.width / 2, size.height / 2), size.width * 0.45, glowPaint);

    final ringPaint = Paint()
      ..color = const Color(0x66FEE75C)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    final ringRadius = (size.height * 0.28) + (math.sin(progress * math.pi * 2) * 5);
    canvas.drawCircle(Offset(size.width / 2, size.height / 2), ringRadius, ringPaint);
  }

  @override
  bool shouldRepaint(covariant _EsportsStagePainter oldDelegate) => true;
}
