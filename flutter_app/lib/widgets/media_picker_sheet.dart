import 'package:flutter/material.dart';
import '../data/media_library.dart';

class MediaPickerSheet extends StatefulWidget {
  final void Function(String emoji) onSelectEmoji;
  final void Function(GifItemData gif) onSelectGif;
  final void Function(StickerItemData sticker) onSelectSticker;

  const MediaPickerSheet({
    super.key,
    required this.onSelectEmoji,
    required this.onSelectGif,
    required this.onSelectSticker,
  });

  @override
  State<MediaPickerSheet> createState() => _MediaPickerSheetState();
}

class _MediaPickerSheetState extends State<MediaPickerSheet> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchCtrl = TextEditingController();
  String _searchQuery = '';
  String _emojiCategory = 'all';
  String _gifCategory = 'all';
  String _stickerCategory = 'all';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      setState(() {
        _searchCtrl.clear();
        _searchQuery = '';
      });
    });
    _searchCtrl.addListener(() {
      setState(() {
        _searchQuery = _searchCtrl.text.trim().toLowerCase();
      });
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  List<String> get _filteredEmojis {
    var list = <String>[];
    if (_emojiCategory == 'all') {
      for (final cat in kEmojiCategories) {
        list.addAll(cat.emojis);
      }
    } else {
      final found = kEmojiCategories.where((c) => c.id == _emojiCategory).firstOrNull;
      if (found != null) list.addAll(found.emojis);
    }
    if (_searchQuery.isNotEmpty) {
      list = list.where((em) => em.contains(_searchQuery)).toList();
    }
    return list;
  }

  List<GifItemData> get _filteredGifs {
    var list = kGifItems;
    if (_gifCategory != 'all') {
      list = list.where((g) => g.category == _gifCategory).toList();
    }
    if (_searchQuery.isNotEmpty) {
      list = list.where((g) => g.title.toLowerCase().contains(_searchQuery) || g.category.contains(_searchQuery)).toList();
    }
    return list;
  }

  List<StickerItemData> get _filteredStickers {
    var list = kStickerItems;
    if (_stickerCategory != 'all') {
      list = list.where((s) => s.pack == _stickerCategory).toList();
    }
    if (_searchQuery.isNotEmpty) {
      list = list.where((s) => s.name.toLowerCase().contains(_searchQuery) || s.pack.contains(_searchQuery)).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 480,
      decoration: const BoxDecoration(
        color: Color(0xFF2B2D31),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 8, bottom: 6),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header Tabs: Emojis, GIFs, Stickers
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: TabBar(
                    controller: _tabController,
                    indicatorColor: const Color(0xFF5865F2),
                    indicatorWeight: 3,
                    labelColor: Colors.white,
                    unselectedLabelColor: const Color(0xFF949BA4),
                    labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    tabs: const [
                      Tab(icon: Icon(Icons.sentiment_satisfied_alt, size: 20), text: 'Emojis'),
                      Tab(icon: Icon(Icons.gif_box_rounded, size: 22), text: 'GIFs'),
                      Tab(icon: Icon(Icons.sticky_note_2_rounded, size: 20), text: 'Stickers'),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: Color(0xFF949BA4)),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),

          // Search Field
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
            child: TextField(
              controller: _searchCtrl,
              style: const TextStyle(fontSize: 13, color: Colors.white),
              decoration: InputDecoration(
                hintText: _tabController.index == 0
                    ? 'Search emojis...'
                    : _tabController.index == 1
                        ? 'Search trending & gaming GIFs...'
                        : 'Search squad stickers & badges...',
                hintStyle: const TextStyle(fontSize: 12.5, color: Color(0xFF949BA4)),
                prefixIcon: const Icon(Icons.search, size: 18, color: Color(0xFF949BA4)),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 16, color: Color(0xFF949BA4)),
                        onPressed: () => _searchCtrl.clear(),
                      )
                    : null,
                filled: true,
                fillColor: const Color(0xFF1E1F22),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          // Tab views
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildEmojisTab(),
                _buildGifsTab(),
                _buildStickersTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmojisTab() {
    final emojis = _filteredEmojis;
    return Column(
      children: [
        // Category chips
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: [
              _catChip(
                label: 'All',
                isSelected: _emojiCategory == 'all',
                onTap: () => setState(() => _emojiCategory = 'all'),
              ),
              ...kEmojiCategories.map((c) {
                return _catChip(
                  label: '${c.icon} ${c.name.split(" ")[0]}',
                  isSelected: _emojiCategory == c.id,
                  onTap: () => setState(() => _emojiCategory = c.id),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 4),

        // Grid
        Expanded(
          child: emojis.isEmpty
              ? const Center(child: Text('No emojis found', style: TextStyle(color: Color(0xFF949BA4))))
              : GridView.builder(
                  padding: const EdgeInsets.all(10),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    crossAxisSpacing: 6,
                    mainAxisSpacing: 6,
                  ),
                  itemCount: emojis.length,
                  itemBuilder: (_, i) {
                    final em = emojis[i];
                    return InkWell(
                      onTap: () {
                        widget.onSelectEmoji(em);
                      },
                      borderRadius: BorderRadius.circular(6),
                      child: Center(
                        child: Text(em, style: const TextStyle(fontSize: 24)),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildGifsTab() {
    final gifs = _filteredGifs;
    const cats = ['all', 'hype', 'gaming', 'memes', 'reactions', 'anime'];
    return Column(
      children: [
        // Category chips
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: cats.map((cat) {
              return _catChip(
                label: cat.toUpperCase(),
                isSelected: _gifCategory == cat,
                onTap: () => setState(() => _gifCategory = cat),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 4),

        // Grid
        Expanded(
          child: gifs.isEmpty
              ? const Center(child: Text('No GIFs found', style: TextStyle(color: Color(0xFF949BA4))))
              : GridView.builder(
                  padding: const EdgeInsets.all(10),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 1.35,
                  ),
                  itemCount: gifs.length,
                  itemBuilder: (_, i) {
                    final g = gifs[i];
                    return InkWell(
                      onTap: () {
                        Navigator.pop(context);
                        widget.onSelectGif(g);
                      },
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E1F22),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white10),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              g.url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Center(
                                child: Icon(Icons.broken_image, color: Colors.white24),
                              ),
                            ),
                            Positioned(
                              bottom: 0,
                              left: 0,
                              right: 0,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                    colors: [Colors.black87, Colors.transparent],
                                  ),
                                ),
                                child: Text(
                                  g.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildStickersTab() {
    final stickers = _filteredStickers;
    const cats = [
      ('all', 'All Stickers'),
      ('badges', 'Gamer Badges'),
      ('squad', 'Squad & Mascot'),
    ];
    return Column(
      children: [
        // Category chips
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: cats.map((cat) {
              return _catChip(
                label: cat.$2,
                isSelected: _stickerCategory == cat.$1,
                onTap: () => setState(() => _stickerCategory = cat.$1),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 4),

        // Grid
        Expanded(
          child: stickers.isEmpty
              ? const Center(child: Text('No stickers found', style: TextStyle(color: Color(0xFF949BA4))))
              : GridView.builder(
                  padding: const EdgeInsets.all(10),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 0.95,
                  ),
                  itemCount: stickers.length,
                  itemBuilder: (_, i) {
                    final s = stickers[i];
                    return InkWell(
                      onTap: () {
                        Navigator.pop(context);
                        widget.onSelectSticker(s);
                      },
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E1F22),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Image.network(
                                s.url,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, color: Colors.white24),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              s.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 10, color: Color(0xFFDBDEE1)),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _catChip({required String label, required bool isSelected, required VoidCallback onTap}) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF5865F2) : const Color(0xFF1E1F22),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isSelected ? const Color(0xFF5865F2) : Colors.white12),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.white : const Color(0xFF949BA4),
            ),
          ),
        ),
      ),
    );
  }
}
