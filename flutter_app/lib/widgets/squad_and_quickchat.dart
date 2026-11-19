import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/models.dart';

class SquadLobbyBannerWidget extends StatefulWidget {
  final NexcordServer server;
  final NexcordUser me;
  final Map<String, NexcordUser> users;
  final SquadLobbyState? squadState;
  final void Function({String? game, String? map, bool? ready}) onUpdateSquad;
  final void Function(int x, int y, String label) onMapPing;
  final VoidCallback onJoinSquadVoice;

  const SquadLobbyBannerWidget({
    super.key,
    required this.server,
    required this.me,
    required this.users,
    required this.squadState,
    required this.onUpdateSquad,
    required this.onMapPing,
    required this.onJoinSquadVoice,
  });

  @override
  State<SquadLobbyBannerWidget> createState() => _SquadLobbyBannerWidgetState();
}

class _SquadLobbyBannerWidgetState extends State<SquadLobbyBannerWidget> {
  bool _showRadar = false;
  Offset? _lastPingPct;
  String? _lastPingLabel;

  static const _games = [
    'VALORANT • Competitive',
    'Counter-Strike 2 • Premier',
    'Apex Legends • Ranked Trios',
    'League of Legends • Clash',
  ];
  static const _maps = ['Ascent', 'Bind', 'Mirage', 'Storm Point'];

  static const _zones = [
    (x: 24.0, y: 24.0, label: 'A Site'),
    (x: 50.0, y: 48.0, label: 'Mid Control'),
    (x: 76.0, y: 26.0, label: 'B Site'),
    (x: 26.0, y: 74.0, label: 'A Main'),
    (x: 74.0, y: 72.0, label: 'B Main'),
  ];

  void _handleTapRadar(TapDownDetails details, BoxConstraints box) {
    final x = ((details.localPosition.dx / box.maxWidth) * 100).clamp(0, 100).round();
    final y = ((details.localPosition.dy / box.maxHeight) * 100).clamp(0, 100).round();
    var nearest = 'Grid ($x, $y)';
    var bestDist = 9999.0;
    for (final z in _zones) {
      final d = math.sqrt(math.pow(x - z.x, 2) + math.pow(y - z.y, 2));
      if (d < bestDist) {
        bestDist = d;
        if (d < 22) nearest = z.label;
      }
    }
    setState(() {
      _lastPingPct = Offset(x.toDouble(), y.toDouble());
      _lastPingLabel = nearest;
    });
    widget.onMapPing(x, y, nearest);
  }

