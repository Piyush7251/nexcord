import 'package:flutter/material.dart';
import 'package:ai_nexconn_chatui_plugin/ai_nexconn_chatui_plugin.dart';
import '../services/nexconn_sdk_service.dart';

class NexconnChatUIScreen extends StatelessWidget {
  final NexconnSdkService sdk;
  const NexconnChatUIScreen({super.key, required this.sdk});

  void _openDirectChat(BuildContext context) {
    final ctrl = TextEditingController(text: 'u_maya');
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF2B2D31),
        title: const Text('Open Nexconn ChatPage'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'Target User ID (e.g. u_maya, u_arjun, u_lin)',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              final target = ctrl.text.trim();
              Navigator.pop(ctx);
              if (target.isEmpty) return;
              final channel = DirectChannel(target);
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ChatPage(channel: channel),
                ),
              );
            },
            child: const Text('Open ChatPage'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (sdk.mode != 'connected') {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.chat_bubble_outline, size: 52, color: Color(0xFF5865F2)),
              const SizedBox(height: 12),
              const Text(
                'Official Nexconn Flutter Chat UI Kit',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'ChannelPage and ChatPage from ai_nexconn_chatui_plugin are wired and ready. Add your Nexconn App Key & App Secret in the SDK tab to load your live Nexconn edge channel list here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFFB5BAC1), fontSize: 13.5),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5865F2), foregroundColor: Colors.white),
                onPressed: () => _openDirectChat(context),
                icon: const Icon(Icons.launch),
                label: const Text('Preview DirectChannel ChatPage'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Container(
          color: const Color(0xFF232428),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.verified, size: 16, color: Color(0xFF57F287)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'ai_nexconn_chatui_plugin • Live ChannelPage',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
              TextButton.icon(
                onPressed: () => _openDirectChat(context),
                icon: const Icon(Icons.add_comment, size: 16),
                label: const Text('New DM'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ChannelPage(
            onItemTap: (channel, index, ctx) {
              Navigator.of(ctx).push(
                MaterialPageRoute<void>(
                  builder: (_) => ChatPage(channel: channel),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
