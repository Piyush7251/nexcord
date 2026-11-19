import 'package:flutter/material.dart';
import '../models/models.dart';

class VoiceHuddleView extends StatelessWidget {
  final String channelName;
  final NexcordUser me;
  final Map<String, NexcordUser> users;
  final List<VoiceParticipant> participants;
  final bool micMuted;
  final bool deafened;
  final bool cameraOn;
  final VoidCallback onToggleMic;
  final VoidCallback onToggleDeafen;
  final VoidCallback onToggleCamera;
  final VoidCallback onHangup;

  const VoiceHuddleView({
    super.key,
    required this.channelName,
    required this.me,
    required this.users,
    required this.participants,
    required this.micMuted,
    required this.deafened,
    required this.cameraOn,
    required this.onToggleMic,
    required this.onToggleDeafen,
    required this.onToggleCamera,
    required this.onHangup,
  });

  @override
  Widget build(BuildContext context) {
    final ids = <String>{me.id, ...participants.map((p) => p.userId)}.toList();
    return Container(
      color: const Color(0xFF0D0E12),
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.circle, size: 10, color: Color(0xFF57F287)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Voice Connected — $channelName',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0x335865F2),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0x665865F2)),
                ),
                child: const Text('Nexconn Call', style: TextStyle(fontSize: 10.5, color: Color(0xFFB8C2FF))),
              ),
            ],
          ),
          const SizedBox(height: 14),
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

                return Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF1B1D23),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: !muted ? const Color(0x8857F287) : Colors.white10,
                      width: 2,
                    ),
                  ),
                  child: Stack(
                    children: [
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
                            if (isMe && cameraOn) ...[
                              const SizedBox(height: 6),
                              const Text('Camera Preview Active', style: TextStyle(fontSize: 10.5, color: Color(0xFF57F287))),
                            ],
                          ],
                        ),
                      ),
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
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _dockBtn(micMuted ? Icons.mic_off : Icons.mic, !micMuted, onToggleMic),
              const SizedBox(width: 14),
              _dockBtn(deafened ? Icons.headset_off : Icons.headphones, !deafened, onToggleDeafen),
              const SizedBox(width: 14),
              _dockBtn(cameraOn ? Icons.videocam : Icons.videocam_off, cameraOn, onToggleCamera),
              const SizedBox(width: 14),
              IconButton(
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFFF23F43),
                  fixedSize: const Size(52, 52),
                ),
                onPressed: onHangup,
                icon: const Icon(Icons.call_end, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dockBtn(IconData icon, bool active, VoidCallback onTap) {
    return IconButton(
      style: IconButton.styleFrom(
        backgroundColor: active ? const Color(0xFF2B2D31) : Colors.white,
        foregroundColor: active ? Colors.white : Colors.black,
        fixedSize: const Size(50, 50),
      ),
      onPressed: onTap,
      icon: Icon(icon),
    );
  }
}