  @override
  Widget build(BuildContext context) {
    final game = widget.squadState?.game ?? _games.first;
    final map = widget.squadState?.map ?? _maps.first;
    final readyMap = widget.squadState?.ready ?? {};
    final myReady = readyMap[widget.me.id] == true;

    final squad = <NexcordUser>[widget.me];
    for (final m in widget.server.members) {
      if (m.userId == widget.me.id) continue;
      final u = widget.users[m.userId];
      if (u != null && squad.length < 4) squad.add(u);
    }
    final readyCount = squad.where((u) => readyMap[u.id] == true).length;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF5865F2).withValues(alpha: 0.20),
            const Color(0xFF23A55A).withValues(alpha: 0.14),
          ],
        ),
        border: const Border(
          bottom: BorderSide(color: Color(0x555865F2)),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF5865F2),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.sports_esports, size: 13, color: Colors.white),
                    SizedBox(width: 4),
                    Text('SQUAD ROOM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '$readyCount/${squad.length} Ready',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF57F287)),
              ),
              const Spacer(),
              TextButton.icon(
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  backgroundColor: _showRadar ? const Color(0xFF5865F2) : const Color(0xFF1E1F22),
                  foregroundColor: Colors.white,
                  minimumSize: Size.zero,
                ),
                onPressed: () => setState(() => _showRadar = !_showRadar),
                icon: const Icon(Icons.my_location, size: 13),
                label: const Text('Radar', style: TextStyle(fontSize: 11.5)),
              ),
              const SizedBox(width: 6),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: myReady ? const Color(0xFF23A55A) : const Color(0xFF5865F2),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  minimumSize: Size.zero,
                ),
                onPressed: () => widget.onUpdateSquad(ready: !myReady),
                child: Text(myReady ? 'READY ✓' : 'Ready Up', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ...squad.map((u) {
                  final r = readyMap[u.id] == true;
                  return Container(
                    width: 142,
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(
                      color: r ? const Color(0x2223A55A) : const Color(0xAA111214),
                      borderRadius: BorderRadius.circular(7),
                      border: Border.all(
                        color: r ? const Color(0xAA23A55A) : Colors.white12,
                      ),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 13,
                          backgroundColor: u.color,
                          child: Text(
                            u.displayName.substring(0, 1).toUpperCase(),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                u.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                              Text(
                                r ? 'READY' : 'In Lobby',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: r ? const Color(0xFF57F287) : const Color(0xFF949BA4),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF57F287),
                    side: const BorderSide(color: Color(0x6657F287)),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  ),
                  onPressed: widget.onJoinSquadVoice,
                  icon: const Icon(Icons.headset_mic, size: 15),
                  label: const Text('Squad Voice', style: TextStyle(fontSize: 11.5)),
                ),
              ],
            ),
          ),
          if (_showRadar) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF131722),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0x665865F2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Tap $map ($game) radar to ping squad',
                          style: const TextStyle(fontSize: 11, color: Color(0xFFB5BAC1)),
                        ),
                      ),
                      if (_lastPingLabel != null)
                        Text(
                          '📍 $_lastPingLabel',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF7B7E)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 120,
                    width: double.infinity,
                    child: LayoutBuilder(
                      builder: (context, constraints) => GestureDetector(
                        onTapDown: (d) => _handleTapRadar(d, constraints),
                        child: CustomPaint(
                          painter: _RadarPainter(pingPct: _lastPingPct),
                          child: Stack(
                            children: _zones
                                .map(
                                  (z) => Positioned(
                                    left: constraints.maxWidth * (z.x / 100) - 24,
                                    top: 120 * (z.y / 100) - 9,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: Colors.black54,
                                        borderRadius: BorderRadius.circular(3),
                                      ),
                                      child: Text(z.label, style: const TextStyle(fontSize: 9.5, color: Colors.white70)),
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RadarPainter extends CustomPainter {
  final Offset? pingPct;
  _RadarPainter({this.pingPct});

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = const Color(0xFF0E131E);
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(6)), bg);

    final grid = Paint()
      ..color = const Color(0x285865F2)
      ..strokeWidth = 1;
    for (double x = 24; x < size.width; x += 24) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 24; y < size.height; y += 24) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    if (pingPct != null) {
      final center = Offset(size.width * (pingPct!.dx / 100), size.height * (pingPct!.dy / 100));
      canvas.drawCircle(center, 14, Paint()..color = const Color(0x44F23F43));
      canvas.drawCircle(center, 6, Paint()..color = const Color(0xFFF23F43));
      canvas.drawCircle(
        center,
        6,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPainter oldDelegate) => oldDelegate.pingPct != pingPct;
}

class QuickChatStripWidget extends StatelessWidget {
  final void Function(QuickChatPreset preset, {String? zone}) onSendQuickChat;

  const QuickChatStripWidget({super.key, required this.onSendQuickChat});

  void _openQuickChatSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF2B2D31),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => _QuickChatWheelSheet(
        onPick: (preset, zone) {
          Navigator.pop(ctx);
          onSendQuickChat(preset, zone: zone);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      margin: const EdgeInsets.fromLTRB(8, 4, 8, 2),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF26282E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: () => _openQuickChatSheet(context),
            borderRadius: BorderRadius.circular(6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0x385865F2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Row(
                children: [
                  Icon(Icons.bolt, size: 14, color: Color(0xFFB8C2FF)),
                  SizedBox(width: 3),
                  Text('Quick Chat', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFFB8C2FF))),
                ],
              ),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: kQuickChatPresets.take(6).map((p) {
                return Padding(
                  padding: const EdgeInsets.only(right: 6, top: 5, bottom: 5),
                  child: InkWell(
                    onTap: () => onSendQuickChat(p),
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFF313338),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Row(
                        children: [
                          Text(p.icon, style: const TextStyle(fontSize: 12)),
                          const SizedBox(width: 4),
                          Text(p.label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickChatWheelSheet extends StatefulWidget {
  final void Function(QuickChatPreset preset, String? zone) onPick;

  const _QuickChatWheelSheet({required this.onPick});

  @override
  State<_QuickChatWheelSheet> createState() => _QuickChatWheelSheetState();
}

class _QuickChatWheelSheetState extends State<_QuickChatWheelSheet> {
  String _cat = 'tactical';
  String _zone = 'Any Zone';

  static const _cats = [
    ('tactical', 'Tactical'),
    ('comms', 'Comms'),
    ('hype', 'Hype'),
    ('status', 'Status'),
  ];
  static const _zones = ['Any Zone', 'A Site', 'Mid', 'B Site', 'High Ground'];

  @override
  Widget build(BuildContext context) {
    final items = kQuickChatPresets.where((p) => p.category == _cat).toList();
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt, color: Color(0xFF5865F2)),
              const SizedBox(width: 6),
              const Text('In-Match Quick Chat', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const Spacer(),
              DropdownButton<String>(
                value: _zone,
                dropdownColor: const Color(0xFF1E1F22),
                underline: const SizedBox.shrink(),
                style: const TextStyle(fontSize: 12.5, color: Colors.white),
                items: _zones.map((z) => DropdownMenuItem(value: z, child: Text(z))).toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _zone = v);
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: _cats.map((c) {
              final active = _cat == c.$1;
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(c.$2, style: const TextStyle(fontSize: 12)),
                  selected: active,
                  selectedColor: const Color(0xFF5865F2),
                  onSelected: (_) => setState(() => _cat = c.$1),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: items.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 2.5,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemBuilder: (_, i) {
              final p = items[i];
              return InkWell(
                onTap: () => widget.onPick(p, _zone == 'Any Zone' ? null : _zone),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1F22),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('${p.icon} ${p.label}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(
                        p.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10.5, color: Color(0xFF949BA4)),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
