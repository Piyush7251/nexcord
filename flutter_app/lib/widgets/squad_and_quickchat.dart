import 'package:flutter/material.dart';
import '../models/models.dart';

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
