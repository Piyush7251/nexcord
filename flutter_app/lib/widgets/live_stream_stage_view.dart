import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/models.dart';
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
  });

  @override
  State<LiveStreamStageView> createState() => _LiveStreamStageViewState();
}

class _LiveStreamStageViewState extends State<LiveStreamStageView> with SingleTickerProviderStateMixin {
  late final AnimationController _anim;
  final TextEditingController _hudCtrl = TextEditingController();
  final TextEditingController _chatCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  bool _showHudOverlay = true;
  bool _showDanmaku = true;
  String? _lastMsgId;
  final List<_Bullet> _bullets = [];
  final List<_Hype> _hypes = [];
  Timer? _pruneTimer;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(seconds: 12))..repeat();
    _pruneTimer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _bullets.removeWhere((b) => now.difference(b.createdAt).inMilliseconds > 5500);
        _hypes.removeWhere((h) => now.difference(h.createdAt).inMilliseconds > 2400);
      });
    });
  }

  @override
  void didUpdateWidget(covariant LiveStreamStageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.messages.isNotEmpty) {
      final latest = widget.messages.last;
      if (latest.id != _lastMsgId) {
        _lastMsgId = latest.id;
        if (_showDanmaku) {
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

  @override
  Widget build(BuildContext context) {
    final live = widget.channel.live;
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
                decoration: BoxDecoration(color: const Color(0xFFF23F43), borderRadius: BorderRadius.circular(4)),
                child: const Text('LIVE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  live?.title ?? '#${widget.channel.name} — Watch Party',
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

        // Interactive Esports Video Viewport + Spectator Chat Overlays
        SizedBox(
          height: 235,
          width: double.infinity,
          child: Stack(
            children: [
              AnimatedBuilder(
                animation: _anim,
                builder: (_, __) => CustomPaint(
                  painter: _EsportsStagePainter(progress: _anim.value),
                  size: Size.infinite,
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

              // Translucent Spectator HUD Chat Overlay
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
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _hudCtrl,
                                style: const TextStyle(fontSize: 11),
                                decoration: const InputDecoration(
                                  hintText: 'Overlay chat...',
                                  isDense: true,
                                  contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 5),
                                  filled: true,
                                  fillColor: Color(0x88000000),
                                  border: OutlineInputBorder(borderSide: BorderSide.none),
                                ),
                                onSubmitted: (v) async {
                                  if (v.trim().isEmpty) return;
                                  final t = v.trim();
                                  _hudCtrl.clear();
                                  await widget.onSendMessage(t);
                                },
                              ),
                            ),
                            const SizedBox(width: 4),
                            InkWell(
                              onTap: () async {
                                if (_hudCtrl.text.trim().isEmpty) return;
                                final t = _hudCtrl.text.trim();
                                _hudCtrl.clear();
                                await widget.onSendMessage(t);
                              },
                              child: Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(color: const Color(0xFF5865F2), borderRadius: BorderRadius.circular(4)),
                                child: const Icon(Icons.send, size: 12, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
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
          ),
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
  }
}

class _EsportsStagePainter extends CustomPainter {
  final double progress;
  _EsportsStagePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF0A0E17));

    final grid = Paint()
      ..color = const Color(0x1E5865F2)
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 36) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += 36) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    // Sites A, Mid, B
    final sitePaint = Paint()..color = const Color(0x12FFFFFF);
    final siteBorder = Paint()
      ..color = const Color(0x28FFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (final r in [
      Rect.fromLTWH(size.width * 0.10, size.height * 0.25, size.width * 0.20, size.height * 0.34),
      Rect.fromLTWH(size.width * 0.41, size.height * 0.32, size.width * 0.18, size.height * 0.34),
      Rect.fromLTWH(size.width * 0.70, size.height * 0.25, size.width * 0.20, size.height * 0.34),
    ]) {
      canvas.drawRect(r, sitePaint);
      canvas.drawRect(r, siteBorder);
    }

    // Pulse on B Site
    final p = (progress * 3) % 1.0;
    canvas.drawCircle(
      Offset(size.width * 0.80, size.height * 0.42),
      6 + p * 26,
      Paint()
        ..color = Color.fromRGBO(242, 63, 67, 1.0 - p)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    // Moving 10 players
    final t = progress * math.pi * 2;
    for (int i = 0; i < 10; i++) {
      final atk = i < 5;
      final cx = (atk ? 0.28 : 0.72) + math.sin(t + i * 1.1) * 0.16;
      final cy = 0.28 + (i % 5) * 0.13 + math.cos(t + i * 0.9) * 0.06;
      final pos = Offset(size.width * cx, size.height * cy);
      canvas.drawCircle(pos, 5.5, Paint()..color = atk ? const Color(0xFF57F287) : const Color(0xFFF23F43));
      canvas.drawCircle(
        pos,
        5.5,
        Paint()
          ..color = Colors.black
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }

    // Scoreboard HUD
    final hudRect = Rect.fromCenter(center: Offset(size.width / 2, 20), width: 220, height: 26);
    canvas.drawRRect(
      RRect.fromRectAndRadius(hudRect, const Radius.circular(6)),
      Paint()..color = const Color(0xCC111214),
    );
    final tp = TextPainter(
      text: const TextSpan(
        children: [
          TextSpan(text: 'NEXCORD 12  ', style: TextStyle(color: Color(0xFF57F287), fontWeight: FontWeight.bold, fontSize: 11.5)),
          TextSpan(text: '00:24', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11.5)),
          TextSpan(text: '  11 APEX', style: TextStyle(color: Color(0xFFF23F43), fontWeight: FontWeight.bold, fontSize: 11.5)),
        ],
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(size.width / 2 - tp.width / 2, 20 - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _EsportsStagePainter oldDelegate) => oldDelegate.progress != progress;
}
