import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  Smile,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  EMOJI_CATEGORIES,
  GIF_ITEMS,
  STICKER_ITEMS,
  type GifItem,
  type StickerItem,
} from '../data/mediaLibrary';

interface MediaPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSelectGif: (gif: GifItem) => void;
  onSelectSticker: (sticker: StickerItem) => void;
}

type TabType = 'emoji' | 'gif' | 'sticker';

export const MediaPickerDrawer: React.FC<MediaPickerDrawerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSelectGif,
  onSelectSticker,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('emoji');
  const [search, setSearch] = useState('');
  const [emojiCat, setEmojiCat] = useState<string>('all');
  const [gifCat, setGifCat] = useState<string>('all');
  const [stickerCat, setStickerCat] = useState<string>('all');

  const filteredEmojis = useMemo(() => {
    let list: string[] = [];
    if (emojiCat === 'all') {
      list = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    } else {
      const found = EMOJI_CATEGORIES.find((c) => c.id === emojiCat);
      list = found ? found.emojis : [];
    }
    // Remove duplicates
    list = Array.from(new Set(list));
    if (!search.trim()) return list;
    // Simple filter: if search is an emoji or matches category name
    const q = search.toLowerCase().trim();
    return list.filter((em) => em.includes(q));
  }, [emojiCat, search]);

  const filteredGifs = useMemo(() => {
    let list = GIF_ITEMS;
    if (gifCat !== 'all') {
      list = list.filter((g) => g.category === gifCat);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((g) => g.title.toLowerCase().includes(q) || g.category.includes(q));
    }
    return list;
  }, [gifCat, search]);

  const filteredStickers = useMemo(() => {
    let list = STICKER_ITEMS;
    if (stickerCat !== 'all') {
      list = list.filter((s) => s.pack === stickerCat);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.pack.includes(q));
    }
    return list;
  }, [stickerCat, search]);

  if (!isOpen) return null;

  return (
    <div className="nc-media-picker-drawer">
      {/* Header Tabs */}
      <div className="nc-media-picker-header">
        <div className="nc-media-tabs">
          <button
            type="button"
            className={`nc-media-tab ${activeTab === 'emoji' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('emoji');
              setSearch('');
            }}
          >
            <Smile size={16} />
            <span>Emojis</span>
          </button>
          <button
            type="button"
            className={`nc-media-tab ${activeTab === 'gif' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('gif');
              setSearch('');
            }}
          >
            <Sparkles size={16} />
            <span>GIFs</span>
          </button>
          <button
            type="button"
            className={`nc-media-tab ${activeTab === 'sticker' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('sticker');
              setSearch('');
            }}
          >
            <Tag size={16} />
            <span>Stickers</span>
          </button>
        </div>

        <button
          type="button"
          className="nc-media-close-btn"
          onClick={onClose}
          title="Close Media Picker"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search Input */}
      <div className="nc-media-search-bar">
        <Search size={14} className="nc-search-ico" />
        <input
          type="text"
          placeholder={
            activeTab === 'emoji'
              ? 'Filter emojis...'
              : activeTab === 'gif'
              ? 'Search funny, gaming, hype GIFs...'
              : 'Search squad stickers & badges...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button type="button" className="nc-search-clear" onClick={() => setSearch('')}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Subcategory Pills */}
      <div className="nc-media-category-row">
        {activeTab === 'emoji' && (
          <>
            <button
              type="button"
              className={`nc-cat-pill ${emojiCat === 'all' ? 'active' : ''}`}
              onClick={() => setEmojiCat('all')}
            >
              All
            </button>
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`nc-cat-pill ${emojiCat === c.id ? 'active' : ''}`}
                onClick={() => setEmojiCat(c.id)}
              >
                <span>{c.icon}</span>
                <span>{c.name.split(' ')[0]}</span>
              </button>
            ))}
          </>
        )}

        {activeTab === 'gif' && (
          <>
            {['all', 'hype', 'gaming', 'memes', 'reactions', 'anime'].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`nc-cat-pill ${gifCat === cat ? 'active' : ''}`}
                onClick={() => setGifCat(cat)}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </>
        )}

        {activeTab === 'sticker' && (
          <>
            {[
              { id: 'all', label: 'All Stickers' },
              { id: 'badges', label: 'Gamer Badges' },
              { id: 'squad', label: 'Squad & Mascot' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`nc-cat-pill ${stickerCat === cat.id ? 'active' : ''}`}
                onClick={() => setStickerCat(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Content Body */}
      <div className="nc-media-body-scroll">
        {/* TAB 1: EMOJIS */}
        {activeTab === 'emoji' && (
          <div className="nc-emoji-grid">
            {filteredEmojis.map((em, idx) => (
              <button
                key={`${em}-${idx}`}
                type="button"
                className="nc-emoji-btn"
                onClick={() => onSelectEmoji(em)}
                title={`Insert ${em}`}
              >
                {em}
              </button>
            ))}
            {filteredEmojis.length === 0 && (
              <div className="nc-media-empty">No emojis found</div>
            )}
          </div>
        )}

        {/* TAB 2: GIFS */}
        {activeTab === 'gif' && (
          <div className="nc-gif-grid">
            {filteredGifs.map((g) => (
              <button
                key={g.id}
                type="button"
                className="nc-gif-item"
                onClick={() => onSelectGif(g)}
                title={g.title}
              >
                <img src={g.url} alt={g.title} loading="lazy" />
                <span className="nc-gif-title">{g.title}</span>
              </button>
            ))}
            {filteredGifs.length === 0 && (
              <div className="nc-media-empty">No GIFs match your search</div>
            )}
          </div>
        )}

        {/* TAB 3: STICKERS */}
        {activeTab === 'sticker' && (
          <div className="nc-sticker-grid">
            {filteredStickers.map((s) => (
              <button
                key={s.id}
                type="button"
                className="nc-sticker-item"
                onClick={() => onSelectSticker(s)}
                title={s.name}
              >
                <img src={s.url} alt={s.name} loading="lazy" />
                <span className="nc-sticker-title">{s.name}</span>
              </button>
            ))}
            {filteredStickers.length === 0 && (
              <div className="nc-media-empty">No stickers match your search</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
